"""Golden tests — DATA_AUDIT.md §3.

The 18 externally-verified facts, re-run against the committed marts and curated
files at their stated tolerances:

    EXACT   wins, records, point differential, cap ceilings, draft position,
            snap counts
    +/-1%   money

They currently return delta zero on every exact check and $0 on every money
check. A drift of one dollar fails the build (ARCHITECTURE.md §12).

Test 16b is a NEGATIVE golden test. Wilson's $85M Denver dead money must remain
ABSENT from the nflverse-derived route and PRESENT at the exact value in the
curated ledger. The test PASSES because the absence is the expected, documented
state (DATA_AUDIT §3.1). If the charge ever appears in nflverse, that is a
finding, not a fix, and the build must fail so a human looks.

External values and URLs: audit/golden_facts_sources.md.
"""

from __future__ import annotations

import pytest

from conftest import (
    assert_exact,
    assert_money,
    brady_receipt,
    find_mart,
    one_row,
    read_any,
    rel,
    tomlinson_receipt,
)

# ==========================================================================
# 1-6 — records, point differential (EXACT)
# ==========================================================================


def test_g01_2007_ne_record(results):
    """#1  2007 NE regular-season record — external 16-0 (Wikipedia)."""
    r = one_row(results, "2007 NE", season=2007, team="NE")
    assert_exact(int(r.wins), 16, "2007 NE wins")
    assert_exact(int(r.losses), 0, "2007 NE losses")
    assert_exact(int(r.ties), 0, "2007 NE ties")
    assert_exact(int(r.games), 16, "2007 NE games")


def test_g02_2007_ne_point_differential(results):
    """#2  2007 NE point differential — external +315 (589 PF / 274 PA)."""
    r = one_row(results, "2007 NE", season=2007, team="NE")
    assert_exact(int(r.points_for), 589, "2007 NE points_for")
    assert_exact(int(r.points_against), 274, "2007 NE points_against")
    assert_exact(int(r.point_diff), 315, "2007 NE point_diff")


def test_g03_2008_det_record(results):
    """#3  2008 DET regular-season record — external 0-16 (Wikipedia)."""
    r = one_row(results, "2008 DET", season=2008, team="DET")
    assert_exact(int(r.wins), 0, "2008 DET wins")
    assert_exact(int(r.losses), 16, "2008 DET losses")
    assert_exact(int(r.ties), 0, "2008 DET ties")
    assert_exact(int(r.points_for), 268, "2008 DET points_for")
    assert_exact(int(r.points_against), 517, "2008 DET points_against")


def test_g04_2017_cle_record(results):
    """#4  2017 CLE regular-season record — external 0-16 (Wikipedia)."""
    r = one_row(results, "2017 CLE", season=2017, team="CLE")
    assert_exact(int(r.wins), 0, "2017 CLE wins")
    assert_exact(int(r.losses), 16, "2017 CLE losses")
    assert_exact(int(r.ties), 0, "2017 CLE ties")
    assert_exact(int(r.points_for), 234, "2017 CLE points_for")
    assert_exact(int(r.points_against), 410, "2017 CLE points_against")


def test_g05_2023_kc_record(results):
    """#5  2023 KC regular-season record — external 11-6 (Wikipedia).

    A useful golden test precisely because the eventual champion was the 3-seed.
    """
    r = one_row(results, "2023 KC", season=2023, team="KC")
    assert_exact(int(r.wins), 11, "2023 KC wins")
    assert_exact(int(r.losses), 6, "2023 KC losses")
    assert_exact(int(r.ties), 0, "2023 KC ties")
    assert_exact(int(r.games), 17, "2023 KC games")
    assert_exact(int(r.points_for), 371, "2023 KC points_for")
    assert_exact(int(r.points_against), 294, "2023 KC points_against")


