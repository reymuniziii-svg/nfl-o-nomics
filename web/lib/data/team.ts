/**
 * Team-season bundle — `SPEC.md` §3.2.
 *
 * Nine blocks, all read from marts:
 *   1 header · 2 the 25-season history with the HARD BREAK AT 2013 · 3 the three
 *   lenses · 4 allocation · 5 cost per win · 6 stability + regimes · 7 dead money
 *   (dot plot, never a line) · 8 draft ROI · 9 CSV export (the view's job).
 */

import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import {
  BLANK_REASON,
  BRIDGE_SENTENCE,
  NOT_A_32_TEAM_READING,
  TEAM_RATING_NAME,
  badged,
  blank,
  mapMetric,
  partial,
  value,
  type AsOf,
  type AsOfStage,
  type CapPlusBadge,
  type Metric,
} from '@/lib/metric';
import { eraIdentity, type EraIdentity, type TeamAbbr } from '@/lib/teams';
import { isSeeded } from './registry';
import { getLeagueAvgCostPerWin } from './league';
import { seasonsForTeam } from './seasons';
import {
  capplusBlankSeasons,
  DEFAULT_NUMERATOR,
  NUMERATOR_CAVEAT,
  NUMERATOR_LABEL,
  TIER2_FIRST_SEASON,
  getCapPlus,
  getCostPerWin,
  getTeamRating,
  type CapPlusValue,
  type CostNumerator,
  type CostPerWin,
} from './metrics';

/* ------------------------------------------------------------------ */
/* 1. Header + results                                                  */
/* ------------------------------------------------------------------ */

export interface TeamResults {
  season: number;
  team: TeamAbbr;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  /** Deepest round reached. Context beside the record; never an index input. */
  playoffResult: PlayoffResult;
  playoffGames: number;
  playoffWins: number;
}

export type PlayoffResult =
  | 'none'
  | 'wild_card'
  | 'divisional'
  | 'conference'
  | 'super_bowl_loss'
  | 'super_bowl_win';

export interface TeamEpa {
  offPlays: number;
  defPlays: number;
  /** Raw rates — shown beside the adjusted headline, no longer a P input. */
  offEpaPerPlay: number;
  defEpaPerPlay: number;
  epaMarginPerPlay: number;
  offEpaTotal: number;
  defEpaTotal: number;
  /** Opponent-adjusted rates (`SPEC.md` §2.4). The margin is P's EPA input. */
  offEpaPerPlayAdj: number;
  defEpaPerPlayAdj: number;
  epaMarginPerPlayAdj: number;
  /** Strength of schedule: mean raw EPA margin of the opponents faced (+ = tougher). */
  sosEpa: number;
}

type ResultsRow = typeof s.teamSeasonResults.$inferSelect;
type EpaRow = typeof s.teamSeasonEpa.$inferSelect;

function toResults(r: ResultsRow): TeamResults {
  return {
    season: r.season,
    team: r.team as TeamAbbr,
    games: r.games,
    wins: r.wins,
    losses: r.losses,
    ties: r.ties,
    winPct: r.winPct,
    pointsFor: r.pointsFor,
    pointsAgainst: r.pointsAgainst,
    pointDiff: r.pointDiff,
    playoffResult: r.playoffResult as PlayoffResult,
    playoffGames: r.playoffGames,
    playoffWins: r.playoffWins,
  };
}

function toEpa(e: EpaRow): TeamEpa {
  return {
    offPlays: e.offPlays,
    defPlays: e.defPlays,
    offEpaPerPlay: e.offEpaPerPlay,
    defEpaPerPlay: e.defEpaPerPlay,
    epaMarginPerPlay: e.epaMarginPerPlay,
    offEpaTotal: e.offEpaTotal,
    defEpaTotal: e.defEpaTotal,
    offEpaPerPlayAdj: e.offEpaPerPlayAdj,
    defEpaPerPlayAdj: e.defEpaPerPlayAdj,
    epaMarginPerPlayAdj: e.epaMarginPerPlayAdj,
    sosEpa: e.sosEpa,
  };
}

/* ------------------------------------------------------------------ */
/* 2. The 25-season history                                             */
/* ------------------------------------------------------------------ */

export interface HistoryPoint {
  season: number;
  /** All 861 team-seasons carry this. */
  teamRating: Metric<number>;
  /**
   * All 13 Tier 2 seasons carry this under the shipping tier (estimated seasons
   * as badged values). A blank renders as a LABELED GAP, never interpolated.
   */
  capplus: Metric<number>;
}

export interface FranchiseHistory {
  /** The hard visual break. Both lines are plotted on the 2013–2025 overlap. */
  breakSeason: number;
  bridgeSentence: string;
  /** Tier 2 seasons with no Cap+ at all — empty unless the SAFE-only reversal ships. */
  blankSeasons: number[];
  points: HistoryPoint[];
}

/* ------------------------------------------------------------------ */
/* 3. The three lenses                                                  */
/* ------------------------------------------------------------------ */

export interface Lens {
  key: 'cap' | 'cash' | 'dead_money';
  label: string;
  amount: Metric<number>;
  /** Rendered with the lens, always. Never collapsed into a tooltip. */
  caveat: string;
  /** Dead money only — value, date and stage render together (`SPEC.md` §2.1). */
  asOf: AsOf | null;
  /**
   * Dead money only — the season's league median, the benchmark `SPEC.md` §2.8
   * step 7 requires beside the figure.
   */
  leagueMedianUsd: number | null;
  sourceUrl: string | null;
  /**
   * Dead money only — a MODELED figure's 80% range. Never null for a modeled
   * row: the figure never renders without it (`SPEC.md` §2.2).
   */
  range: { lo: number; hi: number } | null;
}

/* ------------------------------------------------------------------ */
/* 4. Allocation                                                        */
/* ------------------------------------------------------------------ */

export interface AllocationBar {
  positionGroup: string;
  capUsd: number;
  shareOfRosteredCap: number;
  leagueShare: number;
  /** Diverging from a zero-centered league-average axis. */
  deltaVsLeague: number;
}

/* ------------------------------------------------------------------ */
/* 6. Stability + regimes                                               */
/* ------------------------------------------------------------------ */

