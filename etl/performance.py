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
"""

from __future__ import annotations

import time

import pandas as pd

from . import config, io_utils, sources
from .team_codes import EXPECTED_TEAMS, assert_canonical, normalize_series

# nflverse encodes rushes as play_type='run'; there is no 'rush' literal.
_SCRIM = "play_type IN ('pass','run')"
# Empty-string posteam/defteam appear in some older seasons; treat as missing.
_HASPOS = "posteam IS NOT NULL AND posteam <> ''"
_HASDEF = "defteam IS NOT NULL AND defteam <> ''"

NEEDED_PBP_COLS = "season, season_type, posteam, defteam, play_type, epa"

# League-mean offensive EPA/play sanity band (DATA_AUDIT.md S6).
EPA_BAND = (-0.15, 0.15)

# Golden structural tests carried into the build (DATA_AUDIT.md §3, tests 1-4).
GOLDEN_RECORDS = [
    (2007, "NE", 16, 0, 0),
    (2008, "DET", 0, 16, 0),
    (2017, "CLE", 0, 16, 0),
]


# --------------------------------------------------------------------------- #
# team_season_results
# --------------------------------------------------------------------------- #
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
    out = m[[
        "season", "team", "games", "wins", "losses", "ties", "win_pct",
        "points_for", "points_against", "point_diff",
    ]].sort_values(["season", "team"]).reset_index(drop=True)

    _check_results(out, verbose=verbose)
    return out


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
def _season_epa(con, year: int) -> pd.DataFrame:
    off = con.execute(f"""
        SELECT posteam AS team, count(*) AS off_plays, sum(epa) AS off_epa_total
        FROM pbp
        WHERE season_type='REG' AND {_SCRIM} AND epa IS NOT NULL AND {_HASPOS}
        GROUP BY 1
    """).df()
    dfn = con.execute(f"""
        SELECT defteam AS team, count(*) AS def_plays, sum(epa) AS def_epa_total
        FROM pbp
        WHERE season_type='REG' AND {_SCRIM} AND epa IS NOT NULL AND {_HASDEF}
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


def build_team_season_epa(*, download: bool = False, verbose: bool = True) -> pd.DataFrame:
    lo, hi = config.PERF_WINDOW
    con = sources.duck_connect()
    parts = []
    for year in range(lo, hi + 1):
        t0 = time.time()
        sources.scan_parquet_temp(
            con, config.PBP_URL.format(year=year), "pbp", NEEDED_PBP_COLS,
            download=download,
        )
        ts = _season_epa(con, year)
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
    ]].sort_values(["season", "team"]).reset_index(drop=True)
    for c in ("off_epa_per_play", "def_epa_per_play", "epa_margin_per_play"):
        mart[c] = mart[c].round(config.ROUND_RATIO)
    for c in ("off_epa_total", "def_epa_total"):
        mart[c] = mart[c].round(config.ROUND_EPA_TOTAL)

    io_utils.assert_rows(mart, "team_season_epa")
    assert_canonical(mart["team"], "team_season_epa")
    return mart


# --------------------------------------------------------------------------- #
# mart entry points
# --------------------------------------------------------------------------- #
def mart_team_season_results(ctx) -> pd.DataFrame:
    out = build_team_season_results(verbose=ctx.verbose)
    ctx.note_source("nfldata games.csv", rows=len(out),
                    window=f"{config.PERF_WINDOW[0]}-{config.PERF_WINDOW[1]} REG")
    return out


def mart_team_season_epa(ctx) -> pd.DataFrame:
    out = build_team_season_epa(download=ctx.download, verbose=ctx.verbose)
    ctx.note_source("nflverse play_by_play_{year}.parquet",
                    rows=int(out["off_plays"].sum()),
                    window=f"{config.PERF_WINDOW[0]}-{config.PERF_WINDOW[1]} REG pass+run")
    # 1:1 with results — the join every other mart depends on.
    res = io_utils.read_csv(config.MARTS / "team_season_results.csv")
    j = out.merge(res[["season", "team"]], on=["season", "team"], how="inner")
    if not len(j) == len(out) == len(res):
        raise AssertionError(
            f"EPA<->results is not 1:1 ({len(j)}/{len(out)}/{len(res)})")
    return out