def test_g06_2023_sf_record(results):
    """#6  2023 SF regular-season record — external 12-5 (Wikipedia).

    The wins figure here is the denominator of the §3.2 hand-computed
    cost-per-win, so it is asserted exactly on both routes.
    """
    r = one_row(results, "2023 SF", season=2023, team="SF")
    assert_exact(int(r.wins), 12, "2023 SF wins")
    assert_exact(int(r.losses), 5, "2023 SF losses")
    assert_exact(int(r.ties), 0, "2023 SF ties")
    assert_exact(int(r.games), 17, "2023 SF games")
    assert_exact(int(r.points_for), 491, "2023 SF points_for")
    assert_exact(int(r.points_against), 298, "2023 SF points_against")


# ==========================================================================
# 7-11 — league salary cap ceilings (EXACT)
# ==========================================================================


@pytest.mark.parametrize(
    "num,year,expected,source",
    [
        (7, 2011, 120_375_000, "NFL Ops / PFT exact — NFL Ops rounds to $120.0M"),
        (8, 2013, 123_000_000, "NFL.com"),
        (9, 2020, 198_200_000, "NFL Ops"),
        (10, 2024, 255_400_000, "CBS Sports"),
        (11, 2025, 279_200_000, "NFL.com"),
    ],
)
def test_g07_to_g11_league_cap(league_cap, num, year, expected, source):
    """#7-#11  League salary cap ceilings — EXACT tolerance, not +/-1%.

    Cap ceilings are published figures, not derived money: the audit scores them
    exact. 2011 is stored at the precise $120,375,000 rather than the rounded
    league-table $120.0M.
    """
    row = one_row(league_cap, f"league_cap {year}", year=year)
    assert row.cap_usd == row.cap_usd, f"league cap {year} is null ({source})"
    assert_exact(int(row.cap_usd), expected, f"#{num} league cap {year} ({source})")


def test_league_cap_2010_is_null(league_cap):
    """Guard for #7-#11: 2010 is the uncapped year and must stay null.

    A zero or an interpolated value here would silently create a denominator
    that does not exist (SPEC §7.11).
    """
    row = one_row(league_cap, "league_cap 2010", year=2010)
    assert row.cap_usd != row.cap_usd, (
        "league_cap 2010 must be NULL — 2010 was uncapped and no denominator exists; "
        f"found {row.cap_usd!r}"
    )


# ==========================================================================
# 12-13 — player cap hits (+/-1% money)
# ==========================================================================


def _golden_check(df, needle: str):
    sel = df[df["check"].str.contains(needle, case=False, regex=False)]
    assert len(sel) == 1, f"expected 1 golden-check row matching {needle!r}, got {len(sel)}"
    return sel.iloc[0]


def test_g12_mahomes_2023_cap_hit(contracts_golden):
    """#12  Mahomes 2023 cap hit — external $37,133,824 (Over The Cap).

    Scored against the committed recomputation in
    data/curated/staging/contracts_golden_checks.csv. The value is the SETTLED
    end-of-year cap number after the September 2023 rework; press variously
    cites $49.293M (pre-restructure) and ~$39.7M (post-March restructure), so
    the snapshot is pinned deliberately.
    """
    row = _golden_check(contracts_golden, "Mahomes KC 2023")
    assert_exact(int(row.expected_usd), 37_133_824, "#12 external value pinned")
    assert_money(row.pipeline_usd, 37_133_824, "#12 Mahomes 2023 cap hit")
    assert row.team_in_data == "KC", f"#12 team should be KC, got {row.team_in_data!r}"


def test_g13_wilson_2013_sea_cap_hit(contracts_golden):
    """#13  Russell Wilson 2013 SEA cap hit — external $681,085 (Over The Cap).

    The canonical rookie-contract-QB illustration: ~0.56% of Seattle's cap.
    """
    row = _golden_check(contracts_golden, "Russell Wilson SEA 2013")
    assert_exact(int(row.expected_usd), 681_085, "#13 external value pinned")
    assert_money(row.pipeline_usd, 681_085, "#13 Wilson 2013 SEA cap hit")
    assert row.team_in_data == "SEA", f"#13 team should be SEA, got {row.team_in_data!r}"


