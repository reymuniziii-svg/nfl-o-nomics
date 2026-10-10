import { notFound } from 'next/navigation';
import { latestSeason } from '@/lib/data';
import { DIVISION_SLUGS, isDivisionSlug } from '@/lib/teams';
import { loadDivisionCard } from '@/app/share/_og/data';
import { DivisionOg, OG_SIZE, renderOg } from '@/app/share/_og/cards';

/** The division share card, 1200 × 630, for the season the page shows (the latest). */
export const dynamic = 'force-static';
export const alt =
  'YIELD/YARD division card: four clubs on the Cap+ field against the league average, with cap per win and a verdict for each.';
export const size = OG_SIZE;
export const contentType = 'image/png';

export function generateStaticParams() {
  return DIVISION_SLUGS.map((div) => ({ div }));
}

export default async function Image({ params }: { params: Promise<{ div: string }> }) {
  const { div } = await params;
  if (!isDivisionSlug(div)) notFound();
  return renderOg(<DivisionOg card={await loadDivisionCard(div, await latestSeason())} />);
}
