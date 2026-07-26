/**
 * Season and route enumeration — the source of `generateStaticParams`.
 *
 * Every list here comes from the seeded marts, so the static param sets are
 * exactly the team-seasons and players that exist in the snapshot. Results are
 * memoised per process: `next build` calls these once per render worker.
 */

import { and, desc, eq, max, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import { isTeamAbbr, type TeamAbbr } from '@/lib/teams';

function memo<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= fn());
}

export interface TeamSeasonKey {
  team: TeamAbbr;
  season: number;
}

/** All 861 (team, season) keys, ascending. */
export const allTeamSeasons = memo(async (): Promise<TeamSeasonKey[]> => {
  const db = await getDb();
  const rows = await db
    .select({ team: s.teamSeasonResults.team, season: s.teamSeasonResults.season })
    .from(s.teamSeasonResults)
    .orderBy(s.teamSeasonResults.season, s.teamSeasonResults.team);
  return rows.filter((r) => isTeamAbbr(r.team)).map((r) => ({ team: r.team as TeamAbbr, season: r.season }));
});

/** The most recent season with complete data — 2025 at launch. */
export const latestSeason = memo(async (): Promise<number> => {
  const db = await getDb();
  const rows = await db.select({ n: max(s.teamSeasonResults.season) }).from(s.teamSeasonResults);
  return rows[0]?.n ?? 2025;
});

/** The most recent season per franchise — the `/team/{abbr}` 301 target. */
export const latestSeasonByTeam = memo(async (): Promise<Map<TeamAbbr, number>> => {
  const db = await getDb();
  const rows = await db
    .select({ team: s.teamSeasonResults.team, n: max(s.teamSeasonResults.season) })
    .from(s.teamSeasonResults)
    .groupBy(s.teamSeasonResults.team);
  const out = new Map<TeamAbbr, number>();
  for (const r of rows) if (isTeamAbbr(r.team) && r.n !== null) out.set(r.team as TeamAbbr, r.n);
  return out;
});

/** Seasons this franchise has, descending — the team page's season picker. */
export async function seasonsForTeam(team: TeamAbbr): Promise<number[]> {
  const db = await getDb();
  const rows = await db
    .select({ season: s.teamSeasonResults.season })
    .from(s.teamSeasonResults)
    .where(eq(s.teamSeasonResults.team, team))
    .orderBy(desc(s.teamSeasonResults.season));
  return rows.map((r) => r.season);
}

/** True when this exact team-season exists in the snapshot. */
export async function teamSeasonExists(team: TeamAbbr, season: number): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ n: sql<number>`1` })
    .from(s.teamSeasonResults)
    .where(and(eq(s.teamSeasonResults.team, team), eq(s.teamSeasonResults.season, season)))
    .limit(1);
  return rows.length > 0;
}