export interface StabilityRow {
  season: number;
  churnPoints: number;
  w: number;
  stabilityIndex: number;
  windowTruncated: boolean;
  hc: string;
  oc: string;
  dc: string;
  hcTenureSeasons: number;
  ocTenureSeasons: number;
  dcTenureSeasons: number;
  regimeId: string;
  regimeSeasonN: number;
}

export interface RegimeDeadMoney {
  season: number | null;
  state: 'value' | 'blank';
  usd: number | null;
  asOf: AsOf | null;
  leagueMedianUsd: number | null;
  reason: string | null;
  /** Snapshot badge for that season; 'estimated' when the reading is modeled. */
  badge: string | null;
  isModeled: boolean;
}

export interface RegimeEvent {
  season: number;
  kind: 'offseason' | 'in_season';
  outgoingHc: string;
  incomingHc: string;
  regimeId: string;
  /** The two dated chips a marker opens — s+1 and s+2. */
  dmNext1: RegimeDeadMoney;
  dmNext2: RegimeDeadMoney;
}

/* ------------------------------------------------------------------ */
/* 7. Dead money                                                        */
/* ------------------------------------------------------------------ */

export interface DeadMoneySnapshot {
  season: number;
  usd: number;
  asOf: AsOf;
  coverage: string;
  /**
   * `full32` | `leaders_only`. A leaders list is not a league table
   * (`SPEC.md` §7.5) and the reading is labeled partial wherever it renders.
   */
  seasonCoverage: string | null;
  licenseTier: string;
  sourceUrl: string;
  note: string | null;
  /**
   * Dead money ÷ `team_adjusted_cap_implied`, PUBLISHED PER TEAM-SEASON in
   * `dead_money_display`. Never recomputed here; `null` only where the mart's
   * own column is empty.
   */
  burdenOfAdjustedCap: number | null;
  /** The season's league median dead money — the benchmark this figure needs. */
  leagueMedianUsd: number | null;
  /** true = modeled from contract data (estimated season); renders with its range. */
  isModeled: boolean;
  /** 80% range for a modeled figure; null for a published one. */
  loUsd: number | null;
  hiUsd: number | null;
  /** The season's badge on `dead_money_display` and its sentence. */
  badge: CapPlusBadge | null;
  badgeReason: string | null;
}

export interface DeadMoneyBlock {
  /** THE resolved reading for this season, with its date and stage. */
  resolved: Metric<DeadMoneySnapshot>;
  /**
   * Every other dated reading for this team-season. Shown as ALTERNATE READINGS
   * on request — never averaged, never merged (`SPEC.md` §7.5).
   */
  alternates: DeadMoneySnapshot[];
  /**
   * The franchise's cross-season readings. RENDERED AS A DOT PLOT WITH NO
   * CONNECTING PATH: these are individually dated readings taken at different
   * points in different league years (`SPEC.md` §2.1 rule 3).
   */
  seriesRenderer: 'dot_plot_no_path';
  series: DeadMoneySnapshot[];
  /** This franchise's rows from the marquee ledger. */
  ledger: LedgerRow[];
  burdenOfAdjustedCap: number | null;
  leagueMedianUsd: number | null;
  /**
   * Whole-season Cap+ blanks that ALSO have no reading for this club. Empty
   * under the shipping tier (every 2013–2025 season has a measured or estimated
   * figure); only the SAFE-only reversal draws empty absence rings here.
   */
  emptyBlankSeasons: number[];
}

export interface LedgerRow {
  player: string;
  seasons: string;
  totalUsd: number;
  splitBySeason: string | null;
  isActual: boolean;
  verifiedAsof: string;
  sourceUrl: string;
  notes: string | null;
}

/* ------------------------------------------------------------------ */
/* 8. Draft                                                             */
/* ------------------------------------------------------------------ */

export interface DraftPickRow {
  round: number;
  pick: number;
  playerName: string;
  position: string;
  college: string | null;
  chartValue: number;
  games: number | null;
  wAv: number | null;
  seasonsStarted: number;
  probowls: number;
  allpro: number;
  hof: boolean;
}

export interface DraftBlock {
  summary: Metric<{
    nPicks: number;
    capital: number;
    capitalRank: number;
    returnGames: number | null;
    returnWAv: number | null;
    returnSeasonsStarted: number;
    nExcludedNoGsis: number;
    snapsAvailable: boolean;
    /** return_w_av ÷ that draft year's mean class × 100. 100 = the year's average class. */
    draftIndex: number | null;
    /** 1 = best class of its draft year. */
    draftIndexRank: number | null;
    /** 'early' = too few seasons since the draft for the return to have settled. */
    maturity: 'early' | 'mature';
    seasonsElapsed: number;
  }>;
  /** Any DOLLAR framing of a draft class is Tier 2 and renders only for 2013+. */
  dollarFraming: Metric<null>;
  picks: DraftPickRow[];
}

/* ------------------------------------------------------------------ */
/* The bundle                                                          */
/* ------------------------------------------------------------------ */

export interface TeamBundle {
  team: TeamAbbr;
  season: number;
  identity: EraIdentity;
  identityLine: string;
  seasons: number[];
  results: Metric<TeamResults>;
  epa: Metric<TeamEpa>;
  /** Cap+ where covered; Team Rating where not — each under its own name. */
  index: { name: string; metric: Metric<CapPlusValue> | Metric<number>; isCapPlus: boolean };
  capplus: Metric<CapPlusValue>;
  teamRating: Metric<number>;
  history: FranchiseHistory;
  lenses: Lens[];
  allocation: Metric<AllocationBar[]>;
  costPerWin: Metric<CostPerWin>;
  numeratorLabel: string;
  numeratorCaveat: string;
  stability: Metric<StabilityRow>;
  stabilityTrack: StabilityRow[];
  regimes: RegimeEvent[];
  deadMoney: DeadMoneyBlock;
  draft: DraftBlock;
}

function asOfOf(date: string | null, stage: string | null): AsOf | null {
  return date && stage ? { date, stage: stage as AsOfStage } : null;
}

