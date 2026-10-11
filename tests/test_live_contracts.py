"""Live-mart contracts — SPEC §7.14, DECISIONS 116, plan §5.

The 2026 in-season marts live in `data/marts/live/` and are declared here with
the same `Mart`/`Col` machinery as `test_contracts.py`, in their own registry.
Unlike the frozen registry, nothing here skips on absence: while
`etl.live.config.LIVE_SEASON` is set, a missing live directory FAILS.

Row counts are state-dependent and asserted against `live_status`:
`live_team_perf` has 32 rows when perf_state = 'value' and 0 when 'blank';
`live_capplus` has 0 rows exactly when capplus_state = 'blank'.
Reads committed files only.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from conftest import REPO
from test_contracts import (ALWAYS_NULL, NULLABLE, REQUIRED, TEAM_ABBRS, Col, Mart,
                            check_kind, check_null_policy)

sys.path.insert(0, str(REPO))
from etl.live import config as lc  # noqa: E402
from etl.live import resolve as lr  # noqa: E402

LIVE = REPO / "data" / "marts" / "live"
SEASON = Col("int", REQUIRED)
TEAM = Col("str", REQUIRED, frozenset(TEAM_ABBRS))
BADGE = Col("str", REQUIRED, frozenset({"in_season_live"}))
STATE = frozenset({"value", "blank"})

LIVE_REGISTRY: tuple[Mart, ...] = (
    Mart(
        key="live_status", spec_ref="SPEC §7.14", candidates=("live_status",),
        columns={
            "season": SEASON, "asof_week": Col("int"),
            # Null only while no week has closed (asof_week = 0).
            "asof_date": Col("date", NULLABLE),
            "weeks_in_season": Col("int"), "games_scheduled_per_team": Col("int"),
            "league_games_played": Col("int"),
            "pbp_sha256": Col("str"), "pbp_asset_updated_at": Col("str"),
            "games_commit_sha": Col("str"),
            # The money side is not built in this pass (freeze-money, plan §1.4).
            "money_asof_date": Col("date", NULLABLE),
            "contracts_sha256": Col("str", NULLABLE),
            "dm_asof_date": Col("date", NULLABLE),
            "dm_asof_stage": Col("str", NULLABLE, frozenset(
                {"preseason", "midseason", "late_season", "final"})),
            "dm_basis": Col("str", REQUIRED, frozenset({"full32", "estimated", "none"})),
            "perf_state": Col("str", REQUIRED, STATE),
            "perf_blank_reason": Col("str", NULLABLE),
            "capplus_state": Col("str", REQUIRED, STATE),
            "capplus_blank_reason": Col("str", NULLABLE),
        },
        grain=("season",), rows=1, seasons=(2026, 2026),
    ),
    Mart(
        key="live_team_perf", spec_ref="SPEC §7.14", candidates=("live_team_perf",),
        columns={
            "season": SEASON, "team": TEAM, "asof_week": Col("int"),
            "games_played": Col("int"), "games_scheduled": Col("int"),
            "bye_week": Col("int"), "bye_taken": Col("bool"),
            "wins": Col("int"), "losses": Col("int"), "ties": Col("int"),
            "win_pct": Col("float"), "points_for": Col("int"),
            "points_against": Col("int"), "point_diff": Col("int"),
            "point_diff_per_game": Col("float"),
            "off_plays": Col("int"), "def_plays": Col("int"),
            "off_epa_per_play": Col("float"), "def_epa_per_play": Col("float"),
            "epa_margin_per_play": Col("float"),
            "off_epa_per_play_adj": Col("float"), "def_epa_per_play_adj": Col("float"),
            "epa_margin_per_play_adj": Col("float"), "sos_epa": Col("float"),
            "P_live": Col("float"), "perf_index_live": Col("float"),
            "perf_rank_live": Col("int"), "badge": BADGE, "badge_reason": Col("str"),
        },
        grain=("season", "team"), seasons=(2026, 2026),
    ),
    Mart(
        key="live_capplus", spec_ref="SPEC §7.14", candidates=("live_capplus",),
        columns={
            "season": SEASON, "team": TEAM, "capplus_live": Col("float"),
            "cost_live": Col("float"), "cap_consumed_live": Col("float"),
            "cost_floor_live": Col("float"), "R_live": Col("float"),
            "was_floored": Col("bool"), "capplus_rank_live": Col("int"),
            "asof_week": Col("int"), "games_played": Col("int"),
            "badge": BADGE, "badge_reason": Col("str"),
        },
        grain=("season", "team"), seasons=(2026, 2026),
    ),
)
IDS = [m.key for m in LIVE_REGISTRY]


def _load(key: str) -> pd.DataFrame:
    p = LIVE / f"{key}.csv"
    if not p.exists():
        pytest.fail(f"LIVE_SEASON = {lc.LIVE_SEASON} but {p.relative_to(REPO)} is missing — "
                    "run `python -m etl.live build`. A live season never skips.")
    return pd.read_csv(p)


@pytest.fixture(scope="module")
def status() -> pd.Series:
    return _load("live_status").iloc[0]


@pytest.fixture(scope="module")
def perf() -> pd.DataFrame:
    return _load("live_team_perf")


@pytest.fixture(scope="module")
def pins() -> dict:
    p = lr.read_pins()
    assert p is not None, "etl/live/live_pins.toml is missing"
    return p


# ==========================================================================
# Schema
# ==========================================================================
@pytest.mark.parametrize("mart", LIVE_REGISTRY, ids=IDS)
def test_live_exact_column_set(mart):
    df = _load(mart.key)
    assert list(df.columns) == list(mart.columns), (
        f"{mart.key}: columns {list(df.columns)} != contract {list(mart.columns)}")


@pytest.mark.parametrize("mart", LIVE_REGISTRY, ids=IDS)
def test_live_dtypes_nulls_and_enums(mart):
    df = _load(mart.key)
    for name, col in mart.columns.items():
        check_null_policy(df[name], col.null, f"{mart.key}::{name}")
        if col.null != ALWAYS_NULL:
            check_kind(df[name], col.kind, f"{mart.key}::{name}")
        if col.enum is not None:
            bad = set(df[name].dropna().unique()) - set(col.enum)
            assert not bad, f"{mart.key}::{name}: {sorted(bad)} outside {sorted(col.enum)}"


@pytest.mark.parametrize("mart", LIVE_REGISTRY, ids=IDS)
def test_live_grain_and_season(mart):
    df = _load(mart.key)
    assert not df.duplicated(list(mart.grain)).any(), f"{mart.key}: grain not unique"
    if len(df):
        assert set(df["season"]) == {lc.LIVE_SEASON} == {mart.seasons[0]}


def test_live_row_counts_follow_the_states(status, perf):
    assert len(_load("live_status")) == 1
    want_perf = 32 if status["perf_state"] == "value" else 0
    assert len(perf) == want_perf, f"perf_state {status['perf_state']} but {len(perf)} rows"
    cap = _load("live_capplus")
    if status["capplus_state"] == "blank":
        assert len(cap) == 0
        assert isinstance(status["capplus_blank_reason"], str) and status["capplus_blank_reason"]
    else:
        assert len(cap) == 32


def test_perf_state_follows_the_week_gate(status):
    on = int(status["asof_week"]) >= lc.LIVE_PERF_MIN_WEEK
    assert (status["perf_state"] == "value") == on
    if not on:
        assert status["perf_blank_reason"] == lc.PERF_BLANK_REASON_EARLY


# ==========================================================================
# One as-of week everywhere
# ==========================================================================
def test_one_asof_week_across_marts_status_pins_and_manifest(status, perf, pins):
    w = int(status["asof_week"])
    assert w == int(pins["live"]["asof_week"])
    assert (status["asof_date"] if isinstance(status["asof_date"], str) else "") == \
        pins["live"]["asof_date"]
    if len(perf):
        assert set(perf["asof_week"]) == {w}
    cap = _load("live_capplus")
    if len(cap):
        assert set(cap["asof_week"]) == {w}
    man = json.loads((LIVE / "manifest.json").read_text())
    assert man["asof_week"] == w and man["season"] == lc.LIVE_SEASON


def test_status_carries_the_pins(status, pins):
    assert status["pbp_sha256"] == pins["pbp"]["sha256"]
    assert status["pbp_asset_updated_at"] == pins["pbp"]["updated_at"]
    assert status["games_commit_sha"] == pins["games"]["commit_sha"]
    assert re.fullmatch(r"[0-9a-f]{64}", status["pbp_sha256"])
    assert re.fullmatch(r"[0-9a-f]{40}", status["games_commit_sha"])


def test_manifest_md5s_match_the_files():
    man = json.loads((LIVE / "manifest.json").read_text())
    import hashlib
    for name, m in man["marts"].items():
        got = hashlib.md5((REPO / m["file"]).read_bytes()).hexdigest()
        assert got == m["md5"], f"{name}: file drifted from data/marts/live/manifest.json"
        assert m["file"].startswith("data/marts/live/")
    assert set(man["marts"]) == {"live_status", "live_team_perf", "live_capplus"}
    assert "live_team_money" in man["not_built"]
    assert not (LIVE / "live_team_money.csv").exists()


# ==========================================================================
# Performance invariants
# ==========================================================================
def test_games_played_is_asof_minus_bye(status, perf):
    if not len(perf):
        pytest.skip("perf_state = blank")
    w = int(status["asof_week"])
    cancelled = lc.LIVE_CANCELLED_GAMES
    assert set(perf["games_played"]) <= {w - 1, w} or cancelled
    assert (perf["bye_taken"] == (perf["bye_week"] <= w)).all()
    if not cancelled:
        assert (perf["games_played"] == w - perf["bye_taken"].astype(int)).all()
        assert (perf["games_scheduled"] == lc.GAMES_PER_TEAM).all()
    assert perf["bye_week"].between(1, lc.WEEKS_IN_SEASON).all()
    assert int(status["league_games_played"]) * 2 == int(perf["games_played"].sum())


def test_record_arithmetic_and_league_balance(perf):
    if not len(perf):
        pytest.skip("perf_state = blank")
    assert (perf["wins"] + perf["losses"] + perf["ties"] == perf["games_played"]).all()
    assert perf["points_for"].sum() == perf["points_against"].sum()
    assert perf["wins"].sum() == perf["losses"].sum()
    assert (perf["point_diff"] == perf["points_for"] - perf["points_against"]).all()
    wp = (perf["wins"] + 0.5 * perf["ties"]) / perf["games_played"]
    assert np.allclose(wp, perf["win_pct"], atol=1e-6)


def test_p_live_is_standardised_and_index_is_on_the_scale(perf):
    if not len(perf):
        pytest.skip("perf_state = blank")
    assert abs(perf["P_live"].mean()) < 1e-5
    assert abs(perf["P_live"].std(ddof=1) - 1) < 1e-5
    assert np.allclose(perf["perf_index_live"], 100 + 15 * perf["P_live"], atol=1e-5)
    assert abs(perf["perf_index_live"].mean() - 100) < 1e-4
    r = perf["perf_index_live"].rank(ascending=False, method="min").astype(int)
    assert (r == perf["perf_rank_live"]).all()
    assert perf["perf_rank_live"].min() == 1


def test_adjusted_epa_preserves_means_and_stays_within_the_live_band(perf):
    if not len(perf):
        pytest.skip("perf_state = blank")
    for side in ("off", "def"):
        assert abs(perf[f"{side}_epa_per_play_adj"].mean()
                   - perf[f"{side}_epa_per_play"].mean()) < 2e-6
        assert (perf[f"{side}_epa_per_play_adj"]
                - perf[f"{side}_epa_per_play"]).abs().max() <= lc.LIVE_ADJ_MAX_SHIFT
    r = np.corrcoef(perf["epa_margin_per_play_adj"], perf["epa_margin_per_play"])[0, 1]
    assert r > lc.LIVE_ADJ_MIN_CORR


def test_badge_reason_states_the_asof_and_never_a_verdict(status, perf):
    if not len(perf):
        pytest.skip("perf_state = blank")
    w, d = int(status["asof_week"]), status["asof_date"]
    for reason, gp in zip(perf["badge_reason"], perf["games_played"]):
        assert reason.startswith(f"Live: through week {w} ({d}), {gp} of ")
    verdicts = ("STEAL", "WORTH IT", "FAIR PRICE", "OVERPAID", "MONEY PIT")
    assert not any(v in r for r in perf["badge_reason"] for v in verdicts)


# ==========================================================================
# Cap+ gate (plan §5): rows only from week 9 and only on a dated dead-money basis
# ==========================================================================
def test_capplus_gate(status):
    cap = _load("live_capplus")
    if len(cap) == 0:
        assert status["capplus_state"] == "blank"
        assert status["capplus_blank_reason"] == lc.CAPPLUS_BLANK_REASON
        return
    assert status["capplus_state"] == "value"
    assert int(status["asof_week"]) >= lc.LIVE_CAPPLUS_MIN_WEEK
    assert isinstance(status["dm_asof_date"], str) and status["dm_basis"] != "none"
    assert abs(cap["capplus_live"].mean() - 100) < 1e-4
    man = json.loads((REPO / "data" / "marts" / "manifest.json").read_text())
    assert "pooled_sd_measured_raw" in json.dumps(man["checks"].get("capplus", {}))


def test_no_money_figure_while_dm_basis_is_none(status):
    if status["dm_basis"] == "none":
        for c in ("money_asof_date", "contracts_sha256", "dm_asof_date", "dm_asof_stage"):
            assert pd.isna(status[c]), f"{c} set while no money snapshot is pinned"
        assert status["capplus_state"] == "blank"
