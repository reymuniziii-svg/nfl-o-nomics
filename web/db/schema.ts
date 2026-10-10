/**
 * Drizzle schema — the single TypeScript definition of the mart shapes in
 * `SPEC.md` §7 (`ARCHITECTURE.md` §3). The app's types are inferred from here,
 * so a mart column change breaks the type-check rather than the page.
 *
 * RULES THIS FILE ENCODES
 *  - Nullability is what was OBSERVED, not what is theoretically possible.
 *  - `team_season_cap.dead_money_total` / `.dead_money_pct` are ALWAYS NULL and
 *    are typed `null` (see `TeamSeasonCapRow` below) so any attempt to read a
 *    dead-money number from the wrong mart is a compile error. Dead money comes
 *    from `dead_money_team_season` (§7.5) and nowhere else.
 *  - `dead_money_team_season.asof_date` / `.asof_stage` are NOT NULL. A row
 *    without them fails the build.
 *  - `player_images.license_url` is nullable — all 14 public-domain files have none.
 *  - `car_av` is deliberately absent from the draft schema (100% null in source).
 *  - Money is `double precision` holding WHOLE DOLLARS (ETL rounds to 0 dp), which
 *    is exact for every magnitude this dataset reaches. Dates are `text` because
 *    `SPEC.md` §7 types them as ISO strings and ISO strings sort correctly.
 *
 * Tables the app must never read are not defined here at all: `capplus_candidates`
 * is a 69-column backtest artefact and is deliberately absent (`SPEC.md` §7.4).
 */

import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  index,
} from 'drizzle-orm/pg-core';

/* ================================================================== */
/* ENUMS                                                               */
/* ================================================================== */

/** `SPEC.md` §7 shared — `AsOfStage`. */
export const asofStageEnum = pgEnum('asof_stage', [
  'preseason',
  'midseason',
  'late_season',
  'final',
]);

/** COVERAGE FLAG — the per-snapshot breadth of a dead-money table (§7.5). */
export const dmCoverageEnum = pgEnum('dm_coverage', ['full32', 'partial', 'top5', 'estimated']);

/** COVERAGE FLAG — the season's resolved coverage class (§2.1 resolution rule). */
export const seasonCoverageEnum = pgEnum('season_coverage', ['full32', 'leaders_only', 'estimated']);

/** COVERAGE FLAG — the `Metric<T>` discriminant, persisted (§1.2). */
export const metricStateEnum = pgEnum('metric_state', ['value', 'blank', 'partial']);

/** `SPEC.md` §7.5 — derived deterministically from `source_url`; the RISKS.md
 *  risk 1 mechanism. `DEAD_MONEY_TIER` filters on it at seed time. `MODELED`
 *  marks a modeled figure in an estimated season (§2.2): it has no source and
 *  withdraws under the SAFE-only reversal. */
export const licenseTierEnum = pgEnum('license_tier', [
  'SAFE_LEAGUE',
  'SAFE_EDITORIAL',
  'REVIEW_SPOTRAC',
  'REVIEW_OTC',
  'MODELED',
]);

/** `SPEC.md` §7.4 — 2013, 2014 & 2019 are `provisional`; 2016, 2020 & 2021 `estimated`. */
export const capplusBadgeEnum = pgEnum('capplus_badge', [
  'provisional',
  'preseason',
  'in_season',
  'estimated',
]);

/** `team_season_results.playoff_result` — the deepest round reached. */
export const playoffResultEnum = pgEnum('playoff_result', [
  'none',
  'wild_card',
  'divisional',
  'conference',
  'super_bowl_loss',
  'super_bowl_win',
]);

/** `SPEC.md` §7.12 / §2.6 — the nine groups. */
export const positionGroupEnum = pgEnum('position_group', [
  'QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'DB', 'ST',
]);

/** `SPEC.md` §7.7. */
export const coachRoleEnum = pgEnum('coach_role', ['HC', 'OC', 'DC']);
export const regimeKindEnum = pgEnum('regime_kind', ['offseason', 'in_season']);

/* ================================================================== */
/* §7.1  team_season_results — 861 rows, grain (season, team)          */
/* ================================================================== */

export const teamSeasonResults = pgTable(
  'team_season_results',
  {
    season: integer('season').notNull(),
    team: text('team').notNull(),
    games: integer('games').notNull(),
    wins: integer('wins').notNull(),
    losses: integer('losses').notNull(),
    ties: integer('ties').notNull(),
    /** ties count half; = (wins + 0.5*ties)/games */
    winPct: doublePrecision('win_pct').notNull(),
    pointsFor: integer('points_for').notNull(),
    pointsAgainst: integer('points_against').notNull(),
    pointDiff: integer('point_diff').notNull(),
    /** Deepest round reached. Displayed beside the record; never an index input. */
    playoffResult: playoffResultEnum('playoff_result').notNull(),
    playoffGames: integer('playoff_games').notNull(),
    playoffWins: integer('playoff_wins').notNull(),
  },
  (t) => [primaryKey({ columns: [t.season, t.team] }), index('tsr_team_idx').on(t.team)],
);

