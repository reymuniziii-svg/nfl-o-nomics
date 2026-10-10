import { notFound } from 'next/navigation';
import { allTeamSeasons } from '@/lib/data';
import { toAbbr } from '@/lib/teams';
import { loadTeamCard } from '@/app/share/_og/data';
import { OG_SIZE, TeamOg, renderOg } from '@/app/share/_og/cards';

/**
 * The team-season share card, 1200 × 630. Prerendered for every team-season at
 * build time (the same 861 keys the page enumerates), so it is a static PNG on
 * the CDN and needs no database at request time.
 */
export const dynamic = 'force-static';
export const alt =
  'YIELD/YARD team-season card: record, verdict, Cap+ as field position against the league average, and the receipt.';
export const size = OG_SIZE;
export const contentType = 'image/png';

export async function generateStaticParams() {
  const keys = await allTeamSeasons();
  return keys.map((k) => ({ abbr: k.team.toLowerCase(), season: String(k.season) }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ abbr: string; season: string }>;
}) {
  const { abbr, season } = await params;
  const team = toAbbr(abbr);
  const yr = Number(season);
  if (!team || !Number.isInteger(yr)) notFound();
  return renderOg(<TeamOg card={await loadTeamCard(team, yr)} />);
}
