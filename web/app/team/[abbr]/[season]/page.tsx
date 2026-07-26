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
  getTeamRating,
  TIER2_FIRST_SEASON,
} from '@/lib/data';
import {
  DEAD_MONEY_DEFINITION,
  DEAD_MONEY_DEFINITION_CREDIT,
  DRAFT_CHART_NAME,
  DRAFT_CHART_URL,
  mapMetric,
  type Metric,
} from '@/lib/metric';
import { eraIdentity, toAbbr } from '@/lib/teams';
import { teamMark } from '@/lib/marks';
import { recordDash, usdShort } from '@/lib/display';
import type { DeadMoneySnapshot, LedgerRow } from '@/lib/data/team';
import { receiptCoverage, receiptRows } from '@/lib/view';
import {
  AsOf,
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
import { TeamDrive } from '@/components/field/team-drive';
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

  const [peersCash, peersCap, avgCash, avgCap, ratingRow, allKeys] = await Promise.all([
    slug ? getDivisionPeers(slug, season, 'cash') : Promise.resolve(null),
    slug ? getDivisionPeers(slug, season, 'cap') : Promise.resolve(null),
    getLeagueAvgCostPerWin(season, 'cash'),
    getLeagueAvgCostPerWin(season, 'cap'),
    getTeamRating(season, team),
    allTeamSeasons(),
  ]);

  /**
   * THE RANK DENOMINATOR IS COUNTED, NOT ASSUMED. Both marts publish
   * `season_rank`; neither publishes what it was ranked out of, and the league
   * was 31 clubs in 1999–2001. `allTeamSeasons()` is memoised per process, so
   * this is a filter over an array the build already holds.
   */
  const fieldSize = allKeys.filter((k) => k.season === season).length;
  const capplusRank =
    b.capplus.state === 'value' ? { rank: b.capplus.value.seasonRank, of: fieldSize } : null;
  const teamRatingRank =
    ratingRow.state === 'value' ? { rank: ratingRow.value.seasonRank, of: fieldSize } : null;
  /** The last season the record holds — what makes 2026 "not yet played". */
  const lastRecordedSeason = allKeys.length
    ? allKeys.reduce((n, k) => (k.season > n ? k.season : n), 0)
    : season;

  /**
   * THE ARC'S OWN SPAN, read off the points it is given rather than asserted.
   * Houston enters in 2002, so a hardcoded "1999–2025" is false on one of the
   * 32 team pages — and the three coverage statements on this card (the bridge,
   * the coverage line and the CSV header) have to agree with each other and
   * with what is drawn.
   */
  const arcFirst = b.history.points[0]?.season ?? TIER2_FIRST_SEASON;
  const arcLast = b.history.points[b.history.points.length - 1]?.season ?? season;
  const arcSpan = `${arcFirst}–${arcLast}`;

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

  /**
   * EVERY dated reading this franchise has, each with ITS OWN published burden.
   * `dead_money_display` carries `burden_of_adjusted_cap` on every row, so the
   * only legitimate `null` here is a row whose mart column is genuinely empty —
   * and the coverage sentence below only claims otherwise when one exists.
   */
  const dots = b.deadMoney.series.map((s) => ({
    season: s.season,
    burden: s.burdenOfAdjustedCap,
    usd: s.usd,
    asOfDate: s.asOf.date,
    asOfStage: s.asOf.stage,
    leadersOnly: s.seasonCoverage === 'leaders_only',
  }));
  const anyBurden = dots.some((d) => d.burden !== null);
  const missingBurden = dots.filter((d) => d.burden === null).length;

  const dotCoverage = [
    'Readings exist only for seasons in which a league-wide table or a published leaders list named this club.',
    b.deadMoney.emptyBlankSeasons.length
      ? `${listSeasons(b.deadMoney.emptyBlankSeasons)} carry neither and are drawn as empty rings on the baseline.`
      : '',
    missingBurden
      ? `${missingBurden} reading${missingBurden === 1 ? '' : 's'} carry no published burden denominator and therefore take no position on this axis.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {/* ── 1. HEADER ─────────────────────────────────────────────────────── */}
      <TeamHeader
        name={b.identity.name.toUpperCase()}
        identityLine={identityLine}
        mark={teamMark(b.team, b.identity.name)}
        capplus={capplusIndex}
        capplusRank={capplusRank}
        teamRating={b.teamRating}
        teamRatingRank={teamRatingRank}
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
          {/* Team Rating exists for all 861 team-seasons. On a blanked Cap+
              season it is the reading the page still has, and dropping it left
              these 128 pages with no index at all. */}
          {inTier2 && capplusIndex.state === 'blank' ? (
            <KpiTile
              label="Team rating"
              value={<MetricText metric={b.teamRating} format={(v) => v.toFixed(1)} inlineBlank />}
              unit="performance only"
            />
          ) : null}
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
          eyebrow={arcSpan}
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
                `coverage: Team Rating ${arcFirst}-${arcLast} (performance only), every season, no gap. Cap+ 2014-2025; 2013, 2016, 2020 and 2021 are blanked whole-season.`,
                'The two indices are never spliced: they are different metrics and the chart breaks at 2013. The 2013 Team Rating reading exists and is plotted as an unconnected point; no path crosses the break.',
              ])}
            />
          }
        />
        <FranchiseArc
          points={b.history.points}
          team={b.identity.name}
          bridgeSentence={arcBridge(arcSpan)}
          coverage={{
            statement:
              `Team Rating covers every season this franchise played, ${arcSpan}, with no gap — including 2013, whose reading is plotted as a single unconnected point because no path crosses the tier rule. ` +
              'Cap+ covers 2014–2025; 2013, 2016, 2020 and 2021 have no league-wide dead-money table and are blanked whole-season.',
          }}
        />
      </Card>

      {/* ── 2b. THE DRIVE — the second field-literal surface (`SPEC.md` §4) ── */}
      <Card ariaLabel="Cap+ as field position">
        <CardHeader eyebrow="The same number, read as ground" title="THE DRIVE" />
        <TeamDrive
          points={b.history.points}
          team={b.identity.name}
          coverage={{
            statement:
              'Cap+ covers 2014–2025; 2013, 2016, 2020 and 2021 have no league-wide dead-money table and are blanked whole-season. Nothing is clipped: the field runs Cap+ 50 to 150, which contains every value in the record.',
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
          lastRecordedSeason={lastRecordedSeason}
          coverage={{
            statement:
              `The coaching record begins in 2000; Houston enters in 2002. A dead-money reading after a regime change exists only where a league-wide table was published that year — and a change in ${lastRecordedSeason} points at seasons the record does not reach yet, which is a different absence and is labelled as one.`,
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
                  {
                    key: 'season_coverage',
                    label: 'season_coverage',
                    get: (s) => s.seasonCoverage ?? '',
                  },
                  {
                    key: 'burden',
                    label: 'burden_of_adjusted_cap',
                    get: (s) => (s.burdenOfAdjustedCap === null ? '' : s.burdenOfAdjustedCap.toFixed(6)),
                  },
                  {
                    key: 'median',
                    label: 'league_median_usd',
                    get: (s) => s.leagueMedianUsd ?? '',
                  },
                  { key: 'source', label: 'source_url', get: (s) => s.sourceUrl },
                ], [
                  `YIELD/YARD — ${b.identity.name} dead-money readings`,
                  'source mart: dead_money_display (the pinned per-team-season resolution)',
                  'Each row is a separate dated press snapshot. Readings are NEVER averaged, merged or connected across seasons.',
                  'season_coverage=leaders_only means a published leaders list, not a 32-team table.',
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
            blankSeasons={b.deadMoney.emptyBlankSeasons}
            coverage={{ statement: dotCoverage }}
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

        {/* `SPEC.md` §7.5 — where more than one dated reading exists for this
            (season, team) the UI picks ONE by the pinned rule and shows the
            others as alternate readings. They are never averaged and never
            merged: CHI 2022 reads $57.6M preseason and $91.8M final, and both
            are true of the dates they carry. */}
        <AlternateReadings
          alternates={b.deadMoney.alternates}
          resolved={b.deadMoney.resolved}
          season={season}
        />

        {/* `SPEC.md` §2.1 — the definition renders in BOTH places it is
            specified: the methodology page and this card's info panel, quoted
            verbatim with its credit. */}
        <div className={css.ledgerBlock}>
          <p className="yy-label">What a dead-money charge is</p>
          <blockquote className={css.definition}>
            <p className="yy-caption">{DEAD_MONEY_DEFINITION}</p>
            <p className={`yy-label ${css.definitionCredit}`}>
              — {DEAD_MONEY_DEFINITION_CREDIT}
            </p>
          </blockquote>
        </div>

        <div className={css.ledgerBlock}>
          <div className={css.ledgerHead}>
            <p className="yy-label">Marquee charges from the ledger</p>
            {b.deadMoney.ledger.length ? (
              <CsvExport
                title="Marquee dead-money charges"
                filename={`yieldyard_deadmoney_ledger_${team.toLowerCase()}.csv`}
                table={csvTable(b.deadMoney.ledger, LEDGER_COLUMNS, [
                  `YIELD/YARD — ${b.identity.name} marquee dead-money charges`,
                  'source mart: dead_money_ledger',
                  'Every charge carries the date it was verified and a link to its source.',
                  'split_by_season is EMPTY where the per-season split has never been published — it is deliberately not inferred (Marcell Dareus / BUF).',
                ])}
              />
            ) : null}
          </div>
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
            {/* `SPEC.md` §2.9 — the excluded count is printed on the card,
                because capital counts every pick while return counts only the
                picks that carry a gsis_id to join on. Two figures beside one
                another over different pick sets, unlabelled, is the thing this
                line exists to prevent. */}
            {b.draft.summary.value.nExcludedNoGsis > 0 ? (
              <ChartCaption>
                Return is measured over{' '}
                {b.draft.summary.value.nPicks - b.draft.summary.value.nExcludedNoGsis} of{' '}
                {b.draft.summary.value.nPicks} picks: {b.draft.summary.value.nExcludedNoGsis} carr
                {b.draft.summary.value.nExcludedNoGsis === 1 ? 'ies' : 'y'} no gsis_id and{' '}
                {b.draft.summary.value.nExcludedNoGsis === 1 ? 'is' : 'are'} excluded from the return
                join. They remain in the capital total.
              </ChartCaption>
            ) : null}
            <ChartCaption>
              Capital and realised return are Tier 1 and run the full record. Any framing of a draft
              class in DOLLARS is Tier 2 and renders only for 2013 onward.{' '}
              {b.draft.dollarFraming.state === 'blank'
                ? b.draft.dollarFraming.reason
                : 'It is available for this class but is not yet surfaced on this card.'}
            </ChartCaption>
            {/* §2.9 — the chart is cited where its unit is printed. */}
            <ChartCaption>
              Capital is the summed pick value from the{' '}
              <a href={DRAFT_CHART_URL} rel="noopener noreferrer" target="_blank">
                {DRAFT_CHART_NAME}
              </a>
              , published at Over The Cap. It is used in preference to the Jimmy Johnson chart
              because its units are dollars of surplus value against rookie-contract cost — the same
              units as the rest of this product — rather than a 1990s trade-negotiation heuristic
              never calibrated to on-field outcome.
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

/** `1999`, `1999 and 2001`, `1999, 2001 and 2004`. */
function listSeasons(seasons: number[]): string {
  if (!seasons.length) return '';
  if (seasons.length === 1) return String(seasons[0]);
  return `${seasons.slice(0, -1).join(', ')} and ${seasons[seasons.length - 1]}`;
}

const LEDGER_COLUMNS = [
  { key: 'player', label: 'player', get: (r: LedgerRow) => r.player },
  { key: 'seasons', label: 'seasons', get: (r: LedgerRow) => r.seasons },
  { key: 'total_usd', label: 'total_usd', get: (r: LedgerRow) => r.totalUsd },
  { key: 'split', label: 'split_by_season', get: (r: LedgerRow) => r.splitBySeason ?? '' },
  { key: 'is_actual', label: 'is_actual', get: (r: LedgerRow) => String(r.isActual) },
  { key: 'verified', label: 'verified_asof', get: (r: LedgerRow) => r.verifiedAsof },
  { key: 'source', label: 'source_url', get: (r: LedgerRow) => r.sourceUrl },
  { key: 'notes', label: 'notes', get: (r: LedgerRow) => r.notes ?? '' },
];

/**
 * `SPEC.md` §7.5 — the other dated readings for this (season, team). Shown ON
 * REQUEST, each with its own value, date, stage and coverage class, under the
 * resolution rule that picked the one above. **Never averaged, never merged.**
 */
function AlternateReadings({
  alternates,
  resolved,
  season,
}: {
  alternates: DeadMoneySnapshot[];
  resolved: Metric<DeadMoneySnapshot>;
  season: number;
}) {
  if (!alternates.length) return null;
  const chosen = resolved.state === 'blank' ? null : resolved.value;

  return (
    <details className={css.alternates}>
      <summary className={`yy-label ${css.alternatesSummary}`}>
        {alternates.length} other dated reading{alternates.length === 1 ? '' : 's'} published for{' '}
        {season}
      </summary>
      <ul className={css.alternatesList}>
        {alternates.map((a) => (
          <li key={`${a.asOf.date}-${a.usd}`} className={css.alternatesItem}>
            <AsOf value={usdShort(a.usd)} date={a.asOf.date} stage={a.asOf.stage} />
            <span className={`yy-label ${css.alternatesMeta}`}>
              {a.coverage === 'full32' ? 'All 32 clubs' : `${a.coverage} coverage`}
            </span>
            {a.note ? <span className="yy-caption">{a.note}</span> : null}
          </li>
        ))}
      </ul>
      <p className="yy-caption">
        {chosen
          ? `The figure above (${usdShort(chosen.usd)}, ${chosen.asOf.date}) is the one the pinned resolution selected: broadest coverage class first, then the latest as-of date. `
          : ''}
        Readings are never averaged and never merged. Each is true of the date it carries, and
        same-season drift is real — a preseason table and a season-final one are different
        measurements, not a disagreement to be split.
      </p>
    </details>
  );
}

const PROVISIONAL_NOTE =
  'This season’s Cap+ was published before the league year opened; it understates the final figure.';

/**
 * The bridge sentence takes the arc's OWN span so it cannot disagree with the
 * coverage line beside it or with the seasons actually drawn (Houston enters in
 * 2002). `COMPONENTS.md` §4.4 — always present, never a tooltip.
 */
const arcBridge = (span: string) =>
  `Two metrics are plotted. Team Rating (${span}) scores performance only. Cap+ (2014–2025) ` +
  'scores wins produced per dollar. They are shown together on the overlap so you can see where ' +
  'they disagree — not because they measure the same thing.';
