import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import css from './team-page.module.css';
import {
  allTeamSeasons,
  divisionSlugForTeam,
  getDivisionPeers,
  getLeagueAvgCostPerWin,
  getTeamBundle,
  getTeamMetaMap,
  TIER2_FIRST_SEASON,
} from '@/lib/data';
import { mapMetric, type Metric } from '@/lib/metric';
import { eraIdentity, toAbbr } from '@/lib/teams';
import { teamMark } from '@/lib/marks';
import { recordDash } from '@/lib/display';
import { receiptCoverage, receiptRows } from '@/lib/view';
import {
  BoundaryMessage,
  Card,
  CardHeader,
  ChartCaption,
  Chip,
  KpiTile,
  MetricText,
} from '@/components/primitives';
import { TeamHeader, ThreeLens, DeadMoneyLedger, StatGrid } from '@/components/team/team-blocks';
import { Receipt } from '@/components/receipt/receipt';
import { FranchiseArc } from '@/components/charts/franchise-arc';
import { AllocationBars } from '@/components/charts/allocation-bars';
import { DeadMoneyDots } from '@/components/charts/dead-money-dots';
import { RegimeTimeline } from '@/components/charts/regime-timeline';
import { SeasonPicker, TeamPicker } from '@/components/pickers/team-season-picker';
import { CsvExport } from '@/components/csv-export';
import { csvTable } from '@/lib/csv';

/** `SPEC.md` §6 — `/team/{abbr}/{season}`, static, 861 pages. */
export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  const keys = await allTeamSeasons();
  return keys.map((k) => ({ abbr: k.team.toLowerCase(), season: String(k.season) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ abbr: string; season: string }>;
}): Promise<Metadata> {
  const { abbr, season } = await params;
  const team = toAbbr(abbr);
  if (!team) return {};
  const id = eraIdentity(team, Number(season));
  return {
    title: `${id.name} · ${season}`,
    description: `${id.name}, ${season}: what the club spent, what it got, and where the record stops.`,
  };
}

