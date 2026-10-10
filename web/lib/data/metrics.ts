/**
 * Shared metric accessors — the pieces more than one view needs.
 *
 * NOTHING HERE COMPUTES A PUBLISHED METRIC. Cap+, the performance composite,
 * z-scores, positional shares and the Stability Index are all computed offline in
 * `etl/` and read back verbatim (`ARCHITECTURE.md` §3). The only arithmetic in
 * this file is the cost-per-win *ratio* of two mart columns, which SPEC §2.5
 * defines as a view-level display with a user-selectable numerator — and it is
 * implemented here exactly once, with the zero-win rule attached, so no component
 * can divide by wins on its own.
 */

import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import {
  BLANK_REASON,
  PROVISIONAL_BADGE_COPY,
  blank,
  value,
  type AsOf,
  type AsOfStage,
  type Metric,
} from '@/lib/metric';
import { isSeeded } from './registry';

/* ------------------------------------------------------------------ */
/* Cap+ / Team Rating                                                   */
/* ------------------------------------------------------------------ */

/** `SPEC.md` §2.2 — the first Tier 2 season. */
export const TIER2_FIRST_SEASON = 2013;
/** `SPEC.md` §7.4 — whole-season blanks. Blanking is whole-season, never per-team. */
export const CAPPLUS_BLANK_SEASONS = [2013, 2016, 2020, 2021];

export interface CapPlusValue {
  capplus: number;
  perfIndex: number;
  p: number;
  costRec: number;
  capConsumedRec: number;
  costFloor: number;
  rRec: number;
  wasFloored: boolean;
  deadMoneyRec: number;
  seasonRank: number;
  badge: 'provisional' | 'preseason' | 'in_season';
}

/**
 * `SPEC.md` §7.4 — `getCapPlus(season, team): Metric<CapPlusOfficial>`.
 * Returns the four-blank-seasons reason for 2013/2016/2020/2021 and the
 * pre-Tier-2 reason for 1999–2012.
 */
export async function getCapPlus(season: number, team: string): Promise<Metric<CapPlusValue>> {
  if (season < TIER2_FIRST_SEASON) return blank(BLANK_REASON.PRE_TIER2);
  if (!(await isSeeded('capplus_official'))) return blank(BLANK_REASON.NO_DM_TABLE);

  const db = await getDb();
  const rows = await db
    .select()
    .from(s.capplusOfficial)
    .where(and(eq(s.capplusOfficial.season, season), eq(s.capplusOfficial.team, team)))
    .limit(1);
  const r = rows[0];
  if (!r) return blank(BLANK_REASON.NO_DM_TABLE);

  const asOf: AsOf = { date: r.dmAsofDate, stage: r.dmAsofStage as AsOfStage };
  return value<CapPlusValue>(
    {
      capplus: r.capplus,
      perfIndex: r.perfIndex,
      p: r.p,
      costRec: r.costRec,
      capConsumedRec: r.capConsumedRec,
      costFloor: r.costFloor,
      rRec: r.rRec,
      wasFloored: r.wasFloored,
      deadMoneyRec: r.deadMoneyRec,
      seasonRank: r.seasonRank,
      badge: r.badge as CapPlusValue['badge'],
    },
    asOf,
    r.badge === 'provisional',
  );
}

export const PROVISIONAL_COPY = PROVISIONAL_BADGE_COPY;

export interface TeamRatingValue {
  perfIndex: number;
  p: number;
  seasonRank: number;
}

/** The 1999–2012 fallback index, under its own name (`SPEC.md` §2.3). */
export async function getTeamRating(
  season: number,
  team: string,
): Promise<Metric<TeamRatingValue>> {
  if (!(await isSeeded('team_rating'))) return blank(BLANK_REASON.MART_ABSENT);
  const db = await getDb();
  const rows = await db
    .select()
    .from(s.teamRating)
    .where(and(eq(s.teamRating.season, season), eq(s.teamRating.team, team)))
    .limit(1);
  const r = rows[0];
  return r
    ? value<TeamRatingValue>({ perfIndex: r.perfIndex, p: r.p, seasonRank: r.seasonRank })
    : blank(BLANK_REASON.MART_ABSENT);
}

