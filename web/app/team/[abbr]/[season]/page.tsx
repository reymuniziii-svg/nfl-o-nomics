import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import css from './team-page.module.css';
import {
  allTeamSeasons,
  divisionSlugForTeam,
  getCapPlusContext,
  getDivisionPeers,
  getDraftLeagueMedians,
  getFranchiseSeasonFacts,
  getLeagueAvgCostPerWin,
  getLeagueContext,
  getLeagueSpend,
  getQbWindowSeries,
  getRosterReceipt,
  getSeasonInputRanks,
  getStrataSummary,
  getTeamBundle,
  getTeamMetaMap,
  TIER2_FIRST_SEASON,
} from '@/lib/data';
import {
  BLANK_REASON,
  BRIDGE_SENTENCE,
  DEAD_MONEY_DEFINITION,
  DEAD_MONEY_DEFINITION_CREDIT,
  DRAFT_CHART_NAME,
  DRAFT_CHART_URL,
  blank,
  mapMetric,
  value,
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
import { VerdictStrip } from '@/components/team/verdict-strip';
import { FinePrint } from '@/components/team/fine-print';
import { ordinal, vsLeague } from '@/components/team/format';
import { Receipt } from '@/components/receipt/receipt';
import { RosterReceipt } from '@/components/receipt/roster-receipt';
import { ShareButton } from '@/components/share/share-button';
import { FranchiseArc, type ArcSeasonDetail } from '@/components/charts/franchise-arc';
import { INDEX_DOMAIN } from '@/components/charts/chart-kit';
import { AllocationBars } from '@/components/charts/allocation-bars';
import { DeadMoneyDots } from '@/components/charts/dead-money-dots';
import { RegimeTimeline } from '@/components/charts/regime-timeline';
import { CapPlusContextBody } from '@/components/context/capplus-context-card';
import {
  SeasonPicker,
  SeasonStepper,
  TeamPicker,
} from '@/components/pickers/team-season-picker';
import { CsvExport } from '@/components/csv-export';
import { csvTable } from '@/lib/csv';
import { getLiveTeam, isLiveTeamSeason, liveTeamKeys } from '@/lib/data/live';
import { teamOgImage } from '@/lib/og';
import { LiveTeamSeasonPage } from './live-team-page';
import live from '@/components/live/live.module.css';
import { LiveChip } from '@/components/live/live-marks';

/**
 * `SPEC.md` §6 — `/team/{abbr}/{season}`, static: the 861 final team-seasons
 * plus the 32 live 2026 pages (§7.14), which render the slim live variant.
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  const [keys, liveKeys] = await Promise.all([allTeamSeasons(), liveTeamKeys()]);
  return [...keys, ...liveKeys].map((k) => ({ abbr: k.team.toLowerCase(), season: String(k.season) }));
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
  const path = `/team/${abbr.toLowerCase()}/${season}`;
  if (await isLiveTeamSeason(team, Number(season))) {
    const lt = await getLiveTeam(team);
    const week = lt?.status.week ?? 0;
    const t = `${id.name} · ${season} · week ${week}, live`;
    const d = `${id.name}, ${season} as of week ${week}${lt?.status.date ? ` (through ${lt.status.date})` : ''}: record, games played and Team Rating, live. No verdict until the season is final.`;
    // `?wk=` versions the card so feeds refetch it each week.
    const image = teamOgImage(abbr, season, week);
    return {
      title: t,
      description: d,
      alternates: { canonical: path },
      openGraph: { type: 'article', url: path, title: t, description: d, images: [image] },
      twitter: { title: t, images: [image] },
    };
  }
  const description = `${id.name}, ${season}: what the club spent, what it got, and what the numbers can't see.`;
  const image = teamOgImage(abbr, season);
  return {
    title: `${id.name} · ${season}`,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'article',
      url: path,
      title: `${id.name} · ${season} — the receipt`,
      description,
      images: [image],
    },
    twitter: { title: `${id.name} · ${season} — the receipt`, images: [image] },
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

  // The live season renders the slim variant and nothing else (DECISIONS 116).
  if (await isLiveTeamSeason(team, season)) {
    return <LiveTeamSeasonPage team={team} />;
  }

  const b = await getTeamBundle(team, season);
  if (!b) notFound();
  // The live season's one mark for the arc, and the forward link from the
  // last final season. Read through live.ts only; never merged into a series.
  const liveTeam = await getLiveTeam(team);
  const liveRow = liveTeam?.row ?? null;
  const liveRating = liveRow && liveRow.rating.state !== 'blank' ? liveRow.rating.value : null;
  const latestFinal = Math.max(...b.seasons);

  const inTier2 = season >= TIER2_FIRST_SEASON;
  const slug = await divisionSlugForTeam(team);
  const meta = await getTeamMetaMap();

  const [peersCash, peersCap, avgCash, avgCap] = await Promise.all([
    slug ? getDivisionPeers(slug, season, 'cash') : Promise.resolve(null),
    slug ? getDivisionPeers(slug, season, 'cap') : Promise.resolve(null),
    getLeagueAvgCostPerWin(season, 'cash'),
    getLeagueAvgCostPerWin(season, 'cap'),
  ]);
  const [leagueSpend, inputRanks, context, qbSeries, strata, leagueContext, facts, draftMedians, rosterReceipt] =
    await Promise.all([
      getLeagueSpend(season, 'cash'),
      getSeasonInputRanks(season, team),
      getCapPlusContext(season, team),
      getQbWindowSeries(team),
      getStrataSummary(season),
      getLeagueContext(season),
      getFranchiseSeasonFacts(team),
      getDraftLeagueMedians(season),
      getRosterReceipt(season, team),
    ]);

  /* League rank by cash per win, cheapest = 1st. Zero-win clubs have no ratio
     and are excluded from the ordering, never sorted to an end (§2.5). */
  const ratios = [...leagueSpend.values()]
    .map((r) => r.perWin)
    .filter((v): v is number => v !== null);
  const mine = leagueSpend.get(team)?.perWin ?? null;
  const cpwRank =
    mine === null || !ratios.length
      ? null
      : { rank: 1 + ratios.filter((v) => v < mine).length, n: ratios.length };

  const ctxIndices = context.state === 'blank' ? null : context.value.indices;
  const qbTimingPts = ctxIndices && ctxIndices.state !== 'blank' ? ctxIndices.value.qbTimingPts : null;

  /* The arc's inspection readout: record, cash per win against the league, and
     Cap+ rank — each formatted here, on the server, from mart rows. */
  const rankBySeason = new Map<number, number>();
  if (qbSeries.state !== 'blank') {
    for (const r of qbSeries.value) {
      if (r.indices.state !== 'blank') rankBySeason.set(r.season, r.indices.value.capplusRank);
    }
  }
  const arcDetails: ArcSeasonDetail[] = facts.map((f) => {
    let perWin: Metric<string>;
    if (f.cashSpend.state === 'blank') perWin = blank(f.cashSpend.reason);
    else if (f.wins === 0) perWin = value(`${usdShort(f.cashSpend.value)} spent · 0 wins`);
    else {
      const pw = f.cashSpend.value / f.wins;
      const lg = f.leagueCashPerWin.state === 'blank' ? null : f.leagueCashPerWin.value;
      perWin = value(`${usdShort(pw)} per win, cash${lg ? ` · ${vsLeague(pw, lg)}` : ''}`);
    }
    return {
      season: f.season,
      record: recordDash(f.wins, f.losses, f.ties),
      perWin,
      capplusRank: rankBySeason.get(f.season) ?? null,
    };
  });
  const offWindow = b.history.points.filter(
    (p) =>
      (p.capplus.state !== 'blank' && (p.capplus.value > INDEX_DOMAIN[1] || p.capplus.value < INDEX_DOMAIN[0])) ||
      (p.teamRating.state !== 'blank' &&
        (p.teamRating.value > INDEX_DOMAIN[1] || p.teamRating.value < INDEX_DOMAIN[0])),
  ).length;
  const abbrLower = team.toLowerCase();

  const results = b.results.state === 'value' ? b.results.value : null;
  const record = results ? recordDash(results.wins, results.losses, results.ties) : '';
  const divisionLabel = meta.get(team)?.division ?? '';
  const identityLine = [b.identity.location, divisionLabel, String(season), record]
    .filter(Boolean)
    .join(' · ');

  /** THE INDEX RULE, `COMPONENTS.md` §3: which index the header badge carries is
   *  decided by the SEASON, not by whether a value happens to exist. Inside
   *  Tier 2 a blanked season renders `CAP+ —` with its reason; before it, the
   *  badge is Team Rating and is never band-colored. */
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
    range: s.isModeled && s.loUsd !== null && s.hiUsd !== null ? { lo: s.loUsd, hi: s.hiUsd } : null,
  }));
  const anyBurden = dots.some((d) => d.burden !== null);
  const missingBurden = dots.filter((d) => d.burden === null).length;

  const dotCoverage = [
    b.deadMoney.series.some((s) => s.isModeled)
      ? 'A reading is published wherever a league-wide table or a list named this club; in an estimated season a club nobody published is modeled.'
      : 'A reading exists only where a league-wide table or a published leaders list named this club.',
    b.deadMoney.emptyBlankSeasons.length
      ? `${listSeasons(b.deadMoney.emptyBlankSeasons)} have neither and show as empty rings on the baseline.`
      : '',
    missingBurden
      ? `${missingBurden} reading${missingBurden === 1 ? '' : 's'} can't be placed on this axis: no published adjusted cap to measure it against.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {/* ── 1. HEADER — with time navigation and share ────────────────────── */}
      <TeamHeader
        name={b.identity.name.toUpperCase()}
        identityLine={identityLine}
        mark={teamMark(b.team, b.identity.name)}
        capplus={capplusIndex}
        teamRating={b.teamRating}
        season={season}
        tier2FirstSeason={TIER2_FIRST_SEASON}
        backHref={slug ? `/division/${slug}` : '/'}
        stepper={
          <SeasonStepper seasons={b.seasons} season={season} hrefPattern={`/team/${abbrLower}/{season}`} />
        }
        actions={
          <ShareButton
            path={`/team/${abbrLower}/${season}`}
            imageUrl={`/team/${abbrLower}/${season}/opengraph-image`}
            fileName={`yieldyard-${abbrLower}-${season}.png`}
          />
        }
      />

      <div className={css.pickers}>
        <TeamPicker teams={teamOptions} team={team} hrefPattern={`/team/{abbr}/${season}`} />
        <SeasonPicker seasons={b.seasons} season={season} hrefPattern={`/team/${abbrLower}/{season}`} />
        {liveTeam && liveRow && season === latestFinal ? (
          <a className={`yy-label ${live.forward}`} href={`/team/${abbrLower}/${liveTeam.status.season}`}>
            <LiveChip reason={liveRow.badgeReason} />
            {liveTeam.status.season} · week {liveTeam.status.week} live →
          </a>
        ) : null}
      </div>

      {/* ── 2. THE VERDICT — the page's question, answered first (review D #1) ── */}
      <Card ariaLabel="Was it worth it">
        <CardHeader eyebrow={`${b.identity.name} · ${season}`} title="WAS IT WORTH IT?" />
        <VerdictStrip
          teamName={b.identity.name}
          season={season}
          inTier2={inTier2}
          results={b.results}
          epa={b.epa}
          cashPerWin={b.costPerWin}
          leagueCashPerWin={avgCash}
          cpwRank={cpwRank}
          capplus={b.capplus}
          teamRating={b.teamRating}
          inputRanks={inputRanks}
          qbTimingPts={qbTimingPts}
        />
      </Card>

      {/* ── 3. THE ROSTER RECEIPT — the itemized bill, beside the verdict ── */}
      {inTier2 ? (
        <Card ariaLabel="Roster receipt">
          <CardHeader eyebrow={`The itemized bill · ${season}`} title="ROSTER RECEIPT" />
          <div className={css.receiptPaper}>
            <RosterReceipt receipt={rosterReceipt} size="column" fallbackTitle={`${b.identity.name} · ${season}`} />
          </div>
        </Card>
      ) : null}

      {/* ── 4. COST PER WIN — SUBJECT MODE, straight after the bill ──────────── */}
      {peersCash && peersCap && inTier2 ? (
        <div className={css.receiptWrap}>
          <Receipt
            title={`${b.team} vs ${peersCash.name.toUpperCase()}`}
            wideTitle={`${b.team} vs ${peersCash.name.toUpperCase()} — WHAT A WIN COST`}
            season={season}
            subject={team}
            rows={{ cash: receiptRows(peersCash), cap: receiptRows(peersCap) }}
            leagueAvg={{ cash: avgCash, cap: avgCap }}
            coverage={receiptCoverage(season, peersCash.teams.length)}
          />
          {/* RESOLUTIONS Q1 — one meaning per surface, and the surface says
              which. On `/` lime means cheaper than the league; here it means
              this club, whatever it paid. */}
          <p className={`yy-caption ${css.limeNote}`}>
            <span className={css.limeKey} aria-hidden="true" />
            Lime marks {b.identity.name} on this card, whatever it paid. On the league and division
            pages, lime means cheaper than average. Here, read cheap or dear against the gold league
            line.
          </p>
        </div>
      ) : (
        <Card ariaLabel="Cost per win">
          <CardHeader eyebrow={`Cost per win · ${season}`} title="WHAT A WIN COST" />
          <BoundaryMessage season={season} />
        </Card>
      )}

      {/* ── 5. WHAT CAP+ CAN'T SEE — the gate #1 reopen (SPEC §2.10) ─────── */}
      <Card ariaLabel="What Cap+ can't see">
        <CardHeader eyebrow="QB contract · future cap" title="WHAT CAP+ CAN’T SEE" />
        <CapPlusContextBody
          context={context}
          series={qbSeries}
          strata={strata}
          league={leagueContext}
          season={season}
          teamName={b.identity.name}
        />
      </Card>

      {/* ── 6. THE 25-SEASON HISTORY — with the Drive folded in ──────────── */}
      <Card ariaLabel="Franchise history">
        <CardHeader
          eyebrow={`1999–2025 · ${season} marked`}
          title="THE FRANCHISE ARC"
          right={
            <CsvExport
              title="Franchise arc"
              filename={`yieldyard_history_${abbrLower}.csv`}
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
                  key: 'capplus_badge',
                  label: 'capplus_badge',
                  get: (p) => (p.capplus.state === 'value' ? (p.capplus.badge ?? '') : ''),
                },
                {
                  key: 'capplus_badge_reason',
                  label: 'capplus_badge_reason',
                  get: (p) => (p.capplus.state === 'value' ? (p.capplus.badgeReason ?? '') : ''),
                },
                {
                  key: 'capplus_blank_reason',
                  label: 'capplus_blank_reason',
                  get: (p) => (p.capplus.state === 'blank' ? p.capplus.reason : ''),
                },
              ], [
                `YIELD/YARD — ${b.identity.name} franchise arc`,
                'source marts: team_rating, capplus_official',
                `coverage: Team Rating 1999-2025 (performance only). Cap+ 2013-2025; 2013 provisional, 2016, 2020 and 2021 estimated.${b.history.blankSeasons.length ? ` Blank whole-season: ${b.history.blankSeasons.join(', ')}.` : ''}`,
                'The two indices are never spliced: they are different metrics and the chart breaks at 2013.',
              ])}
            />
          }
        />
        <FranchiseArc
          points={b.history.points}
          team={b.identity.name}
          abbr={abbrLower}
          currentSeason={season}
          details={arcDetails}
          live={
            liveTeam && liveRow && liveRating !== null
              ? {
                  season: liveTeam.status.season,
                  value: liveRating,
                  covered: liveRow.gamesPlayed,
                  total: liveRow.gamesScheduled,
                  week: liveTeam.status.week,
                  date: liveTeam.status.date ?? '',
                  rank: liveRow.rank,
                  record: liveRow.record,
                }
              : null
          }
        />
        {/* §4.4 — the bridge sentence is always visible; the rest is precision. */}
        <FinePrint
          short={
            <>
              {BRIDGE_SENTENCE} {ARC_SHORT}
              {b.history.blankSeasons.length ? ' Hatched seasons fall outside coverage.' : ''}
            </>
          }
        >
          <ChartCaption>{ARC_BRIDGE}</ChartCaption>
          <ChartCaption>{ARC_FIELD_NOTE}</ChartCaption>
          {offWindow ? (
            <ChartCaption>
              {`The index axis is fixed at ${INDEX_DOMAIN[0]}–${INDEX_DOMAIN[1]} so any two clubs read on the same scale. That leaves ${offWindow} ${offWindow === 1 ? 'season' : 'seasons'} outside it, marked at the edge with the true value printed rather than clamped onto the axis.`}
            </ChartCaption>
          ) : null}
          <ChartCaption>
            {b.history.blankSeasons.length
              ? `Team Rating covers 1999–2025. Cap+ has no reading for ${listSeasons(b.history.blankSeasons)}. ${BLANK_REASON.NO_DM_TABLE}`
              : 'Team Rating covers 1999–2025, and Cap+ covers 2013–2025. 2013 is provisional: its table came out one week into the league year and understates the final figure. 2016, 2020 and 2021 are estimated: only 8, 11 and 10 clubs had their dead money published, and the rest is modeled from contract data.'}
          </ChartCaption>
        </FinePrint>
      </Card>

      {/* ── 7. THE THREE LENSES ──────────────────────────────────────────── */}
      <Card ariaLabel="Spending, three ways">
        <CardHeader eyebrow="Never one number" title="THREE LENSES" />
        {inTier2 ? <ThreeLens lenses={b.lenses} /> : <BoundaryMessage season={season} body={BLANK_REASON.PRE_TIER2} />}
      </Card>

      {/* ── 8. ALLOCATION ────────────────────────────────────────────────── */}
      <Card ariaLabel="Allocation versus the league">
        <CardHeader
          eyebrow="Nine position groups"
          title="SPEND MIX vs LEAGUE"
          right={
            b.allocation.state === 'value' ? (
              <CsvExport
                title="Spend mix versus league"
                filename={`yieldyard_allocation_${abbrLower}_${season}.csv`}
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
                  'Shares are out of the cap held by players on the roster, which leaves out dead money.',
                  'Each player counts at the position of the deal then in force.',
                ])}
              />
            ) : undefined
          }
        />
        {b.allocation.state === 'value' ? (
          <AllocationBars
            bars={b.allocation.value}
            team={b.team}
            coverage={{
              statement: `Nine position groups, ${season}, in the same order for every club, so any two compare side by side. The delta axis is fixed at ±15 points for every club.`,
            }}
          />
        ) : (
          <BoundaryMessage season={season} body={b.allocation.reason} />
        )}
      </Card>

      {/* ── 9. COACHING STABILITY + REGIME TIMELINE ──────────────────────── */}
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
              'The coaching record starts in 2000; Houston joins in 2002. A dead-money reading after a regime change exists only where a league-wide table was published that year. Stability index runs 0 to 100, and 100 means no coaching change in the last three seasons. Churn points score this season’s changes: 3 for a head coach, 1 for a coordinator, 1.5× if made in-season.',
          }}
        />
      </Card>

      {/* ── 10. DEAD MONEY ───────────────────────────────────────────────── */}
      <Card ariaLabel="Dead money">
        <CardHeader
          eyebrow="Dated readings, never a trend"
          title="DEAD MONEY"
          right={
            b.deadMoney.series.length ? (
              <CsvExport
                title="Dead money"
                filename={`yieldyard_deadmoney_${abbrLower}.csv`}
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
                  { key: 'is_modeled', label: 'is_modeled', get: (s) => String(s.isModeled) },
                  { key: 'lo', label: 'lo_usd_80pct', get: (s) => s.loUsd ?? '' },
                  { key: 'hi', label: 'hi_usd_80pct', get: (s) => s.hiUsd ?? '' },
                  { key: 'badge', label: 'badge', get: (s) => s.badge ?? '' },
                  { key: 'source', label: 'source_url', get: (s) => s.sourceUrl },
                ], [
                  `YIELD/YARD — ${b.identity.name} dead-money readings`,
                  'source mart: dead_money_display (the pinned per-team-season resolution)',
                  'Each row is a separate dated press snapshot. Readings are NEVER averaged, merged or connected across seasons.',
                  'season_coverage=leaders_only means a published leaders list, not a 32-team table.',
                  'is_modeled=true: no published figure exists; modeled from contract data, with an 80% range (lo/hi). Never read it without the range.',
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

        {/* The season's own reading is in THREE LENSES above, with its date,
            stage and league median; v1 printed it a second time here. The
            alternate readings belong to this card and stay. */}
        <AlternateReadings
          alternates={b.deadMoney.alternates}
          resolved={b.deadMoney.resolved}
          season={season}
        />

        {/* `SPEC.md` §2.1 — the definition, verbatim with its credit. */}
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
                filename={`yieldyard_deadmoney_ledger_${abbrLower}.csv`}
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

      {/* ── 11. DRAFT ROI — with units and the league median (review D bug sweep) ── */}
      <Card ariaLabel="Draft class">
        <CardHeader eyebrow={`${season} class`} title="DRAFT CAPITAL & RETURN" />
        {b.draft.summary.state === 'value' ? (
          <DraftBody
            season={season}
            summary={b.draft.summary.value}
            medians={draftMedians}
            dollarFraming={b.draft.dollarFraming}
          />
        ) : (
          <BoundaryMessage season={season} body={b.draft.summary.reason} />
        )}
      </Card>

      <ChartCaption>
        A franchise keeps one history across moves. {b.identity.name} is the name it used in {season};
        the URL uses the current team code.
      </ChartCaption>
    </>
  );
}

/**
 * The draft card. Every figure carries its unit and the league median beside
 * it — "CAPITAL 4982.0" with no unit and no benchmark broke the "benchmark
 * always named" rule.
 */
function DraftBody({
  season,
  summary: d,
  medians,
  dollarFraming,
}: {
  season: number;
  summary: {
    nPicks: number;
    capital: number;
    capitalRank: number;
    returnGames: number | null;
    returnWAv: number | null;
    nExcludedNoGsis: number;
    draftIndex: number | null;
    draftIndexRank: number | null;
    maturity: 'early' | 'mature';
    seasonsElapsed: number;
  };
  medians: Metric<{ n: number; capital: number; returnWAv: Metric<number>; returnGames: Metric<number> }>;
  dollarFraming: Metric<null>;
}) {
  const med = medians.state === 'blank' ? null : medians.value;
  const fmt = (v: number) => Math.round(v).toLocaleString('en-US');
  const medNote = (m: Metric<number> | number | undefined, unit: string) => {
    if (m === undefined) return undefined;
    if (typeof m === 'number') return `League median ${fmt(m)} ${unit}`;
    return m.state === 'blank' ? undefined : `League median ${fmt(m.value)} ${unit}`;
  };
  const measured = d.nPicks - d.nExcludedNoGsis;
  return (
    <>
      <StatGrid>
        {/* THE HEADLINE: return against the same draft year's average class, so
            a 2024 class is not judged against a 2016 class's eight seasons. */}
        <KpiTile
          label="Draft index"
          value={
            d.draftIndex === null ? (
              'Not available'
            ) : (
              <>
                {Math.round(d.draftIndex)}
                {d.maturity === 'early' ? (
                  <>
                    {' '}
                    <Chip
                      kind="early"
                      title={`Early: ${d.seasonsElapsed} season${d.seasonsElapsed === 1 ? '' : 's'} since the draft, so the return is still building.`}
                    />
                  </>
                ) : null}
              </>
            )
          }
          unit={`100 = avg ${season} class${d.draftIndexRank !== null ? ` · ${ordinal(d.draftIndexRank)} of ${med?.n ?? 32}` : ''}`}
          note={
            d.maturity === 'early'
              ? `Early read: ${d.seasonsElapsed} season${d.seasonsElapsed === 1 ? '' : 's'} since the draft, so the return is still building.`
              : undefined
          }
        />
        <KpiTile label="Picks" value={String(d.nPicks)} unit="selections" />
        <KpiTile
          label="Capital"
          value={fmt(d.capital)}
          unit={`chart pts · ${ordinal(d.capitalRank)} of ${med?.n ?? 32}`}
          note={medNote(med?.capital, 'pts')}
        />
        <KpiTile
          label="Return · wAV"
          value={d.returnWAv === null ? 'Not available' : fmt(d.returnWAv)}
          unit="weighted approx. value"
          note={medNote(med?.returnWAv, 'wAV')}
        />
        <KpiTile
          label="Return · games"
          value={d.returnGames === null ? 'Not available' : fmt(d.returnGames)}
          unit="games played"
          note={medNote(med?.returnGames, 'games')}
        />
      </StatGrid>
      <FinePrint
        short={
          <>
            Capital is the summed pick value on the{' '}
            <a href={DRAFT_CHART_URL} rel="noopener noreferrer" target="_blank">
              {DRAFT_CHART_NAME}
            </a>
            , in chart points. Return is measured over {measured} of {d.nPicks} picks.{' '}
            {`The draft index sets this class’s weighted approximate value against the average ${season} class, so 100 is that year’s average.`}
          </>
        }
      >
        {d.nExcludedNoGsis > 0 ? (
          <ChartCaption>
            {`${d.nExcludedNoGsis} pick${d.nExcludedNoGsis === 1 ? '' : 's'} ${d.nExcludedNoGsis === 1 ? 'has' : 'have'} no gsis_id, the player ID the return join needs, so ${d.nExcludedNoGsis === 1 ? 'it is' : 'they are'} left out of return. ${d.nExcludedNoGsis === 1 ? 'It stays' : 'They stay'} in the capital total.`}
          </ChartCaption>
        ) : null}
        <ChartCaption>
          We use this chart over the Jimmy Johnson chart. Its values track surplus value, what a pick
          returns beyond its rookie-contract cost, which is the economics the rest of the site uses.
          The Johnson chart is a 1990s trade-negotiation heuristic never tied to on-field results.
        </ChartCaption>
        <ChartCaption>
          Capital and realized return run the full record. Dollar framings of a draft class start in
          2013.{' '}
          {dollarFraming.state === 'blank'
            ? dollarFraming.reason
            : 'A dollar view exists for this class, but this card does not show it.'}
        </ChartCaption>
        {med ? (
          <ChartCaption>League medians cover the {med.n} clubs with a draft class this season.</ChartCaption>
        ) : null}
      </FinePrint>
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
          ? `The figure above (${usdShort(chosen.usd)}, ${chosen.asOf.date}) won on two rules: broadest coverage first, then latest as-of date. `
          : ''}
        Readings are never averaged or merged. Each is true as of its date, and readings drift
        within a season, so a preseason table and a season-final one are different
        measurements, not a disagreement.
      </p>
    </details>
  );
}

/** Visible beside BRIDGE_SENTENCE — the corrected definition (SPEC §2.2, §2.4). */
const ARC_SHORT =
  'Cap+ divides that score by cap cost. Team Rating leaves cost out. A dashed ring marks an ' +
  'estimated season.';

/** v1 said Cap+ "scores wins produced per dollar". It does not: wins are one of three inputs. */
const ARC_BRIDGE =
  'Team Rating (1999–2025) is performance only. It weights win %, point differential per game ' +
  'and opponent-adjusted EPA margin per play equally, and compares each with the rest of its ' +
  'season. EPA is expected points added, offense minus defense. Cap+ (2013–2025) divides that ' +
  'score by roster cost against the cap, with dead money counted once. Together they show where ' +
  'cost moved a club. They don’t measure the same thing.';

const ARC_FIELD_NOTE =
  '“Field” redraws Cap+ as a drive: midfield is Cap+ 100, one index point is one yard, ' +
  'and each season is a carry from midfield to its spot. It covers 2013–2025, the seasons with ' +
  'contract data. Team Rating stays off the field.';
