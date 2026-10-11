/**
 * The team-season OG image as page metadata. The image is a Route Handler at
 * `/team/{abbr}/{season}/opengraph-image` (not the file convention), so every
 * page that wants it names it here — and a live page versions it with `?wk=`.
 */
export const TEAM_OG_ALT =
  'YIELD/YARD team-season card: record, verdict, Cap+ as field position against the league average, and the receipt.';
export const LIVE_TEAM_OG_ALT =
  'YIELD/YARD live team card: record, games played and Team Rating (performance only) · live, with its as-of week. No verdict.';

export function teamOgImage(abbr: string, season: number | string, liveWeek?: number) {
  const url = `/team/${abbr.toLowerCase()}/${season}/opengraph-image${liveWeek !== undefined ? `?wk=${liveWeek}` : ''}`;
  return {
    url,
    width: 1200,
    height: 630,
    type: 'image/png',
    alt: liveWeek !== undefined ? LIVE_TEAM_OG_ALT : TEAM_OG_ALT,
  };
}
