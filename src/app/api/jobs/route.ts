import { NextRequest, NextResponse } from "next/server";

import { FAL_ENDPOINT, fal } from "../../../lib/falClient";
import { deriveAssetKey } from "../../../utils/asset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!process.env.FAL_KEY) {
    return NextResponse.json(
      { error: "FAL_KEY is missing on the server." },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const file = formData.get("image");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "请上传一张图片 (field: image)." },
      { status: 400 }
    );
  }

  if (!file.size) {
    return NextResponse.json(
      { error: "上传的图片为空，请重新选择。" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType =
    file.type ||
    (file.name.toLowerCase().endsWith(".png")
      ? "image/png"
      : "image/jpeg");
  const dataUri = `data:${mimeType};base64,${buffer.toString("base64")}`;
  const assetKey = deriveAssetKey(
    typeof formData.get("assetKey") === "string"
      ? (formData.get("assetKey") as string)
      : file.name
  );

  try {
    const { request_id } = await fal.queue.submit(FAL_ENDPOINT, {
      input: {
        image_url: dataUri,
      },
    });

    return NextResponse.json({ requestId: request_id, assetKey });
  } catch (error) {
    console.error("Failed to submit Seed3D job:", error);
    return NextResponse.json(
      { error: "创建 Seed3D 任务失败，请稍后再试。" },
      { status: 500 }
    );
  }
}
