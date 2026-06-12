#!/usr/bin/env python3
"""Generate the Clork app icon for each theme.

Design (matches assets/images/icon.png): solid accent background, thick ink
clock (ring stroke ~16% of radius, hands at 10:08 forming a check mark,
center dot) plus three rounded planning lines on the right. The mark is
centered-left (~40% x). Ink color = theme `onAccent` (light ink on dark
accents like plum/graphite).

Outputs:
  assets/icons/icon-<themeId>.png  (1024x1024, one per theme)
  assets/images/icon.png           (regenerated default = honey)

Keep palettes in sync with src/constants/themes.ts.

Usage: python3 scripts/generate-icons.py
Requires: Pillow (python3 -m pip install --user pillow)
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS_DIR = ROOT / "assets" / "icons"
DEFAULT_ICON = ROOT / "assets" / "images" / "icon.png"

# (accent, onAccent) — sync with src/constants/themes.ts
THEMES: dict[str, tuple[str, str]] = {
    "honey": ("#FFC233", "#26210E"),
    "blossom": ("#F9A8C9", "#2E1220"),
    "plum": ("#7C5CB8", "#FFF8F2"),
    "water": ("#7EC8E3", "#0E2530"),
    "sage": ("#9CC5A1", "#14261A"),
    "graphite": ("#4A4A52", "#F4F2E8"),
}

SIZE = 1024  # final output size
SS = 4  # supersampling factor for crisp anti-aliased edges

# Geometry measured on the original honey icon (1024x1024).
CLOCK_CENTER = (415, 500)  # ~40% x, mark centered-left
CLOCK_RADIUS = 268
RING_STROKE = 46  # ~17% of radius
HAND_STROKE = 42
CENTER_DOT_RADIUS = 30
# 10:08 — minute hand up-right, hour hand up-left, together forming a check.
MINUTE_ANGLE_DEG = 48  # clockwise from 12 o'clock
MINUTE_LENGTH = 192
HOUR_ANGLE_DEG = 304
HOUR_LENGTH = 134

LINE_STROKE = 38
LINE_X_START = 740
PLANNING_LINES = (  # (y_center, x_end) — shrinking widths, right block
    (432, 1005),
    (510, 925),
    (588, 850),
)


def rounded_line(
    draw: ImageDraw.ImageDraw,
    start: tuple[float, float],
    end: tuple[float, float],
    stroke: float,
    color: str,
) -> None:
    """Line with round caps."""
    draw.line([start, end], fill=color, width=round(stroke))
    half = stroke / 2
    for x, y in (start, end):
        draw.ellipse([x - half, y - half, x + half, y + half], fill=color)


def polar_offset(
    origin: tuple[float, float], angle_deg: float, length: float
) -> tuple[float, float]:
    """Point at `length` from origin, angle measured clockwise from 12 o'clock."""
    rad = math.radians(angle_deg)
    return (origin[0] + math.sin(rad) * length, origin[1] - math.cos(rad) * length)


def draw_icon(accent: str, ink: str) -> Image.Image:
    size = SIZE * SS
    image = Image.new("RGB", (size, size), accent)
    draw = ImageDraw.Draw(image)

    cx, cy = (CLOCK_CENTER[0] * SS, CLOCK_CENTER[1] * SS)
    radius = CLOCK_RADIUS * SS

    # Clock ring.
    draw.ellipse(
        [cx - radius, cy - radius, cx + radius, cy + radius],
        outline=ink,
        width=RING_STROKE * SS,
    )

    # Hands at 10:08 (check mark).
    for angle, length in ((MINUTE_ANGLE_DEG, MINUTE_LENGTH), (HOUR_ANGLE_DEG, HOUR_LENGTH)):
        tip = polar_offset((cx, cy), angle, length * SS)
        rounded_line(draw, (cx, cy), tip, HAND_STROKE * SS, ink)

    # Center dot.
    dot = CENTER_DOT_RADIUS * SS
    draw.ellipse([cx - dot, cy - dot, cx + dot, cy + dot], fill=ink)

    # Planning lines (right block).
    for y_center, x_end in PLANNING_LINES:
        rounded_line(
            draw,
            (LINE_X_START * SS, y_center * SS),
            (x_end * SS, y_center * SS),
            LINE_STROKE * SS,
            ink,
        )

    return image.resize((SIZE, SIZE), Image.LANCZOS)


def main() -> None:
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    for theme_id, (accent, ink) in THEMES.items():
        icon = draw_icon(accent, ink)
        target = ICONS_DIR / f"icon-{theme_id}.png"
        icon.save(target, format="PNG")
        print(f"wrote {target.relative_to(ROOT)}")

    # Default app icon = honey.
    accent, ink = THEMES["honey"]
    draw_icon(accent, ink).save(DEFAULT_ICON, format="PNG")
    print(f"wrote {DEFAULT_ICON.relative_to(ROOT)} (default, honey)")


if __name__ == "__main__":
    main()
