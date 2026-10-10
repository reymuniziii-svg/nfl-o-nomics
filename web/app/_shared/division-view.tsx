/**
 * Home / Division — `SPEC.md` §3.1.
 *
 * `/` and `/division/{div}` render the same five blocks; `/` is the AFC East
 * default. Shared here so the two routes cannot drift.
 *
 *   1. Division picker, sticky (the pill row only)
 *   2. THE RECEIPT — the hero division cost-per-win card, on one league-wide
 *      domain per season, with every club as a ghost tick
 *   3. The frontier — all 32 clubs, wins against cash, the gold league price
 *   4. League Cap+ leaderboard, ALL 32 rows, with the league Field above it,
 *      the Review control, the `100 = league average` caption and CSV
 *   5. Largest dead-money charges, as shares of each season's cap
 *   6. Entry cards, each seeded with a concrete example
 *
 * Blocks 2–4 share one client link state (`LeagueLinkProvider`): the
 * numerator (`?n=`), the Review mode (`?review=`), the scrubbed season, and
 * the club under the pointer, lit on every surface at once.
 *
 * This is a SUBJECTLESS surface, so the Receipt runs in BENCHMARK MODE: lime
 * means favorable versus the benchmark, red means pricier, and the strap
 * discloses the mode by naming the benchmark without a subject
 * (`DECISIONS.md` 71 / 72).
 */

import Link from 'next/link';
import entry from './entry-cards.module.css';
import {
  getDivisionSummary,
  getHomeBundle,
  getIndexDeltaPrior,
  getLeagueAvgCostPerWin,
  getLeagueCap,
  getLeagueFrame,
  getLeagueSpend,
  getSparkSeries,
  getStrataSummary,
  snapshotHasPlaceholderData,
  TIER2_FIRST_SEASON,
  type LeagueFrame,
  type LeagueSpendRow,
} from '@/lib/data';
import { blank, value, type Metric } from '@/lib/metric';
import { DIVISION_SLUGS, divisionName, type DivisionSlug } from '@/lib/teams';
import { recordDash, usdShort } from '@/lib/display';
import { receiptCoverage, receiptRows } from '@/lib/view';
import { Receipt, type LeagueRatios } from '@/components/receipt/receipt';
import { DivisionPicker } from '@/components/pickers/division-picker';
import {
  CapPlusLeaderboard,
  type LeaderboardViewRow,
} from '@/components/leaderboard/capplus-leaderboard';
import { LeagueLinkProvider } from '@/components/leaderboard/league-link';
import { Card, CardHeader, ChartCaption } from '@/components/primitives';
import { LeagueField } from '@/components/field/league-field';
import type { ScrubFrame } from '@/components/field/field-kit';
import { Frontier } from '@/components/charts/frontier';
import { LedgerBoard, seasonsOf } from './ledger-board';
import { CsvExport } from '@/components/csv-export';
import { csvTable } from '@/lib/csv';
import { FranchiseSparkline } from '@/components/charts/franchise-sparkline';
import { ShareButton } from '@/components/share/share-button';

const NOT_TIER2 = 'Not available — league-wide contract coverage begins in 2013.';

/** A zero-win club carries its spend and NO ratio (`SPEC.md` §2.5). */
function ratioOf(s: LeagueSpendRow | undefined): Metric<number> {
  if (!s) return blank(NOT_TIER2);
  return s.perWin === null
    ? blank(`${usdShort(s.spend)} spent · 0 wins. The ratio is suppressed by rule.`)
    : value(s.perWin);
}

function ratiosOf(m: Map<string, LeagueSpendRow>): LeagueRatios {
  return {
    ratios: [...m.values()]
      .filter((r) => r.perWin !== null)
      .map((r) => ({ abbr: r.team, perWin: r.perWin as number })),
  };
}

