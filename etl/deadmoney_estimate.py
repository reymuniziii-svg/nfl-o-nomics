"""Estimated per-team dead money for the seasons without a league-wide table.

**A curated-input generator, not a mart.** `main()` writes
`data/curated/dead_money_estimated.csv`, which `etl/deadmoney.py` reads as a
curated source of record (DECISIONS 113, approved 2026-10-10): 2016, 2020 and
2021 ship from it badged `estimated`. The pipeline never runs this module; re-run
it by hand and commit the output. Write-up and evidence:
`audit/findings_deadmoney_estimate.md` (frozen).

The file also carries 2013, as the measured Houston Press table
(`method = measured_full32`). That table now lives in
`dead_money_team_season.csv` and 2013 resolves from there; the copy here is
asserted equal to it.

**Training set pinned to the nine seasons the findings validated** (2014, 2015,
2017, 2018, 2019, 2022-2025). The 2013 table became a measured season after the
validation ran; it is excluded from training so the shipped estimate is the
validated one, byte for byte. Its candidate readings are read from
`data/curated/staging/dead_money_candidates_blank_seasons.csv`; only this
generator reads staging, never the pipeline.

What it estimates
-----------------
One dated table per blank season, the same shape the same-stage rule demands of a
measured season (`DECISIONS.md` 15): all 32 teams **as of one reference date**.
Real readings are never predicted:

* readings taken **on** the reference date are used as-is (they are also the
  order-statistic anchors that pin the season's level);
* a team with no reference-date reading but a reading from **another date** in the
  same league year uses that reading as-is **only if it cannot contradict the
  reference table** -- i.e. it lies inside the bounds the reference table's
  top-k / bottom-k lists imply. A reading that falls outside them is proof of
  stage drift (e.g. a season-final $53.6M for NYJ 2020 inside a June table whose
  #5 is $22M) and is kept as an alternate reading, not used;
* every other team is estimated.

The reference date is chosen by one rule: the date that leaves the most real
readings usable, ties to the later date.

The model
---------
Two parts, both deliberately small (288 training rows, nine seasons):

1. **Within-season position** ``z`` = standardised log dead money. Ridge
   regression (numpy, no sklearn) on within-season z-scores of features built for
   all 416 team-seasons from `team_season_cap` / `player_season_cap`, plus the
   team's z in the adjacent seasons where those are measured. One ridge per
   neighbour-availability pattern; the penalty is chosen by an inner
   leave-one-season-out loop, so the outer validation never sees it.
2. **Season level** (mu, sigma of log dead money) from the reference-date anchors,
   matched to the expected order statistics of z learned on the training seasons.
   With top and bottom lists both are solved by least squares; with a top list
   only, sigma comes from its across-season relation to the top-k mean (higher
   dead-money seasons are tighter in log terms) and mu follows.

Estimates are clipped to the bounds the anchors imply and to
`unaccounted_vs_adjusted` (`SPEC.md` §7.3: an upper bound on dead money).

Validation is leave-one-season-out over the nine full-32 seasons, simulating
each blank season's real situation (its anchor shape and its neighbour
pattern). The decisive numbers are the Cap+ rank shifts at lambda = 1.0 when the
imputed values replace the measured ones, with the approved floor and
calibration (`audit/capplus_backtest.recommended_columns`, imported, not
re-derived).

Deterministic: no randomness anywhere.

Run:  python3 -m etl.deadmoney_estimate          (writes the curated CSV)
      python3 -m etl.deadmoney_estimate --report (also prints the evidence tables)
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from . import config, deadmoney, io_utils

if str(config.AUDIT) not in sys.path:
    sys.path.insert(0, str(config.AUDIT))
import capplus_backtest as bt  # noqa: E402  (audit/capplus_backtest.py, read-only)

# --------------------------------------------------------------------------- #
# constants
# --------------------------------------------------------------------------- #
BLANK_SEASONS = (2013, 2016, 2020, 2021)
LAMBDA_SENS = config.LAMBDA_DEAD   # 1.0, the shipping weight (DECISIONS 109)
LAMBDA_SECONDARY = 1.5       # the retired weight, reported alongside
ALPHA_GRID = (0.3, 1.0, 3.0, 10.0, 30.0, 100.0)
INTERVAL_Q = (0.10, 0.90)    # 80% interval from the LOSO residual distribution
BAR_MEDIAN_RANK, BAR_P90_RANK = 1.5, 4.0

OUT = config.CURATED / "dead_money_estimated.csv"
OUT_2013_MODEL = config.STAGING / "dead_money_estimated_2013_model.csv"
CANDIDATES = config.STAGING / "dead_money_candidates_blank_seasons.csv"

#: Feature columns that survived the ablation (findings §3). ``nb`` expands to the
#: adjacent-season z's that are measured for the season being predicted.
FEATURES = ("z_unacc", "z_capsh", "z_sep", "nb")

#: Every candidate tested, for the ablation table.
CANDIDATE_FEATURES = {
    "z_unacc": "unaccounted cap (adjusted cap - rostered cap) / league cap",
    "z_capsh": "rostered cap used / league cap",
    "z_sep": "separation proxy: departed players' prior prorated bonus x remaining yrs (<=5)",
    "z_sep_any": "separation proxy, bonus rate only (no remaining-years weight)",
    "z_nleft": "count of players who left the team",
    "nb": "team's dead-money z in the adjacent measured season(s)",
}

#: Order-statistic shape of each dated list: (n_top, n_bottom). Asserted against
#: the row counts, never inferred from gaps.
LIST_SHAPE = {
    (2013, "2013-12-06"): (5, 0),    # NFP / Yahoo top-5
    (2016, "2016-10-05"): (4, 4),    # The Comeback top-4 + bottom-4
    (2020, "2020-06-02"): (5, 0),    # NBC Sports Boston top-5
    (2020, "2020-03-25"): (10, 0),   # NBC Sports Boston / OTC top-10
    (2021, "2021-09-06"): (5, 5),    # NBC Sports Philadelphia top-5 + bottom-5
    (2021, "2021-03-10"): (0, 3),    # Dolphins On SI bottom-3
}

#: Which adjacent seasons are measured (full32) for each blank season.
NEIGHBOUR_PATTERN = {2013: "n", 2016: "pn", 2020: "p", 2021: "n"}


# --------------------------------------------------------------------------- #
# data
# --------------------------------------------------------------------------- #
def _z(df: pd.DataFrame, col: str) -> pd.Series:
    g = df.groupby("season")[col]
    sd = g.transform("std").replace(0, np.nan)
    return ((df[col] - g.transform("mean")) / sd).fillna(0.0)


def separation_proxy(players: pd.DataFrame) -> pd.DataFrame:
    """Team-season separation proxy, built the way the mortgage is.

    For team T in season t: players on T in t-1 who are not on T in t, summed
    over ``prorated_bonus(t-1) x min(5, contract seasons remaining after t-1)``.
    Noisy by construction (findings_deadmoney_sourcing.md Appendix D: overwritten
    schedules, invisible restructures, no dates) -- but it is the mechanism.
    """
    p = players.copy()
    p["end"] = p["contract_year_signed"] + p["contract_years"] - 1
    prev = p[["season", "team", "otc_id", "prorated_bonus", "end"]].copy()
    prev["season"] = prev["season"] + 1
    cur = p[["season", "team", "otc_id"]].assign(_stay=1)
    m = prev.merge(cur, on=["season", "team", "otc_id"], how="left")
    left = m[m["_stay"].isna()].copy()
    rem = (left["end"] - (left["season"] - 1)).clip(lower=0).fillna(0).clip(upper=5)
    pb = left["prorated_bonus"].fillna(0.0)
    left["sep"] = pb * rem
    left["sep_any"] = pb * (rem > 0)
    return (left.groupby(["season", "team"])
            .agg(sep_usd=("sep", "sum"), sep_any_usd=("sep_any", "sum"),
                 n_left=("otc_id", "size"))
            .reset_index())


def load_readings() -> pd.DataFrame:
    """Curated snapshots plus the staged candidate readings for the blank seasons
    (deduplicated on season/team/asof_date; a value conflict raises)."""
    cur = deadmoney.load_team_season()[["season", "team", "dead_money_usd", "asof_date",
                                        "asof_stage", "coverage", "source_url"]]
    frames = [cur]
    if CANDIDATES.exists():
        cand = io_utils.read_csv(CANDIDATES)[cur.columns.tolist()]
        frames.append(cand)
    r = pd.concat(frames, ignore_index=True)
    r["asof_date"] = r["asof_date"].astype(str)
    dup = r.groupby(["season", "team", "asof_date"])["dead_money_usd"].nunique()
    if (dup > 1).any():
        raise AssertionError(f"conflicting readings: {dup[dup > 1]}")
    return (r.drop_duplicates(["season", "team", "asof_date"])
            .sort_values(["season", "asof_date", "team"]).reset_index(drop=True))


def build_panel() -> pd.DataFrame:
    """All 416 team-seasons with features; ``y`` = log same-stage dead money where
    a full-32 table exists (the 288 Cap+ rows), NaN otherwise."""
    cap = io_utils.read_csv(config.MARTS / "team_season_cap.csv")
    players = io_utils.read_csv(config.MARTS / "player_season_cap.csv")
    rating = io_utils.read_csv(config.MARTS / "team_rating.csv")
    same, _ = deadmoney.resolve_same_stage(deadmoney.load_team_season())
    # Train on the nine validated seasons only (module docstring).
    same = same[~same["season"].isin(BLANK_SEASONS)]

    d = cap[["season", "team", "cap_used_total", "league_cap",
             "unaccounted_vs_adjusted"]].copy()
    d = d.merge(separation_proxy(players), on=["season", "team"], how="left")
    d[["sep_usd", "sep_any_usd", "n_left"]] = d[["sep_usd", "sep_any_usd", "n_left"]].fillna(0)
    d = d.merge(same[["season", "team", "dead_money_rec"]], on=["season", "team"], how="left")
    d = d.merge(rating[["season", "team", "P"]], on=["season", "team"], how="left")
    if len(d) != 416 or d["P"].isna().any():
        raise AssertionError("panel is not the 416 tier-2 team-seasons")

    d["unacc"] = d["unaccounted_vs_adjusted"] / d["league_cap"]
    d["capsh"] = d["cap_used_total"] / d["league_cap"]
    d["l_sep"] = np.log1p(d["sep_usd"] / 1e6)
    d["l_sep_any"] = np.log1p(d["sep_any_usd"] / 1e6)
    for src, dst in (("unacc", "z_unacc"), ("capsh", "z_capsh"), ("l_sep", "z_sep"),
                     ("l_sep_any", "z_sep_any"), ("n_left", "z_nleft")):
        d[dst] = _z(d, src)
    d["y"] = np.log(d["dead_money_rec"])
    g = d.groupby("season")["y"]
    d["zy"] = (d["y"] - g.transform("mean")) / g.transform("std")
    return d.sort_values(["season", "team"]).reset_index(drop=True)


def known_seasons(panel: pd.DataFrame) -> list[int]:
    return sorted(int(s) for s in panel.loc[panel["y"].notna(), "season"].unique())


# --------------------------------------------------------------------------- #
# model pieces
# --------------------------------------------------------------------------- #
def _ridge(X: np.ndarray, y: np.ndarray, alpha: float):
    mu, sd = X.mean(0), X.std(0)
    sd[sd == 0] = 1.0
    Xs = (X - mu) / sd
    b = np.linalg.solve(Xs.T @ Xs + alpha * np.eye(X.shape[1]), Xs.T @ (y - y.mean()))
    y0 = y.mean()
    return (lambda Xn: y0 + ((Xn - mu) / sd) @ b), b / sd


def _neighbours(df: pd.DataFrame, zy: pd.Series, known: set) -> tuple[np.ndarray, np.ndarray]:
    pv = [zy.get((s - 1, t), np.nan) if s - 1 in known else np.nan
          for s, t in zip(df["season"], df["team"])]
    nx = [zy.get((s + 1, t), np.nan) if s + 1 in known else np.nan
          for s, t in zip(df["season"], df["team"])]
    return np.asarray(pv, float), np.asarray(nx, float)


@dataclass
class Fit:
    """A position model fitted on a set of training seasons for one neighbour pattern."""
    columns: list
    alpha: float
    predict: object
    coef: dict
    E_top: np.ndarray            # expected z order statistics, largest first
    E_bot: np.ndarray            # expected z order statistics, smallest first
    sigma_on_top: tuple          # (slope, intercept): sigma_s ~ mean of top-k log DM
    k_top_for_sigma: int
    train_seasons: list = field(default_factory=list)


def fit(panel: pd.DataFrame, train: list[int], pattern: str,
        features=FEATURES, k_top: int = 5, alpha: float | None = None) -> Fit:
    """Fit the within-season position model on ``train`` seasons.

    ``pattern`` names which adjacent seasons the TARGET has measured ('p', 'n',
    'pn' or ''); training rows must have the same ones, measured within ``train``.
    """
    known = set(train)
    zy = panel.set_index(["season", "team"])["zy"]
    tr = panel[panel["season"].isin(train)].copy()
    tr["zp"], tr["zn"] = _neighbours(tr, zy, known)
    cols = [f for f in features if f != "nb"]
    if "nb" in features:
        cols += [c for c, k in (("zp", "p"), ("zn", "n")) if k in pattern]
    tr = tr.dropna(subset=cols + ["zy"])

    def _cv(a):
        err = []
        for s in sorted(tr["season"].unique()):
            i = (tr["season"] == s).to_numpy()
            if i.all() or not cols:
                continue
            f, _ = _ridge(tr.loc[~i, cols].to_numpy(), tr.loc[~i, "zy"].to_numpy(), a)
            err.append(np.mean((f(tr.loc[i, cols].to_numpy()) - tr.loc[i, "zy"].to_numpy()) ** 2))
        return np.mean(err) if err else 0.0

    if cols:
        if alpha is None:
            alpha = min(ALPHA_GRID, key=_cv)
        f, b = _ridge(tr[cols].to_numpy(), tr["zy"].to_numpy(), alpha)
        coef = dict(zip(cols, np.round(b, 4)))
    else:
        alpha, coef = 0.0, {}
        f = lambda Xn: np.zeros(len(Xn))  # noqa: E731

    Z = np.array([np.sort(panel.loc[panel["season"] == s, "zy"].to_numpy()) for s in train])
    lvl = panel[panel["season"].isin(train)].groupby("season")["y"]
    T = np.array([np.sort(panel.loc[panel["season"] == s, "y"].to_numpy())[-k_top:].mean()
                  for s in train])
    slope, icpt = np.polyfit(T, lvl.std().to_numpy(), 1)
    return Fit(cols, float(alpha), f, coef, Z[:, ::-1].mean(0), Z.mean(0),
               (float(slope), float(icpt)), k_top, list(train))


def level_from_anchors(m: Fit, top: np.ndarray, bot: np.ndarray) -> tuple[float, float]:
    """(mu, sigma) of the season's log dead money from its order-statistic anchors.
    ``top`` sorted descending, ``bot`` sorted ascending, both in log dollars."""
    E = np.r_[m.E_top[:len(top)], m.E_bot[:len(bot)]]
    ya = np.r_[top, bot]
    if len(top) and len(bot):
        sigma, mu = np.polyfit(E, ya, 1)
        return float(mu), float(sigma)
    if len(top):
        if len(top) != m.k_top_for_sigma:
            raise AssertionError("sigma relation fitted for a different top-k")
        t = float(np.mean(top))
        sigma = m.sigma_on_top[0] * t + m.sigma_on_top[1]
        return t - sigma * float(np.mean(m.E_top[:len(top)])), float(sigma)
    raise AssertionError("no top anchors: the season level is not identified")


def predict_season(panel: pd.DataFrame, m: Fit, season: int, pattern: str,
                   ref: dict, fixed: dict) -> pd.DataFrame:
    """Predict one season's 32 values.

    ``ref``   {team: usd} reference-date readings, the order-statistic anchors,
              with ``ref['_shape'] = (n_top, n_bottom)``.
    ``fixed`` {team: usd} other real readings used as-is (not anchors).
    """
    te = panel[panel["season"] == season].copy()
    zy = panel.set_index(["season", "team"])["zy"]
    te["zp"], te["zn"] = _neighbours(te, zy, set(m.train_seasons))
    if "zp" in m.columns and te["zp"].isna().any():
        raise AssertionError(f"{season}: previous-season z missing for some team")
    if "zn" in m.columns and te["zn"].isna().any():
        raise AssertionError(f"{season}: next-season z missing for some team")
    zhat = m.predict(te[m.columns].to_numpy()) if m.columns else np.zeros(len(te))

    n_top, n_bot = ref["_shape"]
    vals = {t: v for t, v in ref.items() if t != "_shape"}
    s = sorted(vals.items(), key=lambda kv: -kv[1])
    top = [t for t, _ in s[:n_top]]
    bot = [t for t, _ in s[::-1][:n_bot]]
    ytop = np.log([vals[t] for t in top])
    ybot = np.log([vals[t] for t in bot])
    mu, sigma = level_from_anchors(m, ytop, ybot)

    hi = ytop.min() if len(ytop) else np.inf
    lo = ybot.max() if len(ybot) else -np.inf
    yhat = np.clip(mu + sigma * zhat, lo, hi)
    yhat = np.minimum(yhat, np.log(np.maximum(te["unaccounted_vs_adjusted"].to_numpy(), 1.0)))

    known = {**vals, **fixed}
    is_a = te["team"].isin(known).to_numpy()
    te["yhat"] = np.where(is_a, np.log(te["team"].map(known).fillna(1.0)), yhat)
    te["anchor"] = is_a
    te["zhat"] = zhat
    te["mu"], te["sigma"] = mu, sigma
    te["bound_lo_usd"], te["bound_hi_usd"] = np.exp(lo), np.exp(hi)
    return te


# --------------------------------------------------------------------------- #
# Cap+ sensitivity
# --------------------------------------------------------------------------- #
def capplus_frame(panel: pd.DataFrame, dm_col: str = "dead_money_rec") -> pd.DataFrame:
    d = panel[panel["y"].notna()][["season", "team", "cap_used_total", "league_cap", "P"]].copy()
    d["dead_money_rec"] = panel.loc[panel["y"].notna(), dm_col].to_numpy()
    d["rec_computable"] = True
    return d.reset_index(drop=True)


def capplus(d: pd.DataFrame, lam: float) -> pd.DataFrame:
    """The approved build at weight ``lam``: floor at the 25th pct of COST, mean
    after the floor, pooled-SD calibration (imported from the audit)."""
    out = bt.recommended_columns(d.copy(), lam, floor_q=config.COST_FLOOR_Q, apply_floor=True)
    sfx = bt.lam_suffix(lam)
    out["capplus"] = out[f"capplus_rec{sfx}"]
    out["rank"] = out.groupby("season")["capplus"].rank(ascending=False, method="min")
    return out[["season", "team", "capplus", "rank"]]


def capplus_shift(base: pd.DataFrame, season: int, est: dict, lam: float) -> pd.DataFrame:
    """Replace one season's dead money by ``est`` {team: usd}; return the per-team
    Cap+ point change and rank shift against the measured build."""
    ref = capplus(base, lam)
    alt = base.copy()
    i = alt["season"] == season
    alt.loc[i, "dead_money_rec"] = alt.loc[i, "team"].map(est).to_numpy()
    new = capplus(alt, lam)
    j = new[new["season"] == season].merge(ref[ref["season"] == season],
                                           on=["season", "team"], suffixes=("", "_ref"))
    j["d_capplus"] = j["capplus"] - j["capplus_ref"]
    j["d_rank"] = j["rank"] - j["rank_ref"]
    return j


# --------------------------------------------------------------------------- #
# validation
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Scenario:
    name: str
    pattern: str          # neighbour pattern to force ('' = whatever is measured)
    shape: tuple          # (n_top, n_bottom) reference-date anchors
    extra: int = 0        # further real readings below the top list (other dates)


SCENARIOS = {
    2013: Scenario("2013 model fallback: next nb, top-5", "n", (5, 0)),
    2016: Scenario("2016: both nb, top-4 + bottom-4", "pn", (4, 4)),
    2020: Scenario("2020: prev nb, top-5 + 6 other-date readings", "p", (5, 0), 6),
    2021: Scenario("2021: next nb, top-5 + bottom-5", "n", (5, 5)),
}


def _available_pattern(season: int, known: list[int]) -> str:
    return ("p" if season - 1 in known else "") + ("n" if season + 1 in known else "")


def _simulated_readings(te: pd.DataFrame, shape: tuple, extra: int):
    o = te.sort_values("y", ascending=False)
    n_top, n_bot = shape
    top = o.head(n_top)
    bot = o.tail(n_bot) if n_bot else o.iloc[0:0]
    ref = {**dict(zip(top["team"], np.exp(top["y"]))), **dict(zip(bot["team"], np.exp(bot["y"])))}
    ref["_shape"] = shape
    ex = o.iloc[n_top:n_top + extra]
    return ref, dict(zip(ex["team"], np.exp(ex["y"])))


def loso_validate(panel: pd.DataFrame, scenario: Scenario, features=FEATURES,
                  force_pattern: bool = True, zero_model: bool = False,
                  lams=(LAMBDA_SENS,)) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Leave-one-season-out over the measured seasons under ``scenario``.

    The held-out season is treated as blank everywhere (it is not a neighbour for
    anyone, and its own values are used only for its simulated anchors and for
    scoring). Returns (team-level predictions, team-level Cap+ shifts).
    """
    known = known_seasons(panel)
    base = capplus_frame(panel)
    preds, shifts = [], []
    for s in known:
        train = [k for k in known if k != s]
        avail = _available_pattern(s, train)
        pattern = scenario.pattern if force_pattern else avail
        if any(c not in avail for c in pattern):
            continue
        m = fit(panel, train, pattern, features=[] if zero_model else features,
                k_top=scenario.shape[0])
        te = panel[panel["season"] == s]
        ref, fixed = _simulated_readings(te, scenario.shape, scenario.extra)
        p = predict_season(panel, m, s, pattern, ref, fixed)
        p["alpha"] = m.alpha
        preds.append(p[["season", "team", "y", "yhat", "anchor", "league_cap", "alpha"]])
        est = dict(zip(p["team"], np.exp(p["yhat"])))
        for lam in lams:
            sh = capplus_shift(base, s, est, lam)
            sh["lam"] = lam
            shifts.append(sh.merge(p[["team", "anchor"]], on="team"))
    return pd.concat(preds, ignore_index=True), pd.concat(shifts, ignore_index=True)


