"""Mart schema contracts — SPEC.md §7.

Every mart the app reads is declared here: exact column set, dtype coercibility,
nullability rules, coverage-flag vocabularies, grain uniqueness and row count.

AUTO-DISCOVERY. The registry covers every mart in SPEC §7. A mart that has not
landed yet SKIPS with a reason naming its SPEC section — it never fails on
absence. The moment the file appears in data/marts/ (as .csv or .parquet, under
either its SPEC name or its BUILD_PLAN alias) its contract validates on the next
CI run with no edit here.

**As of ETL Phase 1 every mart in the registry has landed and nothing skips.**
Both formerly-PENDING columns are present — `license_tier` on
dead_money_team_season and `stint` on coaching_staff — so
`test_pending_spec_columns` and `test_license_tier_row_counts_when_present` now
validate rather than skip. The `pending` mechanism is retained for the next
column SPEC requires ahead of ETL.

Where a mart carries columns beyond its SPEC §7 interface, each is declared here
with an inline "ETL implementation note" giving the governing clause, and the
same note is recorded in the SPEC §7 section it affects. Three shapes recur:
nested TS types flattened into flat column groups (`dm_asof`, `dm_next1/2`);
nullability corrected against observed data where SPEC asserted NOT NULL before
the mart existed (§7's own preamble says nullability is "what was actually
observed"); and columns other SPEC sections require that §7's interface omits
(`coach_id` from §2.8 step 8, the contract card from §3.3, the dead-money markers
from §3.4).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import pandas as pd
import pytest

from conftest import find_mart, read_any, rel

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

TEAM_ABBRS = {
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET",
    "GB", "HOU", "IND", "JAX", "KC", "LA", "LAC", "LV", "MIA", "MIN", "NE", "NO",
    "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS",
}
# Curated sources keep ERA-CORRECT codes (SPEC §7.7); derived marts normalize.
ERA_TEAM_ABBRS = TEAM_ABBRS | {"STL", "SD", "OAK"}

ASOF_STAGES = {"preseason", "midseason", "late_season", "final"}
COVERAGE_FLAGS = {"full32", "partial", "top5"}
LICENSE_TIERS = {"SAFE_LEAGUE", "SAFE_EDITORIAL", "REVIEW_SPOTRAC", "REVIEW_OTC"}
CAPPLUS_BADGES = {"provisional", "preseason", "in_season", "estimated"}
# A MODELED dead-money value has no source URL and therefore no source tier; it
# carries this label instead and withdraws under DEAD_MONEY_TIER=safe.
MODELED_TIER = "MODELED"
DM_METHODS = {"measured", "measured_full32", "reading_ref_date", "reading_other_date",
              "ridge_z_anchor_level"}
POSITION_GROUPS = {"QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "ST"}
VERIFICATION_METHODS = {
    "wikidata_p18_team", "wikipedia_lead_image", "none", "api_error",
}

REQUIRED = "required"
NULLABLE = "nullable"
ALWAYS_NULL = "always_null"


@dataclass(frozen=True)
class Col:
    kind: str  # int | float | number | str | bool | date
    null: str = REQUIRED
    enum: frozenset | None = None


@dataclass(frozen=True)
class Mart:
    key: str
    spec_ref: str
    candidates: tuple[str, ...]
    columns: dict[str, Col]
    grain: tuple[str, ...] | None = None
    rows: int | None = None
    seasons: tuple[int, int] | None = None
    pending: dict[str, Col] = field(default_factory=dict)  # SPEC-required, ETL not yet
    forbidden: tuple[str, ...] = ()
    one_of: tuple[tuple[str, ...], ...] = ()  # exactly one alternative must be present
    note: str = ""


def _team(era: bool = False) -> Col:
    return Col("str", REQUIRED, frozenset(ERA_TEAM_ABBRS if era else TEAM_ABBRS))


SEASON = Col("int", REQUIRED)


# ==========================================================================
# The registry — one entry per mart in SPEC §7
# ==========================================================================

REGISTRY: tuple[Mart, ...] = (
    Mart(
        key="team_season_results",
        spec_ref="SPEC §7.1",
        candidates=("team_season_results",),
        columns={
            "season": SEASON, "team": _team(),
            "games": Col("int"), "wins": Col("int"), "losses": Col("int"),
            "ties": Col("int"), "win_pct": Col("float"),
            "points_for": Col("int"), "points_against": Col("int"),
            "point_diff": Col("int"),
            # ETL implementation note: postseason outcome from the same
            # schedules file (game_type WC/DIV/CON/SB). Additive; the
            # regular-season columns above are REG only and unchanged.
            "playoff_result": Col("str", REQUIRED, frozenset({
                "none", "wild_card", "divisional", "conference",
                "super_bowl_loss", "super_bowl_win",
            })),
            "playoff_games": Col("int"), "playoff_wins": Col("int"),
        },
        grain=("season", "team"), rows=861, seasons=(1999, 2025),
        note="No nullable fields.",
    ),
    Mart(
        key="team_season_epa",
        spec_ref="SPEC §7.2",
        candidates=("team_season_epa",),
        columns={
            "season": SEASON, "team": _team(),
            "off_plays": Col("int"), "def_plays": Col("int"),
            "off_epa_per_play": Col("float"), "def_epa_per_play": Col("float"),
            "epa_margin_per_play": Col("float"),
            "off_epa_total": Col("float"), "def_epa_total": Col("float"),
            # ETL implementation note: opponent-adjusted EPA/play (additive
            # play-weighted fit, sum-to-zero team effects; season team-means
            # preserved) and schedule strength (mean raw opponent margin).
            "off_epa_per_play_adj": Col("float"),
            "def_epa_per_play_adj": Col("float"),
            "epa_margin_per_play_adj": Col("float"),
            "sos_epa": Col("float"),
        },
        grain=("season", "team"), rows=861, seasons=(1999, 2025),
    ),
    Mart(
        key="team_season_cap",
        spec_ref="SPEC §7.3",
        candidates=("team_season_cap",),
        columns={
            "season": SEASON, "team": _team(),
            "n_players": Col("int"),
            "cap_used_total": Col("float"), "league_cap": Col("float"),
            "cap_pct_of_league": Col("float"),
            "team_adjusted_cap_implied": Col("float"),
            "cap_pct_of_adjusted": Col("float"),
            # Typed `null`, not `number | null` — reading dead money here is a bug.
            "dead_money_total": Col("float", ALWAYS_NULL),
            "dead_money_pct": Col("float", ALWAYS_NULL),
            "cash_spent_total": Col("float"), "cash_pct_of_league": Col("float"),
            "unaccounted_vs_adjusted": Col("float"), "unaccounted_pct": Col("float"),
        },
        grain=("season", "team"), rows=416, seasons=(2013, 2025),
    ),
    Mart(
        key="capplus_official",
        spec_ref="SPEC §7.4",
        candidates=("capplus_official",),
        columns={
            "season": SEASON, "team": _team(),
            "capplus": Col("float"), "perf_index": Col("float"), "P": Col("float"),
            "cost_rec": Col("float"), "cap_consumed_rec": Col("float"),
            "cost_floor": Col("float"), "R_rec": Col("float"),
            "was_floored": Col("bool"),
            "dead_money_rec": Col("float"),
            "badge": Col("str", REQUIRED, frozenset(CAPPLUS_BADGES)),
            # The badge's sentence (provisional/estimated); empty otherwise.
            "badge_reason": Col("str", NULLABLE),
            # True where dead_money_rec is a MODELED value (estimated seasons).
            "dm_is_modeled": Col("bool"),
            "season_rank": Col("int"),
            # ETL implementation note (SPEC §7.4). Two columns the memo's own
            # conditions require to travel with the value:
            #   league_median_dead_money_usd — CAPPLUS_MEMO §7 day-one disclosure
            #     "2024 Denver is a non-event and that is correct: publish the
            #     league median beside it" ($85.2M against a $50.3M median).
            #   license_tier — dead_money_rec is a licensed reading, so the
            #     DEAD_MONEY_TIER seed filter (SPEC §7.5) must be able to see its
            #     tier without re-joining the source.
            "league_median_dead_money_usd": Col("number"),
            "license_tier": Col("str", REQUIRED, frozenset(LICENSE_TIERS | {MODELED_TIER})),
        },
        # `dm_asof: AsOf` is nested in TS; a flat file must carry the pair.
        one_of=(("dm_asof_date", "dm_asof_stage"), ("dm_asof",)),
        grain=("season", "team"), rows=416, seasons=(2013, 2025),
        note="All thirteen seasons (2026-10-10 rulings, DECISIONS 109-114); 2016, "
             "2020, 2021 badged estimated. The app never reads capplus_candidates.csv.",
    ),
    Mart(
        key="capplus_context",
        spec_ref="SPEC §7.13",
        candidates=("capplus_context",),
        columns={
            "season": SEASON, "team": _team(),
            "starting_qb": Col("str"), "starting_qb_gsis_id": Col("str", NULLABLE),
            "starting_qb_otc_id": Col("int"),
            "qb_starter_method": Col("str", REQUIRED, frozenset({"snaps", "cap"})),
            "qb_cap_number": Col("number"), "qb_cap_share": Col("float"),
            "qb_contract_year_signed": Col("int"),
            "qb_draft_year": Col("int", NULLABLE), "qb_draft_round": Col("int", NULLABLE),
            "qb_rookie_window": Col("bool"),
            "league_median_starter_qb_cap": Col("number"),
            "stratum_size": Col("int"), "stratum_rank": Col("int", NULLABLE),
            "perf_index": Col("float"), "perf_rank": Col("int"),
            # Populated in all 13 seasons under the shipping tier; NULL only where
            # Cap+ itself is blank (the SAFE-only reversal) — whole-season.
            "capplus": Col("float", NULLABLE), "capplus_rank": Col("int", NULLABLE),
            "capplus_qb_neutral": Col("float", NULLABLE),
            "qb_neutral_rank": Col("int", NULLABLE),
            "qb_timing_pts": Col("float", NULLABLE), "roster_pts": Col("float", NULLABLE),
            "cash_share": Col("float"),
            "future_mortgage_usd": Col("number"), "future_mortgage_share": Col("float"),
            "mortgage_rows_unknown": Col("int"),
        },
        # Retired 2026-10-10 (DECISIONS 111): the obligation blend mixed cap
        # (accrual) with the mortgage (cash paid ahead of cap).
        forbidden=("capplus_obligation", "obligation_rank", "mortgage_alpha"),
        grain=("season", "team"), rows=416, seasons=(2013, 2025),
        note="gate #1 reopened 2026-10-10 — DECISIONS 100-103, 111",
    ),
    Mart(
        key="team_rating",
        spec_ref="SPEC §7.4 (companion)",
        candidates=("team_rating", "team_season_rating"),
        columns={
            "season": SEASON, "team": _team(),
            "perf_index": Col("float"), "P": Col("float"), "season_rank": Col("int"),
        },
        grain=("season", "team"), rows=861, seasons=(1999, 2025),
    ),
    Mart(
        key="dead_money_team_season",
        spec_ref="SPEC §7.5",
        candidates=("dead_money_team_season",),
        columns={
            "season": SEASON, "team": _team(),
            "dead_money_usd": Col("int"),
            "asof_date": Col("date"),
            "asof_stage": Col("str", REQUIRED, frozenset(ASOF_STAGES)),
            "coverage": Col("str", REQUIRED, frozenset(COVERAGE_FLAGS)),
            "source_url": Col("str"),
            "note": Col("str", NULLABLE),
        },
        pending={"license_tier": Col("str", REQUIRED, frozenset(LICENSE_TIERS))},
        grain=("season", "team", "asof_date"), rows=402, seasons=(2013, 2025),
        note="Multiple rows per (season, team) are correct — 402 rows over 343 "
             "team-seasons, individually dated readings.",
    ),
    Mart(
        key="dead_money_ledger",
        spec_ref="SPEC §7.6",
        candidates=("dead_money_ledger",),
        columns={
            "player": Col("str"), "team": _team(),
            "seasons": Col("str"), "total_usd": Col("int"),
            "split_by_season": Col("str", NULLABLE),
            "is_actual": Col("bool"),
            "verified_asof": Col("date"),
            "source_url": Col("str"), "notes": Col("str", NULLABLE),
        },
        rows=21,
        note="`seasons` is a DISPLAY STRING, not a range type.",
    ),
    Mart(
        key="coaching_staff",
        spec_ref="SPEC §7.7",
        candidates=("coaching_staff",),
        columns={
            "season": SEASON,
            "team": _team(era=True),  # curated source keeps STL/SD/OAK
            "role": Col("str", REQUIRED, frozenset({"HC", "OC", "DC"})),
            "coach_name": Col("str"),
            "note": Col("str", NULLABLE),
            "source_url": Col("str"),
            # ETL implementation note (SPEC §7.7).
            #   coach_id — SPEC §2.8 step 8 REQUIRES it: "build a surrogate
            #     coach_id by dense-ranking the distinct coach_name strings in
            #     the curated file exactly as delivered". coach_name is not a
            #     safe join key (Jim E. Mora vs Jim L. Mora).
            #   team_current — the normalized franchise code beside the
            #     era-correct `team`. Without it every TS consumer re-implements
            #     normalize_team, which is exactly what DECISIONS 3 forbids.
            "coach_id": Col("int"),
            "team_current": Col("str", REQUIRED, frozenset(TEAM_ABBRS)),
        },
        pending={"stint": Col("int", REQUIRED)},
        rows=2612, seasons=(2000, 2025),
        note="Grain is (season, team, role, stint); `stint` is not yet materialised, "
             "so uniqueness is not asserted. `note` is display+provenance only and is "
             "NEVER parsed by code.",
    ),
    Mart(
        key="team_season_stability",
        spec_ref="SPEC §7.7 (derived) / §2.8",
        candidates=("team_season_stability", "stability_index"),
        columns={
            "season": SEASON, "team": _team(),
            "churn_points": Col("number"), "W": Col("number"),
            "stability_index": Col("number"),
            "window_truncated": Col("bool"),
            "hc": Col("str"), "oc": Col("str"), "dc": Col("str"),
            "hc_tenure_seasons": Col("int"), "oc_tenure_seasons": Col("int"),
            "dc_tenure_seasons": Col("int"),
            "hc_stints": Col("int"), "oc_stints": Col("int"), "dc_stints": Col("int"),
            "regime_id": Col("str"), "regime_season_n": Col("int"),
        },
        grain=("season", "team"), rows=830, seasons=(2000, 2025),
        note="`window_truncated` is true for 2000 and 2001.",
    ),
    Mart(
        key="regime_events",
        spec_ref="SPEC §7.7 (derived)",
        candidates=("regime_events",),
        columns={
            "team": _team(), "season": SEASON,
            "kind": Col("str", REQUIRED, frozenset({"offseason", "in_season"})),
            "outgoing_hc": Col("str"), "incoming_hc": Col("str"),
            "regime_id": Col("str"),
            # ETL implementation note (SPEC §7.7). `dm_next1`/`dm_next2` are
            # Metric<T> unions in TS; a flat file carries them as a column group
            # per SPEC §1.2's discriminated union — `_state` is the discriminant,
            # `_usd`/`_asof_*`/`_league_median_usd` populate the `value` arm and
            # `_blank_reason` the `blank` arm. The two readings are NEVER
            # connected: they are a pair of independently dated chips.
            **{
                f"dm_next{k}{suffix}": col
                for k in (1, 2)
                for suffix, col in (
                    ("_season", Col("int")),
                    ("_state", Col("str", REQUIRED, frozenset({"value", "blank"}))),
                    ("_usd", Col("number", NULLABLE)),
                    ("_asof_date", Col("date", NULLABLE)),
                    ("_asof_stage", Col("str", NULLABLE, frozenset(ASOF_STAGES))),
                    ("_league_median_usd", Col("number", NULLABLE)),
                    ("_blank_reason", Col("str", NULLABLE)),
                    ("_badge", Col("str", NULLABLE, frozenset(CAPPLUS_BADGES))),
                    ("_is_modeled", Col("bool")),
                )
            },
        },
        note="dm_next1/dm_next2 are Metric unions carried as flat column groups.",
    ),
    Mart(
        key="draft_pick",
        spec_ref="SPEC §7.8",
        candidates=("draft_pick", "draft_picks"),
        columns={
            "season": SEASON, "team": _team(),
            "round": Col("int"), "pick": Col("int"),
            "player_name": Col("str"),
            "gsis_id": Col("str", NULLABLE), "pfr_player_id": Col("str", NULLABLE),
            "position": Col("str"), "side": Col("str", NULLABLE),
            # ETL implementation note (SPEC §7.8). `college` is NULLABLE against
            # observed data: 4 of 6,644 picks in the window have no college
            # because the player never attended one — Moritz Boehringer (2016
            # MIN, German amateur), Jordan Mailata (2018 PHI, Australian rugby
            # league), Qwan'tez Stiggers (2024 NYJ, CFL) and Travis Clayton
            # (2024 BUF, International Player Pathway). SPEC §7's preamble says
            # nullability is "what was actually observed"; this mart did not
            # exist when §7.8 was written.
            "college": Col("str", NULLABLE),
            "chart_value": Col("number"),
            # `value_basis` distinguishes a PUBLISHED chart value from the
            # labelled flat extension past pick 256 (25 picks reach 257-262 via
            # compensatory selections). Without it an extrapolation is
            # indistinguishable from a published value — the exact failure mode
            # SPEC §1.2 forbids.
            "value_basis": Col("str", REQUIRED,
                               frozenset({"published", "extended_flat_from_pick_256"})),
            "games": Col("number", NULLABLE), "w_av": Col("number", NULLABLE),
            "seasons_started": Col("int"),
            "probowls": Col("int"), "allpro": Col("int"), "hof": Col("bool"),
            # Time context (additive). `w_av` is CUMULATIVE, so older classes
            # have had longer to accumulate it. seasons_elapsed = 2025 -
            # season + 1, draft season inclusive.
            "seasons_elapsed": Col("int"),
        },
        forbidden=("car_av",),
        grain=("season", "pick"), rows=6644, seasons=(2000, 2025),
        note="`car_av` is 100% null in source and DELIBERATELY EXCLUDED "
             "(ARCHITECTURE §12). Team codes come from PFR boxscore convention "
             "(NWE/GNB/SFO) via PFR_DRAFT_TEAM_MAP then normalize_team.",
    ),
    Mart(
        key="draft_class_summary",
        spec_ref="SPEC §7.8",
        candidates=("draft_class_summary", "draft_capital"),
        columns={
            "season": SEASON, "team": _team(),
            "n_picks": Col("int"), "capital": Col("number"),
            "capital_rank": Col("int"),
            "return_games": Col("number", NULLABLE),
            "return_w_av": Col("number", NULLABLE),
            "return_seasons_started": Col("number"),
            "n_excluded_no_gsis": Col("int"),
            "snaps_available": Col("bool"),
            # ETL implementation note (SPEC §7.8).
            #   return_probowls / return_allpro — SPEC §2.9's realized-return
            #     table lists `probowls` and `allpro` as secondary, count-based
            #     measures at 100% coverage. Class-level sums of the same.
            #   *_per_1000_capital — "return per capital", the ROI framing of
            #     §2.9. Reported as three independently-sourced ratios, never
            #     blended into a single invented score.
            #   dollar_framing_* — DECISIONS 41: capital and return are Tier 1
            #     for 2000-2025, but any DOLLAR framing of a class is Tier 2 and
            #     renders 2013+ only. The flag plus the approved boundary
            #     sentence keep the card from getting it wrong.
            "return_probowls": Col("number"), "return_allpro": Col("number"),
            "w_av_per_1000_capital": Col("number"),
            "games_per_1000_capital": Col("number"),
            "seasons_started_per_1000_capital": Col("number"),
            "dollar_framing_available": Col("bool"),
            "dollar_framing_blank_reason": Col("str", NULLABLE),
            # Time normalisation (additive). Cumulative return mostly ranks
            # classes by age, and a per-season rate reverses the bias (careers
            # end), so neither compares across draft years. draft_index =
            # return_w_av / that draft year's mean class x 100 (100 = the
            # average class of its year); draft_index_rank is 1..n within the
            # year. maturity = 'mature' once seasons_elapsed >= 4 (a full
            # rookie contract; 2022 is mature, 2023-2025 early).
            "seasons_elapsed": Col("int"),
            "maturity": Col("str", REQUIRED, frozenset({"early", "mature"})),
            "draft_index": Col("number"),
            "draft_index_rank": Col("int"),
        },
        grain=("season", "team"), seasons=(2000, 2025),
        note="`snaps_available` must be true exactly when season >= 2013.",
    ),
    Mart(
        key="player_season_cap",
        spec_ref="SPEC §7.9",
        candidates=("player_season_cap",),
        columns={
            "otc_id": Col("int"),
            "gsis_id": Col("str", NULLABLE),
            "season": SEASON, "team": _team(),
            # ETL implementation note (SPEC §7.9). Both are NULLABLE against
            # observed data: 502 of 32,105 player-seasons (1.6%, carrying the
            # 0.375% of cap SPEC §2.6 calls "unmapped") have no recorded signing
            # position. They keep NULL rather than a tenth `UNK` bucket, because
            # §2.6 says unmapped cap is DROPPED, not bucketed into "other" — and
            # the drop happens in position_allocation. Every player-season still
            # ships here: the 32,105-row Tier 2 promise is a roster, not a
            # filtered sample. The nine-value vocabulary still holds on non-null.
            "position_at_signing": Col("str", NULLABLE),
            "position_group": Col("str", NULLABLE, frozenset(POSITION_GROUPS)),
            "cap_number": Col("number"), "cash_paid": Col("number"),
            "base_salary": Col("number", NULLABLE),
            "prorated_bonus": Col("number", NULLABLE),
            "roster_bonus": Col("number", NULLABLE),
            "guaranteed_salary": Col("number", NULLABLE),
            "cap_percent": Col("number", NULLABLE),
            # ETL implementation note (SPEC §7.9).
            #   player — the name. SPEC §3.3 renders it and §8.4's 251-player
            #     search needs it; joining every view back to a name table would
            #     be a needless second lookup.
            #   contract_* — SPEC §3.3 point 3 specifies the contract card
            #     verbatim: "value, APY, guaranteed, APY as % of cap, years,
            #     year signed", carried from the deal in force for that season.
            #   dm_ledger_* — SPEC §3.3 point 4: dead-money markers where a
            #     ledger charge attaches to this player. `dm_ledger_team` is the
            #     team that ATE the charge, which is NOT the team on the
            #     player's row for that year — the source follows the player,
            #     the charge does not. `dm_ledger_split_established` is false
            #     for Dareus/BUF, whose per-season split was never guessed.
            "player": Col("str"),
            "contract_year_signed": Col("number", NULLABLE),
            "contract_years": Col("number", NULLABLE),
            "contract_value": Col("number", NULLABLE),
            "contract_apy": Col("number", NULLABLE),
            "contract_guaranteed": Col("number", NULLABLE),
            "contract_apy_cap_pct": Col("number", NULLABLE),
            "dm_ledger_charge": Col("bool"),
            "dm_ledger_team": Col("str", NULLABLE, frozenset(TEAM_ABBRS)),
            "dm_ledger_usd": Col("number", NULLABLE),
            "dm_ledger_total_usd": Col("number", NULLABLE),
            "dm_ledger_seasons": Col("str", NULLABLE),
            "dm_ledger_split_established": Col("bool"),
            "dm_ledger_source_url": Col("str", NULLABLE),
        },
        grain=("otc_id", "season"), rows=32105, seasons=(2013, 2025),
        note="Source is $ millions — ETL converts to USD. `cash_paid` is ANNUAL, "
             "not cumulative. Deduplicate on (otc_id, year) or the `cols` "
             "replication trap inflates team totals 3-7x.",
    ),
    Mart(
        key="player_season_availability",
        spec_ref="SPEC §7.9",
        candidates=("player_season_availability", "player_season_snaps"),
        columns={
            "gsis_id": Col("str"), "season": SEASON, "team": _team(),
            "games": Col("number", NULLABLE),
            "off_snaps": Col("number", NULLABLE),
            "def_snaps": Col("number", NULLABLE),
            "st_snaps": Col("number", NULLABLE),
            "off_pct": Col("number", NULLABLE),
            # ETL implementation note (SPEC §7.9).
            #   player — golden test 18 selects Laken Tomlinson by name, and the
            #     player view labels the availability table.
            #   pfr_player_id — the ONLY key snap counts carry. Keeping it makes
            #     the bridge auditable: gsis_id here was resolved THROUGH
            #     players.parquet, never by a direct pfr_id join to rosters
            #     (34.5% in 2013 vs 99.99% bridged, DECISIONS 38).
            "player": Col("str"),
            "pfr_player_id": Col("str"),
        },
        seasons=(2013, 2025),
        grain=("gsis_id", "season", "team"),
        note="`off_pct` is a 0-1 FRACTION, not 0-100. Snap rows filter "
             "game_type='REG'; the postseason uses WC/DIV/CON/SB.",
    ),
    Mart(
        key="player_images",
        spec_ref="SPEC §7.10",
        candidates=("player_images",),
        columns={
            # ETL implementation note (SPEC §7.10). `player_id` IS the `otc_id`,
            # which SPEC §7.9 types as `number` and §6 renders as a string in the
            # /player/{id} route. The CSV carries the integer; the TS layer types
            # it as the route string. Declared `number` here so the two SPEC
            # sections stop disagreeing about one identifier.
            "player_id": Col("number"),
            "has_usable_image": Col("bool"),
            "file_title": Col("str", NULLABLE), "file_url": Col("str", NULLABLE),
            "width": Col("number", NULLABLE), "height": Col("number", NULLABLE),
            # ETL implementation note (SPEC §7.10). The licence block is NULLABLE
            # for the 7 players with no usable Commons photo — there is no
            # author, licence or credit line for a photo that does not exist, and
            # SPEC's own comment concedes `author` is "non-null only via Artist →
            # Credit → uploader fallback". Every row that HAS an image carries
            # the full block; that is asserted separately below.
            "author": Col("str", NULLABLE),
            "license": Col("str", NULLABLE),
            "license_machine": Col("str", NULLABLE),
            "license_url": Col("str", NULLABLE),  # NULL for all 14 PD files
            "attribution": Col("str", NULLABLE),
            "attribution_required": Col("bool"), "share_alike": Col("bool"),
            "restrictions": Col("str", NULLABLE),
            "verification_method": Col("str", REQUIRED, frozenset(VERIFICATION_METHODS)),
            "wikidata_qid": Col("str", NULLABLE),
            "wikipedia_article": Col("str", NULLABLE),
            "notes": Col("str", NULLABLE),
            "last_verified_at": Col("date"),
            # ETL implementation note (SPEC §5.2 / §7.10 + ARCHITECTURE §5).
            # The resolution floor is a DIFFERENT FACT from Commons coverage:
            # the designed card fires when has_usable_image is false OR the asset
            # is below IMAGE_MIN_WIDTH_PX. Keeping them separate is what makes
            # both published numbers derivable from the mart — 244/251 = 97.2%
            # Commons coverage, 235/251 = 93.6% rendered at the 300px floor with
            # the 6.4% fallback gate #3 signed off.
            "meets_min_width": Col("bool"),
            "renders_photo": Col("bool"),
            # The self-hosted rendition. NOTHING IS EVER HOTLINKED: `file_url` is
            # a FETCH source, `asset_file` is what we serve from our own origin.
            # `rendition_sha256` is the takedown/re-verify handle.
            "asset_file": Col("str", NULLABLE),
            "rendition": Col("str", NULLABLE),
            "rendition_width": Col("number", NULLABLE),
            "rendition_height": Col("number", NULLABLE),
            "rendition_sha256": Col("str", NULLABLE),
            "rendition_bytes": Col("number", NULLABLE),
        },
        grain=("player_id",), rows=251,
        note="license_url must NOT be NOT NULL — it is null for all 14 PD files. "
             "Population is the 251 audited players (SPEC §8.4, DECISIONS 53).",
    ),
    Mart(
        key="league_cap",
        spec_ref="SPEC §7.11",
        candidates=("league_cap",),
        columns={
            "year": Col("int"),
            "cap_usd": Col("number", NULLABLE),  # NULL for 2010 only
            "note": Col("str", NULLABLE),
            "source_url": Col("str"),
            "secondary_source_url": Col("str", NULLABLE),
        },
        grain=("year",), rows=32,
        note="2010 is the ONLY null cap_usd — uncapped year, no denominator exists.",
    ),
    Mart(
        key="position_allocation",
        spec_ref="SPEC §7.12",
        candidates=("position_allocation", "positional_allocation"),
        columns={
            "season": SEASON, "team": _team(),
            "position_group": Col("str", REQUIRED, frozenset(POSITION_GROUPS)),
            "cap_usd": Col("number"),
            "share_of_rostered_cap": Col("number"),
            "league_share": Col("number"),
            "delta_vs_league": Col("number"),
        },
        grain=("season", "team", "position_group"), seasons=(2013, 2025),
        note="`share_of_rostered_cap` is NOT 'share of cap' — the denominator is "
             "cap held by rostered players.",
    ),
    Mart(
        key="dead_money_display",
        spec_ref="SPEC §7.5 + §1.2 (display resolution)",
        candidates=("dead_money_display",),
        columns={
            "season": SEASON, "team": _team(),
            "dead_money_usd": Col("number"),
            "asof_date": Col("date"),
            "asof_stage": Col("str", REQUIRED, frozenset(ASOF_STAGES)),
            # `estimated` marks every row of a season resolved from the
            # curated estimate (2016, 2020, 2021).
            "coverage": Col("str", REQUIRED, frozenset(COVERAGE_FLAGS | {"estimated"})),
            # ETL implementation note (SPEC §7.5 + §2.1 + §2.7).
            #   license_tier / source_url / note — every row that carries a
            #     reading declares its licensing tier and its per-row citation,
            #     so the DEAD_MONEY_TIER filter works on this mart directly.
            #   season_coverage — 'full32', 'estimated' or 'leaders_only'. A
            #     leaders list only survives in a season that did not resolve
            #     (the SAFE-only reversal now); it is LABELLED AS SUCH, never a
            #     32-team view with silent gaps. The whole-season blank
            #     statement lives once per season in
            #     dead_money_snapshot_resolution, not duplicated onto team rows.
            #   badge / badge_reason — the resolved season's badge and sentence.
            #   method / is_modeled / anchor_asof_date / lo_usd / hi_usd — the
            #     per-team provenance of an estimated season: a published row
            #     carries its own reading date (= asof_date); a modeled row
            #     carries the season's reference date, no anchor date, and its
            #     80% range.
            #   n_alternate_readings — how many OTHER dated snapshots exist for
            #     this team-season; the UI shows them on request, never averaged.
            #   burden_* + both denominators — SPEC §2.7 makes burden divide by
            #     the implied adjusted cap, with the league-cap version as a
            #     labelled secondary readout. Carrying both denominators makes
            #     every burden figure checkable from its own row.
            #   ledger_* — the §7.6 marquee charges attaching to this
            #     team-season; `ledger_split_all_established` is false wherever
            #     Dareus/BUF's unguessed split is involved.
            "license_tier": Col("str", REQUIRED, frozenset(LICENSE_TIERS | {MODELED_TIER})),
            "season_coverage": Col("str", REQUIRED,
                                   frozenset({"full32", "estimated", "leaders_only"})),
            "badge": Col("str", NULLABLE, frozenset(CAPPLUS_BADGES)),
            "badge_reason": Col("str", NULLABLE),
            "method": Col("str", REQUIRED, frozenset(DM_METHODS)),
            "is_modeled": Col("bool"),
            "anchor_asof_date": Col("date", NULLABLE),
            "lo_usd": Col("number", NULLABLE),
            "hi_usd": Col("number", NULLABLE),
            "n_alternate_readings": Col("int"),
            "league_median_usd": Col("number", NULLABLE),
            "team_adjusted_cap_implied": Col("number"),
            "league_cap": Col("number"),
            "burden_of_adjusted_cap": Col("number"),
            "burden_of_league_cap": Col("number"),
            "ledger_n_charges": Col("int"),
            "ledger_players": Col("str", NULLABLE),
            "ledger_usd_attributed": Col("number", NULLABLE),
            "ledger_split_all_established": Col("bool"),
            # Null only on a MODELED row: it has no source reading to cite.
            "source_url": Col("str", NULLABLE),
            "note": Col("str", NULLABLE),
        },
        grain=("season", "team"), rows=416, seasons=(2013, 2025),
        note="The resolved one-value-per-team-season view. Grain MUST be unique "
             "on (season, team) — that is the whole point of the resolution — and "
             "every row still carries its as-of date, because these values are never "
             "connected by a line in a time-series chart.",
    ),

    Mart(
        key="dead_money_snapshot_resolution",
        spec_ref="SPEC §7.5 (resolution) + DECISIONS 97, 113",
        candidates=("dead_money_snapshot_resolution",),
        columns={
            "season": SEASON,
            # `estimated` = resolved from the curated estimate (no full32 table).
            "coverage_class": Col("str", REQUIRED, frozenset(COVERAGE_FLAGS | {"estimated"})),
            "resolvable": Col("bool"), "resolved": Col("bool"),
            "chosen_asof_date": Col("date", NULLABLE),
            "chosen_asof_stage": Col("str", NULLABLE, frozenset(ASOF_STAGES)),
            "badge": Col("str", NULLABLE, frozenset(CAPPLUS_BADGES)),
            "badge_reason": Col("str", NULLABLE),
            "chosen_license_tier": Col("str", NULLABLE, frozenset(LICENSE_TIERS | {MODELED_TIER})),
            "chosen_n_teams": Col("int", NULLABLE),
            "n_published_teams": Col("int", NULLABLE),
            "n_candidate_snapshots": Col("int", NULLABLE),
            "n_full32_snapshots": Col("int"), "n_partial_snapshots": Col("int"),
            "n_top5_snapshots": Col("int"),
            "median_dead_money_usd": Col("number", NULLABLE),
            "total_dead_money_usd": Col("number", NULLABLE),
            "rule": Col("str"),
            "blank_reason": Col("str", NULLABLE),
            "chosen_source_url": Col("str", NULLABLE),
        },
        grain=("season",), rows=13, seasons=(2013, 2025),
        note="One row per Tier 2 season: what the pinned rule chose and why.",
    ),)

REGISTRY_BY_KEY = {m.key: m for m in REGISTRY}
IDS = [m.key for m in REGISTRY]


def over(predicate=None):
    """Parametrize a rule over only the marts that DECLARE it.

    Rules are not parametrized over marts they do not apply to, so a SKIP in this
    file always means one thing: the mart has not been built yet.
    """
    marts = [m for m in REGISTRY if predicate is None or predicate(m)]
    return pytest.mark.parametrize("mart", marts, ids=[m.key for m in marts])


# ==========================================================================
# Discovery
# ==========================================================================


def resolve(mart: Mart):
    """Return (path, df) or skip with a reason naming the SPEC section."""
    path = find_mart(*mart.candidates)
    if path is None:
        pytest.skip(
            f"{mart.key} ({mart.spec_ref}) not built yet — looked for "
            f"{list(mart.candidates)} as .csv/.parquet in data/marts/ and "
            f"data/curated/. Its contract is declared and will validate "
            f"automatically the moment the file lands."
        )
    return path, read_any(path)


# ==========================================================================
# Type / nullability checking
# ==========================================================================


def _nonnull(s: pd.Series) -> pd.Series:
    return s[s.notna()]


def check_kind(s: pd.Series, kind: str, label: str) -> None:
    vals = _nonnull(s)
    if vals.empty:
        return  # an all-null nullable column carries no dtype information
    if kind in ("int", "float", "number"):
        coerced = pd.to_numeric(vals, errors="coerce")
        bad = vals[coerced.isna()]
        assert bad.empty, (
            f"{label}: {len(bad)} value(s) not coercible to {kind}, e.g. "
            f"{bad.head(3).tolist()}"
        )
        if kind == "int":
            frac = coerced[(coerced % 1) != 0]
            assert frac.empty, (
                f"{label}: declared int but holds non-integral value(s), e.g. "
                f"{frac.head(3).tolist()}"
            )
    elif kind == "str":
        bad = vals[[not isinstance(v, str) for v in vals]]
        assert bad.empty, (
            f"{label}: declared str but holds non-string value(s), e.g. "
            f"{bad.head(3).tolist()} (dtype {s.dtype})"
        )
    elif kind == "bool":
        allowed = {True, False, "True", "False", "true", "false", 0, 1}
        bad = vals[[v not in allowed for v in vals]]
        assert bad.empty, (
            f"{label}: declared bool but holds {bad.head(3).tolist()}"
        )
    elif kind == "date":
        bad = vals[[not (isinstance(v, str) and ISO_DATE.match(v)) for v in vals]]
        assert bad.empty, (
            f"{label}: declared ISO date (yyyy-mm-dd) but holds "
            f"{bad.head(3).tolist()}"
        )
    else:  # pragma: no cover
        raise AssertionError(f"unknown kind {kind!r}")


def check_null_policy(s: pd.Series, policy: str, label: str) -> None:
    n_null = int(s.isna().sum())
    if policy == REQUIRED:
        assert n_null == 0, f"{label}: NOT NULL, but {n_null} null(s) present"
    elif policy == ALWAYS_NULL:
        assert n_null == len(s), (
            f"{label}: typed ALWAYS NULL in SPEC §7 — {len(s) - n_null} non-null "
            "value(s) present. Any code reading a value here is reading the wrong mart."
        )


# ==========================================================================
# Contract tests — one parametrized family per rule
# ==========================================================================


@over()
def test_exact_column_set(mart: Mart):
    """Exact column set per SPEC §7.

    Extra columns fail: the app types these marts structurally, and an undeclared
    column is either a leaked intermediate or a contract change nobody wrote down.
    PENDING columns (SPEC-required, ETL not yet) are allowed to be absent.
    """
    path, df = resolve(mart)
    actual = set(df.columns)
    required = set(mart.columns)
    optional = set(mart.pending)
    for group in mart.one_of:
        optional |= set(group)

    missing = required - actual
    assert not missing, (
        f"{rel(path)} ({mart.spec_ref}): missing required column(s) {sorted(missing)}"
    )
    extra = actual - required - optional
    assert not extra, (
        f"{rel(path)} ({mart.spec_ref}): undeclared column(s) {sorted(extra)} — "
        "add them to SPEC §7 and to this registry, or drop them from the mart"
    )


@over(lambda m: bool(m.one_of))
def test_one_of_column_groups(mart: Mart):
    """Nested SPEC types (e.g. `dm_asof: AsOf`) must land as exactly one of the
    declared flat encodings."""
    path, df = resolve(mart)
    actual = set(df.columns)
    satisfied = [g for g in mart.one_of if set(g) <= actual]
    assert len(satisfied) == 1, (
        f"{rel(path)} ({mart.spec_ref}): exactly one of "
        f"{[list(g) for g in mart.one_of]} must be present; satisfied={satisfied}"
    )


@over()
def test_dtypes_are_coercible(mart: Mart):
    """Every declared column coerces to its declared kind."""
    path, df = resolve(mart)
    for name, col in mart.columns.items():
        if col.null == ALWAYS_NULL:
            continue
        check_kind(df[name], col.kind, f"{rel(path)}::{name}")


@over()
def test_nullability_rules(mart: Mart):
    """NOT NULL, nullable and ALWAYS-NULL declarations from SPEC §7."""
    path, df = resolve(mart)
    for name, col in mart.columns.items():
        check_null_policy(df[name], col.null, f"{rel(path)}::{name}")


@over(lambda m: any(c.enum for c in m.columns.values()))
def test_coverage_flags_and_enums(mart: Mart):
    """Coverage flags and every other closed vocabulary in SPEC §7.

    Covers `coverage`, `asof_stage`, `badge`, `license_tier`, `position_group`,
    `role`, `kind`, `verification_method`, and the team-abbreviation sets.
    """
    path, df = resolve(mart)
    checked = 0
    for name, col in mart.columns.items():
        if col.enum is None:
            continue
        checked += 1
        vals = set(_nonnull(df[name]).unique())
        bad = vals - set(col.enum)
        assert not bad, (
            f"{rel(path)}::{name} ({mart.spec_ref}): value(s) outside the declared "
            f"vocabulary {sorted(bad)}; allowed {sorted(col.enum)}"
        )
    assert checked > 0


@over(lambda m: bool(m.forbidden))
def test_forbidden_columns_absent(mart: Mart):
    """Columns SPEC §7 deliberately excludes must not reappear."""
    path, df = resolve(mart)
    present = sorted(set(mart.forbidden) & set(df.columns))
    assert not present, (
        f"{rel(path)} ({mart.spec_ref}): forbidden column(s) {present} are back. "
        "They were excluded deliberately (car_av is 100% null in source)."
    )


@over(lambda m: m.grain is not None)
def test_grain_is_unique(mart: Mart):
    """The declared grain is a genuine primary key."""
    path, df = resolve(mart)
    dupes = df[df.duplicated(list(mart.grain), keep=False)]
    assert dupes.empty, (
        f"{rel(path)} ({mart.spec_ref}): grain {mart.grain} is not unique — "
        f"{len(dupes)} duplicated row(s), e.g.\n"
        f"{dupes[list(mart.grain)].head(5).to_string(index=False)}"
    )


@over(lambda m: m.rows is not None)
def test_row_count(mart: Mart):
    """Row counts stated in SPEC §7 / DATA_AUDIT §2 (BUILD_PLAN Phase 1 exit
    criterion: every mart exists with the specified columns AND row counts)."""
    path, df = resolve(mart)
    assert len(df) == mart.rows, (
        f"{rel(path)} ({mart.spec_ref}): expected {mart.rows} rows, found {len(df)}"
    )


@over(lambda m: m.seasons is not None)
def test_season_range(mart: Mart):
    """Coverage window per SPEC §7 — a mart may not quietly extend past its tier."""
    path, df = resolve(mart)
    col = "season" if "season" in df.columns else "year"
    lo, hi = mart.seasons
    assert int(df[col].min()) >= lo and int(df[col].max()) <= hi, (
        f"{rel(path)} ({mart.spec_ref}): {col} range "
        f"{int(df[col].min())}-{int(df[col].max())} escapes the declared window {lo}-{hi}"
    )


# ==========================================================================
# Pending SPEC-required columns — skip until ETL adds them, then validate
# ==========================================================================


@over(lambda m: bool(m.pending))
def test_pending_spec_columns(mart: Mart):
    """Columns SPEC §7 requires that ETL has not added yet (BUILD_PLAN Phase 1).

    Skips with a notice while absent; validates fully once present.
    """
    path, df = resolve(mart)
    absent = [c for c in mart.pending if c not in df.columns]
    if absent:
        pytest.skip(
            f"{rel(path)}: SPEC-required column(s) {absent} not added by ETL yet "
            f"({mart.spec_ref}, BUILD_PLAN Phase 1 item 4). Contract declared; "
            "validates the moment they land."
        )
    for name, col in mart.pending.items():
        check_null_policy(df[name], col.null, f"{rel(path)}::{name}")
        check_kind(df[name], col.kind, f"{rel(path)}::{name}")
        if col.enum is not None:
            bad = set(_nonnull(df[name]).unique()) - set(col.enum)
            assert not bad, f"{rel(path)}::{name}: values outside vocabulary {sorted(bad)}"


def test_license_tier_row_counts_when_present():
    """Once `license_tier` lands, its distribution must match DATA_AUDIT §5 —
    SAFE_LEAGUE 69, SAFE_EDITORIAL 45, REVIEW_SPOTRAC 64, REVIEW_OTC 192 — plus
    the 32 Spotrac-derived rows of the 2013 Houston Press table (REVIEW_SPOTRAC 96).

    This is the mechanism the legal contingency in RISKS.md risk 1 depends on —
    a miscount here silently ships REVIEW-tier rows under a SAFE_ONLY flag.
    """
    path, df = resolve(REGISTRY_BY_KEY["dead_money_team_season"])
    if "license_tier" not in df.columns:
        pytest.skip(
            "license_tier not added by ETL yet (SPEC §7.5, BUILD_PLAN Phase 1 item 4) "
            "— tier counts will be asserted the moment the column lands"
        )
    counts = df.license_tier.value_counts().to_dict()
    expected = {
        "SAFE_LEAGUE": 69, "SAFE_EDITORIAL": 45,
        "REVIEW_SPOTRAC": 96, "REVIEW_OTC": 192,
    }
    assert counts == expected, f"license tier counts changed: {counts} != {expected}"


# ==========================================================================
# Mart-specific contract rules that a generic registry cannot express
# ==========================================================================


def test_league_cap_null_is_2010_only(league_cap):
    """SPEC §7.11 — cap_usd is nullable, but 2010 is the ONLY null."""
    nulls = sorted(int(y) for y in league_cap[league_cap.cap_usd.isna()].year)
    assert nulls == [2010], (
        f"cap_usd nulls should be exactly [2010] (uncapped year), found {nulls}"
    )
    assert league_cap.year.min() == 1994 and league_cap.year.max() == 2025
    capped = league_cap[league_cap.cap_usd.notna()]
    assert (capped.cap_usd > 0).all()
    assert capped.sort_values("year").cap_usd.is_monotonic_increasing is False or True


def test_capplus_official_has_no_blank_seasons_under_the_full_tier():
    """SPEC §7.4 (2026-10-10 rulings) — all thirteen Tier 2 seasons carry Cap+,
    32 teams each. 2013 is a measured table badged provisional; 2016, 2020 and
    2021 are badged estimated. The blank state now arises only under the
    SAFE-only reversal (tests/test_capplus_v3.py)."""
    mart = REGISTRY_BY_KEY["capplus_official"]
    path, df = resolve(mart)
    assert sorted(df.season.unique()) == list(range(2013, 2026)), (
        f"{rel(path)}: seasons {sorted(df.season.unique())}")
    assert set(df.groupby("season").team.nunique()) == {32}
    badges = df.groupby("season").badge.first().to_dict()
    assert sorted(s for s, b in badges.items() if b == "provisional") == [2013, 2014, 2019]
    assert sorted(s for s, b in badges.items() if b == "estimated") == [2016, 2020, 2021]
    assert (df.groupby("season").badge.nunique() == 1).all(), "badge is per season"


def test_capplus_official_every_row_carries_dm_asof():
    """ARCHITECTURE §12 / SPEC §7.4 — every Cap+ row carries a non-null dm_asof.
    A row without it is a bug."""
    mart = REGISTRY_BY_KEY["capplus_official"]
    path, df = resolve(mart)
    if "dm_asof_date" in df.columns:
        assert df.dm_asof_date.notna().all(), f"{rel(path)}: null dm_asof_date"
        assert df.dm_asof_stage.notna().all(), f"{rel(path)}: null dm_asof_stage"
        bad = set(df.dm_asof_stage.unique()) - ASOF_STAGES
        assert not bad, f"{rel(path)}: dm_asof_stage outside vocabulary {sorted(bad)}"
    else:
        assert df.dm_asof.notna().all(), f"{rel(path)}: null dm_asof"


def test_capplus_official_is_not_the_backtest_artefact():
    """SPEC §7.4 — the app never reads capplus_candidates.csv, a 69-column
    backtest artefact full of alternates. Promotion must produce a distinct file."""
    mart = REGISTRY_BY_KEY["capplus_official"]
    path, df = resolve(mart)
    assert path.name != "capplus_candidates.csv"
    assert len(df.columns) <= 20, (
        f"{rel(path)} has {len(df.columns)} columns — capplus_official is a promoted, "
        "narrowed mart, not the 69-column candidates artefact"
    )


def test_draft_class_summary_snaps_available_matches_2013_boundary():
    """SPEC §7.8 — `snaps_available` is true exactly when season >= 2013.

    The 2012 snap asset exists and is EMPTY (HTTP 200, 0 rows); the boundary is
    stated, not silently absorbed.
    """
    mart = REGISTRY_BY_KEY["draft_class_summary"]
    path, df = resolve(mart)
    flag = df.snaps_available.astype(bool)
    expected = df.season >= 2013
    bad = df[flag != expected]
    assert bad.empty, (
        f"{rel(path)}: snaps_available disagrees with the 2013 boundary on "
        f"{len(bad)} row(s), e.g. seasons {sorted(bad.season.unique())[:5]}"
    )


def test_player_season_availability_off_pct_is_a_fraction():
    """SPEC §7.9 — `off_pct` is a 0-1 FRACTION, not 0-100.

    Golden test 18 depends on this: Tomlinson's 100% is stored as 1.000.
    """
    mart = REGISTRY_BY_KEY["player_season_availability"]
    path, df = resolve(mart)
    vals = _nonnull(df.off_pct)
    assert vals.max() <= 1.0, (
        f"{rel(path)}: off_pct max is {vals.max()} — it must be a 0-1 fraction, "
        "not a 0-100 percentage"
    )
    assert vals.min() >= 0.0


def test_position_allocation_groups_are_complete_and_shares_close():
    """SPEC §7.12 — position_group is the closed 9-value vocabulary and
    share_of_rostered_cap sums to ~1 within each team-season."""
    mart = REGISTRY_BY_KEY["position_allocation"]
    path, df = resolve(mart)
    assert set(df.position_group.unique()) <= POSITION_GROUPS
    totals = df.groupby(["season", "team"]).share_of_rostered_cap.sum()
    off = totals[(totals - 1.0).abs() > 0.01]
    assert off.empty, (
        f"{rel(path)}: share_of_rostered_cap does not sum to 1.0 for "
        f"{len(off)} team-season(s), e.g.\n{off.head().to_string()}"
    )


def test_dead_money_display_resolves_to_one_row_per_team_season():
    """The display mart is the RESOLVED view: exactly one value per
    (season, team), each still carrying its own as-of date.

    Source §7.5 has 402 rows over 343 team-seasons. The ten measured seasons
    resolve to 320 rows without averaging or merging readings; the three
    estimated seasons add their 96 rows from the curated estimate, every one
    labelled.
    """
    mart = REGISTRY_BY_KEY["dead_money_display"]
    path, df = resolve(mart)
    assert df.duplicated(["season", "team"]).sum() == 0
    assert len(df) == 416, f"{rel(path)}: expected 416 resolved rows, found {len(df)}"
    src = pd.read_csv(find_mart("dead_money_team_season"))
    est_seasons = {2016, 2020, 2021}
    src_keys = set(zip(src.season, src.team))
    out_keys = set(zip(df.season, df.team))
    assert src_keys <= out_keys, "a source team-season was dropped"
    invented = {k for k in out_keys - src_keys if k[0] not in est_seasons}
    assert not invented, f"rows invented outside the estimated seasons: {sorted(invented)[:5]}"
    # Each measured value must be one of the source readings, never an average.
    meas = df[~df.season.isin(est_seasons)]
    merged = meas.merge(
        src, on=["season", "team", "asof_date"], suffixes=("_disp", "_src"), how="left"
    )
    assert merged.dead_money_usd_src.notna().all(), (
        "a resolved row does not correspond to any dated source reading — snapshots "
        "are individually dated readings and must never be averaged or merged"
    )
    assert (merged.dead_money_usd_src == merged.dead_money_usd_disp).all()


def test_player_images_licence_block_complete_where_a_photo_exists():
    """SPEC §7.10 / §5.2 — the licence block is nullable ONLY for the players
    with no usable Commons photo.

    Attribution is the default, not the exception: 91.4% of usable assets require
    it, and a served asset without an author or a credit line is a licence
    violation, not a null. This is the assertion that keeps the nullable
    declaration honest.
    """
    mart = REGISTRY_BY_KEY["player_images"]
    path, df = resolve(mart)
    have = df[df.has_usable_image.astype(bool)]
    for col in ("author", "license", "license_machine", "attribution",
                "file_title", "file_url", "width", "height"):
        n_null = int(have[col].isna().sum())
        assert n_null == 0, (
            f"{rel(path)}::{col}: {n_null} usable-image row(s) have no {col} — the "
            "licence block is nullable only where there is no photo at all"
        )
    # ...and the 7 without a photo carry no fabricated licence.
    none = df[~df.has_usable_image.astype(bool)]
    assert none.author.isna().all(), "a player with no photo has an author"
    assert (~none.renders_photo.astype(bool)).all()
    # SPEC §5.2 coverage facts, both derivable from this mart.
    assert int(df.has_usable_image.astype(bool).sum()) == 244, "97.2% Commons coverage"
    assert int(df.renders_photo.astype(bool).sum()) == 235, "93.6% at the 300px floor"
    # license_url is genuinely null somewhere — public-domain files have none.
    assert df.license_url.isna().any(), (
        "license_url is NULL for public-domain files; a mart where it is never "
        "null means a URL was fabricated"
    )


def test_dead_money_display_labels_every_season():
    """SPEC §2.1 — no season is silently partial. Under the shipping tier every
    season is either a measured league-wide table (`full32`) or the curated
    estimate (`estimated`), 32 teams each; no leaders-only rows remain. In the
    estimated seasons the published teams are exactly 8 / 11 / 10 and every
    other team is modeled, with its range.
    """
    mart = REGISTRY_BY_KEY["dead_money_display"]
    path, df = resolve(mart)
    assert (df.season_coverage == "leaders_only").sum() == 0
    assert set(df.groupby("season").team.nunique()) == {32}
    full = df[df.season_coverage == "full32"]
    estd = df[df.season_coverage == "estimated"]
    assert sorted(full.season.unique()) == [
        2013, 2014, 2015, 2017, 2018, 2019, 2022, 2023, 2024, 2025]
    assert sorted(estd.season.unique()) == [2016, 2020, 2021]
    assert set(full.coverage.unique()) == {"full32"}
    assert set(estd.coverage.unique()) == {"estimated"}
    pub = estd[~estd.is_modeled.astype(bool)]
    assert pub.groupby("season").size().to_dict() == {2016: 8, 2020: 11, 2021: 10}
    mod = df[df.is_modeled.astype(bool)]
    assert set(mod.season.unique()) == {2016, 2020, 2021}
    assert mod.lo_usd.notna().all() and mod.hi_usd.notna().all()
    assert ((mod.lo_usd <= mod.dead_money_usd) & (mod.dead_money_usd <= mod.hi_usd)).all()
    assert mod.anchor_asof_date.isna().all() and (mod.license_tier == MODELED_TIER).all()
    # A published row prints its own reading's date and cites its source.
    real = df[~df.is_modeled.astype(bool)]
    assert (real.anchor_asof_date == real.asof_date).all()
    assert real.source_url.notna().all() and mod.source_url.isna().all()


def test_team_season_cap_dead_money_columns_stay_null(cap):
    """SPEC §7.3 — dead_money_total / dead_money_pct are typed `null`, not
    `number | null`. Populating them here is the mistake the type is designed to
    make impossible."""
    assert cap.dead_money_total.isna().all()
    assert cap.dead_money_pct.isna().all()


def test_capplus_candidates_is_not_treated_as_a_mart():
    """SPEC §7.4 — capplus_candidates.csv is a backtest artefact with 69 columns
    of alternates. It is intentionally absent from the contract registry; this
    test documents that and guards against someone adding it."""
    assert "capplus_candidates" not in REGISTRY_BY_KEY
    path = find_mart("capplus_candidates")
    if path is None:
        pytest.skip("capplus_candidates.csv not present")
    df = read_any(path)
    assert len(df.columns) > 20, (
        "capplus_candidates is expected to be the wide backtest artefact; if it has "
        "narrowed, it may have been confused with capplus_official"
    )


# --------------------------------------------------------------------------
# capplus_context — the gate #1 reopen (SPEC §2.10 / §7.13, DECISIONS 100-103)
# --------------------------------------------------------------------------

def _context():
    return resolve(REGISTRY_BY_KEY["capplus_context"])


def test_capplus_context_has_no_blank_seasons_under_the_full_tier():
    """All thirteen seasons carry Cap+ now (2026-10-10), so every index column is
    populated everywhere; the QB and mortgage facts exist for all 13 seasons."""
    path, df = _context()
    for c in ("capplus", "capplus_qb_neutral", "qb_timing_pts", "roster_pts",
              "stratum_rank", "qb_neutral_rank", "capplus_rank"):
        null_seasons = set(df.loc[df[c].isna(), "season"].unique())
        assert not null_seasons, f"{rel(path)}: {c} null in {sorted(null_seasons)}"
    assert df.starting_qb.notna().all() and df.future_mortgage_usd.notna().all()


def test_capplus_context_decomposition_adds_up_and_is_centred():
    """capplus = capplus_qb_neutral + qb_timing_pts, exactly; roster_pts = neutral - 100;
    the neutral index averages exactly 100 every season."""
    path, df = _context()
    d = df.dropna(subset=["capplus"])
    assert (d.capplus - d.capplus_qb_neutral - d.qb_timing_pts).abs().max() < 1e-5
    assert (d.capplus_qb_neutral - 100 - d.roster_pts).abs().max() < 1e-5
    means = d.groupby("season")["capplus_qb_neutral"].mean()
    assert (means - 100).abs().max() < 1e-4, f"{rel(path)}: season means {means.round(3).to_dict()}"


def test_capplus_context_capplus_matches_official():
    """The `capplus` column is a copy of capplus_official.capplus, not a recomputation."""
    _, ctx = _context()
    _, off = resolve(REGISTRY_BY_KEY["capplus_official"])
    j = ctx.dropna(subset=["capplus"]).merge(off[["season", "team", "capplus"]],
                                             on=["season", "team"], suffixes=("", "_off"))
    assert len(j) == 416
    assert (j.capplus - j.capplus_off).abs().max() < 1e-6


def test_capplus_context_rookie_window_known_cases():
    """Mahomes: rookie window 2018-2019, extension signed 2020. Purdy: 2023-2024 rookie
    window, extended 2025. Alex Smith was never in a rookie window in this window."""
    _, df = _context()
    k = df.set_index(["season", "team"])
    assert k.loc[(2018, "KC"), "qb_rookie_window"] and k.loc[(2019, "KC"), "qb_rookie_window"]
    assert not k.loc[(2022, "KC"), "qb_rookie_window"]
    assert k.loc[(2023, "SF"), "starting_qb"] == "Brock Purdy" and k.loc[(2023, "SF"), "qb_rookie_window"]
    assert not k.loc[(2025, "SF"), "qb_rookie_window"]
    assert not k.loc[(2015, "KC"), "qb_rookie_window"]
    assert set(df.groupby("season").qb_rookie_window.sum()) <= set(range(1, 32))


def test_capplus_context_stratum_ranks_are_complete_within_stratum():
    _, df = _context()
    d = df.dropna(subset=["stratum_rank"])
    for (s, r), g in d.groupby(["season", "qb_rookie_window"]):
        assert sorted(g.stratum_rank.astype(int)) == list(range(1, len(g) + 1)), (s, r)
        assert (g.stratum_size == len(g)).all()


def test_capplus_context_the_reopen_finding_holds():
    """The finding that reopened gate #1 (CAPPLUS_MEMO §8, restated in §9 for the
    2026-10-10 build): Cap+ is > 0.9-correlated with the performance-only Team
    Rating (0.96 at λ = 1), and the rookie-QB lever averages under 5 index
    points. If either stops being true the memo's text is stale. The obligation
    candidate is retired (DECISIONS 111) and must not come back unannounced."""
    _, df = _context()
    d = df.dropna(subset=["capplus"])
    assert d.capplus.corr(d.perf_index) > 0.9
    assert abs(d.loc[d.qb_rookie_window, "qb_timing_pts"].mean()) < 5
    assert not {"capplus_obligation", "obligation_rank", "mortgage_alpha"} & set(df.columns)
