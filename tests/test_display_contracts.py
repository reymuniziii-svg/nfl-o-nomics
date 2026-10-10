"""Display contracts — the mart guarantees the VIEW LAYER is allowed to rely on.

These are not chart tests; they are tests of the promises a chart was written
against. Each one exists because a component was shipped assuming something the
mart either does or does not guarantee, and the difference was invisible until
someone counted the marks on the page.

Committed files only, like every other test in this suite.
"""

from __future__ import annotations

import pandas as pd
import pytest

from conftest import find_mart, read_any

# The three seasons with no league-wide dead-money table. Since 2026-10-10 they
# ship from the curated estimate (DECISIONS 113): 32 teams each, the published
# teams as real readings and the rest modeled with a range. 2013 became a
# measured season (DECISIONS 112).
ESTIMATED_SEASONS = [2016, 2020, 2021]


@pytest.fixture(scope="session")
def dm_display() -> pd.DataFrame:
    path = find_mart("dead_money_display.csv", "dead_money_display.parquet")
    if path is None:
        pytest.skip("dead_money_display mart not present")
    return read_any(path)


def test_every_display_row_carries_a_burden_denominator(dm_display):
    """THE DOT PLOT'S WHOLE PREMISE.

    `DeadMoneyDots` positions each reading at `burden_of_adjusted_cap`, and its
    coverage sentence is allowed to blame a missing denominator ONLY where the
    mart genuinely has none. If this ever fails, the sentence becomes true and
    the chart's caption has to change with it — it must never be the other way
    round, which is what shipped: the view nulled the burden for every season
    but the one being viewed and then told the reader the mart lacked it.
    """
    missing = dm_display[dm_display.burden_of_adjusted_cap.isna()]
    assert missing.empty, (
        f"{len(missing)} dead_money_display rows carry no burden_of_adjusted_cap: "
        f"{missing[['season', 'team']].head(10).to_dict('records')}"
    )


def test_display_grain_is_one_resolved_reading_per_team_season(dm_display):
    """One dot per (season, team). The dot plot draws this mart directly, so a
    duplicated key would put two marks on one coordinate — the same defect as
    the ring/dot contradiction, arriving from the data side."""
    dupes = dm_display.groupby(["season", "team"]).size()
    assert (dupes == 1).all(), f"non-unique (season, team): {dupes[dupes > 1].to_dict()}"


def test_a_franchise_has_many_readings_not_one(dm_display):
    """The regression guard, stated as a fact about the data: every club that
    appears at all has a SERIES of dated readings. A chart that renders one dot
    per club is not showing what the mart holds."""
    per_team = dm_display.groupby("team").size()
    assert per_team.min() >= 9, f"a club has only {per_team.min()} readings: {per_team.idxmin()}"
    for club in ("KC", "CLE", "NO", "SF", "DEN"):
        if club in per_team.index:
            assert per_team[club] >= 9, f"{club} has {per_team[club]} readings"


def test_no_silent_partial_season_under_the_full_tier(dm_display):
    """`SPEC.md` §1.2 — a partial season is labelled partial. Under the shipping
    tier no season is partial any more: every season is a measured full-32 table
    or the curated estimate, and `leaders_only` (the `Metric.partial` case)
    survives only under the SAFE-only reversal. A leaders-list row here would
    mean the resolution rule picked the wrong snapshot."""
    assert (dm_display.season_coverage == "leaders_only").sum() == 0
    assert set(dm_display.groupby("season").team.nunique()) == {32}


def test_estimated_seasons_split_cleanly_into_reading_and_model(dm_display):
    """In an estimated season every club is EITHER a published reading (its own
    date, no range) OR a modeled value (the season's reference date, an 80%
    range, no reading date) — never both. The view draws the two differently and
    must never print a modeled dollar figure without its range."""
    for season in ESTIMATED_SEASONS:
        rows = dm_display[dm_display.season == season]
        assert len(rows) == 32 and rows.season_coverage.eq("estimated").all()
        mod = rows[rows.is_modeled.astype(bool)]
        pub = rows[~rows.is_modeled.astype(bool)]
        assert 0 < len(pub) < 32, f"{season}: {len(pub)} published clubs"
        assert mod.anchor_asof_date.isna().all() and mod.lo_usd.notna().all()
        assert (pub.anchor_asof_date == pub.asof_date).all()
        assert (mod.asof_date.nunique() == 1), f"{season}: modeled rows span dates"


def test_the_field_domain_contains_every_published_capplus():
    """`SPEC.md` §4 — the field's coordinate system is `150 − Cap+` clamped to
    0…100, i.e. a Cap+ domain of 50–150. The two field-literal surfaces are only
    honest if nothing in the mart falls outside it; the conventional 76–124
    window, by contrast, clips about 9% of the same rows, which is why that
    window governs conventional charts and not these two.
    """
    path = find_mart("capplus_official.csv", "capplus_official.parquet")
    if path is None:
        pytest.skip("capplus_official mart not present")
    cp = read_any(path)
    lo, hi = float(cp.capplus.min()), float(cp.capplus.max())
    assert 50 <= lo and hi <= 150, f"Cap+ range {lo:.1f}–{hi:.1f} leaves the field's 50–150 domain"
    # And the reachability the deferral of these surfaces was argued from:
    # the red zone is entered by real, shipped data.
    assert (cp.capplus >= 130).any(), "no season reaches the red zone — check the mart"


def test_availability_window_is_the_same_for_games_and_snaps():
    """The player card's caption claimed games ran the full record while snaps
    began in 2013. Both are truncated at the same boundary, and the page now
    labels the window — this asserts the window it labels is the real one."""
    path = find_mart(
        "player_season_availability.csv", "player_season_availability.parquet"
    )
    if path is None:
        pytest.skip("player_season_availability mart not present")
    av = read_any(path)
    assert int(av.season.min()) == 2013, (
        f"availability begins in {int(av.season.min())}, not 2013 — the caption is now wrong"
    )
    assert int(av.season.max()) == 2025
