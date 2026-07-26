"""ETL orchestrator — `python -m etl.pipeline [--mart NAME]`.

Runs every mart, or one. Each mart module is **idempotent and byte-stable**: it
overwrites its output in full and produces byte-identical bytes on re-run given
identical inputs (`ARCHITECTURE.md` §4.3, `DECISIONS.md` 6). `--check-stable`
proves it by building each mart twice and diffing.

Writes `data/marts/manifest.json`: for each mart, its row count, its column list,
its md5, and a note naming the **source data versions** it consumed.

**There is no wall-clock anywhere in the manifest.** A timestamp is the classic
way to break byte-stability, and byte-stability is what makes the CI golden tests
meaningful. What identifies a build is the data it read — season windows, input
row counts, the resolved dead-money snapshot dates, the configured tier — not
when it ran.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from . import capplus, coaching, config, contracts, curated, deadmoney, draft
from . import io_utils, performance


# --------------------------------------------------------------------------- #
# run context — how a mart reports what it read
# --------------------------------------------------------------------------- #
@dataclass
class Context:
    verbose: bool = True
    download: bool = False
    stats: dict = field(default_factory=dict)
    _sources: list = field(default_factory=list)

    def note_source(self, name: str, *, rows: int | None = None,
                    window: str | None = None) -> None:
        """Record an input's *data version* — never a timestamp."""
        entry = {"source": name}
        if rows is not None:
            entry["rows"] = int(rows)
        if window is not None:
            entry["window"] = window
        self._sources.append(entry)

    def take_sources(self) -> list:
        out, self._sources = self._sources, []
        return out


# --------------------------------------------------------------------------- #
# mart registry — order is dependency order
# --------------------------------------------------------------------------- #
@dataclass
class Mart:
    name: str
    builder: object
    filename: str | None = None
    directory: str = "marts"
    aliases: tuple = ()
    note: str = ""

    @property
    def path(self) -> Path:
        base = config.MARTS if self.directory == "marts" else config.CURATED
        return base / (self.filename or f"{self.name}.csv")


MARTS = [
    # --- Tier 1 performance backbone ---------------------------------------
    Mart("team_season_results", performance.mart_team_season_results,
         note="SPEC §7.1 — 861 rows, grain (season, team)"),
    Mart("team_season_epa", performance.mart_team_season_epa,
         note="SPEC §7.2 — 861 rows, REG only, play_type IN ('pass','run')"),
    # --- curated context ----------------------------------------------------
    Mart("league_cap", curated.mart_league_cap,
         note="SPEC §7.11 — 32 rows, 1994-2025, 2010 NULL"),
    # --- Tier 2 economics ---------------------------------------------------
    Mart("team_season_cap", contracts.mart_team_season_cap,
         note="SPEC §7.3 — 416 rows, 2013-2025, dead-money columns always null"),
    Mart("player_season_cap", contracts.mart_player_season_cap,
         aliases=("player_cap",),
         note="SPEC §7.9 — player-season cap detail 2013-2025 + ledger markers"),
    Mart("position_allocation", contracts.mart_position_allocation,
         aliases=("positional_allocation",),
         note="SPEC §7.12 / §2.6 — team-season x nine position groups, 2013+"),
    # --- dead money ---------------------------------------------------------
    Mart("dead_money_team_season", deadmoney.mart_dead_money_team_season,
         note="SPEC §7.5 — 370 dated snapshots + the derived license_tier"),
    Mart("dead_money_ledger", deadmoney.mart_dead_money_ledger,
         note="SPEC §7.6 — 21 verified individual charges"),
    Mart("dead_money_snapshot_resolution",
         deadmoney.mart_dead_money_snapshot_resolution,
         aliases=("snapshot_resolution",),
         note="the pinned same-stage rule's chosen date+stage per season"),
    Mart("dead_money_display", deadmoney.mart_dead_money_display,
         note="416 render-ready rows; four blank seasons explicit"),
    # --- Cap+ ---------------------------------------------------------------
    Mart("capplus_official", capplus.mart_capplus_official, aliases=("capplus",),
         note="SPEC §7.4 — 288 rows, nine seasons, gate #1 promotion"),
    Mart("team_rating", capplus.mart_team_rating,
         note='SPEC §2.3 — "Team Rating (performance only)", all 861 team-seasons'),
    # --- coaching -----------------------------------------------------------
    Mart("coaching_staff", coaching.mart_coaching_staff,
         note="SPEC §7.7 — 2,612 rows, ERA-CORRECT codes + surrogate coach_id"),
    Mart("team_season_stability", coaching.mart_team_season_stability,
         aliases=("stability_index", "stability"),
         note="SPEC §2.8 — 830 rows, Stability Index"),
    Mart("regime_events", coaching.mart_regime_events, aliases=("regimes",),
         note="SPEC §7.7 — HC identity changes + dated s+1/s+2 dead-money links"),
    # --- draft --------------------------------------------------------------
    Mart("fitzgerald_spielberger_chart", draft.mart_fitzgerald_spielberger_chart,
         directory="curated", aliases=("fs_chart",),
         note="curated — the published F-S chart, per-row citation"),
    Mart("draft_pick", draft.mart_draft_pick, aliases=("draft_capital", "draft"),
         note="SPEC §7.8 — 6,644 picks 2000-2025, car_av excluded"),
    Mart("draft_class_summary", draft.mart_draft_class_summary,
         note="SPEC §7.8 — capital spent vs realized return per team-class"),
]