def error_summary(pred: pd.DataFrame) -> dict:
    n = pred[~pred["anchor"]]
    y, yh = np.exp(n["y"]), np.exp(n["yhat"])
    e = yh - y
    return {
        "n_est": int(len(n)),
        "rmse_log": float(np.sqrt(((n["yhat"] - n["y"]) ** 2).mean())),
        "MAPE_median": float(np.median(np.abs(e) / y)),
        "MAPE_mean": float(np.mean(np.abs(e) / y)),
        "WAPE": float(np.abs(e).sum() / y.sum()),
        "medAE_usd": float(np.median(np.abs(e))),
        "medAE_cap_share": float(np.median(np.abs(e) / n["league_cap"])),
        "bias_log": float((n["yhat"] - n["y"]).mean()),
    }


def shift_summary(sh: pd.DataFrame) -> dict:
    a = sh["d_rank"].abs()
    c = sh["d_capplus"].abs()
    return {
        "n": int(len(sh)),
        "med_abs_rank": float(a.median()), "p90_abs_rank": float(a.quantile(0.9)),
        "max_abs_rank": float(a.max()),
        "med_abs_pts": float(c.median()), "p90_abs_pts": float(c.quantile(0.9)),
        "max_abs_pts": float(c.max()),
        "passes": bool(a.median() <= BAR_MEDIAN_RANK and a.quantile(0.9) <= BAR_P90_RANK),
    }


