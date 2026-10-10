"""Cap+ v3 — the four owner rulings of 2026-10-10 (DECISIONS 109-114), asserted.

1. λ = 1.0: dead money counts once, so the cost index IS cap consumed.
2. P's EPA input is the opponent-adjusted margin.
3. (capplus_context) the obligation blend is retired — see test_contracts.py.
4. 2013 ships measured and provisional; 2016/2020/2021 ship estimated with
   per-team provenance; Cap+ is calibrated on the ten measured seasons and the
   estimated seasons are divided by the same pooled SD.
5. The SAFE-only licensing reversal still blanks seasons.

Committed marts only, except the SAFE-tier test, which rebuilds in a subprocess
with DEAD_MONEY_TIER=safe (nothing is written).
"""

from __future__ import annotations

import json
import os
import subprocess
import sys

import numpy as np
import pandas as pd
import pytest

from conftest import REPO, find_mart, read_any

MEASURED = [2013, 2014, 2015, 2017, 2018, 2019, 2022, 2023, 2024, 2025]
ESTIMATED = [2016, 2020, 2021]
PUBLISHED = {2016: 8, 2020: 11, 2021: 10}
REF_DATES = {2016: "2016-10-05", 2020: "2020-06-02", 2021: "2021-09-06"}
OVERRIDE_2013 = "published one week into the league year; understates the final figure."
PROVISIONAL = "published before the league year opened; understates the final figure."
ESTIMATED_REASON = ("Estimated — {n} of 32 teams are published figures; the rest are "
                    "modeled from contract data.")


def _mart(name: str) -> pd.DataFrame:
    path = find_mart(name)
    if path is None:
        pytest.skip(f"{name} not built")
    return read_any(path)


@pytest.fixture(scope="module")
def off() -> pd.DataFrame:
    return _mart("capplus_official")


@pytest.fixture(scope="module")
def display() -> pd.DataFrame:
    return _mart("dead_money_display")


@pytest.fixture(scope="module")
def resolution() -> pd.DataFrame:
    return _mart("dead_money_snapshot_resolution")


def _pooled(x: pd.Series, season: pd.Series) -> float:
    dev = x - x.groupby(season).transform("mean")
    return float(np.sqrt((dev ** 2).sum() / (len(x) - season.nunique())))


# --------------------------------------------------------------------------- #
# ruling 1 — λ = 1
# --------------------------------------------------------------------------- #
def test_lambda_is_one_and_cost_equals_cap_consumed(off):
    sys.path.insert(0, str(REPO))
    from etl import config
    assert config.LAMBDA_DEAD == 1.0
    assert config.LAMBDA_COMPARISON == (1.5, 2.0)
    assert (off.cost_rec - off.cap_consumed_rec).abs().max() < 1e-6, (
        "at λ = 1 the cost index is cap consumed, by construction")
    # ...and both columns still ship (contract).
    assert {"cost_rec", "cap_consumed_rec"} <= set(off.columns)


# --------------------------------------------------------------------------- #
# ruling 2 — P reads the opponent-adjusted EPA margin
# --------------------------------------------------------------------------- #
def _z(df: pd.DataFrame, col: str) -> pd.Series:
    g = df.groupby("season")[col]
    return (df[col] - g.transform("mean")) / g.transform(lambda x: x.std(ddof=1))


def _P(epa_col: str) -> pd.DataFrame:
    res = _mart("team_season_results")
    epa = _mart("team_season_epa")
    d = res.merge(epa[["season", "team", epa_col]], on=["season", "team"])
    d["pdg"] = d.point_diff / d.games
    raw = (_z(d, "win_pct") + _z(d, "pdg") + _z(d, epa_col)) / 3
    d["P_check"] = raw.groupby(d.season).transform(lambda x: (x - x.mean()) / x.std(ddof=1))
    return d[["season", "team", "P_check"]]


def test_P_uses_the_adjusted_margin():
    tr = _mart("team_rating")
    adj = tr.merge(_P("epa_margin_per_play_adj"), on=["season", "team"])
    raw = tr.merge(_P("epa_margin_per_play"), on=["season", "team"])
    assert len(adj) == 861
    assert (adj.P - adj.P_check).abs().max() < 1e-5, "team_rating.P is not the adjusted-EPA build"
    assert (raw.P - raw.P_check).abs().max() > 0.05, "P still matches the raw margin"
    assert (tr.perf_index - (100 + 15 * tr.P)).abs().max() < 1e-5


