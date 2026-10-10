/**
 * Seed — `data/marts/*.csv` + curated CSVs + `credits.json` -> the database.
 *
 *   npm run seed                  # PGlite (local-first). Writes .data/pgdata.tar.gz
 *   DATABASE_URL=... npm run seed # Neon / any Postgres. Same program, same schema.
 *
 * PROPERTIES (`ARCHITECTURE.md` §7)
 *  1. DESTRUCTIVE AND IDEMPOTENT. Never an upsert-merge — the database is always
 *     exactly the marts. Every table is DROPped and recreated from the Drizzle
 *     schema before a row is written, on both drivers; PGlite additionally
 *     deletes and rebuilds its data directory, so a re-run cannot inherit state.
 *  2. TOLERANT MART LOCATION. `lib/paths.ts::findMart` is the TypeScript twin of
 *     `tests/conftest.py::find_mart` — `data/marts`, then `data/curated`, then
 *     `data/curated/staging`; bare stems try `.csv` then `.parquet`; BUILD_PLAN
 *     alias filenames are accepted as extra candidates.
 *  3. TOLERANT OF MARTS THAT DO NOT EXIST YET. The ETL is still landing marts.
 *     A missing file, or a file missing a NOT NULL column, is REPORTED and
 *     SKIPPED — never fatal. The program seeds what exists, prints a manifest of
 *     seeded/skipped, and exits 0. The manifest is written into the database
 *     (`seed_manifest`) so the data layer can render an explicit blank for an
 *     absent mart instead of throwing or, worse, showing a silent zero.
 *  4. THE DEAD_MONEY_TIER FILTER (`SPEC.md` §7.5) is applied at seed time.
 *  5. POST-SEED STRUCTURAL ASSERTIONS are evaluated and printed. They are
 *     reported as warnings while Phase 1 is in flight; `--strict` makes them fail.
 */

import { createReadStream } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'csv-parse';
import { readFile } from 'node:fs/promises';
import { sql, type SQL } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { getTableConfig } from 'drizzle-orm/pg-core';

import { findMart, MARTS_DIR, rel, REPO_DIR } from '../lib/paths';
import { LICENSE_TIERS_ALLOWED, DEAD_MONEY_TIER } from '../lib/flags';
import { divisionSlug } from '../lib/teams';
import * as s from './schema';
import {
  connectPglite,
  connectPostgres,
  databaseUrl,
  pgliteDataPath,
  pgliteDumpPath,
  type Connection,
} from './client';

const STRICT = process.argv.includes('--strict');

/* ================================================================== */
/* CSV reading                                                         */
/* ================================================================== */

type Row = Record<string, string>;

async function readCsvOnce(file: string): Promise<{ header: string[]; rows: Row[] }> {
  const rows: Row[] = [];
  let header: string[] = [];
  const parser = createReadStream(file).pipe(
    parse({
      columns: (h: string[]) => ((header = h), h),
      bom: true,
      skip_empty_lines: true,
      // The ETL rewrites marts in place; a short final row means we caught the
      // file mid-write. Tolerate it here and drop the row after mapping.
      relax_column_count: true,
    }),
  );
  for await (const r of parser) rows.push(r as Row);
  return { header, rows };
}

/**
 * Read a mart, retrying briefly. `etl/` rewrites marts in place and byte-stably;
 * a read that lands inside a write sees a truncated file. Three attempts, 400ms
 * apart, is enough to step over any single rewrite without masking a real fault.
 */
async function readCsv(file: string): Promise<{ header: string[]; rows: Row[] }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await readCsvOnce(file);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr;
}

/* ================================================================== */
/* Value coercion                                                      */
/*                                                                     */
/* The CSVs are the ETL's byte-stable output: empty string is NULL,     */
/* booleans are Python `True`/`False` (and, from a pandas round-trip,   */
/* sometimes `TRUE`/`true`/`1`), money is whole dollars possibly with a */
/* trailing `.0`. Nothing here computes a metric; this is parsing only. */
/* ================================================================== */

const NULLISH = new Set(['', 'NA', 'NaN', 'nan', 'None', 'NULL', 'null', '<NA>']);

/** Drizzle wraps driver errors; the useful sentence is on `cause`. */
function why(err: unknown): string {
  let e = err as { message?: string; cause?: unknown };
  const seen = new Set<unknown>();
  while (e?.cause && !seen.has(e.cause)) {
    seen.add(e.cause);
    e = e.cause as { message?: string; cause?: unknown };
  }
  return String(e?.message ?? err).split('\n')[0].slice(0, 240);
}

function asText(v: string | undefined): string | null {
  if (v === undefined) return null;
  const t = v.trim();
  return NULLISH.has(t) ? null : v;
}

function asNumber(v: string | undefined): number | null {
  const t = asText(v);
  if (t === null) return null;
  const n = Number(t.trim());
  return Number.isFinite(n) ? n : null;
}

function asInt(v: string | undefined): number | null {
  const n = asNumber(v);
  return n === null ? null : Math.round(n);
}

function asBool(v: string | undefined): boolean | null {
  const t = asText(v);
  if (t === null) return null;
  const l = t.trim().toLowerCase();
  if (['true', 't', '1', 'yes'].includes(l)) return true;
  if (['false', 'f', '0', 'no'].includes(l)) return false;
  return null;
}

/* ================================================================== */
/* Loader definitions                                                  */
/* ================================================================== */

interface Loader<T> {
  /** Drizzle table. */
  table: PgTable;
  /** Table name for the manifest. */
  name: string;
  /** Candidate filenames, in `findMart` order. BUILD_PLAN aliases welcome. */
  candidates: string[];
  /** Columns that must be present in the CSV or the mart is skipped. */
  required: string[];
  /** CSV row -> insert object. Return `null` to drop the row (tier filter). */
  map: (r: Row) => T | null;
  /** Expected row count from `etl/config.py::EXPECTED_ROWS`, for the report. */
  expected?: number;
}

function loader<T>(l: Loader<T>): Loader<T> {
  return l;
}

/* ------------------------------------------------------------------ */

const teamSeasonResults = loader({
  table: s.teamSeasonResults,
  name: 'team_season_results',
  candidates: ['team_season_results'],
  required: ['season', 'team', 'games', 'wins', 'losses', 'ties', 'win_pct', 'points_for', 'points_against', 'point_diff'],
  expected: 861,
  map: (r) => ({
    season: asInt(r.season)!,
    team: asText(r.team)!,
    games: asInt(r.games)!,
    wins: asInt(r.wins)!,
    losses: asInt(r.losses)!,
    ties: asInt(r.ties)!,
    winPct: asNumber(r.win_pct)!,
    pointsFor: asInt(r.points_for)!,
    pointsAgainst: asInt(r.points_against)!,
    pointDiff: asInt(r.point_diff)!,
  }),
});

