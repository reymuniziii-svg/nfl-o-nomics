/**
 * The Home / Division shell — `SPEC.md` §3.1.
 *
 * `/` and `/division/{div}` render the same five blocks; `/` is the AFC East
 * default. Shared here so the two routes cannot drift.
 */

import Link from 'next/link';
import {
  getHomeBundle,
  type LeaderboardRow,
} from '@/lib/data';
import { DIVISION_ALIGNMENT_NOTE } from '@/lib/metric';
import { DIVISION_SLUGS, divisionName, type DivisionSlug } from '@/lib/teams';
import { teamMark } from '@/lib/marks';
import { num, record, usd, usdCompact } from '@/lib/format';
import { Definitions, MetricValue, Note, Row, Section, TeamMarkView } from '@/components/shell';

export async function DivisionView({ slug }: { slug: DivisionSlug }) {
  const { season, division, leaderboard, ledger, entryCards } = await getHomeBundle(slug);

  return (
    <>
      <h1>{division.name}</h1>
      <p className="yy-caveat">
        Season {season} — the most recent season with complete data. {DIVISION_ALIGNMENT_NOTE}
      </p>

      {/* 1. Division picker, sticky at top in the designed view. */}
      <Section title="Divisions">
        <nav aria-label="Division picker">
          {DIVISION_SLUGS.map((d) => (
            <Link key={d} href={`/division/${d}`} style={{ marginRight: '1rem' }}>
              {divisionName(d)}
            </Link>
          ))}
        </nav>
      </Section>

      {/* 2. Hero: division cost-per-win card. */}
      <Section title={`Cost per win · ${division.numeratorLabel}`}>
        <Note>{division.numeratorCaveat}</Note>
        <div className="yy-scroll">
          <table>
            <caption className="yy-caveat">
              Ranked cheapest first. A team with 0 wins shows total spend with an explicit “0
              wins” label and is excluded from the ratio ordering — the ratio is never rendered
              as infinity, “N/A” or a blank.
            </caption>
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col">Record</th>
                <th scope="col" className="yy-num">
                  Point diff
                </th>
                <th scope="col">Cost per win</th>
                <th scope="col">{leaderboard.capplusCovered ? 'Cap+' : 'Team Rating'}</th>
              </tr>
            </thead>
            <tbody>
              {division.teams.map((t) => (
                <tr key={t.team}>
                  <th scope="row">
                    <TeamMarkView mark={teamMark(t.team, t.teamName)} />{' '}
                    <Link href={`/team/${t.team.toLowerCase()}/${season}`}>{t.teamName}</Link>
                  </th>
                  <td>{record(t.wins, t.losses, t.ties)}</td>
                  <td className="yy-num">{t.pointDiff}</td>
                  <td>
                    <MetricValue
                      metric={t.costPerWin}
                      format={(c) =>
                        c.perWin === null ? c.zeroWinLabel : `${usdCompact(c.perWin)} per win`
                      }
                    />
                  </td>
                  <td className="yy-num">
                    <MetricValue metric={t.index} format={(v) => num(v, 1)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 3. League leaderboard — ALL 32 teams, not a top-10. */}
      <Section title={`League ${leaderboard.capplusCovered ? 'Cap+' : 'Team Rating'} · ${season}`}>
        <Note>{leaderboard.caption}</Note>
        <div className="yy-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col" className="yy-num">
                  Rank
                </th>
                <th scope="col">Team</th>
                <th scope="col">Record</th>
                <th scope="col">{leaderboard.rows[0]?.indexName ?? 'Index'}</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.rows.map((r: LeaderboardRow) => (
                <tr key={r.team}>
                  <td className="yy-num">{r.rank ?? '—'}</td>
                  <th scope="row">
                    <Link href={`/team/${r.team.toLowerCase()}/${season}`}>{r.teamName}</Link>
                  </th>
                  <td>{record(r.wins, r.losses, r.ties)}</td>
                  <td className="yy-num">
                    <MetricValue metric={r.index} format={(v) => num(v, 1)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* 4. Largest dead-money charges. */}
      <Section title="Largest dead-money charges">
        <MetricValue
          metric={ledger}
          format={(rows) => (
            <div className="yy-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Player</th>
                    <th scope="col">Team</th>
                    <th scope="col">Seasons</th>
                    <th scope="col" className="yy-num">
                      Total
                    </th>
                    <th scope="col">Verified</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => (
                    <tr key={`${c.player}-${c.seasons}`}>
                      <th scope="row">{c.player}</th>
                      <td>
                        <Link href={`/team/${c.team.toLowerCase()}`}>{c.team}</Link>
                      </td>
                      <td>{c.seasons}</td>
                      <td className="yy-num">{usd(c.totalUsd)}</td>
                      <td>
                        <span className="yy-badge">{c.isActual ? 'actual' : 'reported'}</span>{' '}
                        <span className="yy-asof-line">as of {c.verifiedAsof}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        />
      </Section>

      {/* 5. Entry cards — each seeded with a concrete example, never an empty state. */}
      <Section title="Start somewhere">
        <Definitions>
          {entryCards.map((c) => (
            <Row key={c.href} label={c.label}>
              <Link href={c.href}>{c.example}</Link>
            </Row>
          ))}
        </Definitions>
      </Section>
    </>
  );
}
