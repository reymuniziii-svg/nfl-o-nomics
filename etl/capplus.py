"""Cap+ — `capplus_official` and `team_rating`. SPEC.md §2.2, §2.3, §7.4.

**GATE #1 CLEARED 2026-07-25** (`DECISIONS.md` 61); **second reopen ruled
2026-10-10** (`CAPPLUS_MEMO.md` §9, `DECISIONS.md` 109-114). The shipping build:

```
Cap+ = (100 + 15 × P) ÷ R
R    = team cost ÷ league-average cost, floored at the season's 25th percentile
cost = (cap charged to rostered players + dead money) ÷ league cap
P    = equal-weight within-season z of win %, point diff/game and
       OPPONENT-ADJUSTED EPA margin/play
```

The maths is **imported, not re-derived**: `build_performance`,
`recommended_columns`, `calibrate` and `pooled_within_season_sd` come straight
out of `audit/capplus_backtest.py`. The 2026-10-10 rulings changed inputs and λ,
not maths:

* **λ = 1.0** (`config.LAMBDA_DEAD`, DECISIONS 109). Dead money counts once, so
  `cost_rec == cap_consumed_rec` by construction. Both columns stay (contract)
  and the identity is asserted.
* **P's EPA input is the opponent-adjusted margin** (`epa_margin_per_play_adj`,
  DECISIONS 110). `load_perf` maps it onto the name `build_performance` reads.
* **All thirteen seasons, 416 rows** (DECISIONS 112, 113). 2013 is a measured
  table badged `provisional`; 2016, 2020 and 2021 come from the curated
  estimate, badged `estimated`.

Implementation rules, all mandatory, all asserted below rather than described:

* **One snapshot per season**, all 32 teams (`DECISIONS.md` 15, 97); the
  resolution is `etl/deadmoney.resolve_same_stage`.
* **The floor applies to COST, and the league average is taken AFTER it**
  (`DECISIONS.md` 14), so `mean(R)` is exactly 1.000 every season. Eight of 32
  are floored by construction.
* **Calibration on the MEASURED seasons only.** Demeaned within season so each
  season's mean is exactly 100.000, then divided by ONE pooled within-season SD
  taken over the ten measured seasons, so that pooled SD is exactly 15.000. The
  three estimated seasons are divided by the same SD — a point means the same
  thing — and their own spread is free (DECISIONS 113).
* **Badges**: `provisional` (2013, 2014, 2019), `estimated` (2016, 2020, 2021),
  else `preseason` / `in_season`; the per-season sentence travels as
  `badge_reason`.

`team_rating` is the 1999-2012 fallback and the 2013-2025 overlay. Its name is
**"Team Rating (performance only)"** and it is *never* called "Cap+ (performance
only)" (`DECISIONS.md` 18).

The July 2026 evidence record `data/marts/capplus_candidates.csv` (λ = 1.5,
raw EPA, nine seasons) is frozen and no longer reproduced (DECISIONS 114). The
regression guard is `SNIFF` below, recorded from this build.
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

#: Regression guard — (season, team, Cap+, season rank), recorded from the
#: 2026-10-10 build (λ = 1, adjusted EPA, measured-only calibration) and
#: RE-FROZEN 2026-10-11 on the October nflverse contracts release (DECISIONS 115:
#: `cols` -> `season_history`, 167 backfilled player-seasons, Brady's 2023 Route-R
#: charge withdrawn upstream). Every rank held; 11 of 13 values moved by more
#: than the 0.05 tolerance. The first ten are the July memo's cases
#: (CAPPLUS_MEMO.md §3.1); the last three check one team in each estimated
#: season. CAPPLUS_MEMO.md §9.2 prints July vs 10-10, §9.5 prints 10-10 vs 10-11.
SNIFF = [
    (2023, "SF", 135.0, 1),
    (2022, "CHI", 77.2, 30),
    (2024, "DEN", 111.9, 10),
    (2014, "NE", 122.0, 3),
    (2017, "PHI", 117.9, 5),
    (2017, "CLE", 71.5, 32),
    (2022, "ATL", 96.2, 20),
    (2019, "KC", 125.6, 2),
    (2025, "NO", 93.0, 23),
    (2023, "LA", 107.0, 10),
    (2016, "NO", 104.3, 13),
    (2020, "CAR", 87.4, 24),
    (2021, "PHI", 105.7, 13),
]
SNIFF_TOL = 0.05  # index points — the memo's own reconciliation tolerance

#: Franchise arcs printed with the diagnostics (CAPPLUS_MEMO.md §9).
ARC_TEAMS = ("KC", "SF", "BUF", "PHI")


# --------------------------------------------------------------------------- #
# inputs
# --------------------------------------------------------------------------- #
def load_perf() -> pd.DataFrame:
    """Results + EPA. P's EPA input is the opponent-adjusted margin
    (`config.PERF_EPA_INPUT`), mapped onto the column name
    `bt.build_performance` reads; the raw margin travels as `epa_margin_per_play_raw`."""
    res = io_utils.read_csv(config.MARTS / "team_season_results.csv")
    epa = io_utils.read_csv(config.MARTS / "team_season_epa.csv")
    for f in (res, epa):
        f["team"] = normalize_series(f["team"]).astype("object")
    if epa[config.PERF_EPA_INPUT].isna().any():
        raise AssertionError(f"{config.PERF_EPA_INPUT} has nulls")
    perf = res.merge(
        epa[["season", "team", "off_epa_per_play", "def_epa_per_play",
             "epa_margin_per_play", config.PERF_EPA_INPUT]],
        on=["season", "team"], how="inner", validate="1:1")
    if len(perf) != len(res) != config.EXPECTED_ROWS["team_season_results"]:
        raise AssertionError(f"perf join lost rows: {len(perf)}")
    perf = perf.rename(columns={"epa_margin_per_play": "epa_margin_per_play_raw"})
    perf["epa_margin_per_play"] = perf[config.PERF_EPA_INPUT]
    perf["point_diff_per_game"] = perf["point_diff"] / perf["games"]
    return perf


def load_cap() -> pd.DataFrame:
    cap = io_utils.read_csv(config.MARTS / "team_season_cap.csv")
    cap["team"] = normalize_series(cap["team"]).astype("object")
    return cap


def _unsuffix(d: pd.DataFrame, lam: float) -> pd.DataFrame:
    """`bt.recommended_columns` tags every weight but the July build's 1.5 with
    a suffix (`_lam10`); the shipping weight owns the bare names here."""
    suf = bt.lam_suffix(lam)
    if not suf:
        return d
    base = ("cost_rec", "cost_floor", "R_rec_unfloored", "R_rec", "rec_floored",
            "raw_rec", "capplus_rec")
    return d.rename(columns={f"{c}{suf}": c for c in base})


# --------------------------------------------------------------------------- #
# the build
# --------------------------------------------------------------------------- #
def build(*, verbose: bool = True, check_sniff: bool = True
          ) -> tuple[pd.DataFrame, pd.DataFrame, dict]:
    perf = load_perf()
    cap = load_cap()
    dm = deadmoney.load_team_season()
    est = deadmoney.load_estimated()
    same, snap = deadmoney.resolve_same_stage(dm, est)
    deadmoney.assert_pinned_resolution(snap)

    # ---- performance composite P (equal weights, within-season z) ----------
    d = bt.build_performance(perf, bt.WEIGHTS[bt.DEFAULT_W])
    d = d.merge(cap[["season", "team", "cap_used_total", "league_cap",
                     "cash_spent_total"]],
                on=["season", "team"], how="left", validate="1:1")
    d = d.merge(same[["season", "team", "dead_money_rec", "dm_rec_asof_date",
                      "dm_rec_asof_stage", "license_tier", "is_modeled"]],
                on=["season", "team"], how="left", validate="1:1")
    d["perf_index"] = config.INDEX_MEAN + config.INDEX_SD * d["P"]
    d["rec_computable"] = (d["season"].between(*config.TIER2_WINDOW)
                           & d["dead_money_rec"].notna())

    # Plain cap consumed, unweighted. At λ = 1 it IS the cost; it still ships
    # beside cost_rec because both are contracted columns.
    m = d["rec_computable"]
    d["cap_consumed_rec"] = np.nan
    d.loc[m, "cap_consumed_rec"] = (
        (d.loc[m, "cap_used_total"] + d.loc[m, "dead_money_rec"]) / d.loc[m, "league_cap"])

    # ---- the approved build: cost, floor, R, raw index ---------------------
    d = _unsuffix(bt.recommended_columns(d, config.LAMBDA_DEAD,
                                         floor_q=config.COST_FLOOR_Q, apply_floor=True),
                  config.LAMBDA_DEAD)

    # ---- calibration on the measured seasons only --------------------------
    d = d.merge(snap[["season", "badge", "badge_reason", "median_dead_money_usd"]],
                on="season", how="left")
    meas = m & (d["badge"] != "estimated")
    cal_meas = bt.calibrate(d[meas], "raw_rec", "capplus_meas")["capplus_meas"]
    dev = d.loc[m, "raw_rec"] - d[m].groupby("season")["raw_rec"].transform("mean")
    sd_meas = bt.pooled_within_season_sd(
        pd.DataFrame({"season": d.loc[meas, "season"], "x": dev[meas[m]]}), "x")
    d["capplus_rec"] = np.nan
    d.loc[m, "capplus_rec"] = config.INDEX_MEAN + config.INDEX_SD * dev / sd_meas
    if (d.loc[meas, "capplus_rec"] - cal_meas).abs().max() > 1e-9:
        raise AssertionError("measured-season Cap+ does not reproduce bt.calibrate")

    # ---- ranks -------------------------------------------------------------
    d["perf_season_rank"] = d.groupby("season")["perf_index"].rank(
        ascending=False, method="min")
    d["capplus_season_rank"] = np.nan
    d.loc[m, "capplus_season_rank"] = d[m].groupby("season")["capplus_rec"].rank(
        ascending=False, method="min")

    _assert_invariants(d, m, meas, sd_meas)

    # ---- capplus_official (SPEC.md §7.4) ----------------------------------
    off = d[m].rename(columns={
        "capplus_rec": "capplus",
        "dm_rec_asof_date": "dm_asof_date",
        "dm_rec_asof_stage": "dm_asof_stage",
        "rec_floored": "was_floored",
        "capplus_season_rank": "season_rank",
        "median_dead_money_usd": "league_median_dead_money_usd",
        "is_modeled": "dm_is_modeled",
    })[[
        "season", "team", "capplus", "perf_index", "P",
        "cost_rec", "cap_consumed_rec", "cost_floor", "R_rec", "was_floored",
        "dead_money_rec", "dm_asof_date", "dm_asof_stage", "dm_is_modeled",
        "league_median_dead_money_usd", "license_tier", "badge", "badge_reason",
        "season_rank",
    ]].sort_values(["season", "team"]).reset_index(drop=True)

    off = io_utils.round_cols(off, {
        "capplus": 6, "perf_index": 6, "P": 6, "cost_rec": 6,
        "cap_consumed_rec": 6, "cost_floor": 6, "R_rec": 6,
        "dead_money_rec": 0, "league_median_dead_money_usd": 0,
    })
    off = io_utils.as_int64(off, ["dead_money_rec", "league_median_dead_money_usd",
                                  "season_rank"])
    off["was_floored"] = off["was_floored"].astype(bool)
    off["dm_is_modeled"] = off["dm_is_modeled"].astype(bool)
    off["badge_reason"] = off["badge_reason"].fillna("")

    # ---- team_rating: ALL 861 team-seasons, 1999-2025 ---------------------
    tr = d.rename(columns={"perf_season_rank": "season_rank"})[
        ["season", "team", "perf_index", "P", "season_rank"]
    ].sort_values(["season", "team"]).reset_index(drop=True)
    tr = io_utils.round_cols(tr, {"perf_index": 6, "P": 6})
    tr = io_utils.as_int64(tr, ["season_rank"])

    io_utils.assert_rows(tr, "team_rating")
    assert_full_32(tr["team"], "team_rating")

    stats = _check_official(off, verbose=verbose, check_sniff=check_sniff)
    stats["pooled_sd_measured_raw"] = round(float(sd_meas), 6)
    stats["snapshots"] = snap[["season", "asof_date", "asof_stage", "badge"]].to_dict(
        "records")
    stats["diagnostics"] = diagnostics(off)
    if verbose:
        _print_diagnostics(stats["diagnostics"])
    return off, tr, stats


def _pooled(x: pd.Series, season: pd.Series) -> float:
    dev = x - x.groupby(season).transform("mean")
    return float(np.sqrt((dev ** 2).sum() / (len(x) - season.nunique())))


def _assert_invariants(d: pd.DataFrame, m: pd.Series, meas: pd.Series,
                       sd_meas: float) -> None:
    """The build's invariants, asserted rather than described."""
    sub = d[m]
    if not np.allclose(sub.groupby("season")["R_rec"].mean().to_numpy(), 1.0):
        raise AssertionError("R_rec: league average is not 1.000")
    n_fl = sub.groupby("season")["rec_floored"].sum()
    if not (n_fl == config.FLOORED_TEAMS_PER_SEASON).all():
        raise AssertionError(
            f"the 25th-pct floor must bind for {config.FLOORED_TEAMS_PER_SEASON} "
            f"of 32 teams, got {sorted(set(n_fl))}")
    # λ = 1: the cost index IS cap consumed (DECISIONS 109).
    if config.LAMBDA_DEAD == 1.0 and (sub["cost_rec"] - sub["cap_consumed_rec"]).abs().max() > 1e-12:
        raise AssertionError("λ = 1 but cost_rec != cap_consumed_rec")
    if not np.allclose(sub.groupby("season")["capplus_rec"].mean().to_numpy(),
                       config.INDEX_MEAN):
        raise AssertionError("capplus_rec: season mean is not exactly 100")
    # Calibration rule (DECISIONS 113): pooled SD 15 over the MEASURED seasons...
    pooled = _pooled(d.loc[meas, "capplus_rec"], d.loc[meas, "season"])
    if abs(pooled - config.INDEX_SD) >= 1e-9:
        raise AssertionError(f"capplus_rec: measured pooled within-season SD is {pooled}")
    # ...and every season, estimated ones included, on that same scale.
    raw_dev = sub["raw_rec"] - sub.groupby("season")["raw_rec"].transform("mean")
    back = (sub["capplus_rec"] - config.INDEX_MEAN) / config.INDEX_SD * sd_meas
    if (back - raw_dev).abs().max() > 1e-9:
        raise AssertionError("a season is not on the measured seasons' scale")
    if config.DEAD_MONEY_TIER == "full":
        got = tuple(sorted(int(s) for s in d.loc[meas, "season"].unique()))
        if got != config.CAPPLUS_MEASURED_SEASONS:
            raise AssertionError(f"calibration seasons drifted: {got}")
    # P is a within-season z by construction.
    if not np.allclose(d.groupby("season")["P"].mean().to_numpy(), 0.0, atol=1e-9):
        raise AssertionError("P: within-season mean is not 0")
    if not np.allclose(d.groupby("season")["P"].std(ddof=1).to_numpy(), 1.0, atol=1e-9):
        raise AssertionError("P: within-season SD is not 1")
    # P reads the opponent-adjusted margin (DECISIONS 110).
    z = bt.within_season_z(d, config.PERF_EPA_INPUT)
    if (z - d["z_epa_margin"]).abs().max() > 1e-12:
        raise AssertionError("P's EPA input is not the opponent-adjusted margin")


