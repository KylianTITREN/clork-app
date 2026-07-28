// Collection d'avatars (écran Compte, maquette v2) : « letter » = initiale
// (gratuit, par défaut) ; les animaux sont la collection PREMIUM. Le slug est
// persisté dans profiles.avatar et voyagé par la RPC get_team_links.

export type AvatarSlug =
  | "letter"
  | "fox"
  | "penguin"
  | "owl"
  | "bee"
  | "turtle"
  | "octopus"
  | "koala";

export const AVATAR_EMOJI: Record<Exclude<AvatarSlug, "letter">, string> = {
  fox: "🦊",
  penguin: "🐧",
  owl: "🦉",
  bee: "🐝",
  turtle: "🐢",
  octopus: "🐙",
  koala: "🐨",
};

/** Ordre d'affichage de la grille (maquette : initiale puis 7 animaux). */
export const AVATAR_COLLECTION = Object.keys(AVATAR_EMOJI) as Exclude<
  AvatarSlug,
  "letter"
>[];

/** Emoji d'un slug, ou null si c'est l'initiale (ou un slug inconnu/futur). */
export function avatarEmojiOf(avatar: string): string | null {
  return (AVATAR_EMOJI as Record<string, string>)[avatar] ?? null;
}
