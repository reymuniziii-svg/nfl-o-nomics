import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPlayerBundle, getPlayerPopulation } from '@/lib/data';
import { playerMark } from '@/lib/marks';
import { num, pct, usd } from '@/lib/format';
import { Definitions, MetricValue, Note, PlayerMarkView, Row, Section } from '@/components/shell';

/**
 * `SPEC.md` §6 — `/player/{id}` where `{id}` is `otc_id`. Static, ~251 pages.
 *
 * DECISIONS 53 caps the v1 population at the 251 audited players, so every page
 * has known image status and known licence metadata. `dynamicParams = false`
 * makes an id outside that population a 404 rather than a page with no photo
 * provenance.
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
  return b ? { title: b.name } : {};
}

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await getPlayerBundle(id);
  if (!b) notFound();

  const mark = playerMark(b.playerId, b.name);

  return (
    <>
      {/* 2. IDENTITY CHIP — PlayerMark + name + position + team + VISIBLE credit. */}
      <h1>
        <PlayerMarkView mark={mark} /> {b.name}
      </h1>
      <Definitions>
        <Row label="Position">{b.position ?? <span className="yy-blank">not recorded</span>}</Row>
        <Row label="Team">
          {b.team ? <Link href={`/team/${b.team.toLowerCase()}`}>{b.team}</Link> : <span className="yy-blank">not recorded</span>}
        </Row>
        <Row label="otc_id">{b.playerId}</Row>
        <Row label="gsis_id">{b.gsisId ?? <span className="yy-blank">not bridged</span>}</Row>
      </Definitions>

      {mark.kind === 'photo' ? (
        <Note>
          Photo: {mark.attribution}
          {mark.licenseUrl ? (
            <>
              {' · '}
              <a href={mark.licenseUrl} rel="license noreferrer">
                {mark.license}
              </a>
            </>
          ) : null}
          {mark.shareAlike ? ' · ShareAlike' : ''} · treatment {mark.treatment.replace(/_/g, ' ')} ·{' '}
          <a href={mark.sourcePageUrl} rel="noreferrer">
            source file
          </a>
          {b.image.lastVerifiedAt ? ` · last verified ${b.image.lastVerifiedAt}` : ''}
        </Note>
      ) : (
        <Note>
          No photo. The designed card renders instead — reason: {mark.reason.replace(/_/g, ' ')}.
        </Note>
      )}

      {/* 3. CONTRACT CARD. */}
      <Section title="Contract">
        <MetricValue
          metric={b.contract}
          format={(c) => (
            <Definitions>
              <Row label="Year signed">{c.yearSigned ?? '—'}</Row>
              <Row label="Years">{c.years ?? '—'}</Row>
              <Row label="Value">{c.value === null ? '—' : usd(c.value)}</Row>
              <Row label="APY">{c.apy === null ? '—' : usd(c.apy)}</Row>
              <Row label="Guaranteed">{c.guaranteed === null ? '—' : usd(c.guaranteed)}</Row>
              <Row label="APY as % of cap">
                {c.apyCapPct === null ? '—' : pct(c.apyCapPct, 2)}
              </Row>
            </Definitions>
          )}
        />
      </Section>

      {/* 4. CAP VS CASH BY YEAR, with dead-money markers. */}
      <Section title="Cap and cash by year">
        <Note>
          A dead-money marker carries the team that ate the charge, which is not necessarily the
          team on this player’s row for that year — the source table follows the player, not the
          charge.
        </Note>
        <MetricValue
          metric={b.capVsCash}
          format={(rows) => (
            <div className="yy-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Season</th>
                    <th scope="col">Team</th>
                    <th scope="col" className="yy-num">
                      Cap number
                    </th>
                    <th scope="col" className="yy-num">
                      Cash paid
                    </th>
                    <th scope="col" className="yy-num">
                      % of adjusted cap
                    </th>
                    <th scope="col">Dead-money marker</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.season}-${r.team}`}>
                      <th scope="row">
                        <Link href={`/team/${r.team.toLowerCase()}/${r.season}`}>{r.season}</Link>
                      </th>
                      <td>{r.team}</td>
                      <td className="yy-num">{usd(r.capNumber)}</td>
                      <td className="yy-num">
                        {r.cashPaid === null ? (
                          <span className="yy-blank">not recorded</span>
                        ) : (
                          usd(r.cashPaid)
                        )}
                      </td>
                      <td className="yy-num">
                        {r.capPercent === null ? (
                          <span className="yy-blank">not recorded</span>
                        ) : (
                          pct(r.capPercent, 2)
                        )}
                      </td>
                      <td>
                        {r.deadMoney ? (
                          <>
                            {r.deadMoney.usd === null ? 'charge' : usd(r.deadMoney.usd)} · charged
                            to {r.deadMoney.team ?? 'unrecorded team'}
                            {r.deadMoney.seasons ? ` · ${r.deadMoney.seasons}` : ''}
                          </>
                        ) : (
                          ''
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        />
      </Section>

      {/* 5. AVAILABILITY — games, and snaps 2013+. The boundary is stated. */}
      <Section title="Availability">
        <Note>{b.snapsBoundaryNote}</Note>
        <MetricValue
          metric={b.availability}
          format={(rows) => (
            <div className="yy-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Season</th>
                    <th scope="col">Team</th>
                    <th scope="col" className="yy-num">
                      Games
                    </th>
                    <th scope="col" className="yy-num">
                      Off snaps
                    </th>
                    <th scope="col" className="yy-num">
                      Def snaps
                    </th>
                    <th scope="col" className="yy-num">
                      ST snaps
                    </th>
                    <th scope="col" className="yy-num">
                      Off %
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.season}-${r.team}`}>
                      <th scope="row">{r.season}</th>
                      <td>{r.team}</td>
                      <td className="yy-num">{r.games ?? '—'}</td>
                      <td className="yy-num">{r.offSnaps ?? '—'}</td>
                      <td className="yy-num">{r.defSnaps ?? '—'}</td>
                      <td className="yy-num">{r.stSnaps ?? '—'}</td>
                      <td className="yy-num">
                        {r.offPct === null ? '—' : `${num(r.offPct * 100, 1)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        />
      </Section>

      {/* 7. NO VALUE GRADE. EVER. */}
      <Section title="What this page does not have">
        <Note>
          No composite player rating, no letter grade, no “worth it / not worth it” verdict, no
          star count and no invented per-player score. That is a published product commitment, not
          an omission.
        </Note>
      </Section>
    </>
  );
}
