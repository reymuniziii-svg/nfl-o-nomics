#!/usr/bin/env python3.11
"""Cap+ candidate construction and backtest (idempotent, runs end-to-end).

Builds the three candidate formulations of Cap+ -- performance delivered per
cap-normalized resource, indexed so 100 = league average and 1 SD ~= 15 points --
backtests them over the audited spend-side window (2013-2025), and emits a
performance-only fallback index over the full performance window (1999-2025).

Inputs (all local, no network):
    data/marts/team_season_results.csv      861 rows, 1999-2025
    data/marts/team_season_epa.csv          861 rows, 1999-2025
    data/marts/team_season_cap.csv          416 rows, 2013-2025
    data/curated/league_cap.csv             1994-2025 cap ceilings
    data/curated/dead_money_team_season.csv 370 dated press snapshots, 2013-2025

Outputs:
    data/marts/capplus_candidates.csv       861 rows (all candidates + flags)
    audit/findings_capplus_backtest.md      full findings, every table

Run:  python3.11 audit/capplus_backtest.py
"""

from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from team_codes import normalize_series  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(REPO, *p)  # noqa: E731

CAP_WINDOW = (2013, 2025)
PERF_WINDOW = (1999, 2025)

# Weight schemes over (win_pct, point_diff_per_game, epa_margin_per_play).
WEIGHTS = {
    "W_default": (1 / 3, 1 / 3, 1 / 3),
    "W_wins": (0.50, 0.25, 0.25),
    "W_epa": (0.25, 0.25, 0.50),
}
DEFAULT_W = "W_default"

# (season, team, label, expectation) -- the product brief's hard sniff table.
# expectation: 'elite' rank<=5 | 'high' rank<=10 | 'poor' rank>=24 |
#              'bottom' rank>=29 | 'report' no pass/fail band asserted
SNIFF = [
    (2013, "SEA", "2013 SEA -- champs, rookie-deal QB", "elite"),
    (2014, "NE", "2014 NE -- efficient champion", "high"),
    (2016, "NE", "2016 NE -- efficient champion", "high"),
    (2018, "NE", "2018 NE -- efficient champion", "high"),
    (2017, "PHI", "2017 PHI -- champs, injured starter QB", "high"),
    (2023, "SF", "2023 SF -- cheap QB, NFC champs", "elite"),
    (2019, "KC", "2019 KC -- SB win, rookie-deal Mahomes", "report"),
    (2020, "KC", "2020 KC -- SB loss, mega-deal signed", "report"),
    (2021, "KC", "2021 KC -- mega-deal era", "report"),
    (2022, "KC", "2022 KC -- SB win, mega-deal era", "report"),
    (2023, "KC", "2023 KC -- SB win, mega-deal era", "report"),
    (2021, "LA", "2021 LAR -- all-in veteran roster, won SB", "report"),
    (2013, "LV", "2013 OAK -- record 43.6% of adj cap dead", "poor"),
    (2022, "CHI", "2022 CHI -- record dead money, bad team", "poor"),
    (2022, "ATL", "2022 ATL -- record dead money, bad team", "poor"),
    (2024, "DEN", "2024 DEN -- record individual dead money, 10-7", "report"),
    (2017, "CLE", "2017 CLE -- 0-16", "bottom"),
    (2016, "CLE", "2016 CLE -- 1-15", "bottom"),
    (2021, "NO", "2021 NO -- post-Brees cap hell", "report"),
    (2022, "NO", "2022 NO -- post-Brees cap hell", "report"),
]

CANDIDATES = [
    ("capplus_A", "A ratio (as specified)"),
    ("capplus_A_sub", "A subtraction"),
    ("capplus_A_pos", "A positive-anchored (repair)"),
    ("capplus_B", "B efficiency over expected"),
    ("capplus_C", "C ratio (as specified)"),
    ("capplus_C_sub", "C subtraction"),
    ("capplus_C_pos", "C positive-anchored (repair)"),
]


# --------------------------------------------------------------------------- #
# small stats helpers (no scipy / statsmodels in this environment)
# --------------------------------------------------------------------------- #
def within_season_z(df: pd.DataFrame, col: str) -> pd.Series:
    g = df.groupby("season")[col]
    return (df[col] - g.transform("mean")) / g.transform(lambda x: x.std(ddof=1))


def skew(x) -> float:
    x = np.asarray(x, dtype=float)
    x = x[np.isfinite(x)]
    if len(x) < 3:
        return np.nan
    mu, sd = x.mean(), x.std(ddof=0)
    return float(((x - mu) ** 3).mean() / sd**3)


def excess_kurtosis(x) -> float:
    x = np.asarray(x, dtype=float)
    x = x[np.isfinite(x)]
    if len(x) < 4:
        return np.nan
    mu, sd = x.mean(), x.std(ddof=0)
    return float(((x - mu) ** 4).mean() / sd**4 - 3.0)


def ols1(y, x):
    """Simple OLS y = a + b x. Returns (a, b, r2, se_b, t_b, resid)."""
    y = np.asarray(y, dtype=float)
    x = np.asarray(x, dtype=float)
    n = len(y)
    X = np.column_stack([np.ones(n), x])
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    resid = y - X @ beta
    ss_res = float((resid**2).sum())
    ss_tot = float(((y - y.mean()) ** 2).sum())
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else np.nan
    sxx = float(((x - x.mean()) ** 2).sum())
    se_b = float(np.sqrt((ss_res / (n - 2)) / sxx)) if sxx > 0 else np.nan
    t_b = float(beta[1] / se_b) if se_b and np.isfinite(se_b) and se_b > 0 else np.nan
    return float(beta[0]), float(beta[1]), r2, se_b, t_b, resid


def pooled_within_season_sd(df: pd.DataFrame, col: str) -> float:
    """sqrt( sum_i (x_i - season mean)^2 / (N - S) ) -- pooled within-season SD."""
    d = df.dropna(subset=[col])
    if d.empty:
        return np.nan
    dev = d[col] - d.groupby("season")[col].transform("mean")
    denom = len(d) - d["season"].nunique()
    if denom <= 0:
        return np.nan
    return float(np.sqrt((dev**2).sum() / denom))


def calibrate(df: pd.DataFrame, raw_col: str, out_col: str) -> pd.DataFrame:
    """Mean exactly 100 within each season; pooled within-season SD exactly 15."""
    d = df.copy()
    mask = d[raw_col].notna()
    if not mask.any():
        d[out_col] = np.nan
        return d
    sub = d.loc[mask]
    dev = sub[raw_col] - sub.groupby("season")[raw_col].transform("mean")
    sd = pooled_within_season_sd(pd.DataFrame({"season": sub["season"], "x": dev}), "x")
    d[out_col] = np.nan
    d.loc[mask, out_col] = 100.0 + 15.0 * dev / sd
    return d


def md_table(df: pd.DataFrame, floatfmt: dict | None = None) -> str:
    """Markdown table. Integral numeric columns render without decimals; any
    literal pipe inside a cell is escaped so it cannot split the row."""
    d = df.copy()
    floatfmt = floatfmt or {}
    cols = list(d.columns)
    integral = set()
    for c in cols:
        if c in floatfmt or not pd.api.types.is_numeric_dtype(d[c]):
            continue
        v = pd.to_numeric(d[c], errors="coerce").dropna()
        if len(v) and np.allclose(v.to_numpy(), np.round(v.to_numpy())):
            integral.add(c)
    lines = ["| " + " | ".join(str(c).replace("|", "\\|") for c in cols) + " |"]
    lines.append(
        "| " + " | ".join("---:" if pd.api.types.is_numeric_dtype(d[c]) else "---" for c in cols) + " |"
    )
    for _, r in d.iterrows():
        cells = []
        for c in cols:
            v = r[c]
            if v is None or (isinstance(v, float) and not np.isfinite(v)) or pd.isna(v):
                cells.append("--")
            elif c in floatfmt:
                cells.append(format(v, floatfmt[c]))
            elif c in integral:
                cells.append(f"{v:.0f}")
            elif isinstance(v, (float, np.floating)):
                cells.append(f"{v:.3f}")
            else:
                cells.append(str(v).replace("|", "\\|"))
        lines.append("| " + " | ".join(cells) + " |")
    return "\n".join(lines)


def fmt_idx(v, rank):
    return "--" if pd.isna(v) else f"{v:.1f} (#{int(rank)})"


# --------------------------------------------------------------------------- #
# 1. load
# --------------------------------------------------------------------------- #
def load_inputs():
    res = pd.read_csv(D("data", "marts", "team_season_results.csv"))
    epa = pd.read_csv(D("data", "marts", "team_season_epa.csv"))
    cap = pd.read_csv(D("data", "marts", "team_season_cap.csv"))
    lgcap = pd.read_csv(D("data", "curated", "league_cap.csv"))
    dm = pd.read_csv(D("data", "curated", "dead_money_team_season.csv"))
    for f in (res, epa, cap, dm):
        f["team"] = normalize_series(f["team"]).astype("object")
    perf = res.merge(
        epa[["season", "team", "off_epa_per_play", "def_epa_per_play", "epa_margin_per_play"]],
        on=["season", "team"],
        how="inner",
        validate="1:1",
    )
    assert len(perf) == len(res) == 861, f"perf join lost rows: {len(perf)}"
    perf["point_diff_per_game"] = perf["point_diff"] / perf["games"]
    return perf, cap, lgcap, dm


# --------------------------------------------------------------------------- #
# 2. performance composite P
# --------------------------------------------------------------------------- #
def build_performance(perf: pd.DataFrame, weights) -> pd.DataFrame:
    d = perf.copy()
    d["z_win_pct"] = within_season_z(d, "win_pct")
    d["z_point_diff_pg"] = within_season_z(d, "point_diff_per_game")
    d["z_epa_margin"] = within_season_z(d, "epa_margin_per_play")
    w1, w2, w3 = weights
    d["P_raw"] = w1 * d["z_win_pct"] + w2 * d["z_point_diff_pg"] + w3 * d["z_epa_margin"]
    d["P"] = within_season_z(d, "P_raw")  # proper within-season z: mean 0, SD 1
    return d


