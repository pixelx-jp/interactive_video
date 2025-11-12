import { NextResponse } from "next/server";
import { LingoDotDevEngine } from "lingo.dev/sdk";

/**
 * POST /api/translate
 * Translates a JSON object from a source locale to a target locale using lingo.dev.
 * Expects body: { content: Record<string,string>, sourceLocale: string, targetLocale: string }
 * Returns: { translated: Record<string,string> }
 */
export async function POST(request: Request) {
  try {
    /**
     * Parse request payload containing the object to translate and locales.
     */
    const payload = await request.json();

    /**
     * Validate payload properties exist before proceeding.
     */
    if (!payload || typeof payload !== "object") {
      // If payload is missing or not an object, return 400.
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const { content, sourceLocale, targetLocale } = payload as {
      content: Record<string, string>;
      sourceLocale: string;
      targetLocale: string;
    };

    /**
     * Ensure required fields are present and types are correct.
     */
    if (!content || typeof content !== "object") {
      // If content is missing or not an object, return 400.
      return NextResponse.json({ error: "content must be an object" }, { status: 400 });
    }
    if (!sourceLocale || typeof sourceLocale !== "string") {
      // If sourceLocale is missing or invalid, return 400.
      return NextResponse.json({ error: "sourceLocale must be a string" }, { status: 400 });
    }
    if (!targetLocale || typeof targetLocale !== "string") {
      // If targetLocale is missing or invalid, return 400.
      return NextResponse.json({ error: "targetLocale must be a string" }, { status: 400 });
    }

    /**
     * Read API key from environment. Do not proceed without a valid key.
     */
    const apiKey = process.env.LINGODOTDEV_API_KEY;
    if (!apiKey) {
      // If API key is not configured, return 500.
      return NextResponse.json({ error: "LINGODOTDEV_API_KEY is not configured" }, { status: 500 });
    }

    /**
     * Initialize lingo.dev engine with the server-side API key.
     */
    const lingoDotDev = new LingoDotDevEngine({ apiKey });

    /**
     * Call external lingo.dev API to translate the object.
     * This operation sends the content to lingo.dev and requests a localized result.
     */
    const translated = await lingoDotDev.localizeObject(content, {
      sourceLocale,
      targetLocale,
    });

    /**
     * Return successful translation.
     */
    return NextResponse.json({ translated });
  } catch (error) {
    /**
     * Handle unexpected errors gracefully and return message.
     */
    const message = error instanceof Error ? error.message : "Translation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}