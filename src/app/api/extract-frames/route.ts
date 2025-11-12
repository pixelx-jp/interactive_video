import { NextRequest, NextResponse } from "next/server";
import ffmpeg from "fluent-ffmpeg";
import { promises as fs } from "fs";
import path from "path";
import { deriveAssetKey } from "../../../utils/asset";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FrameInfo {
  timestamp: number;
  filename: string;
  path: string;
  url: string;
}

export async function POST(request: NextRequest) {
  let tempVideoPath: string | null = null;

  try {
    const formData = await request.formData();
    const videoFile = formData.get("video");

    if (!(videoFile instanceof File)) {
      return NextResponse.json(
        { error: "Please upload a video file (field: video)" },
        { status: 400 }
      );
    }

    if (!videoFile.size) {
      return NextResponse.json(
        { error: "Uploaded video is empty, please select again" },
        { status: 400 }
      );
    }

    // 保存视频到临时目录
    const buffer = Buffer.from(await videoFile.arrayBuffer());
    const tempDir = path.join(process.cwd(), "public", "temp");
    await fs.mkdir(tempDir, { recursive: true });

    // 使用时间戳避免文件名冲突
    const timestamp = Date.now();
    const safeFileName = videoFile.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    tempVideoPath = path.join(tempDir, `${timestamp}_${safeFileName}`);
    await fs.writeFile(tempVideoPath, buffer);

    // 获取视频时长
    const duration = await getVideoDuration(tempVideoPath);

    if (duration <= 0) {
      throw new Error("Unable to get video duration, please ensure you upload a valid video file");
    }

    // 提取视频名称（不含扩展名）
    const videoNameWithExt = videoFile.name;
    const videoName = videoNameWithExt.replace(/\.[^/.]+$/, "");

    // 计算需要提取的帧数（每2秒一帧）
    const frames: FrameInfo[] = [];
    const framesDir = path.join(process.cwd(), "public", "frames");
    await fs.mkdir(framesDir, { recursive: true });

    // 提取帧 - 确保至少提取第一帧
    for (let ts = 0; ts < duration; ts += 2) {
      const filename = `${videoName}_${ts}.jpg`;
      const framePath = path.join(framesDir, filename);

      await extractFrame(tempVideoPath, framePath, ts);

      frames.push({
        timestamp: ts,
        filename,
        path: `public/frames/${filename}`,
        url: `/frames/${filename}`,
      });
    }

    if (frames.length === 0) {
      throw new Error("Failed to extract any video frames");
    }

    // 删除临时视频文件
    await fs.unlink(tempVideoPath);
    tempVideoPath = null;

    return NextResponse.json({
      success: true,
      videoName,
      duration,
      frames,
    });
  } catch (error) {
    console.error("Video frame extraction failed:", error);

    // 确保清理临时文件
    if (tempVideoPath) {
      try {
        await fs.unlink(tempVideoPath);
      } catch (cleanupError) {
        console.error("Failed to clean up temp file:", cleanupError);
      }
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Video frame extraction failed, please try again later",
      },
      { status: 500 }
    );
  }
}

function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(videoPath, (err, metadata) => {
      if (err) {
        reject(err);
      } else {
        resolve(metadata.format.duration || 0);
      }
    });
  });
}

function extractFrame(
  videoPath: string,
  outputPath: string,
  timestamp: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(videoPath)
      .seekInput(timestamp)
      .frames(1)
      .output(outputPath)
      .on("end", () => resolve())
      .on("error", (err) => reject(err))
      .run();
  });
}