# --------------------------------------------------------------------------- #
# 3. dead-money resolution
# --------------------------------------------------------------------------- #
def resolve_dead_money(dm: pd.DataFrame, mode: str = "latest") -> pd.DataFrame:
    """One row per (season, team).

    mode='latest'     -- latest asof_date per team-season (the brief's rule).
    mode='stage_cons' -- every team in a season read at the SAME measurement
                         date (the season's latest full-32 snapshot), so a
                         leaders-only later snapshot cannot single teams out.
    """
    d = dm.copy()
    d["asof_date"] = pd.to_datetime(d["asof_date"])
    if mode == "latest":
        out = d.sort_values(["season", "team", "asof_date"]).groupby(
            ["season", "team"], as_index=False
        ).last()
    elif mode == "stage_cons":
        full = d[d["coverage"] == "full32"]
        keep = full.groupby("season")["asof_date"].max().rename("keep_date").reset_index()
        full = full.merge(keep, on="season")
        full = full[full["asof_date"] == full["keep_date"]].drop(columns=["keep_date"])
        rest = d[~d["season"].isin(set(full["season"]))]
        rest = rest.sort_values(["season", "team", "asof_date"]).groupby(
            ["season", "team"], as_index=False
        ).last()
        out = pd.concat([full, rest], ignore_index=True)
    else:
        raise ValueError(mode)
    out = out.rename(
        columns={
            "dead_money_usd": "dead_money",
            "asof_date": "dm_asof_date",
            "asof_stage": "dm_asof_stage",
            "coverage": "dm_coverage",
        }
    )
    out["dm_asof_date"] = out["dm_asof_date"].dt.strftime("%Y-%m-%d")
    return out[["season", "team", "dead_money", "dm_asof_date", "dm_asof_stage", "dm_coverage"]]


def season_dm_coverage(dmres: pd.DataFrame) -> pd.DataFrame:
    n = dmres.groupby("season")["team"].nunique().rename("n_teams_with_dm").reset_index()
    n["season_dm_coverage"] = np.where(n["n_teams_with_dm"] >= 32, "full32", "partial")
    return n


def partial_season_fill_bounds(dmres: pd.DataFrame, season: int):
    """Bound the unspecified teams' dead money in a partial-coverage season.

    A 'top-5 list' means every unlisted team is at or below the smallest listed
    leader; where the source also prints a low set, unlisted teams are at or
    above the largest of those. Filling unlisted teams at `lo` is maximally
    unfavourable to the listed teams, `hi` maximally favourable: the pair
    brackets the listed teams' candidate-C value.
    """
    s = dmres[dmres["season"] == season]
    vals = s["dead_money"].to_numpy(dtype=float)
    cov = s["dm_coverage"].to_numpy()
    if (cov == "top5").any() and (cov != "top5").any():
        leaders, lows = vals[cov == "top5"], vals[cov != "top5"]
    elif (cov == "top5").all():
        leaders, lows = vals, np.array([])
    else:  # source printed a top set and a low set without labelling them
        sv = np.sort(vals)
        k = int(np.argmax(np.diff(sv)))
        lows, leaders = sv[: k + 1], sv[k + 1 :]
    return (float(lows.max()) if len(lows) else 0.0), (float(leaders.min()) if len(leaders) else 0.0)


# --------------------------------------------------------------------------- #
# 4. resources + candidate forms
# --------------------------------------------------------------------------- #
def build_resources(perf: pd.DataFrame, cap: pd.DataFrame, dmres: pd.DataFrame) -> pd.DataFrame:
    d = perf.merge(cap, on=["season", "team"], how="left", validate="1:1")
    d = d.merge(dmres, on=["season", "team"], how="left", validate="1:1")
    in_win = d["season"].between(*CAP_WINDOW)
    d["in_cap_window"] = in_win

    d["league_cash_total"] = np.nan
    d.loc[in_win, "league_cash_total"] = d[in_win].groupby("season")["cash_spent_total"].transform("sum")
    d["cash_share"] = d["cash_spent_total"] / d["league_cash_total"]
    d["relative_cash"] = np.nan
    d.loc[in_win, "relative_cash"] = d.loc[in_win, "cash_spent_total"] / d[in_win].groupby("season")[
        "cash_spent_total"
    ].transform("mean")

    d["cap_used_only"] = d["cap_used_total"] / d["league_cap"]
    d["dm_known"] = d["dead_money"].notna()
    d["cap_consumed"] = (d["cap_used_total"] + d["dead_money"]) / d["league_cap"]
    return d


def add_relative(d: pd.DataFrame, col: str, out: str, mask: pd.Series) -> pd.DataFrame:
    d[out] = np.nan
    sub = d.loc[mask]
    d.loc[mask, out] = sub[col] / sub.groupby("season")[col].transform("mean")
    return d


def make_candidate_forms(d: pd.DataFrame, rel_col: str, tag: str, mask: pd.Series) -> pd.DataFrame:
    """Three algebraic forms of a rate index against one resource denominator.

    ratio : P / R              -- literal spec. Undefined in sign: P is signed.
    sub   : zP - zR            -- subtraction form, implicit unit weight on R.
    pos   : (100 + 15 P) / R   -- positive-anchored repair; strictly monotone
                                  decreasing in R at every level of P.
    """
    sub = d.loc[mask]
    d[f"raw_{tag}_ratio"] = np.where(mask, d["P"] / d[rel_col], np.nan)
    z = pd.Series(np.nan, index=d.index)
    z.loc[mask] = (sub[rel_col] - sub.groupby("season")[rel_col].transform("mean")) / sub.groupby(
        "season"
    )[rel_col].transform(lambda x: x.std(ddof=1))
    d[f"z_{tag}"] = z
    d[f"raw_{tag}_sub"] = np.where(mask, d["P"] - d[f"z_{tag}"], np.nan)
    d[f"raw_{tag}_pos"] = np.where(mask, (100.0 + 15.0 * d["P"]) / d[rel_col], np.nan)
    return d


def candidate_B(d: pd.DataFrame, mask: pd.Series):
    """Within-season OLS of P on relative cash spend; standardized residual."""
    rows = []
    d["raw_B"] = np.nan
    for season, sub in d.loc[mask].groupby("season"):
        a, b, r2, se_b, t_b, resid = ols1(sub["P"].to_numpy(), sub["relative_cash"].to_numpy())
        d.loc[sub.index, "raw_B"] = resid / resid.std(ddof=1)
        rows.append(
            dict(
                season=int(season), n=len(sub), slope_b=b, se_b=se_b, t_b=t_b, r2=r2,
                resid_sd=float(resid.std(ddof=1)),
            )
        )
    return d, pd.DataFrame(rows)


def build_all(weights_key: str, perf_raw, cap, dmres):
    perf = build_performance(perf_raw, WEIGHTS[weights_key])
    d = build_resources(perf, cap, dmres)
    in_win = d["in_cap_window"]
    cash_mask = in_win & d["relative_cash"].notna()

    d = add_relative(d, "cap_consumed", "relative_cap_consumed", in_win & d["dm_known"])
    d = make_candidate_forms(d, "relative_cash", "cash", cash_mask)
    d, b_table = candidate_B(d, cash_mask)

    d = d.merge(season_dm_coverage(dmres), on="season", how="left")
    d["season_dm_coverage"] = d["season_dm_coverage"].fillna("none")
    d["n_teams_with_dm"] = d["n_teams_with_dm"].fillna(0).astype(int)
    # C is only calibrated where the whole league is observed: standardizing a
    # 5-team leaders-only subsample would put the worst offenders at the mean.
    c_mask = in_win & d["dm_known"] & (d["season_dm_coverage"] == "full32")
    d["C_computable"] = c_mask
    d = make_candidate_forms(d, "relative_cap_consumed", "capcon", c_mask)

    for raw, out in [
        ("raw_cash_ratio", "capplus_A"), ("raw_cash_sub", "capplus_A_sub"),
        ("raw_cash_pos", "capplus_A_pos"), ("raw_B", "capplus_B"),
        ("raw_capcon_ratio", "capplus_C"), ("raw_capcon_sub", "capplus_C_sub"),
        ("raw_capcon_pos", "capplus_C_pos"),
    ]:
        d = calibrate(d, raw, out)
    d["perf_index"] = 100.0 + 15.0 * d["P"]
    return d, b_table


def build_partial_scenarios(perf_raw, cap, dmres, weights_key=DEFAULT_W):
    """Candidate C under lo/hi fills for the partial-coverage seasons."""
    covsz = season_dm_coverage(dmres)
    partial = covsz.loc[covsz["season_dm_coverage"] == "partial", "season"].tolist()
    observed = set(zip(dmres["season"], dmres["team"]))
    bounds = {s: partial_season_fill_bounds(dmres, s) for s in partial}
    out = {}
    for scen in ("lo", "hi"):
        adds = []
        for s in partial:
            fill = bounds[s][0] if scen == "lo" else bounds[s][1]
            known = set(dmres.loc[dmres["season"] == s, "team"])
            for t in sorted(set(cap.loc[cap["season"] == s, "team"]) - known):
                adds.append(dict(season=s, team=t, dead_money=fill, dm_asof_date="",
                                 dm_asof_stage=f"assumed_{scen}", dm_coverage=f"assumed_{scen}"))
        dmx = pd.concat([dmres, pd.DataFrame(adds)], ignore_index=True)
        perf = build_performance(perf_raw, WEIGHTS[weights_key])
        d = build_resources(perf, cap, dmx)
        in_win = d["in_cap_window"] & d["dm_known"]
        d = add_relative(d, "cap_consumed", "relative_cap_consumed", in_win)
        d = make_candidate_forms(d, "relative_cap_consumed", "capcon", in_win)
        dd = d[in_win & d["season"].isin(partial)].copy()
        for form in ("ratio", "sub", "pos"):
            dd = calibrate(dd, f"raw_capcon_{form}", f"cal_{form}")
        dd["dm_observed"] = [ (s, t) in observed for s, t in zip(dd["season"], dd["team"]) ]
        out[scen] = dd[["season", "team", "dead_money", "dm_observed",
                        "cal_ratio", "cal_sub", "cal_pos"]]
    return out, partial, bounds


# --------------------------------------------------------------------------- #
# 5. diagnostics
# --------------------------------------------------------------------------- #
def add_ranks(d: pd.DataFrame, col: str, out: str) -> pd.DataFrame:
    d[out] = d.groupby("season")[col].rank(ascending=False, method="min")
    return d