def _check_official(off: pd.DataFrame, *, verbose: bool, check_sniff: bool = True) -> dict:
    seasons = tuple(int(s) for s in sorted(off["season"].unique()))
    # Row count is tier-dependent by design: this is the licensing contingency
    # (`RISKS.md` risk 1). Under the shipping tier it is the contracted 416 over
    # thirteen seasons; under the SAFE-only reversal Cap+ survives for 2014-2015
    # only, exactly as `DATA_AUDIT.md` §5 quantifies. Both are 32 teams/season.
    if len(off) != 32 * len(seasons):
        raise AssertionError(
            f"capplus_official: {len(off)} rows is not 32 x {len(seasons)} seasons")
    full = config.DEAD_MONEY_TIER == "full"
    if full:
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
    prov = tuple(sorted(int(x) for x in off.loc[off["badge"] == "provisional", "season"].unique()))
    estd = tuple(sorted(int(x) for x in off.loc[off["badge"] == "estimated", "season"].unique()))
    if full and prov != config.CAPPLUS_PROVISIONAL_SEASONS:
        raise AssertionError(f"provisional badge seasons changed: {prov}")
    if full and estd != config.CAPPLUS_ESTIMATED_SEASONS:
        raise AssertionError(f"estimated badge seasons changed: {estd}")
    if not off["badge"].isin(config.CAPPLUS_BADGES).all():
        raise AssertionError("badge vocabulary drifted")
    if (off["dm_is_modeled"] & (off["badge"] != "estimated")).any():
        raise AssertionError("a modeled dead-money value outside an estimated season")
    if (off.loc[off["badge"].isin(("provisional", "estimated")), "badge_reason"] == "").any():
        raise AssertionError("a provisional/estimated row without its badge_reason")
    if int(off["was_floored"].sum()) != config.FLOORED_TEAMS_PER_SEASON * len(seasons):
        raise AssertionError("floored-team count drifted")

    # The sniff values were recorded from the SHIPPING build. Under the SAFE-only
    # licensing reversal the index is recalibrated over two seasons and they no
    # longer apply — that is the contingency working, not a regression.
    sniff = []
    for season, team, want_v, want_r in (SNIFF if full else []):
        r = off[(off["season"] == season) & (off["team"] == team)]
        if r.empty:
            raise AssertionError(f"sniff case missing: {season} {team}")
        got_v = float(r.iloc[0]["capplus"])
        got_r = int(r.iloc[0]["season_rank"])
        ok = abs(got_v - want_v) < SNIFF_TOL and got_r == want_r
        sniff.append({"season": season, "team": team, "expected": want_v,
                      "got": round(got_v, 1), "expected_rank": want_r,
                      "rank": got_r, "pass": ok})
        if check_sniff and not ok:
            raise AssertionError(
                f"Cap+ sniff failed: {season} {team} "
                f"got {got_v:.1f} (#{got_r}), expected {want_v} (#{want_r})")
    if verbose:
        for s in sniff:
            print(f"  sniff {s['season']} {s['team']:<4} "
                  f"{s['got']:.1f} (#{s['rank']})  expected {s['expected']} "
                  f"(#{s['expected_rank']})  {'PASS' if s['pass'] else 'FAIL'}")

    pct_over_1 = float((off["cost_rec"] > 1.0).mean())
    return {
        "seasons": list(seasons),
        "blank_seasons": [s for s in config.CAPPLUS_BLANK_SEASONS],
        "provisional_seasons": list(prov),
        "estimated_seasons": list(estd),
        "lambda_dead": config.LAMBDA_DEAD,
        "perf_epa_input": config.PERF_EPA_INPUT,
        "sniff": sniff,
        "pct_cost_over_1": round(pct_over_1, 4),
        "coverage": f"{len(off)} of 416 team-seasons ({len(off) / 416:.1%})",
    }


