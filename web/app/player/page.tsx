import type { Metadata } from 'next';
import Link from 'next/link';
import css from './player.module.css';
import { getFeaturedPlayers, getPlayerPopulation, latestSeason } from '@/lib/data';
import { usdShort } from '@/lib/display';
import { AsOf, BlankReason, Card, CardHeader, ChartCaption } from '@/components/primitives';
import { PlayerSearch } from '@/components/pickers/player-search';

/**
 * `/player` — the search surface (`SPEC.md` §3.3 item 1, §8.4).
 *
 * Name search over the fixed v1 population, typeahead, NO FILTERS. Curated
 * pickers only (`DECISIONS.md` 50): there is no free-form query builder in v1
 * and a PR that adds arbitrary filtering is rejected on sight.
 *
 * Beneath the field, two curated ways in (review 2026-10-10): the season's
 * biggest cap hits and the ledger's biggest dead-money charges. Both rank
 * published dollar figures; neither scores a player.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Players',
  description:
    'Search 251 audited players. See contract terms, cap versus cash, and availability.',
};

export const POPULATION_STATEMENT =
  'Search covers 251 players: the 2021–2025 top cap hits plus the marquee dead-money names. ' +
  'Every one has a verified image and license status.';

export default async function PlayerIndexPage() {
  const season = await latestSeason();
  const [pop, featured] = await Promise.all([getPlayerPopulation(), getFeaturedPlayers(season)]);

  return (
    <>
      <Card ariaLabel="Player search">
        <CardHeader eyebrow="Who is covered" title="PLAYERS" />
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
            No player page here carries a composite rating, letter grade, star count or worth-it
            verdict. That is a published commitment, not a gap in the data.
          </ChartCaption>
        </div>
      </Card>

      <div className={css.featuredGrid}>
        <Card ariaLabel={`Biggest cap hits, ${season}`}>
          <CardHeader eyebrow={`${season} season`} title="BIGGEST CAP HITS" />
          {featured.capHits.state === 'blank' ? (
            <BlankReason reason={featured.capHits.reason} />
          ) : (
            <ol className={css.featured}>
              {featured.capHits.value.map((p, i) => (
                <li key={p.playerId}>
                  <Link className={css.featuredRow} href={`/player/${p.playerId}`}>
                    <span className={`yy-num ${css.featuredRank}`}>{i + 1}</span>
                    <span className={css.featuredWho}>
                      <span className={css.featuredName}>{p.name}</span>
                      <span className={`yy-label ${css.featuredMeta}`}>
                        {[p.position, p.team].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className={css.featuredFigure}>
                      <span className="yy-num">{usdShort(p.capNumber)}</span>
                      {p.capPercent !== null ? (
                        <span className={`yy-label ${css.featuredMeta}`}>
                          {(p.capPercent * 100).toFixed(1)}% of cap
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
          <ChartCaption>
            {`${season} cap hits among the 251 players with a page. Cap number is what a player counts against the cap; percent is of the club’s adjusted cap.`}
          </ChartCaption>
        </Card>

        <Card ariaLabel="Biggest dead-money charges">
          <CardHeader eyebrow="From the ledger" title="BIGGEST DEAD-MONEY NAMES" />
          {featured.deadMoney.state === 'blank' ? (
            <BlankReason reason={featured.deadMoney.reason} />
          ) : (
            <ol className={css.featured}>
              {featured.deadMoney.value.map((c, i) => {
                const body = (
                  <>
                    <span className={`yy-num ${css.featuredRank}`}>{i + 1}</span>
                    <span className={css.featuredWho}>
                      <span className={css.featuredName}>{c.name}</span>
                      <span className={`yy-label ${css.featuredMeta}`}>
                        Charged to {c.team} · {c.seasons}
                      </span>
                      <AsOf value={usdShort(c.totalUsd)} date={c.verifiedAsof} stage="verified" />
                    </span>
                  </>
                );
                return (
                  <li key={`${c.name}-${c.seasons}`}>
                    {c.playerId ? (
                      <Link className={css.featuredRow} href={`/player/${c.playerId}`}>
                        {body}
                      </Link>
                    ) : (
                      <div className={css.featuredRow}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <ChartCaption>
            The largest single charges in the marquee ledger, each with its verification date. Dead
            money is cap you still pay for players who are gone; the club named is the one that ate
            the charge.
          </ChartCaption>
        </Card>
      </div>
    </>
  );
}
