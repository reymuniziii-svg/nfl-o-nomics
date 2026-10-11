"""Live-layer smoke tests on SYNTHETIC fixtures — plan §5, DECISIONS 116.

`tests/fixtures/live/` holds an invented 2026 season (see make_fixtures.py):
weeks 1-5 final and loaded, four clubs on bye in week 5, week 6's Thursday game
already final and in pbp, one tie. These tests run the real `closed_week()`,
slice, pin and build code on it, offline, and mutate copies for the failure
cases: a half-loaded week, a postponed game, pbp lagging the schedule, a score
mismatch and a thin game.
"""

from __future__ import annotations

import sys

import pandas as pd
import pytest

from conftest import REPO

sys.path.insert(0, str(REPO))
from etl.live import config as lc  # noqa: E402
from etl.live import pipeline as lp  # noqa: E402
from etl.live import resolve as lr  # noqa: E402

FIX = REPO / "tests" / "fixtures" / "live"
PBP_META = {"size": 1, "updated_at": "2026-10-13T09:00:00Z", "digest": "",
            "sha256": "f" * 64}
GAMES_META = {"sha": "a" * 40, "date": "2026-10-13T08:00:00Z", "sha256": "e" * 64}
BYE_WEEK5 = {"ARI", "ATL", "BAL", "BUF"}


@pytest.fixture(scope="module")
def schedule() -> pd.DataFrame:
    return lr.read_schedule(FIX / "games.csv")


@pytest.fixture(scope="module")
def pbp_raw() -> pd.DataFrame:
    return pd.read_parquet(FIX / "pbp.parquet")


def _con(df: pd.DataFrame, tmp_path, name="pbp.parquet"):
    p = tmp_path / name
    df.to_parquet(p, index=False)
    return lr.pbp_connect(p), p


def _closed(schedule, pbp_df, tmp_path, **kw):
    con, _ = _con(pbp_df, tmp_path)
    return lr.closed_week(schedule, lr.pbp_games(con), **kw)


# ==========================================================================
# closed_week()
# ==========================================================================
def test_baseline_closes_week_5_and_ignores_the_week_6_thursday_game(schedule):
    con = lr.pbp_connect(FIX / "pbp.parquet")
    pg = lr.pbp_games(con)
    assert (pg["week"] == 6).sum() == 1, "fixture should carry one week-6 game"
    cw = lr.closed_week(schedule, pg)
    assert cw.asof_week == 5
    assert cw.asof_date == "2026-10-12"          # Monday night of week 5
    assert cw.open_week == 6 and len(cw.open_reasons) == 13
    assert all("no final score" in r for r in cw.open_reasons)


