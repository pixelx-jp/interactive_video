import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Proxy Text-to-Speech requests to Shisa TTS service.
 * Accepts JSON { text, voice_settings?, audio_settings?, backend?, stream? }
 * Streams back the audio/wav response to the client.
 */
export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.SHISA_API_KEY;

    // If API key is missing, we cannot call the external TTS API
    if (!apiKey) {
      // Branch: missing server API key; return an explicit error
      return NextResponse.json({ error: "SHISA_API_KEY is missing" }, { status: 500 });
    } else {
      // Branch: API key present; continue
    }

    // Safely parse incoming JSON body
    const body = await req.json();
    const {
      text,
      voice_settings,
      audio_settings,
      backend,
      stream,
    } = body ?? {};

    // Validate required 'text' input for TTS
    if (!text || typeof text !== "string") {
      // Branch: invalid or missing text
      return NextResponse.json({ error: "'text' is required" }, { status: 400 });
    } else {
      // Branch: valid text provided; continue
    }

    // Before calling external API: proxy request to Shisa TTS service
    // Note: Some services expect 'Authorization' to be the raw key or 'Bearer <key>'.
    // We send the raw key, matching the provided client snippet.
    const response = await fetch("https://tts.router.shisa-ai.com/api/v1/tts/speak", {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        // Default to non-streaming to avoid backend limitation errors
        stream: stream ?? false,
        voice_settings: voice_settings ?? { id: (voice_settings?.id ?? "2") },
        audio_settings: audio_settings ?? { format: "wav" },
        backend: backend ?? { service: "shs" },
      }),
    });

    // If upstream responded with non-OK, bubble the error
    if (!response.ok) {
      // Branch: upstream error; return the text for debugging
      const errText = await response.text();
      return NextResponse.json(
        { error: "TTS request failed", details: errText },
        { status: response.status }
      );
    } else {
      // Branch: upstream OK; stream audio back to client
    }

    // Default to audio/wav when content-type is missing
    const contentType = response.headers.get("content-type") || "audio/wav";

    // Stream the response body directly to the client
    return new Response(response.body, {
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (err: unknown) {
    // Unexpected error: provide a helpful message
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}