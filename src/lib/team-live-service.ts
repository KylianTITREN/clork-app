// « Équipe vivante » : la RPC get_team_links renvoie, pour un scan, les
// comptes reliés (l'uploader + chaque invitée ayant réclamé sa ligne par code)
// avec leurs créneaux ACTUELS de la semaine du scan — la vue Équipe les
// superpose au snapshot papier. Les règles d'accès (premium, sa propre ligne)
// sont appliquées côté serveur par la fonction elle-même.

import { supabase } from "@/lib/supabase";

/** Créneau live d'un compte relié (timestamptz bruts, formatés côté écran). */
export type LiveShift = {
  date: string; // YYYY-MM-DD
  start_at: string | null;
  end_at: string | null;
  type: string; // work | meeting | rh | cp | … (types custom possibles)
  break_minutes: number | null;
};

/**
 * Un compte relié au scan. row_index null = l'UPLOADER : sa ligne se résout
 * côté app par findTargetEmployee avec SES employee_aliases/display_name ;
 * les invitées portent le row_index de la ligne réclamée via le code équipe.
 */
export type TeamLink = {
  user_id: string;
  row_index: number | null;
  display_name: string;
  employee_aliases: string[];
  avatar: string; // 'letter' aujourd'hui, collection à venir
  shifts: LiveShift[];
};

type TeamLinksResponse = {
  success: boolean;
  error?: string;
  links?: TeamLink[];
};

/**
 * Liens live d'un scan. Best-effort : tableau vide sur toute défaillance
 * (accès refusé, réseau, réponse inattendue) — l'écran retombe alors sur le
 * snapshot, jamais bloqué.
 */
export async function getTeamLinks(scanId: string): Promise<TeamLink[]> {
  try {
    const { data, error } = await supabase.rpc("get_team_links", { p_scan_id: scanId });
    if (error) return [];
    const response = data as TeamLinksResponse | null;
    if (!response?.success || !Array.isArray(response.links)) return [];
    return response.links;
  } catch {
    return [];
  }
}
