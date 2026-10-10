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
import { AsOf, BlankReason, ChartCaption, Legend } from '../primitives';
import { chartId, scaleLinear } from './chart-kit';
import { usdShort } from '@/lib/display';
import { ScrollToX } from '../team/scroll-to-x';
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

/**
 * `etl/coaching.py` writes `NONE@<head coach>` when a club carried no separate
 * coordinator and the head coach absorbed the role. That is INTERNAL SHORTHAND
 * and it is not a name: printing `NONE@BILL BELICHICK` to a reader is a leak of
 * the pipeline into the page. It is translated here, at the display layer, and
 * nowhere else — the mart keeps its sentinel.
 */
const NONE_PREFIX = 'NONE@';

function displayName(role: Run['role'], raw: string): string {
  if (!raw.startsWith(NONE_PREFIX)) return raw;
  const hc = raw.slice(NONE_PREFIX.length).trim();
  const surname = hc.split(/\s+/).slice(-1)[0] || hc;
  return hc ? `No ${role} — ${surname} called it` : `No ${role} on record`;
}

/**
 * A run label is drawn inside its own band and must never overrun into the next
 * one. The athletic face at 10px tracked runs ≈ 6.1px per character; the gate is
 * measured against the actual string rather than a fixed pixel width, and a
 * label that cannot fit is dropped rather than allowed to collide (the run is
 * still readable from the list beneath, which carries every change in words).
 */
const MICRO_CHAR_W = 6.1;

