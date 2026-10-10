/**
 * League-wide accessors the designed views need that the first pass did not.
 *
 * Written in the existing layer's style: nothing here computes a PUBLISHED
 * metric (`ARCHITECTURE.md` §3) — the only arithmetic is the league-level
 * cost-per-win RATIO, which is the same two-column division `SPEC.md` §2.5
 * already sanctions at team level, taken across the league so the hero card has
 * the benchmark `COMPONENTS.md` §1.11 requires it to name in words.
 *
 * Every accessor returns `Metric<T>`.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import { BLANK_REASON, blank, partial, value, type Metric } from '@/lib/metric';
import { divisionName, eraIdentity, type DivisionSlug, type TeamAbbr } from '@/lib/teams';
import { isSeeded } from './registry';
import { TIER2_FIRST_SEASON, getCostPerWin, type CostNumerator, type CostPerWin } from './metrics';
import { getLeagueContext } from './context';

/* ------------------------------------------------------------------ */
/* team_meta — conference / division / colors, memoised per process    */
/* ------------------------------------------------------------------ */

export interface TeamMetaRow {
  abbr: TeamAbbr;
  teamName: string;
  conf: string;
  division: string;
  divisionSlug: DivisionSlug;
  primaryColor: string;
  glyphColor: string;
}

let metaPromise: Promise<Map<string, TeamMetaRow>> | null = null;

export function getTeamMetaMap(): Promise<Map<string, TeamMetaRow>> {
  if (!metaPromise) {
    metaPromise = (async () => {
      const db = await getDb();
      const rows = await db.select().from(s.teamMeta);
      return new Map(
        rows.map((r) => [
          r.abbr,
          {
            abbr: r.abbr as TeamAbbr,
            teamName: r.teamName,
            conf: r.conf,
            division: r.division,
            divisionSlug: r.divisionSlug as DivisionSlug,
            primaryColor: r.primaryColor,
            glyphColor: r.glyphColor,
          },
        ]),
      );
    })();
  }
  return metaPromise;
}

/** The division a franchise sits in under CURRENT alignment (`DECISIONS.md` 45). */
export async function divisionSlugForTeam(team: TeamAbbr): Promise<DivisionSlug | null> {
  const meta = await getTeamMetaMap();
  return meta.get(team)?.divisionSlug ?? null;
}

/* ------------------------------------------------------------------ */
/* The league-average cost per win — the hero card's gold benchmark      */
/* ------------------------------------------------------------------ */

/**
 * `Σ spend ÷ Σ wins` across the 32 clubs — "the league spent this much and
 * produced this many wins", which is the only form of the benchmark that a
 * single 1-win club cannot drag. A mean of per-club ratios would be dominated
 * by whichever team happened to win once.
 *
 * Zero-win clubs contribute their spend and zero wins, exactly as they do to the
 * league's real books; the ZERO-WIN RULE is about never dividing by a single
 * team's zero, and this denominator is never zero.
 *
 * Returns `partial` when fewer than 32 clubs have a cap row, with the coverage
 * counts, so the strap can say so rather than imply a full-league reading.
 */
export async function getLeagueAvgCostPerWin(
  season: number,
  numerator: CostNumerator = 'cash',
): Promise<Metric<number>> {
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
    .where(eq(s.teamSeasonCap.season, season));

  if (!rows.length) return blank(BLANK_REASON.PRE_TIER2);

  let spend = 0;
  let wins = 0;
  for (const r of rows) {
    spend += numerator === 'cash' ? r.cash : r.cap;
    wins += r.wins;
  }
  if (wins === 0) return blank('Not available — the league recorded no wins this season.');

  const avg = spend / wins;
  return rows.length < 32
    ? partial(
        avg,
        rows.length,
        32,
        `Not a full-league reading — ${rows.length} of 32 clubs have cap data this season.`,
      )
    : value(avg);
}

/* ------------------------------------------------------------------ */
/* Per-team spend / wins for the leaderboard row and its desktop table   */
/* ------------------------------------------------------------------ */

export interface LeagueSpendRow {
  team: TeamAbbr;
  spend: number;
  wins: number;
  /** null by the ZERO-WIN RULE, never Infinity (`SPEC.md` §2.5). */
  perWin: number | null;
}

