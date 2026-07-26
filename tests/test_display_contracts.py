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

# The four seasons with no league-wide dead-money table (DECISIONS.md 16).
BLANK_SEASONS = [2013, 2016, 2020, 2021]


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


def test_leaders_only_rows_are_labelled_as_such(dm_display):
    """`SPEC.md` §1.2 — a partial season is labelled partial. The view maps
    `season_coverage == 'leaders_only'` onto `Metric.partial`, so the column has
    to keep saying it, and it has to keep landing only inside the four blanked
    seasons: a leaders-list row in a full-32 season would mean the resolution
    rule picked the wrong snapshot."""
    leaders = dm_display[dm_display.season_coverage == "leaders_only"]
    assert not leaders.empty, "no leaders_only rows — the partial state has no live case"
    stray = sorted(set(leaders.season) - set(BLANK_SEASONS))
    assert not stray, f"leaders_only rows in a covered season: {stray}"


def test_blank_seasons_split_cleanly_into_ring_and_reading(dm_display):
    """The two marks the dot plot draws for a blanked season are MUTUALLY
    EXCLUSIVE by construction: a club either appears in that season's leaders
    list (and gets its reading drawn in the not-a-32-team ring style) or it does
    not (and gets an empty ring on the baseline). Drawing both at one coordinate
    asserted, at the same x, that the season has no reading and that it has one.
    """
    for season in BLANK_SEASONS:
        rows = dm_display[dm_display.season == season]
        assert rows.season_coverage.eq("leaders_only").all(), (
            f"{season} is a blanked season but carries a non-leaders reading"
        )
        assert 0 < len(rows) < 32, (
            f"{season} has {len(rows)} clubs; a blanked season is neither empty nor full"
        )


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
