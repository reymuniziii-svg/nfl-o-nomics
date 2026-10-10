"""Cap+ context — `capplus_context`. SPEC.md §2.10, §7.13. DECISIONS 100-103, 111.

**Gate #1 REOPENED 2026-10-10** on the product owner's instruction. The reopen
was prompted by a hypothesis — that teams with a starting QB on a rookie deal
have a structural edge in Cap+ — and the audit of that hypothesis
(`CAPPLUS_MEMO.md` §8) found something different: the rookie-QB lever is worth
about three index points, a fifth of one SD, while Cap+ itself correlates 0.95
(0.96 after the 2026-10-10 rulings, `CAPPLUS_MEMO.md` §9) with the
performance-only Team Rating because every team spends roughly the cap. The dollars that actually vary between teams are the ones Cap+ cannot
see: cash paid this year and prorated bonus still owed to future caps.

This mart does not change `capplus_official`. It publishes, per team-season:

* **the starting QB and whether he is on his rookie contract** (`qb_rookie_window`),
* **QB-neutral Cap+** — Cap+ recomputed as if the team had paid the season's
  median starting-QB cap number — and the two-term decomposition it implies:
  `qb_timing_pts` (raw minus neutral: what the QB's contract timing was worth)
  and `roster_pts` (neutral minus 100: everything else),
* **rank within stratum** — rookie-window teams ranked against each other,
  veteran-QB teams against each other,
* **the future-cap mortgage** — prorated signing-bonus money already charged
  to seasons after this one, in dollars and as a share of this season's cap.
  It is the reconciling item between the product's two money lenses: cap is
  accrual, cash is cash, and the mortgage is cash paid ahead of cap.

**Cap+ (obligation) is RETIRED** (2026-10-10, DECISIONS 111). Folding α × the
mortgage into cost mixed an accrual basis with a cash basis; the honest lenses
are cap per win and cash per win, with the mortgage published as the bridge.
`capplus_obligation`, `obligation_rank` and `mortgage_alpha` are gone.

Rows: 416 (2013-2025). Every index column is populated in all thirteen seasons
under the shipping tier; under the SAFE-only reversal the seasons Cap+ loses
carry the QB and mortgage facts and NULL in every index column — blanking stays
whole-season.

Method notes, all asserted below rather than described:

* Starting QB = the QB with the most offensive snaps for that team-season
  (`player_season_availability`), tie-broken by cap number; a team-season with
  no snap row for any QB falls back to the highest cap number and records
  `qb_starter_method = "cap"`.
* Rookie window = drafted (a `draft_pick` row), `contract_year_signed` equals
  the draft year, and the season is at most the fourth after the draft (which
  admits the fifth-year option). UDFA first contracts are NOT rookie-window.
* Mortgage = Σ over rostered players of `prorated_bonus × remaining contract
  seasons after this one`. It assumes flat proration and cannot see void years
  or future restructures; rows with no `contract_years` contribute zero and
  are counted in the build stats.
* QB-neutral Cap+ is scaled by the SAME pooled within-season SD as the official
  build — taken over the measured seasons only, exactly as Cap+ is (DECISIONS
  113) — so one point means the same thing on both; its season mean is exactly
  100.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import config, io_utils
from .team_codes import assert_full_32, normalize_series


# --------------------------------------------------------------------------- #
# inputs
# --------------------------------------------------------------------------- #
def _mart(name: str) -> pd.DataFrame:
    df = io_utils.read_csv(config.MARTS / f"{name}.csv")
    if "team" in df.columns:
        df["team"] = normalize_series(df["team"]).astype("object")
    return df


# --------------------------------------------------------------------------- #
# starting QB + rookie window
# --------------------------------------------------------------------------- #
def starting_qbs(players: pd.DataFrame, avail: pd.DataFrame,
                 draft: pd.DataFrame) -> pd.DataFrame:
    qb = players[players["position_group"] == "QB"].copy()
    qb = qb.merge(avail[["gsis_id", "season", "team", "off_snaps"]],
                  on=["gsis_id", "season", "team"], how="left")
    qb["_snaps"] = qb["off_snaps"].fillna(-1.0)
    qb = qb.sort_values(["season", "team", "_snaps", "cap_number", "otc_id"],
                        ascending=[True, True, False, False, True], kind="stable")
    st = qb.groupby(["season", "team"], sort=True).head(1).copy()
    st["qb_starter_method"] = np.where(st["_snaps"] >= 0, "snaps", "cap")

    first = (draft.sort_values(["season", "round", "pick"], kind="stable")
                  .dropna(subset=["gsis_id"])
                  .drop_duplicates("gsis_id")[["gsis_id", "season", "round"]]
                  .rename(columns={"season": "qb_draft_year", "round": "qb_draft_round"}))
    st = st.merge(first, on="gsis_id", how="left")
    st["qb_rookie_window"] = (
        st["qb_draft_year"].notna()
        & (st["contract_year_signed"] == st["qb_draft_year"])
        & ((st["season"] - st["qb_draft_year"]) <= config.ROOKIE_WINDOW_MAX_YEARS)
    )
    out = st.rename(columns={
        "player": "starting_qb", "gsis_id": "starting_qb_gsis_id",
        "otc_id": "starting_qb_otc_id", "cap_number": "qb_cap_number",
        "contract_year_signed": "qb_contract_year_signed",
    })[["season", "team", "starting_qb", "starting_qb_gsis_id", "starting_qb_otc_id",
        "qb_starter_method", "qb_cap_number", "qb_contract_year_signed",
        "qb_draft_year", "qb_draft_round", "qb_rookie_window"]]
    return out.reset_index(drop=True)


# --------------------------------------------------------------------------- #
# future-cap mortgage
# --------------------------------------------------------------------------- #
def mortgage(players: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    p = players.copy()
    end = p["contract_year_signed"] + p["contract_years"] - 1
    p["_remaining"] = (end - p["season"]).clip(lower=0)
    known = p["contract_years"].notna() & p["contract_year_signed"].notna()
    p["_mort"] = np.where(known, p["prorated_bonus"].fillna(0.0) * p["_remaining"].fillna(0), 0.0)
    g = p.groupby(["season", "team"], sort=True).agg(
        future_mortgage_usd=("_mort", "sum"),
        mortgage_rows_unknown=("contract_years", lambda s: int(s.isna().sum())),
    ).reset_index()
    stats = {"rows_without_contract_years": int((~known).sum()), "rows": int(len(p))}
    return g, stats


# --------------------------------------------------------------------------- #
# index maths — the same shapes as audit/capplus_backtest.recommended_columns
# --------------------------------------------------------------------------- #
def _floored_R(cost: pd.Series, season: pd.Series) -> pd.Series:
    floor = cost.groupby(season).transform(lambda s: s.quantile(config.COST_FLOOR_Q))
    eff = np.maximum(cost, floor)
    return eff / eff.groupby(season).transform("mean")


def _pooled_sd(dev: pd.Series, season: pd.Series) -> float:
    return float(np.sqrt((dev ** 2).sum() / (len(dev) - season.nunique())))


def build(*, verbose: bool = True) -> tuple[pd.DataFrame, dict]:
    players = _mart("player_season_cap")
    avail = _mart("player_season_availability")
    draft = _mart("draft_pick")
    cap = _mart("team_season_cap")
    off = _mart("capplus_official")
    rating = _mart("team_rating")

    st = starting_qbs(players, avail, draft)
    mort, mstats = mortgage(players)

    d = cap[["season", "team", "cap_used_total", "league_cap", "cash_spent_total"]].merge(
        st, on=["season", "team"], how="left", validate="1:1")
    d = d.merge(mort, on=["season", "team"], how="left", validate="1:1")
    d = d.merge(rating[["season", "team", "perf_index", "P", "season_rank"]]
                .rename(columns={"season_rank": "perf_rank"}),
                on=["season", "team"], how="left", validate="1:1")
    d = d.merge(off[["season", "team", "capplus", "season_rank", "dead_money_rec", "R_rec",
                     "badge"]]
                .rename(columns={"season_rank": "capplus_rank"}),
                on=["season", "team"], how="left", validate="1:1")
    io_utils.assert_rows(d, "capplus_context")
    assert_full_32(d["team"], "capplus_context")
    if d["starting_qb"].isna().any():
        raise AssertionError("a team-season has no starting QB")
    if d["perf_index"].isna().any():
        raise AssertionError("team_rating join lost rows")

    d["qb_cap_share"] = d["qb_cap_number"] / d["league_cap"]
    d["league_median_starter_qb_cap"] = d.groupby("season")["qb_cap_number"].transform("median")
    d["cash_share"] = d["cash_spent_total"] / d["league_cap"]
    d["future_mortgage_share"] = d["future_mortgage_usd"] / d["league_cap"]
    d["stratum_size"] = d.groupby(["season", "qb_rookie_window"])["team"].transform("size")

    # ---- indices: only where Cap+ itself exists ---------------------------
    m = d["capplus"].notna()
    ssn = d.loc[m, "season"]
    lam = config.LAMBDA_DEAD
    for c in ("capplus_qb_neutral", "qb_timing_pts", "roster_pts"):
        d[c] = np.nan
    for c in ("qb_neutral_rank", "stratum_rank"):
        d[c] = np.nan

    # the official build's own scale, recomputed from its published R: the
    # pooled SD over the MEASURED seasons only (estimated seasons share it)
    raw_off = (100.0 + 15.0 * d.loc[m, "P"]) / d.loc[m, "R_rec"]
    dev_off = raw_off - raw_off.groupby(ssn).transform("mean")
    meas = d.loc[m, "badge"] != "estimated"
    sd_off = _pooled_sd(dev_off[meas], ssn[meas])
    recal = 100.0 + 15.0 * dev_off / sd_off
    drift = float((recal - d.loc[m, "capplus"]).abs().max())
    if drift > 1e-3:
        raise AssertionError(f"cannot reproduce capplus from published R_rec (drift {drift})")

    # QB-neutral: swap the starter's cap number for the season median
    cost_n = ((d.loc[m, "cap_used_total"] - d.loc[m, "qb_cap_number"]
               + d.loc[m, "league_median_starter_qb_cap"]
               + lam * d.loc[m, "dead_money_rec"]) / d.loc[m, "league_cap"])
    R_n = _floored_R(cost_n, ssn)
    raw_n = (100.0 + 15.0 * d.loc[m, "P"]) / R_n
    dev_n = raw_n - raw_n.groupby(ssn).transform("mean")
    d.loc[m, "capplus_qb_neutral"] = 100.0 + 15.0 * dev_n / sd_off
    d.loc[m, "qb_timing_pts"] = d.loc[m, "capplus"] - d.loc[m, "capplus_qb_neutral"]
    d.loc[m, "roster_pts"] = d.loc[m, "capplus_qb_neutral"] - 100.0

    sub = d[m]
    d.loc[m, "qb_neutral_rank"] = sub.groupby("season")["capplus_qb_neutral"].rank(
        ascending=False, method="min")
    d.loc[m, "stratum_rank"] = sub.groupby(["season", "qb_rookie_window"])["capplus"].rank(
        ascending=False, method="min")

    stats = _diagnostics(d, m, mstats, drift)
    _assert_invariants(d, m)

    out = d[[
        "season", "team",
        "starting_qb", "starting_qb_gsis_id", "starting_qb_otc_id", "qb_starter_method",
        "qb_cap_number", "qb_cap_share", "qb_contract_year_signed", "qb_draft_year",
        "qb_draft_round", "qb_rookie_window", "league_median_starter_qb_cap",
        "stratum_size", "stratum_rank",
        "perf_index", "perf_rank", "capplus", "capplus_rank",
        "capplus_qb_neutral", "qb_neutral_rank", "qb_timing_pts", "roster_pts",
        "cash_share", "future_mortgage_usd", "future_mortgage_share", "mortgage_rows_unknown",
    ]].sort_values(["season", "team"]).reset_index(drop=True)

    out = io_utils.round_cols(out, {
        "qb_cap_share": 6, "perf_index": 6, "capplus": 6, "capplus_qb_neutral": 6,
        "qb_timing_pts": 6, "roster_pts": 6, "cash_share": 6, "future_mortgage_share": 6,
        "qb_cap_number": 0, "league_median_starter_qb_cap": 0,
        "future_mortgage_usd": 0,
    })
    out = io_utils.as_int64(out, [
        "starting_qb_otc_id", "qb_cap_number", "qb_contract_year_signed", "qb_draft_year",
        "qb_draft_round", "league_median_starter_qb_cap", "stratum_size", "stratum_rank",
        "perf_rank", "capplus_rank", "qb_neutral_rank", "future_mortgage_usd",
        "mortgage_rows_unknown",
    ])
    out["qb_rookie_window"] = out["qb_rookie_window"].astype(bool)
    if verbose:
        _print(stats)
    return out, stats


def _assert_invariants(d: pd.DataFrame, m: pd.Series) -> None:
    sub = d[m]
    if not np.allclose(sub.groupby("season")["capplus_qb_neutral"].mean().to_numpy(),
                       config.INDEX_MEAN):
        raise AssertionError("capplus_qb_neutral: season mean is not exactly 100")
    ident = (sub["capplus"] - sub["capplus_qb_neutral"] - sub["qb_timing_pts"]).abs().max()
    if ident > 1e-9:
        raise AssertionError("decomposition identity capplus = neutral + timing broke")
    blank = d[~m]
    if (config.DEAD_MONEY_TIER == "full"
            and set(blank["season"].unique()) != set(config.CAPPLUS_BLANK_SEASONS)):
        raise AssertionError("index columns are blank outside the Cap+-blank seasons")
    for c in ("capplus_obligation", "obligation_rank", "mortgage_alpha"):
        if c in d.columns:
            raise AssertionError(f"{c} was retired 2026-10-10 (DECISIONS 111)")
    if (d.groupby(["season", "team"]).size() != 1).any():
        raise AssertionError("grain (season, team) is not unique")
    if not d["qb_rookie_window"].isin([True, False]).all():
        raise AssertionError("qb_rookie_window is not boolean")
    if (d["future_mortgage_usd"] < 0).any():
        raise AssertionError("negative mortgage")


def _diagnostics(d: pd.DataFrame, m: pd.Series, mstats: dict, drift: float) -> dict:
    sub = d[m]
    perf_rank = sub.groupby("season")["perf_index"].rank(ascending=False, method="min")
    by_stratum = sub.groupby("qb_rookie_window").agg(
        n=("team", "size"), mean_capplus=("capplus", "mean"),
        mean_perf=("perf_index", "mean"), mean_qb_timing_pts=("qb_timing_pts", "mean"))
    return {
        "rows": int(len(d)),
        "index_rows": int(m.sum()),
        "capplus_reproduction_drift": round(drift, 6),
        "corr_capplus_vs_perf_index": round(float(sub["capplus"].corr(sub["perf_index"])), 4),
        "mean_abs_rank_shift_vs_perf": {
            "capplus": round(float((sub["capplus_rank"] - perf_rank).abs().mean()), 2),
        },
        "within_season_sd": {
            "R_rec": round(float(sub.groupby("season")["R_rec"].std().mean()), 4),
            "qb_cap_share": round(float(sub.groupby("season")["qb_cap_share"].std().mean()), 4),
            "cash_share": round(float(sub.groupby("season")["cash_share"].std().mean()), 4),
            "future_mortgage_share": round(
                float(sub.groupby("season")["future_mortgage_share"].std().mean()), 4),
        },
        "corr_capplus_vs_qb_cap_share_by_season": {
            int(s): round(float(g["capplus"].corr(g["qb_cap_share"])), 3)
            for s, g in sub.groupby("season")},
        "by_stratum": {str(k): {c: round(float(v), 2) for c, v in row.items()}
                       for k, row in by_stratum.to_dict("index").items()},
        "rookie_window_teams_per_season": {
            int(s): int(v) for s, v in d.groupby("season")["qb_rookie_window"].sum().items()},
        "starter_method_counts": {k: int(v) for k, v in
                                  d["qb_starter_method"].value_counts().items()},
        "mortgage": mstats,
        "corr_mortgage_share_vs_perf_index": round(
            float(d["future_mortgage_share"].corr(d["perf_index"])), 4),
    }


def _print(s: dict) -> None:
    print(f"  corr(Cap+, Team Rating) = {s['corr_capplus_vs_perf_index']}")
    print(f"  mean |rank - perf rank|: Cap+ {s['mean_abs_rank_shift_vs_perf']['capplus']}")
    print(f"  within-season SD: R_rec {s['within_season_sd']['R_rec']}, "
          f"mortgage share {s['within_season_sd']['future_mortgage_share']}")
    for k, v in s["by_stratum"].items():
        print(f"  rookie_window={k}: n={v['n']:.0f} Cap+ {v['mean_capplus']} "
              f"perf {v['mean_perf']} qb_timing {v['mean_qb_timing_pts']}")


# --------------------------------------------------------------------------- #
# mart entry point
# --------------------------------------------------------------------------- #
_CACHE: dict = {}


def mart_capplus_context(ctx) -> pd.DataFrame:
    if "ctx" not in _CACHE:
        out, stats = build(verbose=ctx.verbose)
        _CACHE.update({"ctx": out, "stats": stats})
        ctx.stats["capplus_context"] = stats
    ctx.note_source(
        "capplus_official + team_rating + team_season_cap + player_season_cap + "
        "player_season_availability + draft_pick",
        rows=len(_CACHE["ctx"]),
        window=f"{config.TIER2_WINDOW[0]}-{config.TIER2_WINDOW[1]} (13 seasons; "
               f"index columns null only where Cap+ is blank)")
    return _CACHE["ctx"]