def residual_interval(pred: pd.DataFrame) -> tuple[float, float]:
    r = (pred.loc[~pred["anchor"], "y"] - pred.loc[~pred["anchor"], "yhat"]).to_numpy()
    return float(np.quantile(r, INTERVAL_Q[0])), float(np.quantile(r, INTERVAL_Q[1]))


# --------------------------------------------------------------------------- #
# the blank seasons
# --------------------------------------------------------------------------- #
def resolve_blank_readings(readings: pd.DataFrame, season: int,
                           exclude_full32: bool = False) -> dict:
    """Choose the reference date and sort every reading into anchor / as-is /
    alternate. Returns a dict describing the season's real readings."""
    r = readings[readings["season"] == season]
    if exclude_full32:
        r = r[r["coverage"] != "full32"]
    full = r[r["coverage"] == "full32"]
    if len(full):
        date = full["asof_date"].max()
        rows = full[full["asof_date"] == date]
        return {"ref_date": date, "ref_stage": rows["asof_stage"].iloc[0], "shape": None,
                "anchors": dict(zip(rows["team"], rows["dead_money_usd"])),
                "anchor_src": {t: date for t in rows["team"]}, "fixed": {}, "fixed_src": {},
                "alternates": r[r["asof_date"] != date], "full32": True}

    best = None
    for (s, date), shape in LIST_SHAPE.items():
        if s != season or shape[0] == 0:
            continue
        rows = r[r["asof_date"] == date]
        if len(rows) != sum(shape):
            raise AssertionError(f"{season} {date}: {len(rows)} rows, shape says {shape}")
        vals = dict(zip(rows["team"], rows["dead_money_usd"]))
        srt = sorted(vals.values(), reverse=True)
        hi = srt[shape[0] - 1]
        lo = sorted(vals.values())[shape[1] - 1] if shape[1] else -np.inf
        fixed, src, alt = {}, {}, []
        d0 = pd.Timestamp(date)
        for team, g in r[~r["team"].isin(vals)].groupby("team"):
            g = g.assign(_gap=(pd.to_datetime(g["asof_date"]) - d0).abs()).sort_values(
                ["_gap", "asof_date"])
            cand = g.iloc[0]
            if lo <= cand["dead_money_usd"] <= hi:
                fixed[team] = float(cand["dead_money_usd"])
                src[team] = cand["asof_date"]
                alt.append(g.iloc[1:])
            else:
                alt.append(g)
        alt.append(r[r["team"].isin(vals) & (r["asof_date"] != date)])
        usable = len(vals) + len(fixed)
        key = (usable, date)
        if best is None or key > best[0]:
            best = (key, {"ref_date": date,
                          "ref_stage": rows["asof_stage"].iloc[0], "shape": shape,
                          "anchors": vals, "anchor_src": {t: date for t in vals},
                          "fixed": fixed, "fixed_src": src,
                          "alternates": pd.concat(alt) if alt else r.iloc[0:0],
                          "full32": False})
    if best is None:
        raise AssertionError(f"{season}: no usable reference list")
    return best[1]


