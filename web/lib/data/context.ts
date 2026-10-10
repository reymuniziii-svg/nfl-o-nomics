/**
 * Cap+ context — the gate #1 reopen mart (`SPEC.md` §2.10, §7.13).
 *
 * `capplus_official` renders as Cap+. This file reads the companion mart
 * `capplus_context`: the starting QB and his rookie window, QB-neutral Cap+ and
 * its two-term decomposition, rank within stratum, and the future-cap mortgage —
 * cash paid ahead of cap, the bridge between cash per win and cap per win. The
 * obligation blend is retired (`DECISIONS.md` 111) and is not read.
 *
 * NOTHING HERE COMPUTES AN INDEX. Every index is read verbatim from the mart.
 * The only arithmetic is `getStrataSummary`'s arithmetic MEAN of precomputed
 * columns across a season's teams — a summary of published values, never a
 * re-derivation of one.
 *
 * Blanking is whole-season (§7.4): under the shipping tier the index columns are
 * non-null in all 13 seasons; they go NULL only where Cap+ itself is blank (the
 * SAFE-only reversal). They travel as ONE `Metric` (`indices`) so a component
 * cannot render QB-neutral Cap+ without handling the blank, and the blank
 * carries the same reason string `capplus_official` uses for those seasons.
 */

import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import { BLANK_REASON, blank, mapMetric, value, type Metric } from '@/lib/metric';
import type { TeamAbbr } from '@/lib/teams';
import { isSeeded } from './registry';
import { TIER2_FIRST_SEASON } from './metrics';

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

/** The index columns — all present together, or all blank for the season. */
export interface CapPlusContextIndices {
  /** COPY of `capplus_official.capplus` (§7.4). */
  capplus: number;
  capplusRank: number;
  /** Render as `CAPPLUS_QB_NEUTRAL_LABEL`. */
  capplusQbNeutral: number;
  qbNeutralRank: number;
  /** `capplus − capplusQbNeutral`. */
  qbTimingPts: number;
  /** `capplusQbNeutral − 100`. `qbTimingPts + rosterPts = capplus − 100`. */
  rosterPts: number;
  /** Rookie-window teams ranked against each other; veteran-QB teams likewise. */
  stratumRank: number;
}

/** One `(season, team)` row of `capplus_context`. */
export interface CapPlusContext {
  season: number;
  team: TeamAbbr;
  startingQb: string;
  startingQbGsisId: string | null;
  startingQbOtcId: number;
  qbStarterMethod: 'snaps' | 'cap';
  /** USD. */
  qbCapNumber: number;
  /** Share of the LEAGUE cap. */
  qbCapShare: number;
  qbContractYearSigned: number;
  /** `null` = undrafted — an undrafted QB is never rookie-window. */
  qbDraftYear: number | null;
  qbDraftRound: number | null;
  qbRookieWindow: boolean;
  /** USD. */
  leagueMedianStarterQbCap: number;
  /** Teams in this row's stratum (rookie-window or veteran) this season. */
  stratumSize: number;
  perfIndex: number;
  perfRank: number;
  /** Cash paid ÷ league cap. */
  cashShare: number;
  /** USD. Always rendered with `FUTURE_MORTGAGE_CAVEAT`. */
  futureMortgageUsd: number;
  /** Mortgage ÷ this season's league cap. */
  futureMortgageShare: number;
  mortgageRowsUnknown: number;
  /** Blank only where Cap+ is blank for the season, with `BLANK_REASON.NO_DM_TABLE`. */
  indices: Metric<CapPlusContextIndices>;
}

/** The leaderboard's columns from this mart. */
export type LeagueContextRow = Pick<
  CapPlusContext,
  | 'team'
  | 'startingQb'
  | 'qbRookieWindow'
  | 'stratumSize'
  | 'futureMortgageUsd'
  | 'futureMortgageShare'
  | 'indices'
>;

export interface StratumStat {
  /** Team-seasons in the stratum. */
  n: number;
  /** Means of PRECOMPUTED columns — `SPEC.md` §2.10 / `CAPPLUS_MEMO.md` §8.1. */
  meanCapplus: number;
  meanPerfIndex: number;
  meanQbTimingPts: number;
}

export interface StrataSummary {
  season: number;
  rookieWindow: Metric<StratumStat>;
  veteran: Metric<StratumStat>;
}

/** A season in which one stratum has no team. Not observed 2013–2025. */
export const EMPTY_STRATUM_REASON = 'Not available — no team falls in this group (rookie-deal or veteran-deal quarterback) this season.';

/* ------------------------------------------------------------------ */
/* Row mapping                                                          */
/* ------------------------------------------------------------------ */

type Row = typeof s.capplusContext.$inferSelect;

function indicesOf(r: Row): Metric<CapPlusContextIndices> {
  if (
    r.capplus === null ||
    r.capplusRank === null ||
    r.capplusQbNeutral === null ||
    r.qbNeutralRank === null ||
    r.qbTimingPts === null ||
    r.rosterPts === null ||
    r.stratumRank === null
  ) {
    return blank(BLANK_REASON.NO_DM_TABLE);
  }
  return value<CapPlusContextIndices>({
    capplus: r.capplus,
    capplusRank: r.capplusRank,
    capplusQbNeutral: r.capplusQbNeutral,
    qbNeutralRank: r.qbNeutralRank,
    qbTimingPts: r.qbTimingPts,
    rosterPts: r.rosterPts,
    stratumRank: r.stratumRank,
  });
}

