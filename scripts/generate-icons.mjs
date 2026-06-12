#!/usr/bin/env node
// Node fallback of scripts/generate-icons.py (same design, same outputs) for
// environments without Python/Pillow. Pure Node (zlib) — no dependency.
// Usage: node scripts/generate-icons.mjs

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ICONS_DIR = join(ROOT, "assets", "icons");
const DEFAULT_ICON = join(ROOT, "assets", "images", "icon.png");

// [accent, onAccent] — sync with src/constants/themes.ts
const THEMES = {
  honey: ["#FFC233", "#26210E"],
  blossom: ["#F9A8C9", "#2E1220"],
  plum: ["#7C5CB8", "#FFF8F2"],
  water: ["#7EC8E3", "#0E2530"],
  sage: ["#9CC5A1", "#14261A"],
  graphite: ["#4A4A52", "#F4F2E8"],
};

const SIZE = 1024;
const SS = 4; // supersampling factor

// Geometry measured on the original honey icon (1024x1024) — see generate-icons.py.
const CLOCK_CENTER = [415, 500];
const CLOCK_RADIUS = 268;
const RING_STROKE = 46;
const HAND_STROKE = 42;
const CENTER_DOT_RADIUS = 30;
const MINUTE_ANGLE_DEG = 48; // clockwise from 12 o'clock — 10:08 check mark
const MINUTE_LENGTH = 192;
const HOUR_ANGLE_DEG = 304;
const HOUR_LENGTH = 134;
const LINE_STROKE = 38;
const LINE_X_START = 740;
const PLANNING_LINES = [
  [432, 1005],
  [510, 925],
  [588, 850],
];

function hexToRgb(hex) {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function polarOffset([ox, oy], angleDeg, length) {
  const rad = (angleDeg * Math.PI) / 180;
  return [ox + Math.sin(rad) * length, oy - Math.cos(rad) * length];
}

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/** 1 bit per supersampled pixel: is this pixel ink? */
function buildInkMask() {
  const size = SIZE * SS;
  const mask = new Uint8Array(size * size);
  const [cx, cy] = [CLOCK_CENTER[0] * SS, CLOCK_CENTER[1] * SS];
  const radius = CLOCK_RADIUS * SS;
  const ringMid = radius - (RING_STROKE * SS) / 2;
  const ringHalf = (RING_STROKE * SS) / 2;
  const handHalf = (HAND_STROKE * SS) / 2;
  const dotR = CENTER_DOT_RADIUS * SS;
  const lineHalf = (LINE_STROKE * SS) / 2;

  const minuteTip = polarOffset([cx, cy], MINUTE_ANGLE_DEG, MINUTE_LENGTH * SS);
  const hourTip = polarOffset([cx, cy], HOUR_ANGLE_DEG, HOUR_LENGTH * SS);
  const lines = PLANNING_LINES.map(([y, xEnd]) => [
    [LINE_X_START * SS, y * SS],
    [xEnd * SS, y * SS],
  ]);

  for (let y = 0; y < size; y++) {
    const py = y + 0.5;
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const dClock = Math.hypot(px - cx, py - cy);
      const isInk =
        Math.abs(dClock - ringMid) <= ringHalf ||
        dClock <= dotR ||
        (dClock <= radius &&
          (distToSegment(px, py, [cx, cy], minuteTip) <= handHalf ||
            distToSegment(px, py, [cx, cy], hourTip) <= handHalf)) ||
        lines.some(([a, b]) => distToSegment(px, py, a, b) <= lineHalf);
      if (isInk) mask[y * size + x] = 1;
    }
  }
  return mask;
}

/** Downsample the mask (SSxSS box average) and blend accent→ink into RGB rows. */
function rasterize(mask, accent, ink) {
  const [ar, ag, ab] = hexToRgb(accent);
  const [ir, ig, ib] = hexToRgb(ink);
  const big = SIZE * SS;
  // Each scanline is prefixed by filter byte 0.
  const raw = Buffer.alloc(SIZE * (1 + SIZE * 3));
  for (let y = 0; y < SIZE; y++) {
    const rowStart = y * (1 + SIZE * 3) + 1;
    for (let x = 0; x < SIZE; x++) {
      let cover = 0;
      for (let sy = 0; sy < SS; sy++) {
        const base = (y * SS + sy) * big + x * SS;
        for (let sx = 0; sx < SS; sx++) cover += mask[base + sx];
      }
      const t = cover / (SS * SS);
      const offset = rowStart + x * 3;
      raw[offset] = Math.round(ar + (ir - ar) * t);
      raw[offset + 1] = Math.round(ag + (ig - ag) * t);
      raw[offset + 2] = Math.round(ab + (ib - ab) * t);
    }
  }
  return raw;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(raw) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(ICONS_DIR, { recursive: true });
const mask = buildInkMask();
for (const [themeId, [accent, ink]] of Object.entries(THEMES)) {
  const png = encodePng(rasterize(mask, accent, ink));
  const target = join(ICONS_DIR, `icon-${themeId}.png`);
  writeFileSync(target, png);
  console.log(`wrote ${target}`);
}
const [accent, ink] = THEMES.honey;
writeFileSync(DEFAULT_ICON, encodePng(rasterize(mask, accent, ink)));
console.log(`wrote ${DEFAULT_ICON} (default, honey)`);
