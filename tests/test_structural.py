"""Structural tests — DATA_AUDIT.md §4, tests S1 through S11.

These are the invariants that hold across the whole mart, not single verified
facts. They are the tests that catch a bad ETL re-run: a dropped season, a
duplicated key, a team code that stopped normalizing, a silently truncated join.

All eleven read committed files only.
"""

from __future__ import annotations

import math

import numpy as np
import pytest

from conftest import find_mart, one_row, read_any, rel

# --------------------------------------------------------------------------
# Expected shape, from DATA_AUDIT §2 and §4
# --------------------------------------------------------------------------

SEASON_MIN, SEASON_MAX = 1999, 2025
N_TEAM_SEASONS = 861  # 31 x 3 (1999-2001) + 32 x 24 (2002-2025)
N_CAP_TEAM_SEASONS = 416  # 32 x 13 (2013-2025)
N_REG_GAMES = 6967
CAP_SEASON_MIN, CAP_SEASON_MAX = 2013, 2025

SCORE_COLUMNS = [
    "points_for",
    "points_against",
    "wins",
    "losses",
    "ties",
    "games",
]

# EPA sanity band, §4 S6. League-mean offensive EPA/play observed span is
# -0.0561 (1999) to +0.0314 (2020); no season sits near an edge.
EPA_LEAGUE_BAND = 0.15
EPA_TEAM_LIMIT = 0.5


def _expected_reg_games(season: int) -> int:
    """Era-correct REG game count. 2022 is 271, not 272 — see S8."""
    if season == 2022:
        return 271
    teams = 31 if season < 2002 else 32
    per_team = 16 if season < 2021 else 17
    return teams * per_team // 2


# ==========================================================================
# S1 — era-correct team-season completeness
# ==========================================================================


def test_s01_era_correct_team_season_completeness(results):
    """S1  861 team-seasons: 31 teams in 1999-2001, 32 from 2002 (Houston enters).

    Asserting a flat 32 x 27 here is the classic false positive — it would
    demand 3 franchises that did not exist.
    """
    assert len(results) == N_TEAM_SEASONS, (
        f"expected {N_TEAM_SEASONS} team-seasons, found {len(results)}"
    )
    assert results.season.min() == SEASON_MIN
    assert results.season.max() == SEASON_MAX
    assert results.duplicated(["season", "team"]).sum() == 0, "duplicate (season, team)"

    counts = results.groupby("season").team.nunique()
    assert list(counts.index) == list(range(SEASON_MIN, SEASON_MAX + 1)), (
        "a season is missing entirely from team_season_results"
    )
    violations = {
        int(s): int(n)
        for s, n in counts.items()
        if n != (31 if s < 2002 else 32)
    }
    assert not violations, f"era-incorrect team counts: {violations}"
    assert int(counts.sum()) == N_TEAM_SEASONS


# ==========================================================================
# S2 — zero missing REG scores, via games-count consistency
# ==========================================================================


def test_s02_zero_missing_reg_scores(results):
    """S2  No missing regular-season scores anywhere in the 861 rows.

    Checked two ways, because a null and a silently dropped game look different:

      1. Zero null cells across points_for / points_against / wins / losses /
         ties / games.
      2. Games-count consistency: sum(games)/2 equals the era-correct schedule
         length in every season, and 6,967 REG games overall. A game whose
         score was null upstream would be dropped and show up here as a team
         short of its schedule — a null check alone would not catch it.
    """
    nulls = results[SCORE_COLUMNS].isna().sum()
    assert nulls.sum() == 0, f"null score cells present:\n{nulls[nulls > 0].to_string()}"

    per_season = results.groupby("season").games.sum() / 2
    mismatches = {
        int(s): (int(actual), _expected_reg_games(int(s)))
        for s, actual in per_season.items()
        if int(actual) != _expected_reg_games(int(s))
    }
    assert not mismatches, (
        "games-count inconsistency (season: actual vs era-correct expected) — "
        f"indicates dropped or duplicated REG games: {mismatches}"
    )
    assert int(per_season.sum()) == N_REG_GAMES, (
        f"expected {N_REG_GAMES} REG games, derived {int(per_season.sum())}"
    )


# ==========================================================================
# S3 — league-wide points balance
# ==========================================================================


