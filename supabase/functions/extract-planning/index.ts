// Supabase Edge Function : lance l'extraction d'un planning en ASYNCHRONE.
// L'app crée d'abord la ligne `scans` + upload la photo, puis appelle cette
// fonction qui répond 202 immédiatement et continue en tâche de fond
// (EdgeRuntime.waitUntil) : résultat écrit dans scans/scan_rows, que l'app
// observe par polling. L'utilisateur peut quitter l'app pendant la lecture.
// Auth : JWT utilisateur OBLIGATOIRE + le scan doit lui appartenir.
// La clé Anthropic ne vit QUE dans les secrets de la fonction.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

import {
  extractPlanning,
  SUPPORTED_MEDIA_TYPES,
  type CustomShiftType,
  type PlanningExtraction,
  type SupportedMediaType,
} from "./extraction.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

// ~8 MB of base64 ≈ 6 MB image, well above what the app sends after compression.
const MAX_BASE64_LENGTH = 8_000_000;

// Statuts qui consomment le quota : un scan raté ne doit JAMAIS en manger un
// (sinon « reprends la photo » devient impossible pendant 30 jours).
const QUOTA_STATUSES = ["extracted", "validated"];

// Messages affichés tels quels dans l'app (waitForExtraction relaie
// `error_message`) : ils doivent inviter à reprendre une photo, pas exposer la
// cause technique — celle-ci part dans les logs.
const UNUSABLE_MESSAGE =
  "La photo n'est pas assez nette pour une lecture fiable. Rapproche-toi, évite les reflets et cadre tout le tableau, puis reprends la photo.";
const FAILURE_MESSAGE =
  "La lecture du planning a échoué. Reprends une photo bien cadrée et réessaie — ce scan ne t'a pas été décompté.";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type RequestBody = {
  scan_id?: unknown;
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

// Notifie l'utilisateur via Expo Push quand l'extraction se termine
// (silencieux si pas de token : simulateur, permissions refusées…).
async function sendPushNotification(
  service: SupabaseClient,
  userId: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    const { data: profile } = await service
      .from("profiles")
      .select("expo_push_token")
      .eq("id", userId)
      .single();
    const token = profile?.expo_push_token;
    if (!token) return;
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to: token, title, body, sound: "default" }),
    });
  } catch (error) {
    console.error("push notification failed:", error);
  }
}

// Types de créneau personnalisés déclarés par l'uploader (table
// custom_shift_types) — best-effort : l'extraction fonctionne sans eux,
// toute erreur retombe sur un tableau vide.
async function loadCustomShiftTypes(
  service: SupabaseClient,
  userId: string,
): Promise<CustomShiftType[]> {
  try {
    const { data, error } = await service
      .from("custom_shift_types")
      .select("name, is_paid")
      .eq("user_id", userId);
    if (error) {
      console.error(`custom_shift_types load failed for user ${userId}:`, error.message);
      return [];
    }
    return (data ?? [])
      .filter((row) => typeof row.name === "string" && row.name.trim().length > 0)
      .map((row) => ({ name: row.name.trim(), isPaid: Boolean(row.is_paid) }));
  } catch (error) {
    console.error(`custom_shift_types load failed for user ${userId}:`, error);
    return [];
  }
}