function fits(label: string, runWidth: number): boolean {
  return label.length * MICRO_CHAR_W + 12 <= runWidth;
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
      <ScrollToX
        className={shell.scroll}
        x={ml + x(Math.min(Math.max(currentSeason, first), last))}
        label="Coaching tenure — scroll sideways"
      >
        {/* The band paints at its INTRINSIC 900 units — scale exactly 1.0 —
          inside the scroller, so its 10px type is 10px and not the 7.8px a
          640px squeeze produced (`DECISIONS.md` 65). */}
        <svg
          className={css.svgFixed}
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${team} — coaching tenure, ${first} to ${last}`}
          aria-describedby={`${id}-d`}
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
                    // ONE LIME PER CHART (`CHART_ANATOMY.md` §1.2). v1 lit the
                    // current HC, OC and DC runs all lime. Only the head coach —
                    // the regime — takes it; the current coordinators are
                    // outlined in the primary ink instead.
                    const lime = isCurrent && role === 'HC';
                    const label = displayName(role, run.name);
                    return (
                      <g key={`${role}-${run.from}`}>
                        <rect
                          x={x0 + (isCurrent && !lime ? 0.75 : 0)}
                          y={y0 + (isCurrent && !lime ? 0.75 : 0)}
                          width={w - (isCurrent && !lime ? 1.5 : 0)}
                          height={rowH - (isCurrent && !lime ? 1.5 : 0)}
                          rx={2}
                          fill={lime ? 'var(--yy-accent)' : 'var(--yy-bg-sunken)'}
                          stroke={isCurrent && !lime ? 'var(--yy-fg-1)' : undefined}
                          strokeWidth={isCurrent && !lime ? 1.5 : undefined}
                        />
                        {/* Color comes from a CLASS, not a presentation
                          attribute: `.micro` used to declare `fill` and a CSS
                          declaration always beats an attribute, so the
                          on-accent ink never reached the element. */}
                        {fits(label, w) ? (
                          <text
                            className={`${css.micro} ${lime ? css.microOnAccent : css.microOnSunken}`}
                            x={x0 + 6}
                            y={y0 + rowH / 2 + 3}
                          >
                            {label}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* Regime-change markers — a stem through the whole band.
              A REGIME CHANGE IS AN EVENT, NOT A NEGATIVE. Red is reserved for
              genuine negatives (`SPEC.md` §4) and, per `DECISIONS.md` 72, only
              where a benchmark renders on the same surface; neither holds here.
              Marking Andy Reid's arrival in the ink the system uses for "you
              paid more per win than the league" grades a front office, which
              this page promises never to do. The solid/dashed distinction still
              carries offseason vs in-season without hue, and the legend names
              it in words. */}
            {regimes.map((r) => (
              <line
                key={`m${r.season}`}
                x1={x(r.season)}
                x2={x(r.season)}
                y1={-4}
                y2={ROLES.length * (rowH + gap)}
                stroke="var(--yy-fg-dim)"
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
          Three bands show tenure runs for the head coach (HC), offensive coordinator (OC) and
          defensive coordinator (DC) across the season axis. A marker sits at each head-coach
          change.
        </p>
      </ScrollToX>

      <Legend
        items={[
          { swatch: 'solid', label: `Head coach in ${currentSeason}`, tone: 'accent' },
          { swatch: 'absence', label: 'Head-coach change (solid = offseason, dashed = in-season)', tone: 'absence' },
        ]}
      />

      <ChartCaption>
        {`Lime marks the ${currentSeason} head coach, with that season’s coordinators outlined. Each head-coach change starts a new regime. It is an event, not a verdict, so its marker never takes the negative color. The dead-money readings after each change are listed below.`}
      </ChartCaption>

      <ul className={shell.list}>
        {regimes.map((r) => {
          const dms = [r.dmNext1, r.dmNext2];
          const allBlank = dms.every((dm) => !(dm.state === 'value' && dm.usd !== null && dm.asOf));
          return (
            <li className={shell.item} key={`${r.season}-${r.regimeId}`}>
              <p className={`yy-label ${shell.itemHead}`}>
                {r.season} · {r.kind === 'in_season' ? 'In-season' : 'Offseason'} · {r.outgoingHc} →{' '}
                {r.incomingHc}
              </p>
              {/* Changes whose two follow-on seasons both lack a reading are
                  summarized ONCE below — v1 printed the same reason ten times. */}
              {allBlank
                ? null
                : dms.map((dm, i) => (
                    <p className={shell.itemDm} key={i}>
                      <span className={`yy-label ${shell.itemDmSeason}`}>
                        {dm.season ?? `${r.season + i + 1}`} dead money
                      </span>{' '}
                      {dm.state === 'value' && dm.usd !== null && dm.asOf ? (
                        <>
                          <AsOf value={usdShort(dm.usd)} date={dm.asOf.date} stage={dm.asOf.stage} />
                          {/* `SPEC.md` §2.8 step 7 — beside the league median for its own season. */}
                          {dm.leagueMedianUsd !== null ? (
                            <span className={`yy-label ${shell.itemMedian}`}>
                              {' '}
                              · league median {usdShort(dm.leagueMedianUsd)}
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <BlankReason
                          reason={dm.reason ?? 'Not available — no league-wide table was published.'}
                          inline
                        />
                      )}
                    </p>
                  ))}
            </li>
          );
        })}
      </ul>
      <BlankRegimeSummary regimes={regimes} />

      <ChartCaption>{coverage.statement}</ChartCaption>
    </div>
  );
}

/**
 * One line for every regime change with no dated dead-money reading in either
 * follow-on season, grouped by reason. The reason still renders — in full,
 * once — and every season it covers is named.
 */
function BlankRegimeSummary({ regimes }: { regimes: RegimeEvent[] }) {
  // The mart's reason names its own season ("…published for 2002"); the
  // grouping key drops that year so one sentence can name every season.
  const groups = new Map<string, { changes: number[]; years: Set<number>; raw: string }>();
  for (const r of regimes) {
    const dms = [r.dmNext1, r.dmNext2];
    if (dms.some((dm) => dm.state === 'value' && dm.usd !== null && dm.asOf)) continue;
    const raw = dms.find((dm) => dm.reason)?.reason ?? 'Not available — no league-wide table was published.';
    const key = raw.replace(/\s+for\s+\d{4}\.?$/, '');
    const g = groups.get(key) ?? { changes: [], years: new Set<number>(), raw };
    g.changes.push(r.season);
    dms.forEach((dm, i) => g.years.add(dm.season ?? r.season + i + 1));
    groups.set(key, g);
  }
  if (!groups.size) return null;
  return (
    <>
      {[...groups.entries()].map(([key, g]) => {
        const years = [...g.years].sort((a, b) => a - b);
        const reason = key === g.raw ? g.raw : `${key} for ${listYears(years)}.`;
        return (
          <p key={key} className={`yy-caption ${shell.blankSummary}`}>
            <span className={`yy-label ${shell.itemDmSeason}`}>
              Dead money after the {listYears(g.changes)} change{g.changes.length === 1 ? '' : 's'}
            </span>{' '}
            <BlankReason reason={reason} inline />
          </p>
        );
      })}
    </>
  );
}

function listYears(ys: number[]): string {
  if (ys.length === 1) return String(ys[0]);
  return `${ys.slice(0, -1).join(', ')} and ${ys[ys.length - 1]}`;
}