def test_s03_league_points_balance(results):
    """S3  Every point scored is a point allowed: sum(PF) == sum(PA) per season.

    Catches a team-code mapping error that lands a game on the wrong franchise.
    """
    pf = results.groupby("season").points_for.sum()
    pa = results.groupby("season").points_against.sum()
    off = (pf - pa)
    broken = {int(s): int(v) for s, v in off.items() if v != 0}
    assert not broken, f"points do not balance in season(s): {broken}"


# ==========================================================================
# S4 — record arithmetic closes
# ==========================================================================


def test_s04_record_arithmetic_closes(results):
    """S4  wins + losses + ties == games for all 861 rows, and win_pct counts
    ties as half a win: win_pct == (wins + 0.5*ties) / games."""
    bad = results[(results.wins + results.losses + results.ties) != results.games]
    assert bad.empty, (
        f"record does not close on {len(bad)} row(s):\n"
        f"{bad[['season', 'team', 'wins', 'losses', 'ties', 'games']].to_string(index=False)}"
    )
    derived = (results.wins + 0.5 * results.ties) / results.games
    err = (derived - results.win_pct).abs().max()
    assert err < 1e-5, f"win_pct does not treat ties as half a win (max err {err})"

    diff = results.points_for - results.points_against
    assert (diff == results.point_diff).all(), "point_diff != points_for - points_against"


# ==========================================================================
# S5 — 1:1 mart joins
# ==========================================================================


def test_s05_epa_joins_results_one_to_one(results, epa):
    """S5a EPA <-> results: 861 keys each, symmetric difference 0, no duplicates."""
    kr = set(zip(results.season, results.team))
    ke = set(zip(epa.season, epa.team))
    assert len(epa) == N_TEAM_SEASONS, f"team_season_epa has {len(epa)} rows"
    assert epa.duplicated(["season", "team"]).sum() == 0, "duplicate keys in EPA mart"
    assert kr == ke, (
        f"EPA/results key mismatch — only in results: {sorted(kr - ke)[:10]}; "
        f"only in EPA: {sorted(ke - kr)[:10]}"
    )
    merged = results.merge(epa, on=["season", "team"], how="inner", validate="1:1")
    assert len(merged) == N_TEAM_SEASONS


def test_s05_cap_joins_results_one_to_one(results, cap):
    """S5b Cap <-> results over 2013-2025: 416 keys each, symmetric difference 0.

    The cap mart is a strict subset of results: every cap row must have a
    results row (Tier 2 inside Tier 1), and every 2013-2025 results row must
    have a cap row.
    """
    assert len(cap) == N_CAP_TEAM_SEASONS, f"team_season_cap has {len(cap)} rows"
    assert cap.duplicated(["season", "team"]).sum() == 0, "duplicate keys in cap mart"
    assert cap.season.min() == CAP_SEASON_MIN and cap.season.max() == CAP_SEASON_MAX

    kc = set(zip(cap.season, cap.team))
    window = results[results.season.between(CAP_SEASON_MIN, CAP_SEASON_MAX)]
    kr = set(zip(window.season, window.team))
    assert kc == kr, (
        f"cap/results key mismatch in the Tier 2 window — only in results: "
        f"{sorted(kr - kc)[:10]}; only in cap: {sorted(kc - kr)[:10]}"
    )
    merged = window.merge(cap, on=["season", "team"], how="inner", validate="1:1")
    assert len(merged) == N_CAP_TEAM_SEASONS


# ==========================================================================
# S6 — EPA sanity band per season
# ==========================================================================


def test_s06_epa_sanity_band(epa):
    """S6  League-mean offensive EPA/play stays inside -0.15 .. +0.15 in all 27
    seasons, and no team-season exceeds |0.5|.

    A season drifting out of the band means the play filter broke — most likely
    `play_type` (it is 'run', never 'rush') or a REG/POST leak.
    """
    assert epa.isna().sum().sum() == 0, "null cells in team_season_epa"

    league = epa.groupby("season").apply(
        lambda d: d.off_epa_total.sum() / d.off_plays.sum(), include_groups=False
    )
    out = {round(float(v), 4): int(s) for s, v in league.items() if abs(v) > EPA_LEAGUE_BAND}
    assert not out, (
        f"league-mean offensive EPA/play outside +/-{EPA_LEAGUE_BAND} "
        f"(value: season) {out}; observed span should be ~-0.056 .. +0.031"
    )
    assert league.min() > -0.10 and league.max() < 0.10, (
        f"league-mean EPA/play drifted toward a band edge: "
        f"{league.min():.4f} .. {league.max():.4f}"
    )

    for col in ("off_epa_per_play", "def_epa_per_play", "epa_margin_per_play"):
        extreme = epa[epa[col].abs() > EPA_TEAM_LIMIT]
        assert extreme.empty, (
            f"{len(extreme)} team-season(s) exceed |{EPA_TEAM_LIMIT}| on {col}:\n"
            f"{extreme[['season', 'team', col]].head().to_string(index=False)}"
        )

    identity = (epa.off_epa_per_play - epa.def_epa_per_play - epa.epa_margin_per_play).abs()
    assert identity.max() < 1e-4, (
        f"epa_margin_per_play != off - def (max err {identity.max()})"
    )
    assert (epa.off_plays > 0).all() and (epa.def_plays > 0).all()


