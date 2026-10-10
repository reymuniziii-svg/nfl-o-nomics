import type { Metadata } from 'next';
import css from './credits.module.css';
import { getCredits } from '@/lib/data';
import { PLAYERMARK_COUNTS, TEAMMARK_COUNTS } from '@/lib/marks';
import { IMAGE_MIN_WIDTH_PX, IMAGE_TREATMENT_MODE, TEAM_LOGOS_ENABLED } from '@/lib/flags';
import { Card, CardHeader, ChartCaption, Chip, KpiTile } from '@/components/primitives';
import { StatGrid } from '@/components/team/team-blocks';

/**
 * `SPEC.md` §6 — `/credits`, static, 1 page. Image attribution and data credits.
 *
 * DEDUPLICATED BY AUTHOR (`SPEC.md` §5.2). Three authors account for ~49% of the
 * usable photos, so one line per asset would be worse than useless.
 *
 * Every credit on this page renders VISIBLY: attribution is the default, not the
 * exception, and hiding a credit behind a hover or an "info" affordance is a
 * license violation for the 91.4% of assets that require it.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Credits',
  description: 'Photo credits, image licenses and data sources.',
};

export default async function CreditsPage() {
  const credits = await getCredits();
  const logos = credits.logos as {
    note?: string;
    source_dataset?: string;
    source_dataset_url?: string;
    logo_count?: number;
  };
  const policy = credits.policy as {
    attribution?: string;
    sharealike?: string;
    photo_source?: string;
  };

  const summaryAuthors = credits.summary.distinct_authors;
  const distinctAuthors =
    typeof summaryAuthors === 'number'
      ? summaryAuthors
      : new Set(credits.groups.flatMap((g) => g.authors.map((a) => a.author))).size;

  return (
    <>
      <header>
        <h1 className="yy-h1">CREDITS</h1>
        <p className="yy-dek">
          Every photograph on this site comes from Wikimedia Commons. We host it ourselves,
          leave the file untouched, and credit the photographer here and beside the photo.
        </p>
      </header>

      <Card ariaLabel="Photograph policy">
        <CardHeader eyebrow="Policy" title="PHOTOGRAPHS" />
        <p className="yy-caption">
          {policy.photo_source ??
            'Wikimedia Commons only. No press photography, no team media, no scraped images.'}
        </p>
        {policy.attribution ? <p className="yy-caption">{policy.attribution}</p> : null}
        {policy.sharealike ? <p className="yy-caption">{policy.sharealike}</p> : null}

        <StatGrid>
          <KpiTile label="Assets credited" value={String(credits.totalPhotoAssets)} />
          <KpiTile label="License groups" value={String(credits.groups.length)} />
          {/* Summing the per-group author counts DOUBLE-COUNTS the seven authors
              who appear under more than one license (Erik Drost under CC BY 2.0
              and 4.0, Jeffrey Beall under 3.0 and 4.0, the Tennessee Titans
              under 3.0 and 4.0), and published 77 where the manifest's own
              computed figure is 70. On the page whose whole job is discharging
              a license obligation, the count comes from the manifest. */}
          <KpiTile label="Distinct authors" value={String(distinctAuthors)} />
          <KpiTile label="Resolution floor" value={String(IMAGE_MIN_WIDTH_PX)} unit="px" />
        </StatGrid>

        <ChartCaption>
          Population: {PLAYERMARK_COUNTS.csv_rows ?? 0} audited players · {PLAYERMARK_COUNTS.ok ?? 0}{' '}
          with a served photograph · {PLAYERMARK_COUNTS.no_usable_image ?? 0} with none ·{' '}
          {PLAYERMARK_COUNTS.skipped_by_floor ?? 0} below the resolution floor. Treatment:{' '}
          {IMAGE_TREATMENT_MODE.replace(/_/g, ' ')}. The duotone is applied in CSS when the page
          renders, over the untouched original, so no derivative file exists.
        </ChartCaption>
      </Card>

      {credits.groups.map((g) => (
        <Card key={g.licenseMachine} ariaLabel={g.license}>
          <CardHeader
            eyebrow={`${g.assetCount} assets · ${g.authorCount} authors`}
            title={g.license.toUpperCase()}
            right={
              <span className={css.chips}>
                {g.attributionRequired ? (
                  <Chip kind="verified" title="Attribution required" />
                ) : null}
                {g.shareAlike ? <Chip kind="provisional" title="ShareAlike" /> : null}
              </span>
            }
          />
          <p className="yy-caption">
            {g.attributionRequired ? 'Attribution required. ' : 'Attribution not required. '}
            {g.shareAlike ? 'ShareAlike. ' : ''}
            {g.licenseUrl ? (
              <a href={g.licenseUrl} rel="license noopener noreferrer" target="_blank">
                License terms
              </a>
            ) : (
              'No license URL. Public domain.'
            )}
          </p>
          <ul className={css.authors}>
            {g.authors.map((a) => (
              <li className={css.author} key={`${g.licenseMachine}-${a.author}`}>
                <span className={`yy-label-lg ${css.authorName}`}>{a.attribution}</span>
                {a.assetCount > 1 ? (
                  <span className={`yy-label ${css.authorCount}`}>{a.assetCount} photographs</span>
                ) : null}
                {a.players.length ? (
                  <span className={`yy-caption ${css.authorPlayers}`}>{a.players.join(', ')}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ))}

      <Card ariaLabel="Team logos">
        <CardHeader eyebrow="Identity assets" title="TEAM LOGOS" />
        <p className="yy-caption">{logos.note}</p>
        <StatGrid>
          <KpiTile
            label="Self-hosted"
            value={`${TEAMMARK_COUNTS.teams_ok} / ${TEAMMARK_COUNTS.teams_expected}`}
            unit="clubs"
          />
          <KpiTile label="Hotlinked" value="0" />
          <KpiTile label="Rendering" value={TEAM_LOGOS_ENABLED ? 'Logos' : 'Chips'} />
          <KpiTile label="Team colors in charts" value="0" />
        </StatGrid>
        <ChartCaption>
          Team color never colors a chart: not a series, bar, dot, heat ramp or legend swatch. It
          appears in one place, the TeamMark fallback chip.{' '}
          {logos.source_dataset_url ? (
            <a href={logos.source_dataset_url} rel="noopener noreferrer" target="_blank">
              {logos.source_dataset}
            </a>
          ) : (
            (logos.source_dataset ?? '')
          )}
        </ChartCaption>
      </Card>

      <Card ariaLabel="Typefaces">
        <CardHeader eyebrow="Self-hosted, OFL 1.1" title="TYPEFACES" />
        <ul className={css.authors}>
          <li className={css.author}>
            <span className={`yy-label-lg ${css.authorName}`}>Bebas Neue</span>
            <span className={`yy-caption ${css.authorPlayers}`}>
              Ryoichi Tsunekawa, Dharma Type. SIL Open Font License 1.1. The display face, weight
              400 only. It has a single weight, and a synthetic bold degrades it.
            </span>
          </li>
          <li className={css.author}>
            <span className={`yy-label-lg ${css.authorName}`}>Rajdhani</span>
            <span className={`yy-caption ${css.authorPlayers}`}>
              Indian Type Foundry. SIL Open Font License 1.1. The utility face, weights 400, 500
              and 600.
            </span>
          </li>
          <li className={css.author}>
            <span className={`yy-label-lg ${css.authorName}`}>Inter</span>
            <span className={`yy-caption ${css.authorPlayers}`}>
              Rasmus Andersson. SIL Open Font License 1.1. Body copy, and every figure in a column,
              set in tabular numerals.
            </span>
          </li>
        </ul>
        <ChartCaption>
          All three are served from this origin. The site makes no third-party font requests, runs
          no third-party analytics and sets no cookies.
        </ChartCaption>
      </Card>

      <Card ariaLabel="Data credits">
        <CardHeader eyebrow="Sources" title="DATA" />
        <ul className={css.authors}>
          <li className={css.author}>
            <span className={`yy-label-lg ${css.authorName}`}>nflverse</span>
            <span className={`yy-caption ${css.authorPlayers}`}>
              Play-by-play, schedules, rosters, snap counts, draft picks and contracts.
            </span>
          </li>
          <li className={css.author}>
            <span className={`yy-label-lg ${css.authorName}`}>
              Fitzgerald–Spielberger NFL Draft Trade Value Chart
            </span>
            <span className={`yy-caption ${css.authorPlayers}`}>
              Draft trade value, via{' '}
              <a
                href="https://overthecap.com/draft-trade-value-chart"
                rel="noopener noreferrer"
                target="_blank"
              >
                Over The Cap
              </a>
              .
            </span>
          </li>
          <li className={css.author}>
            <span className={`yy-label-lg ${css.authorName}`}>Curated in-repo</span>
            <span className={`yy-caption ${css.authorPlayers}`}>
              League salary-cap ceilings, coaching staffs and every dead-money figure, each with a
              citation on its row. Every dated dead-money reading shows its own source link beside
              the figure.
            </span>
          </li>
        </ul>
      </Card>
    </>
  );
}
