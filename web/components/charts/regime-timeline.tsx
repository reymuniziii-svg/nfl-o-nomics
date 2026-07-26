/**
 * `RegimeTimeline` — the coaching stability track and the regime markers.
 * `SPEC.md` §3.2.6, §2.8.
 *
 * A horizontal band across the 2000–2025 axis showing HC / OC / DC tenure runs,
 * with regime-change markers sitting on it.
 *
 * `SPEC.md` §3.2.6 describes *selecting* a marker to open the two dated
 * dead-money chips for `s+1` and `s+2`. **They are rendered inline instead, and
 * always.** Dead money is exempt from the disclosure pattern entirely
 * (`MOBILE_PATTERNS.md` §3.4, `DECISIONS.md` 74): value, date and stage render
 * together, on one line, and never behind a tap. Putting the chips behind a
 * marker selection would be the one thing this system forbids everywhere else.
 */

import css from './chart.module.css';
import shell from './regime.module.css';
import { AsOf, BlankReason, ChartCaption } from '../primitives';
import { chartId, scaleLinear } from './chart-kit';
import { usdShort } from '@/lib/display';
import type { RegimeEvent, StabilityRow } from '@/lib/data/team';
import type { Coverage } from '@/lib/display';

/**
 * SVG ACCESSIBLE NAMES ARE ATTRIBUTES, NOT ELEMENTS.
 *
 * `CHART_ANATOMY.md` §8 specifies `role="img"` plus `<title>`/`<desc>` on the
 * `<svg>`. React 19 HOISTS `<title>` as document metadata even inside the SVG
 * namespace: the server emits an empty `<title id>` in the chart and moves its
 * text to the document title slot, the client renders it in place, and the page
 * fails hydration and is regenerated wholesale. The same semantics are carried
 * here by `aria-label` (the name) and `aria-describedby` pointing at a
 * visually-hidden paragraph (the description) — identical to a screen reader,
 * and it survives the hoist.
 */

interface Run {
  role: 'HC' | 'OC' | 'DC';
  name: string;
  from: number;
  to: number;
}

function runsFor(track: StabilityRow[], role: Run['role']): Run[] {
  const pick = (r: StabilityRow) => (role === 'HC' ? r.hc : role === 'OC' ? r.oc : r.dc);
  const runs: Run[] = [];
  for (const row of track) {
    const name = pick(row);
    const last = runs[runs.length - 1];
    if (last && last.name === name && row.season === last.to + 1) {
      last.to = row.season;
    } else {
      runs.push({ role, name, from: row.season, to: row.season });
    }
  }
  return runs;
}

const ROLES: Run['role'][] = ['HC', 'OC', 'DC'];