const teamSeasonEpa = loader({
  table: s.teamSeasonEpa,
  name: 'team_season_epa',
  candidates: ['team_season_epa'],
  required: ['season', 'team', 'off_plays', 'def_plays', 'off_epa_per_play', 'def_epa_per_play', 'epa_margin_per_play', 'off_epa_total', 'def_epa_total'],
  expected: 861,
  map: (r) => ({
    season: asInt(r.season)!,
    team: asText(r.team)!,
    offPlays: asInt(r.off_plays)!,
    defPlays: asInt(r.def_plays)!,
    offEpaPerPlay: asNumber(r.off_epa_per_play)!,
    defEpaPerPlay: asNumber(r.def_epa_per_play)!,
    epaMarginPerPlay: asNumber(r.epa_margin_per_play)!,
    offEpaTotal: asNumber(r.off_epa_total)!,
    defEpaTotal: asNumber(r.def_epa_total)!,
  }),
});

const teamSeasonCap = loader({
  table: s.teamSeasonCap,
  name: 'team_season_cap',
  candidates: ['team_season_cap'],
  required: ['season', 'team', 'n_players', 'cap_used_total', 'league_cap', 'cash_spent_total'],
  expected: 416,
  map: (r) => ({
    season: asInt(r.season)!,
    team: asText(r.team)!,
    nPlayers: asInt(r.n_players)!,
    capUsedTotal: asNumber(r.cap_used_total)!,
    leagueCap: asNumber(r.league_cap)!,
    capPctOfLeague: asNumber(r.cap_pct_of_league)!,
    teamAdjustedCapImplied: asNumber(r.team_adjusted_cap_implied)!,
    capPctOfAdjusted: asNumber(r.cap_pct_of_adjusted)!,
    // ALWAYS NULL — SPEC §7.3. Never read from this mart.
    deadMoneyTotal: null,
    deadMoneyPct: null,
    cashSpentTotal: asNumber(r.cash_spent_total)!,
    cashPctOfLeague: asNumber(r.cash_pct_of_league)!,
    unaccountedVsAdjusted: asNumber(r.unaccounted_vs_adjusted)!,
    unaccountedPct: asNumber(r.unaccounted_pct)!,
  }),
});

const capplusOfficial = loader({
  table: s.capplusOfficial,
  name: 'capplus_official',
  candidates: ['capplus_official', 'capplus'],
  required: ['season', 'team', 'capplus', 'perf_index', 'P', 'dm_asof_date', 'dm_asof_stage', 'badge', 'season_rank'],
  expected: 288,
  map: (r) => ({
    season: asInt(r.season)!,
    team: asText(r.team)!,
    capplus: asNumber(r.capplus)!,
    perfIndex: asNumber(r.perf_index)!,
    p: asNumber(r.P ?? r.p)!,
    costRec: asNumber(r.cost_rec)!,
    capConsumedRec: asNumber(r.cap_consumed_rec)!,
    costFloor: asNumber(r.cost_floor)!,
    rRec: asNumber(r.R_rec ?? r.r_rec)!,
    wasFloored: asBool(r.was_floored) ?? false,
    deadMoneyRec: asNumber(r.dead_money_rec)!,
    dmAsofDate: asText(r.dm_asof_date)!,
    dmAsofStage: asText(r.dm_asof_stage)! as 'preseason',
    leagueMedianDeadMoneyUsd: asNumber(r.league_median_dead_money_usd),
    licenseTier: asText(r.license_tier) as 'SAFE_LEAGUE' | null,
    badge: asText(r.badge)! as 'provisional',
    seasonRank: asInt(r.season_rank)!,
  }),
});

const teamRating = loader({
  table: s.teamRating,
  name: 'team_rating',
  candidates: ['team_rating'],
  required: ['season', 'team', 'perf_index', 'P', 'season_rank'],
  expected: 861,
  map: (r) => ({
    season: asInt(r.season)!,
    team: asText(r.team)!,
    perfIndex: asNumber(r.perf_index)!,
    p: asNumber(r.P ?? r.p)!,
    seasonRank: asInt(r.season_rank)!,
  }),
});

const deadMoneyTeamSeason = loader({
  table: s.deadMoneyTeamSeason,
  name: 'dead_money_team_season',
  candidates: ['dead_money_team_season'],
  required: ['season', 'team', 'dead_money_usd', 'asof_date', 'asof_stage', 'coverage', 'source_url'],
  expected: 370,
  map: (r) => {
    // §7.5 — the DEAD_MONEY_TIER filter, applied at seed time (RISKS.md risk 1).
    // Rows without a derived tier are treated as REVIEW and drop under SAFE_ONLY.
    const tier = asText(r.license_tier) ?? 'REVIEW_OTC';
    if (!LICENSE_TIERS_ALLOWED.includes(tier)) return null;
    return {
      season: asInt(r.season)!,
      team: asText(r.team)!,
      deadMoneyUsd: asNumber(r.dead_money_usd)!,
      asofDate: asText(r.asof_date)!,
      asofStage: asText(r.asof_stage)! as 'preseason',
      coverage: asText(r.coverage)! as 'full32',
      sourceUrl: asText(r.source_url)!,
      note: asText(r.note),
      licenseTier: tier as 'SAFE_LEAGUE',
    };
  },
});

let ledgerId = 0;
const deadMoneyLedger = loader({
  table: s.deadMoneyLedger,
  name: 'dead_money_ledger',
  candidates: ['dead_money_ledger'],
  required: ['player', 'team', 'seasons', 'total_usd', 'is_actual', 'verified_asof', 'source_url'],
  expected: 21,
  map: (r) => ({
    id: ledgerId++,
    player: asText(r.player)!,
    team: asText(r.team)!,
    seasons: asText(r.seasons)!,
    totalUsd: asNumber(r.total_usd)!,
    splitBySeason: asText(r.split_by_season),
    isActual: asBool(r.is_actual) ?? true,
    verifiedAsof: asText(r.verified_asof)!,
    sourceUrl: asText(r.source_url)!,
    notes: asText(r.notes),
  }),
});

const deadMoneyDisplay = loader({
  table: s.deadMoneyDisplay,
  name: 'dead_money_display',
  candidates: ['dead_money_display'],
  required: ['season', 'team'],
  map: (r) => ({
    season: asInt(r.season)!,
    team: asText(r.team)!,
    state: (asText(r.state) ?? (asNumber(r.dead_money_usd) === null ? 'blank' : 'value')) as 'value',
    deadMoneyUsd: asNumber(r.dead_money_usd),
    asofDate: asText(r.asof_date),
    asofStage: asText(r.asof_stage) as 'preseason' | null,
    coverage: asText(r.coverage) as 'full32' | null,
    licenseTier: asText(r.license_tier) as 'SAFE_LEAGUE' | null,
    seasonCoverage: asText(r.season_coverage) as 'full32' | null,
    badge: asText(r.badge) as 'provisional' | null,
    blankReason: asText(r.blank_reason),
    nAlternateReadings: asInt(r.n_alternate_readings),
    leagueMedianUsd: asNumber(r.league_median_usd),
    teamAdjustedCapImplied: asNumber(r.team_adjusted_cap_implied),
    leagueCap: asNumber(r.league_cap),
    burdenOfAdjustedCap: asNumber(r.burden_of_adjusted_cap),
    burdenOfLeagueCap: asNumber(r.burden_of_league_cap),
    ledgerNCharges: asInt(r.ledger_n_charges),
    ledgerPlayers: asText(r.ledger_players),
    ledgerUsdAttributed: asNumber(r.ledger_usd_attributed),
    ledgerSplitAllEstablished: asBool(r.ledger_split_all_established),
    sourceUrl: asText(r.source_url),
    note: asText(r.note),
  }),
});

