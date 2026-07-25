#!/usr/bin/env python3
"""Fetch the 32 current-franchise TeamMark logos. Nothing is ever hotlinked.

    python3 assets/fetch_teammarks.py [--force] [--dry-run]

Reads
    data/curated/staging/teams_colors_logos.csv   (re-fetched if absent)
    data/curated/staging/support_team_colors.csv  (colours + computed glyph)

Writes
    public/assets/teammarks/{ABBR}.png            32 self-hosted logos
    public/assets/teammarks/manifest.json         the asset set + kill-switch record
    public/assets/teammarks/chipdata.json         fallback-chip data, zero design judgment

Context
    SPEC.md          §5.1  TeamMark, TEAM_LOGOS_ENABLED, computed glyph colour
    ARCHITECTURE.md  §5    asset pipeline, records (team, variant, source_url,
                           fetched_at, sha256)
    RISKS.md         risk 2  takedown response plan -- see assets/README.md

Kill-switch note. The app-facing boolean is `TEAM_LOGOS_ENABLED` and it lives in
`etl/config.py`; this script does not own it and does not read it. The manifest
records the asset set so the purge step of the takedown runbook has an exact,
machine-readable list of what to delete -- that is all `killswitch: false` in
the manifest means here.
"""

from __future__ import annotations

import argparse
import csv
import io
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import (  # noqa: E402
    PUBLIC_ASSETS, ROOT, STAGING, FetchError, Pacer, ext_for_content_type, http_get,
    human_bytes, make_session, read_json, sha256_bytes, utcnow, write_bytes_atomic,
    write_json,
)

# The nflverse source for colour, conference and division. teams.csv carries
# none of the three (SPEC.md §5.1).
COLORS_LOGOS_URL = (
    "https://raw.githubusercontent.com/nflverse/nflfastR-data/master/"
    "teams_colors_logos.csv"
)
COLORS_LOGOS_CSV = STAGING / "teams_colors_logos.csv"
TEAM_COLORS_CSV = STAGING / "support_team_colors.csv"

OUT_DIR = PUBLIC_ASSETS / "teammarks"
MANIFEST = OUT_DIR / "manifest.json"
CHIPDATA = OUT_DIR / "chipdata.json"

# The TeamMark primary asset. team_logo_espn is a 500px square PNG and is the
# only one of the four logo columns that resolves cleanly from this network;
# the other variants are recorded (see VARIANT_COLUMNS) but not fetched, so a
# follow-up pass can pick them up without re-deriving anything.
PRIMARY_COLUMN = "team_logo_espn"
VARIANT_COLUMNS = ("team_logo_squared", "team_wordmark", "team_logo_wikipedia")

# Three retries after the first attempt, per the pipeline's failure rule.
MAX_ATTEMPTS = 4

# Logos are ~40 KB each; 32 of them cannot approach the ceiling. The guard is
# kept anyway so both fetchers fail the same way.
DISK_ABORT_BYTES = 100 * 1024 * 1024


def log(msg: str = "") -> None:
    print(msg, flush=True)


def normalize_raw_github(url: str) -> str:
    """github.com/<o>/<r>/raw/<rest>  ->  raw.githubusercontent.com/<o>/<r>/<rest>.

    The redirect form 403s through the outbound proxy; the direct raw host
    serves the identical bytes. Mechanical rewrite, no content change.
    """
    prefix = "https://github.com/"
    if url.startswith(prefix) and "/raw/" in url:
        owner_repo, rest = url[len(prefix):].split("/raw/", 1)
        return f"https://raw.githubusercontent.com/{owner_repo}/{rest}"
    return url


def load_colors_logos(session, pacer, *, refetch: bool) -> list[dict]:
    """teams_colors_logos.csv from staging, re-fetching to staging if absent."""
    if COLORS_LOGOS_CSV.exists() and not refetch:
        log(f"  teams_colors_logos.csv present: {COLORS_LOGOS_CSV}")
        text = COLORS_LOGOS_CSV.read_text(encoding="utf-8")
    else:
        log(f"  re-fetching {COLORS_LOGOS_URL}")
        resp = http_get(session, COLORS_LOGOS_URL, pacer=pacer,
                        max_attempts=MAX_ATTEMPTS, log=log)
        text = resp.text
        COLORS_LOGOS_CSV.parent.mkdir(parents=True, exist_ok=True)
        COLORS_LOGOS_CSV.write_text(text, encoding="utf-8")
        log(f"  wrote {COLORS_LOGOS_CSV}")
    return list(csv.DictReader(io.StringIO(text)))


def load_team_colors() -> dict[str, dict]:
    """support_team_colors.csv keyed by canonical franchise code.

    `team` is already normalized (STL/LAR -> LA, OAK -> LV, SD -> LAC), so its
    distinct values ARE the canonical 32. The 36 rows collapse to 32 and the
    duplicates are byte-identical on the colour columns.
    """
    rows = list(csv.DictReader(TEAM_COLORS_CSV.open(encoding="utf-8")))
    out: dict[str, dict] = {}
    for r in rows:
        code = r["team"].strip()
        if code in out:
            continue
        out[code] = r
    return out