/** `LeagueFrame` (Metric-shaped, server) → `ScrubFrame` (compact, client). */
function toScrub(f: LeagueFrame): ScrubFrame {
  const ixBlank = f.clubs.find((c) => c.indices.state === 'blank');
  const cashBlank = f.clubs.find((c) => c.cash.state === 'blank');
  return {
    season: f.season,
    ixReason: ixBlank && ixBlank.indices.state === 'blank' ? ixBlank.indices.reason : null,
    cashReason: cashBlank && cashBlank.cash.state === 'blank' ? cashBlank.cash.reason : null,
    avgCpw: f.avgCashPerWin.state === 'blank' ? null : f.avgCashPerWin.value,
    avgCpwReason: f.avgCashPerWin.state === 'blank' ? f.avgCashPerWin.reason : null,
    cap: f.leagueCap.state === 'blank' ? null : f.leagueCap.value,
    clubs: f.clubs.map((c) => ({
      team: c.team,
      name: c.teamName,
      div: c.divisionSlug,
      w: c.wins,
      l: c.losses,
      t: c.ties,
      cash: c.cash.state === 'blank' ? null : c.cash.value,
      share: c.cashShare.state === 'blank' ? null : c.cashShare.value,
      ix:
        c.indices.state === 'blank'
          ? null
          : {
              raw: c.indices.value.capplus,
              rawRank: c.indices.value.capplusRank,
              qbn: c.indices.value.qbNeutral,
              qbnRank: c.indices.value.qbNeutralRank,
              obl: c.indices.value.obligation,
              oblRank: c.indices.value.obligationRank,
            },
      rookie: c.rookieWindow,
      qb: c.startingQb,
    })),
  };
}

