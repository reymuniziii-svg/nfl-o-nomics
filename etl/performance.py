"""`team_season_results` + `team_season_epa` — SPEC.md §7.1, §7.2.

Promoted from `audit/audit_schedules.py` and `audit/audit_pbp.py`
(`ARCHITECTURE.md` §4). Both marts are **final** and this module re-emits them
byte-identically; the pipeline diffs the result against the committed file and
fails on any drift.

Two rules are load-bearing and both are settled decisions:

* `play_type IN ('pass','run')`, **REG only** (`DECISIONS.md` 9). There is no
  `'rush'` literal, and the numeric `pass`/`rush` flag columns use a wider
  definition that attributes penalty-nullified and `no_play` snaps.
* **A tie counts as half a win**, on per-team game counts, never a constant
  (`DECISIONS.md` 10). 2022 BUF and 2022 CIN played 16 games, not 17.

Two additive layers sit on top and never touch the columns above:

* `team_season_results.playoff_*` — the postseason outcome from the same
  schedules file (`game_type` WC/DIV/CON/SB). Regular-season columns are built
  first and asserted unchanged after the merge.
* `team_season_epa.*_adj` — opponent-adjusted EPA/play. Per season, game-level
  offensive EPA/play is fitted as `league + offense_i + defense_j` by
  play-weighted least squares with sum-to-zero team effects (numpy only); the
  adjusted rate is the raw team-mean plus the effect, so each season's
  team-mean is preserved exactly.

The season builders are parameterised so the 2026 live layer (`etl/live/`,
`DECISIONS.md` 116) reuses them on a partial season without touching history:
`season_results`, `_season_epa` and `_season_games` take `max_week`, and
`_opponent_adjust` checks each team's pbp game count against an
`expected_games` mapping (the schedule's own count) rather than a hard-coded
16/17. The adjustment thresholds are parameters with the historical values as
defaults. Called with no `max_week`, every query and every check is the one the
frozen marts were built with.
"""

from __future__ import annotations

import time

import numpy as np
import pandas as pd

from . import config, io_utils, sources
from .team_codes import EXPECTED_TEAMS, assert_canonical, normalize_series

# nflverse encodes rushes as play_type='run'; there is no 'rush' literal.
_SCRIM = "play_type IN ('pass','run')"
# Empty-string posteam/defteam appear in some older seasons; treat as missing.
_HASPOS = "posteam IS NOT NULL AND posteam <> ''"
_HASDEF = "defteam IS NOT NULL AND defteam <> ''"

NEEDED_PBP_COLS = "season, season_type, game_id, posteam, defteam, play_type, epa"

# League-mean offensive EPA/play sanity band (DATA_AUDIT.md S6).
EPA_BAND = (-0.15, 0.15)

# --- opponent adjustment (team_season_epa *_adj columns) -------------------
# Ridge penalty on the team effects, in plays. 0 = plain constrained least
# squares: the adjustment is then purely "who you played", with no shrinkage
# toward the league mean mixed in. The schedule graph is connected every
# season, so the constrained system is non-singular without it.
ADJ_RIDGE_PLAYS = 0.0
# No team's offensive or defensive EPA/play may move by more than this. A larger
# shift means the fit or the game join broke, not that a schedule was that hard.
ADJ_MAX_SHIFT = 0.08
# Adjusted and raw EPA margin must stay this correlated within every season.
ADJ_MIN_CORR = 0.9
# Mean-preservation tolerance (pre-rounding).
ADJ_MEAN_TOL = 1e-9
# nflverse pbp omits three REG games outright (zero rows, any season_type):
# 1999_01_BAL_STL, 2000_03_SD_KC, 2000_06_BUF_MIA. These six team-seasons'
# EPA -- raw and adjusted -- covers 15 games, not 16. Declared, not tolerated:
# a new gap fails the build.
PBP_MISSING_GAMES = {
    (1999, "BAL"): 1, (1999, "LA"): 1,
    (2000, "LAC"): 1, (2000, "KC"): 1,
    (2000, "BUF"): 1, (2000, "MIA"): 1,
}