# ==========================================================================
# S7 — zero-win seasons and the display-rule guard (§4.1)
# ==========================================================================

ZERO_WIN_SEASONS = [(2008, "DET"), (2017, "CLE")]


def cost_per_win(spend: float, wins: int) -> dict:
    """Reference implementation of the DATA_AUDIT §4.1 display rule.

    > A cost-per-win figure is never rendered as infinity, "inf", "N/A", a blank,
    > or a divide error. When wins == 0, the view shows the TOTAL SPEND figure
    > with an explicit "0 wins" label and suppresses the ratio entirely. The team
    > is excluded from ratio-ranked orderings rather than sorted to either extreme.
    """
    if wins == 0:
        return {
            "state": "blank",
            "ratio": None,
            "label": f"${spend / 1e6:.1f}M spent · 0 wins",
            "rankable": False,
        }
    return {
        "state": "value",
        "ratio": spend / wins,
        "label": f"${spend / wins / 1e6:.2f}M per win",
        "rankable": True,
    }


def test_s07_zero_win_rows_exist(results):
    """S7a Exactly two zero-win team-seasons exist and both carry wins == 0.

    If these rows ever vanish, the guard below stops being exercised and the
    divide-by-zero path goes untested.
    """
    zero = results[results.wins == 0]
    found = sorted((int(r.season), r.team) for r in zero.itertuples())
    assert found == ZERO_WIN_SEASONS, (
        f"expected exactly {ZERO_WIN_SEASONS} as the zero-win team-seasons, got {found}"
    )
    for season, team in ZERO_WIN_SEASONS:
        r = one_row(results, f"{season} {team}", season=season, team=team)
        assert int(r.wins) == 0
        assert int(r.games) == 16 and int(r.losses) == 16 and int(r.ties) == 0


def test_s07_no_infinity_anywhere_cost_per_win_is_computable(cap, results):
    """S7b The display rule holds across every row where a cost-per-win could be
    computed: no inf, no NaN, no divide error — on any of the three money lenses.

    Scanned over all 416 Tier 2 team-seasons x {cash_spent_total, cap_used_total,
    team_adjusted_cap_implied}.
    """
    joined = cap.merge(results[["season", "team", "wins"]], on=["season", "team"], validate="1:1")
    assert len(joined) == N_CAP_TEAM_SEASONS

    for lens in ("cash_spent_total", "cap_used_total", "team_adjusted_cap_implied"):
        for row in joined.itertuples():
            out = cost_per_win(float(getattr(row, lens)), int(row.wins))
            if out["ratio"] is not None:
                assert math.isfinite(out["ratio"]), (
                    f"non-finite cost per win for {row.season} {row.team} on {lens}"
                )
            assert "inf" not in out["label"].lower()
            assert "nan" not in out["label"].lower()
            assert out["label"] not in ("", "N/A", "∞")


