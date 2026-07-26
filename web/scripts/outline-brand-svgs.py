#!/usr/bin/env python3
"""Outline the live <text> in the YIELD/YARD brand SVGs.

WHY
---
design/system/TYPE.md §8, final bullet:

    The brand's logo SVGs ship as live `<text>` in Bebas Neue with
    `font-weight="700"`. On any machine without Bebas installed they render in
    Arial Narrow. That is a delivery bug in the identity assets.

Identity assets must not depend on a font being installed on the viewer's
machine. This script converts every `<text>` element into a `<path>` of baked
outlines, so the marks render identically everywhere.

It also drops `font-weight="700"` from the Bebas runs. Bebas Neue is a
single-weight (400) family; the 700 was producing a *synthetic* bold, which
TYPE.md §1 forbids. The outlines are drawn from the real 400 masters. Note that
synthetic bold does not change advance widths -- verified against Chromium --
so dropping it changes stroke weight only, never metrics or position.

Inter runs (the "DATA. INSIGHT. YIELD." lines and the numeric marks) keep their
declared weight: the Inter variable font is instanced at that `wght`.

REQUIREMENTS
------------
    pip install fonttools brotli lxml uharfbuzz

uharfbuzz is what makes the output metrically exact: these runs are kerned
(Chromium applies the `kern` feature even when letter-spacing is non-zero -- the
Y/A pair in "YARD" moves by 46 font units), and hand-summing `hmtx` misses that.
Without uharfbuzz the script still runs but falls back to unkerned advances and
warns.

USAGE
-----
    python3 web/scripts/outline-brand-svgs.py

Reads   design/handoff/project/uploads/yield-yard-brand-kit/assets/*.svg
Writes  web/public/brand/*.svg   (same filenames)

monogram.svg contains no <text> and is copied verbatim.
"""

from __future__ import annotations

import io
import os
import shutil
import sys

from fontTools.misc.transform import Transform
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from lxml import etree

try:
    import uharfbuzz as hb
except ImportError:  # pragma: no cover
    hb = None

# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------

HERE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.dirname(HERE)
REPO = os.path.dirname(WEB)

SRC_DIR = os.path.join(
    REPO, "design", "handoff", "project", "uploads", "yield-yard-brand-kit", "assets"
)
OUT_DIR = os.path.join(WEB, "public", "brand")

BEBAS_TTF = os.path.join(
    REPO,
    "design",
    "handoff",
    "project",
    "uploads",
    "Bebas_Neue,DM_Serif_Display,Squada_One",
    "Bebas_Neue",
    "BebasNeue-Regular.ttf",
)

# The Inter variable master. We read the copy this repo already ships:
# web/public/fonts/inter-var.woff2 -- a latin subset of
# https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf
# with fvar/gvar/HVAR intact, so instancing and advance widths are identical to
# the full master for every character these marks use (all ASCII). Set $INTER_VF
# to point at the unsubset .ttf instead if you prefer.
INTER_TTF = os.environ.get(
    "INTER_VF", os.path.join(WEB, "public", "fonts", "inter-var.woff2")
)

FILES = [
    "app-icon.svg",
    "badge.svg",
    "logo-horizontal-dark.svg",
    "logo-horizontal-light.svg",
    "logo-stacked.svg",
    "monogram.svg",
]

SVG_NS = "http://www.w3.org/2000/svg"
SVG = "{%s}" % SVG_NS

# --------------------------------------------------------------------------
# Layout rules
#
# These encode how Chromium actually lays SVG text out. They are not free
# parameters -- each was read back out of the browser with
# getStartPositionOfChar()/getComputedTextLength() on the ORIGINAL files and the
# model below reproduces every character position to within 0.14 user units.
# --------------------------------------------------------------------------

# 1. CSS letter-spacing is added after EVERY character, the last one included,
#    so the trailing space counts toward the advance width that text-anchor
#    measures against. (Confirmed: app-icon "50", x=256, anchor=middle, renders
#    its first glyph at 231.44 = 256 - (adv5+adv0+2*6)/2.)
TRAILING_LETTER_SPACING_IN_WIDTH = True

# 2. Kerning stays ON even though letter-spacing is non-zero. Ligatures are off.
#    (Confirmed: "Y" advances 394 units in "YIELD" but 348 in "YARD".)
SHAPE_FEATURES = {
    "kern": True,
    "liga": False,
    "clig": False,
    "dlig": False,
    "calt": False,
}

# 3. Optical sizing: Chromium here resolves Inter through fontconfig at the
#    fvar DEFAULT opsz (14), not at font-size -- `font-optical-sizing: auto` is
#    not applied to these runs. (Confirmed: "5" at 28px advances 1297.6 units,
#    which is opsz=14's 1298, not opsz=28's 1260.) We instance at the default so
#    the outlines match what the originals actually render as.
USE_DEFAULT_OPSZ = True


# --------------------------------------------------------------------------
# Font loading / instancing
# --------------------------------------------------------------------------

