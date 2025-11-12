import { NextRequest, NextResponse } from "next/server";

import { unzipSync } from "fflate";
import fs from "node:fs/promises";
import path from "node:path";

import { FAL_ENDPOINT, fal } from "../../../../lib/falClient";
import { deriveAssetKey } from "../../../../utils/asset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = {
  params: Promise<{
    requestId: string;
  }>;
};

type FalQueueStatus = Omit<
  Awaited<ReturnType<typeof fal.queue.status>>,
  "status"
> & {
  status: "IN_QUEUE" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | string;
  position?: number | null;
  logs?: unknown;
  error?: unknown;
};

const extractLogs = (logs: unknown): string[] => {
  if (!Array.isArray(logs)) {
    return [];
  }

  return logs
    .map((log) => {
      if (typeof log === "string") return log;
      if (log && typeof log === "object" && "message" in log) {
        return String((log as { message?: unknown }).message ?? "").trim();
      }
      return "";
    })
    .filter(Boolean);
};

const GENERATED_DIR = path.join(process.cwd(), "public", "generated");

const ensureLocalCopy = async (
  assetKey: string,
  remoteUrl: string | undefined
) => {
  if (!remoteUrl) {
    return null;
  }

  const targetDir = GENERATED_DIR;
  const zipFileName = `${assetKey}.zip`;
  const glbFileName = `${assetKey}.glb`;
  const zipDiskPath = path.join(targetDir, zipFileName);
  const glbDiskPath = path.join(targetDir, glbFileName);

  const ensureDir = async () => {
    await fs.mkdir(targetDir, { recursive: true });
  };

  const fileExists = async (filePath: string) => {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  };

  if (!(await fileExists(zipDiskPath))) {
    await ensureDir();
    const response = await fetch(remoteUrl);
    if (!response.ok) {
      throw new Error("模型 ZIP 下载失败");
    }
    const zipBuffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(zipDiskPath, zipBuffer);

    if (!(await fileExists(glbDiskPath))) {
      try {
        const archive = unzipSync(new Uint8Array(zipBuffer));
        const glbEntry = Object.keys(archive).find((name) =>
          name.toLowerCase().endsWith(".glb")
        );
        if (glbEntry) {
          await fs.writeFile(glbDiskPath, Buffer.from(archive[glbEntry]));
        }
      } catch (error) {
        console.error("解压 GLB 失败，将只保留 ZIP：", error);
      }
    }
  } else if (!(await fileExists(glbDiskPath))) {
    try {
      const response = await fetch(remoteUrl);
      if (response.ok) {
        const zipBuffer = Buffer.from(await response.arrayBuffer());
        const archive = unzipSync(new Uint8Array(zipBuffer));
        const glbEntry = Object.keys(archive).find((name) =>
          name.toLowerCase().endsWith(".glb")
        );
        if (glbEntry) {
          await fs.writeFile(glbDiskPath, Buffer.from(archive[glbEntry]));
        }
      }
    } catch (error) {
      console.error("补充 GLB 失败：", error);
    }
  }

  const toRelative = (absolutePath: string) =>
    path.relative(process.cwd(), absolutePath);
  const toPublicUrl = (fileName: string) =>
    `/${path.posix.join("generated", fileName)}`;

  return {
    zipPath: toRelative(zipDiskPath),
    glbPath: (await fileExists(glbDiskPath))
      ? toRelative(glbDiskPath)
      : null,
    zipUrl: toPublicUrl(zipFileName),
    glbUrl: (await fileExists(glbDiskPath))
      ? toPublicUrl(glbFileName)
      : null,
  };
};

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!process.env.FAL_KEY) {
    return NextResponse.json(
      { error: "FAL_KEY is not configured." },
      { status: 500 }
    );
  }

  const { requestId } = await params;
  const searchParams = request.nextUrl.searchParams;
  const assetParam = searchParams.get("asset");

  if (!assetParam) {
    return NextResponse.json(
      { error: "asset 参数缺失。" },
      { status: 400 }
    );
  }

  const assetKey = deriveAssetKey(assetParam);

  if (!requestId) {
    return NextResponse.json(
      { error: "requestId 参数缺失。" },
      { status: 400 }
    );
  }

  try {
    const statusResponse = (await fal.queue.status(FAL_ENDPOINT, {
      requestId,
      logs: true,
    })) as FalQueueStatus;

    const basePayload = {
      status: statusResponse.status,
      position: statusResponse.position ?? null,
      logs: extractLogs(statusResponse.logs),
    };

    if (statusResponse.status === "FAILED") {
      return NextResponse.json(
        {
          ...basePayload,
          error: statusResponse.error ?? "Seed3D 任务失败。",
        },
        { status: 200 }
      );
    }

    if (statusResponse.status === "COMPLETED") {
      const resultResponse = await fal.queue.result(FAL_ENDPOINT, {
        requestId,
      });
      let localFiles = null;
      try {
        localFiles = await ensureLocalCopy(
          assetKey,
          resultResponse.data?.model?.url
        );
      } catch (error) {
        console.error("保存本地副本失败：", error);
      }

      return NextResponse.json({
        ...basePayload,
        result: {
          modelUrl: resultResponse.data?.model?.url ?? null,
          usageTokens: resultResponse.data?.usage_tokens ?? null,
          localZipPath: localFiles?.zipPath ?? null,
          localGlbPath: localFiles?.glbPath ?? null,
          localZipUrl: localFiles?.zipUrl ?? null,
          localGlbUrl: localFiles?.glbUrl ?? null,
        },
      });
    }

    return NextResponse.json(basePayload, { status: 200 });
  } catch (error) {
    console.error("Failed to fetch Seed3D job status:", error);
    return NextResponse.json(
      { error: "无法获取任务状态，请稍后重试。" },
      { status: 500 }
    );
  }
}