const deadMoneySnapshotResolution = loader({
  table: s.deadMoneySnapshotResolution,
  name: 'dead_money_snapshot_resolution',
  candidates: ['dead_money_snapshot_resolution'],
  required: ['season'],
  map: (r) => ({
    season: asInt(r.season)!,
    coverageClass: asText(r.coverage_class) as 'full32' | null,
    resolvable: asBool(r.resolvable),
    resolved: asBool(r.resolved),
    chosenAsofDate: asText(r.chosen_asof_date),
    chosenAsofStage: asText(r.chosen_asof_stage) as 'preseason' | null,
    badge: asText(r.badge) as 'provisional' | null,
    chosenLicenseTier: asText(r.chosen_license_tier) as 'SAFE_LEAGUE' | null,
    chosenNTeams: asInt(r.chosen_n_teams),
    nCandidateSnapshots: asInt(r.n_candidate_snapshots),
    nFull32Snapshots: asInt(r.n_full32_snapshots),
    nPartialSnapshots: asInt(r.n_partial_snapshots),
    nTop5Snapshots: asInt(r.n_top5_snapshots),
    medianDeadMoneyUsd: asNumber(r.median_dead_money_usd),
    totalDeadMoneyUsd: asNumber(r.total_dead_money_usd),
    rule: asText(r.rule),
    blankReason: asText(r.blank_reason),
    chosenSourceUrl: asText(r.chosen_source_url),
  }),
});

const coachingStaff = loader({
  table: s.coachingStaff,
  name: 'coaching_staff',
  candidates: ['coaching_staff'],
  required: ['season', 'team', 'role', 'coach_name', 'source_url'],
  expected: 2612,
  map: (r) => ({
    season: asInt(r.season)!,
    team: asText(r.team)!,
    teamCurrent: asText(r.team_current),
    role: asText(r.role)! as 'HC',
    // The curated file has no `stint`; the derived mart does. Default to 1 so the
    // grain stays (season, team, role, stint) either way.
    stint: asInt(r.stint) ?? 1,
    coachId: asInt(r.coach_id),
    coachName: asText(r.coach_name)!,
    note: asText(r.note),
    sourceUrl: asText(r.source_url)!,
  }),
});

const teamSeasonStability = loader({
  table: s.teamSeasonStability,
  name: 'team_season_stability',
  candidates: ['team_season_stability', 'stability_index'],
  required: ['season', 'team', 'churn_points', 'W', 'stability_index', 'hc', 'oc', 'dc', 'regime_id'],
  expected: 830,
  map: (r) => ({
    season: asInt(r.season)!,
    team: asText(r.team)!,
    churnPoints: asNumber(r.churn_points)!,
    w: asNumber(r.W ?? r.w)!,
    stabilityIndex: asNumber(r.stability_index)!,
    windowTruncated: asBool(r.window_truncated) ?? false,
    hc: asText(r.hc)!,
    oc: asText(r.oc)!,
    dc: asText(r.dc)!,
    hcTenureSeasons: asInt(r.hc_tenure_seasons) ?? 0,
    ocTenureSeasons: asInt(r.oc_tenure_seasons) ?? 0,
    dcTenureSeasons: asInt(r.dc_tenure_seasons) ?? 0,
    hcStints: asInt(r.hc_stints) ?? 0,
    ocStints: asInt(r.oc_stints) ?? 0,
    dcStints: asInt(r.dc_stints) ?? 0,
    regimeId: asText(r.regime_id)!,
    regimeStartSeason: asInt(r.regime_start_season),
    regimeSeasonN: asInt(r.regime_season_n) ?? 1,
  }),
});

const regimeEvents = loader({
  table: s.regimeEvents,
  name: 'regime_events',
  candidates: ['regime_events'],
  required: ['team', 'season', 'kind', 'outgoing_hc', 'incoming_hc', 'regime_id'],
  map: (r) => ({
    team: asText(r.team)!,
    season: asInt(r.season)!,
    kind: asText(r.kind)! as 'offseason',
    outgoingHc: asText(r.outgoing_hc)!,
    incomingHc: asText(r.incoming_hc)!,
    regimeId: asText(r.regime_id)!,
    prevRegimeId: asText(r.prev_regime_id),
    prevRegimeSeasons: asInt(r.prev_regime_seasons),
    dmNext1Season: asInt(r.dm_next1_season),
    dmNext1State: asText(r.dm_next1_state) as 'value' | null,
    dmNext1Usd: asNumber(r.dm_next1_usd),
    dmNext1AsofDate: asText(r.dm_next1_asof_date),
    dmNext1AsofStage: asText(r.dm_next1_asof_stage) as 'preseason' | null,
    dmNext1LeagueMedianUsd: asNumber(r.dm_next1_league_median_usd),
    dmNext1BlankReason: asText(r.dm_next1_blank_reason),
    dmNext2Season: asInt(r.dm_next2_season),
    dmNext2State: asText(r.dm_next2_state) as 'value' | null,
    dmNext2Usd: asNumber(r.dm_next2_usd),
    dmNext2AsofDate: asText(r.dm_next2_asof_date),
    dmNext2AsofStage: asText(r.dm_next2_asof_stage) as 'preseason' | null,
    dmNext2LeagueMedianUsd: asNumber(r.dm_next2_league_median_usd),
    dmNext2BlankReason: asText(r.dm_next2_blank_reason),
  }),
});

const draftPick = loader({
  table: s.draftPick,
  name: 'draft_pick',
  candidates: ['draft_pick', 'draft_picks', 'draft_capital'],
  required: ['season', 'team', 'round', 'pick', 'player_name', 'position', 'college', 'chart_value'],
  expected: 6644,
  map: (r) => ({
    season: asInt(r.season)!,
    team: asText(r.team)!,
    round: asInt(r.round)!,
    pick: asInt(r.pick)!,
    playerName: asText(r.player_name)!,
    gsisId: asText(r.gsis_id),
    pfrPlayerId: asText(r.pfr_player_id),
    position: asText(r.position)!,
    side: asText(r.side),
    college: asText(r.college)!,
    chartValue: asNumber(r.chart_value)!,
    valueBasis: asText(r.value_basis),
    games: asInt(r.games),
    wAv: asInt(r.w_av),
    seasonsStarted: asInt(r.seasons_started) ?? 0,
    probowls: asInt(r.probowls) ?? 0,
    allpro: asInt(r.allpro) ?? 0,
    hof: asBool(r.hof) ?? false,
  }),
});

