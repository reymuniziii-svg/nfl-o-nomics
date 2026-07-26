import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import css from '../player.module.css';
import { getPlayerBundle, getPlayerPopulation, SNAPS_FIRST_SEASON } from '@/lib/data';
import { playerMark } from '@/lib/marks';
import { usdShort } from '@/lib/display';
import {
  BoundaryMessage,
  Card,
  CardHeader,
  ChartCaption,
  Chip,
  KpiTile,
} from '@/components/primitives';
import { StatGrid } from '@/components/team/team-blocks';
import { PlayerMark } from '@/components/marks';
import { CapVsCash } from '@/components/charts/cap-vs-cash';
import { CsvExport } from '@/components/csv-export';
import { csvTable } from '@/lib/csv';

/**
 * `SPEC.md` §6 — `/player/{id}` where `{id}` is `otc_id`. Static, 251 pages.
 *
 * `DECISIONS.md` 53 caps the v1 population at the 251 audited players, so every
 * page has known image status and known licence metadata.
 *
 * **NO VALUE GRADE. EVER** (`SPEC.md` §3.3 item 7, `DECISIONS.md` 51). There is
 * no composite, no letter grade, no verdict and no star count on this page —
 * there is nothing to render because there is nothing to compute.
 */
export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  const pop = await getPlayerPopulation();
  return pop.map((p) => ({ id: p.playerId }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const b = await getPlayerBundle(id);
  return b
    ? {
        title: b.name,
        description: `${b.name}: contract terms, cap versus cash by year, and availability.`,
      }
    : {};
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await getPlayerBundle(id);
  if (!b) notFound();

  const mark = playerMark(b.playerId, b.name);
  const capRows = b.capVsCash.state === 'blank' ? [] : b.capVsCash.value;
  const availRows = b.availability.state === 'blank' ? [] : b.availability.value;
  const deadCharges = capRows.filter((r) => r.deadMoney);

  return (
    <>
      {/* ── 2. IDENTITY CHIP — the credit line renders VISIBLY, beneath the
          mark, inside the chip's own box. 223 of 244 assets legally require it
          and a credit behind a hover is a licence violation. ─────────────── */}
      <Card ariaLabel={b.name}>
        <div className={css.identity}>
          <PlayerMark
            mark={mark}
            size="card"
            team={b.team}
            position={b.position}
          />
          <div className={css.identityText}>
            <h1 className={css.name}>{b.name}</h1>
            <p className={`yy-label ${css.meta}`}>
              {[b.position, b.team].filter(Boolean).join(' · ')}
            </p>
            {b.team ? (
              <Link className="yy-label" href={`/team/${b.team.toLowerCase()}`}>
                Team page →
              </Link>
            ) : null}
            <p className={`yy-caption ${css.pledge}`}>
              This product publishes no composite player rating, letter grade, star count or
              worth-it verdict — here or anywhere. What a club paid and what the player was
              available for are facts; the judgment is the reader&rsquo;s.
            </p>
          </div>
        </div>
      </Card>

      {/* ── 3. CONTRACT CARD ─────────────────────────────────────────────── */}
      <Card ariaLabel="Contract">
        <CardHeader eyebrow="Most recent deal" title="CONTRACT" />
        {b.contract.state === 'blank' ? (
          <BoundaryMessage body={b.contract.reason} />
        ) : (
          <div className={css.contract}>
            <KpiTile
              label="Signed"
              value={b.contract.value.yearSigned ? String(b.contract.value.yearSigned) : '—'}
            />
            <KpiTile
              label="Years"
              value={b.contract.value.years ? String(b.contract.value.years) : '—'}
            />
            <KpiTile
              label="Total value"
              value={b.contract.value.value !== null ? usdShort(b.contract.value.value) : '—'}
            />
            <KpiTile
              label="Average per year"
              value={b.contract.value.apy !== null ? usdShort(b.contract.value.apy) : '—'}
            />
            <KpiTile
              label="Guaranteed"
              value={
                b.contract.value.guaranteed !== null ? usdShort(b.contract.value.guaranteed) : '—'
              }
            />
            <KpiTile
              label="APY as % of cap"
              value={
                b.contract.value.apyCapPct !== null
                  ? `${(b.contract.value.apyCapPct * 100).toFixed(1)}%`
                  : '—'
              }
              unit="that year"
            />
          </div>
        )}
        <ChartCaption>
          Contract terms are the published top-level columns of the deal in force. They are not
          re-derived from year-by-year cap numbers, and no term is inferred where a source is silent.
        </ChartCaption>
      </Card>

      {/* ── 4. CAP VS CASH BY YEAR, with dead-money markers ──────────────── */}
      <Card ariaLabel="Cap versus cash by year">
        <CardHeader
          eyebrow="Two series"
          title="CAP vs CASH"
          right={
            capRows.length ? (
              <CsvExport
                title="Cap versus cash"
                filename={`yieldyard_player_${b.playerId}_cap_vs_cash.csv`}
                table={csvTable(capRows, [
                  { key: 'season', label: 'season', get: (r) => r.season },
                  { key: 'team', label: 'team', get: (r) => r.team },
                  { key: 'cap', label: 'cap_number_usd', get: (r) => r.capNumber },
                  { key: 'cash', label: 'cash_paid_usd', get: (r) => r.cashPaid },
                  { key: 'cap_pct', label: 'cap_percent', get: (r) => r.capPercent },
                  { key: 'group', label: 'position_group', get: (r) => r.positionGroup },
                  {
                    key: 'dm_team',
                    label: 'dead_money_charged_to',
                    get: (r) => r.deadMoney?.team ?? '',
                  },
                  { key: 'dm_usd', label: 'dead_money_usd', get: (r) => r.deadMoney?.usd ?? '' },
                  {
                    key: 'dm_source',
                    label: 'dead_money_source_url',
                    get: (r) => r.deadMoney?.sourceUrl ?? '',
                  },
                ], [
                  `YIELD/YARD — ${b.name}, cap versus cash by season`,
                  'source marts: player_season_cap, dead_money_ledger',
                  'A dead-money marker names the club that ate the charge, which is not always the club on the row: the source table follows the player, not the charge.',
                  'No value grade is computed or published for any player.',
                ])}
              />
            ) : undefined
          }
        />
        {b.capVsCash.state === 'blank' ? (
          <BoundaryMessage body={b.capVsCash.reason} />
        ) : (
          <CapVsCash
            points={capRows}
            playerName={b.name}
            coverage={{
              statement: `Seasons ${capRows[0]?.season ?? ''}–${capRows[capRows.length - 1]?.season ?? ''} from the contract record. Where a source is silent the year carries no bar rather than a zero.`,
            }}
          />
        )}
        {deadCharges.length ? (
          <ChartCaption>
            {deadCharges.length} season{deadCharges.length === 1 ? '' : 's'} carry a charge from the
            marquee ledger:{' '}
            {deadCharges
              .map(
                (r) =>
                  `${r.season} — ${r.deadMoney?.team ?? 'unknown club'}${
                    r.deadMoney?.usd ? ` (${usdShort(r.deadMoney.usd)})` : ''
                  }`,
              )
              .join(' · ')}
            .
          </ChartCaption>
        ) : null}
      </Card>

      {/* ── 5. AVAILABILITY ──────────────────────────────────────────────── */}
      <Card ariaLabel="Availability">
        <CardHeader
          eyebrow="Games and snaps"
          title="AVAILABILITY"
          right={
            availRows.length ? (
              <CsvExport
                title="Availability"
                filename={`yieldyard_player_${b.playerId}_availability.csv`}
                table={csvTable(availRows, [
                  { key: 'season', label: 'season', get: (r) => r.season },
                  { key: 'team', label: 'team', get: (r) => r.team },
                  { key: 'games', label: 'games', get: (r) => r.games },
                  { key: 'off', label: 'off_snaps', get: (r) => r.offSnaps },
                  { key: 'def', label: 'def_snaps', get: (r) => r.defSnaps },
                  { key: 'st', label: 'st_snaps', get: (r) => r.stSnaps },
                  { key: 'off_pct', label: 'off_pct_fraction', get: (r) => r.offPct },
                ], [
                  `YIELD/YARD — ${b.name}, availability`,
                  'source mart: player_season_availability',
                  `Games run the full record; snap counts begin in ${SNAPS_FIRST_SEASON} (the 2012 source file is empty).`,
                  'off_pct is a 0-1 fraction, not 0-100.',
                ])}
              />
            ) : undefined
          }
        />
        {b.availability.state === 'blank' ? (
          <BoundaryMessage body={b.availability.reason} />
        ) : (
          <>
            <StatGrid>
              <KpiTile
                label="Seasons on record"
                value={String(availRows.length)}
              />
              <KpiTile
                label="Games"
                value={String(availRows.reduce((n, r) => n + (r.games ?? 0), 0))}
              />
              <KpiTile
                label="First season"
                value={String(availRows[0]?.season ?? '—')}
              />
              <KpiTile
                label="Latest season"
                value={String(availRows[availRows.length - 1]?.season ?? '—')}
              />
            </StatGrid>
            <div className={css.tableScroll}>
              <table className={css.table}>
                <thead>
                  <tr>
                    <th scope="col" className="yy-label-lg">
                      Season
                    </th>
                    <th scope="col" className="yy-label-lg">
                      Team
                    </th>
                    <th scope="col" className={`yy-label-lg ${css.num}`}>
                      Games
                    </th>
                    <th scope="col" className={`yy-label-lg ${css.num}`}>
                      Off snaps
                    </th>
                    <th scope="col" className={`yy-label-lg ${css.num}`}>
                      Def snaps
                    </th>
                    <th scope="col" className={`yy-label-lg ${css.num}`}>
                      ST snaps
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {availRows.map((r) => (
                    <tr key={`${r.season}-${r.team}`}>
                      <th scope="row" className="yy-num">
                        {r.season}
                      </th>
                      <td className="yy-label">{r.team}</td>
                      <td className={`yy-num ${css.num}`}>{r.games ?? '—'}</td>
                      <td className={`yy-num ${css.num}`}>
                        {r.season < SNAPS_FIRST_SEASON ? (
                          <span className="yy-label">Pre-2013</span>
                        ) : (
                          (r.offSnaps ?? '—')
                        )}
                      </td>
                      <td className={`yy-num ${css.num}`}>
                        {r.season < SNAPS_FIRST_SEASON ? (
                          <span className="yy-label">Pre-2013</span>
                        ) : (
                          (r.defSnaps ?? '—')
                        )}
                      </td>
                      <td className={`yy-num ${css.num}`}>
                        {r.season < SNAPS_FIRST_SEASON ? (
                          <span className="yy-label">Pre-2013</span>
                        ) : (
                          (r.stSnaps ?? '—')
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {/* The boundary is stated, not absorbed. */}
        <ChartCaption>{b.snapsBoundaryNote}</ChartCaption>
      </Card>

      {/* ── image provenance ─────────────────────────────────────────────── */}
      <Card ariaLabel="Image provenance">
        <CardHeader eyebrow="Provenance" title="THIS PHOTOGRAPH" />
        {mark.kind === 'photo' ? (
          <>
            <p className="yy-caption">
              {mark.attribution}
              {mark.licenseUrl ? (
                <>
                  {' · '}
                  <a href={mark.licenseUrl} rel="license noopener noreferrer" target="_blank">
                    {mark.license}
                  </a>
                </>
              ) : null}
            </p>
            <p className="yy-caption">
              The file is stored byte-untouched and the duotone treatment is applied in CSS at
              render time, so no fixed derivative is created.{' '}
              {mark.shareAlike ? 'This asset is ShareAlike.' : null}
            </p>
            <div style={{ display: 'flex', gap: 'var(--yy-space-2)', flexWrap: 'wrap' }}>
              <Chip kind="verified" title="Image and licence status audited" />
            </div>
            <Link className="yy-label" href="/credits">
              Full credits and licences →
            </Link>
          </>
        ) : (
          <>
            <p className="yy-caption">
              No usable photograph clears this product&rsquo;s resolution floor and licence audit for
              this player, so the identity chip renders the designed roster card instead. It is a
              designed state, not a missing image.
            </p>
            <Link className="yy-label" href="/credits">
              Full credits and licences →
            </Link>
          </>
        )}
      </Card>

      {/* ── 6. PRODUCTION LINE ───────────────────────────────────────────── */}
      <Card ariaLabel="Production">
        <CardHeader eyebrow="Position-appropriate" title="PRODUCTION" />
        <BoundaryMessage body="Not available — per-player production (passing, rushing, receiving, defensive counts) is not in the current data snapshot. Nothing here is estimated to fill the gap." />
      </Card>
    </>
  );
}