/* ================================================================== */
/* §7.2  team_season_epa — 861 rows                                    */
/* ================================================================== */

export const teamSeasonEpa = pgTable(
  'team_season_epa',
  {
    season: integer('season').notNull(),
    team: text('team').notNull(),
    offPlays: integer('off_plays').notNull(),
    defPlays: integer('def_plays').notNull(),
    offEpaPerPlay: doublePrecision('off_epa_per_play').notNull(),
    defEpaPerPlay: doublePrecision('def_epa_per_play').notNull(),
    epaMarginPerPlay: doublePrecision('epa_margin_per_play').notNull(),
    offEpaTotal: doublePrecision('off_epa_total').notNull(),
    defEpaTotal: doublePrecision('def_epa_total').notNull(),
    /** Opponent-adjusted rates (`SPEC.md` §2.4); season means preserved. */
    offEpaPerPlayAdj: doublePrecision('off_epa_per_play_adj').notNull(),
    defEpaPerPlayAdj: doublePrecision('def_epa_per_play_adj').notNull(),
    /** P's EPA input since 2026-10-10 (`DECISIONS.md` 110). */
    epaMarginPerPlayAdj: doublePrecision('epa_margin_per_play_adj').notNull(),
    /** Strength of schedule: mean raw EPA margin of the opponents faced. Display only. */
    sosEpa: doublePrecision('sos_epa').notNull(),
  },
  (t) => [primaryKey({ columns: [t.season, t.team] })],
);

/* ================================================================== */
/* §7.3  team_season_cap — 416 rows, 2013–2025                         */
/* ================================================================== */

export const teamSeasonCap = pgTable(
  'team_season_cap',
  {
    season: integer('season').notNull(),
    team: text('team').notNull(),
    nPlayers: integer('n_players').notNull(),
    /** USD; cap held by ROSTERED players — NOT "cap used", never "% of cap". */
    capUsedTotal: doublePrecision('cap_used_total').notNull(),
    leagueCap: doublePrecision('league_cap').notNull(),
    capPctOfLeague: doublePrecision('cap_pct_of_league').notNull(),
    teamAdjustedCapImplied: doublePrecision('team_adjusted_cap_implied').notNull(),
    capPctOfAdjusted: doublePrecision('cap_pct_of_adjusted').notNull(),
    /** ALWAYS NULL — not derivable from this source. See `TeamSeasonCapRow`. */
    deadMoneyTotal: doublePrecision('dead_money_total'),
    /** ALWAYS NULL. */
    deadMoneyPct: doublePrecision('dead_money_pct'),
    /** USD; annual cash to rostered players. */
    cashSpentTotal: doublePrecision('cash_spent_total').notNull(),
    cashPctOfLeague: doublePrecision('cash_pct_of_league').notNull(),
    /** UPPER BOUND on dead money — never label as dead money. */
    unaccountedVsAdjusted: doublePrecision('unaccounted_vs_adjusted').notNull(),
    unaccountedPct: doublePrecision('unaccounted_pct').notNull(),
  },
  (t) => [primaryKey({ columns: [t.season, t.team] })],
);

/**
 * The compile-time guarantee SPEC §7.3 asks for: the two dead-money columns are
 * typed `null`, not `number | null`, so code that tries to read a dead-money
 * value out of this mart fails to compile.
 */
export type TeamSeasonCapRow = Omit<
  typeof teamSeasonCap.$inferSelect,
  'deadMoneyTotal' | 'deadMoneyPct'
> & { deadMoneyTotal: null; deadMoneyPct: null };

/* ================================================================== */
/* §7.4  capplus_official — 416 rows, thirteen seasons                 */
/* ================================================================== */

export const capplusOfficial = pgTable(
  'capplus_official',
  {
    season: integer('season').notNull(),
    team: text('team').notNull(),
    /** The flagship value. 100 = league average. */
    capplus: doublePrecision('capplus').notNull(),
    /** 100 + 15*P — also the Team Rating value. */
    perfIndex: doublePrecision('perf_index').notNull(),
    /** Within-season z, mean 0 SD 1. */
    p: doublePrecision('p').notNull(),
    /** Weighted COST INDEX — never "% of cap used". */
    costRec: doublePrecision('cost_rec').notNull(),
    /** Plain cap-consumed share — published beside cost_rec. */
    capConsumedRec: doublePrecision('cap_consumed_rec').notNull(),
    /** Season 25th percentile. */
    costFloor: doublePrecision('cost_floor').notNull(),
    /** Cost ÷ league-average cost, after the floor. */
    rRec: doublePrecision('r_rec').notNull(),
    /** 8 of 32 every season, by construction. */
    wasFloored: boolean('was_floored').notNull(),
    /** USD, the resolved same-stage figure. */
    deadMoneyRec: doublePrecision('dead_money_rec').notNull(),
    /** ALWAYS present — a row without it is a bug (structural test). */
    dmAsofDate: text('dm_asof_date').notNull(),
    dmAsofStage: asofStageEnum('dm_asof_stage').notNull(),
    /** true = a modeled dead-money value in an estimated season. */
    dmIsModeled: boolean('dm_is_modeled').notNull(),
    leagueMedianDeadMoneyUsd: doublePrecision('league_median_dead_money_usd'),
    licenseTier: licenseTierEnum('license_tier'),
    badge: capplusBadgeEnum('badge').notNull(),
    /** The badge's sentence; empty (NULL here) for preseason / in_season. */
    badgeReason: text('badge_reason'),
    /** 1…32 within season. */
    seasonRank: integer('season_rank').notNull(),
  },
  (t) => [primaryKey({ columns: [t.season, t.team] })],
);

