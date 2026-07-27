// Suivi de planning en lecture seule (ex : le compagnon suit Typhanie).
// v2 : un suivi peut être la « vue par défaut » — l'accueil et les widgets
// s'ouvrent sur ce planning au lieu du mien (un seul défaut par utilisateur).

import { supabase } from "@/lib/supabase";

export type FollowedUser = { id: string; displayName: string; isDefaultView: boolean };

export async function followUser(code: string): Promise<string> {
  const { data, error } = await supabase.rpc("follow_user", { p_code: code.trim().toLowerCase() });
  if (error) throw new Error(error.message);
  const res = data as { success: boolean; error?: string; display_name?: string };
  if (!res.success) throw new Error(res.error ?? "Code invalide");
  return res.display_name ?? "—";
}

export async function unfollowUser(followedId: string): Promise<void> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return;
  await supabase.from("follows").delete().eq("follower_id", user.user.id).eq("followed_id", followedId);
}

export async function listFollowed(): Promise<FollowedUser[]> {
  const { data: follows } = await supabase
    .from("follows")
    .select("followed_id, is_default_view");
  if (!follows || follows.length === 0) return [];
  const byId = new Map(
    follows.map((f: { followed_id: string; is_default_view: boolean }) => [
      f.followed_id,
      f.is_default_view,
    ]),
  );
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", [...byId.keys()]);
  return (profiles ?? []).map((p: { id: string; display_name: string }) => ({
    id: p.id,
    displayName: p.display_name || "Sans nom",
    isDefaultView: byId.get(p.id) ?? false,
  }));
}

/**
 * Fait de `followedId` la vue par défaut (ou l'enlève avec null). Un seul
 * défaut : on remet tout à false avant de poser le nouveau.
 */
export async function setDefaultView(followedId: string | null): Promise<void> {
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return;
  const { error: clearError } = await supabase
    .from("follows")
    .update({ is_default_view: false })
    .eq("follower_id", user.user.id);
  if (clearError) throw new Error(clearError.message);
  if (followedId) {
    const { error } = await supabase
      .from("follows")
      .update({ is_default_view: true })
      .eq("follower_id", user.user.id)
      .eq("followed_id", followedId);
    if (error) throw new Error(error.message);
  }
}

/** Le planning que doivent afficher l'accueil et les widgets par défaut. */
export async function getDefaultView(): Promise<FollowedUser | null> {
  const list = await listFollowed();
  return list.find((f) => f.isDefaultView) ?? null;
}