export async function DivisionView({ slug }: { slug: DivisionSlug }) {
  const { season, division, leaderboard, ledger, entryCards } = await getHomeBundle(slug);

  const frameSeasons = Array.from(
    { length: season - TIER2_FIRST_SEASON + 1 },
    (_, i) => TIER2_FIRST_SEASON + i,
  );
  const [divisionCap, avgCash, avgCap, spendCash, spendCap, prior, strata, sample, frames, kcSpark] =
    await Promise.all([
      getDivisionSummary(slug, season, 'cap'),
      getLeagueAvgCostPerWin(season, 'cash'),
      getLeagueAvgCostPerWin(season, 'cap'),
      getLeagueSpend(season, 'cash'),
      getLeagueSpend(season, 'cap'),
      getIndexDeltaPrior(season, leaderboard.capplusCovered),
      getStrataSummary(season),
      snapshotHasPlaceholderData(),
      Promise.all(frameSeasons.map((y) => getLeagueFrame(y))),
      getSparkSeries('KC'),
    ]);

  const latest = frames.find((f) => f.season === season);
  const ctxBy = new Map((latest?.clubs ?? []).map((c) => [c.team as string, c]));
  const scrub = frames.map(toScrub);

  /* the ledger's seasons, each against its own published cap */
  const ledgerSeasons =
    ledger.state === 'blank' ? [] : [...new Set(ledger.value.flatMap((c) => seasonsOf(c.seasons)))];
  const caps = new Map(
    await Promise.all(ledgerSeasons.map(async (y) => [y, await getLeagueCap(y)] as const)),
  );

  const rows: LeaderboardViewRow[] = leaderboard.rows.map((r) => {
    const cash = spendCash.get(r.team);
    const cap = spendCap.get(r.team);
    const c = ctxBy.get(r.team);
    return {
      team: r.team,
      teamName: r.teamName,
      record: recordDash(r.wins, r.losses, r.ties),
      wins: r.wins,
      rank: r.rank,
      index: r.index,
      spend: {
        cash: cash ? value(cash.spend) : blank(NOT_TIER2),
        cap: cap ? value(cap.spend) : blank(NOT_TIER2),
      },
      perWin: { cash: ratioOf(cash), cap: ratioOf(cap) },
      delta:
        prior.deltas.get(r.team) ?? blank('Not available — this club has no earlier reading.'),
      href: `/team/${r.team.toLowerCase()}/${season}`,
      ctx:
        c && c.indices.state !== 'blank'
          ? {
              qbn: c.indices.value.qbNeutral,
              qbnRank: c.indices.value.qbNeutralRank,
              obl: c.indices.value.obligation,
              oblRank: c.indices.value.obligationRank,
              stratumRank: c.indices.value.stratumRank,
            }
          : null,
      rookie: c?.rookieWindow ?? null,
      qb: c?.startingQb ?? null,
    };
  });

  const indexName = leaderboard.capplusCovered ? 'Cap+' : 'Team Rating (performance only)';
  const divisionTeams = division.teams.map((t) => String(t.team));
  const strataLines =
    strata.state === 'blank'
      ? null
      : {
          rookie:
            strata.value.rookieWindow.state === 'blank'
              ? null
              : { n: strata.value.rookieWindow.value.n, mean: strata.value.rookieWindow.value.meanCapplus },
          veteran:
            strata.value.veteran.state === 'blank'
              ? null
              : { n: strata.value.veteran.value.n, mean: strata.value.veteran.value.meanCapplus },
        };

  return (
    <>
      {/* 1 — the division picker; only its pill row sticks */}
      <DivisionPicker
        selected={slug}
        options={DIVISION_SLUGS.map((d) => ({
          slug: d,
          name: divisionName(d),
          href: `/division/${d}`,
        }))}
      />

      <div className={entry.shareRow}>
        <ShareButton
          path={`/division/${slug}`}
          imageUrl={`/division/${slug}/opengraph-image`}
          fileName={`yieldyard-${slug}.png`}
        />
      </div>

      <LeagueLinkProvider initialSeason={season}>
        {/* 2 — THE RECEIPT, on one league-wide domain for the season. The
            SAMPLE chip is derived from the snapshot, never asserted. */}
        <Receipt
          title={division.name.toUpperCase()}
          wideTitle={`${division.name.toUpperCase()} — WHAT A WIN COSTS`}
          season={season}
          rows={{ cash: receiptRows(division), cap: receiptRows(divisionCap) }}
          leagueAvg={{ cash: avgCash, cap: avgCap }}
          league={{ cash: ratiosOf(spendCash), cap: ratiosOf(spendCap) }}
          sample={sample}
          coverage={receiptCoverage(season, division.teams.length)}
        />

        {/* 3 — the frontier: every club's wins against what it paid */}
        <Card ariaLabel="Wins against cash spent, all 32 clubs">
          <CardHeader eyebrow={`All 32 clubs · ${division.name} highlighted`} title="WINS VS. WHAT THEY COST" />
          <Frontier
            frames={scrub}
            latestSeason={season}
            focusDivision={slug}
            divisionName={division.name}
          />
          <ChartCaption>
            Each dot is a club: wins against the cash it paid its roster (not players released
            in-year), as a share of that season&apos;s cap. On the gold line a club paid the league
            price for a win; above it, wins came cheaper.
          </ChartCaption>
        </Card>

        {/* 4 — the league leaderboard, ALL 32 rows, the Field above it */}
        <Card ariaLabel={`${indexName} leaderboard`}>
          <CardHeader
            eyebrow={`League · ${season}`}
            title={leaderboard.capplusCovered ? 'CAP+ INDEX' : 'TEAM RATING'}
            right={
              <CsvExport
                title={`${indexName} leaderboard`}
                filename={`yieldyard_leaderboard_${season}.csv`}
                table={csvTable(
                  rows,
                  [
                    { key: 'rank', label: 'capplus_rank', get: (r) => r.rank },
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
                    { key: 'qbn', label: 'capplus_qb_neutral', get: (r) => (r.ctx ? r.ctx.qbn.toFixed(6) : '') },
                    {
                      key: 'obl',
                      label: 'capplus_obligation_CANDIDATE',
                      get: (r) => (r.ctx ? r.ctx.obl.toFixed(6) : ''),
                    },
                    { key: 'rookie', label: 'qb_rookie_window', get: (r) => (r.rookie === null ? '' : String(r.rookie)) },
                    { key: 'qb', label: 'starting_qb', get: (r) => r.qb ?? '' },
                    {
                      key: 'cash_spent',
                      label: 'cash_spent_usd',
                      get: (r) => (r.spend.cash.state === 'blank' ? '' : r.spend.cash.value),
                    },
                    {
                      key: 'cap_hit',
                      label: 'cap_hit_usd',
                      get: (r) => (r.spend.cap.state === 'blank' ? '' : r.spend.cap.value),
                    },
                    {
                      key: 'cpw_cash',
                      label: 'cost_per_win_cash_usd',
                      get: (r) => (r.perWin.cash.state === 'blank' ? '' : r.perWin.cash.value.toFixed(2)),
                    },
                    {
                      key: 'cpw_cap',
                      label: 'cost_per_win_cap_usd',
                      get: (r) => (r.perWin.cap.state === 'blank' ? '' : r.perWin.cap.value.toFixed(2)),
                    },
                    {
                      key: 'delta',
                      label: `delta_vs_${prior.priorSeason ?? 'prior'}`,
                      get: (r) => (r.delta.state === 'blank' ? '' : r.delta.value.toFixed(6)),
                    },
                  ],
                  [
                    `YIELD/YARD — ${indexName} leaderboard, ${season}`,
                    `source marts: ${leaderboard.capplusCovered ? 'capplus_official' : 'team_rating'}, capplus_context, team_season_results, team_season_cap`,
                    'coverage: all 32 clubs. 100 = league average. Contract, cap and cash coverage begins in 2013.',
                    'capplus_obligation is a CANDIDATE index (SPEC §2.10), published beside Cap+ only.',
                    'zero-win rule: a club with no wins carries its total spend and no ratio. The ratio is never Infinity, "N/A" or a blank.',
                    `league average cost per win (cash): ${
                      avgCash.state === 'blank' ? avgCash.reason : usdShort(avgCash.value)
                    }`,
                  ],
                )}
              />
            }
          />
          {/* `SPEC.md` §4 — one of the product's two field-literal surfaces.
              It sits ABOVE the row list and does not replace it. */}
          {leaderboard.capplusCovered ? (
            <LeagueField frames={scrub} latestSeason={season} focusDivision={slug} />
          ) : null}

          <CapPlusLeaderboard
            rows={rows}
            season={season}
            indexName={indexName}
            isCapPlus={leaderboard.capplusCovered}
            focusTeams={divisionTeams}
            leagueAvg={{
              cash: avgCash.state === 'blank' ? null : avgCash.value,
              cap: avgCap.state === 'blank' ? null : avgCap.value,
            }}
            priorSeason={prior.priorSeason}
            strata={strataLines}
            strataReason={strata.state === 'blank' ? strata.reason : undefined}
          />
        </Card>
      </LeagueLinkProvider>

      {/* 5 — largest dead-money charges */}
      <Card ariaLabel="Largest dead-money charges">
        <CardHeader
          eyebrow="From the ledger · share of that season's cap"
          title="LARGEST DEAD-MONEY CHARGES"
          right={
            /* `SPEC.md` §8.1 — CSV on EVERY tabular surface. */
            ledger.state === 'blank' ? undefined : (
              <CsvExport
                title="Largest dead-money charges"
                filename="yieldyard_deadmoney_ledger.csv"
                table={csvTable(ledger.value, [
                  { key: 'player', label: 'player', get: (c) => c.player },
                  { key: 'team', label: 'team', get: (c) => c.team },
                  { key: 'seasons', label: 'seasons', get: (c) => c.seasons },
                  { key: 'total_usd', label: 'total_usd', get: (c) => c.totalUsd },
                  { key: 'split', label: 'split_by_season', get: (c) => c.splitBySeason ?? '' },
                  { key: 'is_actual', label: 'is_actual', get: (c) => String(c.isActual) },
                  { key: 'verified', label: 'verified_asof', get: (c) => c.verifiedAsof },
                  { key: 'source', label: 'source_url', get: (c) => c.sourceUrl },
                  { key: 'notes', label: 'notes', get: (c) => c.notes ?? '' },
                ], [
                  'YIELD/YARD — largest dead-money charges',
                  'source mart: dead_money_ledger',
                  'Every charge carries the date it was verified and a link to its source.',
                  'Charges are never averaged, never summed across differently dated readings, and never split across seasons unless the split is published.',
                  'split_by_season is EMPTY where the per-season split has never been established — it is deliberately not inferred (Marcell Dareus / BUF).',
                ])}
              />
            )
          }
        />
        {ledger.state === 'blank' ? (
          <ChartCaption>{ledger.reason}</ChartCaption>
        ) : (
          <LedgerBoard rows={ledger.value} caps={caps} />
        )}
        <ChartCaption>
          Dead money is cap you still pay for players who are gone. Each charge leads as a share of
          that season&apos;s cap, which grew from $123M in 2013 to $279M in 2025. Every one carries
          a verified date and a source link, and none is averaged or split across seasons unless
          the split is published.
        </ChartCaption>
      </Card>

      {/* 6 — entry cards */}
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
                  <FranchiseSparkline series={kcSpark} label="Kansas City Chiefs" />
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
  Team: 'The full team season: history, the three money lenses, cap by position, dead money, coaching and the draft.',
  Player:
    'Contract terms, cap hit against cash by year, dead-money markers and availability. No value grade, ever.',
  'Head-to-head':
    'Two team-seasons, each scored against its own season’s league. That is why a 2007 team and a 2024 team can sit side by side.',
};
