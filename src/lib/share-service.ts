// Partage d'un scan entre collègues : l'uploader génère un code, l'invitée le
// saisit et choisit sa ligne sur le planning déjà extrait (zéro re-scan).

import type { PlanningExtraction } from "@/lib/extraction-types";
import { supabase } from "@/lib/supabase";

export async function createShare(scanId: string): Promise<string> {
  // Idempotent : « Partage & suivi » et la vue Équipe appellent cette fonction
  // à chaque ouverture. Tant qu'un code n'a pas été réclamé il reste valable,
  // donc on le réutilise au lieu d'empiler une ligne de plus dans scan_shares.
  const { data: pending } = await supabase
    .from("scan_shares")
    .select("invite_code")
    .eq("scan_id", scanId)
    .is("invited_user_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<{ invite_code: string }>();
  if (pending) return pending.invite_code;

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

/**
 * Mémorise la ligne choisie par l'invitée sur le partage.
 *
 * Passe par une RPC verrouillée : l'UPDATE direct portait sur toute la ligne
 * scan_shares, donc sur scan_id — de quoi s'attribuer le scan d'un tiers. La
 * RPC ne touche que claimed_row_id, sur le partage de l'appelant, et vérifie
 * que la ligne appartient au scan. Sans effet quand l'uploader valide son
 * propre scan (il n'a pas de partage à son nom) : c'est le comportement voulu.
 */
export async function recordClaimedRow(scanId: string, scanRowId: string): Promise<void> {
  const { error } = await supabase.rpc("record_claimed_row", {
    p_scan_id: scanId,
    p_row_id: scanRowId,
  });
  // Best-effort : le lien Équipe est un confort, il ne doit jamais faire
  // échouer l'enregistrement des créneaux déjà écrits juste avant.
  if (error) console.warn("recordClaimedRow failed:", error.message);
}