def test_s07_unguarded_division_would_break_proving_the_guard_is_load_bearing(cap, results):
    """S7c The guard is not decorative: an UNGUARDED division genuinely produces
    inf on 2017 CLE, which has both a cap row and wins == 0.

    This is the assertion the brief asks for — the marts make an unguarded
    0-win division reachable, so the rule must be enforced in code, not assumed
    away by the data.
    """
    c = one_row(cap, "2017 CLE cap", season=2017, team="CLE")
    r = one_row(results, "2017 CLE results", season=2017, team="CLE")
    assert int(r.wins) == 0

    # Scalar Python division raises. This is the ETL-side failure mode.
    with pytest.raises(ZeroDivisionError):
        _ = float(c.cash_spent_total) / int(r.wins)

    # Vectorised division does NOT raise — it silently yields inf, which then
    # serialises into the app as `Infinity`. This is the dangerous path, and it
    # is reachable from the committed marts today.
    joined = cap.merge(results[["season", "team", "wins"]], on=["season", "team"])
    cle = joined[(joined.season == 2017) & (joined.team == "CLE")]
    with np.errstate(divide="ignore", invalid="ignore"):
        unguarded = cle.cash_spent_total.to_numpy(dtype=float) / cle.wins.to_numpy(dtype=float)
    assert np.isinf(unguarded).all(), (
        "expected the unguarded vectorised division to be infinite — if it is not, "
        "the zero-win row has changed and this guard needs revisiting"
    )

    guarded = cost_per_win(float(c.cash_spent_total), int(r.wins))
    assert guarded["state"] == "blank"
    assert guarded["ratio"] is None
    assert guarded["label"] == "$151.1M spent · 0 wins", (
        f"§4.1 verbatim rendering changed: {guarded['label']!r}"
    )
    assert guarded["rankable"] is False, "a 0-win team must be excluded from ratio ranks"


def test_s07_2008_det_has_no_tier2_row_by_design(cap, results):
    """S7d 2008 DET is Tier 1 only — pre-2013, so no cap or cash row exists.

    The economics panel must show the Tier 2 boundary message, not a zero and
    not a blank (§4.1, SPEC §1.2). Asserting the row's ABSENCE is what keeps a
    well-meaning backfill from inventing a denominator.
    """
    one_row(results, "2008 DET results", season=2008, team="DET")
    sel = cap[(cap.season == 2008) & (cap.team == "DET")]
    assert sel.empty, (
        "2008 DET must have NO team_season_cap row — Tier 2 starts in 2013 and "
        "pre-2013 contract data is a biased sample of notable deals, not a roster"
    )
    assert cap.season.min() == CAP_SEASON_MIN


def test_s07_zero_win_team_excluded_from_ratio_ranking(cap, results):
    """S7e A ratio-ranked ordering excludes the 0-win team rather than sorting it
    to either extreme (§4.1)."""
    joined = cap.merge(results[["season", "team", "wins"]], on=["season", "team"])
    season_rows = joined[joined.season == 2017]
    ranked = [
        (r.team, cost_per_win(float(r.cash_spent_total), int(r.wins)))
        for r in season_rows.itertuples()
    ]
    rankable = [t for t, o in ranked if o["rankable"]]
    assert "CLE" not in rankable, "2017 CLE must be excluded from the ratio ranking"
    assert len(rankable) == 31, f"expected 31 rankable 2017 teams, got {len(rankable)}"


# ==========================================================================
# S8 — 2022 BUF/CIN 16-game exception
# ==========================================================================


def test_s08_2022_buf_cin_played_16_games(results):
    """S8  2022 had 271 REG games, not 272: BUF and CIN played 16 apiece after
    their Week 17 game was cancelled.

    Any assertion that every team plays 17 games from 2021 produces a false
    positive here. The exception is pinned to exactly those two teams so a
    genuinely dropped game elsewhere still fails.
    """
    s22 = results[results.season == 2022]
    dist = s22.games.value_counts().to_dict()
    assert dist == {17: 30, 16: 2}, f"2022 games distribution changed: {dist}"
    sixteen = sorted(s22[s22.games == 16].team)
    assert sixteen == ["BUF", "CIN"], f"2022 16-game teams should be BUF/CIN, got {sixteen}"
    assert int(s22.games.sum() / 2) == 271, "2022 must total 271 REG games"

    for season in range(2021, SEASON_MAX + 1):
        if season == 2022:
            continue
        sn = results[results.season == season]
        assert (sn.games == 17).all(), (
            f"{season} has a non-17-game team outside the documented 2022 exception"
        )


# ==========================================================================
# S9 — league cap-spend plausibility bounds
# ==========================================================================


