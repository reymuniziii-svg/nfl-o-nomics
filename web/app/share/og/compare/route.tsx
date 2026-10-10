import { parseRef, teamSeasonExists } from '@/lib/data';
import { loadTeamCard } from '@/app/share/_og/data';
import { CompareOg, renderOg } from '@/app/share/_og/cards';

/**
 * `/share/og/compare?a=kc-2019&b=kc-2025` — the head-to-head share card.
 *
 * WHY A ROUTE HANDLER, NOT `compare/opengraph-image.tsx`: the compare page is
 * keyed by SEARCH params and a metadata image route only receives path params,
 * so the file convention could only ever draw one fixed pair. The 741k ordered
 * pairs cannot be prerendered either. This renders on first request and is then
 * cached for the life of the snapshot, exactly like `/compare` itself.
 */
export const revalidate = 31536000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const a = parseRef(url.searchParams.get('a') ?? undefined);
  const b = parseRef(url.searchParams.get('b') ?? undefined);
  if (!a || !b) return new Response('Expected ?a={abbr}-{season}&b={abbr}-{season}', { status: 400 });
  const [okA, okB] = await Promise.all([
    teamSeasonExists(a.team, a.season),
    teamSeasonExists(b.team, b.season),
  ]);
  if (!okA || !okB) return new Response('Unknown team-season', { status: 404 });

  const [ca, cb] = await Promise.all([loadTeamCard(a.team, a.season), loadTeamCard(b.team, b.season)]);
  const img = await renderOg(<CompareOg a={ca} b={cb} />);
  img.headers.set('Cache-Control', 'public, s-maxage=31536000, stale-while-revalidate=86400');
  return img;
}