/** Spend and wins for every club in a season. Empty before 2013. */
export async function getLeagueSpend(
  season: number,
  numerator: CostNumerator = 'cash',
): Promise<Map<string, LeagueSpendRow>> {
  const out = new Map<string, LeagueSpendRow>();
  if (season < TIER2_FIRST_SEASON) return out;
  if (!(await isSeeded('team_season_cap'))) return out;

  const db = await getDb();
  const rows = await db
    .select({
      team: s.teamSeasonCap.team,
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
    .where(eq(s.teamSeasonCap.season, season));

  for (const r of rows) {
    const spend = numerator === 'cash' ? r.cash : r.cap;
    out.set(r.team, {
      team: r.team as TeamAbbr,
      spend,
      wins: r.wins,
      perWin: r.wins === 0 ? null : spend / r.wins,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The team page's peer set for the Receipt                             */
/* ------------------------------------------------------------------ */

export interface PeerRow {
  team: TeamAbbr;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  costPerWin: Metric<CostPerWin>;
}

export interface PeerSet {
  season: number;
  name: string;
  teams: PeerRow[];
}

/**
 * The subject's division peers, ranked cheapest first with the ZERO-WIN RULE
 * intact — the same shape the division hero takes, without the league
 * leaderboard query the team page has no other use for.
 *
 * Clubs whose ratio is suppressed are EXCLUDED from the ratio ordering rather
 * than sorted to either extreme (`DATA_AUDIT.md` §4.1).
 */
export async function getDivisionPeers(
  slug: DivisionSlug,
  season: number,
  numerator: CostNumerator = 'cash',
): Promise<PeerSet> {
  const db = await getDb();
  const meta = await getTeamMetaMap();
  const abbrs = [...meta.values()].filter((m) => m.divisionSlug === slug).map((m) => m.abbr);

  const results = abbrs.length
    ? await db
        .select()
        .from(s.teamSeasonResults)
        .where(
          and(
            eq(s.teamSeasonResults.season, season),
            inArray(s.teamSeasonResults.team, abbrs as string[]),
          ),
        )
    : [];

  const teams: PeerRow[] = [];
  for (const r of results) {
    teams.push({
      team: r.team as TeamAbbr,
      teamName: eraIdentity(r.team as TeamAbbr, season).name,
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      costPerWin: await getCostPerWin(season, r.team, numerator),
    });
  }

  teams.sort((a, b) => {
    const av = a.costPerWin.state === 'value' ? a.costPerWin.value.perWin : null;
    const bv = b.costPerWin.state === 'value' ? b.costPerWin.value.perWin : null;
    if (av === null && bv === null) return b.wins - a.wins;
    if (av === null) return 1;
    if (bv === null) return -1;
    return av - bv;
  });

  return { season, name: divisionName(slug), teams };
}

/* ------------------------------------------------------------------ */
/* Δ 5Y — the leaderboard's desktop-only trend column                    */
/* ------------------------------------------------------------------ */

/**
 * The index five seasons back, under the SAME metric name. Cap+ is only ever
 * differenced against Cap+ and Team Rating only against Team Rating — a delta
 * that crossed the 2013 boundary would assert the two are one series, which
 * `DECISIONS.md` 18 forbids.
 */
export async function getIndexDelta5y(
  season: number,
  useCapPlus: boolean,
): Promise<Map<string, Metric<number>>> {
  const out = new Map<string, Metric<number>>();
  const prior = season - 5;
  const db = await getDb();

  if (useCapPlus) {
    if (!(await isSeeded('capplus_official'))) return out;
    const rows = await db
      .select({ team: s.capplusOfficial.team, season: s.capplusOfficial.season, v: s.capplusOfficial.capplus })
      .from(s.capplusOfficial)
      .where(inArray(s.capplusOfficial.season, [season, prior]));
    const now = new Map(rows.filter((r) => r.season === season).map((r) => [r.team, r.v]));
    const then = new Map(rows.filter((r) => r.season === prior).map((r) => [r.team, r.v]));
    for (const [team, v] of now) {
      const p = then.get(team);
      out.set(
        team,
        p === undefined
          ? blank(`Not available — ${prior} Cap+ was not published, so there is no five-season change.`)
          : value(v - p),
      );
    }
    return out;
  }

  if (!(await isSeeded('team_rating'))) return out;
  const rows = await db
    .select({ team: s.teamRating.team, season: s.teamRating.season, v: s.teamRating.perfIndex })
    .from(s.teamRating)
    .where(inArray(s.teamRating.season, [season, prior]));
  const now = new Map(rows.filter((r) => r.season === season).map((r) => [r.team, r.v]));
  const then = new Map(rows.filter((r) => r.season === prior).map((r) => [r.team, r.v]));
  for (const [team, v] of now) {
    const p = then.get(team);
    out.set(
      team,
      p === undefined
        ? blank(`Not available — this franchise has no ${prior} record to compare against.`)
        : value(v - p),
    );
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Compact franchise index series — the leaderboard/entry-card sparkline  */
/* ------------------------------------------------------------------ */

export interface SparkPoint {
  season: number;
  capplus: number | null;
  teamRating: number | null;
}

/**
 * One row per season 1999–2025 for a franchise, both indices carried
 * separately. `null` is "no reading", and the sparkline BREAKS its path there —
 * it never interpolates (`CHART_ANATOMY.md` §5.5).
 */
export async function getSparkSeries(team: TeamAbbr): Promise<SparkPoint[]> {
  const db = await getDb();
  const [rating, capplus] = await Promise.all([
    (await isSeeded('team_rating'))
      ? db
          .select({ season: s.teamRating.season, v: s.teamRating.perfIndex })
          .from(s.teamRating)
          .where(eq(s.teamRating.team, team))
      : Promise.resolve([] as { season: number; v: number }[]),
    (await isSeeded('capplus_official'))
      ? db
          .select({ season: s.capplusOfficial.season, v: s.capplusOfficial.capplus })
          .from(s.capplusOfficial)
          .where(eq(s.capplusOfficial.team, team))
      : Promise.resolve([] as { season: number; v: number }[]),
  ]);
  const cp = new Map(capplus.map((r) => [r.season, r.v]));
  const tr = new Map(rating.map((r) => [r.season, r.v]));
  const seasons = [...new Set([...cp.keys(), ...tr.keys()])].sort((a, b) => a - b);
  return seasons.map((season) => ({
    season,
    capplus: cp.get(season) ?? null,
    teamRating: tr.get(season) ?? null,
  }));
}

/* ------------------------------------------------------------------ */
/* The season's cap ceiling — the methodology strap on the team page     */
/* ------------------------------------------------------------------ */

export async function getLeagueCap(season: number): Promise<Metric<number>> {
  if (!(await isSeeded('league_cap'))) return blank(BLANK_REASON.MART_ABSENT);
  const db = await getDb();
  const rows = await db.select().from(s.leagueCap).where(eq(s.leagueCap.year, season)).limit(1);
  const r = rows[0];
  if (!r) return blank(BLANK_REASON.MART_ABSENT);
  return r.capUsd === null
    ? blank(r.note ?? 'Not available — 2010 was uncapped, so there is no cap to divide by.')
    : value(r.capUsd);
}

/* ------------------------------------------------------------------ */
/* Whether any figure in this snapshot is placeholder — the SAMPLE chip   */
/* ------------------------------------------------------------------ */

/**
 * `SCREENSHOT_VARIANTS.md` §6: the chip is driven by the DATA LAYER, not by a
 * prop a developer remembers to set. This snapshot is seeded entirely from
 * audited marts — `seed_manifest` records a source file for every table — so the
 * answer is derived, not asserted: a table seeded with no source file would be
 * placeholder data.
 */
export async function snapshotHasPlaceholderData(): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.seedManifest)
    .where(and(eq(s.seedManifest.status, 'seeded'), sql`${s.seedManifest.sourceFile} is null`));
  return (rows[0]?.n ?? 0) > 0;
}

/* ------------------------------------------------------------------ */
/* Δ vs the last covered season — the leaderboard's trend column         */
/* ------------------------------------------------------------------ */

export interface PriorDelta {
  /** The most recent earlier season with a published reading under the same name. */
  priorSeason: number | null;
  deltas: Map<string, Metric<number>>;
}

/**
 * The index against the LAST SEASON THAT HAS ONE, under the same metric name —
 * replacing a fixed five-season lag that landed on 2020, a whole-season blank,
 * and so rendered "not covered" in all 32 rows. Cap+ is differenced only
 * against Cap+, Team Rating only against Team Rating (`DECISIONS.md` 18).
 */
export async function getIndexDeltaPrior(season: number, useCapPlus: boolean): Promise<PriorDelta> {
  const out = new Map<string, Metric<number>>();
  const db = await getDb();
  const table = useCapPlus ? 'capplus_official' : 'team_rating';
  if (!(await isSeeded(table))) return { priorSeason: null, deltas: out };

  const rows = useCapPlus
    ? await db
        .select({ team: s.capplusOfficial.team, season: s.capplusOfficial.season, v: s.capplusOfficial.capplus })
        .from(s.capplusOfficial)
    : await db
        .select({ team: s.teamRating.team, season: s.teamRating.season, v: s.teamRating.perfIndex })
        .from(s.teamRating);

  const earlier = [...new Set(rows.map((r) => r.season))].filter((y) => y < season).sort((a, b) => b - a);
  const prior = earlier[0] ?? null;
  const now = new Map(rows.filter((r) => r.season === season).map((r) => [r.team, r.v]));
  const then = new Map(rows.filter((r) => r.season === prior).map((r) => [r.team, r.v]));
  for (const [team, v] of now) {
    const p = then.get(team);
    out.set(
      team,
      p === undefined
        ? blank(`Not available — this club has no earlier ${useCapPlus ? 'Cap+' : 'Team Rating'} reading.`)
        : value(v - p),
    );
  }
  return { priorSeason: prior, deltas: out };
}

/* ------------------------------------------------------------------ */
/* League frames — one season of all 32 clubs, for the scrubbed charts   */
/* ------------------------------------------------------------------ */

/** The three published indices a club can be placed by under the Review control. */
export interface FrameIndices {
  capplus: number;
  capplusRank: number;
  qbNeutral: number;
  qbNeutralRank: number;
  /** CANDIDATE — renders only as `CAPPLUS_OBLIGATION_LABEL`, beside Cap+. */
  obligation: number;
  obligationRank: number;
  /** Rank among this season's rookie-window clubs, or among its veteran-QB clubs. */
  stratumRank: number;
}

export interface FrameClub {
  team: TeamAbbr;
  teamName: string;
  divisionSlug: DivisionSlug;
  wins: number;
  losses: number;
  ties: number;
  /** Cash spent, USD — `team_season_cap.cash_spent_total`. */
  cash: Metric<number>;
  /** Cash ÷ that season's league cap — `team_season_cap.cash_pct_of_league`, verbatim. */
  cashShare: Metric<number>;
  /** Blank in the four whole-season Cap+ blanks, with the mart's reason. */
  indices: Metric<FrameIndices>;
  /** `null` where `capplus_context` has no row (pre-2013). */
  rookieWindow: boolean | null;
  startingQb: string | null;
}

export interface LeagueFrame {
  season: number;
  /** League cash per win, `Σ cash ÷ Σ wins` — the frontier's gold isoline. */
  avgCashPerWin: Metric<number>;
  leagueCap: Metric<number>;
  clubs: FrameClub[];
}

/**
 * Every club for one season, joined across the marts the Field and the frontier
 * read. Nothing is computed here: every number is a mart column, except the
 * league cost-per-win benchmark, which is `getLeagueAvgCostPerWin` unchanged.
 */
export async function getLeagueFrame(season: number): Promise<LeagueFrame> {
  const db = await getDb();
  const meta = await getTeamMetaMap();
  const [results, capRows, context, avgCashPerWin, leagueCap] = await Promise.all([
    db.select().from(s.teamSeasonResults).where(eq(s.teamSeasonResults.season, season)),
    (await isSeeded('team_season_cap'))
      ? db
          .select({
            team: s.teamSeasonCap.team,
            cash: s.teamSeasonCap.cashSpentTotal,
            share: s.teamSeasonCap.cashPctOfLeague,
          })
          .from(s.teamSeasonCap)
          .where(eq(s.teamSeasonCap.season, season))
      : Promise.resolve([] as { team: string; cash: number; share: number }[]),
    getLeagueContext(season),
    getLeagueAvgCostPerWin(season, 'cash'),
    getLeagueCap(season),
  ]);

  const capBy = new Map(capRows.map((r) => [r.team, r]));
  const ctxBy = new Map(context.state === 'blank' ? [] : context.value.map((c) => [c.team as string, c]));
  const noCap = season < TIER2_FIRST_SEASON ? BLANK_REASON.PRE_TIER2 : BLANK_REASON.MART_ABSENT;
  const noCtx = context.state === 'blank' ? context.reason : BLANK_REASON.MART_ABSENT;

  const clubs: FrameClub[] = results.map((r) => {
    const cap = capBy.get(r.team);
    const ctx = ctxBy.get(r.team);
    let indices: Metric<FrameIndices> = blank(noCtx);
    if (ctx) {
      indices =
        ctx.indices.state === 'blank'
          ? blank(ctx.indices.reason)
          : value({
              capplus: ctx.indices.value.capplus,
              capplusRank: ctx.indices.value.capplusRank,
              qbNeutral: ctx.indices.value.capplusQbNeutral,
              qbNeutralRank: ctx.indices.value.qbNeutralRank,
              obligation: ctx.indices.value.capplusObligation,
              obligationRank: ctx.indices.value.obligationRank,
              stratumRank: ctx.indices.value.stratumRank,
            });
    }
    return {
      team: r.team as TeamAbbr,
      teamName: eraIdentity(r.team as TeamAbbr, season).name,
      divisionSlug: (meta.get(r.team)?.divisionSlug ?? 'afc-east') as DivisionSlug,
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      cash: cap ? value(cap.cash) : blank(noCap),
      cashShare: cap ? value(cap.share) : blank(noCap),
      indices,
      rookieWindow: ctx ? ctx.qbRookieWindow : null,
      startingQb: ctx ? ctx.startingQb : null,
    };
  });
  clubs.sort((a, b) => a.team.localeCompare(b.team));

  return { season, avgCashPerWin, leagueCap, clubs };
}
