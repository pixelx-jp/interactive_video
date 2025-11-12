import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

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
    const { message, frameImage, modelImage, uploadedImages } = body;

    if (!message) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // 初始化OpenAI客户端
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // 构建消息内容
    const content: any[] = [
      {
        type: "text",
        text: message,
      },
    ];

    // 添加视频帧图片
    if (frameImage) {
      content.push({
        type: "image_url",
        image_url: {
          url: frameImage,
        },
      });
    }

    // 添加3D模型截图
    if (modelImage) {
      content.push({
        type: "image_url",
        image_url: {
          url: modelImage,
        },
      });
    }

    // 添加用户上传的图片
    if (uploadedImages && Array.isArray(uploadedImages)) {
      uploadedImages.forEach((img: string) => {
        content.push({
          type: "image_url",
          image_url: {
            url: img,
          },
        });
      });
    }

    // 调用OpenAI API
    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "user",
          content: content,
        },
      ],
    });

    const reply = response.choices?.[0]?.message?.content || "No response";

    return NextResponse.json({
      success: true,
      reply,
    });
  } catch (error: any) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      {
        error: error?.message || "Chat failed",
        details: error?.response?.data || null
      },
      { status: 500 }
    );
  }
}
