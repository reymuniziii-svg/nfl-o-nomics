"""Cap+ — `capplus_official` and `team_rating`. SPEC.md §2.2, §2.3, §7.4.

**GATE #1 CLEARED 2026-07-25.** Rey approved the `CAPPLUS_MEMO.md` §7 build; it is
the shipping formula, not a recommendation (`DECISIONS.md` 61). This module runs
the promotion `BUILD_PLAN.md` Phase 1 item 5 describes.

```
Cap+ = (100 + 15 × P) ÷ R
R    = team cost ÷ league-average cost, floored at the season's 25th percentile
cost = (cap charged to rostered players + 1.5 × dead money) ÷ league cap
```

The maths is **imported, not re-derived**: `build_performance`,
`recommended_columns` and `calibrate` come straight out of
`audit/capplus_backtest.py`, which is the artefact the memo's every `[new]`
figure reproduces from. Re-implementing them here would be a second
implementation of an approved formula, which is exactly the kind of drift the
audit record exists to prevent. This module supplies the assembly, the same-stage
dead-money input, the badge, the ranks and the invariant assertions.

Implementation rules, all mandatory, all asserted below rather than described:

* **One snapshot per season**, all 32 teams (`DECISIONS.md` 15). 2018 has two
  full-league tables; the later one (2018-07-14) is used.
* **The floor applies to COST, and the league average is taken AFTER it**
  (`DECISIONS.md` 14), so `mean(R)` is exactly 1.000 every season and `R = 1.00`
  still reads as "league-average cost". Eight of 32 are floored by construction.
* **Calibration**: demeaned within season so each season's mean is exactly
  100.000, then divided by ONE single pooled within-season SD across the whole
  window, so the pooled SD is exactly 15.000 and individual seasons are free to
  be tighter or wider.
* **Nine seasons, 288 rows.** 2013/2016/2020/2021 have **no rows** — blanking is
  whole-season (`DECISIONS.md` 16). The blank reason string is approved launch
  copy and lives in `config.BLANK_REASON_NO_DM_TABLE`.
* **2014 and 2019 ship badged `provisional`** — their tables were published
  before the league year opened.
* **`cost_rec` is a COST INDEX and is never labelled "% of cap used"** — at
  λ=1.5, 44.1% of team-seasons exceed 1.00 — so the plain `cap_consumed_rec`
  publishes beside it (`DECISIONS.md` 17).

`team_rating` is the 1999-2012 fallback and the 2014-2025 overlay. Its name is
**"Team Rating (performance only)"** and it is *never* called "Cap+ (performance
only)" — to a reader that is still Cap+ (`DECISIONS.md` 18).
"""

from __future__ import annotations

import sys

import numpy as np
import pandas as pd

from . import config, deadmoney, io_utils
from .team_codes import assert_full_32, normalize_series

# The audit package has no __init__.py (it is a frozen evidence record and is
# never modified), so it is imported by path.
if str(config.AUDIT) not in sys.path:
    sys.path.insert(0, str(config.AUDIT))
import capplus_backtest as bt  # noqa: E402  (audit/capplus_backtest.py)

#: Sniff values from CAPPLUS_MEMO.md §3.1, asserted at build time.
SNIFF = [
    (2023, "SF", 133.9, 1),
    (2022, "CHI", 77.2, 31),
    (2024, "DEN", 104.4, 13),
    (2014, "NE", 118.4, 3),
    (2017, "PHI", 114.7, 7),
    (2017, "CLE", 72.9, 32),
    (2022, "ATL", 89.5, 27),
    (2019, "KC", 122.6, 3),
    (2025, "NO", 85.7, 27),
    (2023, "LA", 95.2, 20),
]
SNIFF_TOL = 0.05  # index points — the memo's own reconciliation tolerance


# --------------------------------------------------------------------------- #
# inputs
# --------------------------------------------------------------------------- #
def load_perf() -> pd.DataFrame:
    res = io_utils.read_csv(config.MARTS / "team_season_results.csv")
    epa = io_utils.read_csv(config.MARTS / "team_season_epa.csv")
    for f in (res, epa):
        f["team"] = normalize_series(f["team"]).astype("object")
    perf = res.merge(
        epa[["season", "team", "off_epa_per_play", "def_epa_per_play",
             "epa_margin_per_play"]],
        on=["season", "team"], how="inner", validate="1:1")
    if len(perf) != len(res) != config.EXPECTED_ROWS["team_season_results"]:
        raise AssertionError(f"perf join lost rows: {len(perf)}")
    perf["point_diff_per_game"] = perf["point_diff"] / perf["games"]
    return perf


def load_cap() -> pd.DataFrame:
    cap = io_utils.read_csv(config.MARTS / "team_season_cap.csv")
    cap["team"] = normalize_series(cap["team"]).astype("object")
    return cap