def test_s09_cap_spend_plausibility_bounds(cap):
    """S9  Spend shares stay inside plausible bounds over all 416 team-seasons.

      cap_pct_of_league    0.5327 .. 1.0855 (median 0.8726); zero rows > 1.15
      cash_pct_of_league   0.5554 .. 1.4007 (median 0.9902); zero rows outside 0.5-1.5
      cap_pct_of_adjusted  0.5107 .. 0.9645

    Cap share above 1.15 means the `cols` replication trap (§6, trap 1) got
    through and team totals are inflated 3-7x in dollars that look real.
    """
    assert len(cap) == N_CAP_TEAM_SEASONS

    over = cap[cap.cap_pct_of_league > 1.15]
    assert over.empty, (
        f"{len(over)} team-season(s) with cap share > 1.15 — suspect the `cols` "
        f"replication trap:\n{over[['season', 'team', 'cap_pct_of_league']].head().to_string(index=False)}"
    )
    bad_cash = cap[(cap.cash_pct_of_league < 0.5) | (cap.cash_pct_of_league > 1.5)]
    assert bad_cash.empty, (
        f"{len(bad_cash)} team-season(s) with cash share outside 0.5-1.5:\n"
        f"{bad_cash[['season', 'team', 'cash_pct_of_league']].head().to_string(index=False)}"
    )
    assert (cap.cap_pct_of_adjusted <= 1.0).all(), (
        "cap_pct_of_adjusted above 1.0 — a team cannot exceed its own adjusted cap"
    )
    assert 0.85 <= cap.cap_pct_of_league.median() <= 0.90
    assert 0.95 <= cap.cash_pct_of_league.median() <= 1.03

    assert cap.league_cap.notna().all(), "league_cap must join non-null on all 416 rows"
    assert (cap.n_players > 0).all()

    # Designed nulls: dead money is NOT derivable from this source (SPEC §7.3).
    assert cap.dead_money_total.notna().sum() == 0, (
        "team_season_cap.dead_money_total must be null on every row — dead money "
        "comes from dead_money_team_season (SPEC §7.5), never from here"
    )
    assert cap.dead_money_pct.notna().sum() == 0

    # unaccounted_vs_adjusted is an UPPER BOUND on dead money, never a value.
    assert (cap.unaccounted_vs_adjusted >= 0).all(), (
        "unaccounted_vs_adjusted went negative — it is an upper bound, not a residual "
        "that may flip sign"
    )


# ==========================================================================
# S10 — coaching completeness
# ==========================================================================


def test_s10_coaching_completeness(coaching):
    """S10 2,612 rows over 830 team-seasons (26 x 32 minus HOU 2000-01), with
    HC/OC/DC filled for every one.

    'NONE' is a sentinel for a genuinely unfilled title (60 rows), not a person,
    and coach_name is NOT a safe join key — three father/son collisions were
    resolved by hand.
    """
    assert len(coaching) == 2612, f"coaching_staff has {len(coaching)} rows"
    assert coaching.groupby(["season", "team"]).ngroups == 830
    assert coaching.season.min() == 2000 and coaching.season.max() == 2025
    assert set(coaching.role.unique()) == {"HC", "OC", "DC"}, (
        f"roles must be confined to HC/OC/DC, found {sorted(coaching.role.unique())}"
    )

    roles = coaching.groupby(["season", "team"]).role.agg(set)
    missing = roles[roles.apply(lambda s: not {"HC", "OC", "DC"}.issubset(s))]
    assert missing.empty, f"{len(missing)} team-season(s) missing a role: {list(missing.index)[:5]}"

    assert not coaching.coach_name.isna().any(), "blank coach_name"
    assert (coaching.coach_name.str.strip() != "").all(), "empty coach_name"
    assert not coaching.source_url.isna().any(), "blank source_url"
    assert coaching.source_url.str.startswith("http").all(), "non-URL source_url"
    assert (coaching.coach_name == "NONE").sum() == 60, (
        "the NONE sentinel count changed — it marks a genuinely unfilled title"
    )
    # Houston enters in 2002; era-correct codes are preserved in the curated source.
    assert coaching[(coaching.team == "HOU")].season.min() == 2002


# ==========================================================================
# S11 — dead-money coverage shape and as-of discipline
# ==========================================================================

FULL32_SEASONS = [2014, 2015, 2017, 2018, 2019, 2022, 2023, 2024, 2025]
PARTIAL_SEASONS = {2013: 5, 2016: 8, 2020: 5, 2021: 10}
VALID_STAGES = {"preseason", "midseason", "late_season", "final"}
VALID_COVERAGE = {"full32", "partial", "top5"}