/* ================================================================== */
/* §7.4 companion  team_rating — all 861 team-seasons                  */
/* "Team Rating (performance only)" — never "Cap+ (performance only)". */
/* ================================================================== */

export const teamRating = pgTable(
  'team_rating',
  {
    season: integer('season').notNull(),
    team: text('team').notNull(),
    perfIndex: doublePrecision('perf_index').notNull(),
    p: doublePrecision('p').notNull(),
    seasonRank: integer('season_rank').notNull(),
  },
  (t) => [primaryKey({ columns: [t.season, t.team] })],
);

/* ================================================================== */
/* §7.5  dead_money_team_season — 402 rows, (season, team, asof_date)  */
/* ================================================================== */

export const deadMoneyTeamSeason = pgTable(
  'dead_money_team_season',
  {
    season: integer('season').notNull(),
    team: text('team').notNull(),
    deadMoneyUsd: doublePrecision('dead_money_usd').notNull(),
    /** NOT NULL — a row without it fails the build. */
    asofDate: text('asof_date').notNull(),
    asofStage: asofStageEnum('asof_stage').notNull(),
    coverage: dmCoverageEnum('coverage').notNull(),
    /** NOT NULL — per-row citation. */
    sourceUrl: text('source_url').notNull(),
    note: text('note'),
    licenseTier: licenseTierEnum('license_tier').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.season, t.team, t.asofDate] }),
    index('dmts_season_idx').on(t.season),
  ],
);

/* ================================================================== */
/* §7.6  dead_money_ledger — 21 verified individual charges            */
/* ================================================================== */

export const deadMoneyLedger = pgTable(
  'dead_money_ledger',
  {
    id: integer('id').primaryKey(),
    player: text('player').notNull(),
    team: text('team').notNull(),
    /** e.g. "2024-2025" — a DISPLAY STRING, not a range type. */
    seasons: text('seasons').notNull(),
    totalUsd: doublePrecision('total_usd').notNull(),
    /** "53000000/32000000"; NULL for Dareus/BUF — never guessed. */
    splitBySeason: text('split_by_season'),
    /** All 21 rows are actual charges. */
    isActual: boolean('is_actual').notNull(),
    verifiedAsof: text('verified_asof').notNull(),
    sourceUrl: text('source_url').notNull(),
    notes: text('notes'),
  },
  (t) => [index('dml_team_idx').on(t.team)],
);

/* ================================================================== */
/* dead_money_display — the render-ready per-team-season resolution.    */
/* Derived convenience mart (not a §7 contract), so everything beyond   */
/* the grain is nullable: it is allowed to gain and lose columns as the */
/* ETL settles without breaking the app.                                */
/* ================================================================== */

export type DeadMoneyMethod =
  | 'measured'
  | 'reading_ref_date'
  | 'reading_other_date'
  | 'ridge_z_anchor_level';

export const deadMoneyDisplay = pgTable(
  'dead_money_display',
  {
    season: integer('season').notNull(),
    team: text('team').notNull(),
    state: metricStateEnum('state'),
    deadMoneyUsd: doublePrecision('dead_money_usd'),
    asofDate: text('asof_date'),
    asofStage: asofStageEnum('asof_stage'),
    coverage: dmCoverageEnum('coverage'),
    licenseTier: licenseTierEnum('license_tier'),
    seasonCoverage: seasonCoverageEnum('season_coverage'),
    badge: capplusBadgeEnum('badge'),
    badgeReason: text('badge_reason'),
    blankReason: text('blank_reason'),
    /** 'measured' | 'reading_ref_date' | 'reading_other_date' | 'ridge_z_anchor_level'. */
    method: text('method').$type<DeadMoneyMethod>(),
    /** true = modeled from contract data; renders with its 80% range, never bare. */
    isModeled: boolean('is_modeled'),
    /** The published reading's own date; NULL where modeled. */
    anchorAsofDate: text('anchor_asof_date'),
    /** 80% range, estimated seasons only. */
    loUsd: doublePrecision('lo_usd'),
    hiUsd: doublePrecision('hi_usd'),
    nAlternateReadings: integer('n_alternate_readings'),
    leagueMedianUsd: doublePrecision('league_median_usd'),
    teamAdjustedCapImplied: doublePrecision('team_adjusted_cap_implied'),
    leagueCap: doublePrecision('league_cap'),
    burdenOfAdjustedCap: doublePrecision('burden_of_adjusted_cap'),
    burdenOfLeagueCap: doublePrecision('burden_of_league_cap'),
    ledgerNCharges: integer('ledger_n_charges'),
    ledgerPlayers: text('ledger_players'),
    ledgerUsdAttributed: doublePrecision('ledger_usd_attributed'),
    ledgerSplitAllEstablished: boolean('ledger_split_all_established'),
    sourceUrl: text('source_url'),
    note: text('note'),
  },
  (t) => [primaryKey({ columns: [t.season, t.team] })],
);

