// Génère les assets de marque v2 « Cadran mordu » (spec handoff 4g, option 06)
// pour les 6 thèmes : icônes d'app (cadran seul centré, ~30 % de marge, fond
// neutre clair), marques transparentes, icône principale (forêt), splash
// wordmark, favicon et icônes Android.
// Rasterisation : ImageMagick (`magick`) depuis des SVG écrits en temp.
// La géométrie DOIT rester identique à src/components/brand/ClorkMark.tsx.
// Usage : node scripts/generate-icons-v2.mjs

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Familles v2 — garder synchro avec src/constants/themes.ts.
const THEMES = {
  forest: "#1F6B47",
  honey: "#D19E00",
  blossom: "#ED72A8",
  plum: "#6C4BAC",
  water: "#2E7795",
  graphite: "#4A4A52",
};
const DEFAULT_THEME = "forest";
const NEUTRAL_BG = "#F7F6F2";
const INK = "#17150E";

// --- Géométrie du cadran (identique à ClorkMark.tsx) ------------------------
const C = 60;
const R = 50;
const NOTCH_DEG = 22.4;
const HAND_DEG = 67;
const HAND_LENGTH = 61;
const HAND_WIDTH = 9.8;
const HALO_WIDTH = 8.6;
const PIVOT_R = 11.5;
const PIVOT_RING = 5;
const DOT_R = 4.3;
const DOT_DIST = 38;

const rad = (deg) => (deg * Math.PI) / 180;
const upper = {
  x: C + R * Math.cos(rad(-NOTCH_DEG)),
  y: C + R * Math.sin(rad(-NOTCH_DEG)),
};
const lower = {
  x: C + R * Math.cos(rad(NOTCH_DEG)),
  y: C + R * Math.sin(rad(NOTCH_DEG)),
};
const DIAL_PATH = `M ${upper.x.toFixed(2)} ${upper.y.toFixed(2)} A ${R} ${R} 0 1 0 ${lower.x.toFixed(2)} ${lower.y.toFixed(2)} L ${C} ${C} Z`;
const tip = {
  x: C + HAND_LENGTH * Math.sin(rad(HAND_DEG)),
  y: C - HAND_LENGTH * Math.cos(rad(HAND_DEG)),
};

/**
 * Cadran mordu en SVG — uniquement des FORMES PLEINES (pas de stroke) : le
 * moteur MSVG d'ImageMagick rend mal les strokes (liserés parasites).
 * `holo` = couleur derrière le logo (halo de l'aiguille + anneau du pivot).
 */
function markSvg({ dial, face, holo }) {
  // Capsule pleine en coordonnées ABSOLUES (MSVG rend mal strokes ET
  // transforms) : rectangle orienté + bouts arrondis, du centre vers la pointe.
  const capsulePath = (bx, by, width) => {
    const r = width / 2;
    const dx = bx - C;
    const dy = by - C;
    const len = Math.hypot(dx, dy);
    const nx = (-dy / len) * r;
    const ny = (dx / len) * r;
    const f = (v) => v.toFixed(2);
    return (
      `M ${f(C + nx)} ${f(C + ny)} L ${f(bx + nx)} ${f(by + ny)} ` +
      `A ${f(r)} ${f(r)} 0 0 1 ${f(bx - nx)} ${f(by - ny)} ` +
      `L ${f(C - nx)} ${f(C - ny)} ` +
      `A ${f(r)} ${f(r)} 0 0 1 ${f(C + nx)} ${f(C + ny)} Z`
    );
  };
  return `
    <path d="${DIAL_PATH}" fill="${dial}"/>
    <circle cx="${C}" cy="${C - DOT_DIST}" r="${DOT_R}" fill="${face}" opacity="0.45"/>
    <circle cx="${C - DOT_DIST}" cy="${C}" r="${DOT_R}" fill="${face}" opacity="0.45"/>
    <circle cx="${C}" cy="${C + DOT_DIST}" r="${DOT_R}" fill="${face}" opacity="0.45"/>
    <path d="${capsulePath(tip.x, tip.y, HAND_WIDTH + HALO_WIDTH)}" fill="${holo}"/>
    <path d="${capsulePath(tip.x, tip.y, HAND_WIDTH)}" fill="${face}"/>
    <circle cx="${C}" cy="${C}" r="${(PIVOT_R + PIVOT_RING / 2).toFixed(2)}" fill="${holo}"/>
    <circle cx="${C}" cy="${C}" r="${(PIVOT_R - PIVOT_RING / 2).toFixed(2)}" fill="${face}"/>`;
}