MART_BY_NAME = {}
for _m in MARTS:
    MART_BY_NAME[_m.name] = _m
    for _a in _m.aliases:
        MART_BY_NAME[_a] = _m

#: Verified, not rewritten. `capplus_candidates.csv` is a 69-column backtest
#: artefact the app never reads (`DECISIONS.md` 54); re-emitting it would risk
#: regressing the evidence record for no product gain. The pipeline instead
#: recomputes the recommended columns from scratch and asserts they still
#: reproduce the committed file exactly.
VERIFIERS = {"capplus_candidates": capplus.verify_capplus_candidates}


# --------------------------------------------------------------------------- #
# run
# --------------------------------------------------------------------------- #
def _describe(df: pd.DataFrame, path: Path, sources: list, note: str) -> dict:
    return {
        "file": str(path.relative_to(config.REPO)),
        "rows": int(len(df)),
        "n_columns": int(len(df.columns)),
        "columns": [str(c) for c in df.columns],
        "md5": io_utils.md5_file(path),
        "contract": note,
        "source_data": sources,
    }


def run(selected: list[str] | None = None, *, verbose: bool = True,
        download: bool = False, check_stable: bool = False) -> dict:
    ctx = Context(verbose=verbose, download=download)
    targets = MARTS if not selected else []
    if selected:
        seen = set()
        for name in selected:
            m = MART_BY_NAME.get(name)
            if m is None and name in VERIFIERS:
                continue  # handled below, in the verify pass
            if m is None:
                raise SystemExit(
                    f"unknown mart {name!r}. Known: "
                    f"{', '.join(sorted(MART_BY_NAME))}")
            if m.name not in seen:
                seen.add(m.name)
                targets.append(m)
        targets.sort(key=lambda m: MARTS.index(m))

    manifest_marts: dict = {}
    unstable: list[str] = []

    for m in targets:
        t0 = time.time()
        if verbose:
            print(f"\n== {m.name} ==")
        df = m.builder(ctx)
        path = io_utils.write_csv(df, m.path)
        digest = io_utils.md5_file(path)

        if check_stable:
            df2 = m.builder(ctx)
            tmp = path.with_suffix(".stability-check")
            io_utils.write_csv(df2, tmp)
            second = io_utils.md5_file(tmp)
            tmp.unlink()
            ctx.take_sources()  # the second pass's notes are duplicates
            if second != digest:
                unstable.append(m.name)
                print(f"  !! NOT BYTE-STABLE: {digest} != {second}")
            elif verbose:
                print(f"  byte-stable on re-run ({digest})")

        manifest_marts[m.name] = _describe(df, path, ctx.take_sources(), m.note)
        if verbose:
            print(f"  wrote {path.relative_to(config.REPO)}  "
                  f"({len(df)} rows x {len(df.columns)} cols, md5 {digest[:12]}…, "
                  f"{time.time() - t0:.1f}s)")

    # Verified-not-rewritten artefacts.
    verified: dict = {}
    if not selected or any(n in VERIFIERS for n in selected):
        for name, fn in VERIFIERS.items():
            if selected and name not in selected:
                continue
            if verbose:
                print(f"\n== {name} (verify) ==")
            res = fn(ctx)
            p = config.MARTS / f"{name}.csv"
            verified[name] = {
                "file": str(p.relative_to(config.REPO)),
                "md5": io_utils.md5_file(p),
                "mode": "verified_not_rewritten",
                **res,
            }

    io_utils.assert_raw_empty()

    manifest = {
        "product": "YIELD/YARD",
        "phase": "BUILD_PLAN.md Phase 1 — ETL hardening, marts finalisation",
        "generated_by": "python -m etl.pipeline",
        "note": (
            "No wall-clock timestamps: this manifest identifies a build by the "
            "source data it read, not when it ran, so re-running the ETL on "
            "unchanged inputs produces a byte-identical manifest."
        ),
        "data_version": _data_version(ctx),
        "runtime_config": {
            "DEAD_MONEY_TIER": config.DEAD_MONEY_TIER,
            "license_tiers_shipped": sorted(config.LICENSE_TIERS_ALLOWED),
            "IMAGE_MIN_WIDTH_PX": config.IMAGE_MIN_WIDTH_PX,
            "TEAMMARK_KILLSWITCH": config.TEAMMARK_KILLSWITCH,
            "IMAGE_TREATMENT_MODE": config.IMAGE_TREATMENT_MODE,
            "LAMBDA_DEAD": config.LAMBDA_DEAD,
            "COST_FLOOR_Q": config.COST_FLOOR_Q,
        },
        "marts": manifest_marts,
        "verified_not_rewritten": verified,
        "checks": ctx.stats,
    }
    if not selected:
        _write_manifest(manifest)
    elif config.MANIFEST.exists():
        prev = json.loads(config.MANIFEST.read_text())
        prev["marts"].update(manifest_marts)
        prev["verified_not_rewritten"].update(verified)
        prev["checks"].update(ctx.stats)
        prev["data_version"] = manifest["data_version"]
        prev["runtime_config"] = manifest["runtime_config"]
        _write_manifest(prev)
        manifest = prev

    if unstable:
        raise SystemExit(f"BYTE-STABILITY FAILED for: {', '.join(unstable)}")
    return manifest


