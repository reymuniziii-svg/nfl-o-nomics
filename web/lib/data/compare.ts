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

import { and, avg, count, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import {
  BLANK_REASON,
  CROSS_ERA_STATEMENT,
  NOT_A_32_TEAM_READING,
  blank,
  mapMetric,
  partial,
  value,
  type AsOfStage,
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
  /** The raw value, in the row's `unit`. */
  raw: Metric<number>;
  /** The league average of THAT SIDE'S OWN SEASON, in the row's `unit`. */
  leagueAvg: number | null;
  /** raw - leagueAvg. The distance the paired bar renders. */
  delta: number | null;
  /**
   * The dollars behind a `pct_of_cap` row, printed beneath the percentage so the
   * absolute figure is never lost — it is simply never what the bar is scaled
   * from.
   */
  secondaryUsd?: number | null;
}

export interface BenchmarkRow {
  key: string;
  label: string;
  tier: 1 | 2;
  /**
   * `pct_of_cap` is POINTS OF THAT SEASON'S LEAGUE CAP. It exists because a
   * raw-dollar comparison inverts across eras: KC 2013 spent $147.9M against a
   * $123.0M cap and KC 2025 spent $318.8M against $279.2M, so the 2013 club is
   * ~1.9× further above its own league while drawing much the shorter bar. The
   * marts already publish `cash_pct_of_league` and `cap_pct_of_league`; the
   * comparison is driven off those and the dollars ride along as a secondary
   * readout.
   */
  unit: 'index' | 'usd' | 'rate' | 'count' | 'pct_of_cap';
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

      let cashPct: number | null = null;
      let capPct: number | null = null;
      let costPerWin: number | null = null;
      if (await isSeeded('team_season_cap')) {
        // The marts publish each club's spend as a SHARE OF ITS OWN SEASON'S
        // LEAGUE CAP; the league average of that share is the benchmark a
        // cross-era row can legitimately be drawn against.
        const [c] = await db
          .select({
            cashPct: avg(s.teamSeasonCap.cashPctOfLeague),
            capPct: avg(s.teamSeasonCap.capPctOfLeague),
          })
          .from(s.teamSeasonCap)
          .where(eq(s.teamSeasonCap.season, season));
        cashPct = num(c?.cashPct);
        capPct = num(c?.capPct);

        // `SPEC.md` §2.5's own league benchmark: Σ cash ÷ Σ wins, expressed as a
        // share of the cap so the two eras are on one scale. A mean of per-club
        // ratios would be dominated by whichever club won once.
        const rows = await db
          .select({
            cash: s.teamSeasonCap.cashSpentTotal,
            leagueCap: s.teamSeasonCap.leagueCap,
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
        let spend = 0;
        let wins = 0;
        let cap = 0;
        for (const r of rows) {
          spend += r.cash;
          wins += r.wins;
          cap = r.leagueCap;
        }
        costPerWin = wins > 0 && cap > 0 ? spend / wins / cap : null;
      }

      /**
       * The league's own dead-money burden that season — and ONLY where a
       * 32-team table was published. In 2013, 2016, 2020 and 2021 the mart
       * holds five to ten leaders-list rows; their mean is the mean of the
       * worst clubs, not a league average, and drawing a distance against it
       * would be a silently partial benchmark of exactly the kind §1.2 forbids.
       * Those seasons get no benchmark and the row says so.
       */
      let deadMoneyBurden: number | null = null;
      if (await isSeeded('dead_money_display')) {
        const [d] = await db
          .select({ burden: avg(s.deadMoneyDisplay.burdenOfAdjustedCap), n: count() })
          .from(s.deadMoneyDisplay)
          .where(eq(s.deadMoneyDisplay.season, season));
        deadMoneyBurden = (d?.n ?? 0) >= 32 ? num(d?.burden) : null;
      }

      return {
        // Both indices are centered on 100 by construction; the league average is
        // read from the definition, not recomputed from the rows.
        index: 100,
        winPct: num(res?.winPct),
        pointDiff: num(res?.pointDiff),
        epaMargin: num(epa?.epaMargin),
        cashPct,
        capPct,
        costPerWin,
        deadMoneyBurden,
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
  secondaryUsd: number | null = null,
): Promise<BenchmarkSide> {
  const averages = await seasonAverages(ref.season);
  if (process.env.NODE_ENV !== 'production' && !(avgKey in averages)) {
    // A benchmark key that `seasonAverages` does not produce silently yields a
    // null delta, a zero-width bar and "No league average for this measure" on
    // both sides — which is how the cost-per-win row shipped with no benchmark
    // at all. It is a wiring bug, so it fails loudly.
    throw new Error(
      `compare: no season average named "${avgKey}". Add it to seasonAverages() or fix the caller.`,
    );
  }
  const leagueAvg = averages[avgKey] ?? null;
  return {
    ref,
    label: `${eraIdentity(ref.team, ref.season).name} · ${ref.season}`,
    raw,
    leagueAvg,
    // A PARTIAL VALUE IS STILL A VALUE (`CHART_ANATOMY.md` §5.2): it takes its
    // distance like any other, and the row prints the partial reason beside it
    // rather than dropping the comparison.
    delta: raw.state !== 'blank' && leagueAvg !== null ? raw.value - leagueAvg : null,
    secondaryUsd,
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
    ? blank(m.value.zeroWinLabel ?? '0 wins, so no cost per win is shown.')
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

  /**
   * THE THREE MONEY ROWS ARE SEASON-NORMALIZED, NOT RAW DOLLARS.
   *
   * `SPEC.md` §3.4's whole premise is that each side is scored against its own
   * season's league, and a dollar figure is not: $147.9M in 2013 is 25.3 points
   * of cap above its league while $318.8M in 2025 is 13.4 above its own, so a
   * raw-dollar bar draws the 2013 club as the smaller spender. The marts carry
   * `cash_pct_of_league` and `cap_pct_of_league` for exactly this. The dollars
   * still print, beneath the percentage, as a secondary readout.
   */
  rows.push({
    key: 'cash_spent',
    label: 'Cash spent, as a share of its own cap',
    tier: 2,
    unit: 'pct_of_cap',
    a: await sideOf(
      a,
      capA ? value(capA.cashPctOfLeague) : blank(BLANK_REASON.PRE_TIER2),
      'cashPct',
      capA?.cashSpentTotal ?? null,
    ),
    b: await sideOf(
      b,
      capB ? value(capB.cashPctOfLeague) : blank(BLANK_REASON.PRE_TIER2),
      'cashPct',
      capB?.cashSpentTotal ?? null,
    ),
  });
  rows.push({
    key: 'cap_used',
    label: 'Cap held by rostered players, as a share of its own cap',
    tier: 2,
    unit: 'pct_of_cap',
    a: await sideOf(
      a,
      capA ? value(capA.capPctOfLeague) : blank(BLANK_REASON.PRE_TIER2),
      'capPct',
      capA?.capUsedTotal ?? null,
    ),
    b: await sideOf(
      b,
      capB ? value(capB.capPctOfLeague) : blank(BLANK_REASON.PRE_TIER2),
      'capPct',
      capB?.capUsedTotal ?? null,
    ),
  });

  /* ---- Cost per win, with the zero-win rule intact on either side ---- */
  const [cwA, cwB] = await Promise.all([
    getCostPerWin(a.season, a.team),
    getCostPerWin(b.season, b.team),
  ]);
  const ratioA = costRatio(cwA);
  const ratioB = costRatio(cwB);

  /**
   * A cost-per-win ratio expressed in points of that season's cap. $13.4M/win in
   * 2013 and $53.1M/win in 2025 are 4.0× apart in dollars and 1.75× apart as a
   * share of cap; only the second of those is a fact about the two clubs rather
   * than a fact about cap inflation.
   */
  const cpwShare = (m: Metric<number>, leagueCap: number | null): Metric<number> => {
    if (m.state !== 'value') return m;
    if (!leagueCap) {
      return blank(
        'Not available — no league cap is on record for this season, so the ratio can’t be scaled to its own cap.',
      );
    }
    return value(m.value / leagueCap);
  };

  rows.push({
    key: 'cost_per_win',
    label: 'Cost per win (cash), as a share of its own cap',
    tier: 2,
    unit: 'pct_of_cap',
    a: await sideOf(
      a,
      cpwShare(ratioA, capA?.leagueCap ?? null),
      'costPerWin',
      ratioA.state === 'value' ? ratioA.value : null,
    ),
    b: await sideOf(
      b,
      cpwShare(ratioB, capB?.leagueCap ?? null),
      'costPerWin',
      ratioB.state === 'value' ? ratioB.value : null,
    ),
  });

  /**
   * `SPEC.md` §2.1 — the third money lens. Dead money is a published input to
   * the Cap+ figure this same card displays, so omitting it left `/compare`
   * offering two of three lenses and saying nothing about the third. It is
   * benchmarked as BURDEN OF THE ADJUSTED CAP, which is the only cross-era
   * legitimate form, and it carries its date and stage like every other
   * dead-money figure in the product.
   */
  const dmRow = async (ref: TeamSeasonRef) => {
    if (ref.season < TIER2_FIRST_SEASON || !(await isSeeded('dead_money_display'))) {
      return { metric: blank<number>(BLANK_REASON.PRE_TIER2), usd: null as number | null };
    }
    const [row] = await db
      .select()
      .from(s.deadMoneyDisplay)
      .where(and(eq(s.deadMoneyDisplay.team, ref.team), eq(s.deadMoneyDisplay.season, ref.season)))
      .limit(1);
    if (!row || row.burdenOfAdjustedCap === null || !row.asofDate || !row.asofStage) {
      return {
        metric: blank<number>(row?.blankReason ?? BLANK_REASON.NO_DM_TABLE),
        usd: null as number | null,
      };
    }
    const asOf = { date: row.asofDate, stage: row.asofStage as AsOfStage };
    return {
      metric:
        row.seasonCoverage === 'leaders_only'
          ? partial<number>(
              row.burdenOfAdjustedCap,
              1,
              32,
              `${NOT_A_32_TEAM_READING} — this figure comes from a published leaders list, not a league-wide table.`,
            )
          : value<number>(row.burdenOfAdjustedCap, asOf),
      usd: row.deadMoneyUsd,
    };
  };
  const [dmA, dmB] = await Promise.all([dmRow(a), dmRow(b)]);
  rows.push({
    key: 'dead_money',
    label: 'Dead money, as a share of the adjusted cap',
    tier: 2,
    unit: 'pct_of_cap',
    a: await sideOf(a, dmA.metric, 'deadMoneyBurden', dmA.usd),
    b: await sideOf(b, dmB.metric, 'deadMoneyBurden', dmB.usd),
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