/** The pinned same-stage rule's chosen date + stage per season. */
export const deadMoneySnapshotResolution = pgTable('dead_money_snapshot_resolution', {
  season: integer('season').primaryKey(),
  coverageClass: dmCoverageEnum('coverage_class'),
  resolvable: boolean('resolvable'),
  resolved: boolean('resolved'),
  chosenAsofDate: text('chosen_asof_date'),
  chosenAsofStage: asofStageEnum('chosen_asof_stage'),
  badge: capplusBadgeEnum('badge'),
  badgeReason: text('badge_reason'),
  chosenLicenseTier: licenseTierEnum('chosen_license_tier'),
  chosenNTeams: integer('chosen_n_teams'),
  /** Teams whose figure is published (32 in a measured season). */
  nPublishedTeams: integer('n_published_teams'),
  nCandidateSnapshots: integer('n_candidate_snapshots'),
  nFull32Snapshots: integer('n_full32_snapshots'),
  nPartialSnapshots: integer('n_partial_snapshots'),
  nTop5Snapshots: integer('n_top5_snapshots'),
  medianDeadMoneyUsd: doublePrecision('median_dead_money_usd'),
  totalDeadMoneyUsd: doublePrecision('total_dead_money_usd'),
  rule: text('rule'),
  blankReason: text('blank_reason'),
  chosenSourceUrl: text('chosen_source_url'),
});

/* ================================================================== */
/* §7.7  coaching_staff — 2,612 rows, (season, team, role, stint)       */
/* ERA-CORRECT codes here (STL/SD/OAK) — 35 codes. The derived mart     */
/* normalizes; this one deliberately does not.                          */
/* ================================================================== */

export const coachingStaff = pgTable(
  'coaching_staff',
  {
    season: integer('season').notNull(),
    /** ERA-CORRECT code. */
    team: text('team').notNull(),
    /** The normalized current-franchise code, where ETL supplies it. */
    teamCurrent: text('team_current'),
    role: coachRoleEnum('role').notNull(),
    stint: integer('stint').notNull(),
    coachId: integer('coach_id'),
    /** 'NONE' is a SENTINEL, not a person (60 rows). */
    coachName: text('coach_name').notNull(),
    /** Display + provenance only — NEVER parsed by code. */
    note: text('note'),
    sourceUrl: text('source_url').notNull(),
  },
  (t) => [primaryKey({ columns: [t.season, t.team, t.role, t.stint] })],
);

/* ================================================================== */
/* §7.7 derived  team_season_stability — 830 rows                      */
/* ================================================================== */

export const teamSeasonStability = pgTable(
  'team_season_stability',
  {
    season: integer('season').notNull(),
    /** normalized */
    team: text('team').notNull(),
    churnPoints: doublePrecision('churn_points').notNull(),
    /** 3-season decayed sum. */
    w: doublePrecision('w').notNull(),
    /** 0…100. */
    stabilityIndex: doublePrecision('stability_index').notNull(),
    /** true for 2000, 2001. */
    windowTruncated: boolean('window_truncated').notNull(),
    /** Closing holders; 'NONE@<HC>' where unfilled. */
    hc: text('hc').notNull(),
    oc: text('oc').notNull(),
    dc: text('dc').notNull(),
    hcTenureSeasons: integer('hc_tenure_seasons').notNull(),
    ocTenureSeasons: integer('oc_tenure_seasons').notNull(),
    dcTenureSeasons: integer('dc_tenure_seasons').notNull(),
    hcStints: integer('hc_stints').notNull(),
    ocStints: integer('oc_stints').notNull(),
    dcStints: integer('dc_stints').notNull(),
    /** e.g. "NE-2000-Belichick". */
    regimeId: text('regime_id').notNull(),
    regimeStartSeason: integer('regime_start_season'),
    regimeSeasonN: integer('regime_season_n').notNull(),
  },
  (t) => [primaryKey({ columns: [t.season, t.team] })],
);

/* ================================================================== */
/* §7.7 derived  regime_events — one row per regime change             */
/* dm_next1 / dm_next2 are persisted as the flattened discriminated     */
/* union SPEC declares: state + value + asof, or state + reason.        */
/* ================================================================== */