# ==========================================================================
# 14-16 — Wilson DEN dead money, curated ledger route (+/-1% money)
# ==========================================================================


def _wilson_den(dm_ledger):
    sel = dm_ledger[(dm_ledger.player == "Russell Wilson") & (dm_ledger.team == "DEN")]
    assert len(sel) == 1, (
        f"expected exactly 1 Wilson/DEN ledger row, found {len(sel)} — the ledger "
        "carries one row per player-team charge"
    )
    return sel.iloc[0]


def _wilson_split(dm_ledger):
    row = _wilson_den(dm_ledger)
    assert isinstance(row.split_by_season, str) and "/" in row.split_by_season, (
        "Wilson/DEN split_by_season must be a populated 'a/b' string — it is the "
        f"source of tests 14 and 15; got {row.split_by_season!r}"
    )
    parts = [int(p) for p in row.split_by_season.split("/")]
    assert len(parts) == 2, f"expected a two-season split, got {row.split_by_season!r}"
    return parts


def test_g14_wilson_den_dead_money_2024(dm_ledger):
    """#14  Wilson DEN dead money 2024 — external $53,000,000 (ESPN / PFT split).

    Denver DECLINED the $22M 2025 option bonus, which accelerated fully into
    2024. The widely-published $35.4M/$49.6M split is the projection Denver did
    NOT take (see the ledger `notes` field).
    """
    y2024, _ = _wilson_split(dm_ledger)
    assert_money(y2024, 53_000_000, "#14 Wilson DEN 2024 dead money")


def test_g15_wilson_den_dead_money_2025(dm_ledger):
    """#15  Wilson DEN dead money 2025 — external $32,000,000 (same sources)."""
    _, y2025 = _wilson_split(dm_ledger)
    assert_money(y2025, 32_000_000, "#15 Wilson DEN 2025 dead money")


def test_g16_wilson_den_dead_money_total(dm_ledger):
    """#16  Wilson DEN dead money total — external $85,000,000 (CBS Sports).

    Asserts both the stored total and that the per-season split reconciles to
    it; a total that no longer equals its own components is a defect even if
    the headline number still matches.
    """
    row = _wilson_den(dm_ledger)
    assert_money(row.total_usd, 85_000_000, "#16 Wilson DEN total dead money")
    y2024, y2025 = _wilson_split(dm_ledger)
    assert_exact(
        y2024 + y2025,
        int(row.total_usd),
        "#16 split components must reconcile to total_usd",
    )
    assert bool(row.is_actual) is True, "#16 Wilson/DEN must be flagged is_actual"


# ==========================================================================
# 16b — NEGATIVE golden test (DATA_AUDIT §3.1, ARCHITECTURE §12)
# ==========================================================================


def test_g16b_wilson_den_absent_from_nflverse_route(contracts_golden):
    """#16b NEGATIVE: Wilson's DEN dead money must remain ABSENT from nflverse.

    This test PASSES because the absence is the expected and documented state.

    nflverse `historical_contracts` is a player-following career table: one row
    per player per year on the team he was on that year. When a player is
    released the table simply switches teams and the charge left behind on the
    old team is never written. Wilson's only 2024 row is PIT $1,210,000; his
    only 2025 row is NYG $11,029,412; there are ZERO DEN rows in either season.

    If a DEN charge ever appears on this route, the build fails so a human looks
    — it is a finding about the source, not a fix.
    """
    for season, wrong_team in ((2024, "PIT"), (2025, "NYG")):
        row = _golden_check(contracts_golden, f"Russell Wilson DEN {season} dead money")
        assert float(row.pipeline_usd) == 0.0, (
            f"#16b REGRESSION: the nflverse route now returns "
            f"${float(row.pipeline_usd):,.2f} for Wilson DEN {season}. This is a "
            "FINDING, not a fix — nflverse historical_contracts is not supposed to "
            "carry departed-team dead money. Re-audit before changing this test."
        )
        assert row.team_in_data == wrong_team, (
            f"#16b Wilson's only {season} nflverse row should be on {wrong_team}, "
            f"got {row.team_in_data!r}"
        )
        assert "NOT DERIVABLE" in str(row.note).upper(), (
            f"#16b the {season} row must stay labelled NOT DERIVABLE"
        )


