import Link from 'next/link';
import type { Metadata } from 'next';
import {
  canonicalPair,
  formatRef,
  getCompareBundle,
  latestSeason,
  parseRef,
  type BenchmarkSide,
} from '@/lib/data';
import { num, signed, usdCompact } from '@/lib/format';
import { MetricValue, Note, Section } from '@/components/shell';

/**
 * `SPEC.md` §6 — `/compare?a={abbr}-{season}&b={abbr}-{season}`, ON DEMAND.
 *
 * This is the only route that cannot be enumerated: 861 x 861 ordered pairs is
 * 741k combinations, of which realistically a few hundred get visited. It renders
 * on first request and is cached at the edge by the long `Cache-Control` set for
 * `/compare` in `next.config.ts`; a canonical ordering collapses each unordered
 * pair to one cache entry. It revalidates only when the data snapshot changes,
 * which is a redeploy (`ARCHITECTURE.md` §2, §6).
 */
export const revalidate = 31536000;

export const metadata: Metadata = { title: 'Head-to-head' };

function fmt(unit: string, v: number): string {
  switch (unit) {
    case 'usd':
      return usdCompact(v);
    case 'rate':
      return num(v, 4);
    case 'index':
      return num(v, 1);
    default:
      return num(v, 1);
  }
}

function SideCell({ side, unit }: { side: BenchmarkSide; unit: string }) {
  return (
    <td>
      <MetricValue metric={side.raw} format={(v) => fmt(unit, v)} />
      {side.delta !== null ? (
        <>
          {' '}
          <span className="yy-asof-line">
            {unit === 'usd'
              ? `${side.delta >= 0 ? '+' : '−'}${usdCompact(Math.abs(side.delta))} vs its own season`
              : unit === 'rate'
                ? `${signed(side.delta, 4)} vs its own season`
                : `${signed(side.delta, 1)} vs its own season`}
          </span>
        </>
      ) : null}
    </td>
  );
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const sp = await searchParams;
  const aRef = parseRef(sp.a);
  const bRef = parseRef(sp.b);

  if (!aRef || !bRef) {
    const season = await latestSeason();
    return (
      <>
        <h1>Head-to-head</h1>
        <Note>
          Pick two team-seasons. The URL carries them:{' '}
          <code>/compare?a=kc-{season}&amp;b=sf-2023</code>.
        </Note>
        <Section title="Try one">
          <ul>
            <li>
              <Link href={`/compare?a=kc-${season}&b=sf-2023`}>
                Kansas City {season} vs San Francisco 2023
              </Link>
            </li>
            <li>
              <Link href="/compare?a=ne-2007&b=kc-2024">New England 2007 vs Kansas City 2024</Link>
            </li>
            <li>
              <Link href="/compare?a=la-2003&b=la-2024">
                Rams 2003 (St. Louis) vs Rams 2024 (Los Angeles)
              </Link>
            </li>
          </ul>
        </Section>
      </>
    );
  }

  const [ca, cb] = canonicalPair(aRef, bRef);
  const bundle = await getCompareBundle(ca, cb);

  if (!bundle) {
    return (
      <>
        <h1>Head-to-head</h1>
        <Note>
          One of those team-seasons is not in the record. Franchises that did not exist in a season
          have no row: Houston enters 2002.
        </Note>
      </>
    );
  }

  return (
    <>
      <h1>
        {bundle.aLabel} vs {bundle.bLabel}
      </h1>

      {/* Cross-era legitimacy statement — rendered in the UI, not buried. */}
      <p>{bundle.crossEraStatement}</p>
      <Note>
        Canonical URL for this pair: <code>/compare?a={formatRef(ca)}&amp;b={formatRef(cb)}</code>
      </Note>

      <Section title="Stacked benchmark comparison">
        <Note>
          Each metric is paired against the league average of its own season, so the comparison is
          between two distances from average rather than two raw numbers. Where one side is
          pre-2013, the Tier 2 rows carry the boundary message on that side only and the Tier 1
          rows compare normally.
        </Note>
        <div className="yy-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Metric</th>
                <th scope="col">Tier</th>
                <th scope="col">{bundle.aLabel}</th>
                <th scope="col">{bundle.bLabel}</th>
                <th scope="col">League average</th>
              </tr>
            </thead>
            <tbody>
              {bundle.rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">{r.label}</th>
                  <td>
                    <span className="yy-badge">Tier {r.tier}</span>
                  </td>
                  <SideCell side={r.a} unit={r.unit} />
                  <SideCell side={r.b} unit={r.unit} />
                  <td className="yy-asof-line">
                    {r.a.leagueAvg === null && r.b.leagueAvg === null
                      ? 'no level benchmark'
                      : [r.a, r.b]
                          .map((s) =>
                            s.leagueAvg === null
                              ? '—'
                              : r.unit === 'usd'
                                ? usdCompact(s.leagueAvg)
                                : r.unit === 'rate'
                                  ? num(s.leagueAvg, 4)
                                  : num(s.leagueAvg, 1),
                          )
                          .join(' / ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Both pages">
        <ul>
          <li>
            <Link href={`/team/${ca.team.toLowerCase()}/${ca.season}`}>{bundle.aLabel}</Link>
          </li>
          <li>
            <Link href={`/team/${cb.team.toLowerCase()}/${cb.season}`}>{bundle.bLabel}</Link>
          </li>
        </ul>
      </Section>
    </>
  );
}
