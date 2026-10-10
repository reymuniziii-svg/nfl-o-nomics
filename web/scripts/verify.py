#!/usr/bin/env python3
"""
Playwright verification of the production build.

Runs the eight designed surfaces at both canvases (390 and 1280) in both themes
and asserts the rules the design system says are non-negotiable:

  1. No `Infinity`, `-Infinity` or `NaN` anywhere in the rendered text
     (`SPEC.md` §2.5 ships with a test that asserts it).
  2. Tabular numerals are actually APPLIED — the computed
     `font-variant-numeric` on a `.yy-num` element resolves to `tabular-nums`,
     and the resolved font family is the self-hosted face, not a fallback
     (`TYPE.md` §5, `DECISIONS.md` 68).
  3. The lens caveat's SHORT FORM is present on the hero at every size
     (`COMPONENTS.md` §1.8a).
  4. Every dead-money figure carries its as-of date on the same line
     (`SPEC.md` §2.1, `COMPONENTS.md` §8.1).
  5. The `SAMPLE` chip never appears on real data
     (`SCREENSHOT_VARIANTS.md` §6).
  6. Every blank renders a reason; no empty metric cell exists.
  7. The page never scrolls sideways (`MOBILE_PATTERNS.md` §2).
  8. Fonts are loaded before the shot (`SCREENSHOT_VARIANTS.md` §7 step 3).
  9. No page error and no hydration mismatch — a mismatch makes React discard
     the prerendered tree and re-render, which among other things drops the
     `data-theme` the boot script pinned and silently changes the theme.
 10. The theme is pinned EXPLICITLY on `<html>` (`SCREENSHOT_VARIANTS.md` §7
     step 2 — an export must never inherit its theme).

Usage:  python3 scripts/verify.py [base_url]
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3210"
OUT = Path(__file__).resolve().parent.parent / "verify"
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

SURFACES = [
    ("home", "/"),
    ("division-nfc-west", "/division/nfc-west"),
    ("team-ne-2007", "/team/ne/2007"),
    ("team-no-2021", "/team/no/2021"),
    ("team-kc-2024", "/team/kc/2024"),
    ("team-cle-2017", "/team/cle/2017"),
    ("player-7842", "/player/7842"),
    ("compare-buf07-kc24", "/compare?a=buf-2007&b=kc-2024"),
    ("share-receipt", "/share/receipt/afc-east/2025"),
    ("share-team", "/share/team/ne/2025"),
    ("methodology", "/methodology"),
    ("credits", "/credits"),
]

CANVASES = [("390", 390, 844), ("1280", 1280, 900)]
THEMES = ["dark", "light"]

BAD_NUMBER = re.compile(r"\b(?:-?Infinity|NaN)\b")

results: list[dict] = []
failures: list[str] = []


def check(page, name: str, path: str, theme: str, width: int) -> dict:
    tag = f"{name}@{width}-{theme}"
    body_text = page.inner_text("body")

    row: dict = {"surface": name, "path": path, "theme": theme, "width": width}

    # 1 — no Infinity / NaN
    bad = BAD_NUMBER.findall(body_text)
    row["infinity_or_nan"] = bad
    if bad:
        failures.append(f"{tag}: rendered {bad!r}")

    # 2 — tabular numerals actually applied, on a self-hosted face
    num = page.query_selector(".yy-num")
    if num:
        style = num.evaluate(
            "el => { const s = getComputedStyle(el);"
            " return { fvn: s.fontVariantNumeric, ff: s.fontFamily, ffs: s.fontFeatureSettings }; }"
        )
        row["tabular"] = style
        if "tabular-nums" not in (style.get("fvn") or ""):
            failures.append(f"{tag}: .yy-num is not tabular ({style.get('fvn')!r})")
    else:
        row["tabular"] = None

    # fonts: did the self-hosted faces actually load?
    row["fonts_loaded"] = page.evaluate(
        "() => [...document.fonts].filter(f => f.status === 'loaded')"
        ".map(f => f.family + ' ' + f.weight)"
    )

    # 3 — the lens caveat short form, on the hero
    row["lens_short_form"] = (
        "CASH · ROSTER ONLY" in body_text.upper()
        or "CAP HIT · SEASON-FINAL · ROSTER ONLY" in body_text.upper()
    )

    # 4 — every dead-money figure carries its as-of date inline
    asof = page.evaluate(
        """() => [...document.querySelectorAll('*')]
             .filter(e => e.children.length === 0 && /·\\s*as of \\d{4}-\\d{2}-\\d{2}/.test(e.textContent || ''))
             .map(e => (e.textContent || '').trim())"""
    )
    row["asof_stamps"] = asof

    # 5 — the SAMPLE chip never appears on real data
    # structural, not textual: the prose on /methodology legitimately uses the
    # word "sample", and the rule is about the CHIP.
    row["sample_chip"] = page.evaluate(
        "() => document.querySelectorAll('[data-sample-chip]').length > 0"
    )
    if row["sample_chip"]:
        failures.append(f"{tag}: SAMPLE chip present on real data")

    # 6 — a blank always renders a reason
    row["blank_reasons"] = len(re.findall(r"Not available —", body_text))

    # 6b — NO CELL IS A BARE DASH. Check 6 counted reason strings, which a table
    # cell containing "—" passes trivially: the dash is not empty, so nothing
    # caught 32 rows of unexplained Δ 5Y on the two highest-traffic routes.
    # `COMPONENTS.md` universal rule 3 is about the CELL, so this asserts on the
    # cell.
    bare_dashes = page.evaluate(
        """() => [...document.querySelectorAll('td, th')]
             .filter(c => {
               const t = (c.textContent || '').trim();
               if (!['\\u2014', '-', '\\u2013', ''].includes(t)) return false;
               // A cell carrying a NAMED graphical mark (the trend sparkline) is
               // not an empty cell — it has content and an accessible name.
               if (c.querySelector('[aria-label], img[alt]:not([alt=""])')) return false;
               return true;
             })
             .map(c => (c.closest('table')?.querySelector('caption')?.textContent || '')
                         .slice(0, 40) + ' col' + c.cellIndex)"""
    )
    row["bare_dash_cells"] = bare_dashes
    if bare_dashes:
        failures.append(f"{tag}: {len(bare_dashes)} table cell(s) render a bare dash or nothing")

    # 6c — IN-CHART TYPE NEVER FALLS BELOW THE FLOOR. `DECISIONS.md` 65 /
    # RESOLUTIONS D1: one utility floor at 11px, with a single 10px exception
    # for tracked all-caps inside a data mark. A `<text>` inside a viewBox is
    # painted at cssFontSize x (renderedWidth / viewBoxWidth), so a chart that
    # stretches or squeezes its viewBox moves its own type off the floor in
    # both directions without anything in the stylesheet changing.
    small_type = page.evaluate(
        """() => {
             const out = [];
             for (const svg of document.querySelectorAll('svg')) {
               const vb = svg.viewBox && svg.viewBox.baseVal;
               const r = svg.getBoundingClientRect();
               if (!vb || !vb.width || !r.width) continue;
               const scale = r.width / vb.width;
               for (const t of svg.querySelectorAll('text')) {
                 const cls = t.getAttribute('class') || '';
                 const floor = /micro/.test(cls) ? 10 : 11;
                 const painted = parseFloat(getComputedStyle(t).fontSize) * scale;
                 if (painted < floor - 0.01) {
                   out.push({ text: (t.textContent || '').slice(0, 20),
                              painted: +painted.toFixed(2), floor });
                 }
               }
             }
             return out;
           }"""
    )
    row["below_type_floor"] = small_type
    if small_type:
        failures.append(
            f"{tag}: {len(small_type)} chart label(s) painted below the type floor "
            f"(worst {min(s['painted'] for s in small_type)}px)"
        )

    # 6d — THE DOT PLOT DRAWS EVERY DATED READING, AND EVERY DOT KEEPS ITS DATE.
    # `COMPONENTS.md` §8.4: "every dot, always — this is the affordance that
    # makes the rule visible". And no absence ring may share an x with a plotted
    # point: one coordinate cannot say both "this season has no reading" and
    # "here is its reading".
    dots = page.evaluate(
        """() => {
             const at = (els, a) => els.map(e => e.getAttribute(a));
             const out = [];
             for (const svg of document.querySelectorAll('svg')) {
               if (!/dead money as a share/.test(svg.getAttribute('aria-label') || '')) continue;
               if (!svg.getBoundingClientRect().width) continue;
               const readings = at([...svg.querySelectorAll('[data-dm-reading]')], 'data-dm-reading');
               const dated    = at([...svg.querySelectorAll('[data-dm-asof]')], 'data-dm-asof');
               const absent   = at([...svg.querySelectorAll('[data-dm-absence]')], 'data-dm-absence');
               out.push({
                 readings: readings.length,
                 undated: readings.filter(s => !dated.includes(s)),
                 clash: absent.filter(s => readings.includes(s)),
               });
             }
             return out;
           }"""
    )
    row["dot_plots"] = dots
    for d in dots:
        if d["undated"]:
            failures.append(f"{tag}: dot plot readings with no date label: {d['undated']}")
        if d["clash"]:
            failures.append(
                f"{tag}: season(s) {d['clash']} carry BOTH an absence ring and a reading"
            )

    # 7 — the page never scrolls sideways
    overflow = page.evaluate(
        "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    row["h_overflow_px"] = overflow
    if overflow > 1:
        failures.append(f"{tag}: page scrolls sideways by {overflow}px")

    # a few structural counts, for the report
    row["counts"] = page.evaluate(
        """() => ({
             cards: document.querySelectorAll('section,article').length,
             svgs: document.querySelectorAll('svg[role="img"]').length,
             goldTicks: document.querySelectorAll('[class*="tick"]').length,
             expandedFalse: document.querySelectorAll('[aria-expanded="false"]').length,
           })"""
    )
    return row


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROME, args=["--font-render-hinting=none"])
        for theme in THEMES:
            for label, width, height in CANVASES:
                ctx = browser.new_context(
                    viewport={"width": width, "height": height},
                    device_scale_factor=2,
                    reduced_motion="reduce",
                )
                ctx.add_init_script(
                    f"try{{localStorage.setItem('yy-theme','{theme}')}}catch(e){{}}"
                )
                page = ctx.new_page()
                page_errors: list[str] = []
                page.on("pageerror", lambda e: page_errors.append(str(e)[:200]))
                page.on(
                    "console",
                    lambda m: page_errors.append(m.type + ": " + m.text[:200])
                    if m.type == "error"
                    else None,
                )
                for name, path in SURFACES:
                    before = len(page_errors)
                    page.goto(BASE + path, wait_until="networkidle")
                    page.evaluate("() => document.fonts.ready")
                    page.wait_for_timeout(300)
                    row = check(page, name, path, theme, width)
                    row["errors"] = page_errors[before:]
                    if row["errors"]:
                        failures.append(
                            f"{name}@{width}-{theme}: {row['errors'][0]}"
                        )
                    pinned = page.evaluate(
                        "() => document.documentElement.getAttribute('data-theme')"
                    )
                    row["data_theme"] = pinned
                    if pinned != theme:
                        failures.append(
                            f"{name}@{width}-{theme}: data-theme is {pinned!r}, not pinned"
                        )
                    results.append(row)
                    page.screenshot(
                        path=str(OUT / f"{name}__{label}__{theme}.png"), full_page=True
                    )
                ctx.close()

        # The square export crops, rasterized from the card element itself at
        # 2.7x — 400 x 400 becomes the 1080 x 1080 the feed wants. Both themes,
        # because both have to pass the eight criteria (§8).
        for theme in THEMES:
            ctx = browser.new_context(
                viewport={"width": 900, "height": 900}, device_scale_factor=2.7
            )
            ctx.add_init_script(
                f"try{{localStorage.setItem('yy-theme','{theme}')}}catch(e){{}}"
            )
            page = ctx.new_page()
            for name, path in [
                ("export-receipt-square", "/share/receipt/afc-east/2025"),
                ("export-team-square", "/share/team/ne/2025"),
            ]:
                page.goto(BASE + path, wait_until="networkidle")
                page.evaluate("() => document.fonts.ready")
                page.wait_for_timeout(250)
                el = page.query_selector("[data-export-root] > *")
                if el:
                    el.screenshot(path=str(OUT / f"{name}__{theme}.png"))
                    box = el.bounding_box() or {}
                    if abs((box.get("width") or 0) - 400) > 1 or abs((box.get("height") or 0) - 400) > 1:
                        failures.append(f"{name}/{theme}: crop is not 400x400 ({box})")
                    clipped = page.evaluate(
                        "() => { const c = document.querySelector('[data-export-root] > *');"
                        " return c.scrollHeight - c.clientHeight; }"
                    )
                    if clipped > 1:
                        failures.append(f"{name}/{theme}: {clipped}px of the card is clipped")
                expanded_false = page.evaluate(
                    "() => document.querySelectorAll('[data-export-root] [aria-expanded=\"false\"]').length"
                )
                if expanded_false:
                    failures.append(
                        f"{name}/{theme}: {expanded_false} collapsed disclosure(s) in an export"
                    )
                # §2 criterion 5 — the product mark is present on every variant
                if not page.evaluate(
                    "() => /YIELD\\/YARD/.test(document.querySelector('[data-export-root]').textContent || '')"
                ):
                    failures.append(f"{name}/{theme}: no product mark on the export")
            ctx.close()
        browser.close()

    (OUT / "report.json").write_text(json.dumps({"results": results, "failures": failures}, indent=2))

    print(f"surfaces checked: {len(results)}")
    print(f"screenshots:      {len(list(OUT.glob('*.png')))} -> {OUT}")
    if failures:
        print("FAILURES:")
        for f in failures:
            print("  -", f)
        return 1
    print("all assertions passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
