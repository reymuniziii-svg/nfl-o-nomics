/**
 * Home / Division — `SPEC.md` §3.1.
 *
 * `/` and `/division/{div}` render the same five blocks; `/` is the AFC East
 * default. Shared here so the two routes cannot drift.
 *
 *   1. Division picker, sticky
 *   2. THE RECEIPT — the hero division cost-per-win card, on real data
 *   3. League Cap+ leaderboard, ALL 32 rows, with the `100 = league average`
 *      caption and CSV
 *   4. Largest dead-money charges, with `is_actual` chips and as-of dates
 *   5. Entry cards, each seeded with a concrete example
 *
 * This is a SUBJECTLESS surface, so the Receipt runs in BENCHMARK MODE: lime
 * means favourable versus the benchmark, red means dearer, and the strap
 * discloses the mode by naming the benchmark without a subject
 * (`DECISIONS.md` 71 / 72).
 */

import Link from 'next/link';
import entry from './entry-cards.module.css';
import {
  getDivisionSummary,
  getHomeBundle,
  getIndexDelta5y,
  getLeagueAvgCostPerWin,
  getLeagueSpend,
  getSparkSeries,
  snapshotHasPlaceholderData,
} from '@/lib/data';
import { blank, value, type Metric } from '@/lib/metric';
import { DIVISION_SLUGS, divisionName, type DivisionSlug } from '@/lib/teams';
import { recordDash, usdShort } from '@/lib/display';
import { receiptCoverage, receiptRows } from '@/lib/view';
import { Receipt } from '@/components/receipt/receipt';
import { DivisionPicker } from '@/components/pickers/division-picker';
import {
  CapPlusLeaderboard,
  type LeaderboardViewRow,
} from '@/components/leaderboard/capplus-leaderboard';
import { Card, CardHeader, ChartCaption } from '@/components/primitives';
import { DeadMoneyLedger } from '@/components/team/team-blocks';
import { CsvExport } from '@/components/csv-export';
import { csvTable } from '@/lib/csv';
import { FranchiseSparkline } from '@/components/charts/franchise-sparkline';

const NOT_TIER2 = 'Not available — league-wide contract coverage begins in 2013.';

