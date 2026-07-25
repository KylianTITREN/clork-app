// Edge Function : détecte l'orientation d'une photo de planning et renvoie
// l'angle horaire (0 / 90 / 180 / 270) pour la redresser. SYNCHRONE et légère
// (modèle Haiku sur une vignette basse résolution). La rotation elle-même est
// faite CÔTÉ APP (expo-image-manipulator) : les libs de rotation Deno testées
// corrompent les JPEG, donc on ne manipule jamais les pixels ici.
// Auth : JWT utilisateur obligatoire. La clé Anthropic ne vit que dans les secrets.

import { createClient } from "npm:@supabase/supabase-js@2";

const ORIENTATION_MODEL = "claude-haiku-4-5";
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

const SUPPORTED_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
// La vignette est petite (voir app), largement sous cette borne.
const MAX_BASE64_LENGTH = 2_000_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROMPT =
  "Cette image est la photo d'un planning hebdomadaire de magasin : un tableau " +
  "avec les employés en lignes et les jours de la semaine en colonnes (en-têtes " +
  "de jours en haut, noms des employés à gauche).\n" +
  "De combien de degrés, dans le SENS HORAIRE, faut-il faire pivoter cette image " +
  "pour que le texte soit droit et lu normalement (en-têtes de jours en haut, " +
  "noms à gauche) ?\n" +
  "Réponds UNIQUEMENT par un seul de ces nombres, sans aucun autre mot : 0, 90, 180, 270.";

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

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
  if (userError || !userData.user) {
    return errorResponse(401, "Authentication required");
  }

  let body: { image_base64?: unknown; media_type?: unknown };
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
    return errorResponse(413, "Thumbnail too large");
  }
  if (typeof mediaType !== "string" || !SUPPORTED_MEDIA_TYPES.includes(mediaType)) {
    return errorResponse(400, `media_type must be one of: ${SUPPORTED_MEDIA_TYPES.join(", ")}`);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY secret is not configured");
    return errorResponse(500, "Service is not configured");
  }

  // Best-effort : toute défaillance renvoie angle 0 (on n'empêche jamais un
  // scan de continuer parce que la détection d'orientation a échoué).
  let angle = 0;
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ORIENTATION_MODEL,
        max_tokens: 8,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mediaType, data: imageBase64 },
              },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });
    if (response.ok) {
      const payload = await response.json();
      const text: string = payload?.content?.[0]?.text ?? "";
      const match = text.match(/\b(90|180|270|0)\b/);
      if (match) angle = Number(match[1]);
    } else {
      console.error("orientation model error:", response.status, await response.text());
    }
  } catch (error) {
    console.error("orientation detection failed:", error);
  }

  return jsonResponse(200, { success: true, data: { angle }, error: null });
});