def test_g16b_present_at_exact_value_in_curated_ledger(dm_ledger):
    """#16b, positive half: the same fact IS present, exact, in the curated ledger.

    The pairing is the point. Absence on one route plus exactness on the other
    is what proves the figure is sourced-curated, not nflverse-derived.
    """
    row = _wilson_den(dm_ledger)
    assert_exact(int(row.total_usd), 85_000_000, "#16b curated ledger total (exact)")
    assert_exact(
        row.split_by_season,
        "53000000/32000000",
        "#16b curated ledger split (exact string)",
    )
    assert str(row.source_url).startswith("http"), "#16b ledger row needs a citation"


def test_g16b_all_inference_routes_still_return_zero(dm_nflverse_probe):
    """#16b, breadth: all five inference routes and 8 of 8 further separations
    must still return zero rows (DATA_AUDIT §3.1).

    Ryan, Wentz, Lance, Garoppolo, Mayfield, Cousins, Osweiler, Rodgers — every
    one of them shows the same player-following behaviour. A non-zero count on
    any route means the source changed shape.
    """
    df = dm_nflverse_probe
    assert len(df) >= 12, f"expected the full probe matrix, found {len(df)} rows"
    nonzero = df[df.result_count != 0]
    assert nonzero.empty, (
        "#16b REGRESSION: nflverse dead-money inference routes now return rows:\n"
        f"{nonzero.to_string(index=False)}\n"
        "This is a FINDING about the upstream source, not a test failure to paper over."
    )
    assert df.verdict.str.startswith("FAIL").all(), (
        "#16b every probe route must remain a documented FAIL"
    )


# ==========================================================================
# 17 — draft position (EXACT)
# ==========================================================================


def test_g17_brady_2000_draft_position():
    """#17  Tom Brady 2000 draft position — external Round 6, pick 199, NE.

    Prefers the draft mart the moment it lands (BUILD_PLAN Phase 1, `draft_pick`);
    until then it scores the committed recomputation recorded in
    audit/findings_support_datasets.md. Neither route touches the network.

    The raw source team code is the PFR boxscore convention `NWE`, a fourth team
    -code convention — it must normalize to `NE`.
    """
    mart = find_mart("draft_pick", "draft_picks", "draft_capital")
    if mart is not None:
        df = read_any(mart)
        sel = df[(df.season == 2000) & (df.player_name.astype(str) == "Tom Brady")]
        assert len(sel) == 1, f"{rel(mart)}: expected 1 Tom Brady 2000 row, got {len(sel)}"
        r = sel.iloc[0]
        assert_exact(int(r["round"]), 6, "#17 Brady draft round (mart)")
        assert_exact(int(r["pick"]), 199, "#17 Brady overall pick (mart)")
        assert_exact(str(r["team"]), "NE", "#17 Brady drafting team, normalized (mart)")
        return

    g = brady_receipt()
    assert g["found"] is True, "#17 Brady row not found on the recorded run"
    assert_exact(g["round"], 6, "#17 Brady draft round")
    assert_exact(g["pick"], 199, "#17 Brady overall pick")
    assert_exact(g["round_delta"], 0, "#17 Brady round delta")
    assert_exact(g["pick_delta"], 0, "#17 Brady pick delta")
    assert_exact(g["team_raw"], "NWE", "#17 raw PFR boxscore team code")
    assert_exact(g["team_norm"], "NE", "#17 team after PFR_DRAFT_TEAM_MAP + normalize")
    assert g["team_ok"] is True, "#17 team normalization must be OK"


# ==========================================================================
# 18 — snap counts (EXACT)
# ==========================================================================