def test_half_loaded_week_stays_open(schedule, pbp_raw, tmp_path):
    wk5 = sorted(pbp_raw.loc[pbp_raw["week"] == 5, "game_id"].unique())
    cut = pbp_raw[~pbp_raw["game_id"].isin(wk5[: len(wk5) // 2])]
    cw = _closed(schedule, cut, tmp_path)
    assert cw.asof_week == 4 and cw.open_week == 5
    assert len(cw.open_reasons) == len(wk5) // 2
    assert all("not in pbp yet" in r for r in cw.open_reasons)


def test_bye_week_does_not_hold_a_week_open(schedule):
    wk5 = schedule[schedule["week"] == 5]
    playing = set(wk5["home_team"]) | set(wk5["away_team"])
    assert len(wk5) == 14 and BYE_WEEK5.isdisjoint(playing)
    assert lr.closed_week(schedule, lr.pbp_games(
        lr.pbp_connect(FIX / "pbp.parquet"))).asof_week == 5


def test_postponed_game_holds_its_week_until_played_or_cancelled(schedule, pbp_raw, tmp_path):
    gid = schedule.loc[schedule["week"] == 3, "game_id"].iloc[2]
    post = schedule.copy()
    post.loc[post["game_id"] == gid, ["home_score", "away_score"]] = pd.NA
    without = pbp_raw[pbp_raw["game_id"] != gid]
    cw = _closed(post, without, tmp_path)
    assert cw.asof_week == 2 and cw.open_week == 3
    assert cw.open_reasons == [f"{gid}: no final score in games.csv"]
    # Declared cancelled (the 2022 BUF-CIN case): the season closes again.
    cw2 = _closed(post, without, tmp_path, cancelled=[gid])
    assert cw2.asof_week == 5


def test_pbp_lagging_the_schedule_holds_the_week(schedule, pbp_raw, tmp_path):
    lag = pbp_raw[pbp_raw["week"] <= 4]
    cw = _closed(schedule, lag, tmp_path)
    assert cw.asof_week == 4
    assert all("not in pbp yet" in r for r in cw.open_reasons)


def test_pbp_score_mismatch_and_thin_game_hold_the_week(schedule, pbp_raw, tmp_path):
    gid = schedule.loc[schedule["week"] == 2, "game_id"].iloc[5]
    bad = pbp_raw.copy()
    bad.loc[bad["game_id"] == gid, "home_score"] += 3
    cw = _closed(schedule, bad, tmp_path)
    assert cw.asof_week == 1 and "pbp final" in cw.open_reasons[0]

    thin = pbp_raw[~((pbp_raw["game_id"] == gid) & (pbp_raw["play_id"] > 60))]
    cw = _closed(schedule, thin, tmp_path)
    assert cw.asof_week == 1 and "pass+run plays" in cw.open_reasons[0]


# ==========================================================================
# slices, pins and the no-op rule
# ==========================================================================
def _propose(schedule, path, **kw):
    return lr.propose(schedule, lr.pbp_connect(path), pbp_meta=PBP_META,
                      games_meta=GAMES_META, **kw)


def test_week_n_plus_1_never_reaches_a_slice(schedule):
    con = lr.pbp_connect(FIX / "pbp.parquet")
    ps = lr.pbp_slice(con, 5)
    assert ps["week"].max() == 5
    ss = lr.schedule_slice(schedule, 5)
    late = ss[ss["week"] > 5]
    assert late["home_score"].isna().all() and late["gameday"].isna().all()
    assert len(ss) == 272   # pairings stay: bye weeks are read off them


def test_unchanged_pins_are_a_noop_and_an_extra_thursday_game_is_too(schedule, pbp_raw,
                                                                     tmp_path):
    p1, _ = _propose(schedule, FIX / "pbp.parquet")
    p2, _ = _propose(schedule, FIX / "pbp.parquet")
    assert lr.decide(p1, p2) == "noop"
    assert lr.render_pins(p1) == lr.render_pins(p2)
    # A re-upload that only drops (or adds) the week-6 Thursday game: new file,
    # same closed-week slice -> still a no-op.
    _, path = _con(pbp_raw[pbp_raw["week"] <= 5], tmp_path)
    p3, _ = _propose(schedule, path)
    assert lr.decide(p1, p3) == "noop"


def test_restate_advance_regress_and_init(schedule, pbp_raw, tmp_path):
    base, _ = _propose(schedule, FIX / "pbp.parquet")
    assert lr.decide(None, base) == "init"
    restated = pbp_raw.copy()
    restated.loc[restated.index[100], "epa"] += 0.25      # a week-1 play re-graded
    _, path = _con(restated, tmp_path)
    p, _ = _propose(schedule, path)
    assert lr.decide(base, p) == "restate"
    lag, _ = _propose(schedule, _con(pbp_raw[pbp_raw["week"] <= 4], tmp_path, "lag.parquet")[1])
    assert lr.decide(base, lag) == "regress"
    assert lr.decide(lag, base) == "advance"
    assert lr.commit_message(base, "advance").startswith(
        "live: 2026 through week 5 (2026-10-12) [pbp sha256:ffffffffffff, games @aaaaaaa]")


def test_pin_file_round_trips(schedule):
    p, _ = _propose(schedule, FIX / "pbp.parquet", cancelled=["2026_03_X_Y"])
    text = lr.render_pins(p)
    assert lr.parse_pins(text) == p
    assert "datetime" not in text and "now" not in text


def test_staleness_flags_an_overdue_week_only(schedule):
    import datetime as dt
    # Week 6 ends Monday 2026-10-19. Tue/Wed are fine; from Thu 10-22 it is overdue.
    assert not lr.staleness(schedule, 5, dt.date(2026, 10, 20))["stale"]
    assert not lr.staleness(schedule, 5, dt.date(2026, 10, 21))["stale"]
    assert lr.staleness(schedule, 5, dt.date(2026, 10, 22))["stale"]
    assert not lr.staleness(schedule, 18, dt.date(2027, 3, 1))["stale"]


# ==========================================================================
# the build
# ==========================================================================
def _inputs(schedule, path, **kw):
    pins, _ = _propose(schedule, path, **kw)
    return lp.LiveInputs(pins, schedule, path)


def test_build_on_fixtures_closes_week_5_with_byes(schedule):
    frames, stats = lp.build_frames(_inputs(schedule, FIX / "pbp.parquet"), verbose=False)
    tp, st = frames["live_team_perf"], frames["live_status"].iloc[0]
    assert len(tp) == 32 and set(tp["asof_week"]) == {5}
    assert set(tp.loc[tp["games_played"] == 4, "team"]) == BYE_WEEK5
    assert tp.loc[tp["team"].isin(BYE_WEEK5), "bye_taken"].all()
    assert int(st["league_games_played"]) == 16 * 4 + 14
    assert int(tp["games_played"].sum()) == 2 * (16 * 4 + 14)
    closed = schedule[schedule["week"] <= 5]
    n_ties = int((closed["home_score"] == closed["away_score"]).sum())
    assert n_ties >= 1 and tp["ties"].sum() == 2 * n_ties   # incl. the week-2 20-20 game
    assert st["perf_state"] == "value" and st["capplus_state"] == "blank"
    assert len(frames["live_capplus"]) == 0
    assert stats["schedule_graph_connected"]


def test_week_6_thursday_game_changes_nothing(schedule, pbp_raw, tmp_path):
    """Inputs with and without the N+1 Thursday game build identical marts."""
    gid = schedule.loc[schedule["week"] == 6, "game_id"].iloc[0]
    sched_wo = schedule.copy()
    sched_wo.loc[sched_wo["game_id"] == gid, ["home_score", "away_score"]] = pd.NA
    _, path = _con(pbp_raw[pbp_raw["game_id"] != gid], tmp_path)
    a, _ = lp.build_frames(_inputs(schedule, FIX / "pbp.parquet"), verbose=False)
    b, _ = lp.build_frames(_inputs(sched_wo, path), verbose=False)
    pd.testing.assert_frame_equal(a["live_team_perf"], b["live_team_perf"])


def test_two_builds_give_identical_bytes(schedule, tmp_path):
    inp = _inputs(schedule, FIX / "pbp.parquet")
    d1 = lp.write_frames(lp.build_frames(inp, verbose=False)[0], tmp_path / "a")
    d2 = lp.write_frames(lp.build_frames(inp, verbose=False)[0], tmp_path / "b")
    assert d1 == d2
    for name in d1:
        assert (tmp_path / "a" / f"{name}.csv").read_bytes() == \
               (tmp_path / "b" / f"{name}.csv").read_bytes()


def test_cancelled_game_leaves_results_epa_and_the_schedule(schedule, pbp_raw, tmp_path):
    gid = schedule.loc[schedule["week"] == 3, "game_id"].iloc[2]
    home, away = schedule.loc[schedule["game_id"] == gid, ["home_team", "away_team"]].iloc[0]
    frames, _ = lp.build_frames(_inputs(schedule, FIX / "pbp.parquet", cancelled=[gid]),
                                verbose=False)
    tp = frames["live_team_perf"].set_index("team")
    for t in (home, away):
        assert tp.loc[t, "games_scheduled"] == 16
        assert tp.loc[t, "games_played"] == (3 if t in BYE_WEEK5 else 4)


def test_before_week_4_the_season_is_blank(schedule, pbp_raw, tmp_path):
    _, path = _con(pbp_raw[pbp_raw["week"] <= 3], tmp_path)
    frames, _ = lp.build_frames(_inputs(schedule, path), verbose=False)
    st = frames["live_status"].iloc[0]
    assert int(st["asof_week"]) == 3 and len(frames["live_team_perf"]) == 0
    assert st["perf_state"] == "blank"
    assert st["perf_blank_reason"] == lc.PERF_BLANK_REASON_EARLY
    assert list(frames["live_team_perf"].columns)[:3] == ["season", "team", "asof_week"]
