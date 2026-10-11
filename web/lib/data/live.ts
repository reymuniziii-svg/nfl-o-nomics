/**
 * The live tier — the 2026 season in progress (`SPEC.md` §1.1, §7.14,
 * `DECISIONS.md` 116). THE ONLY MODULE IN THE WEB APP THAT READS THE LIVE
 * TABLES (`tests/test_live_isolation.py` scans for it).
 *
 * What this module promises every caller:
 *   - A live value is `Metric` `partial` with `covered = games played`,
 *     `total = games scheduled`, `badge: 'in_season_live'`, the mart's
 *     `badge_reason` and the as-of week (`liveValue`). It is never a `value`,
 *     so nothing that renders final seasons can mistake it for one.
 *   - A whole-season live blank (before week 4; live Cap+ while gated) is
 *     `blank` with the sentence the mart carries in `live_status`.
 *   - Nothing here is merged into, ranked against, or ordered with a final
 *     season. The all-time accessors (`seasons.ts`, `league.ts`, `compare.ts`,
 *     `metrics.ts`) never import this module.
 *   - No money figure, no per-win ratio and no verdict: the live tier carries
 *     performance only until the season is final (DECISIONS 116 e).
 */

import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import { blank, liveValue, type LiveAsOf, type Metric } from '@/lib/metric';
import { eraIdentity, isTeamAbbr, type DivisionSlug, type TeamAbbr } from '@/lib/teams';
import { recordDash } from '@/lib/display';
import { isSeeded } from './registry';
import { getTeamMetaMap } from './league';

function memo<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= fn());
}

/** First 8 hex characters of a content hash — the footer and CSV short form. */
export function shortHash(h: string | null | undefined): string {
  return (h ?? '').replace(/^sha256:/, '').slice(0, 8);
}

/* ------------------------------------------------------------------ */
/* Status — 1 row                                                       */
/* ------------------------------------------------------------------ */

export interface LiveStatus {
  season: number;
  /** Last closed REG week; 0 before week 1 closes. */
  week: number;
  /** Last game day of `week` — a data date. Null at week 0. */
  date: string | null;
  weeksInSeason: number;
  gamesScheduledPerTeam: number;
  leagueGamesPlayed: number;
  pbpSha256: string;
  pbpAssetUpdatedAt: string;
  gamesCommitSha: string;
  moneyAsofDate: string | null;
  dmAsofDate: string | null;
  dmBasis: 'full32' | 'estimated' | 'none';
  /** Team Rating live: a value from week 4, else the whole-season reason. */
  perf: { state: 'value' } | { state: 'blank'; reason: string };
  /** Live Cap+: blank while gated (week ≥ 9 AND a dated dead-money table). */
  capplus: { state: 'value' } | { state: 'blank'; reason: string };
}

const PERF_BLANK_FALLBACK = 'Team Rating goes live at week 4.';
const CAPPLUS_BLANK_FALLBACK = 'Live Cap+ is not published yet.';

/** The live status, or `null` when this snapshot carries no live tier at all. */
export const getLiveStatus = memo(async (): Promise<LiveStatus | null> => {
  if (!(await isSeeded('live_status'))) return null;
  const db = await getDb();
  const rows = await db.select().from(s.liveStatus).limit(1);
  const r = rows[0];
  if (!r) return null;
  return {
    season: r.season,
    week: r.asofWeek,
    date: r.asofDate,
    weeksInSeason: r.weeksInSeason,
    gamesScheduledPerTeam: r.gamesScheduledPerTeam,
    leagueGamesPlayed: r.leagueGamesPlayed,
    pbpSha256: r.pbpSha256,
    pbpAssetUpdatedAt: r.pbpAssetUpdatedAt,
    gamesCommitSha: r.gamesCommitSha,
    moneyAsofDate: r.moneyAsofDate,
    dmAsofDate: r.dmAsofDate,
    dmBasis: r.dmBasis,
    perf:
      r.perfState === 'value'
        ? { state: 'value' }
        : { state: 'blank', reason: r.perfBlankReason ?? PERF_BLANK_FALLBACK },
    capplus:
      r.capplusState === 'value'
        ? { state: 'value' }
        : { state: 'blank', reason: r.capplusBlankReason ?? CAPPLUS_BLANK_FALLBACK },
  };
});

/* ------------------------------------------------------------------ */
/* Team rows — 32, ranked within 2026 only                              */
/* ------------------------------------------------------------------ */

export interface LiveTeamRow {
  team: TeamAbbr;
  teamName: string;
  divisionSlug: DivisionSlug | null;
  record: string;
  wins: number;
  losses: number;
  ties: number;
  winPct: number;
  gamesPlayed: number;
  gamesScheduled: number;
  byeWeek: number;
  byeTaken: boolean;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  pointDiffPerGame: number;
  /** Team Rating (performance only) · live — `partial`, never `value`. */
  rating: Metric<number>;
  /** 1 = best within 2026 (the mart's rank; ties share the lower rank). */
  rank: number;
  /** Opponent-adjusted EPA margin per play — `partial`. */
  epaAdj: Metric<number>;
  epaRaw: number;
  offEpaAdj: number;
  defEpaAdj: number;
  offEpaRaw: number;
  defEpaRaw: number;
  /** Schedule strength in EPA/play (positive = tougher opponents). */
  sos: number;
  live: LiveAsOf;
  badgeReason: string;
}

export interface LiveLeague {
  status: LiveStatus;
  /** 32 rows, best Team Rating first; empty while `perf` is blank. */
  rows: LiveTeamRow[];
  /** Live Cap+ — blank (with the mart's reason) while gated. */
  capplus: Metric<never>;
}

