/**
 * Home and division data — `SPEC.md` §3.1.
 *
 * The league leaderboard is ALL 32 TEAMS, not a top-10. Gate #1 cleared, so the
 * slot renders Cap+ where the season is covered and `TEAM_RATING_NAME` where it
 * is not — each under its own name, never "Cap+ (performance only)".
 */

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import {
  BLANK_REASON,
  TEAM_RATING_NAME,
  blank,
  value,
  type AsOf,
  type AsOfStage,
  type Metric,
} from '@/lib/metric';
import { divisionName, eraIdentity, type DivisionSlug, type TeamAbbr } from '@/lib/teams';
import { isSeeded } from './registry';
import { latestSeason } from './seasons';
import {
  DEFAULT_NUMERATOR,
  NUMERATOR_CAVEAT,
  NUMERATOR_LABEL,
  getCostPerWin,
  type CostNumerator,
  type CostPerWin,
} from './metrics';

/* ------------------------------------------------------------------ */
/* League leaderboard                                                   */
/* ------------------------------------------------------------------ */

export interface LeaderboardRow {
  team: TeamAbbr;
  teamName: string;
  division: string;
  wins: number;
  losses: number;
  ties: number;
  /** The index this row leads with. */
  index: Metric<number>;
  /** Which index it is — the name is load-bearing (`SPEC.md` §2.3). */
  indexName: 'Cap+' | typeof TEAM_RATING_NAME;
  rank: number | null;
  provisional: boolean;
  asOf: AsOf | null;
}

export interface Leaderboard {
  season: number;
  /** True when this season has Cap+ coverage; false when it is Team Rating only. */
  capplusCovered: boolean;
  caption: string;
  rows: LeaderboardRow[];
}

/** `SPEC.md` §3.1 item 3 — the full table, with the "100 = league average" caption. */
export async function getLeagueLeaderboard(season: number): Promise<Leaderboard> {
  const db = await getDb();

  const results = await db
    .select({
      team: s.teamSeasonResults.team,
      wins: s.teamSeasonResults.wins,
      losses: s.teamSeasonResults.losses,
      ties: s.teamSeasonResults.ties,
    })
    .from(s.teamSeasonResults)
    .where(eq(s.teamSeasonResults.season, season));

  const capplus = (await isSeeded('capplus_official'))
    ? await db.select().from(s.capplusOfficial).where(eq(s.capplusOfficial.season, season))
    : [];
  const rating = (await isSeeded('team_rating'))
    ? await db.select().from(s.teamRating).where(eq(s.teamRating.season, season))
    : [];

  const capplusBy = new Map(capplus.map((r) => [r.team, r]));
  const ratingBy = new Map(rating.map((r) => [r.team, r]));
  const meta = new Map(
    (await db.select().from(s.teamMeta)).map((m) => [m.abbr, m]),
  );

  const covered = capplus.length > 0;

  const rows: LeaderboardRow[] = results.map((r) => {
    const cp = capplusBy.get(r.team);
    const tr = ratingBy.get(r.team);
    const era = eraIdentity(r.team as TeamAbbr, season);

    let index: Metric<number>;
    let rank: number | null = null;
    let provisional = false;
    let asOf: AsOf | null = null;

    if (covered) {
      if (cp) {
        asOf = { date: cp.dmAsofDate, stage: cp.dmAsofStage as AsOfStage };
        provisional = cp.badge === 'provisional';
        index = value(cp.capplus, asOf, provisional);
        rank = cp.seasonRank;
      } else {
        index = blank(BLANK_REASON.NO_DM_TABLE);
      }
    } else if (tr) {
      index = value(tr.perfIndex);
      rank = tr.seasonRank;
    } else {
      index = blank(BLANK_REASON.MART_ABSENT);
    }

    return {
      team: r.team as TeamAbbr,
      teamName: era.name,
      division: meta.get(r.team)?.division ?? '',
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      index,
      indexName: covered ? 'Cap+' : TEAM_RATING_NAME,
      rank,
      provisional,
      asOf,
    };
  });

  rows.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99) || a.team.localeCompare(b.team));

  return {
    season,
    capplusCovered: covered,
    caption: covered
      ? '100 = league average. Read Cap+ as what this season’s wins cost, not as a front-office grade.'
      : `100 = league average. ${TEAM_RATING_NAME} has no cap adjustment before 2013.`,
    rows,
  };
}

/* ------------------------------------------------------------------ */
/* Division view                                                        */
/* ------------------------------------------------------------------ */

export interface DivisionTeam {
  team: TeamAbbr;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  pointDiff: number;
  costPerWin: Metric<CostPerWin>;
  index: Metric<number>;
  indexName: string;
}

export interface DivisionSummary {
  slug: DivisionSlug;
  name: string;
  season: number;
  numerator: CostNumerator;
  numeratorLabel: string;
  numeratorCaveat: string;
  teams: DivisionTeam[];
}

