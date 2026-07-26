import type { Metadata } from 'next';
import css from './player.module.css';
import { getPlayerPopulation } from '@/lib/data';
import { Card, CardHeader, ChartCaption } from '@/components/primitives';
import { PlayerSearch } from '@/components/pickers/player-search';

/**
 * `/player` — the search surface (`SPEC.md` §3.3 item 1, §8.4).
 *
 * Name search over the fixed v1 population, typeahead, NO FILTERS. Curated
 * pickers only (`DECISIONS.md` 50): there is no free-form query builder in v1
 * and a PR that adds arbitrary filtering is rejected on sight.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Players',
  description:
    'Search the 251 audited players in the v1 population — contract terms, cap versus cash, availability.',
};

export const POPULATION_STATEMENT =
  'Search covers the 251 players in the v1 population — 2021–2025 top-cap plus marquee dead-money ' +
  'names. Every one of them has verified image and licence status.';

export default async function PlayerIndexPage() {
  const pop = await getPlayerPopulation();

  return (
    <Card ariaLabel="Player search">
      {/* This card IS the route, so its title is the page's `h1` — a hidden
          second heading saying the same words is chrome for a screen reader
          only. */}
      <CardHeader eyebrow="The v1 population" title="PLAYERS" titleAs="h1" />
      <div className={css.searchBlock}>
        <PlayerSearch
          players={pop.map((p) => ({
            playerId: p.playerId,
            name: p.player ?? `Player ${p.playerId}`,
            position: p.position,
            team: p.team,
          }))}
          populationStatement={POPULATION_STATEMENT}
        />
        <ChartCaption>
          There is no composite player rating, letter grade, star count or worth-it verdict on any
          player surface in this product. That is a published commitment, not an omission.
        </ChartCaption>
      </div>
    </Card>
  );
}