def estimate_blank_seasons(panel: pd.DataFrame, readings: pd.DataFrame,
                           intervals: dict, exclude_full32_2013: bool = False) -> pd.DataFrame:
    """Fit on all nine measured seasons and estimate each blank season."""
    known = known_seasons(panel)
    rows = []
    for season in BLANK_SEASONS:
        rb = resolve_blank_readings(readings, season,
                                    exclude_full32=(season == 2013 and exclude_full32_2013))
        te = panel[panel["season"] == season]
        if rb["full32"]:
            # A measured full-32 table: nothing to estimate (option (a) for 2013).
            for t in te["team"]:
                v = float(rb["anchors"][t])
                rows.append({"season": season, "team": t, "dead_money_usd_est": v,
                             "lo_usd": v, "hi_usd": v, "method": "measured_full32",
                             "anchor_used": True, "anchor_asof_date": rb["ref_date"],
                             "ref_asof_date": rb["ref_date"], "ref_asof_stage": rb["ref_stage"],
                             "features_note": f"real reading as of {rb['ref_date']} "
                                              f"(full 32-team table); not estimated"})
            continue
        pattern = NEIGHBOUR_PATTERN[season]
        m = fit(panel, known, pattern, k_top=rb["shape"][0])
        ref = dict(rb["anchors"])
        ref["_shape"] = rb["shape"]
        p = predict_season(panel, m, season, pattern, ref, rb["fixed"])
        qlo, qhi = intervals[season]
        nb = {"p": f"{season - 1} z", "n": f"{season + 1} z", "pn": f"{season - 1} & {season + 1} z"}
        feat_txt = ", ".join([c for c in m.columns if c not in ("zp", "zn")]
                             + ([nb[pattern]] if "nb" in FEATURES else []))
        for _, r in p.iterrows():
            t = r["team"]
            est = float(np.exp(r["yhat"]))
            if t in rb["anchors"]:
                d = rb["anchor_src"][t]
                rows.append({"season": season, "team": t, "dead_money_usd_est": est,
                             "lo_usd": est, "hi_usd": est, "method": "reading_ref_date",
                             "anchor_used": True, "anchor_asof_date": d,
                             "ref_asof_date": rb["ref_date"], "ref_asof_stage": rb["ref_stage"],
                             "features_note": f"real reading as of {d} (reference-date list)"})
            elif t in rb["fixed"]:
                d = rb["fixed_src"][t]
                rows.append({"season": season, "team": t, "dead_money_usd_est": est,
                             "lo_usd": est, "hi_usd": est, "method": "reading_other_date",
                             "anchor_used": True, "anchor_asof_date": d,
                             "ref_asof_date": rb["ref_date"], "ref_asof_stage": rb["ref_stage"],
                             "features_note": f"real reading as of {d}, used as-is in the "
                                              f"{rb['ref_date']} table (inside its bounds)"})
            else:
                lo = max(est * np.exp(qlo), r["bound_lo_usd"])
                hi = min(est * np.exp(qhi), r["bound_hi_usd"], max(r["unaccounted_vs_adjusted"], est))
                rows.append({"season": season, "team": t, "dead_money_usd_est": est,
                             "lo_usd": min(lo, est), "hi_usd": max(hi, est),
                             "method": "ridge_z_anchor_level",
                             "anchor_used": False, "anchor_asof_date": "",
                             "ref_asof_date": rb["ref_date"], "ref_asof_stage": rb["ref_stage"],
                             "features_note": f"estimated as of {rb['ref_date']}; features: "
                                              f"{feat_txt}; level from the {rb['ref_date']} "
                                              f"list (mu={r['mu']:.2f}, sigma={r['sigma']:.2f})"})
    out = pd.DataFrame(rows)
    for c in ("dead_money_usd_est", "lo_usd", "hi_usd"):
        out[c] = out[c].round(0).astype("int64")
    return out.sort_values(["season", "team"]).reset_index(drop=True)


