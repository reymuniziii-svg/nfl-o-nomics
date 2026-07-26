import type { Metadata } from 'next';
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
import { ChartCaption } from '@/components/primitives';

/**
 * `/share/receipt/{div}/{season}` — the SQUARE variant of the Receipt.
 * `SCREENSHOT_VARIANTS.md` §3: square-first, because this is the card designed
 * to be lifted.
 *
 * The card is mounted with `size="square"` and `export`, which:
 *  - applies `.yy-export` (border .42 / .28, flat surfaces, 1ms durations);
 *  - FORCE-EXPANDS the lens caveat — no button, no collapsed state, the full
 *    sentence simply rendered (§4);
 *  - removes the CASH/CAP toggle, whose STATE moves into the eyebrow
 *    (`COST PER WIN · CASH · 2025`) because the state is information and the
 *    control is not;
 *  - keeps the product mark, the named gold benchmark and the `SAMPLE` chip
 *    rule (real data ⇒ no chip).
 *
 * THEME: the reader's current theme, per §8. There is no per-page override —
 * the toggle in the chrome sets `data-theme` on `<html>` and this card inherits
 * it, so both variants are reachable from one URL.
 *
 * The rasteriser targets `[data-export-root]`, which is the card itself: nothing
 * on it depends on the page around it.
 */
export const dynamic = 'force-static';
export const dynamicParams = true;

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
    title: `${divisionName(div)} · ${season} · share card`,
    description: `Cost per win, ${divisionName(div)}, ${season} — the square share variant.`,
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
    getDivisionPeers(div, season, 'cash'),
    getLeagueAvgCostPerWin(season, 'cash'),
    snapshotHasPlaceholderData(),
  ]);

  return (
    <div className={css.stage}>
      <div data-export-root>
        <CostPerWinCard
          size="square"
          title={divisionName(div).toUpperCase()}
          /* The card is the page — and `/share/team/*` has always carried its
             title as an `h1`. The two share variants now name themselves the
             same way. */
          titleAs="h1"
          season={season}
          rows={receiptRows(peers, false)}
          leagueAvg={leagueAvg}
          numerator="cash"
          sample={sample}
          export
          coverage={receiptCoverage(season, peers.teams.length)}
        />
      </div>
      <ChartCaption>
        The square share variant, 400 × 400 — rasterise at devicePixelRatio 2 or more for a
        1080 × 1080 crop. Every disclosure is force-expanded, the toggle is removed and its state
        has moved into the eyebrow, and the benchmark is named in words. The card carries no
        meaning that depends on this page.
      </ChartCaption>
    </div>
  );
}