async function processInBackground(
  service: SupabaseClient,
  scanId: string,
  uploaderId: string,
  imageBase64: string,
  mediaType: SupportedMediaType,
  apiKey: string,
): Promise<void> {
  try {
    const customTypes = await loadCustomShiftTypes(service, uploaderId);
    const result = await extractPlanning({ imageBase64, mediaType, apiKey, customTypes });
    const extraction: PlanningExtraction = result.data;
    // Photo illisible = échec, pas un scan abouti : le statut `failed` le sort
    // du décompte de quota et de la reprise de validation (findPendingValidation).
    const isUnusable = extraction.photo_quality === "unusable";

    const { error: updateError } = await service
      .from("scans")
      .update({
        status: isUnusable ? "failed" : "extracted",
        photo_quality: extraction.photo_quality,
        store_label: extraction.store_label,
        week_start: extraction.week_start,
        week_end: extraction.week_end,
        raw_extraction: extraction,
        error_message: isUnusable ? UNUSABLE_MESSAGE : null,
      })
      .eq("id", scanId);
    if (updateError) throw new Error("scan update failed: " + updateError.message);

    // Aucune ligne à écrire pour une photo illisible : l'extraction ne sera
    // jamais validée, les lignes seraient du bruit.
    const rows = isUnusable
      ? []
      : extraction.employees.map((employee) => ({
          scan_id: scanId,
          employee_label: employee.name,
          row_index: employee.row_index,
          raw: employee,
        }));
    if (rows.length > 0) {
      const { error: rowsError } = await service.from("scan_rows").insert(rows);
      if (rowsError) throw new Error("scan_rows insert failed: " + rowsError.message);
    }
    console.log(
      `scan ${scanId}: ${isUnusable ? "unusable photo" : `extracted ${rows.length} rows`} (${result.usage.output_tokens} tokens out)`,
    );
    await sendPushNotification(
      service,
      uploaderId,
      isUnusable ? "Photo illisible 📷" : "Planning prêt ✅",
      isUnusable
        ? "La photo n'était pas assez nette — reprends-la dans Clork, ce scan ne t'a pas été décompté."
        : "Tes horaires sont extraits, ouvre Clork pour les valider.",
    );
  } catch (error) {
    // Le détail technique reste dans les logs ; l'app affiche un message qui
    // dit quoi faire (reprendre la photo).
    console.error(`scan ${scanId} failed:`, error);
    await service
      .from("scans")
      .update({ status: "failed", error_message: FAILURE_MESSAGE })
      .eq("id", scanId);
    await sendPushNotification(
      service,
      uploaderId,
      "Scan échoué",
      "La lecture du planning a échoué — reprends une photo dans Clork.",
    );
  } finally {
    // RGPD : la photo contient des données de tiers (noms + horaires des
    // collègues) et n'a plus aucune utilité une fois les horaires extraits
    // (on conserve le résultat structuré, pas l'image). Suppression immédiate.
    // L'app n'uploade plus l'image (elle arrive en base64 dans la requête) :
    // ce nettoyage ne sert plus qu'aux versions antérieures encore installées.
    try {
      await service.storage.from("scans").remove([`${uploaderId}/${scanId}.jpg`]);
    } catch (cleanupError) {
      console.error(`photo cleanup failed for scan ${scanId}:`, cleanupError);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return errorResponse(405, "Method not allowed");
  }

  // Authentification : exige un JWT utilisateur valide.
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(token);
  if (userError || !userData.user) {
    return errorResponse(401, "Authentication required");
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "Invalid JSON body");
  }

  const { scan_id: scanId, image_base64: imageBase64, media_type: mediaType } = body;

  if (typeof scanId !== "string" || scanId.length === 0) {
    return errorResponse(400, "scan_id is required");
  }
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

  // Le scan doit appartenir à l'utilisateur authentifié.
  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: scan } = await service
    .from("scans")
    .select("id, uploader_id, status")
    .eq("id", scanId)
    .single();
  if (!scan || scan.uploader_id !== userData.user.id) {
    return errorResponse(404, "Scan not found");
  }
  if (scan.status !== "pending" && scan.status !== "failed") {
    return errorResponse(409, "Scan already processed");
  }

  // Quotas par plan — garde-fou serveur du coût IA (modèle économique V1) :
  // invité 1/semaine, gratuit 1/mois, premium & fondatrices illimités.
  const { data: planRow } = await service
    .from("profiles")
    .select("plan")
    .eq("id", userData.user.id)
    .single();
  const plan = userData.user.is_anonymous ? "guest" : (planRow?.plan ?? "free");
  const QUOTAS: Record<string, { max: number; windowDays: number; message: string } | null> = {
    guest: {
      max: 1,
      windowDays: 7,
      message:
        "Limite du mode invité atteinte (1 scan/semaine). Crée un compte gratuit dans Profil pour continuer.",
    },
    free: {
      max: 1,
      windowDays: 30,
      message:
        "Limite du plan gratuit atteinte (1 scan/mois). Récupère les plannings via le code d'un·e collègue — ou saisis un code d'accès dans Profil → Compte.",
    },
    premium: null,
    founder: null,
  };
  // `null` est intentionnel (premium/founder = aucun quota) : on NE doit PAS
  // le remplacer par le quota gratuit. Seul un plan inconnu retombe sur `free`.
  const quota = plan in QUOTAS ? QUOTAS[plan] : QUOTAS.free;
  if (quota) {
    const windowStart = new Date(
      Date.now() - quota.windowDays * 24 * 3600 * 1000,
    ).toISOString();
    // Seuls les scans ABOUTIS comptent : une photo illisible ou une extraction
    // en erreur laisse un scan `failed`, qui ne doit pas bloquer la reprise.
    const { count } = await service
      .from("scans")
      .select("id", { count: "exact", head: true })
      .eq("uploader_id", userData.user.id)
      .neq("id", scanId)
      .in("status", QUOTA_STATUSES)
      .gte("created_at", windowStart);
    if ((count ?? 0) >= quota.max) {
      await service.from("scans").delete().eq("id", scanId);
      return errorResponse(403, quota.message);
    }
  }

  EdgeRuntime.waitUntil(
    processInBackground(
      service,
      scanId,
      userData.user.id,
      imageBase64,
      mediaType as SupportedMediaType,
      apiKey,
    ),
  );

  return jsonResponse(202, { success: true, data: { scan_id: scanId }, error: null });
});
