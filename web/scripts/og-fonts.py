"""Derive the OG-image font buffers from the self-hosted WOFF2 faces.

`next/og` (Satori) reads TTF, OTF or WOFF only -- never WOFF2 -- and it cannot
drive a variable font's axes. This script turns the shipped WOFF2 subsets in
`public/fonts/` into static TTFs in `public/fonts/og/`, which the OG routes read
as buffers (`app/share/_og/fonts.ts`). Same glyphs, same OFL 1.1 licence as the
WOFF2 parents (licence texts sit one directory up); Inter is pinned to two
static instances because Satori renders the default instance of a variable font.

Run from `web/`:   python3 scripts/og-fonts.py
Needs fontTools + brotli (the same toolchain `public/fonts/README.md` uses).
The outputs are committed, so the build itself needs no Python.
"""

from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

WEB = Path(__file__).resolve().parent.parent
SRC = WEB / "public" / "fonts"
OUT = SRC / "og"
OUT.mkdir(exist_ok=True)


def flatten(src: str, dest: str) -> None:
    font = TTFont(SRC / src)
    font.flavor = None
    font.save(OUT / dest)


def inter(weight: int, opsz: int, dest: str) -> None:
    font = TTFont(SRC / "inter-var.woff2")
    static = instantiateVariableFont(font, {"wght": weight, "opsz": opsz}, updateFontNames=False)
    static.flavor = None
    static.save(OUT / dest)


flatten("bebas-neue-400.woff2", "bebas-neue-400.ttf")
flatten("rajdhani-600.woff2", "rajdhani-600.ttf")
inter(500, 28, "inter-500.ttf")
inter(700, 28, "inter-700.ttf")

for f in sorted(OUT.glob("*.ttf")):
    print(f.name, f.stat().st_size)