# --------------------------------------------------------------------------- #
# the build
# --------------------------------------------------------------------------- #
def build(*, verbose: bool = True) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    perf = load_perf()
    cap = load_cap()
    dm = deadmoney.load_team_season()
    same, snap = deadmoney.resolve_same_stage(dm)

    # Cross-check the deliberate copy in etl/deadmoney.py against the frozen
    # audit original. Only possible on the full tier — the audit function
    # asserts the nine-season tuple, which is the point of the check.
    if config.DEAD_MONEY_TIER == "full":
        raw = io_utils.read_csv(config.CURATED / "dead_money_team_season.csv")
        raw["team"] = normalize_series(raw["team"]).astype("object")
        audit_same, _ = bt.resolve_dead_money_same_stage(raw)
        merged = same.merge(audit_same, on=["season", "team"], how="outer",
                            suffixes=("", "_audit"))
        if len(merged) != len(same) or len(merged) != len(audit_same):
            raise AssertionError("same-stage resolution disagrees with the audit")
        if not np.allclose(merged["dead_money_rec"], merged["dead_money_rec_audit"]):
            raise AssertionError("same-stage dead money disagrees with the audit")
        if (merged["dm_rec_asof_date"] != merged["dm_rec_asof_date_audit"]).any():
            raise AssertionError("same-stage as-of dates disagree with the audit")

    # ---- performance composite P (equal weights, within-season z) ----------
    d = bt.build_performance(perf, bt.WEIGHTS[bt.DEFAULT_W])
    d = d.merge(cap[["season", "team", "cap_used_total", "league_cap",
                     "cash_spent_total"]],
                on=["season", "team"], how="left", validate="1:1")
    d = d.merge(same[["season", "team", "dead_money_rec", "dm_rec_asof_date",
                      "dm_rec_asof_stage", "license_tier"]],
                on=["season", "team"], how="left", validate="1:1")
    d["perf_index"] = config.INDEX_MEAN + config.INDEX_SD * d["P"]
    d["rec_computable"] = (d["season"].between(*config.TIER2_WINDOW)
                           & d["dead_money_rec"].notna())

    # Plain cap consumed, unweighted — published BESIDE the cost index so the
    # weighted figure is never read as "% of cap used" (memo condition 4).
    m = d["rec_computable"]
    d["cap_consumed_rec"] = np.nan
    d.loc[m, "cap_consumed_rec"] = (
        (d.loc[m, "cap_used_total"] + d.loc[m, "dead_money_rec"]) / d.loc[m, "league_cap"])

    # ---- the approved build ------------------------------------------------
    d = bt.recommended_columns(d, config.LAMBDA_DEAD, floor_q=config.COST_FLOOR_Q,
                               apply_floor=True)

    # ---- ranks -------------------------------------------------------------
    d["perf_season_rank"] = d.groupby("season")["perf_index"].rank(
        ascending=False, method="min")
    d["capplus_season_rank"] = np.nan
    d.loc[m, "capplus_season_rank"] = d[m].groupby("season")["capplus_rec"].rank(
        ascending=False, method="min")

    d = d.merge(snap[["season", "badge", "median_dead_money_usd"]], on="season",
                how="left")

    _assert_invariants(d, m)

    # ---- capplus_official (SPEC.md §7.4) ----------------------------------
    off = d[m].rename(columns={
        "capplus_rec": "capplus",
        "dm_rec_asof_date": "dm_asof_date",
        "dm_rec_asof_stage": "dm_asof_stage",
        "rec_floored": "was_floored",
        "capplus_season_rank": "season_rank",
        "median_dead_money_usd": "league_median_dead_money_usd",
    })[[
        "season", "team", "capplus", "perf_index", "P",
        "cost_rec", "cap_consumed_rec", "cost_floor", "R_rec", "was_floored",
        "dead_money_rec", "dm_asof_date", "dm_asof_stage",
        "league_median_dead_money_usd", "license_tier", "badge", "season_rank",
    ]].sort_values(["season", "team"]).reset_index(drop=True)

    off = io_utils.round_cols(off, {
        "capplus": 6, "perf_index": 6, "P": 6, "cost_rec": 6,
        "cap_consumed_rec": 6, "cost_floor": 6, "R_rec": 6,
        "dead_money_rec": 0, "league_median_dead_money_usd": 0,
    })
    off = io_utils.as_int64(off, ["dead_money_rec", "league_median_dead_money_usd",
                                  "season_rank"])
    off["was_floored"] = off["was_floored"].astype(bool)

    # ---- team_rating: ALL 861 team-seasons, 1999-2025 ---------------------
    tr = d.rename(columns={"perf_season_rank": "season_rank"})[
        ["season", "team", "perf_index", "P", "season_rank"]
    ].sort_values(["season", "team"]).reset_index(drop=True)
    tr = io_utils.round_cols(tr, {"perf_index": 6, "P": 6})
    tr = io_utils.as_int64(tr, ["season_rank"])

    io_utils.assert_rows(tr, "team_rating")
    assert_full_32(tr["team"], "team_rating")

    stats = _check_official(off, verbose=verbose)
    stats["snapshots"] = snap[["season", "asof_date", "asof_stage", "badge"]].to_dict(
        "records")
    return off, tr, stats


