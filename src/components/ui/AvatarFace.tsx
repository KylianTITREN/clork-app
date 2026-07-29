// Avatar partagé v2 : rend l'emoji de la collection Premium (AVATAR_EMOJI) ou,
// pour le slug « letter », l'initiale du prénom. Utilisé par la grille de
// l'écran Compte et par le hub du profil — même cercle, mêmes proportions.

import { StyleSheet, Text, View } from "react-native";

import { avatarEmojiOf } from "@/constants/avatars";
import { fonts, radius, useThemeColors } from "@/constants/tokens";

type AvatarFaceProps = {
  /** Slug persisté dans profiles.avatar (« letter » ou animal de la collection). */
  avatar: string;
  /** Nom affiché : sa première lettre sert d'avatar par défaut. */
  name: string;
  /** Diamètre du cercle, en points. */
  size: number;
  /** Fond du cercle (défaut : accent du thème). */
  background?: string;
  /** Couleur de l'initiale (défaut : encre posée sur l'accent). */
  color?: string;
};

/** Initiale majuscule, repli « C » (Clork) quand le nom est encore vide. */
function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "C";
}

// Proportions de la maquette pour un cercle de 52 : emoji 24, initiale 21.
const EMOJI_RATIO = 0.46;
const LETTER_RATIO = 0.4;

export function AvatarFace({ avatar, name, size, background, color }: AvatarFaceProps) {
  const colors = useThemeColors();
  const emoji = avatarEmojiOf(avatar);

  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, backgroundColor: background ?? colors.accent },
      ]}
    >
      <Text
        // L'emoji garde la police système : une fontFamily custom ne le rend pas.
        style={[
          styles.glyph,
          emoji ? null : styles.letter,
          {
            fontSize: Math.round(size * (emoji ? EMOJI_RATIO : LETTER_RATIO)),
            color: color ?? colors.onAccent,
          },
        ]}
      >
        {emoji ?? initialOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    textAlign: "center",
  },
  letter: {
    fontFamily: fonts.bold,
  },
});