def model_2013(panel: pd.DataFrame, readings: pd.DataFrame, interval: tuple) -> pd.DataFrame:
    """Option (b) for 2013 / the SAFE-tier fallback: the Houston Press table set
    aside, the NFP 2013-12-06 top-5 as anchors, everyone else estimated."""
    out = estimate_blank_seasons(panel, readings, {**{s: interval for s in BLANK_SEASONS}},
                                 exclude_full32_2013=True)
    return out[out["season"] == 2013].reset_index(drop=True)


# --------------------------------------------------------------------------- #
# evidence
# --------------------------------------------------------------------------- #
def feature_ablation(panel: pd.DataFrame) -> pd.DataFrame:
    """Leave-one-feature-out from the full candidate set, plus single features and
    the no-model baseline, on the natural neighbour pattern across the three
    anchor shapes. Lower is better on every column."""
    full = list(CANDIDATE_FEATURES)
    sets = {"anchors + median fill (no model)": None, "full candidate set": full}
    for f in full:
        sets[f"full minus {f}"] = [x for x in full if x != f]
    for f in full:
        sets[f"{f} only"] = [f]
    sets["SHIPPED: " + "+".join(FEATURES)] = list(FEATURES)
    shapes = [Scenario("t5", "", (5, 0)), Scenario("t4b4", "", (4, 4)),
              Scenario("t5b5", "", (5, 5))]
    rows = []
    for name, fs in sets.items():
        ps, ss = [], []
        for sc in shapes:
            p, s = loso_validate(panel, sc, features=fs or [], force_pattern=False,
                                 zero_model=fs is None)
            ps.append(p)
            ss.append(s)
        p, s = pd.concat(ps), pd.concat(ss)
        e, h = error_summary(p), shift_summary(s)
        rows.append({"features": name, "rmse_log": e["rmse_log"], "WAPE": e["WAPE"],
                     "MAPE_median": e["MAPE_median"],
                     "mean_abs_capplus_pts": float(s["d_capplus"].abs().mean()),
                     "p90_abs_capplus_pts": h["p90_abs_pts"],
                     "mean_abs_rank": float(s["d_rank"].abs().mean())})
    return pd.DataFrame(rows)