# --- playoff result (team_season_results playoff_* columns) ----------------
# nflverse game_type -> round order. Same four names 1999-2025.
PLAYOFF_ROUNDS = {"WC": 1, "DIV": 2, "CON": 3, "SB": 4}
# The round a team was eliminated in (by its last game, lost).
PLAYOFF_LOST_IN = {1: "wild_card", 2: "divisional", 3: "conference", 4: "super_bowl_loss"}
PLAYOFF_RESULTS = ("none", "wild_card", "divisional", "conference",
                   "super_bowl_loss", "super_bowl_win")
# 12-team field through 2019; 14 from 2020 (six WC games, one bye per conference).
PLAYOFF_FIELD_EXPANDED = 2020


def playoff_field(season: int) -> int:
    return 14 if season >= PLAYOFF_FIELD_EXPANDED else 12


# Golden structural tests carried into the build (DATA_AUDIT.md §3, tests 1-4).
GOLDEN_RECORDS = [
    (2007, "NE", 16, 0, 0),
    (2008, "DET", 0, 16, 0),
    (2017, "CLE", 0, 16, 0),
]


# --------------------------------------------------------------------------- #
# team_season_results
# --------------------------------------------------------------------------- #
#: Rows read out of each upstream asset, for etl/pins.toml. Set during the build.
ASSET_ROWS: dict[str, int] = {}


#: The regular-season block of `team_season_results`, in column order.
RESULTS_REG_COLS = [
    "season", "team", "games", "wins", "losses", "ties", "win_pct",
    "points_for", "points_against", "point_diff",
]


def season_results(reg: pd.DataFrame, *, max_week: int | None = None) -> pd.DataFrame:
    """Per-team regular-season record from scored schedule rows. Pure.

    `reg` holds REG games with integer scores and normalised team codes. With
    `max_week`, only games in weeks <= max_week count (the live layer's closed
    weeks); without it, every row counts, exactly as the frozen mart was built.
    """
    if max_week is not None:
        reg = reg[reg["week"] <= int(max_week)]
    home = pd.DataFrame({
        "season": reg["season"], "team": reg["home_team"],
        "pf": reg["home_score"], "pa": reg["away_score"],
    })
    away = pd.DataFrame({
        "season": reg["season"], "team": reg["away_team"],
        "pf": reg["away_score"], "pa": reg["home_score"],
    })
    long = pd.concat([home, away], ignore_index=True)
    long["win"] = (long["pf"] > long["pa"]).astype(int)
    long["loss"] = (long["pf"] < long["pa"]).astype(int)
    long["tie"] = (long["pf"] == long["pa"]).astype(int)

    m = long.groupby(["season", "team"], as_index=False).agg(
        games=("win", "size"),
        wins=("win", "sum"),
        losses=("loss", "sum"),
        ties=("tie", "sum"),
        points_for=("pf", "sum"),
        points_against=("pa", "sum"),
    )
    # Ties count as half a win; per-team game counts drive the denominator.
    m["win_pct"] = ((m["wins"] + 0.5 * m["ties"]) / m["games"]).round(config.ROUND_RATIO)
    m["point_diff"] = m["points_for"] - m["points_against"]
    return m[RESULTS_REG_COLS].sort_values(["season", "team"]).reset_index(drop=True)