export async function DivisionView({ slug }: { slug: DivisionSlug }) {
  const { season, division, leaderboard, ledger, entryCards } = await getHomeBundle(slug);

  const [divisionCap, avgCash, avgCap, spendCash, delta5y, sample] = await Promise.all([
    getDivisionSummary(slug, season, 'cap'),
    getLeagueAvgCostPerWin(season, 'cash'),
    getLeagueAvgCostPerWin(season, 'cap'),
    getLeagueSpend(season, 'cash'),
    getIndexDelta5y(season, leaderboard.capplusCovered),
    snapshotHasPlaceholderData(),
  ]);

  const sparkEntries = await Promise.all(
    leaderboard.rows.map(async (r) => [r.team, await getSparkSeries(r.team)] as const),
  );
  const sparks = new Map(sparkEntries);

  const rows: LeaderboardViewRow[] = leaderboard.rows.map((r) => {
    const s = spendCash.get(r.team);
    const spend: Metric<number> = s ? value(s.spend) : blank(NOT_TIER2);
    const perWin: Metric<number> = s
      ? s.perWin === null
        ? blank(`${usdShort(s.spend)} spent · 0 wins — the ratio is suppressed by rule.`)
        : value(s.perWin)
      : blank(NOT_TIER2);

    return {
      team: r.team,
      teamName: r.teamName,
      record: recordDash(r.wins, r.losses, r.ties),
      wins: r.wins,
      rank: r.rank,
      index: r.index,
      spend,
      perWin,
      delta5y: delta5y.get(r.team) ?? blank('Not available — no five-season delta exists.'),
      href: `/team/${r.team.toLowerCase()}/${season}`,
      spark: sparks.get(r.team) ?? [],
    };
  });

  const indexName = leaderboard.capplusCovered ? 'Cap+' : 'Team Rating (performance only)';
  const divisionTeams = division.teams.map((t) => String(t.team));

  return (
    <>
      {/* 1 — the division picker, sticky */}
      <DivisionPicker
        selected={slug}
        options={DIVISION_SLUGS.map((d) => ({
          slug: d,
          name: divisionName(d),
          href: `/division/${d}`,
        }))}
      />

      {/* 2 — THE RECEIPT, on real data. The SAMPLE chip is derived from the
          snapshot, never asserted: real data ⇒ no chip. */}
      <Receipt
        title={division.name.toUpperCase()}
        wideTitle={`${division.name.toUpperCase()} — WHAT A WIN COSTS`}
        season={season}
        rows={{ cash: receiptRows(division), cap: receiptRows(divisionCap) }}
        leagueAvg={{ cash: avgCash, cap: avgCap }}
        sample={sample}
        coverage={receiptCoverage(season, division.teams.length)}
      />

      {/* 3 — the league leaderboard, ALL 32 rows */}
      <Card ariaLabel={`${indexName} leaderboard`}>
        <CardHeader
          eyebrow={`League · ${season}`}
          title={leaderboard.capplusCovered ? 'CAP+ INDEX' : 'TEAM RATING'}
          right={
            <CsvExport
              title={`${indexName} leaderboard`}
              filename={`yieldyard_leaderboard_${season}.csv`}
              table={csvTable(rows, [
                { key: 'rank', label: 'rank', get: (r) => r.rank },
                { key: 'team', label: 'team', get: (r) => r.team },
                { key: 'team_name', label: 'team_name', get: (r) => r.teamName },
                { key: 'record', label: 'record', get: (r) => r.record },
                { key: 'wins', label: 'wins', get: (r) => r.wins },
                {
                  key: 'index',
                  label: leaderboard.capplusCovered ? 'capplus' : 'team_rating',
                  get: (r) => (r.index.state === 'blank' ? '' : r.index.value.toFixed(6)),
                },
                {
                  key: 'index_blank_reason',
                  label: 'index_blank_reason',
                  get: (r) => (r.index.state === 'blank' ? r.index.reason : ''),
                },
                {
                  key: 'cash_spent',
                  label: 'cash_spent_usd',
                  get: (r) => (r.spend.state === 'blank' ? '' : r.spend.value),
                },
                {
                  key: 'cost_per_win',
                  label: 'cost_per_win_usd',
                  get: (r) => (r.perWin.state === 'blank' ? '' : r.perWin.value.toFixed(2)),
                },
                {
                  key: 'cost_per_win_note',
                  label: 'cost_per_win_note',
                  get: (r) => (r.perWin.state === 'blank' ? r.perWin.reason : ''),
                },
              ], [
                `YIELD/YARD — ${indexName} leaderboard, ${season}`,
                `source marts: ${leaderboard.capplusCovered ? 'capplus_official' : 'team_rating'}, team_season_results, team_season_cap`,
                'coverage: all 32 clubs. 100 = league average. Contract, cap and cash coverage begins in 2013.',
                'zero-win rule: a club with no wins carries its total spend and no ratio. The ratio is never Infinity, "N/A" or a blank.',
                `league average cost per win (cash): ${
                  avgCash.state === 'blank' ? avgCash.reason : usdShort(avgCash.value)
                }`,
              ])}
            />
          }
        />
        <CapPlusLeaderboard
          rows={rows}
          season={season}
          indexName={indexName}
          isCapPlus={leaderboard.capplusCovered}
          focusTeams={divisionTeams}
        />
      </Card>

      {/* 4 — largest dead-money charges */}
      <Card ariaLabel="Largest dead-money charges">
        <CardHeader eyebrow="From the ledger" title="LARGEST DEAD-MONEY CHARGES" />
        {ledger.state === 'blank' ? (
          <ChartCaption>{ledger.reason}</ChartCaption>
        ) : (
          <DeadMoneyLedger
            rows={ledger.value.map((c) => ({
              player: c.player,
              team: c.team,
              seasons: c.seasons,
              totalUsd: c.totalUsd,
              splitBySeason: c.splitBySeason,
              isActual: c.isActual,
              verifiedAsof: c.verifiedAsof,
              sourceUrl: c.sourceUrl,
              notes: c.notes,
            }))}
          />
        )}
        <ChartCaption>
          Every charge carries the date it was verified and a link to its source. Charges are never
          averaged, never summed across differently dated readings, and never split across seasons
          unless the split is published.
        </ChartCaption>
      </Card>

      {/* 5 — entry cards */}
      <Card ariaLabel="Start somewhere">
        <CardHeader eyebrow="Three ways in" title="START SOMEWHERE" />
        <div className={entry.grid}>
          {entryCards.map((c) => (
            <Link className={entry.card} key={c.href} href={c.href}>
              <span className={`yy-label ${entry.kind}`}>{c.label}</span>
              <span className={entry.example}>{c.example}</span>
              <p className={`yy-caption ${entry.note}`}>{EXAMPLE_NOTE[c.label] ?? ''}</p>
              <span className={entry.foot}>
                {c.label === 'Team' ? (
                  <FranchiseSparkline
                    series={sparks.get('KC') ?? []}
                    label="Kansas City Chiefs"
                  />
                ) : (
                  <span />
                )}
                <span className={`yy-label ${entry.go}`}>Open →</span>
              </span>
            </Link>
          ))}
        </div>
      </Card>
    </>
  );
}

const EXAMPLE_NOTE: Record<string, string> = {
  Team: 'The full team season: history, the three lenses, allocation, dead money, coaching and draft.',
  Player:
    'Contract terms, cap versus cash by year with dead-money markers, and availability. No value grade, ever.',
  'Head-to-head':
    'Two team-seasons, each scored against its own season’s league — which is what makes a 2007 team and a 2024 team comparable.',
};
