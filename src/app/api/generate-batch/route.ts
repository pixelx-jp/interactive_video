import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { FAL_ENDPOINT, fal } from "../../../lib/falClient";
import { deriveAssetKey } from "../../../utils/asset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FrameInput {
  filename: string;
  url: string;
}

interface FrameResult {
  filename: string;
  assetKey: string;
  cached: boolean;
  glbUrl?: string;
  requestId?: string;
  error?: string;
}

export async function POST(request: NextRequest) {
  if (!process.env.FAL_KEY) {
    return NextResponse.json(
      { error: "FAL_KEY is missing on the server." },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const frames: FrameInput[] = body.frames;

    if (!Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json(
        { error: "Please provide a valid frame list (frames)" },
        { status: 400 }
      );
    }

    // 并行处理所有帧，确保每个帧都有结果
    const results: FrameResult[] = await Promise.all(
      frames.map(async (frame): Promise<FrameResult> => {
        try {
          const assetKey = deriveAssetKey(frame.filename);
          const glbPath = path.join(
            process.cwd(),
            "public",
            "generated",
            `${assetKey}.glb`
          );

          // 检查GLB文件是否已存在
          let cached = false;
          try {
            await fs.access(glbPath);
            cached = true;
          } catch {
            // 文件不存在，需要生成
          }

          if (cached) {
            // 使用缓存的GLB
            return {
              filename: frame.filename,
              assetKey,
              cached: true,
              glbUrl: `/generated/${assetKey}.glb`,
            };
          } else {
            // 需要生成，读取帧图片并提交任务
            const framePath = path.join(
              process.cwd(),
              "public",
              "frames",
              frame.filename
            );

            // 检查帧文件是否存在
            try {
              await fs.access(framePath);
            } catch {
              throw new Error(`Frame file does not exist: ${frame.filename}`);
            }

            const imageBuffer = await fs.readFile(framePath);
            const mimeType = frame.filename.toLowerCase().endsWith(".png")
              ? "image/png"
              : "image/jpeg";
            const dataUri = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;

            const { request_id } = await fal.queue.submit(FAL_ENDPOINT, {
              input: {
                image_url: dataUri,
              },
            });

            return {
              filename: frame.filename,
              assetKey,
              cached: false,
              requestId: request_id,
            };
          }
        } catch (error) {
          console.error(`Failed to process frame ${frame.filename}:`, error);
          // 返回错误结果，而不是丢弃
          return {
            filename: frame.filename,
            assetKey: deriveAssetKey(frame.filename),
            cached: false,
            error:
              error instanceof Error
                ? error.message
                : "Processing failed",
          };
        }
      })
    );

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Batch generation failed:", error);
    return NextResponse.json(
      { error: "Batch generation failed, please try again later" },
      { status: 500 }
    );
  }
}