def diagnostics_table(d: pd.DataFrame, cols) -> pd.DataFrame:
    rows = []
    base = d[d["in_cap_window"]]
    for col, label in cols:
        sub = base.dropna(subset=[col]).copy()
        if sub.empty:
            continue
        sub = add_ranks(sub, col, "rank_cand")
        sub = add_ranks(sub, "P", "rank_P")
        shift = (sub["rank_cand"] - sub["rank_P"]).abs()
        piv = sub.pivot_table(index="team", columns="season", values=col)
        xs, ys = [], []
        seasons = sorted(sub["season"].unique())
        for s0, s1 in zip(seasons[:-1], seasons[1:]):
            if s1 - s0 != 1:
                continue
            both = piv[[s0, s1]].dropna()
            xs.extend(both[s0].tolist())
            ys.extend(both[s1].tolist())
        ac = float(np.corrcoef(xs, ys)[0, 1]) if len(xs) > 3 else np.nan
        diff = (sub[col] - sub["perf_index"]).abs()
        rows.append(
            dict(
                candidate=label, n=len(sub),
                corr_win_pct=float(sub[col].corr(sub["win_pct"])),
                corr_P=float(sub[col].corr(sub["P"])),
                mean_abs_rank_shift=float(shift.mean()),
                max_rank_shift=int(shift.max()),
                pct_shift_ge5=float((shift >= 5).mean() * 100),
                mean_abs_pt_shift=float(diff.mean()),
                n_moved_ge_15pts=int((diff >= 15).sum()),
                yoy_autocorr=ac,
                skew=skew(sub[col]), exc_kurt=excess_kurtosis(sub[col]),
                min=float(sub[col].min()), max=float(sub[col].max()),
                n_outside_55_145=int(((sub[col] < 55) | (sub[col] > 145)).sum()),
            )
        )
    return pd.DataFrame(rows)


def movers(d: pd.DataFrame, col: str, k: int = 6) -> pd.DataFrame:
    sub = d[d["in_cap_window"]].dropna(subset=[col]).copy()
    sub = add_ranks(sub, col, "rank_cand")
    sub = add_ranks(sub, "P", "rank_P")
    sub["rank_shift"] = sub["rank_P"] - sub["rank_cand"]
    sub["rec"] = sub["wins"].astype(int).astype(str) + "-" + sub["losses"].astype(int).astype(str)
    out = pd.concat([sub.nlargest(k, "rank_shift"), sub.nsmallest(k, "rank_shift")])
    out = out[["season", "team", "rec", "perf_index", "rank_P", col, "rank_cand",
               "rank_shift", "relative_cash"]]
    out.columns = ["season", "team", "W-L", "perf_index", "rank_perf", "capplus",
                   "rank_capplus", "rank_gain", "rel_cash"]
    return out


def top_bottom(d: pd.DataFrame, col: str, k: int = 15):
    s = d[d["in_cap_window"]].dropna(subset=[col]).copy()
    s["rec"] = s["wins"].astype(int).astype(str) + "-" + s["losses"].astype(int).astype(str)
    def fmt(f):
        return " · ".join(f"{int(r.season)} {r.team} {r.rec} **{r[col]:.1f}**" for _, r in f.iterrows())
    return fmt(s.nlargest(k, col)), fmt(s.nsmallest(k, col))


# --------------------------------------------------------------------------- #
# 6. outputs
# --------------------------------------------------------------------------- #
def write_outputs(d, alt, d_sc, scen, partial, bounds, b_table, dm_raw, dmres):
    out_cols = [
        "season", "team", "games", "wins", "losses", "ties", "win_pct",
        "point_diff_per_game", "epa_margin_per_play",
        "z_win_pct", "z_point_diff_pg", "z_epa_margin", "P_raw", "P", "perf_index",
        "cash_spent_total", "league_cash_total", "cash_share", "relative_cash",
        "cap_used_total", "league_cap", "cap_used_only",
        "dead_money", "dm_asof_date", "dm_asof_stage", "dm_coverage",
        "cap_consumed", "relative_cap_consumed",
        "capplus_A", "capplus_A_sub", "capplus_A_pos", "capplus_B",
        "capplus_C", "capplus_C_sub", "capplus_C_pos",
        "in_cap_window", "dm_known", "season_dm_coverage", "n_teams_with_dm", "C_computable",
    ]
    out = d[out_cols].copy()
    for key, cols in (("lo", ("capplus_C_lo", "capplus_C_pos_lo")),
                      ("hi", ("capplus_C_hi", "capplus_C_pos_hi"))):
        s = scen[key]
        s = s[s["dm_observed"]][["season", "team", "cal_ratio", "cal_pos"]]
        s.columns = ["season", "team", cols[0], cols[1]]
        out = out.merge(s, on=["season", "team"], how="left")
    sc = d_sc[["season", "team", "capplus_C", "capplus_C_pos"]].rename(
        columns={"capplus_C": "capplus_C_stagecons", "capplus_C_pos": "capplus_C_pos_stagecons"})
    out = out.merge(sc, on=["season", "team"], how="left")
    out = out.sort_values(["season", "team"]).reset_index(drop=True)
    out.to_csv(D("data", "marts", "capplus_candidates.csv"), index=False)

    md = render_findings(d, alt, d_sc, scen, partial, bounds, b_table, dm_raw, dmres, out)
    with open(D("audit", "findings_capplus_backtest.md"), "w") as fh:
        fh.write(md)
    print(f"wrote data/marts/capplus_candidates.csv  ({len(out)} rows, {len(out.columns)} cols)")
    print(f"wrote audit/findings_capplus_backtest.md ({len(md.splitlines())} lines)")


