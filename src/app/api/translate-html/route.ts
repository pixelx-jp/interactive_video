import { NextRequest, NextResponse } from "next/server";
import { LingoDotDevEngine } from "lingo.dev/sdk";

// Allowed locales for safety to avoid unexpected translations
const ALLOWED_LOCALES = new Set([
  "en",
  "vi",
  "id",
  "fil",
  "my",
  "zh-CN",
  "th",
  "pt-BR",
  "hi",
]);

// Initialize the Lingo.dev engine with server-side API key.
// Note: This runs on the server only. The API key is read from process.env.
const lingoDotDev = new LingoDotDevEngine({
  apiKey: process.env.LINGODOTDEV_API_KEY,
});

/**
 * Handle HTML localization requests.
 * Accepts JSON { html, sourceLocale, targetLocale } and returns translated HTML.
 */
export async function POST(req: NextRequest) {
  try {
    // Parse incoming JSON payload safely
    const body = await req.json();
    const { html, sourceLocale, targetLocale } = body ?? {};

    // Validate 'html' input
    // If the HTML payload is missing or not a string, we reject the request
    if (!html || typeof html !== "string") {
      // Branch: invalid HTML payload provided by client
      return NextResponse.json({ error: "Invalid 'html' payload" }, { status: 400 });
    } else {
      // Branch: html is present and a string, proceed
    }

    // Validate locales
    // If either locale is missing, we reject; if target is unsupported, we reject
    if (!sourceLocale || !targetLocale) {
      // Branch: one or both locales missing
      return NextResponse.json(
        { error: "Both sourceLocale and targetLocale are required" },
        { status: 400 }
      );
    } else {
      // Branch: locales present, continue to further validation
    }

    if (!ALLOWED_LOCALES.has(sourceLocale)) {
      // Branch: source locale is not in allowed set
      return NextResponse.json({ error: "Unsupported sourceLocale" }, { status: 400 });
    } else {
      // Branch: source locale allowed
    }

    if (!ALLOWED_LOCALES.has(targetLocale)) {
      // Branch: target locale is not in allowed set
      return NextResponse.json({ error: "Unsupported targetLocale" }, { status: 400 });
    } else {
      // Branch: target locale allowed
    }

    // Before calling external API: Translate the HTML via Lingo.dev
    // This sends the HTML to Lingo.dev and returns a localized version.
    const translated = await lingoDotDev.localizeHtml(html, {
      sourceLocale,
      targetLocale,
    });

    // Success: return translated HTML string
    return NextResponse.json({ translated });
  } catch (err: unknown) {
    // Unexpected error: return 500 with a helpful message
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}