/**
 * Team-season bundle — `SPEC.md` §3.2.
 *
 * Nine blocks, all read from marts:
 *   1 header · 2 the 25-season history with the HARD BREAK AT 2013 · 3 the three
 *   lenses · 4 allocation · 5 cost per win · 6 stability + regimes · 7 dead money
 *   (dot plot, never a line) · 8 draft ROI · 9 CSV export (the view's job).
 */

import { and, asc, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import {
  BLANK_REASON,
  BRIDGE_SENTENCE,
  TEAM_RATING_NAME,
  blank,
  mapMetric,
  value,
  type AsOf,
  type AsOfStage,
  type Metric,
} from '@/lib/metric';
import { eraIdentity, type EraIdentity, type TeamAbbr } from '@/lib/teams';
import { isSeeded } from './registry';
import { seasonsForTeam } from './seasons';
import {
  CAPPLUS_BLANK_SEASONS,
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
}

export interface TeamEpa {
  offPlays: number;
  defPlays: number;
  offEpaPerPlay: number;
  defEpaPerPlay: number;
  epaMarginPerPlay: number;
  offEpaTotal: number;
  defEpaTotal: number;
}

/* ------------------------------------------------------------------ */
/* 2. The 25-season history                                             */
/* ------------------------------------------------------------------ */

export interface HistoryPoint {
  season: number;
  /** All 861 team-seasons carry this. */
  teamRating: Metric<number>;
  /** Nine seasons carry this; four render as LABELLED GAPS, never interpolated. */
  capplus: Metric<number>;
}

export interface FranchiseHistory {
  /** The hard visual break. Both lines are plotted on the 2014–2025 overlap. */
  breakSeason: number;
  bridgeSentence: string;
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
  sourceUrl: string | null;
}

/* ------------------------------------------------------------------ */
/* 4. Allocation                                                        */
/* ------------------------------------------------------------------ */

export interface AllocationBar {
  positionGroup: string;
  capUsd: number;
  shareOfRosteredCap: number;
  leagueShare: number;
  /** Diverging from a zero-centred league-average axis. */
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
  licenseTier: string;
  sourceUrl: string;
  note: string | null;
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
  const results = value<TeamResults>({
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
  });

  const epaRows = await db
    .select()
    .from(s.teamSeasonEpa)
    .where(and(eq(s.teamSeasonEpa.team, team), eq(s.teamSeasonEpa.season, season)))
    .limit(1);
  const epa: Metric<TeamEpa> = epaRows.length
    ? value({
        offPlays: epaRows[0].offPlays,
        defPlays: epaRows[0].defPlays,
        offEpaPerPlay: epaRows[0].offEpaPerPlay,
        defEpaPerPlay: epaRows[0].defEpaPerPlay,
        epaMarginPerPlay: epaRows[0].epaMarginPerPlay,
        offEpaTotal: epaRows[0].offEpaTotal,
        defEpaTotal: epaRows[0].defEpaTotal,
      })
    : blank(BLANK_REASON.MART_ABSENT);

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

  const history: FranchiseHistory = {
    breakSeason: TIER2_FIRST_SEASON,
    bridgeSentence: BRIDGE_SENTENCE,
    blankSeasons: CAPPLUS_BLANK_SEASONS,
    points: ratingSeries.map((tr) => {
      const cp = capplusBySeason.get(tr.season);
      return {
        season: tr.season,
        teamRating: value(tr.perfIndex),
        capplus: cp
          ? value(cp.capplus, { date: cp.dmAsofDate, stage: cp.dmAsofStage as AsOfStage }, cp.badge === 'provisional')
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

  const dmDisplayRows = (await isSeeded('dead_money_display'))
    ? await db
        .select()
        .from(s.deadMoneyDisplay)
        .where(and(eq(s.deadMoneyDisplay.team, team), eq(s.deadMoneyDisplay.season, season)))
        .limit(1)
    : [];
  const dmDisplay = dmDisplayRows[0];

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
    licenseTier: row.licenseTier,
    sourceUrl: row.sourceUrl,
    note: row.note,
  });

  // The resolved reading is the one the ETL pinned in dead_money_display; the
  // rest are alternates. Nothing here re-runs the resolution rule.
  const resolvedAsOf = asOfOf(dmDisplay?.asofDate ?? null, dmDisplay?.asofStage ?? null);
  const resolvedSnapshot =
    dmDisplay && dmDisplay.deadMoneyUsd !== null && resolvedAsOf
      ? {
          season,
          usd: dmDisplay.deadMoneyUsd,
          asOf: resolvedAsOf,
          coverage: dmDisplay.coverage ?? 'partial',
          licenseTier: dmDisplay.licenseTier ?? '',
          sourceUrl: dmDisplay.sourceUrl ?? '',
          note: dmDisplay.note,
        }
      : null;

  const deadMoneyResolved: Metric<DeadMoneySnapshot> = resolvedSnapshot
    ? value(resolvedSnapshot, resolvedSnapshot.asOf)
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
      sourceUrl: null,
    },
    {
      key: 'cash',
      label: 'Cash spent',
      amount: cap ? value(cap.cashSpentTotal) : blank(BLANK_REASON.PRE_TIER2),
      caveat: NUMERATOR_CAVEAT.cash,
      asOf: null,
      sourceUrl: null,
    },
    {
      key: 'dead_money',
      label: 'Dead money',
      amount: mapMetric(deadMoneyResolved, (d) => d.usd),
      caveat:
        'A dated press snapshot, not a derived figure. Value, date and stage always render together; readings are never averaged or connected across seasons.',
      asOf: resolvedSnapshot?.asOf ?? null,
      sourceUrl: resolvedSnapshot?.sourceUrl ?? null,
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
    : blank('Not available — the coaching record begins in 2000 (Houston enters 2002).');

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
    },
    dmNext2: {
      season: x.dmNext2Season,
      state: (x.dmNext2State ?? 'blank') as 'value' | 'blank',
      usd: x.dmNext2Usd,
      asOf: asOfOf(x.dmNext2AsofDate, x.dmNext2AsofStage),
      leagueMedianUsd: x.dmNext2LeagueMedianUsd,
      reason: x.dmNext2BlankReason,
    },
  }));

  /* --- 7. dead money --- */
  const dmSeriesRows = (await isSeeded('dead_money_team_season'))
    ? await db
        .select()
        .from(s.deadMoneyTeamSeason)
        .where(eq(s.deadMoneyTeamSeason.team, team))
        .orderBy(asc(s.deadMoneyTeamSeason.season), asc(s.deadMoneyTeamSeason.asofDate))
    : [];

  const ledgerRows = (await isSeeded('dead_money_ledger'))
    ? await db.select().from(s.deadMoneyLedger).where(eq(s.deadMoneyLedger.team, team))
    : [];

  const deadMoney: DeadMoneyBlock = {
    resolved: deadMoneyResolved,
    alternates: dmSnapshots
      .filter((x) => x.asofDate !== resolvedSnapshot?.asOf.date)
      .map(toSnapshot),
    seriesRenderer: 'dot_plot_no_path',
    series: dmSeriesRows.map(toSnapshot),
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