# The only (season, stage, coverage) group in the committed data that resolves to
# more than one as-of date. Pinned as a regression guard, and reported as a
# genuine defect — see tests/README.md.
KNOWN_STAGE_AMBIGUITY = {(2018, "preseason", "full32"): ["2018-03-01", "2018-07-14"]}


def test_s11_dead_money_coverage_shape(dm_team_season):
    """S11a 370 rows over 316 distinct team-seasons; 9 full-32 seasons and 4
    partial; no season in 2013-2025 has zero rows."""
    dm = dm_team_season
    assert len(dm) == 370, f"dead_money_team_season has {len(dm)} rows"
    assert dm.groupby(["season", "team"]).ngroups == 316
    assert dm.season.min() == 2013 and dm.season.max() == 2025

    seasons_present = set(dm.season.unique())
    assert seasons_present == set(range(2013, 2026)), (
        f"no season in 2013-2025 may have zero rows; missing "
        f"{sorted(set(range(2013, 2026)) - seasons_present)}"
    )

    full32 = sorted(
        int(s)
        for s, g in dm.groupby("season")
        if (g.coverage == "full32").any() and g[g.coverage == "full32"].team.nunique() == 32
    )
    assert full32 == FULL32_SEASONS, f"full-32 seasons changed: {full32}"

    for season, n_teams in PARTIAL_SEASONS.items():
        g = dm[dm.season == season]
        assert g.team.nunique() == n_teams, (
            f"{season} should publish exactly {n_teams} teams, found {g.team.nunique()} — "
            "a leaders-only list must never be rendered as a 32-team view"
        )
        assert (g.coverage != "full32").all(), f"{season} must not be flagged full32"


def test_s11_every_row_has_asof_date_and_stage(dm_team_season):
    """S11b As-of discipline: every row carries a non-null asof_date and
    asof_stage, both drawn from the declared vocabularies (SPEC §7.5).

    Dead money accrues monotonically through a league year and each season's
    snapshot was taken at a different point. A row without its date is a row
    that cannot be rendered honestly, so it fails the build.
    """
    dm = dm_team_season
    assert dm.asof_date.notna().all(), "asof_date is NOT NULL — a row without it fails the build"
    assert dm.asof_stage.notna().all(), "asof_stage is NOT NULL"
    assert dm.asof_date.str.fullmatch(r"\d{4}-\d{2}-\d{2}").all(), "asof_date must be ISO yyyy-mm-dd"

    stages = set(dm.asof_stage.unique())
    assert stages <= VALID_STAGES, f"unexpected asof_stage value(s): {stages - VALID_STAGES}"
    coverage = set(dm.coverage.unique())
    assert coverage <= VALID_COVERAGE, f"unexpected coverage value(s): {coverage - VALID_COVERAGE}"

    assert dm.source_url.notna().all() and dm.source_url.str.startswith("http").all(), (
        "every dead-money row carries a per-row citation"
    )
    assert (dm.dead_money_usd >= 0).all()

    # The as-of date must fall inside the league year it describes (Feb of the
    # season through Mar of the following one, allowing late-published tables).
    yr = dm.asof_date.str.slice(0, 4).astype(int)
    assert ((yr >= dm.season) & (yr <= dm.season + 2)).all(), (
        "an asof_date falls outside a plausible window for its season"
    )


def test_s11_grain_is_unique_on_season_team_asof_date(dm_team_season):
    """S11c The declared grain (season, team, asof_date) is unique (SPEC §7.5).

    Multiple rows per (season, team) are EXPECTED and correct — 370 rows over
    316 team-seasons — because they are individually dated readings, never to be
    averaged, merged, or connected by a line.
    """
    dm = dm_team_season
    dupes = dm[dm.duplicated(["season", "team", "asof_date"], keep=False)]
    assert dupes.empty, (
        "the declared grain (season, team, asof_date) is not unique:\n"
        f"{dupes[['season', 'team', 'asof_date', 'dead_money_usd']].to_string(index=False)}"
    )
    assert dm.groupby(["season", "team"]).size().max() > 1, (
        "multi-snapshot team-seasons disappeared — the dated-reading semantics rely on them"
    )