const draftClassSummary = loader({
  table: s.draftClassSummary,
  name: 'draft_class_summary',
  candidates: ['draft_class_summary', 'draft_capital'],
  required: ['season', 'team', 'n_picks', 'capital', 'capital_rank'],
  expected: 830,
  map: (r) => ({
    season: asInt(r.season)!,
    team: asText(r.team)!,
    nPicks: asInt(r.n_picks)!,
    capital: asNumber(r.capital)!,
    capitalRank: asInt(r.capital_rank)!,
    returnGames: asInt(r.return_games),
    returnWAv: asInt(r.return_w_av),
    returnSeasonsStarted: asInt(r.return_seasons_started) ?? 0,
    returnProbowls: asInt(r.return_probowls),
    returnAllpro: asInt(r.return_allpro),
    wAvPer1000Capital: asNumber(r.w_av_per_1000_capital),
    gamesPer1000Capital: asNumber(r.games_per_1000_capital),
    seasonsStartedPer1000Capital: asNumber(r.seasons_started_per_1000_capital),
    nExcludedNoGsis: asInt(r.n_excluded_no_gsis) ?? 0,
    snapsAvailable: asBool(r.snaps_available) ?? false,
    dollarFramingAvailable: asBool(r.dollar_framing_available),
    dollarFramingBlankReason: asText(r.dollar_framing_blank_reason),
  }),
});

const fitzgeraldSpielbergerChart = loader({
  table: s.fitzgeraldSpielbergerChart,
  name: 'fitzgerald_spielberger_chart',
  candidates: ['fitzgerald_spielberger_chart'],
  required: ['pick', 'chart_value'],
  map: (r) => ({
    pick: asInt(r.pick)!,
    chartValue: asNumber(r.chart_value)!,
    valueBasis: asText(r.value_basis),
    sourceUrl: asText(r.source_url),
    sourceNote: asText(r.source_note),
    sourceReference: asText(r.source_reference),
    transcribedAsof: asText(r.transcribed_asof),
  }),
});

const playerSeasonCap = loader({
  table: s.playerSeasonCap,
  name: 'player_season_cap',
  candidates: ['player_season_cap'],
  required: ['season', 'team', 'otc_id', 'cap_number'],
  expected: 32105,
  map: (r) => ({
    otcId: asInt(r.otc_id)!,
    gsisId: asText(r.gsis_id),
    player: asText(r.player),
    season: asInt(r.season)!,
    team: asText(r.team)!,
    positionAtSigning: asText(r.position_at_signing),
    positionGroup: asText(r.position_group) as 'QB' | null,
    capNumber: asNumber(r.cap_number)!,
    cashPaid: asNumber(r.cash_paid),
    baseSalary: asNumber(r.base_salary),
    proratedBonus: asNumber(r.prorated_bonus),
    rosterBonus: asNumber(r.roster_bonus),
    guaranteedSalary: asNumber(r.guaranteed_salary),
    capPercent: asNumber(r.cap_percent),
    contractYearSigned: asInt(r.contract_year_signed),
    contractYears: asInt(r.contract_years),
    contractValue: asNumber(r.contract_value),
    contractApy: asNumber(r.contract_apy),
    contractGuaranteed: asNumber(r.contract_guaranteed),
    contractApyCapPct: asNumber(r.contract_apy_cap_pct),
    dmLedgerCharge: asBool(r.dm_ledger_charge),
    dmLedgerPlayer: asText(r.dm_ledger_player),
    dmLedgerTeam: asText(r.dm_ledger_team),
    dmLedgerUsd: asNumber(r.dm_ledger_usd),
    dmLedgerTotalUsd: asNumber(r.dm_ledger_total_usd),
    dmLedgerSeasons: asText(r.dm_ledger_seasons),
    dmLedgerSplitEstablished: asBool(r.dm_ledger_split_established),
    dmLedgerIsActual: asBool(r.dm_ledger_is_actual),
    dmLedgerSourceUrl: asText(r.dm_ledger_source_url),
  }),
});

const playerSeasonAvailability = loader({
  table: s.playerSeasonAvailability,
  name: 'player_season_availability',
  candidates: ['player_season_availability', 'player_availability'],
  required: ['gsis_id', 'season', 'team'],
  map: (r) => ({
    gsisId: asText(r.gsis_id)!,
    season: asInt(r.season)!,
    team: asText(r.team)!,
    player: asText(r.player),
    pfrPlayerId: asText(r.pfr_player_id),
    games: asInt(r.games),
    offSnaps: asInt(r.off_snaps),
    defSnaps: asInt(r.def_snaps),
    stSnaps: asInt(r.st_snaps),
    offPct: asNumber(r.off_pct),
  }),
});

const positionAllocation = loader({
  table: s.positionAllocation,
  name: 'position_allocation',
  candidates: ['position_allocation', 'positional_allocation'],
  required: ['season', 'team', 'position_group', 'cap_usd', 'share_of_rostered_cap', 'league_share', 'delta_vs_league'],
  expected: 3744,
  map: (r) => ({
    season: asInt(r.season)!,
    team: asText(r.team)!,
    positionGroup: asText(r.position_group)! as 'QB',
    nPlayers: asInt(r.n_players),
    capUsd: asNumber(r.cap_usd)!,
    shareOfRosteredCap: asNumber(r.share_of_rostered_cap)!,
    leagueShare: asNumber(r.league_share)!,
    deltaVsLeague: asNumber(r.delta_vs_league)!,
  }),
});

/**
 * `SPEC.md` §7.13 — the gate #1 reopen mart. No `license_tier`, so the
 * DEAD_MONEY_TIER filter does not apply: all 416 rows load. Index columns are
 * NULL in the four Cap+-blank seasons and stay NULL here; the data layer turns
 * them into a `Metric` blank. Every column is REQUIRED as a header so a CSV
 * that lost an index column is skipped, not silently loaded as all-blank.
 */
const capplusContext = loader({
  table: s.capplusContext,
  name: 'capplus_context',
  candidates: ['capplus_context'],
  required: [
    'season', 'team', 'starting_qb', 'starting_qb_gsis_id', 'starting_qb_otc_id', 'qb_starter_method',
    'qb_cap_number', 'qb_cap_share', 'qb_contract_year_signed', 'qb_draft_year', 'qb_draft_round',
    'qb_rookie_window', 'league_median_starter_qb_cap', 'stratum_size', 'stratum_rank', 'perf_index',
    'perf_rank', 'capplus', 'capplus_rank', 'capplus_qb_neutral', 'qb_neutral_rank', 'qb_timing_pts',
    'roster_pts', 'cash_share', 'future_mortgage_usd', 'future_mortgage_share', 'mortgage_rows_unknown',
    'mortgage_alpha', 'capplus_obligation', 'obligation_rank',
  ],
  expected: 416,
  map: (r) => ({
    season: asInt(r.season)!,
    team: asText(r.team)!,
    startingQb: asText(r.starting_qb)!,
    startingQbGsisId: asText(r.starting_qb_gsis_id),
    startingQbOtcId: asInt(r.starting_qb_otc_id)!,
    qbStarterMethod: asText(r.qb_starter_method)! as 'snaps' | 'cap',
    qbCapNumber: asNumber(r.qb_cap_number)!,
    qbCapShare: asNumber(r.qb_cap_share)!,
    qbContractYearSigned: asInt(r.qb_contract_year_signed)!,
    qbDraftYear: asInt(r.qb_draft_year),
    qbDraftRound: asInt(r.qb_draft_round),
    qbRookieWindow: asBool(r.qb_rookie_window)!,
    leagueMedianStarterQbCap: asNumber(r.league_median_starter_qb_cap)!,
    stratumSize: asInt(r.stratum_size)!,
    stratumRank: asInt(r.stratum_rank),
    perfIndex: asNumber(r.perf_index)!,
    perfRank: asInt(r.perf_rank)!,
    capplus: asNumber(r.capplus),
    capplusRank: asInt(r.capplus_rank),
    capplusQbNeutral: asNumber(r.capplus_qb_neutral),
    qbNeutralRank: asInt(r.qb_neutral_rank),
    qbTimingPts: asNumber(r.qb_timing_pts),
    rosterPts: asNumber(r.roster_pts),
    cashShare: asNumber(r.cash_share)!,
    futureMortgageUsd: asNumber(r.future_mortgage_usd)!,
    futureMortgageShare: asNumber(r.future_mortgage_share)!,
    mortgageRowsUnknown: asInt(r.mortgage_rows_unknown)!,
    mortgageAlpha: asNumber(r.mortgage_alpha)!,
    capplusObligation: asNumber(r.capplus_obligation),
    obligationRank: asInt(r.obligation_rank),
  }),
});