def capplus_reference_points(panel: pd.DataFrame, lam: float = LAMBDA_SENS) -> dict:
    """How far Cap+ moves under crude fills, for scale: no dead money at all, and
    every team at its season median (no anchors)."""
    base = capplus_frame(panel)
    ref = capplus(base, lam)
    out = {}
    for name, alt in (
        ("dead money = 0", base.assign(dead_money_rec=0.0)),
        ("season median, no anchors",
         base.assign(dead_money_rec=base.groupby("season")["dead_money_rec"].transform("median"))),
    ):
        j = capplus(alt, lam).merge(ref, on=["season", "team"], suffixes=("", "_ref"))
        j["d_rank"] = j["rank"] - j["rank_ref"]
        j["d_capplus"] = j["capplus"] - j["capplus_ref"]
        out[name] = shift_summary(j)
    return out


def stage_effect_2018(panel: pd.DataFrame, readings: pd.DataFrame,
                      lam: float = LAMBDA_SENS) -> dict:
    """The one season with two full-32 tables at different dates. Measures what
    an early table does to Cap+ against the later one (option (a)'s stage cost),
    and what a mixed table -- later leaders, early everyone else -- does (option
    (b) used as-is)."""
    base = capplus_frame(panel)
    r = readings[readings["season"] == 2018]
    mar = dict(zip(r.loc[r["asof_date"] == "2018-03-01", "team"],
                   r.loc[r["asof_date"] == "2018-03-01", "dead_money_usd"]))
    jul = panel[panel["season"] == 2018].set_index("team")["dead_money_rec"]
    top5 = jul.sort_values(ascending=False).head(5).index
    mixed = {t: (jul[t] if t in top5 else mar[t]) for t in jul.index}
    out = {}
    for name, est in (("March table in place of July", mar),
                      ("July top-5 + March for the other 27", mixed)):
        out[name] = shift_summary(capplus_shift(base, 2018, est, lam))
    lj, lm = np.log(jul), np.log(pd.Series(mar)[jul.index])
    out["log corr March vs July"] = float(np.corrcoef(lj, lm)[0, 1])
    out["July/March median ratio"] = float(np.median(jul / pd.Series(mar)[jul.index]))
    return out