def build_team_season_results(*, verbose: bool = True) -> pd.DataFrame:
    lo, hi = config.PERF_WINDOW
    g = pd.read_csv(config.GAMES_URL)
    g["home_team"] = normalize_series(g["home_team"])
    g["away_team"] = normalize_series(g["away_team"])

    # games.csv already carries 272 unplayed 2026 rows with null scores; every
    # mart clips to 1999-2025 (DECISIONS 46).
    win = g[g["season"].between(lo, hi)]
    reg = win[win["game_type"] == "REG"].copy()
    unplayed = reg[reg["home_score"].isna() | reg["away_score"].isna()]
    if not unplayed.empty:
        raise AssertionError(
            f"{len(unplayed)} REG games in {lo}-{hi} have a null score: "
            f"{unplayed.groupby('season').size().to_dict()}"
        )
    reg["home_score"] = reg["home_score"].astype(int)
    reg["away_score"] = reg["away_score"].astype(int)
    ASSET_ROWS["games"] = len(reg)

    base = season_results(reg)
    reg_cols = RESULTS_REG_COLS

    po = _playoffs(win)
    po["team"] = po["team"].astype(base["team"].dtype)
    out = base.merge(po, on=["season", "team"], how="left", validate="1:1")
    out["playoff_result"] = out["playoff_result"].fillna("none")
    for c in ("playoff_games", "playoff_wins"):
        out[c] = out[c].fillna(0).astype(int)
    # Additive only: the regular-season block must survive the merge untouched.
    if not out[reg_cols].equals(base):
        raise AssertionError("playoff merge altered a regular-season column")

    _check_results(out, verbose=verbose)
    _check_playoffs(out, po, verbose=verbose)
    return out


def _playoffs(win: pd.DataFrame) -> pd.DataFrame:
    """One row per playoff team-season: games, wins, and the round it went out."""
    post = win[win["game_type"] != "REG"].copy()
    unknown = set(post["game_type"]) - set(PLAYOFF_ROUNDS)
    if unknown:
        raise AssertionError(f"unknown postseason game_type(s): {sorted(unknown)}")
    if (post["home_score"].isna() | post["away_score"].isna()).any():
        raise AssertionError("a postseason game in the window has a null score")
    if (post["home_score"] == post["away_score"]).any():
        raise AssertionError("a postseason game ended tied")
    ASSET_ROWS["games_post"] = len(post)
    post["round"] = post["game_type"].map(PLAYOFF_ROUNDS)
    long = pd.concat([
        pd.DataFrame({"season": post["season"], "team": post["home_team"],
                      "round": post["round"],
                      "won": (post["home_score"] > post["away_score"]).astype(int)}),
        pd.DataFrame({"season": post["season"], "team": post["away_team"],
                      "round": post["round"],
                      "won": (post["away_score"] > post["home_score"]).astype(int)}),
    ], ignore_index=True)
    rows = []
    for (season, team), g in long.groupby(["season", "team"], sort=True):
        if g["round"].duplicated().any():
            raise AssertionError(f"{season} {team}: two games in one playoff round")
        last = g.loc[g["round"].idxmax()]
        if int(g["won"].sum()) != len(g) - (0 if last["won"] else 1):
            raise AssertionError(f"{season} {team}: won after being eliminated")
        if last["won"]:
            if int(last["round"]) != PLAYOFF_ROUNDS["SB"]:
                raise AssertionError(f"{season} {team}: last playoff game is a non-SB win")
            result = "super_bowl_win"
        else:
            result = PLAYOFF_LOST_IN[int(last["round"])]
        rows.append({"season": int(season), "team": team, "playoff_result": result,
                     "playoff_games": len(g), "playoff_wins": int(g["won"].sum())})
    return pd.DataFrame(rows)


def _check_playoffs(out: pd.DataFrame, po: pd.DataFrame, *, verbose: bool) -> None:
    if len(po) != (out["playoff_result"] != "none").sum():
        raise AssertionError("a playoff team is missing from the regular-season frame")
    bad = set(out["playoff_result"]) - set(PLAYOFF_RESULTS)
    if bad:
        raise AssertionError(f"playoff_result outside vocabulary: {sorted(bad)}")
    for season, grp in out.groupby("season"):
        vc = grp["playoff_result"].value_counts()
        if vc.get("super_bowl_win", 0) != 1 or vc.get("super_bowl_loss", 0) != 1:
            raise AssertionError(f"{season}: not exactly one SB winner and one SB loser")
        field = int((grp["playoff_result"] != "none").sum())
        if field != playoff_field(int(season)):
            raise AssertionError(f"{season}: {field} playoff teams, "
                                 f"expected {playoff_field(int(season))}")
        # Every playoff game has exactly one winner.
        n_games = grp["playoff_games"].sum() / 2
        if grp["playoff_wins"].sum() != n_games or n_games != field - 1:
            raise AssertionError(f"{season}: playoff games/wins do not balance")
    if verbose:
        n = out[out["playoff_result"] != "none"].groupby("season").size()
        print(f"  playoffs: field {n.min()}-{n.max()} per season; one SB winner and "
              f"loser in every season; regular-season columns unchanged")