def test_g18_tomlinson_2023_nyj_offensive_snaps():
    """#18  Laken Tomlinson 2023 NYJ offensive snaps — external 1,101 (100%).

    Prefers `player_season_availability` the moment it lands; until then it
    scores the committed recomputation in audit/findings_support_datasets.md.

    Two traps ride on this one: snap rows must be filtered `game_type = 'REG'`
    (the postseason uses WC/DIV/CON/SB, there is no `POST` literal), and
    `offense_pct` is a 0-1 FRACTION, not 0-100.
    """
    mart = find_mart("player_season_availability", "player_season_snaps")
    if mart is not None:
        df = read_any(mart)
        sel = df[(df.season == 2023) & (df.team == "NYJ")]
        name_col = next(
            (c for c in ("player_name", "player", "full_name") if c in df.columns), None
        )
        if name_col is not None:
            sel = sel[sel[name_col].astype(str) == "Laken Tomlinson"]
            assert len(sel) == 1, (
                f"{rel(mart)}: expected 1 Tomlinson 2023 NYJ row, got {len(sel)}"
            )
            r = sel.iloc[0]
            assert_exact(int(r["off_snaps"]), 1101, "#18 Tomlinson REG offensive snaps")
            assert_exact(int(r["games"]), 17, "#18 Tomlinson games")
            assert 0.0 <= float(r["off_pct"]) <= 1.0, (
                "#18 off_pct must be a 0-1 fraction, not 0-100 "
                f"(got {r['off_pct']!r})"
            )
            assert_exact(round(float(r["off_pct"]), 3), 1.0, "#18 Tomlinson off_pct")
            return

    g = tomlinson_receipt()
    assert_exact(g["off_snaps"], 1101, "#18 Tomlinson REG offensive snaps")
    assert_exact(g["expected"], 1101, "#18 external value pinned")
    assert_exact(g["delta"], 0, "#18 Tomlinson snap delta")
    assert_exact(g["games"], 17, "#18 Tomlinson games")
    assert_exact(g["game_type"], "REG", "#18 snaps must be REG-filtered")
    assert 0.0 <= g["avg_off_pct"] <= 1.0, (
        f"#18 offense_pct must be a 0-1 fraction, got {g['avg_off_pct']}"
    )
    assert_exact(g["avg_off_pct"], 1.0, "#18 Tomlinson avg offense_pct (100%)")


# ==========================================================================
# 19-21 — player_season_production, EXACT
#
# Three externally verified regular-season lines, scored straight out of
# player_season_production (SPEC §7.13). These are NOT part of the DATA_AUDIT §3
# eighteen — that list was fixed at Phase 0, before this mart existed — so they
# are numbered onward rather than renumbering the audit's register.
#
# Every figure below was verified from press and reference coverage before it was
# pinned, with two independent sources each; the URLs are in the docstrings.
# Pro-Football-Reference was NOT usable as a source: it serves a Cloudflare bot
# challenge (HTTP 403) to any non-browser client, so NFL.com (official),
# Wikipedia, Steelers.com and StatMuse carry the verification instead.
#
# THE GOLDENS ARE SACKS, INTERCEPTIONS AND YARDS — NEVER TACKLES. Play-by-play
# tackle attribution diverges from official gamebook counts (Watt's 2021 is 58 on
# this route against the 64 combined every box score prints), which is exactly
# what the mart's `tackles_basis = 'pbp'` column exists to disclose. Writing a
# golden on a figure whose basis we have already labelled as divergent would pin
# a number we do not claim to reproduce.
# ==========================================================================


def _production_row(production, gsis_id: str, season: int, label: str):
    sel = production[
        (production.gsis_id == gsis_id) & (production.season == season)
    ]
    assert len(sel) == 1, f"{label}: expected exactly 1 row, found {len(sel)}"
    return sel.iloc[0]


