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

/**
 * A season the record does not reach is NOT a season with no published table.
 *
 * `regime_events` carries the two follow-on dead-money slots for every regime
 * change, and for a change in the last season or two of the record those slots
 * point at seasons that have not been played. The mart's blank reason is the
 * league-table one — "no league-wide dead-money table was published for this
 * season" — which is a claim about publishing, and reads as an indictment of
 * sourcing for a year in which nothing has happened yet. The two absences are
 * different facts and the page says which one it is. Display-layer only: the
 * mart keeps its own reason, exactly as `displayName` leaves the `NONE@`
 * sentinel in place.
 */
function outsideRecord(season: number): string {
  return `Outside the record — ${season} has not been played.`;
}

export function RegimeTimeline({
  track,
  regimes,
  team,
  currentSeason,
  lastRecordedSeason,
  coverage,
}: {
  track: StabilityRow[];
  regimes: RegimeEvent[];
  team: string;
  currentSeason: number;
  /** The last season the snapshot holds. Beyond it, absence has a different reason. */
  lastRecordedSeason: number;
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
                    const label = displayName(role, run.name);
                    return (
                      <g key={`${role}-${run.from}`}>
                        <rect
                          x={x0}
                          y={y0}
                          width={w}
                          height={rowH}
                          rx={2}
                          fill={isCurrent ? 'var(--yy-accent)' : 'var(--yy-bg-sunken)'}
                        />
                        {/* Colour comes from a CLASS, not a presentation
                          attribute: `.micro` used to declare `fill` and a CSS
                          declaration always beats an attribute, so the
                          on-accent ink never reached the element. */}
                        {fits(label, w) ? (
                          <text
                            className={`${css.micro} ${isCurrent ? css.microOnAccent : css.microOnSunken}`}
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
          Three bands showing head coach, offensive coordinator and defensive coordinator tenure
          runs across the season axis, with a marker at each head-coach change.
        </p>
      </div>

      <Legend
        items={[
          { swatch: 'solid', label: 'Tenure — current regime', tone: 'accent' },
          { swatch: 'absence', label: 'Head-coach change (dashed = in-season)', tone: 'absence' },
        ]}
      />

      <ChartCaption>
        A regime marker is a head-coach change — an event, not a judgement, and it is never drawn in
        the negative colour. Solid marks an offseason change, dashed marks an in-season one. The two
        dated dead-money readings that follow each change are printed below — they are never behind
        a tap.
      </ChartCaption>

      <ul className={shell.list}>
        {regimes.map((r) => (
          <li className={shell.item} key={`${r.season}-${r.regimeId}`}>
            <p className={`yy-label ${shell.itemHead}`}>
              {r.season} · {r.kind === 'in_season' ? 'In-season' : 'Offseason'} · {r.outgoingHc} →{' '}
              {r.incomingHc}
            </p>
            {[r.dmNext1, r.dmNext2].map((dm, i) => {
              const dmSeason = dm.season ?? r.season + i + 1;
              return (
              <p className={shell.itemDm} key={i}>
                <span className={`yy-label ${shell.itemDmSeason}`}>
                  {dmSeason} dead money
                </span>{' '}
                {dm.state === 'value' && dm.usd !== null && dm.asOf ? (
                  <>
                    <AsOf value={usdShort(dm.usd)} date={dm.asOf.date} stage={dm.asOf.stage} />
                    {/* `SPEC.md` §2.8 step 7 — the reading renders BESIDE THE
                      LEAGUE MEDIAN for its own season. Without it "$85.2M"
                      reads as an indictment; against a $50.3M median it reads
                      as what it is. `CAPPLUS_MEMO.md` §3 makes this a day-one
                      disclosure, not a nicety. */}
                    {dm.leagueMedianUsd !== null ? (
                      <span className={`yy-label ${shell.itemMedian}`}>
                        {' '}
                        · league median {usdShort(dm.leagueMedianUsd)}
                      </span>
                    ) : null}
                  </>
                ) : (
                  <BlankReason
                    reason={
                      dmSeason > lastRecordedSeason
                        ? outsideRecord(dmSeason)
                        : (dm.reason ?? 'Not available — no league-wide table was published.')
                    }
                    inline
                  />
                )}
              </p>
              );
            })}
          </li>
        ))}
      </ul>

      <ChartCaption>{coverage.statement}</ChartCaption>
    </div>
  );
}
