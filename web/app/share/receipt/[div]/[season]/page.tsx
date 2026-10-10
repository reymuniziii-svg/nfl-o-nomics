import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import css from '../../../share.module.css';
import {
  getDivisionPeers,
  getLeagueAvgCostPerWin,
  latestSeason,
  snapshotHasPlaceholderData,
} from '@/lib/data';
import { DIVISION_SLUGS, divisionName, isDivisionSlug } from '@/lib/teams';
import { receiptCoverage, receiptRows } from '@/lib/view';
import { CostPerWinCard } from '@/components/receipt/cost-per-win-card';

/**
 * `/share/receipt/{div}/{season}` — the division's two share objects and
 * nothing else: the square cost-per-win Receipt (export mode: caveats forced
 * open, toggle removed, benchmark named) — on the CAP numerator, so its figures
 * match the field card and the receipt verdicts — and the field card (the division
 * page's own 1200 × 630 OG image). Latest season only, because that is the
 * season the division page — and therefore its OG card — shows.
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  const season = await latestSeason();
  return DIVISION_SLUGS.map((div) => ({ div, season: String(season) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ div: string; season: string }>;
}): Promise<Metadata> {
  const { div, season } = await params;
  if (!isDivisionSlug(div)) return {};
  return {
    title: `${divisionName(div)} · ${season} · receipt`,
    alternates: { canonical: `/division/${div}` },
    openGraph: {
      title: `${divisionName(div)} · ${season} — what a win cost`,
      images: [{ url: `/division/${div}/opengraph-image`, width: 1200, height: 630 }],
    },
  };
}

export default async function ShareReceiptPage({
  params,
}: {
  params: Promise<{ div: string; season: string }>;
}) {
  const { div, season: seasonRaw } = await params;
  const season = Number(seasonRaw);
  if (!isDivisionSlug(div) || !Number.isInteger(season)) notFound();

  const [peers, leagueAvg, sample] = await Promise.all([
    getDivisionPeers(div, season, 'cap'),
    getLeagueAvgCostPerWin(season, 'cap'),
    snapshotHasPlaceholderData(),
  ]);

  return (
    <div className={css.stage}>
      <div className={css.cardSquare} data-export-root>
        <CostPerWinCard
          size="square"
          title={divisionName(div).toUpperCase()}
          season={season}
          rows={receiptRows(peers, false)}
          leagueAvg={leagueAvg}
          numerator="cap"
          sample={sample}
          export
          coverage={receiptCoverage(season, peers.teams.length)}
        />
      </div>
      <Image
        className={css.fieldCard}
        src={`/division/${div}/opengraph-image`}
        width={1200}
        height={630}
        alt={`${divisionName(div)} ${season}: four clubs on the Cap+ field against the league average, with cap per win and a verdict for each.`}
        priority
      />
    </div>
  );
}
