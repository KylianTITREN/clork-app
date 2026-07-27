"""Splash v2 : wordmark seul « cl o rk » (o = cadran mordu) sur fond neutre.
Le texte est rendu par PIL (métriques Instrument Sans exactes) ; le cadran
vient de logo-forest.png (généré par generate-icons-v2.mjs — lancer AVANT).
Usage : python3 scripts/generate-splash-v2.py"""

import pathlib
from PIL import Image, ImageDraw, ImageFont

APP = pathlib.Path(__file__).resolve().parent.parent
FONT_PATH = (
    APP
    / "node_modules/@expo-google-fonts/instrument-sans/700Bold/InstrumentSans_700Bold.ttf"
)
NEUTRAL_BG = "#F7F6F2"
INK = "#17150E"
SIZE = 1024
FONT_SIZE = 190
TRACKING = -6  # letter-spacing léger négatif, signature du wordmark


def text_width(font: ImageFont.FreeTypeFont, text: str) -> float:
    width = sum(font.getlength(ch) for ch in text)
    return width + TRACKING * (len(text) - 1)


def draw_tracked(draw: ImageDraw.ImageDraw, pos, text, font, fill):
    x, y = pos
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += font.getlength(ch) + TRACKING


font = ImageFont.truetype(str(FONT_PATH), FONT_SIZE)
ascent, _descent = font.getmetrics()
# Centre optique de la hauteur d'x (mesuré sur « x ») : le cadran s'aligne là.
x_bbox = font.getbbox("x")
x_center_from_top = (x_bbox[1] + x_bbox[3]) / 2

# Cadran ≈ hauteur des lettres rondes (~0.74 em) + léger débord bas optique.
mark_size = round(FONT_SIZE * 0.74)
mark = (
    Image.open(APP / "assets/images/logos/logo-forest.png")
    .convert("RGBA")
    .resize((mark_size, mark_size), Image.LANCZOS)
)

gap = round(FONT_SIZE * 0.06)
cl_width = text_width(font, "cl")
rk_width = text_width(font, "rk")
total = cl_width + gap + mark_size + gap + rk_width

canvas = Image.new("RGB", (SIZE, SIZE), NEUTRAL_BG)
draw = ImageDraw.Draw(canvas)

left = (SIZE - total) / 2
# Ligne de texte posée pour que le centre de la hauteur d'x tombe au milieu.
text_top = SIZE / 2 - x_center_from_top
draw_tracked(draw, (left, text_top), "cl", font, INK)
mark_top = round(SIZE / 2 - mark_size / 2 + FONT_SIZE * 0.015)
canvas.paste(mark, (round(left + cl_width + gap), mark_top), mark)
draw_tracked(draw, (left + cl_width + gap + mark_size + gap, text_top), "rk", font, INK)

out = APP / "assets/images/splash-icon.png"
canvas.save(out)
print("✓", out.relative_to(APP))