/** Icône d'app : cadran centré, ~30 % de marge, fond neutre clair. */
function appIconSvg(accent) {
  // Cadran Ø100 dans un viewBox 120 → scale pour ~30 % de marge totale :
  // zone utile = 70 % de 1024. Le groupe 120 → 1024*0.7/100*... on cadre en
  // posant le viewBox : marge = (120/0.7 - 120)/2 ≈ 25.7 de chaque côté.
  const pad = 26;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${120 + 2 * pad} ${120 + 2 * pad}">
  <rect x="${-pad}" y="${-pad}" width="${120 + 2 * pad}" height="${120 + 2 * pad}" fill="${NEUTRAL_BG}"/>
  ${markSvg({ dial: accent, face: NEUTRAL_BG, holo: NEUTRAL_BG })}
</svg>`;
}

/** Marque transparente (pour les aperçus in-app). */
function transparentMarkSvg(accent) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 128 128">
  ${markSvg({ dial: accent, face: NEUTRAL_BG, holo: NEUTRAL_BG })}
</svg>`;
}

/** Splash : wordmark seul « cl o rk » sur fond neutre (spec 4g). */
function splashSvg(accent) {
  const fontPath = path.join(
    APP,
    "node_modules/@expo-google-fonts/instrument-sans/700Bold/InstrumentSans_700Bold.ttf",
  );
  // Wordmark centré dans 1024 : lettres 200px, cadran ≈ 144 (0.72 em).
  const fs = 200;
  const mark = 144;
  const scale = mark / 120;
  // Largeurs approx (Instrument Sans Bold) : « cl » ≈ 0.98 em, « rk » ≈ 1.02 em.
  const clWidth = fs * 0.98;
  const rkWidth = fs * 1.02;
  const gap = fs * 0.05;
  const total = clWidth + gap + mark + gap + rkWidth;
  const left = (1024 - total) / 2;
  const baseline = 512 + fs * 0.36;
  const markTop = 512 - mark / 2 + fs * 0.02; // léger abaissement optique
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="${NEUTRAL_BG}"/>
  <text x="${left}" y="${baseline}" font-family="${fontPath}" font-size="${fs}" font-weight="700" letter-spacing="-6" fill="${INK}">cl</text>
  <g transform="translate(${left + clWidth + gap}, ${markTop}) scale(${scale})">
    ${markSvg({ dial: accent, face: NEUTRAL_BG, holo: NEUTRAL_BG })}
  </g>
  <text x="${left + clWidth + gap + mark + gap}" y="${baseline}" font-family="${fontPath}" font-size="${fs}" font-weight="700" letter-spacing="-6" fill="${INK}">rk</text>
</svg>`;
}

/** Android foreground : cadran sur fond transparent, zone de sécurité large. */
function androidFgSvg(accent, mono = false) {
  const pad = 60; // adaptive icons : ~66 % de zone utile
  const dial = mono ? "#FFFFFF" : accent;
  const face = mono ? "#000000" : NEUTRAL_BG;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${120 + 2 * pad} ${120 + 2 * pad}">
  ${markSvg({ dial, face, holo: mono ? "#000000" : NEUTRAL_BG })}
</svg>`;
}

// --- Rendu -------------------------------------------------------------------
const tmp = mkdtempSync(path.join(tmpdir(), "clork-icons-"));
function render(svg, outPath, size) {
  const svgPath = path.join(tmp, path.basename(outPath) + ".svg");
  // Rasterisation à taille native (width/height sur la racine) : le passage
  // par -density créait un liseré sombre le long de l'aiguille (seam AA).
  writeFileSync(svgPath, svg.replace("<svg ", `<svg width="${size}" height="${size}" `));
  execFileSync("magick", ["-background", "none", svgPath, outPath]);
  console.log("✓", path.relative(APP, outPath));
}

for (const [id, accent] of Object.entries(THEMES)) {
  render(appIconSvg(accent), path.join(APP, `assets/icons/icon-${id}.png`), 1024);
  render(transparentMarkSvg(accent), path.join(APP, `assets/images/logos/logo-${id}.png`), 1024);
}

const forestAccent = THEMES[DEFAULT_THEME];
render(appIconSvg(forestAccent), path.join(APP, "assets/images/icon.png"), 1024);
render(splashSvg(forestAccent), path.join(APP, "assets/images/splash-icon.png"), 1024);
render(appIconSvg(forestAccent), path.join(APP, "assets/images/favicon.png"), 48);
render(androidFgSvg(forestAccent), path.join(APP, "assets/images/android-icon-foreground.png"), 1024);
render(androidFgSvg(forestAccent, true), path.join(APP, "assets/images/android-icon-monochrome.png"), 1024);
// Fond Android uni neutre.
render(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="${NEUTRAL_BG}"/></svg>`,
  path.join(APP, "assets/images/android-icon-background.png"),
  1024,
);

rmSync(tmp, { recursive: true, force: true });
console.log("Assets v2 générés.");