export async function getTeamBundle(
  team: TeamAbbr,
  season: number,
  numerator: CostNumerator = DEFAULT_NUMERATOR,
): Promise<TeamBundle | null> {
  const db = await getDb();

  const resultRows = await db
    .select()
    .from(s.teamSeasonResults)
    .where(and(eq(s.teamSeasonResults.team, team), eq(s.teamSeasonResults.season, season)))
    .limit(1);
  if (!resultRows.length) return null;
  const r = resultRows[0];

  /* --- 1. results + EPA --- */
  const results = value<TeamResults>(toResults(r));

  const epaRows = await db
    .select()
    .from(s.teamSeasonEpa)
    .where(and(eq(s.teamSeasonEpa.team, team), eq(s.teamSeasonEpa.season, season)))
    .limit(1);
  const epa: Metric<TeamEpa> = epaRows.length ? value(toEpa(epaRows[0])) : blank(BLANK_REASON.MART_ABSENT);

  /* --- index (Cap+ where covered, Team Rating where not) --- */
  const capplus = await getCapPlus(season, team);
  const ratingMetric = await getTeamRating(season, team);
  const teamRating: Metric<number> = mapMetric(ratingMetric, (t) => t.perfIndex);

  const isCapPlus = capplus.state === 'value';
  const index = {
    name: isCapPlus ? 'Cap+' : TEAM_RATING_NAME,
    metric: isCapPlus ? capplus : teamRating,
    isCapPlus,
  };

  /* --- 2. the 25-season history --- */
  const ratingSeries = (await isSeeded('team_rating'))
    ? await db
        .select()
        .from(s.teamRating)
        .where(eq(s.teamRating.team, team))
        .orderBy(asc(s.teamRating.season))
    : [];
  const capplusSeries = (await isSeeded('capplus_official'))
    ? await db
        .select()
        .from(s.capplusOfficial)
        .where(eq(s.capplusOfficial.team, team))
        .orderBy(asc(s.capplusOfficial.season))
    : [];
  const capplusBySeason = new Map(capplusSeries.map((c) => [c.season, c]));

  const blankSeasons = await capplusBlankSeasons();
  const history: FranchiseHistory = {
    breakSeason: TIER2_FIRST_SEASON,
    bridgeSentence: BRIDGE_SENTENCE,
    blankSeasons,
    points: ratingSeries.map((tr) => {
      const cp = capplusBySeason.get(tr.season);
      return {
        season: tr.season,
        teamRating: value(tr.perfIndex),
        capplus: cp
          ? badged(
              cp.capplus,
              { date: cp.dmAsofDate, stage: cp.dmAsofStage as AsOfStage },
              cp.badge as CapPlusBadge,
              cp.badgeReason,
            )
          : tr.season < TIER2_FIRST_SEASON
            ? blank(BLANK_REASON.PRE_TIER2)
            : blank(BLANK_REASON.NO_DM_TABLE),
      };
    }),
  };

  /* --- 3. the three lenses --- */
  const capRows = await db
    .select()
    .from(s.teamSeasonCap)
    .where(and(eq(s.teamSeasonCap.team, team), eq(s.teamSeasonCap.season, season)))
    .limit(1);
  const cap = capRows[0];

  /**
   * THE WHOLE FRANCHISE, not just the viewed season. `dead_money_display` is
   * the render-ready resolution — one row per (season, team), each carrying its
   * own `burden_of_adjusted_cap` — so the dot plot gets every dated reading
   * this club has with its own y-position, and the viewed season is simply the
   * row that matches. Filtering this query by season was what reduced the plot
   * to a single dot.
   */
  const dmDisplaySeries = (await isSeeded('dead_money_display'))
    ? await db
        .select()
        .from(s.deadMoneyDisplay)
        .where(eq(s.deadMoneyDisplay.team, team))
        .orderBy(asc(s.deadMoneyDisplay.season))
    : [];
  const dmDisplay = dmDisplaySeries.find((x) => x.season === season);

  const dmSnapshots = (await isSeeded('dead_money_team_season'))
    ? await db
        .select()
        .from(s.deadMoneyTeamSeason)
        .where(and(eq(s.deadMoneyTeamSeason.team, team), eq(s.deadMoneyTeamSeason.season, season)))
        .orderBy(desc(s.deadMoneyTeamSeason.asofDate))
    : [];

  const toSnapshot = (row: typeof s.deadMoneyTeamSeason.$inferSelect): DeadMoneySnapshot => ({
    season: row.season,
    usd: row.deadMoneyUsd,
    asOf: { date: row.asofDate, stage: row.asofStage as AsOfStage },
    coverage: row.coverage,
    seasonCoverage: row.coverage === 'full32' ? 'full32' : 'leaders_only',
    licenseTier: row.licenseTier,
    sourceUrl: row.sourceUrl,
    note: row.note,
    // The burden denominator is published only against the RESOLVED reading, so
    // an alternate carries none rather than borrowing another row's.
    burdenOfAdjustedCap: null,
    leagueMedianUsd: null,
    isModeled: false,
    loUsd: null,
    hiUsd: null,
    badge: null,
    badgeReason: null,
  });

  const toDisplaySnapshot = (
    row: typeof s.deadMoneyDisplay.$inferSelect,
  ): DeadMoneySnapshot | null => {
    const asOf = asOfOf(row.asofDate, row.asofStage);
    if (row.deadMoneyUsd === null || !asOf) return null;
    return {
      season: row.season,
      usd: row.deadMoneyUsd,
      asOf,
      coverage: row.coverage ?? 'partial',
      seasonCoverage: row.seasonCoverage,
      licenseTier: row.licenseTier ?? '',
      sourceUrl: row.sourceUrl ?? '',
      note: row.note,
      burdenOfAdjustedCap: row.burdenOfAdjustedCap,
      leagueMedianUsd: row.leagueMedianUsd,
      isModeled: row.isModeled === true,
      loUsd: row.loUsd,
      hiUsd: row.hiUsd,
      badge: (row.badge as CapPlusBadge | null) ?? null,
      badgeReason: row.badgeReason,
    };
  };

  // The resolved reading is the one the ETL pinned in dead_money_display; the
  // rest are alternates. Nothing here re-runs the resolution rule.
  const resolvedSnapshot = dmDisplay ? toDisplaySnapshot(dmDisplay) : null;

  /**
   * `SPEC.md` §1.2 / §7.5 — a leaders-list reading is a PARTIAL season, and a
   * partial season is labeled partial. The covered count is read from the mart
   * (how many clubs the published list actually names), never assumed.
   */
  const leadersOnly = resolvedSnapshot?.seasonCoverage === 'leaders_only';
  let coveredClubs = 0;
  if (leadersOnly) {
    const covered = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.deadMoneyDisplay)
      .where(eq(s.deadMoneyDisplay.season, season));
    coveredClubs = covered[0]?.n ?? 0;
  }

  const deadMoneyResolved: Metric<DeadMoneySnapshot> = resolvedSnapshot
    ? leadersOnly
      ? partial(
          resolvedSnapshot,
          coveredClubs,
          32,
          `${NOT_A_32_TEAM_READING} — no league-wide table was published for ${season}, so this comes from a published leaders list that names ${coveredClubs} of 32 clubs.`,
        )
      : resolvedSnapshot.badge
        ? badged(resolvedSnapshot, resolvedSnapshot.asOf, resolvedSnapshot.badge, resolvedSnapshot.badgeReason)
        : value(resolvedSnapshot, resolvedSnapshot.asOf)
    : season < TIER2_FIRST_SEASON
      ? blank(BLANK_REASON.PRE_TIER2)
      : blank(dmDisplay?.blankReason ?? BLANK_REASON.NO_DM_TABLE);

  const lenses: Lens[] = [
    {
      key: 'cap',
      label: 'Cap hit (season-final)',
      amount: cap ? value(cap.capUsedTotal) : blank(BLANK_REASON.PRE_TIER2),
      caveat: NUMERATOR_CAVEAT.cap,
      asOf: null,
      leagueMedianUsd: null,
      sourceUrl: null,
      range: null,
    },
    {
      key: 'cash',
      label: 'Cash spent',
      amount: cap ? value(cap.cashSpentTotal) : blank(BLANK_REASON.PRE_TIER2),
      caveat: NUMERATOR_CAVEAT.cash,
      asOf: null,
      leagueMedianUsd: null,
      sourceUrl: null,
      range: null,
    },
    {
      key: 'dead_money',
      label: 'Dead money',
      amount: mapMetric(deadMoneyResolved, (d) => d.usd),
      caveat: resolvedSnapshot?.isModeled
        ? 'Dead money is cap you still pay for players who are gone. Nobody published this club’s figure for this season, so it’s modeled from contract data and shown with its 80% range. Value, date and range always appear together.'
        : 'Dead money is cap you still pay for players who are gone. This is a dated press snapshot, not a figure we calculate. Value, date and stage always appear together, and we never average readings or connect them across seasons.',
      asOf: resolvedSnapshot?.asOf ?? null,
      leagueMedianUsd: resolvedSnapshot?.leagueMedianUsd ?? null,
      sourceUrl: resolvedSnapshot?.sourceUrl || null,
      range:
        resolvedSnapshot?.isModeled && resolvedSnapshot.loUsd !== null && resolvedSnapshot.hiUsd !== null
          ? { lo: resolvedSnapshot.loUsd, hi: resolvedSnapshot.hiUsd }
          : null,
    },
  ];

  /* --- 4. allocation --- */
  const allocRows = (await isSeeded('position_allocation'))
    ? await db
        .select()
        .from(s.positionAllocation)
        .where(and(eq(s.positionAllocation.team, team), eq(s.positionAllocation.season, season)))
        .orderBy(desc(s.positionAllocation.shareOfRosteredCap))
    : [];
  const allocation: Metric<AllocationBar[]> = allocRows.length
    ? value(
        allocRows.map((a) => ({
          positionGroup: a.positionGroup,
          capUsd: a.capUsd,
          shareOfRosteredCap: a.shareOfRosteredCap,
          leagueShare: a.leagueShare,
          deltaVsLeague: a.deltaVsLeague,
        })),
      )
    : blank(BLANK_REASON.PRE_TIER2);

  /* --- 5. cost per win --- */
  const costPerWin = await getCostPerWin(season, team, numerator);

  /* --- 6. stability + regimes --- */
  const stabilityRows = (await isSeeded('team_season_stability'))
    ? await db
        .select()
        .from(s.teamSeasonStability)
        .where(eq(s.teamSeasonStability.team, team))
        .orderBy(asc(s.teamSeasonStability.season))
    : [];
  const track: StabilityRow[] = stabilityRows.map((x) => ({
    season: x.season,
    churnPoints: x.churnPoints,
    w: x.w,
    stabilityIndex: x.stabilityIndex,
    windowTruncated: x.windowTruncated,
    hc: x.hc,
    oc: x.oc,
    dc: x.dc,
    hcTenureSeasons: x.hcTenureSeasons,
    ocTenureSeasons: x.ocTenureSeasons,
    dcTenureSeasons: x.dcTenureSeasons,
    regimeId: x.regimeId,
    regimeSeasonN: x.regimeSeasonN,
  }));
  const thisSeasonStability = track.find((x) => x.season === season);
  const stability: Metric<StabilityRow> = thisSeasonStability
    ? value(thisSeasonStability)
    : blank('Not available — the coaching record begins in 2000 (Houston enters in 2002).');

  const regimeRows = (await isSeeded('regime_events'))
    ? await db
        .select()
        .from(s.regimeEvents)
        .where(eq(s.regimeEvents.team, team))
        .orderBy(asc(s.regimeEvents.season))
    : [];
  const regimes: RegimeEvent[] = regimeRows.map((x) => ({
    season: x.season,
    kind: x.kind as 'offseason' | 'in_season',
    outgoingHc: x.outgoingHc,
    incomingHc: x.incomingHc,
    regimeId: x.regimeId,
    dmNext1: {
      season: x.dmNext1Season,
      state: (x.dmNext1State ?? 'blank') as 'value' | 'blank',
      usd: x.dmNext1Usd,
      asOf: asOfOf(x.dmNext1AsofDate, x.dmNext1AsofStage),
      leagueMedianUsd: x.dmNext1LeagueMedianUsd,
      reason: x.dmNext1BlankReason,
      badge: x.dmNext1Badge ?? null,
      isModeled: Boolean(x.dmNext1IsModeled),
    },
    dmNext2: {
      season: x.dmNext2Season,
      state: (x.dmNext2State ?? 'blank') as 'value' | 'blank',
      usd: x.dmNext2Usd,
      asOf: asOfOf(x.dmNext2AsofDate, x.dmNext2AsofStage),
      leagueMedianUsd: x.dmNext2LeagueMedianUsd,
      reason: x.dmNext2BlankReason,
      badge: x.dmNext2Badge ?? null,
      isModeled: Boolean(x.dmNext2IsModeled),
    },
  }));

  /* --- 7. dead money --- */
  const ledgerRows = (await isSeeded('dead_money_ledger'))
    ? await db.select().from(s.deadMoneyLedger).where(eq(s.deadMoneyLedger.team, team))
    : [];

  const series = dmDisplaySeries
    .map(toDisplaySnapshot)
    .filter((x): x is DeadMoneySnapshot => x !== null);
  const seasonsWithReading = new Set(series.map((x) => x.season));

  const deadMoney: DeadMoneyBlock = {
    resolved: deadMoneyResolved,
    alternates: dmSnapshots
      .filter((x) => x.asofDate !== resolvedSnapshot?.asOf.date)
      .map(toSnapshot),
    seriesRenderer: 'dot_plot_no_path',
    series,
    emptyBlankSeasons: blankSeasons.filter((x) => !seasonsWithReading.has(x)),
    ledger: ledgerRows.map((x) => ({
      player: x.player,
      seasons: x.seasons,
      totalUsd: x.totalUsd,
      splitBySeason: x.splitBySeason,
      isActual: x.isActual,
      verifiedAsof: x.verifiedAsof,
      sourceUrl: x.sourceUrl,
      notes: x.notes,
    })),
    burdenOfAdjustedCap: dmDisplay?.burdenOfAdjustedCap ?? null,
    leagueMedianUsd: dmDisplay?.leagueMedianUsd ?? null,
  };

  /* --- 8. draft --- */
  const classRows = (await isSeeded('draft_class_summary'))
    ? await db
        .select()
        .from(s.draftClassSummary)
        .where(and(eq(s.draftClassSummary.team, team), eq(s.draftClassSummary.season, season)))
        .limit(1)
    : [];
  const pickRows = (await isSeeded('draft_pick'))
    ? await db
        .select()
        .from(s.draftPick)
        .where(and(eq(s.draftPick.team, team), eq(s.draftPick.season, season)))
        .orderBy(asc(s.draftPick.pick))
    : [];

  const c = classRows[0];
  const draft: DraftBlock = {
    summary: c
      ? value({
          nPicks: c.nPicks,
          capital: c.capital,
          capitalRank: c.capitalRank,
          returnGames: c.returnGames,
          returnWAv: c.returnWAv,
          returnSeasonsStarted: c.returnSeasonsStarted,
          nExcludedNoGsis: c.nExcludedNoGsis,
          snapsAvailable: c.snapsAvailable,
          draftIndex: c.draftIndex,
          draftIndexRank: c.draftIndexRank,
          maturity: c.maturity,
          seasonsElapsed: c.seasonsElapsed,
        })
      : blank('Not available — the draft record begins in 2000.'),
    // Tier boundaries are respected: capital and return are Tier 1; any framing
    // in DOLLARS is Tier 2 and renders only for 2013+.
    dollarFraming:
      c?.dollarFramingAvailable === true
        ? value(null)
        : blank(c?.dollarFramingBlankReason ?? BLANK_REASON.PRE_TIER2),
    picks: pickRows.map((p) => ({
      round: p.round,
      pick: p.pick,
      playerName: p.playerName,
      position: p.position,
      college: p.college,
      chartValue: p.chartValue,
      games: p.games,
      wAv: p.wAv,
      seasonsStarted: p.seasonsStarted,
      probowls: p.probowls,
      allpro: p.allpro,
      hof: p.hof,
    })),
  };

  const identity = eraIdentity(team, season);

  return {
    team,
    season,
    identity,
    identityLine: `${identity.name} · ${season}`,
    seasons: await seasonsForTeam(team),
    results,
    epa,
    index,
    capplus,
    teamRating,
    history,
    lenses,
    allocation,
    costPerWin,
    numeratorLabel: NUMERATOR_LABEL[numerator],
    numeratorCaveat: NUMERATOR_CAVEAT[numerator],
    stability,
    stabilityTrack: track,
    regimes,
    deadMoney,
    draft,
  };
}