def _data_version(ctx: Context) -> dict:
    """What identifies this build: the data, not the clock."""
    dv = {
        "perf_window": f"{config.PERF_WINDOW[0]}-{config.PERF_WINDOW[1]}",
        "tier2_window": f"{config.TIER2_WINDOW[0]}-{config.TIER2_WINDOW[1]}",
        "coaching_window": f"{config.COACHING_WINDOW[0]}-{config.COACHING_WINDOW[1]}",
        "draft_window": f"{config.DRAFT_WINDOW[0]}-{config.DRAFT_WINDOW[1]}",
        "league_cap_window": f"{config.LEAGUE_CAP_WINDOW[0]}-{config.LEAGUE_CAP_WINDOW[1]}",
        "excluded_season": config.EXCLUDED_SEASON,
    }
    dm = ctx.stats.get("dead_money_display")
    if dm:
        dv["dead_money_covered_seasons"] = dm["covered_seasons"]
        dv["dead_money_blank_seasons"] = dm["blank_seasons"]
        dv["dead_money_snapshots"] = {
            str(s["season"]): f"{s['asof_date']} ({s['asof_stage']}, {s['badge']})"
            for s in dm["snapshots"]
        }
    cp = ctx.stats.get("capplus")
    if cp:
        dv["capplus_seasons"] = cp["seasons"]
    return dv


def _write_manifest(manifest: dict) -> None:
    config.MARTS.mkdir(parents=True, exist_ok=True)
    config.MANIFEST.write_text(
        json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #
def main(argv=None) -> int:
    ap = argparse.ArgumentParser(
        prog="python -m etl.pipeline",
        description="Build the YIELD/YARD marts (SPEC.md §7).")
    ap.add_argument("--mart", action="append", default=None, metavar="NAME",
                    help="build one mart (repeatable). BUILD_PLAN aliases work: "
                         "stability_index, draft_capital, positional_antipattern "
                         "-> see --list")
    ap.add_argument("--list", action="store_true", help="list marts and exit")
    ap.add_argument("--download", action="store_true",
                    help="fallback: download each remote file, load it, delete it")
    ap.add_argument("--check-stable", action="store_true",
                    help="build each mart twice and diff (byte-stability proof)")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args(argv)

    if args.list:
        for m in MARTS:
            alias = f"  (aliases: {', '.join(m.aliases)})" if m.aliases else ""
            print(f"{m.name:<32} {m.note}{alias}")
        for name in VERIFIERS:
            print(f"{name:<32} verified, not rewritten")
        return 0

    verbose = not args.quiet
    t0 = time.time()
    manifest = run(args.mart, verbose=verbose, download=args.download,
                   check_stable=args.check_stable)
    if verbose:
        print("\n== manifest ==")
        for name, m in sorted(manifest["marts"].items()):
            print(f"  {name:<34} {m['rows']:>6} rows  {m['n_columns']:>3} cols  "
                  f"{m['md5']}")
        for name, m in sorted(manifest["verified_not_rewritten"].items()):
            print(f"  {name:<34} {'':>6}        {'':>3}       {m['md5']}  (verified)")
        print("\ndata/raw/ empty: PASS")
        print(f"total {time.time() - t0:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
