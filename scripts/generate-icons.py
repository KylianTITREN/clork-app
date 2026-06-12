"""Génère le logotype Clork (C + pastille-horloge à aiguille découpée) :
icônes d'app par thème (fond encre), logos transparents in-app, assets Android,
splash et favicon. Usage : python3 scripts/generate-icons.py (Pillow requis)."""
import math
import pathlib
from PIL import Image, ImageDraw

S = 1024
CX, CY = S // 2, S // 2
INK = (38, 33, 14, 255)
CREAM = (255, 248, 231)

THEMES = {
    "honey": (255, 194, 51),
    "blossom": (249, 168, 201),
    "plum": (124, 92, 184),
    "water": (126, 200, 227),
    "sage": (156, 197, 161),
    "graphite": (115, 115, 126),
}

def polygon_wedge(cx, cy, r, a_from, a_to):
    pts = [(cx, cy)]
    for i in range(25):
        a = math.radians(a_from + (a_to - a_from) * i / 24)
        pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts

def build_mark(c_rgb, dot_rgb, scale=1.0):
    R, W, DOT, GAP = int(330 * scale), int(150 * scale), int(225 * scale), 38
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    dot_mask = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(dot_mask)
    dcx = CX + int(30 * scale)
    d.ellipse([dcx - DOT, CY - DOT, dcx + DOT, CY + DOT], fill=255)
    d.polygon(polygon_wedge(dcx, CY, DOT * 1.05, -78, -22), fill=0)
    layer.paste(Image.new("RGBA", (S, S), dot_rgb + (255,)), (0, 0), dot_mask)
    c_mask = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(c_mask)
    d.ellipse([CX - R, CY - R, CX + R, CY + R], fill=255)
    d.ellipse([CX - (R - W), CY - (R - W), CX + (R - W), CY + (R - W)], fill=0)
    d.polygon(polygon_wedge(CX, CY, R * 1.1, -GAP, GAP), fill=0)
    layer.paste(Image.new("RGBA", (S, S), c_rgb + (255,)), (0, 0), c_mask)
    return layer

pathlib.Path("assets/icons").mkdir(exist_ok=True)
pathlib.Path("assets/images/logos").mkdir(parents=True, exist_ok=True)

for theme_id, accent in THEMES.items():
    icon = Image.new("RGBA", (S, S), INK)
    icon.alpha_composite(build_mark(CREAM, accent))
    icon.save(f"assets/icons/icon-{theme_id}.png")
    build_mark((38, 33, 14), accent).save(f"assets/images/logos/logo-{theme_id}.png")

honey = THEMES["honey"]
icon = Image.new("RGBA", (S, S), INK)
icon.alpha_composite(build_mark(CREAM, honey))
icon.save("assets/images/icon.png")
icon.resize((48, 48), Image.LANCZOS).save("assets/images/favicon.png")
Image.new("RGBA", (S, S), INK).save("assets/images/android-icon-background.png")
fg = Image.new("RGBA", (S, S), (0, 0, 0, 0))
fg.alpha_composite(build_mark(CREAM, honey, scale=0.62))
fg.save("assets/images/android-icon-foreground.png")
mono = Image.new("RGBA", (S, S), (0, 0, 0, 0))
mono.alpha_composite(build_mark((255, 255, 255), (255, 255, 255), scale=0.62))
mono.save("assets/images/android-icon-monochrome.png")
splash = Image.new("RGBA", (S, S), (0, 0, 0, 0))
splash.alpha_composite(build_mark(CREAM, honey, scale=0.8))
splash.save("assets/images/splash-icon.png")
print("ok")