/* ------------------------------------------------------------------ */
/* 10. The Roster Receipt — the itemized bill (review E1)               */
/* ------------------------------------------------------------------ */

/**
 * One rostered contract on the bill. Cap and games sit SIDE BY SIDE and are
 * never divided: a player's cap over his production is a player grade, which
 * `SPEC.md` forbids. `games` is the club's games for this player that season
 * (`player_season_availability`), blank when no snap row links to the contract.
 */
export interface RosterReceiptLine {
  player: string;
  positionGroup: string | null;
  capHit: number;
  games: Metric<number>;
}

/** A dead-money VOID line. Dead money counts once (λ = 1, `DECISIONS.md` 109). */
export interface RosterVoidLine {
  label: string;
  usd: number;
}

export type ReceiptVerdictLabel = 'STEAL' | 'WORTH IT' | 'FAIR PRICE' | 'OVERPAID' | 'MONEY PIT';

/**
 * The stamp. Cutoffs are the SEASON'S quintiles of cap-per-win across every
 * club with at least one win (zero-win clubs are excluded from ratio-ranked
 * orderings, `SPEC.md` §2.5) — computed from the data, never round numbers.
 */
export interface ReceiptVerdict {
  label: ReceiptVerdictLabel;
  /** 1 = cheapest fifth of the league per win … 5 = dearest. */
  quintile: 1 | 2 | 3 | 4 | 5;
  /** The four cut points, USD per win, ascending (20th/40th/60th/80th pct). */
  cutoffs: [number, number, number, number];
  /** 1 = cheapest per win. */
  rank: number;
  /** Clubs ranked (zero-win clubs excluded). */
  of: number;
  rule: string;
}

