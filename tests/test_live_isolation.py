"""The live layer never leaks into history — DECISIONS 116, plan §2.1 and §5.

The 2026 in-season marts are a parallel set in `data/marts/live/`. These tests
pin the wall between them and the frozen 1999-2025 marts: the frozen marts top
out at 2025 and keep their promised row counts; neither the frozen manifest nor
`etl/pins.toml` names a live asset; the mart resolvers (`conftest.DATA_DIRS`,
`web/lib/paths.ts SEARCH_DIRS`) cannot find a live file; and in the web source
only `web/lib/data/live.ts` may touch a live table.

Reads committed files only.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pandas as pd
import pytest

import conftest
from conftest import MARTS, REPO, find_mart

sys.path.insert(0, str(REPO))
from etl import config  # noqa: E402
from etl.live import config as lc  # noqa: E402

LIVE = MARTS / "live"
LIVE_TABLES = ("live_status", "live_team_perf", "live_team_money", "live_capplus",
               "live_team_week")
FINAL_SEASON = 2025

#: The frozen promise, restated literally so a change to config.EXPECTED_ROWS
#: has to be made twice, on purpose.
FROZEN_EXPECTED_ROWS = {
    "team_season_results": 861, "team_season_epa": 861, "team_season_cap": 416,
    "capplus_official": 416, "capplus_context": 416, "team_rating": 861,
    "team_season_stability": 830, "dead_money_team_season": 402,
    "dead_money_ledger": 21, "dead_money_display": 416, "dead_money_estimated": 128,
    "coaching_staff": 2612, "league_cap": 32, "draft_pick": 6644,
    "position_allocation": 3744,
}

#: The ONLY web source files allowed to reference a live table (Drizzle `s.live*`
#: or a `live_*` table name). App surfaces — the live team page, the share and OG
#: variants, the home toggle — read live data through the functions this module
#: exports, never through the tables. Add a file here only with a DECISIONS entry.
WEB_LIVE_ALLOWLIST = {"web/lib/data/live.ts"}
#: All-time / multi-season accessors that must never see a live row, not even
#: through live.ts (plan §4 "explicitly not shown").
WEB_NO_LIVE_IMPORT = ("web/lib/data/seasons.ts", "web/lib/data/league.ts",
                      "web/lib/data/compare.ts", "web/lib/data/metrics.ts")

_DRIZZLE_LIVE = re.compile(r"\b(?:s|schema)\.live[A-Z]\w*")
_TABLE_LIVE = re.compile(r"\b(?:" + "|".join(LIVE_TABLES) + r")\b")
_IMPORT_LIVE = re.compile(r"""from\s+['"](?:@/lib/data/live|\./live)['"]""")


def _frozen_csvs() -> list[Path]:
    return sorted(MARTS.glob("*.csv"))


# ==========================================================================
# The frozen marts
# ==========================================================================
@pytest.mark.parametrize("path", _frozen_csvs(), ids=lambda p: p.stem)
def test_frozen_marts_top_out_at_2025(path):
    df = pd.read_csv(path, low_memory=False)
    for col in ("season", "year"):
        if col in df.columns:
            mx = int(pd.to_numeric(df[col], errors="coerce").max())
            assert mx <= FINAL_SEASON, f"{path.name}: {col} reaches {mx} — live rows leaked"
    assert "in_season_live" not in path.read_text(encoding="utf-8"), (
        f"{path.name} carries the live badge")


def test_expected_rows_and_windows_are_unchanged():
    assert config.EXPECTED_ROWS == FROZEN_EXPECTED_ROWS
    assert not any(k.startswith("live") for k in config.EXPECTED_ROWS)
    assert config.PERF_WINDOW == (1999, FINAL_SEASON)
    assert config.TIER2_WINDOW == (2013, FINAL_SEASON)
    assert config.EXCLUDED_SEASON == lc.LIVE_SEASON == FINAL_SEASON + 1


def test_capplus_official_never_carries_the_live_badge():
    off = pd.read_csv(MARTS / "capplus_official.csv")
    assert "in_season_live" not in set(off["badge"])
    assert set(off["badge"]) <= set(config.CAPPLUS_BADGES)


