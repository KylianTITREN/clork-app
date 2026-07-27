import { StyleSheet, Text, View } from "react-native";

import { fonts } from "@/constants/tokens";
import { ClorkMark } from "@/components/brand/ClorkMark";

// Wordmark v2 : « cl o rk » où le « o » est le cadran mordu — l'aiguille
// dépasse légèrement du cercle par l'encoche (spec 4g). Splash et écrans
// auth : wordmark SEUL (pas d'icône au-dessus).
type ClorkWordmarkProps = {
  /** Hauteur de casse (taille de police) — le cadran suit proportionnellement. */
  size?: number;
  /** Couleur des lettres. */
  color: string;
  /** Couleur du cadran (primaire du thème en usage courant). */
  dial: string;
  /** Couleur du fond derrière le wordmark (halo aiguille + pivot). */
  background: string;
};

export function ClorkWordmark({
  size = 34,
  color,
  dial,
  background,
}: ClorkWordmarkProps) {
  // Le cadran joue le « o » : ~72 % de la taille de police ≈ hauteur d'x
  // d'Instrument Sans Bold, aligné sur la ligne de base des lettres.
  const markSize = size * 0.72;
  return (
    <View style={styles.row}>
      <Text style={[styles.letters, { color, fontSize: size }]}>cl</Text>
      <View style={[styles.mark, { marginHorizontal: size * 0.06 }]}>
        {/* Aiguille/pivot/points de la MÊME couleur que les lettres (retour
            Kylian) — le halo garde la couleur du fond pour détacher du cadran. */}
        <ClorkMark size={markSize} dial={dial} face={color} background={background} />
      </View>
      <Text style={[styles.letters, { color, fontSize: size }]}>rk</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  letters: {
    fontFamily: fonts.bold,
    letterSpacing: -1,
  },
  mark: {
    // L'aiguille dépasse du cercle : ne pas rogner.
    overflow: "visible",
    // Optique : le cercle plein paraît plus haut que la casse — léger abaissement.
    marginTop: 2,
  },
});