export interface RosterReceipt {
  team: TeamAbbr;
  season: number;
  identity: EraIdentity;
  /** Head coach(es) of record, in stint order: "Andy Reid". */
  regime: Metric<string>;
  /** The dated dead-money snapshot the bill (and Cap+) reads. */
  snapshot: AsOf | null;
  lines: RosterReceiptLine[];
  /** Everyone below the top 12, as one line, so the subtotal reconciles. */
  others: { count: number; capHit: number };
  /** = team_season_cap.cap_used_total (rostered players, season-final). */
  rosterSubtotal: number;
  rosterCount: number;
  leagueCap: number;
  dead: Metric<{
    lines: RosterVoidLine[];
    total: number;
    note: string | null;
    /** A MODELED figure (estimated season): its 80% range. Never rendered bare. */
    range: { lo: number; hi: number } | null;
  }>;
  /**
   * Cap+ floors the cost index at the season's 25th percentile: a club that
   * spent below it is charged the floor anyway. The gap, in dollars at the
   * league cap, is the "unspent cap, no credit" line. `null` when not floored.
   */
  unspent: number | null;
  /** (cap + dead [+ unspent]) — the cost Cap+ divides by. Cap+ seasons only. */
  charged: Metric<number>;
  results: TeamResults;
  epa: Metric<TeamEpa>;
  capplus: Metric<CapPlusValue>;
  /** Cap hit ÷ wins — the bill's own currency. Zero-win rule applies. */
  costPerWin: Metric<CostPerWin>;
  leagueCostPerWin: Metric<number>;
  verdict: Metric<ReceiptVerdict>;
  numeratorCaveat: string;
}