def diagnostics(off: pd.DataFrame) -> dict:
    """The memo's headline numbers, from the published mart itself."""
    o = off.copy()
    o["perf_rank"] = o.groupby("season")["perf_index"].rank(ascending=False, method="min")
    shift = (o["season_rank"] - o["perf_rank"]).abs()
    meas = o["badge"] != "estimated"
    arcs = {t: " ".join(f"{int(r.season) % 100:02d}:#{int(r.season_rank)}"
                        for r in o[o["team"] == t].sort_values("season").itertuples())
            for t in ARC_TEAMS}
    cols = ["season", "team", "capplus", "season_rank", "badge"]
    top = o.sort_values("capplus", ascending=False).head(10)[cols]
    bot = o.sort_values("capplus", ascending=True).head(10)[cols]
    rnd = lambda df: [{**r, "capplus": round(float(r["capplus"]), 1)}  # noqa: E731
                      for r in df.to_dict("records")]
    return {
        "corr_capplus_vs_team_rating": round(float(o["capplus"].corr(o["perf_index"])), 4),
        "corr_capplus_vs_team_rating_measured": round(
            float(o.loc[meas, "capplus"].corr(o.loc[meas, "perf_index"])), 4),
        "mean_abs_rank_shift_vs_perf": round(float(shift.mean()), 2),
        "mean_abs_rank_shift_vs_perf_measured": round(float(shift[meas].mean()), 2),
        "within_season_sd_by_badge": {
            b: round(float(np.sqrt(((g["capplus"] - 100) ** 2).sum() / (len(g) - g["season"].nunique()))), 2)
            for b, g in o.groupby(o["badge"].eq("estimated").map(
                {True: "estimated", False: "measured"}))},
        "arcs": arcs,
        "all_time_top10": rnd(top),
        "all_time_bottom10": rnd(bot),
    }