export default async function TeamSeasonPage({
  params,
}: {
  params: Promise<{ abbr: string; season: string }>;
}) {
  const { abbr, season: seasonRaw } = await params;
  const team = toAbbr(abbr);
  const season = Number(seasonRaw);
  if (!team || !Number.isInteger(season)) notFound();

  const b = await getTeamBundle(team, season);
  if (!b) notFound();

  const inTier2 = season >= TIER2_FIRST_SEASON;
  const slug = await divisionSlugForTeam(team);
  const meta = await getTeamMetaMap();

  const [peersCash, peersCap, avgCash, avgCap] = await Promise.all([
    slug ? getDivisionPeers(slug, season, 'cash') : Promise.resolve(null),
    slug ? getDivisionPeers(slug, season, 'cap') : Promise.resolve(null),
    getLeagueAvgCostPerWin(season, 'cash'),
    getLeagueAvgCostPerWin(season, 'cap'),
  ]);

  const results = b.results.state === 'value' ? b.results.value : null;
  const record = results ? recordDash(results.wins, results.losses, results.ties) : '';
  const divisionLabel = meta.get(team)?.division ?? '';
  const identityLine = [b.identity.location, divisionLabel, String(season), record]
    .filter(Boolean)
    .join(' · ');

  /** THE INDEX RULE, `COMPONENTS.md` §3: which index the header badge carries is
   *  decided by the SEASON, not by whether a value happens to exist. Inside
   *  Tier 2 a blanked season renders `CAP+ —` with its reason; before it, the
   *  badge is Team Rating and is never band-coloured. */
  const capplusIndex: Metric<number> = mapMetric(b.capplus, (c) => c.capplus);

  const teamOptions = [...meta.values()]
    .map((m) => ({
      abbr: m.abbr,
      name: eraIdentity(m.abbr, season).name,
      conference: m.conf,
      division: m.division.replace(/^(AFC|NFC)\s*/, ''),
    }))
    .sort((x, y) => x.name.localeCompare(y.name));

  const burden = b.deadMoney.burdenOfAdjustedCap;
  const dots = b.deadMoney.series.map((s) => ({
    season: s.season,
    // The burden denominator is published per team-season; where it is not, the
    // dot carries no y-position rather than an invented one.
    burden: s.season === season && burden !== null ? burden : null,
    usd: s.usd,
    asOfDate: s.asOf.date,
    asOfStage: s.asOf.stage,
  }));
  const anyBurden = dots.some((d) => d.burden !== null);

  return (
    <>
      {/* ── 1. HEADER ─────────────────────────────────────────────────────── */}
      <TeamHeader
        name={b.identity.name.toUpperCase()}
        identityLine={identityLine}
        mark={teamMark(b.team, b.identity.name)}
        capplus={capplusIndex}
        teamRating={b.teamRating}
        season={season}
        tier2FirstSeason={TIER2_FIRST_SEASON}
        backHref={slug ? `/division/${slug}` : '/'}
      />

      <div className={css.pickers}>
        <TeamPicker teams={teamOptions} team={team} hrefPattern={`/team/{abbr}/${season}`} />
        <SeasonPicker
          seasons={b.seasons}
          season={season}
          hrefPattern={`/team/${team.toLowerCase()}/{season}`}
        />
      </div>

      {/* ── the season at a glance ────────────────────────────────────────── */}
      <Card ariaLabel="Season results">
        <CardHeader eyebrow={`${b.identity.name} · ${season}`} title="THE SEASON" />
        <StatGrid>
          <KpiTile label="Record" value={record || '—'} />
          <KpiTile
            label="Point differential"
            value={
              results
                ? results.pointDiff > 0
                  ? `+${results.pointDiff}`
                  : String(results.pointDiff)
                : '—'
            }
          />
          <KpiTile
            label="EPA margin / play"
            value={
              <MetricText metric={b.epa} format={(e) => e.epaMarginPerPlay.toFixed(3)} inlineBlank />
            }
          />
          <KpiTile
            label={inTier2 ? 'Cap+' : 'Team rating'}
            value={
              <MetricText
                metric={inTier2 ? capplusIndex : b.teamRating}
                format={(v) => v.toFixed(1)}
                inlineBlank
              />
            }
            unit={inTier2 ? '100 = league average' : 'performance only'}
          />
        </StatGrid>
        {b.capplus.state === 'value' && b.capplus.provisional ? (
          <p className={css.chipRow}>
            <Chip kind="provisional" />
            <span className="yy-caption">{PROVISIONAL_NOTE}</span>
          </p>
        ) : null}
      </Card>

      {/* ── 2. THE 25-SEASON HISTORY ─────────────────────────────────────── */}
      <Card ariaLabel="Franchise history">
        <CardHeader
          eyebrow="1999–2025"
          title="THE FRANCHISE ARC"
          right={
            <CsvExport
              title="Franchise arc"
              filename={`yieldyard_history_${team.toLowerCase()}.csv`}
              table={csvTable(b.history.points, [
                { key: 'season', label: 'season', get: (p) => p.season },
                {
                  key: 'team_rating',
                  label: 'team_rating',
                  get: (p) => (p.teamRating.state === 'blank' ? '' : p.teamRating.value.toFixed(6)),
                },
                {
                  key: 'capplus',
                  label: 'capplus',
                  get: (p) => (p.capplus.state === 'blank' ? '' : p.capplus.value.toFixed(6)),
                },
                {
                  key: 'capplus_blank_reason',
                  label: 'capplus_blank_reason',
                  get: (p) => (p.capplus.state === 'blank' ? p.capplus.reason : ''),
                },
              ], [
                `YIELD/YARD — ${b.identity.name} franchise arc`,
                'source marts: team_rating, capplus_official',
                'coverage: Team Rating 1999-2025 (performance only). Cap+ 2014-2025; 2013, 2016, 2020 and 2021 are blanked whole-season.',
                'The two indices are never spliced: they are different metrics and the chart breaks at 2013.',
              ])}
            />
          }
        />
        <FranchiseArc
          points={b.history.points}
          team={b.identity.name}
          bridgeSentence={ARC_BRIDGE}
          coverage={{
            statement:
              'Team Rating covers 1999–2025. Cap+ covers 2014–2025; 2013, 2016, 2020 and 2021 have no league-wide dead-money table and are blanked whole-season.',
          }}
        />
      </Card>

      {/* ── 3. THE THREE LENSES ──────────────────────────────────────────── */}
      <Card ariaLabel="Spending, three ways">
        <CardHeader eyebrow="Never one number" title="THREE LENSES" />
        {inTier2 ? <ThreeLens lenses={b.lenses} /> : <BoundaryMessage season={season} />}
      </Card>

      {/* ── 4. ALLOCATION ────────────────────────────────────────────────── */}
      <Card ariaLabel="Allocation versus the league">
        <CardHeader
          eyebrow="Nine position groups"
          title="SPEND MIX vs LEAGUE"
          right={
            b.allocation.state === 'value' ? (
              <CsvExport
                title="Spend mix versus league"
                filename={`yieldyard_allocation_${team.toLowerCase()}_${season}.csv`}
                table={csvTable(b.allocation.value, [
                  { key: 'group', label: 'position_group', get: (a) => a.positionGroup },
                  { key: 'cap_usd', label: 'cap_usd', get: (a) => a.capUsd },
                  {
                    key: 'share',
                    label: 'share_of_rostered_cap',
                    get: (a) => a.shareOfRosteredCap.toFixed(6),
                  },
                  { key: 'league', label: 'league_share', get: (a) => a.leagueShare.toFixed(6) },
                  {
                    key: 'delta',
                    label: 'delta_vs_league',
                    get: (a) => a.deltaVsLeague.toFixed(6),
                  },
                ], [
                  `YIELD/YARD — ${b.identity.name} ${season} allocation`,
                  'source mart: position_allocation',
                  'Share of cap held by players on the roster - not share of cap. The denominator inherits the dead-money omission.',
                  'Position is as of the deal then in force.',
                ])}
              />
            ) : undefined
          }
        />
        {b.allocation.state === 'value' ? (
          <AllocationBars
            bars={b.allocation.value}
            coverage={{
              statement: `Nine position groups, ${season}, in a fixed order that never changes between clubs — which is what makes two clubs comparable.`,
            }}
          />
        ) : (
          <BoundaryMessage season={season} body={b.allocation.reason} />
        )}
      </Card>

      {/* ── 5. COST PER WIN — SUBJECT MODE ───────────────────────────────── */}
      {peersCash && peersCap && inTier2 ? (
        <Receipt
          title={`${b.team} vs ${peersCash.name.toUpperCase()}`}
          wideTitle={`${b.team} vs ${peersCash.name.toUpperCase()} — WHAT A WIN COST`}
          season={season}
          subject={team}
          rows={{ cash: receiptRows(peersCash), cap: receiptRows(peersCap) }}
          leagueAvg={{ cash: avgCash, cap: avgCap }}
          coverage={receiptCoverage(season, peersCash.teams.length)}
        />
      ) : (
        <Card ariaLabel="Cost per win">
          <CardHeader eyebrow={`Cost per win · ${season}`} title="WHAT A WIN COST" />
          <BoundaryMessage season={season} />
        </Card>
      )}

      {/* ── 6. COACHING STABILITY + REGIME TIMELINE ──────────────────────── */}
      <Card ariaLabel="Coaching stability and regimes">
        <CardHeader eyebrow="Continuity" title="COACHING & REGIMES" />
        <StatGrid>
          <KpiTile
            label="Stability index"
            value={
              <MetricText metric={b.stability} format={(s) => s.stabilityIndex.toFixed(0)} inlineBlank />
            }
          />
          <KpiTile
            label="Head coach"
            value={<MetricText metric={b.stability} format={(s) => s.hc} inlineBlank />}
          />
          <KpiTile
            label="Season of regime"
            value={
              <MetricText metric={b.stability} format={(s) => String(s.regimeSeasonN)} inlineBlank />
            }
          />
          <KpiTile
            label="Churn points"
            value={
              <MetricText metric={b.stability} format={(s) => s.churnPoints.toFixed(1)} inlineBlank />
            }
          />
        </StatGrid>
        <RegimeTimeline
          track={b.stabilityTrack}
          regimes={b.regimes}
          team={b.identity.name}
          currentSeason={season}
          coverage={{
            statement:
              'The coaching record begins in 2000; Houston enters in 2002. A dead-money reading after a regime change exists only where a league-wide table was published that year.',
          }}
        />
      </Card>

      {/* ── 7. DEAD MONEY ────────────────────────────────────────────────── */}
      <Card ariaLabel="Dead money">
        <CardHeader
          eyebrow="Dated readings, never a trend"
          title="DEAD MONEY"
          right={
            b.deadMoney.series.length ? (
              <CsvExport
                title="Dead money"
                filename={`yieldyard_deadmoney_${team.toLowerCase()}.csv`}
                table={csvTable(b.deadMoney.series, [
                  { key: 'season', label: 'season', get: (s) => s.season },
                  { key: 'usd', label: 'dead_money_usd', get: (s) => s.usd },
                  { key: 'asof_date', label: 'asof_date', get: (s) => s.asOf.date },
                  { key: 'asof_stage', label: 'asof_stage', get: (s) => s.asOf.stage },
                  { key: 'coverage', label: 'coverage', get: (s) => s.coverage },
                  { key: 'source', label: 'source_url', get: (s) => s.sourceUrl },
                ], [
                  `YIELD/YARD — ${b.identity.name} dead-money readings`,
                  'source mart: dead_money_team_season',
                  'Each row is a separate dated press snapshot. Readings are NEVER averaged, merged or connected across seasons.',
                  'Same-season drift is real: CHI 2022 read $57.6M preseason and $91.8M final.',
                ])}
              />
            ) : undefined
          }
        />
        {b.deadMoney.series.length && anyBurden ? (
          <DeadMoneyDots
            team={b.identity.name}
            points={dots}
            seasons={b.history.points.map((p) => p.season)}
            coverage={{
              statement:
                'Readings exist only for seasons in which a league-wide table was published. 2013, 2016, 2020 and 2021 have none, and the burden denominator is published per team-season — where it is not, the reading carries no position on this axis.',
            }}
          />
        ) : null}

        <div className={css.ledgerBlock}>
          <p className="yy-label">This season</p>
          {inTier2 ? (
            <ThreeLens lenses={b.lenses.filter((l) => l.key === 'dead_money')} />
          ) : (
            <BoundaryMessage season={season} />
          )}
        </div>

        <div className={css.ledgerBlock}>
          <p className="yy-label">Marquee charges from the ledger</p>
          <DeadMoneyLedger rows={b.deadMoney.ledger.map((r) => ({ ...r, team: b.team }))} />
        </div>
      </Card>

      {/* ── 8. DRAFT ROI ─────────────────────────────────────────────────── */}
      <Card ariaLabel="Draft class">
        <CardHeader eyebrow={`${season} class`} title="DRAFT CAPITAL & RETURN" />
        {b.draft.summary.state === 'value' ? (
          <>
            <StatGrid>
              <KpiTile label="Picks" value={String(b.draft.summary.value.nPicks)} />
              <KpiTile
                label="Capital"
                value={b.draft.summary.value.capital.toFixed(1)}
                unit={`rank ${b.draft.summary.value.capitalRank}`}
              />
              <KpiTile
                label="Return · games"
                value={b.draft.summary.value.returnGames?.toFixed(0) ?? '—'}
              />
              <KpiTile
                label="Return · wAV"
                value={b.draft.summary.value.returnWAv?.toFixed(0) ?? '—'}
              />
            </StatGrid>
            <ChartCaption>
              Capital and realised return are Tier 1 and run the full record. Any framing of a draft
              class in DOLLARS is Tier 2 and renders only for 2013 onward:{' '}
              {b.draft.dollarFraming.state === 'blank'
                ? b.draft.dollarFraming.reason
                : 'available for this class.'}
            </ChartCaption>
          </>
        ) : (
          <BoundaryMessage season={season} body={b.draft.summary.reason} />
        )}
      </Card>

      <ChartCaption>
        Franchise continuity is preserved, geography is not: {b.identity.name} is the identity this
        franchise carried in {season}, and the route key is the current one.
      </ChartCaption>
    </>
  );
}

const PROVISIONAL_NOTE =
  'This season’s Cap+ was published before the league year opened; it understates the final figure.';

const ARC_BRIDGE =
  'Two metrics are plotted. Team Rating (1999–2025) scores performance only. Cap+ (2014–2025) ' +
  'scores wins produced per dollar. They are shown together on the overlap so you can see where ' +
  'they disagree — not because they measure the same thing.';