export const regimeEvents = pgTable(
  'regime_events',
  {
    team: text('team').notNull(),
    /** The season the new regime begins. */
    season: integer('season').notNull(),
    kind: regimeKindEnum('kind').notNull(),
    outgoingHc: text('outgoing_hc').notNull(),
    incomingHc: text('incoming_hc').notNull(),
    regimeId: text('regime_id').notNull(),
    prevRegimeId: text('prev_regime_id'),
    prevRegimeSeasons: integer('prev_regime_seasons'),

    dmNext1Season: integer('dm_next1_season'),
    dmNext1State: metricStateEnum('dm_next1_state'),
    dmNext1Usd: doublePrecision('dm_next1_usd'),
    dmNext1AsofDate: text('dm_next1_asof_date'),
    dmNext1AsofStage: asofStageEnum('dm_next1_asof_stage'),
    dmNext1LeagueMedianUsd: doublePrecision('dm_next1_league_median_usd'),
    dmNext1BlankReason: text('dm_next1_blank_reason'),

    dmNext2Season: integer('dm_next2_season'),
    dmNext2State: metricStateEnum('dm_next2_state'),
    dmNext2Usd: doublePrecision('dm_next2_usd'),
    dmNext2AsofDate: text('dm_next2_asof_date'),
    dmNext2AsofStage: asofStageEnum('dm_next2_asof_stage'),
    dmNext2LeagueMedianUsd: doublePrecision('dm_next2_league_median_usd'),
    dmNext2BlankReason: text('dm_next2_blank_reason'),
  },
  (t) => [primaryKey({ columns: [t.team, t.season] })],
);

/* ================================================================== */
/* §7.8  draft marts                                                   */
/* NOTE: `car_av` is NOT in this schema — 100% null in source,          */
/* deliberately excluded, and a structural test asserts its absence.    */
/* ================================================================== */

export const draftPick = pgTable(
  'draft_pick',
  {
    season: integer('season').notNull(), // 2000…2025
    /** PFR_DRAFT_TEAM_MAP then normalize_team. */
    team: text('team').notNull(),
    round: integer('round').notNull(),
    /** overall */
    pick: integer('pick').notNull(),
    playerName: text('player_name').notNull(),
    gsisId: text('gsis_id'), // 95.7% over window
    pfrPlayerId: text('pfr_player_id'), // 96.1%
    position: text('position').notNull(),
    side: text('side'),
    college: text('college'),
    /** Fitzgerald–Spielberger. */
    chartValue: doublePrecision('chart_value').notNull(),
    /** 'published' or the labelled extension rule beyond pick 256. */
    valueBasis: text('value_basis'),
    games: integer('games'), // 91.2%
    /** PRIMARY return measure. */
    wAv: integer('w_av'), // 91.2%
    seasonsStarted: integer('seasons_started').notNull(),
    probowls: integer('probowls').notNull(),
    allpro: integer('allpro').notNull(),
    hof: boolean('hof').notNull(),
  },
  (t) => [primaryKey({ columns: [t.season, t.pick] }), index('dp_team_season_idx').on(t.team, t.season)],
);

export const draftClassSummary = pgTable(
  'draft_class_summary',
  {
    season: integer('season').notNull(),
    team: text('team').notNull(),
    nPicks: integer('n_picks').notNull(),
    /** Σ chart_value. */
    capital: doublePrecision('capital').notNull(),
    /** 1…32 in season. */
    capitalRank: integer('capital_rank').notNull(),
    returnGames: integer('return_games'),
    returnWAv: integer('return_w_av'),
    returnSeasonsStarted: integer('return_seasons_started').notNull(),
    returnProbowls: integer('return_probowls'),
    returnAllpro: integer('return_allpro'),
    wAvPer1000Capital: doublePrecision('w_av_per_1000_capital'),
    gamesPer1000Capital: doublePrecision('games_per_1000_capital'),
    seasonsStartedPer1000Capital: doublePrecision('seasons_started_per_1000_capital'),
    /** Printed on the card. */
    nExcludedNoGsis: integer('n_excluded_no_gsis').notNull(),
    /** season >= 2013 */
    snapsAvailable: boolean('snaps_available').notNull(),
    dollarFramingAvailable: boolean('dollar_framing_available'),
    dollarFramingBlankReason: text('dollar_framing_blank_reason'),
    /** Seasons played since the draft. */
    seasonsElapsed: integer('seasons_elapsed').notNull(),
    /** 'early' = too few seasons for the return to have settled. */
    maturity: text('maturity').$type<'early' | 'mature'>().notNull(),
    /** return_w_av ÷ that draft year's mean class × 100; 100 = the year's average class. */
    draftIndex: doublePrecision('draft_index'),
    draftIndexRank: integer('draft_index_rank'),
  },
  (t) => [primaryKey({ columns: [t.season, t.team] })],
);

/** The published Fitzgerald–Spielberger chart, per-row citation (curated). */
export const fitzgeraldSpielbergerChart = pgTable('fitzgerald_spielberger_chart', {
  pick: integer('pick').primaryKey(),
  chartValue: doublePrecision('chart_value').notNull(),
  valueBasis: text('value_basis'),
  sourceUrl: text('source_url'),
  sourceNote: text('source_note'),
  sourceReference: text('source_reference'),
  transcribedAsof: text('transcribed_asof'),
});

/* ================================================================== */
/* §7.9  player-season marts                                           */
/* ================================================================== */