def _check_results(out: pd.DataFrame, *, verbose: bool) -> None:
    io_utils.assert_rows(out, "team_season_results")
    assert_canonical(out["team"], "team_season_results")
    for season, n in out.groupby("season").size().items():
        exp = EXPECTED_TEAMS[int(season)]
        if n != exp:
            raise AssertionError(f"{season}: {n} teams, expected {exp}")
    if not (out["wins"] + out["losses"] + out["ties"] == out["games"]).all():
        raise AssertionError("record arithmetic does not close")
    for season, grp in out.groupby("season"):
        if grp["points_for"].sum() != grp["points_against"].sum():
            raise AssertionError(f"{season}: league points do not balance")
    for season, team, w, l, t in GOLDEN_RECORDS:
        r = out[(out["season"] == season) & (out["team"] == team)]
        if r.empty or not (int(r.iloc[0].wins) == w and int(r.iloc[0].losses) == l
                           and int(r.iloc[0].ties) == t):
            raise AssertionError(f"golden record failed: {season} {team} != {w}-{l}-{t}")
    # 2022 BUF and CIN played 16 games, not 17. Assert it rather than assume it.
    g22 = out[out["season"] == 2022].set_index("team")["games"].to_dict()
    sixteen = sorted(t for t, n in g22.items() if n == 16)
    if sixteen != ["BUF", "CIN"]:
        raise AssertionError(f"2022 16-game teams changed: {sixteen}")
    if verbose:
        print(f"  team_season_results: {len(out)} rows, "
              f"{out['season'].min()}-{out['season'].max()}; golden records PASS; "
              f"2022 16-game teams {sixteen}")


# --------------------------------------------------------------------------- #
# team_season_epa
# --------------------------------------------------------------------------- #
def _weeks(max_week: int | None) -> str:
    """The closed-week filter. Empty for a final season, so the historical SQL
    is unchanged character for character."""
    return "" if max_week is None else f" AND week <= {int(max_week)}"


def _season_epa(con, year: int, *, max_week: int | None = None) -> pd.DataFrame:
    wk = _weeks(max_week)
    off = con.execute(f"""
        SELECT posteam AS team, count(*) AS off_plays, sum(epa) AS off_epa_total
        FROM pbp
        WHERE season_type='REG' AND {_SCRIM} AND epa IS NOT NULL AND {_HASPOS}{wk}
        GROUP BY 1
    """).df()
    dfn = con.execute(f"""
        SELECT defteam AS team, count(*) AS def_plays, sum(epa) AS def_epa_total
        FROM pbp
        WHERE season_type='REG' AND {_SCRIM} AND epa IS NOT NULL AND {_HASDEF}{wk}
        GROUP BY 1
    """).df()
    off["team"] = normalize_series(off["team"])
    dfn["team"] = normalize_series(dfn["team"])
    off = off.dropna(subset=["team"]).groupby("team", as_index=False).sum()
    dfn = dfn.dropna(subset=["team"]).groupby("team", as_index=False).sum()

    m = off.merge(dfn, on="team", how="outer")
    m.insert(0, "season", year)
    m["off_epa_per_play"] = m["off_epa_total"] / m["off_plays"]
    m["def_epa_per_play"] = m["def_epa_total"] / m["def_plays"]
    m["epa_margin_per_play"] = m["off_epa_per_play"] - m["def_epa_per_play"]
    return m