def test_g19_mahomes_2023_passing_yards(production):
    """#19  Patrick Mahomes 2023 REG passing yards — external 4,183.

    Verified 401/597, 4,183 yards, 27 TD, 14 INT over 16 games (KC had locked the
    3-seed and rested him in Week 18). Sources:
      https://www.nfl.com/players/patrick-mahomes/stats/career
      https://en.wikipedia.org/wiki/Patrick_Mahomes

    The attempt count is the load-bearing one: nflverse's `pass_attempt` is 1 on
    a sack, so the un-filtered aggregate is 624 and the official figure is 597.
    Asserting it here is what keeps that filter from being "simplified" away.
    """
    r = _production_row(production, "00-0033873", 2023, "#19 Mahomes 2023")
    assert_exact(int(r.pass_yards), 4183, "#19 Mahomes 2023 REG passing yards")
    assert_exact(int(r.pass_attempts), 597, "#19 Mahomes 2023 REG attempts (sacks excluded)")
    assert_exact(int(r.pass_completions), 401, "#19 Mahomes 2023 REG completions")
    assert_exact(int(r.pass_td), 27, "#19 Mahomes 2023 REG passing TD")
    assert_exact(int(r.pass_int), 14, "#19 Mahomes 2023 REG interceptions thrown")
    assert_exact(str(r.teams), "KC", "#19 Mahomes 2023 team")


def test_g20_tj_watt_2021_sacks(production):
    """#20  T.J. Watt 2021 REG sacks — external 22.5.

    Verified 22.5 over 15 games, tying Michael Strahan's 2001 record (set in a
    16-game season). Sources:
      https://www.steelers.com/news/watt-ties-nfl-single-season-sack-record
      https://www.nfl.com/news/steelers-t-j-watt-hall-of-famer-michael-strahan-sack-record
      https://en.wikipedia.org/wiki/T._J._Watt

    Two things this figure is deliberately robust to. Pittsburgh asked Elias to
    credit Watt an additional sack on the Week 18 errant-snap play; the appeal was
    DENIED and the official total stands at 22.5. And Myles Garrett broke the
    record with 23 in 2025 — Watt's 22.5 is no longer the record, but it is
    unchanged as a fact, which is the only thing a golden test pins.

    The half is the point: 22.5 only reproduces if full sacks (`sack_player_id`,
    1.0) and split sacks (`half_sack_1/2_player_id`, 0.5 each) are summed as the
    partition they are. Rounding to whole sacks, or double-counting a split,
    both fail here.
    """
    r = _production_row(production, "00-0033886", 2021, "#20 Watt 2021")
    assert_exact(float(r.def_sacks), 22.5, "#20 T.J. Watt 2021 REG sacks")
    assert_exact(int(r.def_interceptions), 0, "#20 T.J. Watt 2021 REG interceptions")
    assert_exact(str(r.teams), "PIT", "#20 T.J. Watt 2021 team")
    # NOT a golden: the pbp tackle count (58) diverges from the official combined
    # 64. Asserted only as the disclosure that the divergence is still labelled.
    assert r.tackles_basis == "pbp", (
        "#20 the tackle figure beside these sacks is pbp-derived and diverges from "
        "the official gamebook count — it must stay labelled (SPEC §7.13)"
    )


def test_g21_justin_jefferson_2022_receiving_yards(production):
    """#21  Justin Jefferson 2022 REG receiving yards — external 1,809.

    Verified 128 receptions on 184 targets for 1,809 yards and 8 receiving TDs
    over all 17 games; he led the league in receptions and receiving yards and
    won AP Offensive Player of the Year. Sources:
      https://www.nfl.com/players/justin-jefferson/stats/career
      https://en.wikipedia.org/wiki/Justin_Jefferson

    Watch the touchdown figure: several outlets print "9 TDs" for 2022, which is
    8 receiving plus 1 rushing. The receiving figure is 8, and this mart splits
    them, so the two never merge into one number.
    """
    r = _production_row(production, "00-0036322", 2022, "#21 Jefferson 2022")
    assert_exact(int(r.rec_yards), 1809, "#21 Jefferson 2022 REG receiving yards")
    assert_exact(int(r.receptions), 128, "#21 Jefferson 2022 REG receptions")
    assert_exact(int(r.rec_targets), 184, "#21 Jefferson 2022 REG targets")
    assert_exact(int(r.rec_td), 8, "#21 Jefferson 2022 REG RECEIVING TD (not the 9 total)")
    assert_exact(int(r.rush_td), 1, "#21 Jefferson 2022 REG rushing TD — the 9th score")
    assert_exact(str(r.teams), "MIN", "#21 Jefferson 2022 team")