def _assert_invariants(d: pd.DataFrame, m: pd.Series) -> None:
    """The approved build's invariants, asserted rather than described.
    Lifted from `audit/capplus_backtest.build_recommended`."""
    avg = d[m].groupby("season")["R_rec"].mean().to_numpy()
    if not np.allclose(avg, 1.0):
        raise AssertionError("R_rec: league average is not 1.000")
    n_fl = d[m].groupby("season")["rec_floored"].sum()
    if not (n_fl == config.FLOORED_TEAMS_PER_SEASON).all():
        raise AssertionError(
            f"the 25th-pct floor must bind for {config.FLOORED_TEAMS_PER_SEASON} "
            f"of 32 teams, got {sorted(set(n_fl))}")
    if not np.allclose(d[m].groupby("season")["capplus_rec"].mean().to_numpy(),
                       config.INDEX_MEAN):
        raise AssertionError("capplus_rec: season mean is not exactly 100")
    cal = d[m]["capplus_rec"]
    dev = cal - d[m].groupby("season")["capplus_rec"].transform("mean")
    pooled = np.sqrt((dev ** 2).sum() / (len(cal) - d[m]["season"].nunique()))
    if abs(pooled - config.INDEX_SD) >= 1e-9:
        raise AssertionError(f"capplus_rec: pooled within-season SD is {pooled}")
    # P is a within-season z by construction.
    if not np.allclose(d.groupby("season")["P"].mean().to_numpy(), 0.0, atol=1e-9):
        raise AssertionError("P: within-season mean is not 0")
    if not np.allclose(d.groupby("season")["P"].std(ddof=1).to_numpy(), 1.0, atol=1e-9):
        raise AssertionError("P: within-season SD is not 1")


def _check_official(off: pd.DataFrame, *, verbose: bool) -> dict:
    seasons = tuple(int(s) for s in sorted(off["season"].unique()))
    # Row count is tier-dependent by design: this is the licensing contingency
    # (`RISKS.md` risk 1). Under the shipping tier it is the contracted 288 over
    # nine seasons; under the SAFE-only reversal Cap+ survives for 2014-2015
    # only, exactly as `DATA_AUDIT.md` §5 quantifies. Both are 32 teams/season.
    if len(off) != 32 * len(seasons):
        raise AssertionError(
            f"capplus_official: {len(off)} rows is not 32 x {len(seasons)} seasons")
    if config.DEAD_MONEY_TIER == "full":
        io_utils.assert_rows(off, "capplus_official")
        if seasons != config.CAPPLUS_SEASONS:
            raise AssertionError(f"capplus_official seasons changed: {seasons}")
    for s in config.CAPPLUS_BLANK_SEASONS:
        if s in seasons:
            raise AssertionError(f"{s} must have NO rows in capplus_official")
    for s in off["season"].unique():
        n = (off["season"] == s).sum()
        if n != 32:
            raise AssertionError(f"{s}: {n} teams in capplus_official, expected 32")
    assert_full_32(off["team"], "capplus_official")
    # Every Cap+ row carries a non-null dm_asof — a row without it is a bug.
    if off["dm_asof_date"].isna().any() or (off["dm_asof_date"] == "").any():
        raise AssertionError("a capplus_official row has no dm_asof_date")
    if off["dm_asof_stage"].isna().any():
        raise AssertionError("a capplus_official row has no dm_asof_stage")
    prov = sorted(off.loc[off["badge"] == "provisional", "season"].unique())
    if config.DEAD_MONEY_TIER == "full" and tuple(prov) != config.CAPPLUS_PROVISIONAL_SEASONS:
        raise AssertionError(f"provisional badge seasons changed: {prov}")
    if not off["badge"].isin(("provisional", "preseason", "in_season")).all():
        raise AssertionError("badge vocabulary drifted")
    if int(off["was_floored"].sum()) != config.FLOORED_TEAMS_PER_SEASON * len(seasons):
        raise AssertionError("floored-team count drifted")

    # The memo's sniff values were reconciled against the SHIPPING build. Under
    # the SAFE-only licensing reversal the index is recalibrated over two
    # seasons and the memo's numbers no longer apply — that is the contingency
    # working, not a regression, so the check runs on the full tier only.
    sniff = []
    for season, team, want_v, want_r in (SNIFF if config.DEAD_MONEY_TIER == "full"
                                         else []):
        r = off[(off["season"] == season) & (off["team"] == team)]
        if r.empty:
            raise AssertionError(f"sniff case missing: {season} {team}")
        got_v = float(r.iloc[0]["capplus"])
        got_r = int(r.iloc[0]["season_rank"])
        ok = abs(got_v - want_v) < SNIFF_TOL and got_r == want_r
        sniff.append({"season": season, "team": team, "expected": want_v,
                      "got": round(got_v, 1), "expected_rank": want_r,
                      "rank": got_r, "pass": ok})
        if not ok:
            raise AssertionError(
                f"CAPPLUS_MEMO sniff failed: {season} {team} "
                f"got {got_v:.1f} (#{got_r}), expected {want_v} (#{want_r})")
    if verbose:
        for s in sniff:
            print(f"  sniff {s['season']} {s['team']:<4} "
                  f"{s['got']:.1f} (#{s['rank']})  expected {s['expected']} "
                  f"(#{s['expected_rank']})  PASS")

    pct_over_1 = float((off["cost_rec"] > 1.0).mean())
    return {
        "seasons": list(seasons),
        "blank_seasons": list(config.CAPPLUS_BLANK_SEASONS),
        "provisional_seasons": [int(x) for x in prov],
        "sniff": sniff,
        "pct_cost_over_1": round(pct_over_1, 4),
        "coverage": f"{len(off)} of 416 team-seasons "
                    f"({len(off) / 416:.1%})",
    }