const leagueCap = loader({
  table: s.leagueCap,
  name: 'league_cap',
  candidates: ['league_cap'],
  required: ['year', 'source_url'],
  expected: 32,
  map: (r) => ({
    year: asInt(r.year)!,
    // NULL for 2010 — uncapped year, no denominator exists.
    capUsd: asNumber(r.cap_usd),
    note: asText(r.note),
    sourceUrl: asText(r.source_url)!,
    secondarySourceUrl: asText(r.secondary_source_url),
  }),
});

/** SHARE_ALIKE is derived from `license_machine` (SPEC §7.10) — not invented. */
function deriveShareAlike(licenseMachine: string | null): boolean | null {
  if (licenseMachine === null) return null;
  return /(^|-)(sa)(-|$)/.test(licenseMachine.toLowerCase());
}

/**
 * `player_images` (SPEC §7.10) is seeded by hand rather than by a `Loader`,
 * because it is assembled from up to three files and it also carries the v1
 * PLAYER POPULATION (DECISIONS 53 — the 251 audited players), which is what
 * `/player/[id]` enumerates:
 *
 *   1. `data/marts/player_images.csv`      — the licence metadata mart, keyed
 *                                            `player_id` (= otc_id).
 *   2. `.../staging/player_images_sample.csv` — the audited population, which is
 *                                            where the NAME, team, position and
 *                                            selection metadata live.
 *   3. `public/assets/playermarks/manifest.json` — the served asset, which is
 *                                            authoritative for `last_verified_at`.
 *
 * Either CSV alone is enough to seed the table; each only fills fields the other
 * left null. Nothing is computed except `share_alike`, which SPEC §7.10 itself
 * defines as derived from `license_machine`.
 */
function playerImageRow(r: Row): Record<string, unknown> | null {
  const id = asInt(r.player_id ?? r.otc_id);
  if (id === null) return null;
  const licenseMachine = asText(r.license_machine);
  return {
    playerId: String(id),
    player: asText(r.player),
    team: asText(r.team),
    position: asText(r.position),
    hasUsableImage: asBool(r.has_usable_image) ?? false,
    fileTitle: asText(r.file_title),
    fileUrl: asText(r.file_url),
    width: asInt(r.width),
    height: asInt(r.height),
    author: asText(r.author),
    license: asText(r.license),
    licenseMachine,
    licenseUrl: asText(r.license_url),
    attribution: asText(r.attribution),
    attributionRequired: asBool(r.attribution_required),
    shareAlike: asBool(r.share_alike) ?? deriveShareAlike(licenseMachine),
    restrictions: asText(r.restrictions),
    verificationMethod: asText(r.verification_method),
    wikidataQid: asText(r.wikidata_qid),
    wikipediaArticle: asText(r.wikipedia_article),
    notes: asText(r.notes),
    lastVerifiedAt: asText(r.last_verified_at),
    meetsMinWidth: asBool(r.meets_min_width),
    rendersPhoto: asBool(r.renders_photo),
    assetFile: asText(r.asset_file),
    rendition: asText(r.rendition),
    renditionWidth: asInt(r.rendition_width),
    renditionHeight: asInt(r.rendition_height),
    selection: asText(r.selection),
    capRank: asInt(r.cap_rank),
    maxCapSeason: asInt(r.max_cap_season),
    maxCapUsd: asNumber(r.max_cap_usd),
    careerFirstSeason: asInt(r.career_first_season),
    careerLastSeason: asInt(r.career_last_season),
  };
}

async function seedPlayerImages(conn: Connection) {
  const martFile = findMart('player_images');
  const sampleFile = findMart('player_images_sample');
  const sources = [martFile, sampleFile].filter((f): f is string => f !== null);

  if (!sources.length) {
    record({
      tableName: 'player_images', sourceFile: null, status: 'skipped',
      reason: 'no player_images / player_images_sample file found',
      rowCount: 0, expectedRows: 251, columnsSeeded: null, columnsMissing: null, columnsExtra: null,
    });
    return;
  }

  const merged = new Map<string, Record<string, unknown>>();
  try {
    for (const file of sources) {
      const { rows } = await readCsv(file);
      for (const raw of rows) {
        const row = playerImageRow(raw);
        if (!row) continue;
        const id = row.playerId as string;
        const existing = merged.get(id);
        if (!existing) {
          merged.set(id, row);
        } else {
          for (const [k, v] of Object.entries(row)) {
            if (existing[k] === null || existing[k] === undefined) existing[k] = v;
          }
        }
      }
    }

    // The served asset is authoritative for last_verified_at, and carries the
    // name/team/position for every asset it holds.
    try {
      const mf = path.join(REPO_DIR, 'public', 'assets', 'playermarks', 'manifest.json');
      const doc = JSON.parse(await readFile(mf, 'utf8')) as {
        assets?: Record<string, Record<string, unknown>>;
      };
      for (const [id, a] of Object.entries(doc.assets ?? {})) {
        const row = merged.get(id);
        if (!row) continue;
        row.lastVerifiedAt = row.lastVerifiedAt ?? a.last_verified_at ?? null;
        row.player = row.player ?? a.player ?? null;
        row.team = row.team ?? a.team ?? null;
        row.position = row.position ?? a.position ?? null;
      }
    } catch {
      /* manifest absent — the CSVs stand on their own. */
    }

    const rows = [...merged.values()];
    await insertRows(conn, s.playerImages, rows);
    record({
      tableName: 'player_images',
      sourceFile: sources.map(rel).join(' + '),
      status: 'seeded',
      reason: null,
      rowCount: rows.length,
      expectedRows: 251,
      columnsSeeded: Object.keys(rows[0] ?? {}).length,
      columnsMissing: null,
      columnsExtra: null,
    });
  } catch (err) {
    record({
      tableName: 'player_images', sourceFile: sources.map(rel).join(' + '), status: 'skipped',
      reason: why(err), rowCount: 0, expectedRows: 251,
      columnsSeeded: null, columnsMissing: null, columnsExtra: null,
    });
    await conn.exec('TRUNCATE TABLE "player_images";');
  }
}

