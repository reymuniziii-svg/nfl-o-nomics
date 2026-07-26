import type { Metadata } from 'next';
import {
  getCapPlus,
  getCompareBundle,
  getTeamMetaMap,
  latestSeason,
  parseRef,
  seasonsForTeam,
  TIER2_FIRST_SEASON,
  type TeamSeasonRef,
} from '@/lib/data';
import { mapMetric, blank, value, type Metric } from '@/lib/metric';
import { eraIdentity } from '@/lib/teams';
import { BoundaryMessage, Card, CardHeader, ChartCaption, IndexBadge } from '@/components/primitives';
import { EraCards, HeadToHead } from '@/components/compare/head-to-head';
import { ComparePicker } from '@/components/pickers/team-season-picker';
import { CsvExport } from '@/components/csv-export';
import { csvTable } from '@/lib/csv';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import { and, eq } from 'drizzle-orm';

/**
 * `SPEC.md` §6 — `/compare?a={abbr}-{season}&b={abbr}-{season}`, ON DEMAND.
 *
 * The only route that cannot be enumerated: 861 × 861 ordered pairs is 741k
 * combinations. It renders on first request and is cached at the edge by the
 * long `Cache-Control` set for `/compare` in `next.config.ts`.
 */
export const revalidate = 31536000;

export const metadata: Metadata = {
  title: 'Head-to-head',
  description:
    'Two team-seasons, each scored against its own season’s league — which is what makes a 2003 team and a 2024 team comparable.',
};

async function teamRatingOf(ref: TeamSeasonRef): Promise<Metric<number>> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(s.teamRating)
    .where(and(eq(s.teamRating.team, ref.team), eq(s.teamRating.season, ref.season)))
    .limit(1);
  return row
    ? value(row.perfIndex)
    : blank('Not available — no Team Rating row exists for this team-season.');
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const season = await latestSeason();

  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const a = parseRef(one('a')) ?? { team: 'KC' as const, season };
  const b = parseRef(one('b')) ?? { team: 'SF' as const, season: 2023 };

  const [bundle, meta, seasonsA, capA, capB, trA, trB] = await Promise.all([
    getCompareBundle(a, b),
    getTeamMetaMap(),
    seasonsForTeam(a.team),
    getCapPlus(a.season, a.team),
    getCapPlus(b.season, b.team),
    teamRatingOf(a),
    teamRatingOf(b),
  ]);

  const teamOptions = [...meta.values()]
    .map((m) => ({
      abbr: m.abbr,
      name: m.teamName,
      conference: m.conf,
      division: m.division.replace(/^(AFC|NFC)\s*/, ''),
    }))
    .sort((x, y) => x.name.localeCompare(y.name));

  const seasons = seasonsA.length ? seasonsA : [season];

  const badgeFor = (ref: TeamSeasonRef, cap: Metric<number>, tr: Metric<number>) =>
    ref.season >= TIER2_FIRST_SEASON ? (
      <IndexBadge metric={cap} scale="era" metricName="capplus" showCaption />
    ) : (
      <IndexBadge metric={tr} scale="era" metricName="teamRating" />
    );

  return (
    <>
      <Card ariaLabel="Choose two team-seasons">
        <CardHeader eyebrow="Curated pickers only" title="HEAD-TO-HEAD" />
        <ComparePicker teams={teamOptions} seasons={seasons} a={a} b={b} />
        <ChartCaption>
          Two team-seasons, one at a time on each side. There is no free-form query builder in v1:
          every selection here is a curated list.
        </ChartCaption>
      </Card>

      {bundle ? (
        <Card ariaLabel="Comparison">
          <CardHeader
            eyebrow={`${eraIdentity(a.team, a.season).name} · ${a.season} vs ${eraIdentity(b.team, b.season).name} · ${b.season}`}
            title="AGAINST THEIR OWN LEAGUES"
            right={
              <CsvExport
                title="Head-to-head"
                filename={`yieldyard_compare_${a.team.toLowerCase()}-${a.season}_${b.team.toLowerCase()}-${b.season}.csv`}
                table={csvTable(bundle.rows, [
                  { key: 'metric', label: 'metric', get: (r) => r.label },
                  { key: 'tier', label: 'tier', get: (r) => r.tier },
                  { key: 'unit', label: 'unit', get: (r) => r.unit },
                  { key: 'a_ref', label: 'a', get: (r) => `${r.a.ref.team}-${r.a.ref.season}` },
                  {
                    key: 'a_value',
                    label: 'a_value',
                    get: (r) => (r.a.raw.state === 'blank' ? '' : r.a.raw.value),
                  },
                  { key: 'a_league', label: 'a_league_avg', get: (r) => r.a.leagueAvg ?? '' },
                  { key: 'a_delta', label: 'a_delta_vs_own_league', get: (r) => r.a.delta ?? '' },
                  {
                    key: 'a_usd',
                    label: 'a_secondary_usd',
                    get: (r) => r.a.secondaryUsd ?? '',
                  },
                  {
                    key: 'a_blank',
                    label: 'a_blank_reason',
                    get: (r) => (r.a.raw.state === 'blank' ? r.a.raw.reason : ''),
                  },
                  { key: 'b_ref', label: 'b', get: (r) => `${r.b.ref.team}-${r.b.ref.season}` },
                  {
                    key: 'b_value',
                    label: 'b_value',
                    get: (r) => (r.b.raw.state === 'blank' ? '' : r.b.raw.value),
                  },
                  { key: 'b_league', label: 'b_league_avg', get: (r) => r.b.leagueAvg ?? '' },
                  { key: 'b_delta', label: 'b_delta_vs_own_league', get: (r) => r.b.delta ?? '' },
                  {
                    key: 'b_usd',
                    label: 'b_secondary_usd',
                    get: (r) => r.b.secondaryUsd ?? '',
                  },
                  {
                    key: 'b_blank',
                    label: 'b_blank_reason',
                    get: (r) => (r.b.raw.state === 'blank' ? r.b.raw.reason : ''),
                  },
                ], [
                  'YIELD/YARD — head-to-head',
                  'source marts: team_season_results, team_season_epa, team_rating, capplus_official, team_season_cap, dead_money_display',
                  bundle.crossEraStatement,
                  'unit=pct_of_cap is a 0-1 SHARE OF THAT SEASON\'S LEAGUE CAP, not dollars. Every money row is compared on that scale; the dollar figure is in the *_secondary_usd column and is never what a bar is drawn from.',
                  'Where one side is pre-2013, its Tier 2 rows carry the boundary message. No row is silently omitted and no side renders zero.',
                ])}
              />
            }
          />

          <EraCards
            bundle={bundle}
            aIndex={badgeFor(a, mapMetric(capA, (c) => c.capplus), trA)}
            bIndex={badgeFor(b, mapMetric(capB, (c) => c.capplus), trB)}
          />

          <HeadToHead
            bundle={bundle}
            coverage={{
              statement:
                'Every row is drawn against the league average of its own season. Rows where one side has no Tier 2 coverage render the boundary on that side only — the available side is unchanged and neither side renders zero.',
            }}
          />
        </Card>
      ) : (
        <Card ariaLabel="Comparison">
          <BoundaryMessage body="One of these team-seasons is not in the snapshot. Pick another pair above; every season 1999–2025 exists for every franchise that played it." />
        </Card>
      )}
    </>
  );
}