# --------------------------------------------------------------------------- #
# capplus_candidates — final backtest artefact; VERIFIED, not rewritten.
# DECISIONS 54: the app never reads it. It carries 69 columns of rejected
# alternates and re-emitting it would risk regressing the evidence record for no
# product gain. Instead the pipeline recomputes the recommended columns from
# scratch and asserts they still reproduce the committed file exactly.
# --------------------------------------------------------------------------- #
def verify_candidates(off: pd.DataFrame, tr: pd.DataFrame) -> dict:
    path = config.MARTS / "capplus_candidates.csv"
    cand = io_utils.read_csv(path)
    io_utils.assert_rows(cand, "capplus_candidates")

    j = cand.merge(off[["season", "team", "capplus"]], on=["season", "team"],
                   how="left")
    rec = j[j["rec_computable"].astype(bool)]
    if len(rec) != len(off):
        raise AssertionError(
            f"capplus_candidates rec_computable rows {len(rec)} != {len(off)}")
    dv = (rec["capplus_rec"] - rec["capplus"]).abs().max()
    if dv >= 1e-6:
        raise AssertionError(f"capplus_official does not reproduce capplus_rec "
                             f"(max delta {dv})")
    j2 = cand.merge(tr[["season", "team", "perf_index", "P"]], on=["season", "team"],
                    suffixes=("_cand", ""))
    dp = (j2["perf_index_cand"] - j2["perf_index"]).abs().max()
    dP = (j2["P_cand"] - j2["P"]).abs().max()
    if dp >= 1e-6 or dP >= 1e-6:
        raise AssertionError(f"team_rating does not reproduce the candidates mart "
                             f"(perf_index {dp}, P {dP})")
    return {"rows": len(cand), "columns": len(cand.columns),
            "max_capplus_delta": float(dv), "max_perf_index_delta": float(dp)}


# --------------------------------------------------------------------------- #
# mart entry points
# --------------------------------------------------------------------------- #
_CACHE: dict = {}


def _prepare(ctx):
    if "official" not in _CACHE:
        off, tr, stats = build(verbose=ctx.verbose)
        _CACHE.update({"official": off, "rating": tr, "stats": stats})
        ctx.stats["capplus"] = stats
    return _CACHE


def mart_capplus_official(ctx) -> pd.DataFrame:
    s = _prepare(ctx)
    ctx.note_source(
        "team_season_results + team_season_epa + team_season_cap + "
        "curated dead-money same-stage snapshots",
        rows=len(s["official"]),
        window=f"{s['stats']['seasons'][0]}-{s['stats']['seasons'][-1]} "
               f"({len(s['stats']['seasons'])} seasons)")
    return s["official"]


def mart_team_rating(ctx) -> pd.DataFrame:
    s = _prepare(ctx)
    ctx.note_source("team_season_results + team_season_epa", rows=len(s["rating"]),
                    window=f"{config.PERF_WINDOW[0]}-{config.PERF_WINDOW[1]}")
    return s["rating"]


def verify_capplus_candidates(ctx) -> dict:
    s = _prepare(ctx)
    out = verify_candidates(s["official"], s["rating"])
    if ctx.verbose:
        print(f"  capplus_candidates verified: {out['rows']} rows x "
              f"{out['columns']} cols; capplus_rec reproduces to "
              f"{out['max_capplus_delta']:.2e}")
    return out