/** Every CSV-backed loader, in insertion order. */
const CSV_LOADERS: Loader<Record<string, unknown>>[] = [
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
  positionAllocation,
  capplusContext,
  leagueCap,
] as unknown as Loader<Record<string, unknown>>[];

/* ================================================================== */
/* Manifest                                                            */
/* ================================================================== */

interface ManifestRow {
  tableName: string;
  sourceFile: string | null;
  status: 'seeded' | 'skipped';
  reason: string | null;
  rowCount: number;
  expectedRows: number | null;
  columnsSeeded: number | null;
  columnsMissing: string | null;
  columnsExtra: string | null;
}

const manifest: ManifestRow[] = [];

function record(m: ManifestRow) {
  manifest.push(m);
}

/* ================================================================== */
/* DDL                                                                 */
/* ================================================================== */

/**
 * Create every table and enum from the Drizzle schema.
 *
 * Written as explicit DDL rather than drizzle-kit migrations so the seed is one
 * self-contained program with no generated-artefact drift: the column list, the
 * types and the nullability are all read back out of the Drizzle table objects,
 * so this cannot disagree with `schema.ts`.
 */
async function createSchema(conn: Connection) {
  const enums: Record<string, readonly string[]> = {
    asof_stage: s.asofStageEnum.enumValues,
    dm_coverage: s.dmCoverageEnum.enumValues,
    season_coverage: s.seasonCoverageEnum.enumValues,
    metric_state: s.metricStateEnum.enumValues,
    license_tier: s.licenseTierEnum.enumValues,
    capplus_badge: s.capplusBadgeEnum.enumValues,
    position_group: s.positionGroupEnum.enumValues,
    coach_role: s.coachRoleEnum.enumValues,
    regime_kind: s.regimeKindEnum.enumValues,
  };

  const stmts: string[] = [];
  for (const [name, values] of Object.entries(enums)) {
    const lits = values.map((v) => `'${v}'`).join(', ');
    stmts.push(
      `DO $$ BEGIN CREATE TYPE "${name}" AS ENUM (${lits}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,
    );
  }

  // Enum types are user-defined and must be quoted; every builtin type name
  // (`double precision`, `integer`, `jsonb`, …) must not be.
  const enumNames = new Set(Object.keys(enums));

  for (const table of Object.values(s.schema)) {
    const cfg = getTableConfig(table as PgTable);
    const cols = cfg.columns.map((c) => {
      const type = c.getSQLType();
      const rendered = enumNames.has(type) ? `"${type}"` : type;
      return `  "${c.name}" ${rendered}${c.notNull ? ' NOT NULL' : ''}`;
    });
    const pkCols = cfg.columns.filter((c) => c.primary).map((c) => `"${c.name}"`);
    const pk = cfg.primaryKeys[0];
    const pkList = pk ? pk.columns.map((c) => `"${c.name}"`) : pkCols;
    if (pkList.length) cols.push(`  PRIMARY KEY (${pkList.join(', ')})`);
    stmts.push(`DROP TABLE IF EXISTS "${cfg.name}" CASCADE;`);
    stmts.push(`CREATE TABLE "${cfg.name}" (\n${cols.join(',\n')}\n);`);
    for (const idx of cfg.indexes) {
      const target = idx.config.columns
        .map((c) => ('name' in c ? `"${(c as { name: string }).name}"` : null))
        .filter(Boolean)
        .join(', ');
      if (target) {
        stmts.push(`CREATE INDEX "${idx.config.name}" ON "${cfg.name}" (${target});`);
      }
    }
  }
  for (const stmt of stmts) await conn.exec(stmt);
}

/* ================================================================== */
/* Insert                                                              */
/* ================================================================== */

const CHUNK = 800;

async function insertRows(conn: Connection, table: PgTable, rows: Record<string, unknown>[]) {
  for (let i = 0; i < rows.length; i += CHUNK) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await conn.db.insert(table).values(rows.slice(i, i + CHUNK) as any);
  }
}

async function seedCsvLoader(conn: Connection, l: Loader<Record<string, unknown>>) {
  const file = findMart(...l.candidates);
  if (!file) {
    record({
      tableName: l.name,
      sourceFile: null,
      status: 'skipped',
      reason: `no file found among [${l.candidates.join(', ')}] in data/marts, data/curated, data/curated/staging`,
      rowCount: 0,
      expectedRows: l.expected ?? null,
      columnsSeeded: null,
      columnsMissing: null,
      columnsExtra: null,
    });
    return;
  }

  const { header, rows } = await readCsv(file);
  const present = new Set(header);
  // `P`/`W`/`R_rec` are read case-insensitively by the mappers.
  const missing = l.required.filter(
    (c) => !present.has(c) && !present.has(c.toLowerCase()) && !present.has(c.toUpperCase()),
  );
  if (missing.length) {
    record({
      tableName: l.name,
      sourceFile: rel(file),
      status: 'skipped',
      reason: `required column(s) absent from the CSV: ${missing.join(', ')}`,
      rowCount: 0,
      expectedRows: l.expected ?? null,
      columnsSeeded: null,
      columnsMissing: missing.join(', '),
      columnsExtra: null,
    });
    return;
  }

  // A row that lost a required field (truncated write, or a genuinely ragged
  // line) is DROPPED and counted — never patched with a default.
  const complete = rows.filter((r) => l.required.every((c) => r[c] !== undefined));
  const dropped = rows.length - complete.length;

  let mapped: Record<string, unknown>[];
  try {
    mapped = complete.map(l.map).filter((r): r is Record<string, unknown> => r !== null);
  } catch (err) {
    record({
      tableName: l.name,
      sourceFile: rel(file),
      status: 'skipped',
      reason: `row mapping failed: ${why(err)}`,
      rowCount: 0,
      expectedRows: l.expected ?? null,
      columnsSeeded: null,
      columnsMissing: null,
      columnsExtra: null,
    });
    return;
  }

  const cfg = getTableConfig(l.table);
  const schemaCols = new Set(cfg.columns.map((c) => c.name));
  const extra = header.filter((h) => !schemaCols.has(h) && !schemaCols.has(h.toLowerCase()));

  try {
    await insertRows(conn, l.table, mapped);
  } catch (err) {
    record({
      tableName: l.name,
      sourceFile: rel(file),
      status: 'skipped',
      reason: `insert failed: ${why(err)}`,
      rowCount: 0,
      expectedRows: l.expected ?? null,
      columnsSeeded: null,
      columnsMissing: null,
      columnsExtra: extra.join(', ') || null,
    });
    // Leave the table empty rather than half-filled.
    await conn.exec(`TRUNCATE TABLE "${cfg.name}";`);
    return;
  }

  record({
    tableName: l.name,
    sourceFile: rel(file),
    status: 'seeded',
    reason: dropped ? `${dropped} ragged row(s) dropped` : null,
    rowCount: mapped.length,
    expectedRows: l.expected ?? null,
    columnsSeeded: Object.keys(mapped[0] ?? {}).length,
    columnsMissing: null,
    columnsExtra: extra.join(', ') || null,
  });
}

/* ================================================================== */
/* JSON-backed loaders                                                 */
/* ================================================================== */

async function seedTeamMeta(conn: Connection) {
  const file = path.join(REPO_DIR, 'public', 'assets', 'teammarks', 'chipdata.json');
  try {
    const doc = JSON.parse(await readFile(file, 'utf8')) as {
      teams: {
        abbr: string; team_name: string; conf: string; division: string;
        primary: string; secondary: string; glyph: string;
        glyph_contrast: number; pair_contrast: number;
      }[];
    };
    const rows = doc.teams.map((t) => ({
      abbr: t.abbr,
      teamName: t.team_name,
      conf: t.conf,
      division: t.division,
      divisionSlug: divisionSlug(t.division),
      primaryColor: t.primary,
      secondaryColor: t.secondary,
      glyphColor: t.glyph,
      glyphContrast: t.glyph_contrast,
      pairContrast: t.pair_contrast,
    }));
    await insertRows(conn, s.teamMeta, rows);
    record({
      tableName: 'team_meta', sourceFile: rel(file), status: 'seeded', reason: null,
      rowCount: rows.length, expectedRows: 32, columnsSeeded: 10, columnsMissing: null, columnsExtra: null,
    });
  } catch (err) {
    record({
      tableName: 'team_meta', sourceFile: rel(file), status: 'skipped',
      reason: why(err), rowCount: 0, expectedRows: 32,
      columnsSeeded: null, columnsMissing: null, columnsExtra: null,
    });
  }
}

async function seedCredits(conn: Connection) {
  const file = path.join(MARTS_DIR, 'credits.json');
  try {
    const doc = JSON.parse(await readFile(file, 'utf8')) as {
      entries: Record<string, unknown>[];
      license_groups: Record<string, unknown>[];
      [k: string]: unknown;
    };

    const entries = (doc.entries ?? []).map((e) => ({
      otcId: String(e.otc_id),
      player: String(e.player),
      team: (e.team as string) ?? null,
      license: String(e.license),
      licenseMachine: String(e.license_machine),
      licenseUrl: (e.license_url as string) ?? null,
      author: String(e.author),
      attribution: String(e.attribution),
      attributionRequired: Boolean(e.attribution_required),
      shareAlike: Boolean(e.share_alike),
      restrictions: (e.restrictions as string) ?? null,
      file: (e.file as string) ?? null,
      sourceFilePageUrl: (e.source_file_page_url as string) ?? null,
    }));

    const groups: (typeof s.creditLicenseGroup.$inferInsert)[] = [];
    const authors: (typeof s.creditAuthor.$inferInsert)[] = [];
    let authorId = 0;
    (doc.license_groups ?? []).forEach((g, gi) => {
      groups.push({
        licenseMachine: String(g.license_machine),
        license: String(g.license),
        licenseUrl: (g.license_url as string) ?? null,
        shareAlike: Boolean(g.share_alike),
        attributionRequired: Boolean(g.attribution_required),
        assetCount: Number(g.asset_count),
        authorCount: Number(g.author_count),
        sortOrder: gi,
      });
      (g.credits as Record<string, unknown>[] | undefined)?.forEach((c, ci) => {
        authors.push({
          id: authorId++,
          licenseMachine: String(g.license_machine),
          author: String(c.author),
          attribution: String(c.attribution),
          assetCount: Number(c.asset_count),
          players: (c.players as string[]) ?? [],
          sortOrder: ci,
        });
      });
    });

    const { entries: _e, license_groups: _g, ...meta } = doc;
    void _e;
    void _g;

    await insertRows(conn, s.creditEntry, entries);
    await insertRows(conn, s.creditLicenseGroup, groups);
    await insertRows(conn, s.creditAuthor, authors);
    await insertRows(conn, s.creditsMeta, [{ id: 0, doc: meta }]);

    record({
      tableName: 'credit_entry', sourceFile: rel(file), status: 'seeded', reason: null,
      rowCount: entries.length, expectedRows: null, columnsSeeded: 13, columnsMissing: null, columnsExtra: null,
    });
    record({
      tableName: 'credit_license_group', sourceFile: rel(file), status: 'seeded', reason: null,
      rowCount: groups.length, expectedRows: null, columnsSeeded: 8, columnsMissing: null, columnsExtra: null,
    });
    record({
      tableName: 'credit_author', sourceFile: rel(file), status: 'seeded', reason: null,
      rowCount: authors.length, expectedRows: null, columnsSeeded: 7, columnsMissing: null, columnsExtra: null,
    });
    record({
      tableName: 'credits_meta', sourceFile: rel(file), status: 'seeded', reason: null,
      rowCount: 1, expectedRows: 1, columnsSeeded: 2, columnsMissing: null, columnsExtra: null,
    });
  } catch (err) {
    for (const t of ['credit_entry', 'credit_license_group', 'credit_author', 'credits_meta']) {
      record({
        tableName: t, sourceFile: rel(file), status: 'skipped',
        reason: why(err), rowCount: 0, expectedRows: null,
        columnsSeeded: null, columnsMissing: null, columnsExtra: null,
      });
    }
  }
}

/* ================================================================== */
/* Post-seed structural assertions — ARCHITECTURE.md §7 / §12          */
/* ================================================================== */

async function assertions(conn: Connection): Promise<{ label: string; ok: boolean; detail: string }[]> {
  const out: { label: string; ok: boolean; detail: string }[] = [];
  const seeded = new Map(manifest.map((m) => [m.tableName, m]));

  const countCheck = async (table: string, expected: number, label: string) => {
    const m = seeded.get(table);
    if (!m || m.status !== 'seeded') {
      out.push({ label, ok: true, detail: `skipped — ${table} not in this snapshot` });
      return;
    }
    out.push({
      label,
      ok: m.rowCount === expected,
      detail: `${m.rowCount} rows (expected ${expected})`,
    });
  };

  await countCheck('team_season_results', 861, '861 result rows');
  await countCheck('team_season_epa', 861, '861 EPA rows');
  await countCheck('team_season_cap', 416, '416 cap rows');
  await countCheck('capplus_official', 288, '288 Cap+ rows');
  await countCheck('capplus_context', 416, '416 Cap+ context rows');
  await countCheck('coaching_staff', 2612, '2,612 coaching rows');
  await countCheck('league_cap', 32, '32 league-cap rows');

  const scalar = async (statement: SQL): Promise<number> => {
    const res = (await conn.db.execute(statement)) as unknown as { rows?: { n: unknown }[] } | { n: unknown }[];
    const rows = Array.isArray(res) ? res : (res.rows ?? []);
    return Number((rows[0] as { n: unknown } | undefined)?.n ?? 0);
  };

  if (seeded.get('dead_money_team_season')?.status === 'seeded') {
    const nullAsof = await scalar(
      sql`SELECT count(*)::int AS n FROM ${s.deadMoneyTeamSeason} WHERE asof_date IS NULL`,
    );
    out.push({
      label: 'zero dead-money rows with a null asof_date',
      ok: nullAsof === 0,
      detail: `${nullAsof} null asof_date rows`,
    });
  }

  if (seeded.get('capplus_official')?.status === 'seeded') {
    const nullDm = await scalar(
      sql`SELECT count(*)::int AS n FROM ${s.capplusOfficial} WHERE dm_asof_date IS NULL`,
    );
    out.push({
      label: 'every Cap+ row carries a non-null dm_asof',
      ok: nullDm === 0,
      detail: `${nullDm} rows without dm_asof_date`,
    });
    const nSeasons = await scalar(
      sql`SELECT count(DISTINCT season)::int AS n FROM ${s.capplusOfficial}`,
    );
    out.push({
      label: 'Cap+ spans exactly nine seasons',
      ok: nSeasons === 9,
      detail: `${nSeasons} distinct seasons`,
    });
  }

  if (seeded.get('capplus_context')?.status === 'seeded') {
    // §7.13: index columns are NULL in exactly the four Cap+-blank seasons.
    const blankSeasons = await scalar(
      sql`SELECT count(DISTINCT season)::int AS n FROM ${s.capplusContext} WHERE capplus IS NULL`,
    );
    const blankRows = await scalar(
      sql`SELECT count(*)::int AS n FROM ${s.capplusContext} WHERE capplus IS NULL`,
    );
    out.push({
      label: 'Cap+ context index columns blank in exactly four whole seasons',
      ok: blankSeasons === 4 && blankRows === 128,
      detail: `${blankRows} blank rows across ${blankSeasons} seasons`,
    });
  }

  if (seeded.get('draft_pick')?.status === 'seeded') {
    const cfg = getTableConfig(s.draftPick);
    out.push({
      label: 'car_av is absent from the draft schema',
      ok: !cfg.columns.some((c) => c.name === 'car_av'),
      detail: 'schema column list',
    });
  }

  if (seeded.get('team_season_results')?.status === 'seeded') {
    const zeroWin = await scalar(
      sql`SELECT count(*)::int AS n FROM ${s.teamSeasonResults} WHERE wins = 0`,
    );
    out.push({
      label: 'the two zero-win seasons are present (2008 DET, 2017 CLE)',
      ok: zeroWin === 2,
      detail: `${zeroWin} zero-win team-seasons`,
    });
  }

  return out;
}

/* ================================================================== */
/* Main                                                                */
/* ================================================================== */

async function main() {
  const t0 = Date.now();
  const url = databaseUrl();
  const target = url ? `postgres (${url.replace(/\/\/[^@]*@/, '//***@')})` : 'pglite (.data/pglite)';

  console.log('');
  console.log('YIELD/YARD seed');
  console.log(`  target          ${target}`);
  console.log(`  DEAD_MONEY_TIER ${DEAD_MONEY_TIER}  (tiers kept: ${LICENSE_TIERS_ALLOWED.join(', ')})`);
  console.log('');

  let conn: Connection;
  if (url) {
    conn = await connectPostgres(url);
  } else {
    // Destructive and idempotent: rebuild the data directory from scratch.
    const dir = await pgliteDataPath();
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    conn = await connectPglite('dir');
  }

  try {
    await createSchema(conn);

    for (const l of CSV_LOADERS) await seedCsvLoader(conn, l);
    await seedPlayerImages(conn);
    await seedTeamMeta(conn);
    await seedCredits(conn);

    // The manifest goes into the database so the data layer can read it.
    await insertRows(
      conn,
      s.seedManifest,
      manifest.map((m) => ({ ...m })),
    );
    await insertRows(conn, s.seedStamp, [
      {
        id: 0,
        doc: {
          product: 'YIELD/YARD',
          driver: conn.driver,
          dead_money_tier: DEAD_MONEY_TIER,
          license_tiers_shipped: LICENSE_TIERS_ALLOWED,
          tables_seeded: manifest.filter((m) => m.status === 'seeded').length,
          tables_skipped: manifest.filter((m) => m.status === 'skipped').length,
          rows_total: manifest.reduce((a, m) => a + m.rowCount, 0),
        },
      },
    ]);

    /* ---------------- report ---------------- */
    const pad = (x: string, n: number) => x.padEnd(n);
    const seededRows = manifest.filter((m) => m.status === 'seeded');
    const skipped = manifest.filter((m) => m.status === 'skipped');

    console.log('SEED MANIFEST');
    console.log(`  ${pad('table', 32)}${pad('rows', 10)}${pad('expected', 10)}source`);
    for (const m of manifest) {
      const mark = m.status === 'seeded' ? ' ' : '!';
      console.log(
        `${mark} ${pad(m.tableName, 32)}${pad(String(m.rowCount), 10)}` +
          `${pad(m.expectedRows === null ? '-' : String(m.expectedRows), 10)}` +
          `${m.sourceFile ?? '-'}`,
      );
      if (m.status === 'skipped') console.log(`    SKIPPED: ${m.reason}`);
      if (m.columnsExtra) console.log(`    note: CSV columns not in the schema: ${m.columnsExtra}`);
    }

    console.log('');
    console.log(
      `  seeded ${seededRows.length} tables / ${seededRows.reduce((a, m) => a + m.rowCount, 0).toLocaleString()} rows` +
        `  ·  skipped ${skipped.length}`,
    );

    console.log('');
    console.log('POST-SEED STRUCTURAL ASSERTIONS');
    const checks = await assertions(conn);
    let failures = 0;
    for (const c of checks) {
      if (!c.ok) failures++;
      console.log(`  ${c.ok ? 'ok  ' : 'FAIL'} ${pad(c.label, 52)} ${c.detail}`);
    }

    /* ---------------- dump ---------------- */
    if (!url) {
      const dumpPath = await pgliteDumpPath();
      await mkdir(path.dirname(dumpPath), { recursive: true });
      // Re-open through PGlite directly so we can call dumpDataDir.
      const { PGlite } = await import('@electric-sql/pglite');
      await conn.close();
      const pg = new PGlite({ dataDir: await pgliteDataPath() });
      await pg.waitReady;
      const blob = await pg.dumpDataDir('gzip');
      await writeFile(dumpPath, Buffer.from(await blob.arrayBuffer()));
      await pg.close();
      const bytes = Buffer.from(await blob.arrayBuffer()).length;
      // The data directory has no consumer once the dump exists — the app loads
      // the dump, and the next seed rebuilds the directory from scratch anyway.
      // Dropping it here halves the on-disk cost of a seeded checkout.
      await rm(await pgliteDataPath(), { recursive: true, force: true });
      console.log('');
      console.log(`  dump written    ${PGLITE_DUMP_LABEL}  (${(bytes / 1e6).toFixed(1)} MB)`);
    } else {
      await conn.close();
    }

    console.log('');
    console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    console.log('');

    if (STRICT && (failures > 0 || skipped.length > 0)) {
      process.exit(1);
    }
    // Tolerant by default: the ETL is still landing marts. Exit 0.
    process.exit(0);
  } catch (err) {
    console.error('seed failed:', err);
    try {
      await conn.close();
    } catch {
      /* already closed */
    }
    process.exit(1);
  }
}

const PGLITE_DUMP_LABEL = '.data/pgdata.tar.gz';

void main();
