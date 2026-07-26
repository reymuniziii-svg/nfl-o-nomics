import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import css from '../../../share.module.css';
import {
  CURRENT_TEAMS,
  eraIdentity,
  toAbbr,
} from '@/lib/teams';
import {
  getTeamBundle,
  getTeamMetaMap,
  latestSeason,
  TIER2_FIRST_SEASON,
} from '@/lib/data';
import { mapMetric } from '@/lib/metric';
import { teamMark } from '@/lib/marks';
import { recordDash, usdShort } from '@/lib/display';
import { TeamMark } from '@/components/marks';
import {
  AsOf,
  BlankReason,
  CapPlusCaption,
  ChartCaption,
  IndexBadge,
} from '@/components/primitives';

/**
 * `/share/team/{abbr}/{season}` — the SQUARE variant of the team header.
 *
 * `SCREENSHOT_VARIANTS.md` §2, the eight criteria this composition is built to
 * satisfy:
 *  1. EDGE — `.yy-export` raises the border to .42 (dark) / .28 (light), so the
 *     card reads as an edge against both a white feed and a Film Room dark one.
 *  2. SELF-CONTAINED — every figure is explained on the card.
 *  3. TITLED — the club, the era-correct city, the division and the season.
 *  4. BENCHMARKED IN WORDS — `100 = LEAGUE AVERAGE` wherever Cap+ leads.
 *  5. MARKED — the product mark, bottom-right of the strap, at 55%.
 *  6. PROVENANCE — no `SAMPLE` chip, because none of this is placeholder data.
 *  7. CAVEATS VISIBLE — the three lens caveats are rendered as static text and
 *     the dead-money as-of stamp sits inline with its figure.
 *  8. AA — every pair on the card clears 4.5:1 in both themes.
 */
export const dynamic = 'force-static';
export const dynamicParams = true;

export async function generateStaticParams() {
  const season = await latestSeason();
  return CURRENT_TEAMS.map((abbr) => ({ abbr: abbr.toLowerCase(), season: String(season) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ abbr: string; season: string }>;
}): Promise<Metadata> {
  const { abbr, season } = await params;
  const team = toAbbr(abbr);
  if (!team) return {};
  return { title: `${eraIdentity(team, Number(season)).name} · ${season} · share card` };
}

export default async function ShareTeamPage({
  params,
}: {
  params: Promise<{ abbr: string; season: string }>;
}) {
  const { abbr, season: seasonRaw } = await params;
  const team = toAbbr(abbr);
  const season = Number(seasonRaw);
  if (!team || !Number.isInteger(season)) notFound();

  const [b, meta] = await Promise.all([getTeamBundle(team, season), getTeamMetaMap()]);
  if (!b) notFound();

  const inTier2 = season >= TIER2_FIRST_SEASON;
  const results = b.results.state === 'value' ? b.results.value : null;
  const record = results ? recordDash(results.wins, results.losses, results.ties) : '';
  const identityLine = [b.identity.location, meta.get(team)?.division, String(season), record]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={css.stage}>
      <div data-export-root>
        <section className={`${css.square} yy-export`} aria-label={`${b.identity.name} ${season}`}>
          <div>
            <div className={css.head}>
              <div className={css.identity}>
                <TeamMark mark={teamMark(b.team, b.identity.name)} size="sm" />
                <div>
                  <h1 className={css.name}>{b.identity.name.toUpperCase()}</h1>
                  <p className={`yy-label ${css.identityLine}`}>{identityLine}</p>
                </div>
              </div>
              <IndexBadge
                metric={inTier2 ? mapMetric(b.capplus, (c) => c.capplus) : b.teamRating}
                scale="header"
                metricName={inTier2 ? 'capplus' : 'teamRating'}
              />
            </div>

            <div className={css.lenses}>
              {inTier2 ? (
                b.lenses.map((lens) => (
                  <div className={css.lens} key={lens.key}>
                    <p className={`yy-label ${css.lensName}`}>{lens.label}</p>
                    {lens.key === 'dead_money' ? (
                      lens.amount.state === 'blank' ? (
                        <BlankReason reason={lens.amount.reason} />
                      ) : lens.asOf ? (
                        <AsOf
                          value={usdShort(lens.amount.value)}
                          date={lens.asOf.date}
                          stage={lens.asOf.stage}
                          valueClass={`yy-num ${css.lensFigure}`}
                        />
                      ) : (
                        <BlankReason reason="Not available — this reading has no recorded as-of date." />
                      )
                    ) : lens.amount.state === 'blank' ? (
                      <BlankReason reason={lens.amount.reason} />
                    ) : (
                      <span className={`yy-num ${css.lensFigure}`}>
                        {usdShort(lens.amount.value)}
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <p className={`yy-caption ${css.caveat}`}>
                  Player-level economics begin in 2013. For {season} this product has team results,
                  EPA, coaching and draft — but no contract, cap or cash data. Nothing here is
                  estimated to fill the gap.
                </p>
              )}
            </div>
          </div>

          <div>
            {inTier2 ? (
              <p className={`yy-caption ${css.caveat}`}>
                Cap hit is an end-of-league-year restatement. Cash is cash to players on the
                roster. Dead money is a dated press snapshot, not a derived figure.
              </p>
            ) : null}
            <div className={css.strap}>
              <span className={`yy-label ${css.bench}`}>
                {inTier2 ? <CapPlusCaption /> : 'Team rating · performance only'}
              </span>
              <span className={css.mark} aria-hidden="true">
                YIELD<span className={css.markSlash}>/</span>YARD
              </span>
            </div>
          </div>
        </section>
      </div>

      <ChartCaption>
        The square share variant of the team header, 400 × 400. Rasterise{' '}
        <code>[data-export-root]</code> at devicePixelRatio 2 or more for a 1080 × 1080 crop. Every
        caveat is rendered as static text and the dead-money stamp keeps its date and stage on the
        same line as the figure.
      </ChartCaption>
    </div>
  );
}
