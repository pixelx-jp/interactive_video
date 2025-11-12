import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { frameImage, modelImage, uploadedImages, timestamp } = body;

    // 创建debug目录
    const debugDir = path.join(process.cwd(), "public", "debug");
    await fs.mkdir(debugDir, { recursive: true });

    const savedFiles: string[] = [];

    // 保存视频帧图片
    if (frameImage) {
      const frameBase64 = frameImage.replace(/^data:image\/\w+;base64,/, "");
      const frameBuffer = Buffer.from(frameBase64, "base64");
      const framePath = path.join(debugDir, `frame_${timestamp}.jpg`);
      await fs.writeFile(framePath, frameBuffer);
      savedFiles.push(`/debug/frame_${timestamp}.jpg`);
    }

    // 保存3D模型图片
    if (modelImage) {
      const modelBase64 = modelImage.replace(/^data:image\/\w+;base64,/, "");
      const modelBuffer = Buffer.from(modelBase64, "base64");
      const modelPath = path.join(debugDir, `model_${timestamp}.jpg`);
      await fs.writeFile(modelPath, modelBuffer);
      savedFiles.push(`/debug/model_${timestamp}.jpg`);
    }

    // 保存用户上传的图片
    if (uploadedImages && Array.isArray(uploadedImages)) {
      for (let i = 0; i < uploadedImages.length; i++) {
        const uploadBase64 = uploadedImages[i].replace(/^data:image\/\w+;base64,/, "");
        const uploadBuffer = Buffer.from(uploadBase64, "base64");
        const uploadPath = path.join(debugDir, `uploaded_${timestamp}_${i}.jpg`);
        await fs.writeFile(uploadPath, uploadBuffer);
        savedFiles.push(`/debug/uploaded_${timestamp}_${i}.jpg`);
      }
    }

    return NextResponse.json({
      success: true,
      files: savedFiles,
    });
  } catch (error) {
    console.error("Failed to save debug images:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save images" },
      { status: 500 }
    );
  }
}
