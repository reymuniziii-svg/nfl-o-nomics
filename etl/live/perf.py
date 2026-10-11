"""`live_team_perf` and `live_status` — the performance-only live marts.

The maths is the frozen build's, reused rather than re-derived:

* results: `etl.performance.season_results` on the schedule's closed weeks;
* raw and opponent-adjusted EPA: `_season_epa`, `_season_games` and
  `_opponent_adjust` with `max_week = asof_week` and each team's scheduled
  game count through that week, with the live thresholds
  (`config.LIVE_ADJ_MAX_SHIFT`, `LIVE_ADJ_MIN_CORR`) and the same zero ridge,
  so live week-18 P equals the final P the season will be promoted with;
* P: `audit/capplus_backtest.build_performance` (equal weights, within-season
  z), computed within the 32-team 2026 frame.

Every input is filtered to `week <= asof_week`; a Thursday game of week N+1 is
never read. No per-win ratio, money figure or verdict is built here.
"""

from __future__ import annotations

import sys
from collections import defaultdict

import numpy as np
import pandas as pd

from .. import config as base
from .. import performance
from ..team_codes import EXPECTED_TEAMS
from . import config as lc

if str(base.AUDIT) not in sys.path:
    sys.path.insert(0, str(base.AUDIT))
import capplus_backtest as bt  # noqa: E402

PERF_COLS = [
    "season", "team", "asof_week", "games_played", "games_scheduled",
    "bye_week", "bye_taken",
    "wins", "losses", "ties", "win_pct", "points_for", "points_against",
    "point_diff", "point_diff_per_game",
    "off_plays", "def_plays", "off_epa_per_play", "def_epa_per_play",
    "epa_margin_per_play", "off_epa_per_play_adj", "def_epa_per_play_adj",
    "epa_margin_per_play_adj", "sos_epa",
    "P_live", "perf_index_live", "perf_rank_live", "badge", "badge_reason",
]

STATUS_COLS = [
    "season", "asof_week", "asof_date", "weeks_in_season",
    "games_scheduled_per_team", "league_games_played",
    "pbp_sha256", "pbp_asset_updated_at", "games_commit_sha",
    "money_asof_date", "contracts_sha256",
    "dm_asof_date", "dm_asof_stage", "dm_basis",
    "perf_state", "perf_blank_reason", "capplus_state", "capplus_blank_reason",
]

#: plan §2.2; written with zero rows while capplus_state = 'blank'.
CAPPLUS_COLS = [
    "season", "team", "capplus_live", "cost_live", "cap_consumed_live",
    "cost_floor_live", "R_live", "was_floored", "capplus_rank_live",
    "asof_week", "games_played", "badge", "badge_reason",
]

_RATE_COLS = ("win_pct", "point_diff_per_game", "off_epa_per_play", "def_epa_per_play",
              "epa_margin_per_play", "off_epa_per_play_adj", "def_epa_per_play_adj",
              "epa_margin_per_play_adj", "sos_epa")


# --------------------------------------------------------------------------- #
# schedule facts
# --------------------------------------------------------------------------- #
def _played(schedule: pd.DataFrame, asof_week: int, cancelled) -> pd.DataFrame:
    s = schedule[(schedule["week"] <= asof_week) & ~schedule["game_id"].isin(cancelled)].copy()
    if s["home_score"].isna().any() or s["away_score"].isna().any():
        raise AssertionError("a game in a closed week has no score (closed_week bug)")
    s["home_score"] = s["home_score"].astype(int)
    s["away_score"] = s["away_score"].astype(int)
    return s


def _team_games(s: pd.DataFrame) -> dict[str, int]:
    out: dict[str, int] = defaultdict(int)
    for t in list(s["home_team"]) + list(s["away_team"]):
        out[str(t)] += 1
    return dict(out)


def bye_weeks(schedule: pd.DataFrame) -> dict[str, int]:
    """Each club's one week without a game, from the full season's pairings."""
    weeks = range(1, int(schedule["week"].max()) + 1)
    by_team: dict[str, set] = defaultdict(set)
    for r in schedule.itertuples(index=False):
        for t in (r.home_team, r.away_team):
            if r.week in by_team[str(t)]:
                raise AssertionError(f"{t} plays twice in week {r.week}")
            by_team[str(t)].add(int(r.week))
    out = {}
    for t, ws in by_team.items():
        off = [w for w in weeks if w not in ws]
        if len(off) != 1:
            raise AssertionError(f"{t}: {len(off)} weeks without a game, expected 1: {off}")
        out[t] = off[0]
    return out


def assert_connected(s: pd.DataFrame) -> None:
    """The opponent adjustment is identified only on a connected schedule graph."""
    adj: dict[str, set] = defaultdict(set)
    for h, a in zip(s["home_team"], s["away_team"]):
        adj[str(h)].add(str(a))
        adj[str(a)].add(str(h))
    teams = sorted(adj)
    seen, stack = {teams[0]}, [teams[0]]
    while stack:
        for n in adj[stack.pop()]:
            if n not in seen:
                seen.add(n)
                stack.append(n)
    if len(seen) != len(teams):
        raise AssertionError(f"schedule graph through this week is not connected: "
                             f"{sorted(set(teams) - seen)} unreachable")