/* ------------------------------------------------------------------ */
/* Cost per win — SPEC §2.5                                             */
/* ------------------------------------------------------------------ */

export type CostNumerator = 'cash' | 'cap';
/** Default numerator is Cash (`SPEC.md` §2.5). */
export const DEFAULT_NUMERATOR: CostNumerator = 'cash';

export const NUMERATOR_LABEL: Record<CostNumerator, string> = {
  cash: 'Cash spent',
  cap: 'Cap hit (season-final)',
};

/** The §2.1 lens caveat travels with the selection. */
export const NUMERATOR_CAVEAT: Record<CostNumerator, string> = {
  cash: 'Counts cash paid to players on the roster. Cash paid to players released during the year is not included.',
  cap: 'Counts cap held by players on the roster, not cap used. Dead money is left out, so this lands 15–22% below a team’s actual cap by design.',
};

export interface CostPerWin {
  numerator: CostNumerator;
  /** The spend figure, USD. Always present when Tier 2 covers the season. */
  spend: number;
  wins: number;
  /** The ratio, USD per win. Absent — by rule — when wins === 0. */
  perWin: number | null;
  /** Rendered instead of the ratio when wins === 0. */
  zeroWinLabel: string | null;
}

/**
 * ZERO-WIN RULE, verbatim from `DATA_AUDIT.md` §4.1 and non-negotiable:
 * a cost-per-win figure is never rendered as infinity, "∞", "N/A", a blank or a
 * divide error. When `wins == 0` the view shows the TOTAL SPEND with an explicit
 * "0 wins" label and suppresses the ratio entirely; the team is excluded from
 * ratio-ranked orderings rather than sorted to either extreme.
 *
 * Exactly two team-seasons trigger it: 2017 CLE (inside Tier 2) and 2008 DET
 * (Tier 1 only, so it returns the Tier 2 boundary message instead).
 */
export async function getCostPerWin(
  season: number,
  team: string,
  numerator: CostNumerator = DEFAULT_NUMERATOR,
): Promise<Metric<CostPerWin>> {
  if (season < TIER2_FIRST_SEASON) return blank(BLANK_REASON.PRE_TIER2);
  if (!(await isSeeded('team_season_cap'))) return blank(BLANK_REASON.PRE_TIER2);

  const db = await getDb();
  const rows = await db
    .select({
      cash: s.teamSeasonCap.cashSpentTotal,
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
    .where(and(eq(s.teamSeasonCap.season, season), eq(s.teamSeasonCap.team, team)))
    .limit(1);

  const r = rows[0];
  if (!r) return blank(BLANK_REASON.PRE_TIER2);

  const spend = numerator === 'cash' ? r.cash : r.cap;
  const wins = r.wins;
  if (wins === 0) {
    return value<CostPerWin>({
      numerator,
      spend,
      wins,
      perWin: null,
      zeroWinLabel: `${formatCompactUsd(spend)} spent · 0 wins`,
    });
  }
  return value<CostPerWin>({
    numerator,
    spend,
    wins,
    perWin: spend / wins,
    zeroWinLabel: null,
  });
}

/** `$21.52M` — the display form the zero-win label needs; see lib/format.ts. */
function formatCompactUsd(usd: number): string {
  if (Math.abs(usd) >= 1e9) return `$${(usd / 1e9).toFixed(2)}B`;
  if (Math.abs(usd) >= 1e6) return `$${(usd / 1e6).toFixed(1)}M`;
  if (Math.abs(usd) >= 1e3) return `$${(usd / 1e3).toFixed(0)}K`;
  return `$${usd.toFixed(0)}`;
}