def compare_2013(panel: pd.DataFrame, readings: pd.DataFrame, est_b: pd.DataFrame,
                 lam: float = LAMBDA_SENS) -> pd.DataFrame:
    """2013 Cap+ ranks under (a) the Houston Press table, (b1) NFP top-5 + Houston
    for the rest as-is (mixed dates), (b2) the model. 2013 is appended to the
    nine measured seasons; the pooled SD is held at the nine-season value so the
    measured seasons do not move."""
    r = readings[readings["season"] == 2013]
    hp = dict(zip(r.loc[r["coverage"] == "full32", "team"],
                  r.loc[r["coverage"] == "full32", "dead_money_usd"]))
    nfp = dict(zip(r.loc[r["asof_date"] == "2013-12-06", "team"],
                   r.loc[r["asof_date"] == "2013-12-06", "dead_money_usd"]))
    b2 = dict(zip(est_b["team"], est_b["dead_money_usd_est"]))
    opts = {"a_houston_mar18": hp, "b1_mixed_asis": {**hp, **nfp}, "b2_model_dec06": b2}
    res = []
    for k, dm in opts.items():
        res.append(blank_season_capplus(panel, 2013, dm, lam).rename(
            columns={"capplus": f"capplus_{k}", "rank": f"rank_{k}"}))
    out = res[0]
    for x in res[1:]:
        out = out.merge(x, on=["season", "team"])
    for k in opts:
        out[f"dm_{k}"] = out["team"].map(opts[k])
    return out


def blank_season_capplus(panel: pd.DataFrame, season: int, dm: dict,
                         lam: float = LAMBDA_SENS) -> pd.DataFrame:
    """Cap+ for one blank season from a {team: usd} table, calibrated with the
    nine measured seasons' pooled SD so their published numbers do not move."""
    base = capplus_frame(panel)
    te = panel[panel["season"] == season][["season", "team", "cap_used_total",
                                           "league_cap", "P"]].copy()
    te["dead_money_rec"] = te["team"].map(dm).astype(float)
    te["rec_computable"] = True
    d = pd.concat([base, te], ignore_index=True)
    d = bt.recommended_columns(d, lam, floor_q=config.COST_FLOOR_Q, apply_floor=True)
    sfx = bt.lam_suffix(lam)
    raw = d[f"raw_rec{sfx}"]
    dev = raw - raw.groupby(d["season"]).transform("mean")
    known = d["season"] != season
    sd = bt.pooled_within_season_sd(
        pd.DataFrame({"season": d.loc[known, "season"], "x": dev[known]}), "x")
    d["capplus"] = 100.0 + 15.0 * dev / sd
    d = d[d["season"] == season].copy()
    d["rank"] = d["capplus"].rank(ascending=False, method="min")
    return d[["season", "team", "capplus", "rank"]]


def pooled_sd_shift(panel: pd.DataFrame, est: pd.DataFrame, lam: float = LAMBDA_SENS) -> dict:
    """If the estimated seasons ENTER the pooled-SD calibration, how far do the 288
    measured Cap+ values move? (Ranks cannot move: they are within-season.)"""
    base = capplus_frame(panel)
    ref = capplus(base, lam)
    add = panel[panel["season"].isin(BLANK_SEASONS)][["season", "team", "cap_used_total",
                                                       "league_cap", "P"]].copy()
    add = add.merge(est[["season", "team", "dead_money_usd_est"]], on=["season", "team"])
    add = add.rename(columns={"dead_money_usd_est": "dead_money_rec"})
    add["rec_computable"] = True
    allp = capplus(pd.concat([base, add], ignore_index=True), lam)
    j = allp.merge(ref, on=["season", "team"], suffixes=("", "_ref"))
    return {"max_abs_pts_on_measured": float((j["capplus"] - j["capplus_ref"]).abs().max()),
            "median_abs_pts_on_measured": float((j["capplus"] - j["capplus_ref"]).abs().median())}


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
OUT_COLUMNS = deadmoney.ESTIMATED_COLUMNS


def attach_source_urls(est: pd.DataFrame, readings: pd.DataFrame) -> pd.DataFrame:
    """Each real reading carries its source's URL (so `etl/deadmoney.py` can
    tier it by exact URL); a modeled row carries none."""
    r = readings[["season", "team", "asof_date", "source_url", "dead_money_usd"]].rename(
        columns={"asof_date": "anchor_asof_date"})
    out = est.merge(r, on=["season", "team", "anchor_asof_date"], how="left",
                    validate="m:1")
    pub = out["anchor_used"].astype(bool)
    if out.loc[pub, "source_url"].isna().any():
        raise AssertionError("a published row in the estimate has no source reading")
    if (out.loc[pub, "dead_money_usd"].round() != out.loc[pub, "dead_money_usd_est"]).any():
        raise AssertionError("a published row in the estimate is not its source's value")
    out.loc[~pub, "source_url"] = ""
    return out.drop(columns=["dead_money_usd"])