def test_frozen_manifest_and_pins_name_no_live_asset():
    for p in (config.MANIFEST, REPO / "etl" / "pins.toml"):
        text = p.read_text(encoding="utf-8")
        for needle in ("data/marts/live", f"play_by_play_{lc.LIVE_SEASON}",
                       "live_pins", *LIVE_TABLES):
            assert needle not in text, f"{p.relative_to(REPO)} mentions {needle!r}"


def test_live_pins_are_their_own_file():
    assert lc.LIVE_PINS != REPO / "etl" / "pins.toml"
    assert lc.LIVE_MARTS_DIR == LIVE
    assert lc.LIVE_MANIFEST == LIVE / "manifest.json" != config.MANIFEST


# ==========================================================================
# Resolvers cannot reach a live file
# ==========================================================================
def test_conftest_data_dirs_exclude_live():
    assert LIVE not in conftest.DATA_DIRS
    assert all("live" not in Path(d).parts for d in conftest.DATA_DIRS)
    for t in LIVE_TABLES:
        assert find_mart(t) is None, f"conftest.find_mart resolves {t}"


def test_web_search_dirs_exclude_live():
    paths_ts = REPO / "web" / "lib" / "paths.ts"
    if not paths_ts.exists():
        pytest.fail("web/lib/paths.ts is missing")
    text = paths_ts.read_text(encoding="utf-8")
    m = re.search(r"export const SEARCH_DIRS\s*=\s*\[([^\]]*)\]", text)
    assert m, "SEARCH_DIRS not found in web/lib/paths.ts"
    # A separate LIVE_DIR constant for the seed is fine; it must not be searched.
    assert "live" not in m.group(1).lower(), f"SEARCH_DIRS includes a live dir: {m.group(1)}"


# ==========================================================================
# Web source scan
# ==========================================================================
def _web_sources() -> list[Path]:
    web = REPO / "web"
    files = sorted((web / "lib" / "data").glob("*.ts"))
    files += sorted(p for p in (web / "app").rglob("*") if p.suffix in (".ts", ".tsx"))
    return files


def test_only_the_allowlist_references_live_tables():
    files = _web_sources()
    assert files, "no web sources found to scan"
    offenders = []
    for p in files:
        rel = str(p.relative_to(REPO))
        if rel in WEB_LIVE_ALLOWLIST:
            continue
        text = p.read_text(encoding="utf-8")
        hits = sorted(set(_DRIZZLE_LIVE.findall(text)) | set(_TABLE_LIVE.findall(text)))
        if hits:
            offenders.append(f"{rel}: {hits}")
    assert not offenders, (
        "live tables referenced outside web/lib/data/live.ts — read them through "
        "live.ts:\n  " + "\n  ".join(offenders))


@pytest.mark.parametrize("rel", WEB_NO_LIVE_IMPORT)
def test_all_time_accessors_never_import_live(rel):
    p = REPO / rel
    if not p.exists():
        pytest.fail(f"{rel} is missing")
    assert not _IMPORT_LIVE.search(p.read_text(encoding="utf-8")), (
        f"{rel} imports the live accessors; all-time and multi-season views are final-only")


# ==========================================================================
# The live package itself
# ==========================================================================
def test_live_package_reuses_only_context_from_the_frozen_pipeline():
    for p in sorted((REPO / "etl" / "live").glob("*.py")):
        text = p.read_text(encoding="utf-8")
        for m in re.finditer(r"from \.\.pipeline import ([^\n]+)", text):
            assert m.group(1).strip() == "Context", f"{p.name} imports {m.group(1)}"
        # The frozen orchestrator is never imported whole, so `etl.pipeline.run`
        # (which rewrites manifest.json and pins.toml) is unreachable from here.
        assert not re.search(r"from \.\. import [^\n]*\bpipeline\b", text), p.name
        assert not re.search(r"^\s*(?:import etl\.pipeline|from etl(?:\.pipeline)? import)",
                             text, re.M), p.name
        for banned in ("pins.write(", "_write_manifest(",
                       "config.MANIFEST.write", "base.MANIFEST.write"):
            assert banned not in text, f"etl/live/{p.name} calls {banned}"


def test_data_raw_is_empty_at_rest():
    raw = REPO / "data" / "raw"
    assert not raw.exists() or not any(p.is_file() for p in raw.iterdir())
