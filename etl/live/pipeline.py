"""`python -m etl.live build [--check-stable]` — the live marts.

Its own registry (`LIVE_MARTS`), its own manifest
(`data/marts/live/manifest.json`), its own pins (`etl/live/live_pins.toml`).
It never calls `etl.pipeline.run` and never writes `data/marts/*.csv`,
`data/marts/manifest.json` or `etl/pins.toml`: the build fingerprints those
files before and after and fails if one byte moved (plan §2.1 and naive-build
trap 14).

Every mart is a pure function of the pin file. Inputs are read only through
the pins: the pbp file must hash to the pinned sha256, or — when nflverse has
re-uploaded since — its closed-week slice must hash to the pinned slice hash;
games.csv is read at the pinned commit and must hash to the pinned sha256. No
wall clock reaches any output.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd

from .. import config as base
from .. import io_utils
from ..pipeline import Context
from . import config as lc
from . import perf, resolve


# --------------------------------------------------------------------------- #
# inputs, read through the pins
# --------------------------------------------------------------------------- #
@dataclass
class LiveInputs:
    pins: dict
    schedule: pd.DataFrame
    pbp_path: Path
    note: str = ""

    def connect(self):
        return resolve.pbp_connect(self.pbp_path)


def load_inputs(pins: dict, *, verbose: bool = True) -> LiveInputs:
    pb, gm, lv = pins["pbp"], pins["games"], pins["live"]
    asof, cancelled = int(lv["asof_week"]), list(lv.get("cancelled_games", []))

    gpath = resolve.cached(gm["sha256"], ".csv")
    if gpath is None:
        gpath, sha = resolve.download(gm["url"], ".csv")
        if sha != gm["sha256"]:
            raise AssertionError(f"games.csv @{gm['commit_sha'][:12]} hashes {sha}, "
                                 f"pin says {gm['sha256']}")
    schedule = resolve.read_schedule(gpath)

    note = "pbp read at the pinned sha256"
    ppath = resolve.cached(pb["sha256"], ".parquet")
    if ppath is None:
        ppath, sha = resolve.download(lc.PBP_URL, ".parquet")
        if sha != pb["sha256"]:
            note = (f"nflverse re-uploaded the pbp asset (now sha256 {sha[:12]}…); "
                    "its closed-week slice is verified against the pin instead")
    verify_slices(pins, schedule, ppath)
    if verbose:
        print(f"  inputs: {note}; slices verified "
              f"(pbp {pb['slice_rows']} plays, games {gm['slice_rows']} rows)")
    return LiveInputs(pins, schedule, ppath, note)


def verify_slices(pins: dict, schedule: pd.DataFrame, pbp_path: Path) -> None:
    lv = pins["live"]
    con = resolve.pbp_connect(pbp_path)
    got = resolve.slice_hashes(schedule, con, int(lv["asof_week"]),
                               lv.get("cancelled_games", []))
    if got["pbp_slice_sha256"] != pins["pbp"]["slice_sha256"]:
        raise AssertionError("pbp closed-week slice differs from the pin — nflverse "
                             "restated a closed week; run `python -m etl.live resolve`")
    if got["games_slice_sha256"] != pins["games"]["slice_sha256"]:
        raise AssertionError("schedule slice differs from the pin")


# --------------------------------------------------------------------------- #
# registry
# --------------------------------------------------------------------------- #
@dataclass
class LiveMart:
    name: str
    note: str

    @property
    def path(self) -> Path:
        return lc.LIVE_MARTS_DIR / f"{self.name}.csv"


LIVE_MARTS = [
    LiveMart("live_team_perf", "SPEC §7.14 — 32 rows (0 before week 4), grain (season, "
                               "team); results, raw + adjusted EPA, P_live, Team Rating live"),
    LiveMart("live_status", "SPEC §7.14 — 1 row: as-of week, pins, whole-season states"),
    LiveMart("live_capplus", "SPEC §7.14 — 0 rows while gated (capplus_state = 'blank')"),
]
#: Documented, not built in this pass (plan §6 items 10-12).
LIVE_NOT_BUILT = {
    "live_team_money": "written only by `python -m etl.live freeze-money` (plan §1.4), "
                       "which is not built yet; every money field in live_status is null",
}
for _m in LIVE_MARTS:
    if lc.LIVE_MARTS_DIR not in _m.path.parents:
        raise AssertionError(f"{_m.name} would write outside {lc.LIVE_MARTS_DIR}")


def build_frames(inputs: LiveInputs, *, verbose: bool = True) -> tuple[dict, dict]:
    """Every live mart from one set of inputs. Pure: no file is written."""
    lv = inputs.pins["live"]
    con = inputs.connect()
    tp, stats = perf.build_live_team_perf(
        inputs.schedule, con, asof_week=int(lv["asof_week"]),
        asof_date=lv.get("asof_date") or "", cancelled=lv.get("cancelled_games", []),
        verbose=verbose)
    st = perf.build_live_status(inputs.pins, inputs.schedule, tp)
    cp = perf.build_live_capplus(st)
    frames = {"live_team_perf": tp, "live_status": st, "live_capplus": cp}
    _cross_check(frames)
    return frames, stats


def _cross_check(frames: dict) -> None:
    st = frames["live_status"].iloc[0]
    tp = frames["live_team_perf"]
    if len(tp) and set(tp["asof_week"]) != {int(st["asof_week"])}:
        raise AssertionError("live marts disagree on asof_week")
    if len(frames["live_capplus"]) and st["capplus_state"] == "blank":
        raise AssertionError("Cap+ rows exist while capplus_state is blank")


# --------------------------------------------------------------------------- #
# the frozen history must not move
# --------------------------------------------------------------------------- #
def _frozen_paths() -> list[Path]:
    return sorted(base.MARTS.glob("*.csv")) + [base.MANIFEST,
                                               base.REPO / "etl" / "pins.toml"]


def frozen_fingerprint() -> dict:
    return {str(p.relative_to(base.REPO)): io_utils.md5_file(p)
            for p in _frozen_paths() if p.exists()}


# --------------------------------------------------------------------------- #
# run
# --------------------------------------------------------------------------- #
def write_frames(frames: dict, out_dir: Path) -> dict:
    out = {}
    for m in LIVE_MARTS:
        p = io_utils.write_csv(frames[m.name], Path(out_dir) / f"{m.name}.csv")
        out[m.name] = io_utils.md5_file(p)
    return out


def run(*, check_stable: bool = False, verbose: bool = True, pins: dict | None = None) -> dict:
    pins = pins or resolve.read_pins()
    if pins is None:
        raise SystemExit(f"{lc.LIVE_PINS} is missing — run `python -m etl.live resolve` first")
    before = frozen_fingerprint()
    ctx = Context(verbose=verbose)
    lv = pins["live"]
    if verbose:
        print(f"== live {lv['season']} through week {lv['asof_week']} ({lv['asof_date'] or '-'}) ==")
    inputs = load_inputs(pins, verbose=verbose)
    frames, stats = build_frames(inputs, verbose=verbose)
    digests = write_frames(frames, lc.LIVE_MARTS_DIR)

    unstable = []
    if check_stable:
        frames2, _ = build_frames(load_inputs(pins, verbose=False), verbose=False)
        tmp = lc.LIVE_MARTS_DIR / ".stability-check"
        try:
            second = write_frames(frames2, tmp)
        finally:
            for p in sorted(tmp.glob("*")):
                p.unlink()
            if tmp.exists():
                tmp.rmdir()
        unstable = [n for n in digests if digests[n] != second[n]]
        if verbose:
            print("  byte-stable on re-run" if not unstable else f"  !! NOT BYTE-STABLE: {unstable}")

    ctx.note_source(f"nflverse {lc.PBP_ASSET}", asset="pbp",
                    rows=int(pins["pbp"]["slice_rows"]),
                    window=f"{lv['season']} REG weeks 1-{lv['asof_week']}")
    ctx.note_source(f"nfldata {lc.GAMES_PATH} @ {pins['games']['commit_sha']}", asset="games",
                    rows=int(pins["games"]["slice_rows"]),
                    window=f"{lv['season']} REG schedule; scores through week {lv['asof_week']}")
    sources = ctx.take_sources()
    manifest = {
        "product": "YIELD/YARD",
        "layer": "live — the 2026 in-season tier (DECISIONS 116, SPEC §1.1, §7.14)",
        "generated_by": "python -m etl.live build",
        "note": ("No wall-clock timestamps: every byte here is a function of "
                 "etl/live/live_pins.toml. These marts never join the frozen "
                 "1999-2025 marts in data/marts/."),
        "season": int(lv["season"]),
        "asof_week": int(lv["asof_week"]),
        "asof_date": lv.get("asof_date") or None,
        "pins": {
            "pbp_sha256": pins["pbp"]["sha256"],
            "pbp_slice_sha256": pins["pbp"]["slice_sha256"],
            "pbp_asset_updated_at": pins["pbp"]["updated_at"],
            "games_commit_sha": pins["games"]["commit_sha"],
            "games_slice_sha256": pins["games"]["slice_sha256"],
        },
        "runtime_config": {
            "LIVE_PERF_MIN_WEEK": lc.LIVE_PERF_MIN_WEEK,
            "LIVE_CAPPLUS_MIN_WEEK": lc.LIVE_CAPPLUS_MIN_WEEK,
            "LIVE_MIN_SCRIM_PLAYS": lc.LIVE_MIN_SCRIM_PLAYS,
            "LIVE_ADJ_MAX_SHIFT": lc.LIVE_ADJ_MAX_SHIFT,
            "LIVE_ADJ_MIN_CORR": lc.LIVE_ADJ_MIN_CORR,
            "LIVE_CANCELLED_GAMES": sorted(lc.LIVE_CANCELLED_GAMES),
            "PERF_EPA_INPUT": base.PERF_EPA_INPUT,
        },
        "marts": {
            m.name: {
                "file": str(m.path.relative_to(base.REPO)),
                "rows": int(len(frames[m.name])),
                "n_columns": int(len(frames[m.name].columns)),
                "columns": [str(c) for c in frames[m.name].columns],
                "md5": digests[m.name],
                "contract": m.note,
                "source_data": sources,
            } for m in LIVE_MARTS
        },
        "not_built": LIVE_NOT_BUILT,
        "checks": stats,
    }
    lc.LIVE_MANIFEST.write_text(
        json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8")

    io_utils.assert_raw_empty()
    after = frozen_fingerprint()
    if after != before:
        moved = sorted(k for k in set(before) | set(after) if before.get(k) != after.get(k))
        raise AssertionError(f"the live build touched frozen files: {moved}")
    if unstable:
        raise SystemExit(f"BYTE-STABILITY FAILED for: {', '.join(unstable)}")
    if verbose:
        for m in LIVE_MARTS:
            print(f"  wrote {m.path.relative_to(base.REPO)}  "
                  f"({len(frames[m.name])} rows, md5 {digests[m.name][:12]}…)")
        print("  frozen marts, manifest.json and etl/pins.toml untouched; data/raw/ empty")
    return manifest
