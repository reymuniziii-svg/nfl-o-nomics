/**
 * Head-to-head bundle — `SPEC.md` §3.4, `/compare?a={abbr}-{season}&b={abbr}-{season}`.
 *
 * Two properties this module is responsible for:
 *
 *  1. THE CROSS-ERA LEGITIMACY STATEMENT is returned as data, so the view cannot
 *     ship without it. Every input is standardized within its own season before
 *     comparison — that is what makes a 2003 team and a 2024 team comparable.
 *  2. STACKED BENCHMARK COMPARISON. Each metric is paired against the LEAGUE
 *     AVERAGE OF ITS OWN SEASON, so the reader compares two distances-from-average
 *     rather than two raw numbers. Where one side is pre-2013, the Tier 2 rows
 *     render the boundary message ON THAT SIDE ONLY and the Tier 1 rows compare
 *     normally.
 *
 * The route is the only one that cannot be enumerated — 861 x 861 ordered pairs is
 * 741k combinations — so it renders on demand and is cached. `canonicalPair`
 * collapses each unordered pair to one cache entry.
 */

import { and, avg, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import {
  BLANK_REASON,
  CROSS_ERA_STATEMENT,
  blank,
  mapMetric,
  value,
  type Metric,
} from '@/lib/metric';
import { eraIdentity, isTeamAbbr, type TeamAbbr } from '@/lib/teams';
import { isSeeded } from './registry';
import {
  TIER2_FIRST_SEASON,
  getCapPlus,
  getCostPerWin,
  type CostPerWin,
} from './metrics';

export interface TeamSeasonRef {
  team: TeamAbbr;
  season: number;
}

/** Parse `kc-2024` into a reference, or null. */
export function parseRef(raw: string | undefined): TeamSeasonRef | null {
  if (!raw) return null;
  const m = /^([A-Za-z]{2,3})-(\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const team = m[1].toUpperCase();
  const season = Number(m[2]);
  return isTeamAbbr(team) ? { team: team as TeamAbbr, season } : null;
}

export function formatRef(ref: TeamSeasonRef): string {
  return `${ref.team.toLowerCase()}-${ref.season}`;
}

/**
 * A canonical ordering (`a` before `b` by (team, season)) collapses each pair to
 * one cache entry, so 741k possible URLs share a much smaller cache surface.
 */
export function canonicalPair(a: TeamSeasonRef, b: TeamSeasonRef): [TeamSeasonRef, TeamSeasonRef] {
  const ka = `${a.team}-${a.season}`;
  const kb = `${b.team}-${b.season}`;
  return ka <= kb ? [a, b] : [b, a];
}

/* ------------------------------------------------------------------ */

export interface BenchmarkSide {
  ref: TeamSeasonRef;
  label: string;
  /** The raw value. */
  raw: Metric<number>;
  /** The league average of THAT SIDE'S OWN SEASON. */
  leagueAvg: number | null;
  /** raw - leagueAvg. The distance the paired bar renders. */
  delta: number | null;
}

export interface BenchmarkRow {
  key: string;
  label: string;
  tier: 1 | 2;
  unit: 'index' | 'usd' | 'rate' | 'count';
  a: BenchmarkSide;
  b: BenchmarkSide;
}

export interface CompareBundle {
  a: TeamSeasonRef;
  b: TeamSeasonRef;
  aLabel: string;
  bLabel: string;
  crossEraStatement: string;
  rows: BenchmarkRow[];
}

/** League averages for one season, from the marts. Memoised per process. */
const seasonAvgCache = new Map<number, Promise<Record<string, number | null>>>();

function seasonAverages(season: number): Promise<Record<string, number | null>> {
  let p = seasonAvgCache.get(season);
  if (!p) {
    p = (async () => {
      const db = await getDb();
      const [res] = await db
        .select({
          winPct: avg(s.teamSeasonResults.winPct),
          pointDiff: avg(s.teamSeasonResults.pointDiff),
        })
        .from(s.teamSeasonResults)
        .where(eq(s.teamSeasonResults.season, season));
      const [epa] = await db
        .select({ epaMargin: avg(s.teamSeasonEpa.epaMarginPerPlay) })
        .from(s.teamSeasonEpa)
        .where(eq(s.teamSeasonEpa.season, season));

      let cash: number | null = null;
      let cap: number | null = null;
      if (await isSeeded('team_season_cap')) {
        const [c] = await db
          .select({
            cash: avg(s.teamSeasonCap.cashSpentTotal),
            cap: avg(s.teamSeasonCap.capUsedTotal),
          })
          .from(s.teamSeasonCap)
          .where(eq(s.teamSeasonCap.season, season));
        cash = num(c?.cash);
        cap = num(c?.cap);
      }

      return {
        // Both indices are centred on 100 by construction; the league average is
        // read from the definition, not recomputed from the rows.
        index: 100,
        winPct: num(res?.winPct),
        pointDiff: num(res?.pointDiff),
        epaMargin: num(epa?.epaMargin),
        cash,
        cap,
      };
    })();
    seasonAvgCache.set(season, p);
  }
  return p;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function sideOf(
  ref: TeamSeasonRef,
  raw: Metric<number>,
  avgKey: string,
): Promise<BenchmarkSide> {
  const averages = await seasonAverages(ref.season);
  const leagueAvg = averages[avgKey] ?? null;
  return {
    ref,
    label: `${eraIdentity(ref.team, ref.season).name} · ${ref.season}`,
    raw,
    leagueAvg,
    delta: raw.state === 'value' && leagueAvg !== null ? raw.value - leagueAvg : null,
  };
}

/**
 * The zero-win rule, carried into the comparison: when a side has 0 wins the
 * RATIO is suppressed and the total-spend label renders in its place. It is
 * never infinity, never "N/A", never a blank cell.
 */
function costRatio(m: Metric<CostPerWin>): Metric<number> {
  if (m.state !== 'value') return m as Metric<number>;
  return m.value.perWin === null
    ? blank(m.value.zeroWinLabel ?? '0 wins — the ratio is suppressed by rule.')
    : value(m.value.perWin);
}

async function tier1(ref: TeamSeasonRef) {
  const db = await getDb();
  const where = and(eq(s.teamSeasonResults.team, ref.team), eq(s.teamSeasonResults.season, ref.season));
  const [row] = await db.select().from(s.teamSeasonResults).where(where).limit(1);
  const [epa] = await db
    .select()
    .from(s.teamSeasonEpa)
    .where(and(eq(s.teamSeasonEpa.team, ref.team), eq(s.teamSeasonEpa.season, ref.season)))
    .limit(1);
  return { row: row ?? null, epa: epa ?? null };
}

export async function getCompareBundle(
  aRef: TeamSeasonRef,
  bRef: TeamSeasonRef,
): Promise<CompareBundle | null> {
  const [a, b] = [aRef, bRef];
  const [ta, tb] = await Promise.all([tier1(a), tier1(b)]);
  if (!ta.row || !tb.row) return null;

  const rows: BenchmarkRow[] = [];

  /* ---- Tier 1 rows: compare normally on both sides, every season ---- */
  rows.push({
    key: 'win_pct',
    label: 'Win percentage',
    tier: 1,
    unit: 'rate',
    a: await sideOf(a, value(ta.row.winPct), 'winPct'),
    b: await sideOf(b, value(tb.row.winPct), 'winPct'),
  });
  rows.push({
    key: 'point_diff',
    label: 'Point differential',
    tier: 1,
    unit: 'count',
    a: await sideOf(a, value(ta.row.pointDiff), 'pointDiff'),
    b: await sideOf(b, value(tb.row.pointDiff), 'pointDiff'),
  });
  rows.push({
    key: 'epa_margin',
    label: 'EPA margin per play',
    tier: 1,
    unit: 'rate',
    a: await sideOf(a, ta.epa ? value(ta.epa.epaMarginPerPlay) : blank(BLANK_REASON.MART_ABSENT), 'epaMargin'),
    b: await sideOf(b, tb.epa ? value(tb.epa.epaMarginPerPlay) : blank(BLANK_REASON.MART_ABSENT), 'epaMargin'),
  });

  /* ---- The index row: Cap+ where each side is covered ---- */
  const [cpA, cpB] = await Promise.all([getCapPlus(a.season, a.team), getCapPlus(b.season, b.team)]);
  const db = await getDb();
  const [trA] = await db
    .select()
    .from(s.teamRating)
    .where(and(eq(s.teamRating.team, a.team), eq(s.teamRating.season, a.season)))
    .limit(1);
  const [trB] = await db
    .select()
    .from(s.teamRating)
    .where(and(eq(s.teamRating.team, b.team), eq(s.teamRating.season, b.season)))
    .limit(1);

  rows.push({
    key: 'team_rating',
    label: 'Team Rating (performance only)',
    tier: 1,
    unit: 'index',
    a: await sideOf(a, trA ? value(trA.perfIndex) : blank(BLANK_REASON.MART_ABSENT), 'index'),
    b: await sideOf(b, trB ? value(trB.perfIndex) : blank(BLANK_REASON.MART_ABSENT), 'index'),
  });

  rows.push({
    key: 'capplus',
    label: 'Cap+',
    tier: 2,
    unit: 'index',
    a: await sideOf(a, mapMetric(cpA, (c) => c.capplus), 'index'),
    b: await sideOf(b, mapMetric(cpB, (c) => c.capplus), 'index'),
  });

  /* ---- Tier 2 rows: the boundary message renders on the pre-2013 side only ---- */
  const capRow = async (ref: TeamSeasonRef) => {
    if (ref.season < TIER2_FIRST_SEASON || !(await isSeeded('team_season_cap'))) return null;
    const [row] = await db
      .select()
      .from(s.teamSeasonCap)
      .where(and(eq(s.teamSeasonCap.team, ref.team), eq(s.teamSeasonCap.season, ref.season)))
      .limit(1);
    return row ?? null;
  };
  const [capA, capB] = await Promise.all([capRow(a), capRow(b)]);

  rows.push({
    key: 'cash_spent',
    label: 'Cash spent',
    tier: 2,
    unit: 'usd',
    a: await sideOf(a, capA ? value(capA.cashSpentTotal) : blank(BLANK_REASON.PRE_TIER2), 'cash'),
    b: await sideOf(b, capB ? value(capB.cashSpentTotal) : blank(BLANK_REASON.PRE_TIER2), 'cash'),
  });
  rows.push({
    key: 'cap_used',
    label: 'Cap held by rostered players',
    tier: 2,
    unit: 'usd',
    a: await sideOf(a, capA ? value(capA.capUsedTotal) : blank(BLANK_REASON.PRE_TIER2), 'cap'),
    b: await sideOf(b, capB ? value(capB.capUsedTotal) : blank(BLANK_REASON.PRE_TIER2), 'cap'),
  });

  /* ---- Cost per win, with the zero-win rule intact on either side ---- */
  const [cwA, cwB] = await Promise.all([
    getCostPerWin(a.season, a.team),
    getCostPerWin(b.season, b.team),
  ]);
  rows.push({
    key: 'cost_per_win',
    label: 'Cost per win (cash)',
    tier: 2,
    unit: 'usd',
    a: await sideOf(
      a,
      costRatio(cwA),
      // A cost-per-win RATIO has no league-average level to benchmark against;
      // the paired bar renders the two raw ratios, not two distances.
      'costPerWin',
    ),
    b: await sideOf(
      b,
      costRatio(cwB),
      'costPerWin',
    ),
  });

  return {
    a,
    b,
    aLabel: `${eraIdentity(a.team, a.season).name} · ${a.season}`,
    bLabel: `${eraIdentity(b.team, b.season).name} · ${b.season}`,
    crossEraStatement: CROSS_ERA_STATEMENT,
    rows,
  };
}
