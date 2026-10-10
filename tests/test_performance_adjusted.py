"""Opponent-adjusted EPA and playoff result — additive columns on the two
performance marts (`etl/performance.py`).

Reads committed files only. Values are rounded to 6 dp in the CSV, so identities
that hold to 1e-9 in the build are checked here to rounding tolerance.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

ROUND_TOL = 2e-6
MAX_SHIFT = 0.08
MIN_CORR = 0.9
PLAYOFF_RESULTS = {"none", "wild_card", "divisional", "conference",
                   "super_bowl_loss", "super_bowl_win"}
# Round a team was last in, by result (byes skip round 1).
LAST_ROUND = {"wild_card": 1, "divisional": 2, "conference": 3,
              "super_bowl_loss": 4, "super_bowl_win": 4}


def _field(season: int) -> int:
    return 14 if season >= 2020 else 12


def test_adjusted_epa_preserves_season_means_and_margin_identity(epa):
    """Adjustment re-distributes EPA between teams; it never moves a season's mean."""
    for season, g in epa.groupby("season"):
        for side in ("off", "def"):
            drift = g[f"{side}_epa_per_play_adj"].mean() - g[f"{side}_epa_per_play"].mean()
            assert abs(drift) < ROUND_TOL, f"{season} {side}: adjusted mean drifted {drift:+.2e}"
    ident = epa.off_epa_per_play_adj - epa.def_epa_per_play_adj - epa.epa_margin_per_play_adj
    assert ident.abs().max() < ROUND_TOL, "epa_margin_per_play_adj != off_adj - def_adj"


def test_adjusted_epa_stays_close_to_raw(epa):
    """Corr(adj, raw margin) > 0.9 every season; no side moves more than 0.08 EPA/play."""
    for season, g in epa.groupby("season"):
        r = np.corrcoef(g.epa_margin_per_play_adj, g.epa_margin_per_play)[0, 1]
        assert r > MIN_CORR, f"{season}: corr(adj, raw margin) = {r:.3f}"
    for side in ("off", "def"):
        shift = (epa[f"{side}_epa_per_play_adj"] - epa[f"{side}_epa_per_play"]).abs()
        assert shift.max() <= MAX_SHIFT, f"{side} shift {shift.max():.4f} > {MAX_SHIFT}"


def test_sos_explains_the_direction_of_the_adjustment(epa):
    """A harder schedule (higher sos_epa) lifts adjusted margin; an easier one lowers it."""
    for season, g in epa.groupby("season"):
        shift = g.epa_margin_per_play_adj - g.epa_margin_per_play
        r = np.corrcoef(shift, g.sos_epa)[0, 1]
        assert r > 0.5, f"{season}: corr(adjustment, sos_epa) = {r:.3f}"


def test_playoff_vocabulary_field_size_and_one_champion(results):
    assert set(results.playoff_result) <= PLAYOFF_RESULTS
    for season, g in results.groupby("season"):
        vc = g.playoff_result.value_counts()
        assert vc.get("super_bowl_win", 0) == 1, f"{season}: SB winners {vc.get('super_bowl_win', 0)}"
        assert vc.get("super_bowl_loss", 0) == 1, f"{season}: SB losers {vc.get('super_bowl_loss', 0)}"
        field = int((g.playoff_result != "none").sum())
        assert field == _field(int(season)), f"{season}: {field} playoff teams"
    none = results[results.playoff_result == "none"]
    assert (none.playoff_games == 0).all() and (none.playoff_wins == 0).all()


def test_playoff_bracket_closes(results):
    """Games and wins reconcile with the round reached; byes are 4 per season
    through 2019 and 2 from 2020; every playoff game has exactly one winner."""
    po = results[results.playoff_result != "none"].copy()
    champ = po.playoff_result == "super_bowl_win"
    assert (po.loc[champ, "playoff_wins"] == po.loc[champ, "playoff_games"]).all()
    assert (po.loc[~champ, "playoff_wins"] == po.loc[~champ, "playoff_games"] - 1).all()
    po["bye"] = po.playoff_result.map(LAST_ROUND) - po.playoff_games
    assert po.bye.isin([0, 1]).all(), "games played inconsistent with round reached"
    for season, g in po.groupby("season"):
        byes = int(g.bye.sum())
        assert byes == (2 if season >= 2020 else 4), f"{season}: {byes} byes"
        assert g.playoff_wins.sum() * 2 == g.playoff_games.sum() == 2 * (len(g) - 1)


def test_playoff_known_outcomes(results):
    """External anchors: 18-1 NE lost Super Bowl XLII to NYG; 2023 KC repeated."""
    def res(season, team):
        r = results[(results.season == season) & (results.team == team)]
        assert len(r) == 1
        return r.iloc[0]

    ne07, nyg07, kc23 = res(2007, "NE"), res(2007, "NYG"), res(2023, "KC")
    assert (ne07.playoff_result, ne07.playoff_games, ne07.playoff_wins) == ("super_bowl_loss", 3, 2)
    assert (nyg07.playoff_result, nyg07.playoff_games, nyg07.playoff_wins) == ("super_bowl_win", 4, 4)
    assert kc23.playoff_result == "super_bowl_win"
    # Regular season is untouched by the postseason: 2007 NE is still 16-0.
    assert (ne07.wins, ne07.losses, ne07.games) == (16, 0, 16)