export const playerSeasonCap = pgTable(
  'player_season_cap',
  {
    /** INTERNAL KEY — 100% coverage, 1 otc_id -> 1 gsis_id. */
    otcId: integer('otc_id').notNull(),
    /** 91.9% of contracts; 32 gsis_ids map to >1 otc_id. */
    gsisId: text('gsis_id'),
    player: text('player'),
    /** 2013…2025 for team-total-safe use. */
    season: integer('season').notNull(),
    team: text('team').notNull(),
    positionAtSigning: text('position_at_signing'),
    positionGroup: positionGroupEnum('position_group'),
    /** USD (source is $ millions — ETL converts). */
    capNumber: doublePrecision('cap_number').notNull(),
    /** USD, ANNUAL not cumulative. */
    cashPaid: doublePrecision('cash_paid'),
    baseSalary: doublePrecision('base_salary'),
    proratedBonus: doublePrecision('prorated_bonus'),
    rosterBonus: doublePrecision('roster_bonus'),
    guaranteedSalary: doublePrecision('guaranteed_salary'),
    /** 96.6% — DENOMINATOR IS THE ADJUSTED CAP. */
    capPercent: doublePrecision('cap_percent'),

    /* Contract card (§3.3 item 3) — top-level contract columns. */
    contractYearSigned: integer('contract_year_signed'),
    contractYears: integer('contract_years'),
    contractValue: doublePrecision('contract_value'),
    contractApy: doublePrecision('contract_apy'),
    contractGuaranteed: doublePrecision('contract_guaranteed'),
    contractApyCapPct: doublePrecision('contract_apy_cap_pct'),

    /* Dead-money markers (§3.3 item 4). The team that ate the charge is NOT
       necessarily the team on this row — the source follows the player. */
    dmLedgerCharge: boolean('dm_ledger_charge'),
    dmLedgerPlayer: text('dm_ledger_player'),
    dmLedgerTeam: text('dm_ledger_team'),
    dmLedgerUsd: doublePrecision('dm_ledger_usd'),
    dmLedgerTotalUsd: doublePrecision('dm_ledger_total_usd'),
    dmLedgerSeasons: text('dm_ledger_seasons'),
    dmLedgerSplitEstablished: boolean('dm_ledger_split_established'),
    dmLedgerIsActual: boolean('dm_ledger_is_actual'),
    dmLedgerSourceUrl: text('dm_ledger_source_url'),
  },
  (t) => [
    primaryKey({ columns: [t.otcId, t.season, t.team] }),
    index('psc_season_team_idx').on(t.season, t.team),
    index('psc_otc_idx').on(t.otcId),
  ],
);

/** §7.9 — snaps 2013+ only; `off_pct` is a 0–1 FRACTION, not 0–100. */
export const playerSeasonAvailability = pgTable(
  'player_season_availability',
  {
    gsisId: text('gsis_id').notNull(),
    season: integer('season').notNull(),
    team: text('team').notNull(),
    player: text('player'),
    pfrPlayerId: text('pfr_player_id'),
    games: integer('games'),
    offSnaps: integer('off_snaps'),
    defSnaps: integer('def_snaps'),
    stSnaps: integer('st_snaps'),
    offPct: real('off_pct'),
  },
  (t) => [primaryKey({ columns: [t.gsisId, t.season, t.team] })],
);

/* ================================================================== */
/* §7.10  player_images — licence metadata, one row per player          */
/* This mart also carries the v1 PLAYER POPULATION (DECISIONS 53: the   */
/* 251 audited players), which is what `/player/[id]` enumerates.        */
/* ================================================================== */

export const playerImages = pgTable(
  'player_images',
  {
    /** otc_id, as text — this is the `{id}` in `/player/{id}`. */
    playerId: text('player_id').primaryKey(),
    player: text('player'),
    team: text('team'),
    position: text('position'),
    hasUsableImage: boolean('has_usable_image').notNull(),
    /** THE key for re-fetch and takedown. */
    fileTitle: text('file_title'),
    /** A FETCH source, never a hotlink. */
    fileUrl: text('file_url'),
    width: integer('width'),
    height: integer('height'),
    /** Non-null only via Artist -> Credit -> uploader fallback. */
    author: text('author'),
    /** Display, e.g. "CC BY-SA 2.0". */
    license: text('license'),
    /** FILTER ON THIS, e.g. "cc-by-sa-2.0". */
    licenseMachine: text('license_machine'),
    /** NULL for all 14 PD files — must not be NOT NULL. */
    licenseUrl: text('license_url'),
    /** Prerendered credit line. */
    attribution: text('attribution'),
    /** true for 91.4%. */
    attributionRequired: boolean('attribution_required'),
    /** true for 48.0% — derived from license_machine. */
    shareAlike: boolean('share_alike'),
    /** 'personality' on 12 files. Operator-facing, never rendered to readers. */
    restrictions: text('restrictions'),
    verificationMethod: text('verification_method'),
    wikidataQid: text('wikidata_qid'),
    wikipediaArticle: text('wikipedia_article'),
    notes: text('notes'),
    /** A cached asset without a re-verification timestamp silently rots. */
    lastVerifiedAt: text('last_verified_at'),

    /* Served-asset columns, present when the mart is built alongside the
       PlayerMark fetch. `renders_photo` is the resolution-floor branch. */
    meetsMinWidth: boolean('meets_min_width'),
    rendersPhoto: boolean('renders_photo'),
    assetFile: text('asset_file'),
    rendition: text('rendition'),
    renditionWidth: integer('rendition_width'),
    renditionHeight: integer('rendition_height'),

    /* Population metadata — how the 251 were selected (DECISIONS 53). */
    selection: text('selection'),
    capRank: integer('cap_rank'),
    maxCapSeason: integer('max_cap_season'),
    maxCapUsd: doublePrecision('max_cap_usd'),
    careerFirstSeason: integer('career_first_season'),
    careerLastSeason: integer('career_last_season'),
  },
  (t) => [index('pi_player_idx').on(t.player)],
);