def test_s11_stage_is_not_a_unique_selector_known_ambiguity_is_pinned(dm_team_season):
    """S11d asof_stage does NOT uniquely identify a snapshot, and the one place
    where that bites is pinned here.

    2018 carries two full-32 snapshots both tagged `preseason` — 2018-03-01
    ($155.2M league-wide) and 2018-07-14 ($348.5M), a 2.25x swing. `coverage`
    does not disambiguate them because both are full32, so any "same-stage"
    resolution (SPEC §7.4) is non-deterministic for 2018 unless it also
    tie-breaks on date.

    This test asserts the ambiguity is exactly where it is documented to be. A
    NEW ambiguous group appearing anywhere else fails the build, because it
    would silently change which snapshot Cap+ resolves to.

    See tests/README.md — reported as a genuine data/spec defect, not papered over.
    """
    dm = dm_team_season
    grouped = dm.groupby(["season", "asof_stage", "coverage"]).asof_date.nunique()
    ambiguous = {
        (int(s), stage, cov): sorted(
            dm[(dm.season == s) & (dm.asof_stage == stage) & (dm.coverage == cov)]
            .asof_date.unique()
        )
        for (s, stage, cov), n in grouped.items()
        if n > 1
    }
    assert ambiguous == KNOWN_STAGE_AMBIGUITY, (
        "the set of stage-ambiguous snapshot groups changed.\n"
        f"  expected: {KNOWN_STAGE_AMBIGUITY}\n"
        f"  found:    {ambiguous}\n"
        "A new group here means a `same-stage` snapshot selector now has an "
        "undocumented tie-break. Resolve it explicitly before updating this test."
    )
    # The 2019 pair is NOT ambiguous: coverage separates full32 from partial.
    s19 = dm[dm.season == 2019]
    assert s19[s19.coverage == "full32"].asof_date.nunique() == 1


def test_s11_marquee_ledger_shape(dm_ledger):
    """S11e The marquee ledger: 21 charges, 20 players, 15 teams, all is_actual,
    with the one deliberately blank split preserved.

    Dareus/BUF has a NULL split_by_season because sources conflict and it was
    not guessed. Filling that null with a plausible number is a defect.
    """
    dl = dm_ledger
    assert len(dl) == 21, f"dead_money_ledger has {len(dl)} rows"
    assert dl.player.nunique() == 20
    assert dl.team.nunique() == 15
    assert dl.is_actual.astype(bool).all(), "all 21 ledger rows are is_actual"
    assert dl.source_url.str.startswith("http").all()
    assert (dl.total_usd > 0).all()

    blank = dl[dl.split_by_season.isna()]
    assert len(blank) == 1, f"expected exactly 1 deliberately blank split, found {len(blank)}"
    assert blank.iloc[0].team == "BUF" and "Dareus" in blank.iloc[0].player, (
        "the blank split must remain the Dareus/BUF row — sources conflict and it "
        "was not guessed"
    )

    # Single-season charges store the bare number; multi-season charges store a
    # '/'-joined split that reconciles to the total.
    for row in dl[dl.split_by_season.notna()].itertuples():
        parts = [int(p) for p in str(row.split_by_season).split("/")]
        assert sum(parts) == int(row.total_usd), (
            f"{row.player}/{row.team}: split {row.split_by_season} does not sum to "
            f"total_usd {row.total_usd}"
        )


def test_s11_ledger_charges_are_contained_by_team_totals(dm_ledger, dm_team_season):
    """S11f Cross-check: an individual charge must be a COMPONENT of its team's
    total for the same season, never larger than it.

    DEN 2024 team total is $85,210,000 (as-of 2024-11-27) against Wilson's
    $53,000,000; DEN 2025 is $42,780,000 against $32,000,000. Both containments
    hold with room for other charges, which is the expected shape (§3.1).
    """
    wilson = dm_ledger[(dm_ledger.player == "Russell Wilson") & (dm_ledger.team == "DEN")].iloc[0]
    y2024, y2025 = (int(p) for p in str(wilson.split_by_season).split("/"))

    for season, charge in ((2024, y2024), (2025, y2025)):
        team_rows = dm_team_season[
            (dm_team_season.season == season) & (dm_team_season.team == "DEN")
        ]
        assert len(team_rows) >= 1, f"no DEN {season} team-season dead-money row"
        total = int(team_rows.dead_money_usd.max())
        assert charge <= total, (
            f"Wilson's DEN {season} charge ${charge:,} exceeds the team total "
            f"${total:,} — containment must hold"
        )
        assert charge / total > 0.4, (
            f"Wilson's DEN {season} charge should be the bulk of the team total; "
            f"got {charge / total:.1%}"
        )