def _season_games(con, *, max_week: int | None = None) -> pd.DataFrame:
    """Offensive EPA by game: one row per (game_id, offense, defense)."""
    g = con.execute(f"""
        SELECT game_id, posteam AS off, defteam AS def,
               count(*) AS plays, sum(epa) AS epa_total
        FROM pbp
        WHERE season_type='REG' AND {_SCRIM} AND epa IS NOT NULL
              AND {_HASPOS} AND {_HASDEF}{_weeks(max_week)}
        GROUP BY 1, 2, 3
    """).df()
    g["off"] = normalize_series(g["off"])
    g["def"] = normalize_series(g["def"])
    g = (g.dropna(subset=["off", "def"])
          .groupby(["game_id", "off", "def"], as_index=False)[["plays", "epa_total"]].sum()
          .sort_values(["game_id", "off", "def"], kind="stable")
          .reset_index(drop=True))
    return g


def _opponent_adjust(games: pd.DataFrame, ts: pd.DataFrame, year: int, *,
                     expected_games: dict[str, int],
                     missing_games: dict[str, int] | None = None,
                     ridge: float = ADJ_RIDGE_PLAYS) -> pd.DataFrame:
    """Fit epa_game = mu + offense_i + defense_j, play-weighted, sum-to-zero.

    Solved as one KKT system (numpy only):
        min  sum_g plays_g * (y_g - mu - o_i - d_j)^2 + ridge*(|o|^2 + |d|^2)
        s.t. sum(o) = 0,  sum(d) = 0
    Adjusted rate = the raw team-mean for that side + the team's effect, so the
    unweighted season mean of each side is preserved exactly.

    `expected_games` is each team's scheduled REG game count over the window
    read (the full season for history, weeks <= asof for the live layer);
    `missing_games` declares games the schedule has and pbp does not. Every
    team's pbp game count plus its declared gap must equal its schedule count.
    """
    teams = sorted(ts["team"])
    ix = {t: k for k, t in enumerate(teams)}
    n, m = len(teams), len(games)
    oi, dj = games["off"].map(ix), games["def"].map(ix)
    if oi.isna().any() or dj.isna().any():
        raise AssertionError(f"{year}: a game team is missing from the season frame")
    oi, dj = oi.to_numpy(dtype=int), dj.to_numpy(dtype=int)
    w = games["plays"].to_numpy(dtype=float)
    y = games["epa_total"].to_numpy(dtype=float) / w

    # Normal equations X'WX, X'Wy accumulated directly (each game row has a 1 in
    # the intercept, its offense and its defense column): no BLAS matmul, fixed
    # summation order, byte-stable.
    p = 1 + 2 * n
    cols = np.stack([np.zeros(m, dtype=int), 1 + oi, 1 + n + dj], axis=1)
    A = np.zeros((p, p))
    b = np.zeros(p)
    for a in range(3):
        np.add.at(b, cols[:, a], w * y)
        for c in range(3):
            np.add.at(A, (cols[:, a], cols[:, c]), w)
    A[1:, 1:] += ridge * np.eye(2 * n)
    C = np.zeros((2, p))
    C[0, 1:1 + n] = 1.0
    C[1, 1 + n:] = 1.0
    K = np.block([[A, C.T], [C, np.zeros((2, 2))]])
    sol = np.linalg.solve(K, np.concatenate([b, np.zeros(2)]))
    off_eff, def_eff = sol[1:1 + n], sol[1 + n:p]

    raw = ts.set_index("team").loc[teams]
    adj = pd.DataFrame({"team": teams})
    adj["off_epa_per_play_adj"] = raw["off_epa_per_play"].mean() + off_eff
    adj["def_epa_per_play_adj"] = raw["def_epa_per_play"].mean() + def_eff
    adj["epa_margin_per_play_adj"] = (adj["off_epa_per_play_adj"]
                                      - adj["def_epa_per_play_adj"])

    # Strength of schedule, for display: mean raw EPA margin of the opponent in
    # each game played (a twice-met division rival counts twice).
    margin = raw["epa_margin_per_play"]
    gp = games.assign(opp_margin=games["def"].map(margin))
    sos = gp.groupby("off")["opp_margin"].agg(["mean", "size"])
    missing = missing_games or {}
    full = sos["size"] + [missing.get(t, 0) for t in sos.index]
    if set(full.index) != set(expected_games):
        raise AssertionError(f"{year}: pbp teams differ from the schedule: "
                             f"{sorted(set(full.index) ^ set(expected_games))}")
    want = pd.Series(expected_games).reindex(full.index)
    bad = full[full != want]
    if not bad.empty:
        raise AssertionError(f"{year}: pbp game counts differ from the schedule: "
                             f"{ {t: (int(bad[t]), int(want[t])) for t in bad.index} }")
    adj["sos_epa"] = adj["team"].map(sos["mean"])
    return adj


