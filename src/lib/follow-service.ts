// Suivi de planning en lecture seule (ex: le compagnon suit Typhanie).

import { supabase } from "@/lib/supabase";

export type FollowedUser = { id: string; displayName: string };

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
  const { data: follows } = await supabase.from("follows").select("followed_id");
  if (!follows || follows.length === 0) return [];
  const ids = follows.map((f: { followed_id: string }) => f.followed_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", ids);
  return (profiles ?? []).map((p: { id: string; display_name: string }) => ({
    id: p.id,
    displayName: p.display_name || "Sans nom",
  }));
}