# --------------------------------------------------------------------------- #
# live_team_perf
# --------------------------------------------------------------------------- #
def empty_perf() -> pd.DataFrame:
    return pd.DataFrame({c: pd.Series(dtype="object") for c in PERF_COLS})


def build_live_team_perf(schedule: pd.DataFrame, con, *, asof_week: int, asof_date: str,
                         cancelled=(), verbose: bool = True) -> tuple[pd.DataFrame, dict]:
    """32 rows once `asof_week >= LIVE_PERF_MIN_WEEK`; 0 rows before it."""
    season = lc.LIVE_SEASON
    cancelled = sorted(set(cancelled))
    if asof_week < lc.LIVE_PERF_MIN_WEEK:
        return empty_perf(), {"perf_state": "blank"}

    # ---- results (schedule, closed weeks only) ----------------------------
    played = _played(schedule, asof_week, cancelled)
    res = performance.season_results(played, max_week=asof_week)
    res = res.rename(columns={"games": "games_played"})
    n_teams = EXPECTED_TEAMS.get(season, 32)
    if len(res) != n_teams:
        raise AssertionError(f"{len(res)} teams with a closed game, expected {n_teams}")
    if not (res["wins"] + res["losses"] + res["ties"] == res["games_played"]).all():
        raise AssertionError("record arithmetic does not close")
    if res["points_for"].sum() != res["points_against"].sum():
        raise AssertionError("league points do not balance")
    if res["wins"].sum() != res["losses"].sum():
        raise AssertionError("league wins != league losses")

    full = schedule[~schedule["game_id"].isin(cancelled)]
    sched_n = _team_games(full)
    byes = bye_weeks(schedule)
    res["team"] = res["team"].astype(object)
    res["games_scheduled"] = res["team"].map(sched_n).astype(int)
    res["bye_week"] = res["team"].map(byes).astype(int)
    res["bye_taken"] = res["bye_week"] <= asof_week
    res["asof_week"] = asof_week
    cancelled_by = _team_games(schedule[schedule["game_id"].isin(cancelled)
                                        & (schedule["week"] <= asof_week)])
    want_gp = (asof_week - res["bye_taken"].astype(int)
               - res["team"].map(lambda t: cancelled_by.get(t, 0)))
    if not (res["games_played"] == want_gp).all():
        bad = res.loc[res["games_played"] != want_gp, ["team", "games_played"]]
        raise AssertionError(f"games_played != asof_week - bye - cancelled: {bad.to_dict('records')}")
    res["point_diff_per_game"] = res["point_diff"] / res["games_played"]

    # ---- EPA, raw and opponent-adjusted (pbp, closed weeks only) ----------
    assert_connected(played)
    where = "" if not cancelled else (
        " AND game_id NOT IN (" + ", ".join(f"'{g}'" for g in cancelled) + ")")
    con.execute(f"CREATE OR REPLACE TEMP TABLE pbp AS SELECT * FROM pbp_raw "
                f"WHERE week <= {int(asof_week)}{where}")
    ts = performance._season_epa(con, season, max_week=asof_week)
    expected = dict(zip(res["team"], res["games_played"].astype(int)))
    ts = ts.merge(performance._opponent_adjust(
        performance._season_games(con, max_week=asof_week), ts, season,
        expected_games=expected, missing_games=None),
        on="team", how="left", validate="1:1")
    ts["team"] = ts["team"].astype(object)
    if len(ts) != n_teams:
        raise AssertionError(f"{len(ts)} teams in pbp, expected {n_teams}")
    lg = ts["off_epa_total"].sum() / ts["off_plays"].sum()
    if not performance.EPA_BAND[0] <= lg <= performance.EPA_BAND[1]:
        raise AssertionError(f"league off EPA/play {lg:+.4f} out of band")
    worst = performance._check_adjusted(ts, verbose=False,
                                        max_shift=lc.LIVE_ADJ_MAX_SHIFT,
                                        min_corr=lc.LIVE_ADJ_MIN_CORR)

    d = res.merge(ts.drop(columns=["season"]), on="team", how="inner", validate="1:1")
    if len(d) != n_teams:
        raise AssertionError("results <-> EPA is not 1:1")

    # ---- P_live: the frozen composite, within the 2026 frame --------------
    p_in = d[["season", "team", "win_pct", "point_diff_per_game"]].copy()
    p_in["epa_margin_per_play"] = d[base.PERF_EPA_INPUT]
    p = bt.build_performance(p_in, bt.WEIGHTS[bt.DEFAULT_W])
    d["P_live"] = p["P"].to_numpy()
    if abs(d["P_live"].mean()) > 1e-9 or abs(d["P_live"].std(ddof=1) - 1) > 1e-9:
        raise AssertionError("P_live is not mean 0 / SD 1")
    d["perf_index_live"] = base.INDEX_MEAN + base.INDEX_SD * d["P_live"]
    d["perf_rank_live"] = d["perf_index_live"].rank(ascending=False, method="min").astype(int)

    # ---- badge -------------------------------------------------------------
    d["badge"] = lc.BADGE_LIVE
    d["badge_reason"] = [
        lc.BADGE_REASON_TEMPLATE.format(
            week=asof_week, date=asof_date, gp=int(gp), total=int(gs),
            bye=f" (bye week {int(bw)})" if taken else "")
        for gp, gs, bw, taken in zip(d["games_played"], d["games_scheduled"],
                                     d["bye_week"], d["bye_taken"])]

    for c in _RATE_COLS:
        d[c] = d[c].astype(float).round(base.ROUND_RATIO)
    d["P_live"] = d["P_live"].round(base.ROUND_INDEX)
    d["perf_index_live"] = d["perf_index_live"].round(base.ROUND_INDEX)
    for c in ("asof_week", "games_played", "games_scheduled", "bye_week", "wins", "losses",
              "ties", "points_for", "points_against", "point_diff", "off_plays", "def_plays",
              "perf_rank_live"):
        d[c] = d[c].astype(int)
    d["bye_taken"] = d["bye_taken"].astype(bool)
    out = d[PERF_COLS].sort_values("team", kind="stable").reset_index(drop=True)

    stats = {
        "perf_state": "value",
        "league_off_epa_per_play": round(float(lg), 6),
        "adj_max_shift_off": round(worst["off"], 6),
        "adj_max_shift_def": round(worst["def"], 6),
        "adj_max_shift_margin": round(worst["margin"], 6),
        "adj_min_corr": round(worst["min_corr"], 6),
        "schedule_graph_connected": True,
        "byes_taken": int(out["bye_taken"].sum()),
    }
    if verbose:
        print(f"  live_team_perf: {len(out)} clubs through week {asof_week} ({asof_date}); "
              f"{int(played.shape[0])} games; byes taken {stats['byes_taken']}; "
              f"lg off EPA/play {lg:+.4f}")
        print(f"  opponent adjustment: max |shift| off {worst['off']:.4f}, def "
              f"{worst['def']:.4f} (<= {lc.LIVE_ADJ_MAX_SHIFT}); min corr "
              f"{worst['min_corr']:.3f} (> {lc.LIVE_ADJ_MIN_CORR}); graph connected")
    return out, stats