# --------------------------------------------------------------------------- #
# ruling 4 — calibration on the measured seasons only
# --------------------------------------------------------------------------- #
def test_calibration_uses_the_measured_seasons_only(off):
    assert sorted(off.season.unique()) == sorted(MEASURED + ESTIMATED)
    means = off.groupby("season").capplus.mean()
    assert (means - 100).abs().max() < 1e-4, means.round(4).to_dict()
    meas = off[off.season.isin(MEASURED)]
    assert abs(_pooled(meas.capplus, meas.season) - 15.0) < 1e-4
    # The estimated seasons are NOT forced to SD 15 — they share the measured
    # seasons' divisor, so their own spread is whatever it is.
    est = off[off.season.isin(ESTIMATED)]
    assert abs(_pooled(est.capplus, est.season) - 15.0) > 1e-3
    # Same scale: rebuild from the published R and P with the measured divisor.
    raw = (100 + 15 * off.P) / off.R_rec
    dev = raw - raw.groupby(off.season).transform("mean")
    m = off.season.isin(MEASURED)
    sd = _pooled(dev[m], off.season[m])
    rebuilt = 100 + 15 * dev / sd
    assert (rebuilt - off.capplus).abs().max() < 1e-4


def test_floor_and_R_hold_in_every_season(off):
    assert (off.groupby("season").was_floored.sum() == 8).all()
    assert (off.groupby("season").R_rec.mean() - 1).abs().max() < 1e-5


# --------------------------------------------------------------------------- #
# ruling 4 — 2013 measured, provisional, with its own badge sentence
# --------------------------------------------------------------------------- #
def test_2013_is_measured_and_provisional_with_the_override(off, resolution):
    s13 = off[off.season == 2013]
    assert len(s13) == 32
    assert set(s13.badge) == {"provisional"}
    assert set(s13.badge_reason) == {OVERRIDE_2013}
    assert set(s13.dm_asof_date) == {"2013-03-18"} and set(s13.dm_asof_stage) == {"preseason"}
    assert set(s13.license_tier) == {"REVIEW_SPOTRAC"}
    assert not s13.dm_is_modeled.astype(bool).any()
    r = resolution.set_index("season")
    assert r.loc[2013, "coverage_class"] == "full32" and r.loc[2013, "badge"] == "provisional"
    assert r.loc[2013, "badge_reason"] == OVERRIDE_2013
    # 2014 and 2019 keep the default provisional sentence.
    for s in (2014, 2019):
        assert set(off.loc[off.season == s, "badge_reason"]) == {PROVISIONAL}


# --------------------------------------------------------------------------- #
# ruling 4 — estimated seasons: badge, sentence, provenance
# --------------------------------------------------------------------------- #
def test_estimated_seasons_are_badged_with_their_sentence(off, resolution):
    for s in ESTIMATED:
        rows = off[off.season == s]
        assert set(rows.badge) == {"estimated"}
        assert set(rows.badge_reason) == {ESTIMATED_REASON.format(n=PUBLISHED[s])}
        assert set(rows.dm_asof_date) == {REF_DATES[s]}, "Cap+ reads the reference date"
        assert int((~rows.dm_is_modeled.astype(bool)).sum()) == PUBLISHED[s]
        assert set(rows.loc[rows.dm_is_modeled.astype(bool), "license_tier"]) == {"MODELED"}
    r = resolution.set_index("season")
    for s in ESTIMATED:
        assert r.loc[s, "coverage_class"] == "estimated"
        assert bool(r.loc[s, "resolved"]) and not bool(r.loc[s, "resolvable"])
        assert r.loc[s, "chosen_asof_date"] == REF_DATES[s]
        assert int(r.loc[s, "n_published_teams"]) == PUBLISHED[s]
    assert set(off.badge) == {"provisional", "preseason", "in_season", "estimated"}


def test_estimated_provenance_reaches_the_display_mart(display):
    est = pd.read_csv(REPO / "data/curated/dead_money_estimated.csv")
    est = est[est.season.isin(ESTIMATED)]
    j = display.merge(est, on=["season", "team"], validate="1:1")
    assert len(j) == 96
    assert (j.dead_money_usd == j.dead_money_usd_est).all()
    assert (j.method_x == j.method_y).all()
    mod = j[j.is_modeled.astype(bool)]
    pub = j[~j.is_modeled.astype(bool)]
    assert (mod.lo_usd_x == mod.lo_usd_y).all() and (mod.hi_usd_x == mod.hi_usd_y).all()
    assert (mod.asof_date == mod.ref_asof_date).all(), "modeled rows: the reference date"
    assert (pub.asof_date == pub.anchor_asof_date_y).all(), "published rows: their own date"
    # 2020's six other-date readings keep their March date.
    other = pub[pub.method_x == "reading_other_date"]
    assert len(other) == 6 and set(other.asof_date) == {"2020-03-25"}


