"""Importe les logos OFFICIELS de Kylian depuis ../logos (source de vérité,
1024x1024) vers les assets de l'app.
  "<Nom>.png"   = icône fond accent  ->  assets/icons/icon-<id>.png
  "<Nom> 3.png" = marque transparente -> assets/images/logos/logo-<id>.png
Dérive aussi : icon.png/favicon (miel), Android fg/bg/monochrome, splash.
Usage : python3 scripts/import-logos.py"""
import pathlib
from PIL import Image

SRC = pathlib.Path(__file__).resolve().parent.parent.parent / "logos"
APP = pathlib.Path(__file__).resolve().parent.parent

NAME_TO_ID = {
    "Miel": "honey",
    "Rose": "blossom",
    "Prune": "plum",
    "Eau": "water",
    "Sauge": "sage",
    "Anthracite": "graphite",
}
HONEY = (255, 194, 51, 255)
S = 1024

(APP / "assets/icons").mkdir(exist_ok=True)
(APP / "assets/images/logos").mkdir(parents=True, exist_ok=True)

def load(name: str) -> Image.Image:
    im = Image.open(SRC / name).convert("RGBA")
    if im.size != (S, S):
        im = im.resize((S, S), Image.LANCZOS)
    return im

def fitted(mark: Image.Image, scale: float) -> Image.Image:
    """Marque centrée à l'échelle donnée sur un canevas transparent 1024."""
    size = int(S * scale)
    small = mark.resize((size, size), Image.LANCZOS)
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    canvas.alpha_composite(small, ((S - size) // 2, (S - size) // 2))
    return canvas

for name, theme_id in NAME_TO_ID.items():
    load(f"{name}.png").save(APP / f"assets/icons/icon-{theme_id}.png")
    load(f"{name} 3.png").save(APP / f"assets/images/logos/logo-{theme_id}.png")

# Défauts (miel)
icon = load("Miel.png")
icon.save(APP / "assets/images/icon.png")
icon.resize((48, 48), Image.LANCZOS).save(APP / "assets/images/favicon.png")

mark = load("Miel 3.png")
Image.new("RGBA", (S, S), HONEY).save(APP / "assets/images/android-icon-background.png")
fitted(mark, 0.62).save(APP / "assets/images/android-icon-foreground.png")
# Monochrome : silhouette blanche depuis l'alpha
mono = Image.new("RGBA", (S, S), (0, 0, 0, 0))
white = Image.new("RGBA", (S, S), (255, 255, 255, 255))
mono.paste(white, (0, 0), fitted(mark, 0.62).getchannel("A"))
mono.save(APP / "assets/images/android-icon-monochrome.png")
fitted(mark, 0.8).save(APP / "assets/images/splash-icon.png")
print("import ok")
