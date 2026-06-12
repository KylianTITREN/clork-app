// Partage d'un scan entre collègues : l'uploader génère un code, l'invitée le
// saisit et choisit sa ligne sur le planning déjà extrait (zéro re-scan).

import type { PlanningExtraction } from "@/lib/extraction-types";
import { supabase } from "@/lib/supabase";

export async function createShare(scanId: string): Promise<string> {
  const { data, error } = await supabase
    .from("scan_shares")
    .insert({ scan_id: scanId })
    .select("invite_code")
    .single<{ invite_code: string }>();
  if (error || !data) {
    throw new Error("Création du partage impossible : " + (error?.message ?? "?"));
  }
  return data.invite_code;
}

export type ClaimedShare = {
  scanId: string;
  weekStart: string | null;
  storeLabel: string | null;
  extraction: PlanningExtraction;
};

type ClaimResponse = {
  success: boolean;
  error?: string;
  scan_id?: string;
  week_start?: string | null;
  store_label?: string | null;
  raw_extraction?: PlanningExtraction;
};

export async function claimShare(code: string): Promise<ClaimedShare> {
  const { data, error } = await supabase.rpc("claim_scan_share", {
    p_code: code.trim().toLowerCase(),
  });
  if (error) {
    throw new Error("Récupération impossible : " + error.message);
  }
  const response = data as ClaimResponse;
  if (!response.success || !response.scan_id || !response.raw_extraction) {
    throw new Error(response.error ?? "Code invalide");
  }
  return {
    scanId: response.scan_id,
    weekStart: response.week_start ?? null,
    storeLabel: response.store_label ?? null,
    extraction: response.raw_extraction,
  };
}

/** Mémorise la ligne choisie par l'invitée sur le partage. */
export async function recordClaimedRow(scanId: string, scanRowId: string): Promise<void> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return;
  await supabase
    .from("scan_shares")
    .update({ claimed_row_id: scanRowId })
    .eq("scan_id", scanId)
    .eq("invited_user_id", user.user.id);
}