async function liveRows(status: LiveStatus): Promise<LiveTeamRow[]> {
  if (status.perf.state === 'blank') return [];
  const db = await getDb();
  const [rows, meta] = await Promise.all([
    db
      .select()
      .from(s.liveTeamPerf)
      .where(eq(s.liveTeamPerf.season, status.season))
      .orderBy(asc(s.liveTeamPerf.perfRankLive), asc(s.liveTeamPerf.team)),
    getTeamMetaMap(),
  ]);
  return rows
    .filter((r) => isTeamAbbr(r.team))
    .map((r) => {
      const team = r.team as TeamAbbr;
      const live: LiveAsOf = {
        season: r.season,
        week: r.asofWeek,
        date: status.date ?? '',
        gamesPlayed: r.gamesPlayed,
        gamesScheduled: r.gamesScheduled,
      };
      return {
        team,
        teamName: eraIdentity(team, r.season).name,
        divisionSlug: meta.get(team)?.divisionSlug ?? null,
        record: recordDash(r.wins, r.losses, r.ties),
        wins: r.wins,
        losses: r.losses,
        ties: r.ties,
        winPct: r.winPct,
        gamesPlayed: r.gamesPlayed,
        gamesScheduled: r.gamesScheduled,
        byeWeek: r.byeWeek,
        byeTaken: r.byeTaken,
        pointsFor: r.pointsFor,
        pointsAgainst: r.pointsAgainst,
        pointDiff: r.pointDiff,
        pointDiffPerGame: r.pointDiffPerGame,
        rating: liveValue(r.perfIndexLive, live, r.badgeReason),
        rank: r.perfRankLive,
        epaAdj: liveValue(r.epaMarginPerPlayAdj, live, r.badgeReason),
        epaRaw: r.epaMarginPerPlay,
        offEpaAdj: r.offEpaPerPlayAdj,
        defEpaAdj: r.defEpaPerPlayAdj,
        offEpaRaw: r.offEpaPerPlay,
        defEpaRaw: r.defEpaPerPlay,
        sos: r.sosEpa,
        live,
        badgeReason: r.badgeReason,
      };
    });
}

/** All 32 clubs, ranked by live Team Rating within 2026. `null` = no live tier. */
export const getLiveLeague = memo(async (): Promise<LiveLeague | null> => {
  const status = await getLiveStatus();
  if (!status) return null;
  const rows = await liveRows(status);
  return {
    status,
    rows,
    capplus:
      status.capplus.state === 'blank'
        ? blank(status.capplus.reason)
        : // Gated on in the mart but not wired here yet: say so, never a silent zero.
          blank('Live Cap+ is published in the mart but not shown in this build.'),
  };
});

export interface LiveTeam {
  status: LiveStatus;
  /** The club's live row; `null` while the whole season is blank. */
  row: LiveTeamRow | null;
  /** The whole-season reason when `row` is null. */
  reason: string | null;
}

/** One club's live reading. `null` when the snapshot has no live tier. */
export async function getLiveTeam(abbr: TeamAbbr): Promise<LiveTeam | null> {
  const league = await getLiveLeague();
  if (!league) return null;
  const row = league.rows.find((r) => r.team === abbr) ?? null;
  return {
    status: league.status,
    row,
    reason: row
      ? null
      : league.status.perf.state === 'blank'
        ? league.status.perf.reason
        : 'Not in the live table for this week.',
  };
}

/** The clubs with a live page — `generateStaticParams` unions these keys. */
export async function liveTeamKeys(): Promise<{ team: TeamAbbr; season: number }[]> {
  const league = await getLiveLeague();
  if (!league) return [];
  return league.rows.map((r) => ({ team: r.team, season: league.status.season }));
}

/** True when `season` is the live season AND this club has a live row. */
export async function isLiveTeamSeason(team: TeamAbbr, season: number): Promise<boolean> {
  const league = await getLiveLeague();
  return !!league && league.status.season === season && league.rows.some((r) => r.team === team);
}

/** The live season, when this snapshot carries a live tier. */
export async function liveSeason(): Promise<number | null> {
  return (await getLiveStatus())?.season ?? null;
}

/**
 * The CSV header comment block for any live export (SPEC §8.1): the source
 * marts, the as-of week and date, the money and dead-money dates (none), and
 * the pin hashes — so a downloaded file carries the same caveats as the card.
 */
export function liveCsvMeta(status: LiveStatus, title: string): string[] {
  return [
    `YIELD/YARD — ${title}, ${status.season} in progress`,
    `as of week ${status.week}${status.date ? ` · through ${status.date}` : ''}: every regular-season game through week ${status.week} is final in both the schedule and the play-by-play; nothing after it is read`,
    `source marts: data/marts/live/live_team_perf.csv, data/marts/live/live_status.csv (season ${status.season} only; never joined to the 1999-2025 marts)`,
    `pins: play_by_play_${status.season}.parquet sha256 ${status.pbpSha256} (asset updated ${status.pbpAssetUpdatedAt}) · nfldata games.csv @ ${status.gamesCommitSha}`,
    `money_asof_date: ${status.moneyAsofDate ?? 'none'} · dm_asof_date: ${status.dmAsofDate ?? 'none'} · dm_basis: ${status.dmBasis}. No cap, cash, cost-per-win or dead-money figure is published for a season in progress.`,
    `live Cap+: ${status.capplus.state === 'blank' ? status.capplus.reason : 'published'}`,
    `comparable within ${status.season} only. 100 = the ${status.season} league average. Partial season: games_played of games_scheduled. No verdict.`,
  ];
}