export function RegimeTimeline({
  track,
  regimes,
  team,
  currentSeason,
  coverage,
}: {
  track: StabilityRow[];
  regimes: RegimeEvent[];
  team: string;
  currentSeason: number;
  coverage: Coverage;
}) {
  if (!track.length) {
    return <ChartCaption>{coverage.statement}</ChartCaption>;
  }

  const first = track[0].season;
  const last = track[track.length - 1].season;

  const W = 900;
  const rowH = 26;
  const gap = 6;
  const ml = 34;
  const mr = 12;
  const mt = 8;
  const mb = 34;
  const innerW = W - ml - mr;
  const H = mt + ROLES.length * (rowH + gap) + mb;
  const id = chartId('rgm', team);

  const x = scaleLinear()
    .domain([first, last + 1])
    .range([0, innerW]);

  const tickSeasons: number[] = [];
  for (let s = Math.ceil(first / 5) * 5; s <= last; s += 5) tickSeasons.push(s);

  return (
    <div>
      <div className={shell.scroll}>
        <svg
          className={css.svg}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${team} — coaching tenure, ${first} to ${last}`}
          aria-describedby={`${id}-d`}
          style={{ minWidth: '640px' }}
        >
          <g transform={`translate(${ml},${mt})`}>
            {ROLES.map((role, ri) => {
              const y0 = ri * (rowH + gap);
              return (
                <g key={role}>
                  <text className={css.tick} x={-8} y={y0 + rowH / 2 + 4} textAnchor="end">
                    {role}
                  </text>
                  {runsFor(track, role).map((run) => {
                    const x0 = x(run.from);
                    const x1 = x(run.to + 1);
                    const w = Math.max(2, x1 - x0 - 2);
                    const isCurrent = run.from <= currentSeason && currentSeason <= run.to;
                    return (
                      <g key={`${role}-${run.from}`}>
                        <rect
                          x={x0}
                          y={y0}
                          width={w}
                          height={rowH}
                          rx={2}
                          fill={isCurrent ? 'var(--yy-accent)' : 'var(--yy-bg-sunken)'}
                          opacity={isCurrent ? 0.9 : 1}
                        />
                        {w > 54 ? (
                          <text
                            className={css.micro}
                            x={x0 + 6}
                            y={y0 + rowH / 2 + 3}
                            fill={isCurrent ? 'var(--yy-fg-on-accent)' : 'var(--yy-fg-2)'}
                          >
                            {run.name}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* regime-change markers — a stem through the whole band */}
            {regimes.map((r) => (
              <line
                key={`m${r.season}`}
                x1={x(r.season)}
                x2={x(r.season)}
                y1={-4}
                y2={ROLES.length * (rowH + gap)}
                stroke="var(--yy-negative-fill)"
                strokeWidth={1}
                style={
                  r.kind === 'in_season' ? { strokeDasharray: 'var(--yy-dash-absence)' } : undefined
                }
              />
            ))}

            <line
              x1={0}
              x2={innerW}
              y1={ROLES.length * (rowH + gap)}
              y2={ROLES.length * (rowH + gap)}
              stroke="var(--yy-axis)"
              strokeWidth={1}
            />
            {tickSeasons.map((s) => (
              <text
                key={s}
                className={css.tick}
                x={x(s)}
                y={ROLES.length * (rowH + gap) + 18}
                textAnchor="middle"
              >
                &rsquo;{String(s).slice(2)}
              </text>
            ))}
          </g>
        </svg>
        <p id={`${id}-d`} className="yy-visually-hidden">
          Three bands showing head coach, offensive coordinator and defensive coordinator tenure
          runs across the season axis, with a marker at each head-coach change.
        </p>
      </div>

      <ChartCaption>
        A regime marker is a head-coach change. Solid marks an offseason change, dashed marks an
        in-season one. The two dated dead-money readings that follow each change are printed below —
        they are never behind a tap.
      </ChartCaption>

      <ul className={shell.list}>
        {regimes.map((r) => (
          <li className={shell.item} key={`${r.season}-${r.regimeId}`}>
            <p className={`yy-label ${shell.itemHead}`}>
              {r.season} · {r.kind === 'in_season' ? 'In-season' : 'Offseason'} · {r.outgoingHc} →{' '}
              {r.incomingHc}
            </p>
            {[r.dmNext1, r.dmNext2].map((dm, i) => (
              <p className={shell.itemDm} key={i}>
                <span className={`yy-label ${shell.itemDmSeason}`}>
                  {dm.season ?? `${r.season + i + 1}`} dead money
                </span>{' '}
                {dm.state === 'value' && dm.usd !== null && dm.asOf ? (
                  <AsOf value={usdShort(dm.usd)} date={dm.asOf.date} stage={dm.asOf.stage} />
                ) : (
                  <BlankReason
                    reason={dm.reason ?? 'Not available — no league-wide table was published.'}
                    inline
                  />
                )}
              </p>
            ))}
          </li>
        ))}
      </ul>

      <ChartCaption>{coverage.statement}</ChartCaption>
    </div>
  );
}