# --------------------------------------------------------------------------- #
# live_status
# --------------------------------------------------------------------------- #
def build_live_status(pins: dict, schedule: pd.DataFrame, perf: pd.DataFrame) -> pd.DataFrame:
    lv, pb, gm = pins["live"], pins["pbp"], pins["games"]
    asof = int(lv["asof_week"])
    cancelled = list(lv.get("cancelled_games", []))
    played = schedule[(schedule["week"] <= asof) & ~schedule["game_id"].isin(cancelled)]
    perf_on = asof >= lc.LIVE_PERF_MIN_WEEK
    if perf_on != (len(perf) > 0):
        raise AssertionError("perf_state disagrees with live_team_perf's row count")
    row = {
        "season": lc.LIVE_SEASON,
        "asof_week": asof,
        "asof_date": lv.get("asof_date") or None,
        "weeks_in_season": int(schedule["week"].max()),
        "games_scheduled_per_team": lc.GAMES_PER_TEAM,
        "league_games_played": int(len(played)),
        "pbp_sha256": pb["sha256"],
        "pbp_asset_updated_at": pb["updated_at"],
        "games_commit_sha": gm["commit_sha"],
        # The money side is one frozen snapshot (`freeze-money`), not built in
        # this pass: every money field is null for now and says so through
        # capplus_state, never through a zero.
        "money_asof_date": None,
        "contracts_sha256": None,
        "dm_asof_date": None,
        "dm_asof_stage": None,
        "dm_basis": lc.DM_BASIS_NONE,
        "perf_state": "value" if perf_on else "blank",
        "perf_blank_reason": None if perf_on else lc.PERF_BLANK_REASON_EARLY,
        "capplus_state": "blank",
        "capplus_blank_reason": lc.CAPPLUS_BLANK_REASON,
    }
    if row["weeks_in_season"] != lc.WEEKS_IN_SEASON:
        raise AssertionError(f"schedule has {row['weeks_in_season']} weeks")
    return pd.DataFrame([row], columns=STATUS_COLS)


# --------------------------------------------------------------------------- #
# live_capplus — gated off (DECISIONS 116)
# --------------------------------------------------------------------------- #
def build_live_capplus(status: pd.DataFrame) -> pd.DataFrame:
    """Zero rows while `capplus_state = 'blank'`. The live Cap+ build itself
    (`capplus_live.py`, plan §6 item 12) is not written yet; if the gate ever
    opens without it, the build stops rather than publishing a partial frame."""
    st = status.iloc[0]
    if st["capplus_state"] != "blank":
        raise NotImplementedError("live Cap+ is gated on; build etl/live/capplus_live.py first")
    if not st["capplus_blank_reason"]:
        raise AssertionError("a blank live Cap+ must carry its reason")
    return pd.DataFrame({c: pd.Series(dtype="object") for c in CAPPLUS_COLS})
