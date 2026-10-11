import { notFound } from 'next/navigation';
import { allTeamSeasons } from '@/lib/data';
import { isLiveTeamSeason, liveTeamKeys } from '@/lib/data/live';
import { toAbbr } from '@/lib/teams';
import { loadLiveTeamCard, loadTeamCard } from '@/app/share/_og/data';
import { LiveTeamOg, TeamOg, renderOg } from '@/app/share/_og/cards';

/**
 * The team-season share card, 1200 × 630, at `/team/{abbr}/{season}/opengraph-image`.
 * Prerendered for every team-season at build time (the 861 final keys plus the
 * 32 live 2026 keys), so it is a static PNG on the CDN and needs no database
 * at request time.
 *
 * A Route Handler rather than the `opengraph-image.tsx` file convention, at the
 * same URL: file-based metadata overrides `generateMetadata`, and the live
 * page's og:image must carry `?wk={n}` so feeds refetch the card each week
 * (DECISIONS 116). The page's `generateMetadata` now names this image itself.
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  const [keys, live] = await Promise.all([allTeamSeasons(), liveTeamKeys()]);
  return [...keys, ...live].map((k) => ({ abbr: k.team.toLowerCase(), season: String(k.season) }));
}

export async function GET(_req: Request, { params }: { params: Promise<{ abbr: string; season: string }> }) {
  const { abbr, season } = await params;
  const team = toAbbr(abbr);
  const yr = Number(season);
  if (!team || !Number.isInteger(yr)) notFound();
  if (await isLiveTeamSeason(team, yr)) {
    const card = await loadLiveTeamCard(team);
    if (!card) notFound();
    return renderOg(<LiveTeamOg card={card} />);
  }
  return renderOg(<TeamOg card={await loadTeamCard(team, yr)} />);
}