def test_g19_to_g21_two_point_conversions_are_excluded(production):
    """Guard for #19-#21: two-point conversions are not official statistics.

    They carry a passer, a rusher and a receiver, so leaving them in inflates
    ATTEMPT and TARGET counts while leaving yardage untouched — an error that
    hides in exactly the columns the three goldens above do not all assert.
    Derrick Henry's 2020 is the calibration case: 378 official carries for 2,027
    yards, and 380 carries if conversions are counted.
      https://www.nfl.com/players/derrick-henry/stats/career

    This is a golden in its own right and it is the one that would catch the
    filter being dropped.
    """
    r = _production_row(production, "00-0032764", 2020, "Henry 2020")
    assert_exact(int(r.rush_attempts), 378, "Henry 2020 REG carries (2-pt excluded)")
    assert_exact(int(r.rush_yards), 2027, "Henry 2020 REG rushing yards")
    assert_exact(int(r.rush_td), 17, "Henry 2020 REG rushing TD")


# ==========================================================================
# §3.2 — hand-computed cost-per-win, recomputed from the marts
# ==========================================================================

SF_2023_CASH = 258_275_910
SF_2023_WINS = 12
SF_2023_COST_PER_WIN = 21_522_992.50


def test_hand_computed_cost_per_win_2023_sf(cap, results):
    """DATA_AUDIT §3.2 — 2023 SF cost per win, recomputed end to end.

        Source A  team_season_cap    cash_spent_total = $258,275,910
        Source B  team_season_results wins            = 12
        Arithmetic $258,275,910 / 12 = $21,522,992.50  -> displayed $21.52M

    Cash, NOT cap_used_total, is the correct numerator: cap_used_total omits
    dead money and systematically flatters the worst-run teams (§6, trap 11).
    """
    c = one_row(cap, "2023 SF cap", season=2023, team="SF")
    r = one_row(results, "2023 SF results", season=2023, team="SF")

    assert_money(c.cash_spent_total, SF_2023_CASH, "§3.2 Source A cash_spent_total")
    assert_exact(int(r.wins), SF_2023_WINS, "§3.2 Source B wins")
    assert_exact(int(c.n_players), 81, "§3.2 SF 2023 n_players")

    cost_per_win = float(c.cash_spent_total) / int(r.wins)
    assert_money(cost_per_win, SF_2023_COST_PER_WIN, "§3.2 cost per win")
    assert f"${cost_per_win / 1e6:.2f}M" == "$21.52M", (
        f"§3.2 display form should be $21.52M per win, got ${cost_per_win / 1e6:.2f}M"
    )


def test_cost_per_win_uses_cash_not_cap_used(cap, results):
    """§3.2 guard — the two numerators are NOT interchangeable.

    Using cap_used_total for 2023 SF gives ~$13.83M/win against the correct
    ~$21.52M: a 36% understatement. This test pins the gap so nobody quietly
    swaps the numerator.
    """
    c = one_row(cap, "2023 SF cap", season=2023, team="SF")
    r = one_row(results, "2023 SF results", season=2023, team="SF")
    wrong = float(c.cap_used_total) / int(r.wins)
    right = float(c.cash_spent_total) / int(r.wins)
    assert wrong < right, "cap_used_total must remain below cash_spent_total"
    assert (right - wrong) / right > 0.25, (
        "the cash-vs-cap gap for 2023 SF collapsed below 25% — verify the cap mart "
        f"still excludes dead money (cash ${right:,.0f}/win vs cap ${wrong:,.0f}/win)"
    )
