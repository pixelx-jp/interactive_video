import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { promises as fs } from "fs";
import path from "path";
import { tmpdir } from "os";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is missing" },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { image, prompt } = body;

    if (!image || !prompt) {
      return NextResponse.json(
        { error: "Image and prompt are required" },
        { status: 400 }
      );
    }

    // Convert base64 image to file
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Save to temporary file
    const tempDir = tmpdir();
    const tempFilePath = path.join(tempDir, `input_${Date.now()}.png`);
    await fs.writeFile(tempFilePath, imageBuffer);

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Create File object from buffer
    const file = new File([imageBuffer], "input.png", { type: "image/png" });

    // Call OpenAI image generation API (matching Python test_image_transform.py method 1)
    console.log("Calling OpenAI images.edit with model: gpt-image-1");
    const response = await openai.images.edit({
      model: "gpt-image-1",
      image: file,
      prompt: prompt,
      n: 1,
      // Don't specify response_format - let OpenAI return default format
    });

    console.log("OpenAI response received");

    // Clean up temp file
    await fs.unlink(tempFilePath).catch(() => {});

    if (!response.data || response.data.length === 0) {
      console.error("No data in response");
      throw new Error("No image data in response");
    }

    const imageData = response.data[0];

    // Check for base64 data first (Python code: getattr(image_data, "b64_json", None))
    if (imageData.b64_json) {
      const base64Image = `data:image/png;base64,${imageData.b64_json}`;
      console.log("Returning base64 image");
      return NextResponse.json({
        success: true,
        imageUrl: base64Image,
      });
    }

    // Fallback to URL if available (Python code: getattr(image_data, "url", None))
    if (imageData.url) {
      console.log("Returning image URL:", imageData.url);
      return NextResponse.json({
        success: true,
        imageUrl: imageData.url,
      });
    }

    console.error("No b64_json or URL in response");
    throw new Error("No image payload in OpenAI response");
  } catch (error: any) {
    console.error("Image generation error details:", {
      message: error?.message,
      status: error?.status,
      code: error?.code,
      type: error?.type,
      response: error?.response?.data,
    });
    return NextResponse.json(
      {
        error: error?.message || "Image generation failed",
        details: error?.response?.data || error?.code || null,
      },
      { status: 500 }
    );
  }
}
