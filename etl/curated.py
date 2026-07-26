"""Curated passthrough marts.

`ARCHITECTURE.md` §1: curated CSVs with per-row citations are a first-class input
alongside the nflverse releases, and `data/marts/` is *the contract surface* the
app reads. These marts republish the already-final curated files into that
surface unchanged, so the app never has to know which of its inputs came from a
release and which from a transcription.

**The curated files themselves are never rewritten by ETL.** They are the source
of record, they carry the per-row citations, and `audit/build_deadmoney_curated.py`
is the script that produced them.
"""

from __future__ import annotations

import pandas as pd

from . import config, io_utils


def mart_league_cap(ctx) -> pd.DataFrame:
    """`league_cap` — 32 rows, 1994-2025 (`SPEC.md` §7.11).

    **2010 is NULL — the uncapped year, no denominator exists**, and any view
    that divides by `cap_usd` must handle it explicitly. 2011 is stored exact at
    $120,375,000 (NFL Ops rounds to $120.0M).
    """
    out = io_utils.read_csv(config.CURATED / "league_cap.csv")
    io_utils.assert_rows(out, "league_cap")
    lo, hi = config.LEAGUE_CAP_WINDOW
    if int(out["year"].min()) != lo or int(out["year"].max()) != hi:
        raise AssertionError(f"league_cap window drifted: "
                             f"{out['year'].min()}-{out['year'].max()}")
    uncapped = out.loc[out["cap_usd"].isna(), "year"].tolist()
    if uncapped != [2010]:
        raise AssertionError(f"expected exactly 2010 to be uncapped, got {uncapped}")
    if int(out.loc[out["year"] == 2011, "cap_usd"].iloc[0]) != 120_375_000:
        raise AssertionError("league_cap 2011 must be exact at $120,375,000")
    if out["source_url"].isna().any():
        raise AssertionError("league_cap: every row carries a citation")
    out = io_utils.as_int64(out, ["year", "cap_usd"])
    ctx.note_source("curated league_cap.csv (per-row citations)", rows=len(out),
                    window=f"{lo}-{hi}")
    if ctx.verbose:
        print(f"  {len(out)} cap years {lo}-{hi}; 2010 NULL (uncapped); "
              f"2011 exact at $120,375,000")
    return out