def run(report: bool = False) -> dict:
    panel = build_panel()
    readings = load_readings()

    results, intervals = {}, {}
    for season, sc in SCENARIOS.items():
        pred, sh = loso_validate(panel, sc, lams=(LAMBDA_SENS, LAMBDA_SECONDARY))
        intervals[season] = residual_interval(pred)
        s1 = sh[sh["lam"] == LAMBDA_SENS]
        results[season] = {
            "scenario": sc, "pred": pred, "shift": sh,
            "errors": error_summary(pred),
            "cap_lam10": shift_summary(s1),
            "cap_lam10_estimated_only": shift_summary(s1[~s1["anchor"]]),
            "cap_lam15": shift_summary(sh[sh["lam"] == LAMBDA_SECONDARY]),
            "per_season": pd.DataFrame([
                {"held_out": int(s), **error_summary(pred[pred["season"] == s]),
                 **shift_summary(s1[s1["season"] == s]),
                 "alpha": float(pred.loc[pred["season"] == s, "alpha"].iloc[0])}
                for s in sorted(pred["season"].unique())]),
        }
        # the same shape on every measured season, neighbours as available
        p2, s2 = loso_validate(panel, Scenario(sc.name, "", sc.shape, sc.extra),
                               force_pattern=False)
        results[season]["all9"] = shift_summary(s2)
        # baseline: anchors + median fill, no model
        p0, s0 = loso_validate(panel, sc, zero_model=True)
        results[season]["baseline"] = shift_summary(s0)
        results[season]["baseline_err"] = error_summary(p0)

    est = attach_source_urls(estimate_blank_seasons(panel, readings, intervals), readings)
    if len(est) != 128 or est.groupby("season")["team"].nunique().ne(32).any():
        raise AssertionError("estimate is not 4 x 32")
    io_utils.write_csv(est[OUT_COLUMNS], OUT, sort=["season", "team"])
    est13 = attach_source_urls(model_2013(panel, readings, intervals[2013]), readings)
    io_utils.write_csv(est13[OUT_COLUMNS], OUT_2013_MODEL, sort=["season", "team"])

    out = {"panel": panel, "readings": readings, "results": results, "intervals": intervals,
           "estimate": est, "estimate_2013_model": est13}
    if report:
        out["ablation"] = feature_ablation(panel)
        out["reference_points"] = capplus_reference_points(panel)
        out["stage_2018"] = stage_effect_2018(panel, readings)
        out["compare_2013"] = compare_2013(panel, readings, est13)
        out["pool_shift"] = pooled_sd_shift(panel, est)
        out["blank_resolution"] = {s: resolve_blank_readings(readings, s) for s in BLANK_SEASONS}
        out["final_fits"] = {s: fit(panel, known_seasons(panel), NEIGHBOUR_PATTERN[s],
                                    k_top=SCENARIOS[s].shape[0]) for s in BLANK_SEASONS}
    return out


def _print_report(o: dict) -> None:
    pd.set_option("display.width", 200)
    print("\n== LOSO by scenario (lambda=1.0, all 32 teams of each held-out season) ==")
    for s, r in o["results"].items():
        print(f"\n-- {r['scenario'].name}")
        print("errors (estimated teams):", {k: round(v, 3) for k, v in r["errors"].items()})
        print("model    :", r["cap_lam10"])
        print("est-only :", r["cap_lam10_estimated_only"])
        print("lam 1.5  :", r["cap_lam15"])
        print("all 9    :", r["all9"])
        print("baseline :", r["baseline"], {k: round(v, 3) for k, v in r["baseline_err"].items()})
        print(r["per_season"].round(3).to_string(index=False))
        print("interval (log q10, q90):", np.round(o["intervals"][s], 3))
    print("\n== ablation ==")
    print(o["ablation"].round(3).to_string(index=False))
    print("\n== reference points ==", o["reference_points"])
    print("\n== stage effect 2018 ==", o["stage_2018"])
    print("\n== pooled SD shift ==", o["pool_shift"])
    print("\n== final fits ==")
    for s, m in o["final_fits"].items():
        print(s, m.columns, "alpha", m.alpha, m.coef, "sigma~top:", np.round(m.sigma_on_top, 3))
    print("\n== blank resolution ==")
    for s, b in o["blank_resolution"].items():
        print(s, b["ref_date"], b["shape"], "anchors", len(b["anchors"]), "as-is", b["fixed"],
              "\n   alternates:", b["alternates"][["team", "asof_date", "dead_money_usd"]]
              .to_dict("records"))
    print("\n== 2013 options ==")
    c = o["compare_2013"]
    print(c.sort_values("rank_a_houston_mar18").round(1).to_string(index=False))
    for k in ("b1_mixed_asis", "b2_model_dec06"):
        d = (c[f"rank_{k}"] - c["rank_a_houston_mar18"]).abs()
        print(k, "vs a: median |drank|", d.median(), "p90", d.quantile(0.9), "max", d.max())
    print("\n== top 10 per blank season ==")
    e = o["estimate"]
    for s in BLANK_SEASONS:
        print(e[e["season"] == s].sort_values("dead_money_usd_est", ascending=False).head(10)
              [["team", "dead_money_usd_est", "lo_usd", "hi_usd", "method", "anchor_asof_date"]]
              .to_string(index=False))
    e = o["estimate_2013_model"]
    print(e.sort_values("dead_money_usd_est", ascending=False).head(10)
          [["team", "dead_money_usd_est", "lo_usd", "hi_usd", "method"]].to_string(index=False))


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    o = run(report="--report" in argv)
    print(f"wrote {OUT.relative_to(config.REPO)} ({len(o['estimate'])} rows) and "
          f"{OUT_2013_MODEL.relative_to(config.REPO)} ({len(o['estimate_2013_model'])} rows)")
    for s, r in o["results"].items():
        c = r["cap_lam10"]
        print(f"  {s}: LOSO median |rank shift| {c['med_abs_rank']:.1f}, "
              f"p90 {c['p90_abs_rank']:.1f} -> {'PASS' if c['passes'] else 'FAIL'}")
    if "--report" in argv:
        _print_report(o)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
