import Svg, { Circle, Line, Path } from "react-native-svg";

// Logo v2 « Cadran mordu » (spec 4g, option 06 retenue) :
// cadran plein avec ENCOCHE triangulaire ouverte à 3h (pointe au centre,
// demi-angle ~22,4°), aiguille unique posée sur le bord HAUT de l'encoche
// (~67° depuis midi) qui dépasse légèrement du cercle, halo couleur du fond
// qui la détache du cadran, pivot central rond, 3 points d'index (12h/9h/6h).
// L'encoche est découpée dans le path du cadran (pas un triangle posé
// par-dessus) : le logo fonctionne sur n'importe quel fond.

// Géométrie dans un viewBox 120×120 (cadran r=50 centré en 60,60, marge pour
// le dépassement de l'aiguille). Demi-angle d'encoche = atan(14/34) ≈ 22,4°.
const C = 60;
const R = 50;
const NOTCH_DEG = 22.4;
const HAND_DEG = 67; // depuis midi, sens horaire → posée sur la lèvre haute
const HAND_LENGTH = 61; // depuis le centre — dépasse le rayon (50) par l'encoche
const HAND_WIDTH = 9.8;
const HALO_WIDTH = 8.6; // liseré de part et d'autre de l'aiguille
const PIVOT_R = 11.5;
const PIVOT_RING = 5;
const DOT_R = 4.3;
const DOT_DIST = 38;

const rad = (deg: number) => (deg * Math.PI) / 180;

// Bords de l'encoche sur le cercle (angle 0 = 3h, y vers le bas).
const upperLip = {
  x: C + R * Math.cos(rad(-NOTCH_DEG)),
  y: C + R * Math.sin(rad(-NOTCH_DEG)),
};
const lowerLip = {
  x: C + R * Math.cos(rad(NOTCH_DEG)),
  y: C + R * Math.sin(rad(NOTCH_DEG)),
};
// Cadran = grand arc (par 12h, 9h, 6h) entre les deux lèvres + pointe au centre.
const DIAL_PATH = [
  `M ${upperLip.x.toFixed(2)} ${upperLip.y.toFixed(2)}`,
  `A ${R} ${R} 0 1 0 ${lowerLip.x.toFixed(2)} ${lowerLip.y.toFixed(2)}`,
  `L ${C} ${C}`,
  "Z",
].join(" ");

// Pointe de l'aiguille : 67° depuis midi = 23° au-dessus de l'axe 3h.
const handTip = {
  x: C + HAND_LENGTH * Math.sin(rad(HAND_DEG)),
  y: C - HAND_LENGTH * Math.cos(rad(HAND_DEG)),
};

export type ClorkMarkProps = {
  size?: number;
  /** Couleur du cadran (primaire du thème, encre, ou blanc). */
  dial: string;
  /** Couleur des détails posés sur le cadran (aiguille, points, pivot). */
  face: string;
  /** Couleur du fond derrière le logo — halo de l'aiguille + anneau du pivot. */
  background: string;
};

export function ClorkMark({ size = 46, dial, face, background }: ClorkMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Path d={DIAL_PATH} fill={dial} />
      {/* Index 12h / 9h / 6h (pas à 3h : c'est l'encoche). */}
      <Circle cx={C} cy={C - DOT_DIST} r={DOT_R} fill={face} opacity={0.45} />
      <Circle cx={C - DOT_DIST} cy={C} r={DOT_R} fill={face} opacity={0.45} />
      <Circle cx={C} cy={C + DOT_DIST} r={DOT_R} fill={face} opacity={0.45} />
      {/* Halo (couleur du fond) puis aiguille — posée sur la lèvre haute. */}
      <Line
        x1={C}
        y1={C}
        x2={handTip.x}
        y2={handTip.y}
        stroke={background}
        strokeWidth={HAND_WIDTH + HALO_WIDTH}
        strokeLinecap="round"
      />
      <Line
        x1={C}
        y1={C}
        x2={handTip.x}
        y2={handTip.y}
        stroke={face}
        strokeWidth={HAND_WIDTH}
        strokeLinecap="round"
      />
      {/* Pivot : rond « face » cerclé de la couleur du fond. */}
      <Circle
        cx={C}
        cy={C}
        r={PIVOT_R}
        fill={face}
        stroke={background}
        strokeWidth={PIVOT_RING}
      />
    </Svg>
  );
}
