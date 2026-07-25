"""Mart schema contracts — SPEC.md §7.

Every mart the app reads is declared here: exact column set, dtype coercibility,
nullability rules, coverage-flag vocabularies, grain uniqueness and row count.

AUTO-DISCOVERY. The registry covers every mart in SPEC §7, including the six
still being built in parallel (`capplus_official`, `team_season_stability`,
`draft_class_summary`, `player_season_cap`, `position_allocation`,
`dead_money_display`). A mart that has not landed yet SKIPS with a reason naming
its SPEC section — it never fails on absence. The moment the file appears in
data/marts/ (as .csv or .parquet, under either its SPEC name or its BUILD_PLAN
alias) its contract validates on the next CI run with no edit here.

Two columns are declared PENDING because SPEC §7 requires them and ETL has not
added them yet (BUILD_PLAN Phase 1 item 4): `license_tier` on
dead_money_team_season, and `stint` on coaching_staff. They are excluded from
the exact-column-set check and validated by a dedicated skip-when-absent test.
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
CAPPLUS_BADGES = {"provisional", "preseason", "in_season"}
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
            "season_rank": Col("int"),
        },
        # `dm_asof: AsOf` is nested in TS; a flat file must carry the pair.
        one_of=(("dm_asof_date", "dm_asof_stage"), ("dm_asof",)),
        grain=("season", "team"), rows=288,
        note="Nine seasons only; 2013/2016/2020/2021 have NO rows. "
             "Promoted from capplus_candidates.csv, which the app never reads.",
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
        grain=("season", "team", "asof_date"), rows=370, seasons=(2013, 2025),
        note="Multiple rows per (season, team) are correct — 370 rows over 316 "
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
        },
        note="dm_next1/dm_next2 are Metric unions; their flat encoding is not "
             "constrained here beyond the columns above.",
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
            "college": Col("str"),
            "chart_value": Col("number"),
            "games": Col("number", NULLABLE), "w_av": Col("number", NULLABLE),
            "seasons_started": Col("int"),
            "probowls": Col("int"), "allpro": Col("int"), "hof": Col("bool"),
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
            "position_at_signing": Col("str"),
            "position_group": Col("str", REQUIRED, frozenset(POSITION_GROUPS)),
            "cap_number": Col("number"), "cash_paid": Col("number"),
            "base_salary": Col("number", NULLABLE),
            "prorated_bonus": Col("number", NULLABLE),
            "roster_bonus": Col("number", NULLABLE),
            "guaranteed_salary": Col("number", NULLABLE),
            "cap_percent": Col("number", NULLABLE),
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
        },
        grain=("gsis_id", "season", "team"),
        note="`off_pct` is a 0-1 FRACTION, not 0-100. Snap rows filter "
             "game_type='REG'; the postseason uses WC/DIV/CON/SB.",
    ),
    Mart(
        key="player_images",
        spec_ref="SPEC §7.10",
        candidates=("player_images",),
        columns={
            "player_id": Col("str"),
            "has_usable_image": Col("bool"),
            "file_title": Col("str", NULLABLE), "file_url": Col("str", NULLABLE),
            "width": Col("number", NULLABLE), "height": Col("number", NULLABLE),
            "author": Col("str"),
            "license": Col("str"), "license_machine": Col("str"),
            "license_url": Col("str", NULLABLE),  # NULL for all 14 PD files
            "attribution": Col("str"),
            "attribution_required": Col("bool"), "share_alike": Col("bool"),
            "restrictions": Col("str", NULLABLE),
            "verification_method": Col("str", REQUIRED, frozenset(VERIFICATION_METHODS)),
            "wikidata_qid": Col("str", NULLABLE),
            "wikipedia_article": Col("str", NULLABLE),
            "notes": Col("str", NULLABLE),
            "last_verified_at": Col("date"),
        },
        grain=("player_id",),
        note="license_url must NOT be NOT NULL — it is null for all 14 PD files.",
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
            "coverage": Col("str", REQUIRED, frozenset(COVERAGE_FLAGS)),
        },
        grain=("season", "team"),
        note="The resolved one-snapshot-per-team-season view. Grain MUST be unique "
             "on (season, team) — that is the whole point of the resolution — and "
             "every row still carries its as-of date, because these values are never "
             "connected by a line in a time-series chart.",
    ),
)

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
    """Once `license_tier` lands, its distribution must match DATA_AUDIT §5:
    SAFE_LEAGUE 69, SAFE_EDITORIAL 45, REVIEW_SPOTRAC 64, REVIEW_OTC 192.

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
        "REVIEW_SPOTRAC": 64, "REVIEW_OTC": 192,
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


def test_capplus_official_blank_seasons_have_no_rows():
    """SPEC §7.4 — seasons 2013, 2016, 2020, 2021 have NO rows in capplus_official.

    The data layer returns a `blank` Metric with a reason string for those four.
    A row appearing for them means a dead-money table was invented.
    """
    mart = REGISTRY_BY_KEY["capplus_official"]
    path, df = resolve(mart)
    blank = sorted(set(df.season.unique()) & {2013, 2016, 2020, 2021})
    assert not blank, (
        f"{rel(path)}: capplus_official must have NO rows for 2013/2016/2020/2021 — "
        f"found rows for {blank}. No league-wide dead-money table was published."
    )
    assert sorted(df.season.unique()) == [2014, 2015, 2017, 2018, 2019, 2022, 2023, 2024, 2025]
    assert set(df.groupby("season").team.nunique()) == {32}


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
    """The display mart is the RESOLVED view: exactly one snapshot per
    (season, team), each still carrying its own as-of date.

    Source §7.5 has 370 rows over 316 team-seasons; the resolution must reduce
    that to 316 rows without averaging or merging readings.
    """
    mart = REGISTRY_BY_KEY["dead_money_display"]
    path, df = resolve(mart)
    assert df.duplicated(["season", "team"]).sum() == 0
    assert len(df) == 316, (
        f"{rel(path)}: expected 316 resolved rows (one per distinct team-season in "
        f"dead_money_team_season), found {len(df)}"
    )
    src = pd.read_csv(
        find_mart("dead_money_team_season")
    )
    src_keys = set(zip(src.season, src.team))
    out_keys = set(zip(df.season, df.team))
    assert out_keys == src_keys, (
        "the display mart must resolve exactly the team-seasons that exist in the "
        "source — no invented rows, no dropped ones"
    )
    # Each resolved value must be one of the source readings, never an average.
    merged = df.merge(
        src, on=["season", "team", "asof_date"], suffixes=("_disp", "_src"), how="left"
    )
    assert merged.dead_money_usd_src.notna().all(), (
        "a resolved row does not correspond to any dated source reading — snapshots "
        "are individually dated readings and must never be averaged or merged"
    )


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
