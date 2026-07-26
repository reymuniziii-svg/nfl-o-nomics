import type { Metadata } from 'next';
import { getCredits } from '@/lib/data';
import { PLAYERMARK_COUNTS, TEAMMARK_COUNTS } from '@/lib/marks';
import { IMAGE_MIN_WIDTH_PX, IMAGE_TREATMENT_MODE, TEAM_LOGOS_ENABLED } from '@/lib/flags';
import { Definitions, Note, Row, Section } from '@/components/shell';

/**
 * `SPEC.md` §6 — `/credits`, static, 1 page. Image attribution and data credits.
 *
 * DEDUPLICATED BY AUTHOR (`SPEC.md` §5.2). Three authors account for ~49% of the
 * usable photos, so rendering one line per asset would be worse than useless.
 * Every credit on this page renders VISIBLY: attribution is the default, not the
 * exception, and hiding a credit behind a hover or an "info" affordance is a
 * licence violation for the 91.4% of assets that require it.
 */
export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Credits',
  description: 'Image attribution and data credits.',
};

export default async function CreditsPage() {
  const credits = await getCredits();
  const logos = credits.logos as {
    note?: string;
    source_dataset?: string;
    source_dataset_url?: string;
    logo_count?: number;
  };
  const policy = credits.policy as { attribution?: string; sharealike?: string; photo_source?: string };

  return (
    <>
      <h1>Credits</h1>

      <Section title="Photographs">
        <Note>
          {policy.photo_source ??
            'Wikimedia Commons only. No press photography, no team media, no scraped images.'}
        </Note>
        <Note>{policy.attribution}</Note>
        <Definitions>
          <Row label="Assets credited">{credits.totalPhotoAssets}</Row>
          <Row label="Licence groups">{credits.groups.length}</Row>
          <Row label="Distinct authors">
            {credits.groups.reduce((a, g) => a + g.authorCount, 0)}
          </Row>
          <Row label="Resolution floor">{IMAGE_MIN_WIDTH_PX}px</Row>
          <Row label="Treatment">{IMAGE_TREATMENT_MODE.replace(/_/g, ' ')}</Row>
          <Row label="Population">
            {PLAYERMARK_COUNTS.csv_rows ?? 0} audited players ·{' '}
            {PLAYERMARK_COUNTS.ok ?? 0} with a served photo ·{' '}
            {PLAYERMARK_COUNTS.no_usable_image ?? 0} with none ·{' '}
            {PLAYERMARK_COUNTS.skipped_by_floor ?? 0} below the floor
          </Row>
        </Definitions>
      </Section>

      {credits.groups.map((g) => (
        <Section key={g.licenseMachine} title={`${g.license} — ${g.assetCount} assets`}>
          <Note>
            {g.attributionRequired ? 'Attribution required. ' : ''}
            {g.shareAlike ? 'ShareAlike. ' : ''}
            {g.licenseUrl ? (
              <a href={g.licenseUrl} rel="license noreferrer">
                Licence terms
              </a>
            ) : (
              'No licence URL — public domain.'
            )}
          </Note>
          <ul>
            {g.authors.map((a) => (
              <li key={`${g.licenseMachine}-${a.author}`}>
                {a.attribution}
                {a.assetCount > 1 ? ` — ${a.assetCount} photographs` : ''}
                {a.players.length ? (
                  <>
                    {': '}
                    <span className="yy-asof-line">{a.players.join(', ')}</span>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ))}

      <Section title="Team logos">
        <Note>{logos.note}</Note>
        <Definitions>
          <Row label="Source">
            {logos.source_dataset_url ? (
              <a href={logos.source_dataset_url} rel="noreferrer">
                {logos.source_dataset}
              </a>
            ) : (
              (logos.source_dataset ?? '—')
            )}
          </Row>
          <Row label="Self-hosted">
            Yes — {TEAMMARK_COUNTS.teams_ok} of {TEAMMARK_COUNTS.teams_expected} clubs. Never
            hotlinked.
          </Row>
          <Row label="Rendering">
            {TEAM_LOGOS_ENABLED ? 'Logos on' : 'Logos off — typographic fallback chip everywhere'}
          </Row>
        </Definitions>
      </Section>

      <Section title="Data">
        <ul>
          <li>Play-by-play, schedules, rosters, snap counts, draft picks, contracts — nflverse.</li>
          <li>
            Draft trade value —{' '}
            <a href="https://overthecap.com/draft-trade-value-chart" rel="noreferrer">
              Fitzgerald–Spielberger NFL Draft Trade Value Chart
            </a>
            , Over The Cap.
          </li>
          <li>
            League salary-cap ceilings, coaching staffs and every dead-money figure are curated
            in-repo with a per-row citation; each dated dead-money reading renders its own source.
          </li>
        </ul>
      </Section>
    </>
  );
}
