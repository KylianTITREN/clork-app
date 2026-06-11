// Supabase Edge Function: POST a planning photo (base64) and get back the
// structured extraction. The Anthropic API key lives ONLY in function secrets
// (`supabase secrets set ANTHROPIC_API_KEY=...`), never in the app.

import {
  extractPlanning,
  SUPPORTED_MEDIA_TYPES,
  type SupportedMediaType,
} from "./extraction.ts";

// ~8 MB of base64 ≈ 6 MB image, well above what the app sends after compression.
const MAX_BASE64_LENGTH = 8_000_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  image_base64?: unknown;
  media_type?: unknown;
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

function errorResponse(status: number, message: string): Response {
  return jsonResponse(status, { success: false, data: null, error: message });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const { image_base64: imageBase64, media_type: mediaType } = body;

  if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
    return errorResponse(400, "image_base64 is required (base64 string)");
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return errorResponse(413, "Image too large — compress it before upload");
  }
  if (
    typeof mediaType !== "string" ||
    !SUPPORTED_MEDIA_TYPES.includes(mediaType as SupportedMediaType)
  ) {
    return errorResponse(
      400,
      `media_type must be one of: ${SUPPORTED_MEDIA_TYPES.join(", ")}`,
    );
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY secret is not configured");
    return errorResponse(500, "Extraction service is not configured");
  }

  try {
    const result = await extractPlanning({
      imageBase64,
      mediaType: mediaType as SupportedMediaType,
      apiKey,
    });
    return jsonResponse(200, {
      success: true,
      data: result.data,
      error: null,
      meta: { model: result.model, usage: result.usage },
    });
  } catch (error) {
    console.error("extract-planning failed:", error);
    return errorResponse(502, "Extraction failed — try a sharper photo");
  }
});