_font_cache: dict[tuple, "LoadedFont"] = {}


class LoadedFont:
    """A static TTFont plus a harfbuzz face over the same bytes."""

    def __init__(self, ttfont: TTFont, data: bytes):
        self.font = ttfont
        self.data = data
        self.upem = ttfont["head"].unitsPerEm
        self.cmap = ttfont.getBestCmap()
        self.glyphset = ttfont.getGlyphSet()
        self.glyph_order = ttfont.getGlyphOrder()
        self.hmtx = ttfont["hmtx"]
        self.hb_font = None
        if hb is not None:
            face = hb.Face(data)
            f = hb.Font(face)
            f.scale = (self.upem, self.upem)
            self.hb_font = f

    def shape(self, text: str):
        """-> [(glyph_name, x_advance, x_offset, y_offset)] in font units."""
        if self.hb_font is not None:
            buf = hb.Buffer()
            buf.add_str(text)
            buf.guess_segment_properties()
            hb.shape(self.hb_font, buf, SHAPE_FEATURES)
            out = []
            for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
                out.append(
                    (
                        self.glyph_order[info.codepoint],
                        pos.x_advance,
                        pos.x_offset,
                        pos.y_offset,
                    )
                )
            return out
        # Fallback: no shaping, no kerning.
        out = []
        for ch in text:
            gname = self.cmap.get(ord(ch))
            if gname is None:
                continue
            out.append((gname, self.hmtx[gname][0], 0, 0))
        return out


def family_of(font_family: str) -> str:
    """First family in a CSS font stack, unquoted and lowercased."""
    first = font_family.split(",")[0].strip()
    return first.strip("'\"").lower()


def _to_bytes(ttfont: TTFont) -> bytes:
    buf = io.BytesIO()
    flavor = ttfont.flavor
    ttfont.flavor = None
    ttfont.save(buf)
    ttfont.flavor = flavor
    return buf.getvalue()


def load_font(font_family: str, weight: int) -> LoadedFont:
    fam = family_of(font_family)

    if fam == "bebas neue":
        # Single weight. The declared 700 is synthetic and is deliberately
        # ignored: we always draw the real 400 masters.
        key = ("bebas", 400)
        if key not in _font_cache:
            with open(BEBAS_TTF, "rb") as fh:
                data = fh.read()
            _font_cache[key] = LoadedFont(TTFont(BEBAS_TTF), data)
        return _font_cache[key]

    if fam == "inter":
        if not os.path.exists(INTER_TTF):
            sys.exit(
                f"Inter variable font not found at {INTER_TTF}\n"
                "Fetch it from https://raw.githubusercontent.com/google/fonts/"
                "main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf or set $INTER_VF."
            )
        base = TTFont(INTER_TTF)
        axes = {a.axisTag: a for a in base["fvar"].axes}
        loc = {}
        if "wght" in axes:
            a = axes["wght"]
            loc["wght"] = max(a.minValue, min(a.maxValue, float(weight)))
        if "opsz" in axes:
            loc["opsz"] = axes["opsz"].defaultValue if USE_DEFAULT_OPSZ else 14.0
        key = ("inter",) + tuple(sorted(loc.items()))
        if key not in _font_cache:
            inst = instantiateVariableFont(
                base, loc, inplace=False, updateFontNames=False
            )
            _font_cache[key] = LoadedFont(inst, _to_bytes(inst))
        return _font_cache[key]

    raise SystemExit(f"No outline source registered for font-family {font_family!r}")


# --------------------------------------------------------------------------
# SVG attribute inheritance
#
# These files put the font on the wrapping <g> and the size sometimes on the
# <g>, sometimes on the <text>. Walk the ancestor chain; nearest wins.
# --------------------------------------------------------------------------

CONTAINERS = (SVG + "g", SVG + "svg", SVG + "a", SVG + "switch")


def resolved(el, name: str, default=None):
    node = el
    while node is not None:
        v = node.get(name)
        if v is not None:
            return v
        node = node.getparent()
        if node is None or node.tag not in CONTAINERS:
            break
    return default


def to_num(v, default=0.0) -> float:
    if v is None:
        return default
    v = str(v).strip()
    for unit in ("px", "pt", "em", "user"):
        if v.endswith(unit):
            v = v[: -len(unit)]
            break
    if v in ("", "normal", "none", "auto", "inherit"):
        return default
    try:
        return float(v)
    except ValueError:
        return default


def num_to_str(v: float) -> str:
    s = f"{v:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("", "-0") else s


# --------------------------------------------------------------------------
# The actual outlining
# --------------------------------------------------------------------------


