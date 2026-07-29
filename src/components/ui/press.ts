// Retour de pression — DEUX niveaux, pas trois. Sans état `pressed`, un
// Pressable RN ne bouge pas sous le doigt : l'app « fait web ». On centralise
// ici pour que chips, boutons discrets et cartes réagissent de la même façon
// partout, au lieu d'une opacité réinventée dans chaque composant.
export const pressOpacity = {
  /** Boutons discrets, chips, icônes, liens texte : réponse franche. */
  control: 0.7,
  /** Cartes et lignes de liste : la surface est large, la réponse est douce. */
  surface: 0.85,
} as const;
