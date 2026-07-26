import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  allTeamSeasons,
  getTeamBundle,
  getTopCapHits,
  PROVISIONAL_COPY,
} from '@/lib/data';
import { ERA_CONTINUITY_NOTE, asOfLabel } from '@/lib/metric';
import { eraIdentity, toAbbr } from '@/lib/teams';
import { teamMark } from '@/lib/marks';
import { num, pct, record, signedPct, usd, usdCompact } from '@/lib/format';
import { Definitions, MetricValue, Note, Row, Section, TeamMarkView } from '@/components/shell';

/** `SPEC.md` §6 — `/team/{abbr}/{season}`, static, 861 pages. */
export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  const keys = await allTeamSeasons();
  return keys.map((k) => ({ abbr: k.team.toLowerCase(), season: String(k.season) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ abbr: string; season: string }>;
}): Promise<Metadata> {
  const { abbr, season } = await params;
  const team = toAbbr(abbr);
  if (!team) return {};
  const id = eraIdentity(team, Number(season));
  return { title: `${id.name} · ${season}` };
}

export default async function TeamSeasonPage({
  params,
}: {
  params: Promise<{ abbr: string; season: string }>;
}) {
  const { abbr, season: seasonRaw } = await params;
  const team = toAbbr(abbr);
  const season = Number(seasonRaw);
  if (!team || !Number.isInteger(season)) notFound();

  const b = await getTeamBundle(team, season);
  if (!b) notFound();

  return (
    <>
      {/* 1. HEADER — TeamMark + era-correct name + record + index badge. */}
      <h1>
        <TeamMarkView mark={teamMark(b.team, b.identity.name)} /> {b.identityLine}
      </h1>
      <p className="yy-caveat">
        {b.identity.location} · franchise code <code>{b.team}</code> (era code{' '}
        <code>{b.identity.eraCode}</code>). {ERA_CONTINUITY_NOTE}
      </p>

      <Definitions>
        <Row label="Record">
          <MetricValue
            metric={b.results}
            format={(r) => `${record(r.wins, r.losses, r.ties)} · ${r.games} games`}
          />
        </Row>
        <Row label="Points">
          <MetricValue
            metric={b.results}
            format={(r) => `${r.pointsFor} for · ${r.pointsAgainst} against · ${r.pointDiff} diff`}
          />
        </Row>
        <Row label={b.index.name}>
          {b.index.isCapPlus ? (
            <MetricValue
              metric={b.capplus}
              format={(c) => `${num(c.capplus, 1)} · rank ${c.seasonRank} of 32`}
            />
          ) : (
            <MetricValue metric={b.teamRating} format={(v) => num(v, 1)} />
          )}
        </Row>
      </Definitions>
      {b.capplus.state === 'value' && b.capplus.provisional ? (
        <Note>Provisional: {PROVISIONAL_COPY}</Note>
      ) : null}

      <nav aria-label="Season picker" className="yy-scroll">
        <p className="yy-caveat">
          {b.seasons.map((y) => (
            <span key={y} style={{ marginRight: '0.6rem' }}>
              {y === season ? <strong>{y}</strong> : <Link href={`/team/${abbr}/${y}`}>{y}</Link>}
            </span>
          ))}
        </p>
      </nav>

      {/* 2. 25-SEASON HISTORY — hard visual break at 2013. */}
      <Section title="Franchise history">
        <Note>
          Hard break at {b.history.breakSeason}. {b.history.bridgeSentence} Cap+ has no rows for{' '}
          {b.history.blankSeasons.join(', ')}; those seasons render as labelled gaps and are never
          interpolated.
        </Note>
        <div className="yy-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Season</th>
                <th scope="col" className="yy-num">
                  Team Rating (performance only)
                </th>
                <th scope="col">Cap+</th>
              </tr>
            </thead>
            <tbody>
              {b.history.points.map((p) => (
                <tr key={p.season}>
                  <th scope="row">
                    <Link href={`/team/${abbr}/${p.season}`}>{p.season}</Link>
                  </th>
                  <td className="yy-num">
                    <MetricValue metric={p.teamRating} format={(v) => num(v, 1)} />
                  </td>
                  <td>
                    <MetricValue metric={p.capplus} format={(v) => num(v, 1)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 3. THREE-LENS SUMMARY — each with its own caveat line. */}
      <Section title="The three lenses">
        {b.lenses.map((l) => (
          <div key={l.key}>
            <h3>{l.label}</h3>
            <Definitions>
              <Row label="Amount">
                <MetricValue metric={l.amount} format={(v) => usd(v)} />
              </Row>
              {l.sourceUrl ? (
                <Row label="Source">
                  <a href={l.sourceUrl} rel="nofollow noreferrer">
                    {new URL(l.sourceUrl).hostname}
                  </a>
                </Row>
              ) : null}
            </Definitions>
            <Note>{l.caveat}</Note>
          </div>
        ))}
      </Section>

      {/* 4. ALLOCATION — diverging from a zero-centred league-average axis. */}
      <Section title="Positional allocation">
        <Note>
          Share of cap held by players on the roster — never “% of cap”. It inherits the
          dead-money omission. Position as of the deal then in force.
        </Note>
        <MetricValue
          metric={b.allocation}
          format={(bars) => (
            <div className="yy-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Group</th>
                    <th scope="col" className="yy-num">
                      Cap
                    </th>
                    <th scope="col" className="yy-num">
                      Share
                    </th>
                    <th scope="col" className="yy-num">
                      League
                    </th>
                    <th scope="col" className="yy-num">
                      vs league
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bars.map((a) => (
                    <tr key={a.positionGroup}>
                      <th scope="row">{a.positionGroup}</th>
                      <td className="yy-num">{usdCompact(a.capUsd)}</td>
                      <td className="yy-num">{pct(a.shareOfRosteredCap)}</td>
                      <td className="yy-num">{pct(a.leagueShare)}</td>
                      <td className="yy-num">{signedPct(a.deltaVsLeague)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        />
      </Section>

      {/* 5. COST PER WIN — the zero-win rule is live. */}
      <Section title="Cost per win">
        <Definitions>
          <Row label={b.numeratorLabel}>
            <MetricValue
              metric={b.costPerWin}
              format={(c) =>
                c.perWin === null
                  ? c.zeroWinLabel
                  : `${usdCompact(c.perWin)} per win · ${usd(c.spend)} over ${c.wins} wins`
              }
            />
          </Row>
        </Definitions>
        <Note>{b.numeratorCaveat}</Note>
      </Section>

      {/* 6. COACHING STABILITY + REGIME TIMELINE. */}
      <Section title="Coaching stability">
        <MetricValue
          metric={b.stability}
          format={(x) => (
            <Definitions>
              <Row label="Stability Index">
                {num(x.stabilityIndex, 1)} / 100{x.windowTruncated ? ' (window truncated)' : ''}
              </Row>
              <Row label="Head coach">
                {x.hc} · season {x.hcTenureSeasons}
              </Row>
              <Row label="Offensive coordinator">
                {x.oc} · season {x.ocTenureSeasons}
              </Row>
              <Row label="Defensive coordinator">
                {x.dc} · season {x.dcTenureSeasons}
              </Row>
              <Row label="Regime">
                {x.regimeId} · year {x.regimeSeasonN}
              </Row>
            </Definitions>
          )}
        />
        {b.regimes.length ? (
          <div className="yy-scroll">
            <table>
              <caption className="yy-caveat">
                Regime changes, each with the two dated dead-money readings for s+1 and s+2.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Season</th>
                  <th scope="col">Change</th>
                  <th scope="col">s+1 dead money</th>
                  <th scope="col">s+2 dead money</th>
                </tr>
              </thead>
              <tbody>
                {b.regimes.map((r) => (
                  <tr key={r.season}>
                    <th scope="row">
                      {r.season} <span className="yy-badge">{r.kind.replace('_', ' ')}</span>
                    </th>
                    <td>
                      {r.outgoingHc} → {r.incomingHc}
                    </td>
                    {[r.dmNext1, r.dmNext2].map((dm, i) => (
                      <td key={i}>
                        {dm.state === 'value' && dm.usd !== null ? (
                          <>
                            {usdCompact(dm.usd)}{' '}
                            {dm.asOf ? (
                              <span className="yy-asof-line">{asOfLabel(dm.asOf)}</span>
                            ) : null}
                          </>
                        ) : (
                          <span className="yy-blank">
                            {dm.reason ?? 'Not available for this season.'}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Section>

      {/* 7. DEAD MONEY — dot plot, never a line. */}
      <Section title="Dead money">
        <Note>
          Renderer: {b.deadMoney.seriesRenderer.replace(/_/g, ' ')}. These are individually dated
          readings taken at different points in different league years, so they are never plotted
          as a connected series and never averaged.
        </Note>
        <Definitions>
          <Row label={`Resolved reading · ${season}`}>
            <MetricValue metric={b.deadMoney.resolved} format={(d) => usd(d.usd)} />
          </Row>
          {b.deadMoney.burdenOfAdjustedCap !== null ? (
            <Row label="Burden of adjusted cap">{pct(b.deadMoney.burdenOfAdjustedCap)}</Row>
          ) : null}
          {b.deadMoney.leagueMedianUsd !== null ? (
            <Row label="League median">{usdCompact(b.deadMoney.leagueMedianUsd)}</Row>
          ) : null}
        </Definitions>

        {b.deadMoney.alternates.length ? (
          <>
            <h3>Alternate readings</h3>
            <Note>
              Shown on request, never merged into the resolved figure and never averaged with it.
            </Note>
            <ul>
              {b.deadMoney.alternates.map((a) => (
                <li key={a.asOf.date}>
                  {usd(a.usd)} <span className="yy-asof-line">{asOfLabel(a.asOf)}</span> ·{' '}
                  {a.coverage} · {a.licenseTier}
                </li>
              ))}
            </ul>
          </>
        ) : null}

        {b.deadMoney.series.length ? (
          <div className="yy-scroll">
            <table>
              <caption className="yy-caveat">
                Every dated reading for this franchise — a dot plot with no connecting path.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Season</th>
                  <th scope="col" className="yy-num">
                    Dead money
                  </th>
                  <th scope="col">As of</th>
                  <th scope="col">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {b.deadMoney.series.map((d) => (
                  <tr key={`${d.season}-${d.asOf.date}`}>
                    <th scope="row">{d.season}</th>
                    <td className="yy-num">{usd(d.usd)}</td>
                    <td className="yy-asof-line">{asOfLabel(d.asOf)}</td>
                    <td>{d.coverage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {b.deadMoney.ledger.length ? (
          <>
            <h3>Marquee charges</h3>
            <ul>
              {b.deadMoney.ledger.map((l) => (
                <li key={`${l.player}-${l.seasons}`}>
                  {l.player} · {l.seasons} · {usd(l.totalUsd)}{' '}
                  <span className="yy-badge">{l.isActual ? 'actual' : 'reported'}</span>{' '}
                  <span className="yy-asof-line">verified {l.verifiedAsof}</span>
                  {l.splitBySeason ? ` · split ${l.splitBySeason}` : ' · split not established'}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Section>

      {/* 8. DRAFT ROI. */}
      <Section title="Draft class">
        <MetricValue
          metric={b.draft.summary}
          format={(d) => (
            <Definitions>
              <Row label="Picks">{d.nPicks}</Row>
              <Row label="Capital (Fitzgerald–Spielberger)">
                {d.capital.toLocaleString()} · rank {d.capitalRank} of 32
              </Row>
              <Row label="Realized return">
                {d.returnWAv ?? '—'} wAV · {d.returnGames ?? '—'} games ·{' '}
                {d.returnSeasonsStarted} seasons started
              </Row>
              <Row label="Excluded from return joins">{d.nExcludedNoGsis} (no gsis_id)</Row>
              <Row label="Snaps available">{d.snapsAvailable ? 'yes (2013+)' : 'no'}</Row>
            </Definitions>
          )}
        />
        <Definitions>
          <Row label="Dollar framing">
            <MetricValue metric={b.draft.dollarFraming} format={() => 'available'} />
          </Row>
        </Definitions>
        {b.draft.picks.length ? (
          <div className="yy-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col" className="yy-num">
                    Rd
                  </th>
                  <th scope="col" className="yy-num">
                    Pick
                  </th>
                  <th scope="col">Player</th>
                  <th scope="col">Pos</th>
                  <th scope="col" className="yy-num">
                    Chart value
                  </th>
                  <th scope="col" className="yy-num">
                    wAV
                  </th>
                </tr>
              </thead>
              <tbody>
                {b.draft.picks.map((p) => (
                  <tr key={p.pick}>
                    <td className="yy-num">{p.round}</td>
                    <td className="yy-num">{p.pick}</td>
                    <th scope="row">{p.playerName}</th>
                    <td>{p.position}</td>
                    <td className="yy-num">{p.chartValue.toLocaleString()}</td>
                    <td className="yy-num">
                      {p.wAv === null ? <span className="yy-blank">not joined</span> : p.wAv}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Section>

      {/* Roster economics — the top cap hits, linking into the player population. */}
      <TopCapHits season={season} team={b.team} />

      <Section title="Efficiency">
        <MetricValue
          metric={b.epa}
          format={(e) => (
            <Definitions>
              <Row label="Offence EPA/play">{num(e.offEpaPerPlay, 4)}</Row>
              <Row label="Defence EPA/play">{num(e.defEpaPerPlay, 4)}</Row>
              <Row label="Margin EPA/play">{num(e.epaMarginPerPlay, 4)}</Row>
              <Row label="Plays">
                {e.offPlays} offensive · {e.defPlays} defensive
              </Row>
            </Definitions>
          )}
        />
        <Note>Regular season only, pass and run plays only.</Note>
      </Section>
    </>
  );
}

async function TopCapHits({ season, team }: { season: number; team: string }) {
  const rows = await getTopCapHits(season, team, 10);
  if (!rows.length) return null;
  return (
    <Section title="Largest cap hits">
      <div className="yy-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Group</th>
              <th scope="col" className="yy-num">
                Cap number
              </th>
              <th scope="col" className="yy-num">
                Cash
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.otcId}>
                <th scope="row">
                  <Link href={`/player/${r.otcId}`}>{r.player ?? `Player ${r.otcId}`}</Link>
                </th>
                <td>{r.positionGroup ?? '—'}</td>
                <td className="yy-num">{usd(r.capNumber)}</td>
                <td className="yy-num">
                  {r.cashPaid === null ? <span className="yy-blank">not recorded</span> : usd(r.cashPaid)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