def _schedule_games() -> dict[int, dict[str, int]]:
    """REG games per team per season, from the results mart the pipeline has
    just written (it runs first): the schedule count the pbp must reproduce."""
    res = io_utils.read_csv(config.MARTS / "team_season_results.csv")
    out: dict[int, dict[str, int]] = {}
    for season, g in res.groupby("season"):
        out[int(season)] = {str(t): int(n) for t, n in zip(g["team"], g["games"])}
    return out


def build_team_season_epa(*, download: bool = False, verbose: bool = True) -> pd.DataFrame:
    lo, hi = config.PERF_WINDOW
    expected = _schedule_games()
    con = sources.duck_connect()
    parts = []
    for year in range(lo, hi + 1):
        t0 = time.time()
        sources.scan_parquet_temp(
            con, config.PBP_URL.format(year=year), "pbp", NEEDED_PBP_COLS,
            download=download,
        )
        ts = _season_epa(con, year)
        missing = {t: n for (y, t), n in PBP_MISSING_GAMES.items() if y == year}
        ts = ts.merge(_opponent_adjust(_season_games(con), ts, year,
                                       expected_games=expected[year],
                                       missing_games=missing),
                      on="team", how="left", validate="1:1")
        exp = EXPECTED_TEAMS[year]
        if len(ts) != exp:
            raise AssertionError(f"{year}: {len(ts)} teams in pbp, expected {exp}")
        lg = ts["off_epa_total"].sum() / ts["off_plays"].sum()
        if not EPA_BAND[0] <= lg <= EPA_BAND[1]:
            raise AssertionError(f"{year}: league off EPA/play {lg:+.4f} out of band")
        parts.append(ts)
        if verbose:
            print(f"  pbp {year}: {len(ts)} teams  lg_off_epa/play={lg:+.4f}  "
                  f"({time.time() - t0:.1f}s)")

    mart = pd.concat(parts, ignore_index=True)[[
        "season", "team", "off_plays", "def_plays",
        "off_epa_per_play", "def_epa_per_play", "epa_margin_per_play",
        "off_epa_total", "def_epa_total",
        "off_epa_per_play_adj", "def_epa_per_play_adj", "epa_margin_per_play_adj",
        "sos_epa",
    ]].sort_values(["season", "team"]).reset_index(drop=True)
    _check_adjusted(mart, verbose=verbose)  # on unrounded values
    for c in ("off_epa_per_play", "def_epa_per_play", "epa_margin_per_play",
              "off_epa_per_play_adj", "def_epa_per_play_adj",
              "epa_margin_per_play_adj", "sos_epa"):
        mart[c] = mart[c].round(config.ROUND_RATIO)
    for c in ("off_epa_total", "def_epa_total"):
        mart[c] = mart[c].round(config.ROUND_EPA_TOTAL)

    io_utils.assert_rows(mart, "team_season_epa")
    assert_canonical(mart["team"], "team_season_epa")
    return mart