/* ================================================================== */
/* §7.11  league_cap — 32 rows, 1994–2025                              */
/* ================================================================== */

export const leagueCap = pgTable('league_cap', {
  year: integer('year').primaryKey(),
  /** NULL for 2010 — uncapped year, no denominator exists. */
  capUsd: doublePrecision('cap_usd'),
  note: text('note'),
  sourceUrl: text('source_url').notNull(),
  secondarySourceUrl: text('secondary_source_url'),
});

/* ================================================================== */
/* §7.12  position_allocation — (season, team, position_group), 2013+  */
/* ================================================================== */

export const positionAllocation = pgTable(
  'position_allocation',
  {
    season: integer('season').notNull(),
    team: text('team').notNull(),
    positionGroup: positionGroupEnum('position_group').notNull(),
    nPlayers: integer('n_players'),
    capUsd: doublePrecision('cap_usd').notNull(),
    /** NOT "share of cap". */
    shareOfRosteredCap: doublePrecision('share_of_rostered_cap').notNull(),
    leagueShare: doublePrecision('league_share').notNull(),
    deltaVsLeague: doublePrecision('delta_vs_league').notNull(),
  },
  (t) => [primaryKey({ columns: [t.season, t.team, t.positionGroup] })],
);

/* ================================================================== */
/* §7.13  capplus_context — 416 rows, (season, team), 2013–2025         */
/* The gate #1 reopen mart (§2.10). Facts and index columns for all 13  */
/* seasons; an INDEX column is NULL only where Cap+ itself is blank     */
/* (the SAFE-only reversal), and then for the whole season.             */
/* `capplus_obligation`, `obligation_rank`, `mortgage_alpha` were       */
/* removed 2026-10-10 (DECISIONS 111): the contract forbids them.       */
/* ================================================================== */

export const capplusContext = pgTable(
  'capplus_context',
  {
    season: integer('season').notNull(),
    team: text('team').notNull(),
    startingQb: text('starting_qb').notNull(),
    startingQbGsisId: text('starting_qb_gsis_id'),
    startingQbOtcId: integer('starting_qb_otc_id').notNull(),
    /** Most offensive snaps; `cap` = cap-number fallback (0 of 416 today). */
    qbStarterMethod: text('qb_starter_method').$type<'snaps' | 'cap'>().notNull(),
    /** USD. */
    qbCapNumber: doublePrecision('qb_cap_number').notNull(),
    /** Share of the LEAGUE cap. */
    qbCapShare: doublePrecision('qb_cap_share').notNull(),
    qbContractYearSigned: integer('qb_contract_year_signed').notNull(),
    /** NULL = undrafted (no `draft_pick` row) — never rookie-window. */
    qbDraftYear: integer('qb_draft_year'),
    qbDraftRound: integer('qb_draft_round'),
    qbRookieWindow: boolean('qb_rookie_window').notNull(),
    /** USD. */
    leagueMedianStarterQbCap: doublePrecision('league_median_starter_qb_cap').notNull(),
    stratumSize: integer('stratum_size').notNull(),
    /** INDEX — NULL only where Cap+ is blank. */
    stratumRank: integer('stratum_rank'),
    perfIndex: doublePrecision('perf_index').notNull(),
    perfRank: integer('perf_rank').notNull(),
    /** INDEX — a COPY of `capplus_official.capplus` (§7.4). */
    capplus: doublePrecision('capplus'),
    capplusRank: integer('capplus_rank'),
    /** INDEX — rendered as "QB-neutral Cap+". */
    capplusQbNeutral: doublePrecision('capplus_qb_neutral'),
    qbNeutralRank: integer('qb_neutral_rank'),
    /** INDEX — capplus − capplus_qb_neutral. */
    qbTimingPts: doublePrecision('qb_timing_pts'),
    /** INDEX — capplus_qb_neutral − 100. */
    rosterPts: doublePrecision('roster_pts'),
    /** Cash paid ÷ league cap. */
    cashShare: doublePrecision('cash_share').notNull(),
    /** USD — flat-proration estimate, blind to void years. */
    futureMortgageUsd: doublePrecision('future_mortgage_usd').notNull(),
    /** Mortgage ÷ this season's league cap. */
    futureMortgageShare: doublePrecision('future_mortgage_share').notNull(),
    mortgageRowsUnknown: integer('mortgage_rows_unknown').notNull(),
  },
  (t) => [primaryKey({ columns: [t.season, t.team] })],
);