/** `SPEC.md` §3.1 item 2 — the hero division cost-per-win card, four teams. */
export async function getDivisionSummary(
  slug: DivisionSlug,
  season: number,
  numerator: CostNumerator = DEFAULT_NUMERATOR,
): Promise<DivisionSummary> {
  const db = await getDb();

  const members = await db
    .select({ abbr: s.teamMeta.abbr })
    .from(s.teamMeta)
    .where(eq(s.teamMeta.divisionSlug, slug))
    .orderBy(asc(s.teamMeta.abbr));
  const abbrs = members.map((m) => m.abbr);

  const results = abbrs.length
    ? await db
        .select()
        .from(s.teamSeasonResults)
        .where(
          and(
            eq(s.teamSeasonResults.season, season),
            inArray(s.teamSeasonResults.team, abbrs),
          ),
        )
    : [];

  const leaderboard = await getLeagueLeaderboard(season);
  const indexBy = new Map(leaderboard.rows.map((r) => [r.team, r]));

  const teams: DivisionTeam[] = [];
  for (const r of results) {
    const lb = indexBy.get(r.team as TeamAbbr);
    teams.push({
      team: r.team as TeamAbbr,
      teamName: eraIdentity(r.team as TeamAbbr, season).name,
      wins: r.wins,
      losses: r.losses,
      ties: r.ties,
      pointDiff: r.pointDiff,
      costPerWin: await getCostPerWin(season, r.team, numerator),
      index: lb?.index ?? blank(BLANK_REASON.MART_ABSENT),
      indexName: lb?.indexName ?? TEAM_RATING_NAME,
    });
  }

  // Ranked by cost per win, cheapest first. Zero-win teams are EXCLUDED from the
  // ratio ordering rather than sorted to either extreme (`DATA_AUDIT.md` §4.1).
  teams.sort((a, b) => {
    const av = a.costPerWin.state === 'value' ? a.costPerWin.value.perWin : null;
    const bv = b.costPerWin.state === 'value' ? b.costPerWin.value.perWin : null;
    if (av === null && bv === null) return b.wins - a.wins;
    if (av === null) return 1;
    if (bv === null) return -1;
    return av - bv;
  });

  return {
    slug,
    name: divisionName(slug),
    season,
    numerator,
    numeratorLabel: NUMERATOR_LABEL[numerator],
    numeratorCaveat: NUMERATOR_CAVEAT[numerator],
    teams,
  };
}

/* ------------------------------------------------------------------ */
/* Largest dead-money charges — SPEC §3.1 item 4                        */
/* ------------------------------------------------------------------ */

export interface LedgerCharge {
  player: string;
  team: TeamAbbr;
  seasons: string;
  totalUsd: number;
  splitBySeason: string | null;
  isActual: boolean;
  verifiedAsof: string;
  sourceUrl: string;
  notes: string | null;
}

/** From the ledger, with `is_actual` chips and as-of dates. Never averaged. */
export async function getLargestDeadMoneyCharges(limit = 10): Promise<Metric<LedgerCharge[]>> {
  if (!(await isSeeded('dead_money_ledger'))) return blank(BLANK_REASON.MART_ABSENT);
  const db = await getDb();
  const rows = await db
    .select()
    .from(s.deadMoneyLedger)
    .orderBy(desc(s.deadMoneyLedger.totalUsd))
    .limit(limit);
  return value(
    rows.map((r) => ({
      player: r.player,
      team: r.team as TeamAbbr,
      seasons: r.seasons,
      totalUsd: r.totalUsd,
      splitBySeason: r.splitBySeason,
      isActual: r.isActual,
      verifiedAsof: r.verifiedAsof,
      sourceUrl: r.sourceUrl,
      notes: r.notes,
    })),
  );
}

/* ------------------------------------------------------------------ */
/* The home bundle                                                      */
/* ------------------------------------------------------------------ */

export interface HomeBundle {
  season: number;
  division: DivisionSummary;
  leaderboard: Leaderboard;
  ledger: Metric<LedgerCharge[]>;
  /** SPEC §3.1 item 5 — entry cards seeded with a concrete example, never empty. */
  entryCards: { href: string; label: string; example: string }[];
}

export async function getHomeBundle(slug: DivisionSlug): Promise<HomeBundle> {
  const season = await latestSeason();
  const [division, leaderboard, ledger] = await Promise.all([
    getDivisionSummary(slug, season),
    getLeagueLeaderboard(season),
    getLargestDeadMoneyCharges(5),
  ]);

  return {
    season,
    division,
    leaderboard,
    ledger,
    entryCards: [
      { href: `/team/kc/${season}`, label: 'Team', example: `Kansas City Chiefs · ${season}` },
      { href: '/player/4848', label: 'Player', example: 'Dak Prescott' },
      {
        href: `/compare?a=kc-${season}&b=sf-2023`,
        label: 'Head-to-head',
        example: `KC ${season} vs SF 2023`,
      },
    ],
  };
}