def _check_adjusted(mart: pd.DataFrame, *, verbose: bool,
                    max_shift: float = ADJ_MAX_SHIFT,
                    min_corr: float = ADJ_MIN_CORR) -> dict:
    """Mean preservation, max |shift| and corr(adj, raw margin). Returns the
    worst observed values so a caller can record them."""
    if mart[["off_epa_per_play_adj", "def_epa_per_play_adj", "sos_epa"]].isna().any().any():
        raise AssertionError("null opponent-adjusted value")
    worst = {"off": 0.0, "def": 0.0, "margin": 0.0}
    for season, g in mart.groupby("season"):
        for side in ("off", "def"):
            raw, adj = g[f"{side}_epa_per_play"], g[f"{side}_epa_per_play_adj"]
            if abs(adj.mean() - raw.mean()) > ADJ_MEAN_TOL:
                raise AssertionError(f"{season}: adjusted {side} mean drifted "
                                     f"{adj.mean() - raw.mean():+.2e}")
            worst[side] = max(worst[side], float((adj - raw).abs().max()))
        worst["margin"] = max(worst["margin"], float(
            (g["epa_margin_per_play_adj"] - g["epa_margin_per_play"]).abs().max()))
        r = np.corrcoef(g["epa_margin_per_play_adj"], g["epa_margin_per_play"])[0, 1]
        worst["min_corr"] = min(worst.get("min_corr", 1.0), float(r))
        if r <= min_corr:
            raise AssertionError(f"{season}: corr(adj, raw margin) {r:.3f} <= {min_corr}")
    if max(worst["off"], worst["def"]) > max_shift:
        raise AssertionError(f"opponent adjustment moved a side by "
                             f"{max(worst['off'], worst['def']):.4f} > {max_shift}")
    if verbose:
        print(f"  opponent adjustment: max |shift| off {worst['off']:.4f}, "
              f"def {worst['def']:.4f}, margin {worst['margin']:.4f} EPA/play; "
              f"season means preserved; corr(adj, raw margin) > {min_corr} every season")
        last = mart[mart["season"] == mart["season"].max()].copy()
        last["shift"] = last["epa_margin_per_play_adj"] - last["epa_margin_per_play"]
        top = last.reindex(last["shift"].abs().sort_values(ascending=False).index).head(5)
        print(f"  {int(last['season'].iloc[0])} biggest movers (margin raw -> adj, sos):")
        for _, r in top.iterrows():
            print(f"    {r.team:<4} {r.epa_margin_per_play:+.4f} -> "
                  f"{r.epa_margin_per_play_adj:+.4f}  ({r['shift']:+.4f})  "
                  f"sos {r.sos_epa:+.4f}")
    return worst


# --------------------------------------------------------------------------- #
# mart entry points
# --------------------------------------------------------------------------- #
def mart_team_season_results(ctx) -> pd.DataFrame:
    out = build_team_season_results(verbose=ctx.verbose)
    ctx.note_source("nfldata games.csv", rows=len(out), asset="games",
                    asset_rows=ASSET_ROWS.get("games"),
                    window=f"{config.PERF_WINDOW[0]}-{config.PERF_WINDOW[1]} REG")
    return out


def mart_team_season_epa(ctx) -> pd.DataFrame:
    out = build_team_season_epa(download=ctx.download, verbose=ctx.verbose)
    ctx.note_source("nflverse play_by_play_{year}.parquet", asset="pbp",
                    rows=int(out["off_plays"].sum()),
                    window=f"{config.PERF_WINDOW[0]}-{config.PERF_WINDOW[1]} REG pass+run")
    # 1:1 with results — the join every other mart depends on.
    res = io_utils.read_csv(config.MARTS / "team_season_results.csv")
    j = out.merge(res[["season", "team"]], on=["season", "team"], how="inner")
    if not len(j) == len(out) == len(res):
        raise AssertionError(
            f"EPA<->results is not 1:1 ({len(j)}/{len(out)}/{len(res)})")
    return out