export const RECEIPT_TOP_N = 12;

const VERDICT_LABELS: readonly ReceiptVerdictLabel[] = [
  'STEAL',
  'WORTH IT',
  'FAIR PRICE',
  'OVERPAID',
  'MONEY PIT',
];

/** Type-7 (linear interpolation) quantile of an ascending array. */
function quantileSorted(xs: readonly number[], q: number): number {
  const h = (xs.length - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  return xs[lo] + (h - lo) * (xs[hi] - xs[lo]);
}

const seasonCapPerWinCache = new Map<number, Promise<Map<string, number>>>();

/** Every club's cap-per-win for one season (wins > 0 only). Memoized per season. */
function seasonCapPerWin(season: number): Promise<Map<string, number>> {
  let p = seasonCapPerWinCache.get(season);
  if (!p) {
    p = (async () => {
      const db = await getDb();
      const rows = await db
        .select({
          team: s.teamSeasonCap.team,
          cap: s.teamSeasonCap.capUsedTotal,
          wins: s.teamSeasonResults.wins,
        })
        .from(s.teamSeasonCap)
        .innerJoin(
          s.teamSeasonResults,
          and(
            eq(s.teamSeasonResults.season, s.teamSeasonCap.season),
            eq(s.teamSeasonResults.team, s.teamSeasonCap.team),
          ),
        )
        .where(eq(s.teamSeasonCap.season, season));
      return new Map(rows.filter((r) => r.wins > 0).map((r) => [r.team, r.cap / r.wins]));
    })();
    seasonCapPerWinCache.set(season, p);
  }
  return p;
}

/** The verdict for one club, or the reason there is none. */
export async function getReceiptVerdict(
  season: number,
  team: string,
): Promise<Metric<ReceiptVerdict>> {
  if (season < TIER2_FIRST_SEASON) return blank(BLANK_REASON.PRE_TIER2);
  const all = await seasonCapPerWin(season);
  const mine = all.get(team);
  if (mine === undefined) {
    return blank('No verdict — clubs with 0 wins sit out the per-win rankings.');
  }
  const sorted = [...all.values()].sort((a, b) => a - b);
  if (sorted.length < 5) return blank(NOT_A_32_TEAM_READING);
  const cutoffs = [0.2, 0.4, 0.6, 0.8].map((q) => quantileSorted(sorted, q)) as [
    number,
    number,
    number,
    number,
  ];
  const idx = cutoffs.findIndex((c) => mine <= c);
  const quintile = (idx === -1 ? 5 : idx + 1) as ReceiptVerdict['quintile'];
  const rank = sorted.filter((x) => x < mine).length + 1;
  return value<ReceiptVerdict>({
    label: VERDICT_LABELS[quintile - 1],
    quintile,
    cutoffs,
    rank,
    of: sorted.length,
    rule: `The verdict ranks ${season} cap per win in fifths across ${sorted.length} clubs; clubs with 0 wins sit out.`,
  });
}

/**
 * The Roster Receipt for one team-season. Blank before 2013 (no contract data)
 * and wherever the cap mart has no row — never a zero-line bill.
 */
export async function getRosterReceipt(
  season: number,
  team: TeamAbbr,
): Promise<Metric<RosterReceipt>> {
  if (season < TIER2_FIRST_SEASON) return blank(BLANK_REASON.PRE_TIER2);
  if (!(await isSeeded('team_season_cap')) || !(await isSeeded('player_season_cap'))) {
    return blank(BLANK_REASON.MART_ABSENT);
  }
  const db = await getDb();

  const [capRow] = await db
    .select()
    .from(s.teamSeasonCap)
    .where(and(eq(s.teamSeasonCap.team, team), eq(s.teamSeasonCap.season, season)))
    .limit(1);
  const [res] = await db
    .select()
    .from(s.teamSeasonResults)
    .where(and(eq(s.teamSeasonResults.team, team), eq(s.teamSeasonResults.season, season)))
    .limit(1);
  if (!capRow || !res) return blank(BLANK_REASON.PRE_TIER2);

  /* --- line items: every rostered contract, cap hit desc --- */
  const contracts = await db
    .select({
      player: s.playerSeasonCap.player,
      positionGroup: s.playerSeasonCap.positionGroup,
      capHit: s.playerSeasonCap.capNumber,
      gsisId: s.playerSeasonCap.gsisId,
      games: s.playerSeasonAvailability.games,
      linked: s.playerSeasonAvailability.gsisId,
    })
    .from(s.playerSeasonCap)
    .leftJoin(
      s.playerSeasonAvailability,
      and(
        eq(s.playerSeasonAvailability.gsisId, s.playerSeasonCap.gsisId),
        eq(s.playerSeasonAvailability.season, s.playerSeasonCap.season),
        eq(s.playerSeasonAvailability.team, s.playerSeasonCap.team),
      ),
    )
    .where(and(eq(s.playerSeasonCap.team, team), eq(s.playerSeasonCap.season, season)))
    .orderBy(desc(s.playerSeasonCap.capNumber));

  const top = contracts.slice(0, RECEIPT_TOP_N);
  const lines: RosterReceiptLine[] = top.map((c) => ({
    player: c.player ?? 'Unnamed contract',
    positionGroup: c.positionGroup,
    capHit: c.capHit,
    games:
      c.linked && c.games !== null
        ? value(c.games)
        : blank(
            c.gsisId
              ? 'No snap record for this player with this club this season.'
              : 'No player ID ties this contract to snap records.',
          ),
  }));
  const topSum = top.reduce((a, c) => a + c.capHit, 0);
  // The subtotal is the MART's figure, not a re-sum: the "others" line absorbs
  // the remainder so the bill reconciles to `team_season_cap` to the dollar.
  const others = {
    count: Math.max(0, contracts.length - top.length),
    capHit: capRow.capUsedTotal - topSum,
  };

  /* --- regime: the head coach(es) of record --- */
  const hcRows = await db
    .select({ name: s.coachingStaff.coachName, stint: s.coachingStaff.stint })
    .from(s.coachingStaff)
    .where(
      and(
        eq(s.coachingStaff.season, season),
        eq(s.coachingStaff.role, 'HC'),
        sql`coalesce(${s.coachingStaff.teamCurrent}, ${s.coachingStaff.team}) = ${team}`,
      ),
    )
    .orderBy(asc(s.coachingStaff.stint));
  const coaches = hcRows.map((r) => r.name).filter((n) => n && n !== 'NONE');
  const regime: Metric<string> = coaches.length
    ? value(coaches.join(' → '))
    : blank('No head coach on record in the coaching data.');

  /* --- Cap+ and the dead-money snapshot it read --- */
  const capplus = await getCapPlus(season, team);
  const [dm] = (await isSeeded('dead_money_display'))
    ? await db
        .select()
        .from(s.deadMoneyDisplay)
        .where(and(eq(s.deadMoneyDisplay.team, team), eq(s.deadMoneyDisplay.season, season)))
        .limit(1)
    : [];

  // Cap+ seasons read the figure Cap+ itself used; others read the display row.
  const deadUsd =
    capplus.state === 'value' ? capplus.value.deadMoneyRec : (dm?.deadMoneyUsd ?? null);
  // In an estimated season Cap+ carries the season's reference date for every
  // club; a PUBLISHED club's own reading date lives on the display row, and a
  // published figure shows its own date (SPEC §7.5).
  const snapshot: AsOf | null =
    capplus.state === 'value' && !(capplus.badge === 'estimated' && dm?.asofDate)
      ? (capplus.asOf ?? null)
      : asOfOf(dm?.asofDate ?? null, dm?.asofStage ?? null);

  // A modeled figure carries its 80% range wherever it renders (SPEC §2.2).
  const modeled =
    (capplus.state === 'value' ? capplus.value.dmIsModeled : dm?.isModeled === true) &&
    dm?.loUsd != null &&
    dm?.hiUsd != null
      ? { lo: dm.loUsd, hi: dm.hiUsd }
      : null;

  let dead: RosterReceipt['dead'];
  if (deadUsd === null || !snapshot) {
    dead = blank(dm?.blankReason ?? BLANK_REASON.NO_DM_TABLE);
  } else {
    const voidLines: RosterVoidLine[] = [];
    let note: string | null = null;
    const attributed = dm?.ledgerUsdAttributed ?? 0;
    const named = dm?.ledgerPlayers ?? null;
    if (named && dm?.ledgerSplitAllEstablished && attributed > 0 && attributed <= deadUsd) {
      voidLines.push({ label: named, usd: attributed });
      const rest = deadUsd - attributed;
      if (rest > 0) voidLines.push({ label: 'All other dead money', usd: rest });
    } else {
      voidLines.push({ label: 'Dead money', usd: deadUsd });
      if (named && attributed > deadUsd) {
        note = `${named}'s verified charge is larger than this dated snapshot shows. The snapshot predates it.`;
      } else if (named && !dm?.ledgerSplitAllEstablished) {
        note = `Includes ${named}. The split by season is not confirmed.`;
      }
    }
    dead = value({ lines: voidLines, total: deadUsd, note, range: modeled }, snapshot);
  }

  const leagueCap = capRow.leagueCap;
  const unspent =
    capplus.state === 'value' && capplus.value.wasFloored
      ? (capplus.value.costFloor - capplus.value.costRec) * leagueCap
      : null;
  const charged: Metric<number> =
    capplus.state === 'value'
      ? value(Math.max(capplus.value.costRec, capplus.value.costFloor) * leagueCap)
      : blank(capplus.reason);

  const [epaRow] = await db
    .select()
    .from(s.teamSeasonEpa)
    .where(and(eq(s.teamSeasonEpa.team, team), eq(s.teamSeasonEpa.season, season)))
    .limit(1);

  const [costPerWin, leagueCostPerWin, verdict] = await Promise.all([
    getCostPerWin(season, team, 'cap'),
    getLeagueAvgCostPerWin(season, 'cap'),
    getReceiptVerdict(season, team),
  ]);

  return value<RosterReceipt>(
    {
      team,
      season,
      identity: eraIdentity(team, season),
      regime,
      snapshot,
      lines,
      others,
      rosterSubtotal: capRow.capUsedTotal,
      rosterCount: contracts.length,
      leagueCap,
      dead,
      unspent,
      charged,
      results: toResults(res),
      epa: epaRow ? value(toEpa(epaRow)) : blank(BLANK_REASON.MART_ABSENT),
      capplus,
      costPerWin,
      leagueCostPerWin,
      verdict,
      numeratorCaveat: NUMERATOR_CAVEAT.cap,
    },
    snapshot ?? undefined,
  );
}

/* ------------------------------------------------------------------ */
/* 11. Team-season page support — verdict, arc inspection, draft bench  */
/*     (added for the team-page upgrade; read-only, display arithmetic) */
/* ------------------------------------------------------------------ */

/** One season of a franchise, as the arc's inspection layer repeats it. */
export interface FranchiseSeasonFact {
  season: number;
  wins: number;
  losses: number;
  ties: number;
  /** Cash to rostered players, USD. Blank before 2013. */
  cashSpend: Metric<number>;
  /** League cash ÷ league wins for the same season. Blank before 2013. */
  leagueCashPerWin: Metric<number>;
}

/**
 * Every season's record and cash spend for one franchise, with the league's
 * cash-per-win for that season beside it. Sums of mart columns only — the same
 * arithmetic `getLeagueAvgCostPerWin` does, done once for all seasons.
 */
export async function getFranchiseSeasonFacts(team: TeamAbbr): Promise<FranchiseSeasonFact[]> {
  const db = await getDb();
  const results = await db
    .select()
    .from(s.teamSeasonResults)
    .where(eq(s.teamSeasonResults.team, team))
    .orderBy(asc(s.teamSeasonResults.season));

  const capSeeded = await isSeeded('team_season_cap');
  const cash = new Map<number, number>();
  const league = new Map<number, { spend: number; wins: number; n: number }>();
  if (capSeeded) {
    const rows = await db
      .select({
        season: s.teamSeasonCap.season,
        team: s.teamSeasonCap.team,
        cash: s.teamSeasonCap.cashSpentTotal,
        wins: s.teamSeasonResults.wins,
      })
      .from(s.teamSeasonCap)
      .innerJoin(
        s.teamSeasonResults,
        and(
          eq(s.teamSeasonResults.season, s.teamSeasonCap.season),
          eq(s.teamSeasonResults.team, s.teamSeasonCap.team),
        ),
      );
    for (const r of rows) {
      if (r.team === team) cash.set(r.season, r.cash);
      const l = league.get(r.season) ?? { spend: 0, wins: 0, n: 0 };
      l.spend += r.cash;
      l.wins += r.wins;
      l.n += 1;
      league.set(r.season, l);
    }
  }

  return results.map((r) => {
    const l = league.get(r.season);
    const pre = r.season < TIER2_FIRST_SEASON;
    const cashSpend: Metric<number> = pre
      ? blank(BLANK_REASON.PRE_TIER2)
      : cash.has(r.season)
        ? value(cash.get(r.season) as number)
        : blank(BLANK_REASON.MART_ABSENT);
    const leagueCashPerWin: Metric<number> = pre
      ? blank(BLANK_REASON.PRE_TIER2)
      : !l || l.wins === 0
        ? blank(BLANK_REASON.MART_ABSENT)
        : l.n < 32
          ? partial(l.spend / l.wins, l.n, 32, `Not a full-league reading — ${l.n} of 32 clubs.`)
          : value(l.spend / l.wins);
    return {
      season: r.season,
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      cashSpend,
      leagueCashPerWin,
    };
  });
}

/** Where a club's three performance inputs placed it in its own season. */
export interface SeasonInputRanks {
  n: number;
  winPctRank: number;
  pointDiffRank: number;
  /** Opponent-adjusted EPA margin rank. Blank where the EPA mart has no row for the club. */
  epaMarginRank: Metric<number>;
}

/**
 * Rank (1 = best) of the club's win %, point differential per game and
 * opponent-adjusted EPA margin per play among that season's clubs. The three inputs of `SPEC.md`
 * §2.4, read from their marts and ordered — nothing is standardized or blended
 * here, so no index is recomputed. Ties share the better rank.
 */
export async function getSeasonInputRanks(
  season: number,
  team: TeamAbbr,
): Promise<Metric<SeasonInputRanks>> {
  const db = await getDb();
  const res = await db
    .select()
    .from(s.teamSeasonResults)
    .where(eq(s.teamSeasonResults.season, season));
  const me = res.find((r) => r.team === team);
  if (!me) return blank(BLANK_REASON.MART_ABSENT);

  const rankOf = (vals: number[], v: number) => 1 + vals.filter((x) => x > v).length;
  const winPctRank = rankOf(
    res.map((r) => r.winPct),
    me.winPct,
  );
  const pdg = (r: (typeof res)[number]) => r.pointDiff / Math.max(1, r.games);
  const pointDiffRank = rankOf(res.map(pdg), pdg(me));

  const epa = await db
    .select({ team: s.teamSeasonEpa.team, m: s.teamSeasonEpa.epaMarginPerPlayAdj })
    .from(s.teamSeasonEpa)
    .where(eq(s.teamSeasonEpa.season, season));
  const myEpa = epa.find((r) => r.team === team);
  const epaMarginRank: Metric<number> = myEpa
    ? value(
        rankOf(
          epa.map((r) => r.m),
          myEpa.m,
        ),
      )
    : blank(BLANK_REASON.MART_ABSENT);

  return value({ n: res.length, winPctRank, pointDiffRank, epaMarginRank });
}

/** The league's draft-class medians for one season — the draft card's benchmark. */
export interface DraftLeagueMedians {
  n: number;
  capital: number;
  returnWAv: Metric<number>;
  returnGames: Metric<number>;
}

function medianOf(xs: number[]): number | null {
  if (!xs.length) return null;
  const v = [...xs].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Medians of published `draft_class_summary` columns across the season's clubs. */
export async function getDraftLeagueMedians(season: number): Promise<Metric<DraftLeagueMedians>> {
  if (!(await isSeeded('draft_class_summary'))) return blank(BLANK_REASON.MART_ABSENT);
  const db = await getDb();
  const rows = await db
    .select()
    .from(s.draftClassSummary)
    .where(eq(s.draftClassSummary.season, season));
  const capital = medianOf(rows.map((r) => r.capital));
  if (capital === null) return blank('Not available — the draft record begins in 2000.');
  const wav = medianOf(rows.map((r) => r.returnWAv).filter((v): v is number => v !== null));
  const games = medianOf(rows.map((r) => r.returnGames).filter((v): v is number => v !== null));
  return value({
    n: rows.length,
    capital,
    returnWAv: wav === null ? blank(BLANK_REASON.MART_ABSENT) : value(wav),
    returnGames: games === null ? blank(BLANK_REASON.MART_ABSENT) : value(games),
  });
}

/** One team-season's results row — the light read the share cards need. */
export async function getTeamSeasonResults(
  team: TeamAbbr,
  season: number,
): Promise<Metric<TeamResults>> {
  const db = await getDb();
  const [r] = await db
    .select()
    .from(s.teamSeasonResults)
    .where(and(eq(s.teamSeasonResults.team, team), eq(s.teamSeasonResults.season, season)))
    .limit(1);
  if (!r) return blank('Not available — no results are on record for this team-season.');
  return value<TeamResults>(toResults(r));
}