def _print_diagnostics(g: dict) -> None:
    print(f"  corr(Cap+, Team Rating) = {g['corr_capplus_vs_team_rating']} "
          f"(measured seasons {g['corr_capplus_vs_team_rating_measured']})")
    print(f"  mean |Cap+ rank - perf rank| = {g['mean_abs_rank_shift_vs_perf']} "
          f"(measured {g['mean_abs_rank_shift_vs_perf_measured']})")
    print(f"  pooled within-season SD: {g['within_season_sd_by_badge']}")
    for t, a in g["arcs"].items():
        print(f"  arc {t:<4} {a}")
    for name in ("all_time_top10", "all_time_bottom10"):
        print(f"  {name}: " + ", ".join(
            f"{r['season']} {r['team']} {r['capplus']}" for r in g[name]))


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
        "team_season_results + team_season_epa (adjusted margin) + team_season_cap + "
        "curated dead-money same-stage snapshots + curated estimate",
        rows=len(s["official"]),
        window=f"{s['stats']['seasons'][0]}-{s['stats']['seasons'][-1]} "
               f"({len(s['stats']['seasons'])} seasons)")
    return s["official"]


def mart_team_rating(ctx) -> pd.DataFrame:
    s = _prepare(ctx)
    ctx.note_source("team_season_results + team_season_epa (adjusted margin)",
                    rows=len(s["rating"]),
                    window=f"{config.PERF_WINDOW[0]}-{config.PERF_WINDOW[1]}")
    return s["rating"]