def build() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true",
                    help="re-download logos that are already on disk")
    ap.add_argument("--refetch-source", action="store_true",
                    help="re-fetch teams_colors_logos.csv even if staged")
    ap.add_argument("--dry-run", action="store_true",
                    help="resolve and report, download nothing")
    args = ap.parse_args()

    session = make_session()
    pacer = Pacer()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    log("== TeamMark fetch ==")
    logos_rows = load_colors_logos(session, pacer, refetch=args.refetch_source)
    colors = load_team_colors()
    canonical = sorted(colors)
    log(f"  canonical franchises: {len(canonical)}")

    by_abbr = {r["team_abbr"].strip(): r for r in logos_rows}
    missing = [c for c in canonical if c not in by_abbr]
    if missing:
        log(f"  !! not in teams_colors_logos.csv: {missing}")

    # Colour cross-check between the two staged sources. A mismatch means one
    # of them drifted and the chip would disagree with the logo file.
    mismatches = []
    for code in canonical:
        row = by_abbr.get(code)
        if not row:
            continue
        for src_col, chip_col in (("team_color", "primary"), ("team_color2", "secondary")):
            a = (row[src_col] or "").strip().lower()
            b = (colors[code][chip_col] or "").strip().lower()
            if a != b:
                mismatches.append((code, src_col, a, b))
    if mismatches:
        log(f"  !! colour mismatch vs support_team_colors.csv: {mismatches}")
    else:
        log("  colour cross-check vs support_team_colors.csv: PASS (32/32)")

    prev = read_json(MANIFEST) or {}
    prev_teams = prev.get("teams", {})

    entries: dict[str, dict] = {}
    fetched = skipped = failed = 0
    total_bytes = 0

    log(f"\n  fetching {PRIMARY_COLUMN} for {len(canonical)} teams -> {OUT_DIR}")
    for code in canonical:
        row = by_abbr.get(code)
        if row is None:
            entries[code] = {
                "abbr": code, "file": None, "source_url": None,
                "status": "fetch_failed",
                "error": "team_abbr absent from teams_colors_logos.csv",
                "fetched_note": "no source row; TeamMark falls back to the chip",
            }
            failed += 1
            continue

        source_url = normalize_raw_github((row[PRIMARY_COLUMN] or "").strip())
        variants = {
            col: normalize_raw_github((row.get(col) or "").strip()) or None
            for col in VARIANT_COLUMNS
        }

        carried = prev_teams.get(code)
        if (not args.force and carried and carried.get("status") == "ok"
                and carried.get("file")
                and (OUT_DIR / carried["file"]).exists()
                and carried.get("source_url") == source_url):
            entries[code] = carried
            total_bytes += carried.get("bytes", 0)
            skipped += 1
            continue

        if args.dry_run:
            log(f"    {code:4s} DRY  {source_url}")
            continue

        try:
            resp = http_get(session, source_url, pacer=pacer,
                            max_attempts=MAX_ATTEMPTS, log=log)
        except FetchError as exc:
            log(f"    {code:4s} FAIL {exc}")
            entries[code] = {
                "abbr": code,
                "team_name": row.get("team_name") or None,
                "file": None,
                "source_url": source_url,
                "source_column": PRIMARY_COLUMN,
                "variants_available": variants,
                "status": "fetch_failed",
                "error": str(exc)[:300],
                "fetched_note": (
                    "download exhausted 3 retries; recorded, never silently absent. "
                    "TeamMark renders the fallback chip for this abbr until re-run."
                ),
            }
            failed += 1
            continue

        data = resp.content
        ext = ext_for_content_type(resp.headers.get("Content-Type", ""), fallback=".png")
        filename = f"{code}{ext}"
        write_bytes_atomic(OUT_DIR / filename, data)
        total_bytes += len(data)
        fetched += 1

        entries[code] = {
            "abbr": code,
            "team_name": row.get("team_name") or None,
            "file": filename,
            "source_url": source_url,
            "source_column": PRIMARY_COLUMN,
            "content_type": (resp.headers.get("Content-Type") or "").split(";")[0],
            "bytes": len(data),
            "sha256": sha256_bytes(data),
            "fetched_at": utcnow(),
            "status": "ok",
            "variants_available": variants,
            "fetched_note": (
                "Self-hosted from the nflverse teams_colors_logos source URL, "
                "served untransformed from our own origin. Never hotlinked. "
                "Variants listed under variants_available are recorded, not fetched."
            ),
        }
        log(f"    {code:4s} ok   {len(data) / 1024:7.1f} KB  {filename}")

        if total_bytes > DISK_ABORT_BYTES:
            log(f"  !! ABORT: {human_bytes(total_bytes)} exceeds the ceiling")
            return 2

    if args.dry_run:
        log("\n  dry run -- nothing written")
        return 0

    manifest = {
        "asset_set": "teammarks",
        "generated_by": "assets/fetch_teammarks.py",
        "generated_at": utcnow(),
        "source_dataset": "nflverse teams_colors_logos",
        "source_dataset_url": COLORS_LOGOS_URL,
        "source_dataset_staged": COLORS_LOGOS_CSV.relative_to(ROOT).as_posix(),
        "primary_variant": PRIMARY_COLUMN,
        "hotlinked": False,
        "teams_expected": len(canonical),
        "teams_ok": sum(1 for e in entries.values() if e.get("status") == "ok"),
        "teams_fetch_failed": sum(
            1 for e in entries.values() if e.get("status") == "fetch_failed"),
        "total_bytes": total_bytes,
        # --- kill-switch record -------------------------------------------
        # false = the asset set is live. The app-facing flag is elsewhere;
        # this block exists so the purge step is mechanical, not improvised.
        "killswitch": False,
        "killswitch_detail": {
            "app_flag": "TEAM_LOGOS_ENABLED",
            "app_flag_location": "etl/config.py",
            "app_flag_note": (
                "This manifest does NOT control rendering. Flipping the app flag "
                "to false is step 1 of the RISKS.md risk 2 runbook; this manifest "
                "is the machine-readable inventory step 2 purges."
            ),
            "purge_targets": [
                "public/assets/teammarks/*.png",
                "public/assets/teammarks/*.svg",
            ],
            "purge_keep": [
                "public/assets/teammarks/manifest.json",
                "public/assets/teammarks/chipdata.json",
            ],
            "cdn_invalidate_paths": ["/assets/teammarks/*"],
            "fallback_source": "public/assets/teammarks/chipdata.json",
            "fallback_behaviour": (
                "Every TeamMark renders the typographic chip: team abbreviation "
                "on the team's primary colour, glyph colour computed "
                "black-or-white by relative luminance. No redesign, no page breaks."
            ),
            "runbook": "RISKS.md risk 2 -- transcribed verbatim in assets/README.md",
        },
        "colour_cross_check": {
            "against": "data/curated/staging/support_team_colors.csv",
            "mismatches": [
                {"abbr": a, "column": c, "teams_colors_logos": x, "support_team_colors": y}
                for (a, c, x, y) in mismatches
            ],
        },
        "teams": {code: entries[code] for code in canonical if code in entries},
    }
    write_json(MANIFEST, manifest)
    log(f"\n  wrote {MANIFEST}")

    # ---- chipdata.json: everything the fallback chip needs, nothing else.
    chips = []
    for code in canonical:
        c = colors[code]
        chips.append({
            "abbr": code,
            "team_name": (by_abbr.get(code) or {}).get("team_name") or None,
            "conf": c["conf"],
            "division": c["division"],
            "primary": c["primary"],
            "secondary": c["secondary"],
            "glyph": c["best_glyph_on_primary"],
            "glyph_contrast": float(c["glyph_contrast"]),
            "pair_contrast": float(c["pair_contrast"]),
        })
    worst = min(chips, key=lambda x: x["glyph_contrast"])
    chipdata = {
        "asset_set": "teammark_chipdata",
        "generated_by": "assets/fetch_teammarks.py",
        # No timestamp by design. chipdata is pure derived reference data --
        # colours in, chips out, no fetch involved -- so it is byte-stable and a
        # diff means the colour source actually moved. It is also the file the
        # takedown runbook depends on surviving a purge; keeping it noise-free
        # keeps that dependency visible in review.
        "source": "data/curated/staging/support_team_colors.csv",
        "note": (
            "Complete TeamMark fallback-chip data. `glyph` is the black-or-white "
            "glyph colour computed from the relative luminance of `primary` -- it "
            "is NOT `secondary`, and must not be 'simplified' to it: 15 of 36 "
            "colour rows have primary/secondary contrast below 3.0 and 6 are below "
            "2.0, so a secondary-colour glyph is illegible for those teams. "
            "`pair_contrast` is carried only as the evidence for that rule."
        ),
        "wcag": {
            "rule": "glyph on primary, computed by relative luminance",
            "worst_case_abbr": worst["abbr"],
            "worst_case_contrast": worst["glyph_contrast"],
            "all_at_least_aa": all(x["glyph_contrast"] >= 4.5 for x in chips),
        },
        "teams_count": len(chips),
        "teams": chips,
    }
    write_json(CHIPDATA, chipdata)
    log(f"  wrote {CHIPDATA}")

    log("\n== summary ==")
    log(f"  fetched      {fetched}")
    log(f"  skipped      {skipped}  (already on disk; --force to redo)")
    log(f"  fetch_failed {failed}")
    log(f"  teammarks    {manifest['teams_ok']}/{len(canonical)}")
    log(f"  disk         {human_bytes(total_bytes)}")
    log(f"  chip WCAG    worst {worst['abbr']} {worst['glyph_contrast']} "
        f"(all >= AA: {chipdata['wcag']['all_at_least_aa']})")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(build())