/* ================================================================== */
/* team_meta — conference / division / colours.                        */
/* Conference, division and colour are ABSENT from teams.csv (§5.1) and */
/* come from `teams_colors_logos` via the asset pipeline's chipdata.json.*/
/* ================================================================== */

export const teamMeta = pgTable('team_meta', {
  abbr: text('abbr').primaryKey(),
  teamName: text('team_name').notNull(),
  conf: text('conf').notNull(),
  division: text('division').notNull(),
  divisionSlug: text('division_slug').notNull(),
  primaryColor: text('primary_color').notNull(),
  secondaryColor: text('secondary_color').notNull(),
  /** Black-or-white, computed by relative luminance of primary (§5.1). */
  glyphColor: text('glyph_color').notNull(),
  glyphContrast: doublePrecision('glyph_contrast').notNull(),
  pairContrast: doublePrecision('pair_contrast').notNull(),
});

/* ================================================================== */
/* credits — from data/marts/credits.json (§5.2, /credits page)        */
/* Deduplicated by author: three authors account for ~49% of usable     */
/* photos, so 244 near-identical lines would be worse than useless.     */
/* ================================================================== */

export const creditEntry = pgTable(
  'credit_entry',
  {
    otcId: text('otc_id').primaryKey(),
    player: text('player').notNull(),
    team: text('team'),
    license: text('license').notNull(),
    licenseMachine: text('license_machine').notNull(),
    licenseUrl: text('license_url'),
    author: text('author').notNull(),
    attribution: text('attribution').notNull(),
    attributionRequired: boolean('attribution_required').notNull(),
    shareAlike: boolean('share_alike').notNull(),
    restrictions: text('restrictions'),
    file: text('file'),
    sourceFilePageUrl: text('source_file_page_url'),
  },
  (t) => [index('ce_license_idx').on(t.licenseMachine)],
);

export const creditLicenseGroup = pgTable('credit_license_group', {
  licenseMachine: text('license_machine').primaryKey(),
  license: text('license').notNull(),
  licenseUrl: text('license_url'),
  shareAlike: boolean('share_alike').notNull(),
  attributionRequired: boolean('attribution_required').notNull(),
  assetCount: integer('asset_count').notNull(),
  authorCount: integer('author_count').notNull(),
  sortOrder: integer('sort_order').notNull(),
});

export const creditAuthor = pgTable(
  'credit_author',
  {
    id: integer('id').primaryKey(),
    licenseMachine: text('license_machine').notNull(),
    author: text('author').notNull(),
    attribution: text('attribution').notNull(),
    assetCount: integer('asset_count').notNull(),
    /** JSON array of player names, ordering preserved from credits.json. */
    players: jsonb('players').$type<string[]>().notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [index('ca_license_idx').on(t.licenseMachine)],
);

/** Policy / summary / logo blocks from credits.json, verbatim. */
export const creditsMeta = pgTable('credits_meta', {
  id: integer('id').primaryKey(),
  doc: jsonb('doc').$type<Record<string, unknown>>().notNull(),
});

/* ================================================================== */
/* seed_manifest — which marts this snapshot actually contains.         */
/*                                                                      */
/* The ETL is still landing marts. The data layer reads this table to    */
/* decide whether a slot renders a value or a `Metric` blank, so a mart  */
/* that has not shipped yet degrades to an explicit, stated absence      */
/* instead of an exception or — worse — a silent zero.                   */
/* ================================================================== */

export const seedManifest = pgTable('seed_manifest', {
  tableName: text('table_name').primaryKey(),
  sourceFile: text('source_file'),
  status: text('status').notNull(), // 'seeded' | 'skipped'
  reason: text('reason'),
  rowCount: integer('row_count').notNull(),
  expectedRows: integer('expected_rows'),
  columnsSeeded: integer('columns_seeded'),
  columnsMissing: text('columns_missing'),
  columnsExtra: text('columns_extra'),
});

/** Snapshot-level build stamp: the data version the pages were rendered from. */
export const seedStamp = pgTable('seed_stamp', {
  id: integer('id').primaryKey(),
  doc: jsonb('doc').$type<Record<string, unknown>>().notNull(),
});

/* ================================================================== */

export const schema = {
  teamSeasonResults,
  teamSeasonEpa,
  teamSeasonCap,
  capplusOfficial,
  teamRating,
  deadMoneyTeamSeason,
  deadMoneyLedger,
  deadMoneyDisplay,
  deadMoneySnapshotResolution,
  coachingStaff,
  teamSeasonStability,
  regimeEvents,
  draftPick,
  draftClassSummary,
  fitzgeraldSpielbergerChart,
  playerSeasonCap,
  playerSeasonAvailability,
  playerImages,
  leagueCap,
  positionAllocation,
  capplusContext,
  teamMeta,
  creditEntry,
  creditLicenseGroup,
  creditAuthor,
  creditsMeta,
  seedManifest,
  seedStamp,
};

export type Schema = typeof schema;