function toContext(r: Row): CapPlusContext {
  return {
    season: r.season,
    team: r.team as TeamAbbr,
    startingQb: r.startingQb,
    startingQbGsisId: r.startingQbGsisId,
    startingQbOtcId: r.startingQbOtcId,
    qbStarterMethod: r.qbStarterMethod,
    qbCapNumber: r.qbCapNumber,
    qbCapShare: r.qbCapShare,
    qbContractYearSigned: r.qbContractYearSigned,
    qbDraftYear: r.qbDraftYear,
    qbDraftRound: r.qbDraftRound,
    qbRookieWindow: r.qbRookieWindow,
    leagueMedianStarterQbCap: r.leagueMedianStarterQbCap,
    stratumSize: r.stratumSize,
    perfIndex: r.perfIndex,
    perfRank: r.perfRank,
    cashShare: r.cashShare,
    futureMortgageUsd: r.futureMortgageUsd,
    futureMortgageShare: r.futureMortgageShare,
    mortgageRowsUnknown: r.mortgageRowsUnknown,
    indices: indicesOf(r),
  };
}

/* ------------------------------------------------------------------ */
/* Accessors                                                            */
/* ------------------------------------------------------------------ */

/** One team-season. Pre-2013 is the Tier 2 boundary; a missing row is absent data. */
export async function getCapPlusContext(
  season: number,
  team: string,
): Promise<Metric<CapPlusContext>> {
  if (season < TIER2_FIRST_SEASON) return blank(BLANK_REASON.PRE_TIER2);
  if (!(await isSeeded('capplus_context'))) return blank(BLANK_REASON.MART_ABSENT);
  const db = await getDb();
  const rows = await db
    .select()
    .from(s.capplusContext)
    .where(and(eq(s.capplusContext.season, season), eq(s.capplusContext.team, team)))
    .limit(1);
  const r = rows[0];
  return r ? value(toContext(r)) : blank(BLANK_REASON.MART_ABSENT);
}

/**
 * Every season 2013–2025 for a franchise, ascending — the team-page QB-window
 * timeline. Blank seasons are present as rows with `indices` blank, so the
 * timeline draws the gap with its reason rather than skipping the year.
 */
export async function getQbWindowSeries(team: TeamAbbr): Promise<Metric<CapPlusContext[]>> {
  if (!(await isSeeded('capplus_context'))) return blank(BLANK_REASON.MART_ABSENT);
  const db = await getDb();
  const rows = await db
    .select()
    .from(s.capplusContext)
    .where(eq(s.capplusContext.team, team))
    .orderBy(asc(s.capplusContext.season));
  return rows.length ? value(rows.map(toContext)) : blank(BLANK_REASON.MART_ABSENT);
}

/** Full rows for a season, team order. Shared by the two season-level accessors. */
async function seasonRows(season: number): Promise<Metric<CapPlusContext[]>> {
  if (season < TIER2_FIRST_SEASON) return blank(BLANK_REASON.PRE_TIER2);
  if (!(await isSeeded('capplus_context'))) return blank(BLANK_REASON.MART_ABSENT);
  const db = await getDb();
  const rows = await db
    .select()
    .from(s.capplusContext)
    .where(eq(s.capplusContext.season, season))
    .orderBy(asc(s.capplusContext.team));
  return rows.length ? value(rows.map(toContext)) : blank(BLANK_REASON.MART_ABSENT);
}

/** All 32 clubs for a season, in team order — the leaderboard's context columns. */
export async function getLeagueContext(season: number): Promise<Metric<LeagueContextRow[]>> {
  return mapMetric(await seasonRows(season), (rows) =>
    rows.map((c) => ({
      team: c.team,
      startingQb: c.startingQb,
      qbRookieWindow: c.qbRookieWindow,
      stratumSize: c.stratumSize,
      futureMortgageUsd: c.futureMortgageUsd,
      futureMortgageShare: c.futureMortgageShare,
      indices: c.indices,
    })),
  );
}

/**
 * Rookie-window vs veteran-QB means for one season (`CAPPLUS_MEMO.md` §8.1).
 * Arithmetic means of precomputed mart values only — no index is recomputed.
 * Blank, with the Cap+ reason, in any whole-season blank year.
 */
export async function getStrataSummary(season: number): Promise<Metric<StrataSummary>> {
  const rows = await seasonRows(season);
  if (rows.state === 'blank') return rows;

  const indexed: { c: CapPlusContext; ix: CapPlusContextIndices }[] = [];
  for (const c of rows.value) {
    if (c.indices.state === 'blank') return blank(c.indices.reason);
    indexed.push({ c, ix: c.indices.value });
  }

  const stratum = (rookie: boolean): Metric<StratumStat> => {
    const xs = indexed.filter((x) => x.c.qbRookieWindow === rookie);
    if (!xs.length) return blank(EMPTY_STRATUM_REASON);
    const mean = (f: (x: (typeof xs)[number]) => number) =>
      xs.reduce((acc, x) => acc + f(x), 0) / xs.length;
    return value<StratumStat>({
      n: xs.length,
      meanCapplus: mean((x) => x.ix.capplus),
      meanPerfIndex: mean((x) => x.c.perfIndex),
      meanQbTimingPts: mean((x) => x.ix.qbTimingPts),
    });
  };

  return value<StrataSummary>({ season, rookieWindow: stratum(true), veteran: stratum(false) });
}