def layout(lf: LoadedFont, text: str, scale: float, letter_spacing: float,
           word_spacing: float):
    """-> (placements, total_advance) in user units, run-relative."""
    placements = []
    pen = 0.0
    shaped = lf.shape(text)
    for idx, (gname, adv, xoff, yoff) in enumerate(shaped):
        placements.append((gname, pen + xoff * scale, -yoff * scale))
        pen += adv * scale
        # word-spacing applies to the space character
        if idx < len(text) and text[idx] == " ":
            pen += word_spacing
        if idx < len(shaped) - 1 or TRAILING_LETTER_SPACING_IN_WIDTH:
            pen += letter_spacing
    return placements, pen


def outline_text(text_el) -> etree._Element | None:
    """Build a <path> replacing one <text> element."""
    content = "".join(text_el.itertext())
    if not content:
        return None

    font_family = resolved(text_el, "font-family", "sans-serif")
    font_size = to_num(resolved(text_el, "font-size", "16"), 16.0)
    fw = str(resolved(text_el, "font-weight", "400")).strip()
    try:
        weight = int(float(fw))
    except ValueError:
        weight = {"bold": 700, "bolder": 700, "lighter": 300}.get(fw, 400)
    letter_spacing = to_num(resolved(text_el, "letter-spacing", "0"), 0.0)
    word_spacing = to_num(resolved(text_el, "word-spacing", "0"), 0.0)
    anchor = (resolved(text_el, "text-anchor", "start") or "start").strip()

    lf = load_font(font_family, weight)
    scale = font_size / lf.upem

    x = to_num(text_el.get("x"), 0.0)
    y = to_num(text_el.get("y"), 0.0)

    placements, width = layout(lf, content, scale, letter_spacing, word_spacing)
    if anchor in ("middle", "center"):
        x -= width / 2.0
    elif anchor == "end":
        x -= width

    # SVG y grows down, font y grows up -> flip with scale(s, -s). Coordinates
    # are baked numerically (TransformPen), so the emitted <path> needs no
    # transform of its own.
    pen = SVGPathPen(lf.glyphset, ntos=num_to_str)
    for gname, dx, dy in placements:
        tpen = TransformPen(pen, Transform(scale, 0, 0, -scale, x + dx, y + dy))
        lf.glyphset[gname].draw(tpen)

    d = pen.getCommands()
    if not d.strip():
        return None

    path = etree.Element(SVG + "path")
    path.set("d", d)

    # Carry the paint across. fill is resolved through the ancestors because
    # these files set it on the <text> but could set it on the <g>.
    path.set("fill", resolved(text_el, "fill", "#000000"))
    for attr in ("fill-opacity", "fill-rule", "opacity", "stroke", "stroke-width",
                 "stroke-linecap", "stroke-linejoin", "stroke-opacity",
                 "transform", "clip-path", "mask", "filter"):
        v = text_el.get(attr)
        if v is not None:
            path.set(attr, v)
    # aria: the <text> carried the accessible string; keep it discoverable.
    if text_el.get("id"):
        path.set("id", text_el.get("id"))

    label = content if len(content) <= 40 else content[:37] + "..."
    path.addprevious(etree.Comment(f' outlined text: "{label}" '))
    return path


FONT_ATTRS_TO_STRIP = (
    "font-family",
    "font-size",
    "font-weight",
    "font-style",
    "font-stretch",
    "font-variant",
    "letter-spacing",
    "word-spacing",
    "text-anchor",
)


def convert(src_path: str, out_path: str) -> int:
    tree = etree.parse(src_path, etree.XMLParser(remove_blank_text=False))
    root = tree.getroot()

    n = 0
    for t in list(root.findall(".//" + SVG + "text")):
        path = outline_text(t)
        parent = t.getparent()
        idx = parent.index(t)
        tail = t.tail
        parent.remove(t)
        if path is not None:
            path.tail = tail
            parent.insert(idx, path)
            n += 1

    # Any element that only existed to carry font properties now carries dead
    # attributes -- including the synthetic font-weight="700". Strip them.
    for el in root.iter():
        if not isinstance(el.tag, str):
            continue
        if el.findall(".//" + SVG + "text"):
            continue
        for attr in FONT_ATTRS_TO_STRIP:
            if el.get(attr) is not None:
                del el.attrib[attr]

    tree.write(out_path, xml_declaration=False, encoding="utf-8", pretty_print=False)
    with open(out_path, "a") as fh:
        fh.write("\n")
    return n


def main() -> None:
    if hb is None:
        print(
            "WARNING: uharfbuzz not installed -- falling back to unkerned "
            "advances. Output will NOT be metrically exact. `pip install "
            "uharfbuzz`.",
            file=sys.stderr,
        )
    os.makedirs(OUT_DIR, exist_ok=True)
    for name in FILES:
        src = os.path.join(SRC_DIR, name)
        dst = os.path.join(OUT_DIR, name)
        with open(src, "rb") as fh:
            has_text = b"<text" in fh.read()
        if not has_text:
            shutil.copyfile(src, dst)
            print(f"{name:28s} copied verbatim (no <text>)")
            continue
        print(f"{name:28s} outlined {convert(src, dst)} text run(s)")


if __name__ == "__main__":
    main()