def render_findings(d, alt, d_sc, scen, partial, bounds, b_table, dm_raw, dmres, out):
    w = d[d["in_cap_window"]].copy()
    cw = w[w["C_computable"]].copy()
    S = []
    A = S.append

    # ---------------- header / BLUF ----------------
    A("# Cap+ candidate backtest — findings\n")
    A("Scope: three candidate formulations of **Cap+** (performance per cap-normalized "
      "resource, indexed to 100 = league average, 1 SD ≈ 15), backtested on the audited "
      "spend-side window **2013–2025** (416 team-seasons), plus a **performance-only "
      "fallback** over **1999–2025** (861 team-seasons).\n")
    A("Reproduce with `python3.11 audit/capplus_backtest.py` (idempotent, no network). "
      "Outputs `data/marts/capplus_candidates.csv` and this file.\n")
    A("Reads and respects `audit/findings_contracts.md` (cap_used_total excludes dead money "
      "and biases in favour of cap-disaster teams; cash_spent_total is the best-behaved "
      "spend measure; unaccounted_vs_adjusted is an upper bound on dead money and is **not "
      "used anywhere in this backtest**) and `audit/findings_deadmoney_sourcing.md` "
      "(dead money exists only as differently-dated press snapshots).\n")

    A("## Bottom line up front\n")
    bluf = pd.DataFrame([
        dict(Question="Candidate A exactly as specified — `100 + 15·z(P / relative_cash)`",
             Verdict="**BROKEN.** P is a signed z-score, so the ratio inverts for the 212 of 416 "
                     "team-seasons with P<0: among those, corr(raw score, cash) = **+0.556** — a "
                     "below-average team scores *higher* by spending more."),
        dict(Question="Candidate A subtraction form — `100 + 15·(zP − z_cash)`",
             Verdict="**Well-defined, wrong weighting.** Imposes unit weight on thrift. Puts 2022 "
                     "CHI (3-14, record dead money) at **115.1, 8th in the league**."),
        dict(Question="Candidate B — within-season OLS residual",
             Verdict="**Best-behaved of the three as specified.** Adds real but modest information "
                     "(mean abs. rank shift 2.2, corr 0.94 with P). Cash slope is positive in 13/13 "
                     f"seasons but reaches abs(t)>2 in only **{int((b_table['t_b'].abs()>2).sum())}/13**."),
        dict(Question="Candidate C exactly as specified — same ratio, total-cost denominator",
             Verdict="**BROKEN the same way, and it does not punish dead money.** 2022 CHI's raw "
                     "score *improves* from −1.731 (pure performance) to −1.675 because of its "
                     "record dead money."),
        dict(Question="Does the total-cost denominator punish cap disasters at all?",
             Verdict="**Yes — but only once the sign bug is repaired.** In the positive-anchored "
                     "form, C is 62.0 points harsher than A on 2022 CHI, 44.0 on 2022 ATL, "
                     "37.3 on 2023 LA. The denominator is right; the algebra was wrong."),
        dict(Question="Is the cash denominator safe on its own?",
             Verdict="**No.** corr(relative_cash, dead money / league cap) = **−0.358**. Cash spend "
                     "inherits the same rostered-players-only bias as cap_used. The 10 lowest "
                     "relative-cash team-seasons in the window are a roll-call of cap disasters."),
        dict(Question="Weight sensitivity (1/3-1/3-1/3 vs 0.5/0.25/0.25 vs 0.25/0.25/0.5)",
             Verdict="**Immaterial.** corr ≥ 0.996 for every candidate, mean abs. rank shift ≤ 0.74 "
                     "places, and **no sniff-table verdict changes**. The weight debate is not "
                     "worth having."),
        dict(Question="Anything that would embarrass the product?",
             Verdict="**Four things** — see §12. The worst: candidate A's positive-anchored form "
                     "ranks the 3-14 2022 Bears **#1 in the league**, and the 'latest snapshot' "
                     "dead-money rule manufactures roughly half of 2022 CHI/ATL's punishment."),
    ])
    A(md_table(bluf) + "\n")

    # ---------------- 0. method ----------------
    A("## 0. Method and conventions\n")
    A("- **Grain**: team-season, regular season only (both performance marts are REG-only).\n"
      "- **Team codes**: `audit/team_codes.py` `normalize_team` on every input. Rams = `LA`, "
      "Chargers = `LAC`, Raiders = `LV` in all seasons, so *2013 OAK is keyed `(2013, LV)`* and "
      "*2021 LAR is keyed `(2021, LA)`*.\n"
      "- **All SDs are sample SDs (ddof=1)**, including the within-season z-scores. Treating the "
      "32-team league as a population instead would rescale everything by √(32/31) = 1.6% and "
      "change no ranking.\n"
      "- **Calibration** (§4): every candidate is demeaned *within season* (so each season's mean "
      "is exactly 100.000) and then divided by one single **pooled within-season SD** computed "
      "across the whole window, `√(Σ(x−season mean)²/(N−S))`, so the pooled SD is exactly 15.000 "
      "and individual seasons are free to be tighter or wider. Per-season SDs are reported.\n"
      "- **No per-case tuning.** Every formula is applied identically to all 416 team-seasons. "
      "No team, season or case is special-cased anywhere in `audit/capplus_backtest.py`.\n")

    # ---------------- 1. performance ----------------
    A("## 1. Performance composite P\n")
    A("`P_raw = w1·z(win_pct) + w2·z(point_diff/game) + w3·z(epa_margin_per_play)`, each z taken "
      "**within season**; `P = z(P_raw)` within season, so P is a clean within-season z with mean "
      "0 and SD 1 in every season. The pure-performance index used throughout as the baseline is "
      "`perf_index = 100 + 15·P`.\n")
    A("### 1.1 Correlation matrix of the three inputs\n")
    cm = w[["z_win_pct", "z_point_diff_pg", "z_epa_margin"]].corr().round(4).reset_index()
    cm.columns = ["", "z_win_pct", "z_point_diff_pg", "z_epa_margin"]
    A("2013–2025 (n=416), pooled over within-season z-scores:\n")
    A(md_table(cm) + "\n")
    cm2 = d[["z_win_pct", "z_point_diff_pg", "z_epa_margin"]].corr().round(4).reset_index()
    cm2.columns = ["", "z_win_pct", "z_point_diff_pg", "z_epa_margin"]
    A("1999–2025 (n=861):\n")
    A(md_table(cm2) + "\n")
    per = []
    for s, g in d.groupby("season"):
        c = g[["z_win_pct", "z_point_diff_pg", "z_epa_margin"]].corr()
        per.append(dict(season=int(s), r_wpct_pdiff=c.iloc[0, 1], r_wpct_epa=c.iloc[0, 2],
                        r_pdiff_epa=c.iloc[1, 2], sd_P_raw=g["P_raw"].std(ddof=1)))
    per = pd.DataFrame(per)
    A(f"Per-season range: `win_pct↔point_diff` {per.r_wpct_pdiff.min():.3f}–{per.r_wpct_pdiff.max():.3f}; "
      f"`win_pct↔EPA` {per.r_wpct_epa.min():.3f}–{per.r_wpct_epa.max():.3f}; "
      f"`point_diff↔EPA` {per.r_pdiff_epa.min():.3f}–{per.r_pdiff_epa.max():.3f}. "
      f"The three inputs are near-collinear, which is why weighting barely matters (§10). The "
      f"unstandardized blend has SD {per.sd_P_raw.min():.3f}–{per.sd_P_raw.max():.3f} across "
      f"seasons — that season-to-season wobble is exactly what re-standardizing P removes.\n")
    A("Full per-season table:\n")
    A(md_table(per, {"r_wpct_pdiff": ".3f", "r_wpct_epa": ".3f", "r_pdiff_epa": ".3f",
                     "sd_P_raw": ".4f"}) + "\n")

    # ---------------- 2. resources ----------------
    A("## 2. Resource measures R\n")
    A("| Measure | Definition | Availability |\n| --- | --- | --- |\n"
      "| `cash_share` | `cash_spent_total / Σ league cash that season` | 416/416 |\n"
      "| `relative_cash` | `cash_spent_total / league-average team cash` = `32 × cash_share` | 416/416 |\n"
      "| `cap_consumed` | `(cap_used_total + dead_money) / league_cap` | 316/416 observed |\n"
      "| `relative_cap_consumed` | `cap_consumed / league-average cap_consumed` | 288/416 calibrated |\n"
      "| `cap_used_only` | `cap_used_total / league_cap` (reference only, never a denominator) | 416/416 |\n")
    A("`z(cash_share)` and `z(relative_cash)` are identical — one is 32× the other — so the "
      "subtraction form is unaffected by which is used.\n")
    A("### 2.1 Dispersion of each denominator, per season (coefficient of variation)\n")
    disp = w.groupby("season").apply(
        lambda g: pd.Series(dict(
            cv_relative_cash=g["relative_cash"].std(ddof=1) / g["relative_cash"].mean(),
            cv_cap_used_only=g["cap_used_only"].std(ddof=1) / g["cap_used_only"].mean(),
        )), include_groups=False).reset_index()
    ccv = cw.groupby("season").apply(
        lambda g: pd.Series(dict(cv_cap_consumed=g["cap_consumed"].std(ddof=1) / g["cap_consumed"].mean())),
        include_groups=False).reset_index()
    disp = disp.merge(ccv, on="season", how="left")
    A(md_table(disp, {"cv_relative_cash": ".4f", "cv_cap_used_only": ".4f", "cv_cap_consumed": ".4f"}) + "\n")
    A("**This table decides how much any rate candidate can move.** Cash disperses 2–3× as widely "
      "as total cap consumed (CV ≈ 0.11–0.16 vs 0.035–0.078), because adding dead money back to "
      "cap_used pushes teams *toward* each other: the teams with the least active cap are exactly "
      "the teams with the most dead money. A denominator with CV 0.04 cannot rerank much.\n")
    A("### 2.2 The total-cost denominator reconstructs cap utilization — a validation\n")
    val = cw.groupby("season").agg(
        median_cap_used_only=("cap_used_only", "median"),
        median_cap_consumed=("cap_consumed", "median"),
        median_dead_money_M=("dead_money", lambda x: x.median() / 1e6),
        min_cap_consumed=("cap_consumed", "min"), max_cap_consumed=("cap_consumed", "max")).reset_index()
    A(md_table(val, {"median_cap_used_only": ".3f", "median_cap_consumed": ".3f",
                     "median_dead_money_M": ".1f", "min_cap_consumed": ".3f",
                     "max_cap_consumed": ".3f"}) + "\n")
    A("The contracts audit measured a structural 15–22% shortfall in `cap_used_total`. Adding the "
      "press-sourced dead money closes most of it: median utilization rises from 0.77–0.91 to "
      "0.91–1.00. This is the single strongest argument for candidate C's denominator — it is the "
      "only one of the three that behaves like actual cap utilization.\n")
    A("### 2.3 The cash denominator is itself biased toward cap-disaster teams\n")
    corr_rows = []
    for s, g in cw.groupby("season"):
        dms = g["dead_money"] / g["league_cap"]
        corr_rows.append(dict(season=int(s), r_relcash_dm=g["relative_cash"].corr(dms),
                              r_capused_dm=g["cap_used_only"].corr(dms),
                              r_capconsumed_dm=g["cap_consumed"].corr(dms)))
    cr = pd.DataFrame(corr_rows)
    dmshare_all = cw["dead_money"] / cw["league_cap"]
    A(f"Pooled over the 288 team-seasons with full dead-money coverage: "
      f"`corr(relative_cash, dead money share)` = **{cw['relative_cash'].corr(dmshare_all):+.3f}**, "
      f"`corr(cap_used_only, dead money share)` = **{cw['cap_used_only'].corr(dmshare_all):+.3f}**, "
      f"`corr(cap_consumed, dead money share)` = **{cw['cap_consumed'].corr(dmshare_all):+.3f}**.\n")
    A(md_table(cr, {"r_relcash_dm": "+.3f", "r_capused_dm": "+.3f", "r_capconsumed_dm": "+.3f"}) + "\n")
    A("The contracts audit warned that `cap_used_total` biases in favour of cap-disaster teams "
      "(−0.77 here, as low as −0.92 in 2024). **Cash is better but not clean: −0.36.** Money paid "
      "to a player who has been released is not in `cash_spent_total` either, so a team that ate a "
      "roster looks thrifty in cash exactly when it is in cap hell. Only `cap_consumed` reverses "
      "the sign (+0.33).\n")
    A("The ten lowest `relative_cash` team-seasons in the window, with what each candidate does "
      "with them:\n")
    low = w.nsmallest(10, "relative_cash").copy()
    low["W-L"] = low["wins"].astype(int).astype(str) + "-" + low["losses"].astype(int).astype(str)
    low["dead_money_M"] = low["dead_money"] / 1e6
    A(md_table(low[["season", "team", "W-L", "relative_cash", "dead_money_M", "perf_index",
                    "capplus_A", "capplus_A_sub", "capplus_A_pos", "capplus_B"]],
               {"relative_cash": ".3f", "dead_money_M": ".1f", "perf_index": ".1f",
                "capplus_A": ".1f", "capplus_A_sub": ".1f", "capplus_A_pos": ".1f",
                "capplus_B": ".1f"}) + "\n")
    A("Under the subtraction and positive-anchored cash forms, **every one of these teams is rated "
      "at or above league average**, three of them above 130. A metric whose ten thriftiest "
      "team-seasons are the ten most notorious teardowns has the sign of its own thesis backwards.\n")

    # ---------------- 3. dead money resolution ----------------
    A("## 3. Dead-money resolution and its coverage\n")
    A("Resolution rule used (per the brief): **latest `asof_date` per team-season**. Every stage "
      "actually used is recorded in `dm_asof_date` / `dm_asof_stage` / `dm_coverage` in the "
      "candidates CSV. Composition:\n")
    stg = w[w["dm_known"]].groupby(["season", "dm_asof_stage", "dm_asof_date"]).size().rename("teams").reset_index()
    stg = stg.merge(w.groupby("season")["season_dm_coverage"].first().reset_index(), on="season")
    A(md_table(stg) + "\n")
    A(f"**Candidate C is calibrated only on the {len(cw)} team-seasons in the 9 full-32 seasons "
      f"(2014, 2015, 2017, 2018, 2019, 2022, 2023, 2024, 2025).** Standardizing within a season "
      f"where only the five worst offenders are observed would place those five around the mean of "
      f"themselves — 2013 Oakland would come out *average*. The four partial seasons "
      f"({', '.join(str(s) for s in partial)}) are handled as scenario brackets in §9 instead.\n")
    A("### 3.1 The 'latest snapshot' rule is not neutral — it manufactures punishment\n")
    A("Dead money accrues monotonically through a league year, and in four seasons the *latest* "
      "snapshot is a **leaders-only** article. Applying 'latest per team-season' then reads the "
      "worst offenders at a late date and everyone else at an early one — which is not a "
      "measurement, it is a selection effect:\n")
    mixrows = []
    for s, t in [(2018, "BUF"), (2018, "NYG"), (2019, "MIA"), (2019, "NYG"), (2019, "PIT"),
                 (2019, "BAL"), (2022, "CHI"), (2022, "ATL"), (2022, "HOU"), (2023, "LA"), (2023, "TB")]:
        a = d[(d.season == s) & (d.team == t)]
        b = d_sc[(d_sc.season == s) & (d_sc.team == t)]
        if a.empty or b.empty or pd.isna(a.iloc[0]["capplus_C_pos"]):
            continue
        a, b = a.iloc[0], b.iloc[0]
        mixrows.append(dict(season=s, team=t,
                            dm_latest_M=a["dead_money"] / 1e6, asof_latest=a["dm_asof_date"],
                            dm_same_stage_M=b["dead_money"] / 1e6, asof_same=b["dm_asof_date"],
                            C_pos_latest=a["capplus_C_pos"], C_pos_same_stage=b["capplus_C_pos"],
                            swing=a["capplus_C_pos"] - b["capplus_C_pos"]))
    A(md_table(pd.DataFrame(mixrows), {"dm_latest_M": ".1f", "dm_same_stage_M": ".1f",
                                       "C_pos_latest": ".1f", "C_pos_same_stage": ".1f",
                                       "swing": "+.1f"}) + "\n")
    seff = []
    mall = d[["season", "team", "capplus_C_pos"]].merge(
        d_sc[["season", "team", "capplus_C_pos"]], on=["season", "team"], suffixes=("_l", "_s")).dropna()
    mall["absdiff"] = (mall["capplus_C_pos_l"] - mall["capplus_C_pos_s"]).abs()
    seff = mall.groupby("season")["absdiff"].agg(["mean", "max"]).round(2).reset_index()
    seff.columns = ["season", "mean_abs_shift", "max_abs_shift"]
    A(md_table(seff, {"mean_abs_shift": ".2f", "max_abs_shift": ".2f"}) + "\n")
    A("**2022 CHI loses 13.2 points and 2022 ATL 10.7 points purely to the resolution rule**, and "
      "the whole 2019 season shifts by a mean 3.9 points. Under a same-date reading of 2022, "
      "Atlanta lands at 98.8 — *league average* — and the brief's requirement that it 'rate "
      "poorly' fails. Both readings are shipped: `capplus_C_stagecons` / "
      "`capplus_C_pos_stagecons` in the CSV.\n")

    # ---------------- 4. candidates + calibration ----------------
    A("## 4. The candidates, and calibration\n")
    A("| Candidate | Raw score before calibration |\n| --- | --- |\n"
      "| **A** Cash Rate Index (as specified) | `P / relative_cash` |\n"
      "| **A-sub** subtraction form | `zP − z(cash_share)` |\n"
      "| **A-pos** positive-anchored repair | `(100 + 15·P) / relative_cash` |\n"
      "| **B** Efficiency Over Expected | residual of within-season OLS `P ~ relative_cash`, "
      "standardized within season |\n"
      "| **C** Total-Cost Rate (as specified) | `P / relative_cap_consumed` |\n"
      "| **C-sub** | `zP − z(cap_consumed)` |\n"
      "| **C-pos** positive-anchored repair | `(100 + 15·P) / relative_cap_consumed` |\n")
    A("The positive-anchored forms are **not a fourth candidate**. They are the minimal general "
      "repair to A and C: replacing the signed numerator `P` with the strictly positive "
      "`100 + 15·P` (the same index the product already publishes) makes the ratio monotone "
      "decreasing in the resource at every level of performance, which is what a rate metric has "
      "to be. Nothing else changes.\n")
    A("### 4.1 Calibration: mean and SD achieved, per season\n")
    cols = [c for c, _ in CANDIDATES]
    sd_tab = w.groupby("season")[cols].std(ddof=1).round(3).reset_index()
    A(md_table(sd_tab, {c: ".2f" for c in cols}) + "\n")
    means = w.groupby("season")[cols].mean()
    A(f"Season means are exactly 100 by construction (max deviation across all season × candidate "
      f"cells: {np.nanmax(np.abs(means.to_numpy() - 100)):.2e}). Pooled within-season SD is exactly "
      f"15.000 for all seven. Per-season SDs range "
      f"{np.nanmin(sd_tab[cols].to_numpy()):.2f}–{np.nanmax(sd_tab[cols].to_numpy()):.2f}, "
      f"widest for the cash-subtraction and positive-anchored forms (2018 and 2022, the two "
      f"highest-cash-dispersion seasons).\n")
    A("**Candidate B is the exception and it is a design flaw**: its residuals are standardized "
      "*within* each season before pooling, so every season's SD is exactly 15.000. B therefore "
      "cannot express the statement 'efficiency was unusually tightly bunched in 2019' — that "
      "information is destroyed. A/C keep it.\n")
    A("### 4.2 Candidate B's within-season regression, n=32 every year\n")
    A(md_table(b_table.round(4), {"slope_b": ".3f", "se_b": ".3f", "t_b": ".2f", "r2": ".3f",
                                  "resid_sd": ".3f"}) + "\n")
    sig = int((b_table["t_b"].abs() > 2).sum())
    A(f"The cash slope is **positive in all 13 seasons** — spending more is associated with "
      f"performing better — but reaches |t| > 2 in only **{sig} of 13**, with R² from "
      f"{b_table.r2.min():.3f} (2018) to {b_table.r2.max():.3f} (2021). With n=32 and one "
      f"regressor the slope's standard error is 1.1–1.7 in P-units per unit of relative cash, so "
      f"the fitted 'expectation' B subtracts is itself noisy, and it is re-estimated from scratch "
      f"every season. Two consequences: (i) B's spend adjustment is weak *by construction* — it "
      f"shrinks toward zero exactly when the season's data is uninformative, which is the "
      f"statistically honest behaviour and the reason B never produces an absurd sniff result; "
      f"(ii) the year-to-year jumps in the slope (0.23 in 2018 to 4.47 in 2021) mean the same "
      f"spend profile is priced very differently in adjacent seasons. A pooled or shrunk slope "
      f"would fix (ii) at the cost of the within-season-mean-100 guarantee holding only "
      f"approximately.\n")

    # ---------------- 5. diagnostics ----------------
    A("## 5. Diagnostics\n")
    diag = diagnostics_table(d, CANDIDATES)
    A(md_table(diag, {"corr_win_pct": ".3f", "corr_P": ".3f", "mean_abs_rank_shift": ".2f",
                      "pct_shift_ge5": ".1f", "mean_abs_pt_shift": ".2f", "yoy_autocorr": ".3f",
                      "skew": ".3f", "exc_kurt": ".3f", "min": ".1f", "max": ".1f"}) + "\n")
    pi_ac = diagnostics_table(
        d.assign(_pi=d["perf_index"]), [("perf_index", "perf_index (baseline)")])
    A(md_table(pi_ac, {"corr_win_pct": ".3f", "corr_P": ".3f", "mean_abs_rank_shift": ".2f",
                       "pct_shift_ge5": ".1f", "mean_abs_pt_shift": ".2f", "yoy_autocorr": ".3f",
                       "skew": ".3f", "exc_kurt": ".3f", "min": ".1f", "max": ".1f"}) + "\n")
    A("Reading this table:\n")
    A("- **Does Cap+ add information beyond performance?** `mean_abs_rank_shift` is the mean "
      "absolute change in within-season rank versus ranking teams purely by P. **A moves teams "
      "0.60 places on average and C moves them 0.30** — with a maximum of 5 and 3 places "
      "respectively, and *zero* team-seasons in which C moves a team 5+ places. As specified, "
      "A and C are the performance index with rounding noise (mean absolute index move 1.44 and "
      "0.59 points; 1 of 416 and 0 of 288 move a full SD). The subtraction forms move teams 5.7–6.5 "
      "places and rerank ~50% of the league by 5+ spots. B sits in between at 2.2 places.\n"
      "- **Year-over-year autocorrelation.** Pure performance persists at 0.42. A (0.43) and C "
      "(0.40) simply inherit that — more evidence they are performance in disguise. B persists at "
      "0.34. The subtraction forms drop to **0.12–0.13**: cap efficiency measured that way is "
      "almost memoryless. That is a genuine finding about football, not a bug, but it is a product "
      "problem — a team-page metric that a franchise cannot repeat is hard to build a narrative "
      "on, and it invites the reading that the metric is mostly noise.\n"
      "- **Distribution shape.** All seven are near-symmetric (|skew| ≤ 0.43) and platykurtic "
      "(excess kurtosis −0.7 to +0.7), i.e. no fat tails. The 55–145 band (±3 SD) holds for all "
      "but 7 team-seasons across all candidates; the worst offender is C-sub with 3.\n")
    A("### 5.1 Biggest movers versus the pure-performance ranking\n")
    for col, label in [("capplus_A", "A ratio (as specified)"),
                       ("capplus_A_pos", "A positive-anchored"),
                       ("capplus_B", "B efficiency over expected"),
                       ("capplus_C_pos", "C positive-anchored")]:
        A(f"**{label}** — six biggest gains, six biggest losses (`rank_gain` = performance rank "
          f"minus candidate rank; positive = the spend adjustment helped):\n")
        A(md_table(movers(d, col), {"perf_index": ".1f", "capplus": ".1f", "rel_cash": ".3f"}) + "\n")
    A("The A-positive-anchored block is the exhibit to remember: **2022 CHI gains 30 rank places, "
      "from 31st to 1st.**\n")

    # ---------------- 6. the sign inversion ----------------
    A("## 6. The central defect: the ratio forms invert for below-average teams\n")
    A("`P` is a z-score, so it is negative for roughly half the league every season. Dividing a "
      "negative number by a larger denominator makes it *less* negative. The specified formula "
      "therefore says: **a below-average team improves its Cap+ by spending more, and is punished "
      "for spending less.**\n")
    inv = []
    for label, den, mask in [("A — relative_cash", "relative_cash", w["relative_cash"].notna()),
                             ("C — relative_cap_consumed", "relative_cap_consumed", w["C_computable"])]:
        sub = w[mask]
        pos, neg = sub[sub.P > 0], sub[sub.P < 0]
        inv.append(dict(form=label, n_P_positive=len(pos),
                        corr_score_resource_P_pos=float(np.corrcoef(pos["P"] / pos[den], pos[den])[0, 1]),
                        n_P_negative=len(neg),
                        corr_score_resource_P_neg=float(np.corrcoef(neg["P"] / neg[den], neg[den])[0, 1])))
    A(md_table(pd.DataFrame(inv), {"corr_score_resource_P_pos": "+.3f",
                                   "corr_score_resource_P_neg": "+.3f"}) + "\n")
    A("Above-average teams behave correctly (negative correlation: more resource, lower score). "
      "Below-average teams behave backwards, strongly.\n")
    A("### 6.1 Verifying the brief's requirement on candidate C directly\n")
    A("The brief asks for empirical confirmation that a team with huge dead money gets a larger "
      "denominator and therefore a *lower* Cap+. The denominator half is true. The Cap+ half is "
      "**false** for exactly the teams in question:\n")
    ver = []
    for s, t in [(2022, "CHI"), (2022, "ATL"), (2022, "HOU"), (2024, "DEN"), (2023, "TB"), (2023, "SF")]:
        r = w[(w.season == s) & (w.team == t)]
        if r.empty or pd.isna(r.iloc[0]["raw_capcon_ratio"]):
            continue
        r = r.iloc[0]
        above = r["relative_cap_consumed"] > 1.0
        better = r["raw_capcon_ratio"] > r["P"]
        ver.append(dict(season=s, team=t, P=r["P"], dead_money_M=r["dead_money"] / 1e6,
                        rel_cap_consumed=r["relative_cap_consumed"],
                        raw_C_ratio=r["raw_capcon_ratio"],
                        cost_vs_league=("above avg" if above else "below avg"),
                        effect=("score improved" if better else "score reduced"),
                        direction=("**INVERTED**" if above == better else "correct")))
    A(md_table(pd.DataFrame(ver), {"P": ".3f", "dead_money_M": ".1f", "rel_cap_consumed": ".3f",
                                   "raw_C_ratio": ".3f"}) + "\n")
    A("`direction` = *correct* when an above-average total cost lowers the raw score (or a "
      "below-average cost raises it), *INVERTED* otherwise.\n")
    A("Chicago's record $91.8M dead charge moves its raw score from −1.731 to −1.675 — it makes "
      "the 3-14 Bears look **better**. Atlanta and Houston likewise. The only teams the "
      "denominator correctly punishes are the ones that were already good. **Candidate C as "
      "literally specified does not do the job the brief assigns it.** It still *ranks* the Bears "
      "32nd, but only because performance dominates the formula — the dead-money term is pushing "
      "the wrong way underneath.\n")
    A("The positive-anchored repair fixes this completely and generally: with a strictly positive "
      "numerator, ∂score/∂R < 0 everywhere. Under C-pos, Chicago 2022 falls from a 74.0 "
      "performance index to **71.5**, and Houston from 73.8 to **67.5**.\n")

    # ---------------- 7. sniff table ----------------
    A("## 7. Sniff table (product-brief hard requirement)\n")
    for c, _ in CANDIDATES:
        w["rk_" + c] = w.groupby("season")[c].rank(ascending=False, method="min")
    w["rk_perf_index"] = w.groupby("season")["perf_index"].rank(ascending=False, method="min")
    sn_rows, verdicts = [], []
    for season, team, label, expect in SNIFF:
        r = w[(w.season == season) & (w.team == team)].iloc[0]
        row = dict(case=label, WL=f"{int(r.wins)}-{int(r.losses)}" + (f"-{int(r.ties)}" if r.ties else ""),
                   rel_cash=r["relative_cash"],
                   dead_money_M=(r["dead_money"] / 1e6 if pd.notna(r["dead_money"]) else np.nan),
                   perf=fmt_idx(r["perf_index"], r["rk_perf_index"]))
        for c, _ in CANDIDATES:
            row[c.replace("capplus_", "")] = fmt_idx(r[c], r["rk_" + c])
        sn_rows.append(row)
        vr = dict(case=label, expectation=expect)
        for c, _ in CANDIDATES:
            if pd.isna(r[c]):
                vr[c.replace("capplus_", "")] = "n/a"
            elif expect == "report":
                vr[c.replace("capplus_", "")] = "—"
            else:
                rk = int(r["rk_" + c])
                ok = {"elite": rk <= 5, "high": rk <= 10, "poor": rk >= 24, "bottom": rk >= 29}[expect]
                vr[c.replace("capplus_", "")] = "PASS" if ok else "**FAIL**"
        verdicts.append(vr)
    A("Index value and league rank (rank 1 = best in that season). `rel_cash` = team cash ÷ "
      "league-average team cash; `dead_money_M` is the resolved snapshot in $M.\n")
    A(md_table(pd.DataFrame(sn_rows), {"rel_cash": ".3f", "dead_money_M": ".1f"}) + "\n")
    A("### 7.1 Pass / fail against the brief's stated expectation\n")
    A("Bands used: *elite* = top 5, *high* = top 10, *poor* = 24th or worse, *bottom* = 29th or "
      "worse, *report* = the brief asks for an honest reading, not a threshold.\n")
    A(md_table(pd.DataFrame(verdicts)) + "\n")
    fails = {}
    for vr in verdicts:
        for k, v in vr.items():
            if v == "**FAIL**":
                fails[k] = fails.get(k, 0) + 1
    nassert = sum(1 for *_x, e in SNIFF if e != "report")
    A("Failure counts across the "
      + str(nassert) + " cases with an asserted band: "
      + ", ".join(f"**{k}: {v}**" for k, v in sorted(fails.items(), key=lambda kv: -kv[1]))
      + "; candidates not listed had zero failures on the cases they could score.\n")
    A("Three caveats on reading that count. **(i)** Two of the failures are marginal: B puts 2013 "
      "OAK 23rd against a 24th-or-worse band, and C-sub puts 2017 PHI 11th against a top-10 band. "
      "**(ii)** `n/a` is not a pass. Candidate C cannot score **7 of the 20 cases at all** — "
      "2013 SEA, 2016 NE, 2020 KC, 2021 KC, 2021 LAR, 2016 CLE, 2021 NO — because their seasons "
      "have no full-league dead-money table. A candidate that cannot score the brief's own "
      "flagship case is not automatically the winner of a failure count. **(iii)** A and the ratio "
      "form of C pass almost everything, but they pass by being the performance index (§5): a "
      "sniff table cannot distinguish a working spend adjustment from no spend adjustment, which "
      "is why §5's rank-shift diagnostics carry more weight here than the pass/fail column.\n")
    A("### 7.2 Case readings\n")
    A("- **2013 SEA** — elite everywhere it can be scored (A #1, B #2). No dead-money coverage in "
      "2013 beyond the top five, so **candidate C cannot score the single most important sniff "
      "case at all**. Seven of the twenty cases are unscoreable by C.\n"
      "- **2014 / 2016 / 2018 NE** — all top-10 on every candidate; 2014 NE is #1 on A, A-sub and "
      "A-pos (they spent 16% below league-average cash).\n"
      "- **2017 PHI** — #1 on A and B, but only 9th on A-sub and 7th on C-pos: Philadelphia spent "
      "*above* average (rel_cash 1.068), so any candidate that weights thrift heavily demotes a "
      "champion. This is the cleanest illustration that the subtraction form's implicit unit "
      "weight is a choice, not a neutral default.\n"
      "- **2023 SF** — the best case for candidate C: #1 under both C forms at 145.4 / 145.9, the "
      "highest C-pos value in the entire window, on a genuinely cheap roster "
      "(cap_consumed 0.815, the third-lowest of any full-coverage season). A rates them #1 as "
      "well. Unambiguous pass.\n"
      "- **2019–2023 KC** — under A: 118.8, 121.4, 116.2, 127.4, 113.3. Under B: 122.9, 123.6, "
      "118.9, 128.3, 114.9. **The arc is flat-elite, not declining.** The metric's answer is that "
      "Kansas City never became a big spender: relative cash was 0.956, 0.918, 1.007, 0.968, 1.009 "
      "across those five years. That is a true fact about the Chiefs and a defensible story, but "
      "anyone expecting Cap+ to show the rookie-deal era outshining the mega-deal era will not "
      "find it here — cap efficiency at the team level did not move when Mahomes' cap number did.\n"
      "- **2021 LAR** — the instructive case, and it is instructive in an uncomfortable direction. "
      "The 'all-in' Rams show up in this data as **cheap**: relative cash 0.927 (below average) "
      "and cap_used_only 0.755 (second-lowest in the league). They land at 115.5 on A and "
      "**123.0, second in the league, on B**. 'All-in' in the NFL means mortgaging *future* cap "
      "through bonus proration and traded picks, and none of that is visible in a single-season "
      "spend measure. Any Cap+ built on one season of spend will systematically flatter the "
      "borrow-from-tomorrow strategy.\n"
      "- **2013 OAK** — 75.7 (#30) on A, 89.4 (#23) on B. The record 43.6%-of-cap dead year cannot "
      "be scored by candidate C directly (2013 is a top-5-only season); the scenario bracket in §9 "
      "puts C-pos at **71.6–82.5**, comfortably poor. But note A gets the *right answer for the "
      "wrong reason*: Oakland scores badly on A because it spent little cash, and it spent little "
      "cash *because* of the dead money.\n"
      "- **2022 CHI / 2022 ATL** — the pivotal cases. C (both repaired forms) rates them 31st and "
      "28th: pass. **A-sub rates Chicago 8th and Atlanta 6th; A-pos rates Chicago 1st and Atlanta "
      "3rd.** And per §3.1, roughly 13 and 11 points of C's punishment is an artifact of reading "
      "these two teams at a later date than the other 29 teams.\n"
      "- **2024 DEN** — the honest answer is *nothing happened*. Denver's record $85.2M charge sat "
      "on top of the league's lowest active cap (0.645), and `cap_consumed` came out at **0.979 — "
      "exactly the 2024 league median**. Every candidate returns roughly the performance index "
      "(perf 112.5 #9; A 113.6 #7; B 114.4 #6; C 112.2 #9; C-pos 111.3 #10). The reason is "
      "context: 2024 was the record dead-money season league-wide, with a **median team charge of "
      "$50.3M**, so $85.2M was only 1.7× median. This is the best story in the backtest — the "
      "metric correctly refuses to punish a team for a charge that was ordinary by the standards "
      "of its own season — but it will disappoint anyone who expects the famous number to produce "
      "a famous score.\n"
      "- **2017 CLE (0-16)** — 32nd on A, B and C-ratio: pass. But **C-sub rates them 8th (108.6) "
      "and C-pos 23rd (88.7)**. The 0-16 Browns consumed 0.726 of the cap, the second-lowest "
      "figure in the whole window. A pure rate metric gives credit for resources not consumed, and "
      "a team that neither spends nor wins is, arithmetically, efficient. This is the deepest "
      "unresolved design question in the metric — see §12.\n"
      "- **2016 CLE (1-15)** — 32nd on A, 30th on B: pass. The C bracket (§9) is 58.2–62.2 on the "
      "ratio form but **71.7–79.8 on C-pos, above their 65.2 performance index** — again, credit "
      "for a low denominator.\n"
      "- **2021 NO / 2022 NO** — post-Brees New Orleans lands mid-pack: 2021 at 104.3 (#15) on A "
      "and 102.7 (#15) on B; 2022 at 98.8 (#17) and 94.0 (#20). Their cap hell was a *future*-cap "
      "problem executed through restructures, and restructuring converts cap into cash paid "
      "earlier — 2022 NO actually has the window's 5th-highest relative cash (1.210), which drags "
      "them down on the thrift-weighted forms (A-sub 81.4, #30) and props them up on nothing. "
      "Mid-pack is the honest answer and it is not an embarrassing one, but it is not the story "
      "a reader expects from the phrase 'cap hell'.\n")

    # ---------------- 8. A vs C ----------------
    A("## 8. A versus C on the 288 team-seasons where both exist\n")
    ac = []
    for suffix, name in [("", "ratio (as specified)"), ("_sub", "subtraction"), ("_pos", "positive-anchored")]:
        a, c = cw["capplus_A" + suffix], cw["capplus_C" + suffix]
        ac.append(dict(form=name, corr_A_C=float(a.corr(c)), mean_abs_diff=float((c - a).abs().mean()),
                       p90_abs_diff=float((c - a).abs().quantile(0.9)), max_abs_diff=float((c - a).abs().max())))
    A(md_table(pd.DataFrame(ac), {"corr_A_C": ".3f", "mean_abs_diff": ".2f",
                                  "p90_abs_diff": ".2f", "max_abs_diff": ".2f"}) + "\n")
    A("As specified, A and C are the same metric (corr 0.989, mean gap 1.29 points) because both "
      "are ~pure performance. **The two candidates only become different once the sign bug is "
      "repaired** — and then the difference is exactly where the product needs it.\n")
    cw2 = cw.copy()
    cw2["delta_C_minus_A"] = cw2["capplus_C_pos"] - cw2["capplus_A_pos"]
    cw2["W-L"] = cw2["wins"].astype(int).astype(str) + "-" + cw2["losses"].astype(int).astype(str)
    cw2["dead_money_M"] = cw2["dead_money"] / 1e6
    show = ["season", "team", "W-L", "relative_cash", "dead_money_M", "cap_consumed",
            "capplus_A_pos", "capplus_C_pos", "delta_C_minus_A"]
    fmt = {"relative_cash": ".3f", "dead_money_M": ".1f", "cap_consumed": ".3f",
           "capplus_A_pos": ".1f", "capplus_C_pos": ".1f", "delta_C_minus_A": "+.1f"}
    A("**Where C is harsher than A** (the total-cost denominator withdrawing the false credit that "
      "low cash hands a teardown):\n")
    A(md_table(cw2.nsmallest(10, "delta_C_minus_A")[show], fmt) + "\n")
    A("**Where C is kinder than A** (teams that spent real cash on players who were actually "
      "there):\n")
    A(md_table(cw2.nlargest(10, "delta_C_minus_A")[show], fmt) + "\n")
    A("This is the strongest single argument in the backtest. The A-vs-C gap is not noise: it is "
      "−62.0 on 2022 CHI, −44.0 on 2022 ATL, −37.3 on 2023 LA, −30.9 on 2023 TB, −27.3 on 2025 NO "
      "— the five biggest gaps are five of the most notorious dead-money team-seasons on record — "
      "and +34.3 on 2023 SF, +31.5 on 2024 DET, +25.4 on 2022 BUF. **Including dead money in the "
      "denominator is doing precisely the work the product brief wants done.** The problem was "
      "never the denominator; it was the algebra wrapped around it.\n")

    # ---------------- 9. C coverage + partial brackets ----------------
    A("## 9. Where candidate C can and cannot be computed\n")
    cov = w.groupby("season").agg(teams_with_dead_money=("dm_known", "sum"),
                                  coverage=("season_dm_coverage", "first")).reset_index()
    cov["C_calibrated"] = np.where(cov["coverage"] == "full32", "yes (32 teams)", "no — bracket only")
    A(md_table(cov) + "\n")
    A(f"**C is calibrated for {len(cw)} of 416 team-seasons (69.2%)**: all 32 teams in 2014, 2015, "
      f"2017, 2018, 2019, 2022, 2023, 2024, 2025. It is *not* available for any team in 2013, "
      f"2016, 2020 or 2021 — 128 team-seasons, including 2013 SEA, 2016 NE, 2020 KC, 2021 KC, "
      f"2021 LAR, 2016 CLE and 2021 NO from the sniff list.\n")
    A("### 9.1 Scenario bracket for the four partial seasons\n")
    A("For a season where the source published only a leaders list, the unlisted teams' dead money "
      "is bounded: at or below the smallest listed leader, and at or above the largest of any "
      "published low set. Filling every unlisted team at the low bound is maximally unfavourable "
      "to the listed teams; filling at the high bound is maximally favourable. The pair brackets "
      "each listed team's C. **These are scenarios, not measurements, and must never ship as "
      "Cap+ values.**\n")
    bnd = pd.DataFrame([dict(season=s, known_teams=int((dmres.season == s).sum()),
                             lo_fill_M=bounds[s][0] / 1e6, hi_fill_M=bounds[s][1] / 1e6)
                        for s in partial])
    A(md_table(bnd, {"lo_fill_M": ".2f", "hi_fill_M": ".2f"}) + "\n")
    lo = scen["lo"]; hi = scen["hi"]
    br = lo[lo["dm_observed"]][["season", "team", "dead_money", "cal_ratio", "cal_pos"]].merge(
        hi[hi["dm_observed"]][["season", "team", "cal_ratio", "cal_pos"]],
        on=["season", "team"], suffixes=("_lo", "_hi"))
    br = br.merge(d[["season", "team", "wins", "losses", "perf_index"]], on=["season", "team"])
    br["W-L"] = br["wins"].astype(int).astype(str) + "-" + br["losses"].astype(int).astype(str)
    br["dead_money_M"] = br["dead_money"] / 1e6
    br = br[["season", "team", "W-L", "dead_money_M", "perf_index", "cal_ratio_lo", "cal_ratio_hi",
             "cal_pos_lo", "cal_pos_hi"]].sort_values(["season", "team"])
    br.columns = ["season", "team", "W-L", "dead_money_M", "perf_index", "C_ratio_lo", "C_ratio_hi",
                  "C_pos_lo", "C_pos_hi"]
    A(md_table(br, {"dead_money_M": ".1f", "perf_index": ".1f", "C_ratio_lo": ".1f",
                    "C_ratio_hi": ".1f", "C_pos_lo": ".1f", "C_pos_hi": ".1f"}) + "\n")
    oak = br[(br.season == 2013) & (br.team == "LV")].iloc[0]
    cle = br[(br.season == 2016) & (br.team == "CLE")].iloc[0]
    A(f"Two readings worth pulling out. **2013 OAK: C-pos {oak.C_pos_lo:.1f}–{oak.C_pos_hi:.1f}** "
      f"against a {oak.perf_index:.1f} performance index — poor under either scenario, and the "
      f"bracket is wide enough that the brief's 'should rate poorly' is satisfied without needing "
      f"to pick a scenario. Note that Oakland's *ratio* bracket runs {oak.C_ratio_lo:.1f} → "
      f"{oak.C_ratio_hi:.1f}, i.e. **backwards** — the scenario that is supposed to be harshest on "
      f"Oakland scores it higher — which is the §6 sign inversion showing up again in an otherwise "
      f"clean piece of arithmetic. **2016 CLE: C-pos {cle.C_pos_lo:.1f}–{cle.C_pos_hi:.1f}** "
      f"against a {cle.perf_index:.1f} performance index: the 1-15 Browns come out *better* than "
      f"their performance under both scenarios, because their cap consumption was low.\n")

    # ---------------- 10. weights ----------------
    A("## 10. Weight sensitivity\n")
    rows = []
    for k in [x for x in WEIGHTS if x != DEFAULT_W]:
        o = alt[k]
        row = dict(weights=f"{k} = {tuple(round(x,2) for x in WEIGHTS[k])}")
        for c in ["perf_index"] + [x for x, _ in CANDIDATES]:
            row["corr_" + c.replace("capplus_", "")] = float(d[c].corr(o[c]))
        rows.append(row)
    A("Correlation with the default 1/3-1/3-1/3 build, over 2013–2025:\n")
    A(md_table(pd.DataFrame(rows), {c: ".4f" for c in
               ["corr_perf_index"] + ["corr_" + x.replace("capplus_", "") for x, _ in CANDIDATES]}) + "\n")
    rows = []
    for k in [x for x in WEIGHTS if x != DEFAULT_W]:
        o = alt[k]
        row = dict(weights=k)
        for c in ["perf_index"] + [x for x, _ in CANDIDATES]:
            a = d[d.in_cap_window].dropna(subset=[c]).copy()
            b = o[o.in_cap_window].dropna(subset=[c]).copy()
            a["r"] = a.groupby("season")[c].rank(ascending=False, method="min")
            b["r"] = b.groupby("season")[c].rank(ascending=False, method="min")
            j = a[["season", "team", "r"]].merge(b[["season", "team", "r"]], on=["season", "team"])
            row["shift_" + c.replace("capplus_", "")] = float((j.r_x - j.r_y).abs().mean())
        rows.append(row)
    A("Mean absolute within-season rank shift versus the default weights:\n")
    A(md_table(pd.DataFrame(rows), {"shift_" + x.replace("capplus_", ""): ".2f" for x, _ in
                                    [("perf_index", "")] + CANDIDATES}) + "\n")
    A("Sniff table under the alternate weights (index and rank, perf / A / B / C-pos):\n")
    rows = []
    for season, team, label, _ in SNIFF:
        row = dict(case=label)
        for k in WEIGHTS:
            f = (d if k == DEFAULT_W else alt[k])
            f = f[f.in_cap_window].copy()
            for c in ["perf_index", "capplus_A", "capplus_B", "capplus_C_pos"]:
                f["rk_" + c] = f.groupby("season")[c].rank(ascending=False, method="min")
            r = f[(f.season == season) & (f.team == team)].iloc[0]
            row[k] = " / ".join(
                ("--" if pd.isna(r[c]) else f"{r[c]:.0f}(#{int(r['rk_' + c])})")
                for c in ["perf_index", "capplus_A", "capplus_B", "capplus_C_pos"])
        rows.append(row)
    A(md_table(pd.DataFrame(rows)) + "\n")
    A("**No sniff-table verdict changes under any weighting.** Correlations are ≥ 0.9968 and the "
      "mean rank shift never exceeds 0.74 places. With the three inputs correlated 0.87–0.97, the "
      "composite is effectively weight-invariant. Recommendation: adopt 1/3-1/3-1/3, document that "
      "the alternatives were tested and are indistinguishable, and spend no further product time "
      "on the weights. The consequential choices are the denominator and the algebraic form, not "
      "the blend.\n")

    # ---------------- 11. top/bottom 15 ----------------
    A("## 11. All-time top 15 and bottom 15, 2013–2025, per candidate\n")
    for col, label in CANDIDATES:
        t, b = top_bottom(d, col)
        A(f"**{label}**\n")
        A(f"- Top 15: {t}\n")
        A(f"- Bottom 15: {b}\n")
    A("Read these lists as the product's front page, because that is what they will become:\n")
    A("- **A ratio / C ratio / B**: all three produce credible lists — good teams on top, bad teams "
      "on the bottom. A and C achieve this by being performance in disguise; B earns it.\n"
      "- **A-sub**: the bottom 15 contains **no famous cap disaster at all** — it is 6-10 and 7-9 "
      "teams that happened to spend heavily — while the top 15 includes 2023 LA (10-7, $79.6M "
      "dead). The metric has stopped measuring what it claims to.\n"
      "- **A-pos**: the all-time top 15 contains **2022 CHI (3-14) at 9th and 2022 ATL (7-10) at "
      "12th**. Publishing that list would end the metric's credibility in one screenshot.\n"
      "- **C-sub**: the all-time bottom 15 contains **2025 SF (12-5)** and **2023 TB (9-8)**, and "
      "the top 15 contains **2017 SF (6-10)** and **2022 CLE (7-10)**. Too much weight on the "
      "denominator in both directions.\n"
      "- **C-pos**: the most credible list in the backtest. Top: 2023 SF, 2018 IND, 2024 DET, "
      "2019 KC, 2014 SEA, 2022 SF, 2017 MIN, 2025 SEA, 2019 BAL, 2022 BUF. Bottom: 2023 CAR, "
      "2022 HOU, 2025 LV, 2022 CHI, 2025 TEN, 2018 ARI, 2019 CIN, 2014 LV, 2014 TEN, 2015 CLE. "
      "Every entry survives a look.\n")

    # ---------------- 12. embarrassments ----------------
    A("## 12. Results that would embarrass the product\n")
    A("1. **A-pos ranks the 2022 Bears #1 in the NFL** (133.5), and A-sub ranks them 8th. A 3-14 "
      "team carrying the largest dead-money charge in league history, at the top of a metric "
      "invented to catch exactly that. Cause: `cash_spent_total` is cash to *rostered* players, so "
      "gutting a roster reads as thrift. corr(relative_cash, dead-money share) = −0.36.\n"
      "2. **Candidate C, as literally specified, rewards dead money.** For any team with P < 0 — "
      "half the league — a bigger total-cost denominator *raises* the score. Chicago 2022's raw "
      "score improves from −1.731 to −1.675. The brief's own mechanism does not work as written, "
      "and the ranks only look right because performance drowns it out.\n"
      "3. **Roughly half of 2022 CHI/ATL's punishment is a measurement-date artifact.** They are "
      "read at a 2024 season-final date while the other 29 teams are read the previous July. "
      "Reading all 32 teams at the same date moves Atlanta from 88.1 to **98.8 — dead league "
      "average** — and the brief's requirement fails. Any published Cap+ must state the as-of date "
      "of the dead-money snapshot next to the value, exactly as the sourcing findings require for "
      "the raw figures.\n"
      "4. **The 0-16 Browns are efficient.** 2017 CLE consumed 0.726 of the cap and scores 108.6 "
      "(8th) on C-sub and 88.7 (23rd) on C-pos. Any pure rate metric gives credit for cap not "
      "consumed. Unless the product decides that unspent cap is *not* a saving, some floor or "
      "shrinkage on denominator credit is required.\n")
    A("Two further things a careful reader will notice and ask about, which are honest rather than "
      "embarrassing but need an answer ready: the **2021 Rams rate 2nd in the league on B** "
      "despite being the canonical 'all-in' team (single-season spend cannot see mortgaged future "
      "cap), and the **2019–2023 Chiefs arc is flat** rather than declining (Kansas City's cash "
      "spend never rose above league average).\n")

    # ---------------- 13. fallback ----------------
    A("## 13. Performance-only fallback, 1999–2025 — **this is not Cap+**\n")
    A("`perf_index = 100 + 15·P`, the same composite with no resource term at all, computed for "
      "all 861 team-seasons 1999–2025. Because P is standardized within season, the index has mean "
      "exactly 100 and SD exactly 15.000 in **every** season, and the pooled SD is 15.000; there "
      "are no outliers outside the ±3 SD band in 27 seasons "
      f"(range {d.perf_index.min():.1f}–{d.perf_index.max():.1f}, skew {skew(d.perf_index):+.3f}, "
      f"excess kurtosis {excess_kurtosis(d.perf_index):+.3f}).\n")
    s = d.copy()
    s["rec"] = s["wins"].astype(int).astype(str) + "-" + s["losses"].astype(int).astype(str)
    A("- Top 15 all-time (1999–2025): "
      + " · ".join(f"{int(r.season)} {r.team} {r.rec} **{r.perf_index:.1f}**"
                   for _, r in s.nlargest(15, "perf_index").iterrows()) + "\n")
    A("- Bottom 15 all-time (1999–2025): "
      + " · ".join(f"{int(r.season)} {r.team} {r.rec} **{r.perf_index:.1f}**"
                   for _, r in s.nsmallest(15, "perf_index").iterrows()) + "\n")
    A("2007 NE (16-0) tops it at 139.5 and 2008 DET (0-16) floors it at 62.6, which is the right "
      "shape for a performance index.\n")
    A("### 13.1 How the two would sit side by side honestly\n")
    A("They cannot share a name, a column, or an axis. The 2013–2025 metric answers *how much "
      "performance did this team get per dollar of cap-normalized resource*; the 1999–2012 "
      "fallback answers *how good was this team*, full stop, and its denominator is not missing — "
      "it does not exist, because the spend data before 2013 is a sample of notable contracts "
      "rather than a roster (contracts audit §3: 43 players per team in 2012 against a 53-man "
      "roster, and a cap ratio of 0.72 that decays to under 0.15 by 2004). A single continuous "
      "1999–2025 line labelled Cap+ would be a fabrication for its first fourteen seasons, and "
      "the two series are not even on the same scale of meaning: the fallback is 0.95-correlated "
      "with win percentage by construction, while a working Cap+ should not be. The defensible "
      "presentation is a pre-2013 team page that renders **Team Rating (performance only)** in "
      "visibly different styling, with the Cap+ slot showing an explicit *'not available before "
      "2013 — league-wide contract coverage begins in 2013'* rather than a blank or a dash, and a "
      "hard visual break in any franchise time series at the 2013 boundary. The one honest bridge "
      "is that both indices are built from the identical P composite, so a franchise's *performance* "
      "line is continuous from 1999; only the resource adjustment starts in 2013. Say that in one "
      "sentence on the page and the seam becomes a feature rather than a gap.\n")

    # ---------------- 14. recommendation ----------------
    A("## 14. Recommendation\n")
    A("**None of the three candidates is shippable as specified.** A and C are algebraically broken "
      "in a way that inverts the metric's thesis for half the league, and both are — after that "
      "bug partially cancels itself out — indistinguishable from the performance index they are "
      "supposed to improve on (mean absolute move of 1.44 and 0.59 index points). B is sound but "
      "timid, and being cash-only it is blind to dead money: it rates 2023 LA (10-7, $79.6M dead) "
      "1st in the league among its biggest movers.\n")
    A("The path with the most evidence behind it is **the total-cost denominator with a positive "
      "numerator** — `100 + 15·P` over `(cap_used + dead_money)/league_cap`, relative to the "
      "league average — computed only for the nine seasons with full dead-money coverage, "
      "resolved at a **single measurement date per season**, and shipped with that date visible. "
      "It produces the most credible top and bottom fifteen in the backtest, it separates "
      "cleanly from the cash-only candidate exactly on the cap-disaster teams (§8), and it is the "
      "only construction in which the brief's dead-money mechanism actually works.\n")
    A("Three decisions the memo has to make before that is shippable:\n")
    A("1. **Does unspent cap count as a saving?** If yes, 2017 CLE at 88.7 is correct and the "
      "product must be willing to defend it. If no, the denominator needs a floor (e.g. credit no "
      "denominator below the league's 25th percentile) or shrinkage toward 1.0 — a general rule, "
      "applied to every team, decided on principle rather than tuned until Cleveland looks right.\n"
      "2. **Nine seasons or thirteen?** C covers 2014, 2015, 2017–2019, 2022–2025 only. Shipping "
      "C means four seasons of the flagship metric are blank — including 2013 SEA, the case the "
      "brief leads with. Shipping B everywhere means the flagship metric cannot see dead money at "
      "all. A hybrid (C where covered, B elsewhere) creates two metrics under one name and should "
      "be rejected.\n"
      "3. **How much spend weight?** The three forms embed radically different implicit weights: "
      "the ratio form ~0, the subtraction form exactly 1, the positive-anchored form "
      f"SD(log R)/0.15 ≈ {cw['relative_cap_consumed'].pipe(lambda x: np.log(x).std(ddof=1))/0.15:.2f} "
      "for total cost and ≈ "
      f"{w['relative_cash'].pipe(lambda x: np.log(x).std(ddof=1))/0.15:.2f} for cash. That weight "
      "is the whole product. It should be chosen and stated, not inherited from an algebraic "
      "accident.\n")
    A("---\n")
    A("Files written: `data/marts/capplus_candidates.csv` (861 rows × "
      f"{len(out.columns)} columns; candidates null before 2013, C null outside full-coverage "
      "seasons, scenario brackets populated only for team-seasons with an observed dead-money "
      "figure), `audit/findings_capplus_backtest.md` (this file).\n")
    return "\n".join(S)


def main():
    perf_raw, cap, lgcap, dm_raw = load_inputs()
    dmres = resolve_dead_money(dm_raw, "latest")
    dmres_sc = resolve_dead_money(dm_raw, "stage_cons")

    d, b_table = build_all(DEFAULT_W, perf_raw, cap, dmres)
    alt = {k: build_all(k, perf_raw, cap, dmres)[0] for k in WEIGHTS if k != DEFAULT_W}
    d_sc, _ = build_all(DEFAULT_W, perf_raw, cap, dmres_sc)
    scen, partial, bounds = build_partial_scenarios(perf_raw, cap, dmres)

    write_outputs(d, alt, d_sc, scen, partial, bounds, b_table, dm_raw, dmres)


if __name__ == "__main__":
    main()