def test_the_pipeline_does_not_read_staging():
    for mod in ("deadmoney.py", "capplus.py", "capplus_context.py", "pipeline.py"):
        src = (REPO / "etl" / mod).read_text()
        assert "config.STAGING" not in src and "staging/" not in src, mod
    assert not (REPO / "data/curated/staging/dead_money_estimated.csv").exists()
    assert (REPO / "data/curated/dead_money_estimated.csv").exists()


# --------------------------------------------------------------------------- #
# the SAFE-only licensing reversal still works
# --------------------------------------------------------------------------- #
SAFE_PROBE = r"""
import json
from etl import capplus, config, deadmoney, io_utils
assert config.DEAD_MONEY_TIER == "safe"
dm = deadmoney.load_team_season()
est = deadmoney.load_estimated()
res = deadmoney.build_snapshot_resolution(dm, est)
cap = io_utils.read_csv(config.MARTS / "team_season_cap.csv")
disp, _ = deadmoney.build_display(dm, cap, deadmoney.load_ledger(), est)
off, tr, stats = capplus.build(verbose=False)
print(json.dumps({
    "est_rows": len(est),
    "seasons": sorted(int(s) for s in off.season.unique()),
    "blank": {int(r.season): r.blank_reason for r in res.itertuples() if not r.resolved},
    "badges": sorted(set(off.badge)),
    "leaders_only_seasons": sorted(int(s) for s in
                                   disp.loc[disp.season_coverage == "leaders_only", "season"].unique()),
    "modeled_rows": int(disp.is_modeled.sum()),
    "team_rating_rows": len(tr),
}))
"""


def test_safe_tier_reversal_still_blanks_seasons():
    env = {**os.environ, "DEAD_MONEY_TIER": "safe"}
    out = subprocess.run([sys.executable, "-c", SAFE_PROBE], cwd=REPO, env=env,
                         capture_output=True, text=True, timeout=300)
    assert out.returncode == 0, out.stderr[-2000:]
    got = json.loads(out.stdout.strip().splitlines()[-1])
    assert got["est_rows"] == 0, "the estimate must withdraw under SAFE (it trains on full-tier data)"
    assert got["seasons"] == [2014, 2015]
    reason = "Not available — no league-wide dead-money table was published for this season."
    assert {int(k) for k in got["blank"]} == set(range(2013, 2026)) - {2014, 2015}
    assert set(got["blank"].values()) == {reason}
    assert "estimated" not in got["badges"]
    assert 2013 in got["leaders_only_seasons"], "2013 falls back to its SAFE leaders list"
    assert got["modeled_rows"] == 0
    assert got["team_rating_rows"] == 861


def test_the_two_blank_reason_sentences_are_unchanged():
    sys.path.insert(0, str(REPO))
    from etl import config
    assert config.BLANK_REASON_NO_DM_TABLE == (
        "Not available — no league-wide dead-money table was published for this season.")
    assert config.BLANK_REASON_PRE_TIER2 == (
        "Not available — league-wide contract coverage begins in 2013.")
    assert config.CAPPLUS_BLANK_SEASONS == ()
    assert config.CAPPLUS_SEASONS == tuple(range(2013, 2026))
    assert config.CAPPLUS_PROVISIONAL_SEASONS == (2013, 2014, 2019)
    assert config.CAPPLUS_ESTIMATED_SEASONS == (2016, 2020, 2021)
    assert not hasattr(config, "MORTGAGE_ALPHA")


def test_the_estimate_file_agrees_with_the_2013_measured_table(dm_team_season):
    """The estimate file carries 2013 as `measured_full32`; 2013 resolves from
    dead_money_team_season. The two copies must be the same 32 readings."""
    est = pd.read_csv(REPO / "data/curated/dead_money_estimated.csv")
    e13 = est[est.season == 2013].set_index("team")
    src = dm_team_season[(dm_team_season.season == 2013)
                         & (dm_team_season.asof_date == "2013-03-18")].set_index("team")
    assert len(e13) == len(src) == 32 and set(e13.method) == {"measured_full32"}
    assert (e13.dead_money_usd_est.sort_index() == src.dead_money_usd.sort_index()).all()
