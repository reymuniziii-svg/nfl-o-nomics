/**
 * `TeamDrive` — the second field-literal surface.
 * `SPEC.md` §4, `CHART_ANATOMY.md` §7, `DECISIONS.md` 43.
 *
 * The franchise's 25 seasons read as a drive: `yards_to_opponent_goal =
 * 150 − Cap+`, clamped 0…100, plotted down a vertical field with the opponent's
 * goal line at the top. Where the season axis runs across, the value axis runs
 * in yards — and the CONVENTIONAL CAP+ TICKS sit in the gutter beside them,
 * because the field is the second encoding and never the only one (§7).
 *
 * THE DATA ANATOMY IS `FranchiseArc`'S, VERBATIM:
 *  · the hard break at 2013 — no path crosses it;
 *  · the four blanked Cap+ seasons are hatched, labelled gaps, never
 *    interpolated;
 *  · a separate `<path>` per contiguous run, never `defined()` on one path.
 *
 * What it is not: no turf, no crowd, no stadium. The field is a coordinate
 * system. Nothing here is clipped, either — the 50–150 domain contains 100% of
 * `capplus_official` (62.9 to 138.1), which is the reason this scale suits the
 * data where the conventional 76–124 window clips about 9% of it.
 */

import chart from '../charts/chart.module.css';
import css from './field.module.css';
import { ChartCaption, Legend, type LegendItem } from '../primitives';
import { chartId, gapsOf, pathFor, runsOf, scaleLinear, scalePoint, thinTicks, tickBudget, type SeriesPoint } from '../charts/chart-kit';
import {
  FIELD_CAPPLUS_DOMAIN,
  RED_ZONE_CAPPLUS,
  RED_ZONE_LABEL,
  SAFETY_CAPPLUS,
  SAFETY_LABEL,
  YARD_LINES,
  yardNumber,
  yardsToGoal,
} from './field-kit';
import type { HistoryPoint } from '@/lib/data/team';
import type { Coverage } from '@/lib/display';

const TIER2_BREAK = 2013;

interface Geometry {
  w: number;
  h: number;
  ml: number;
  mr: number;
  mt: number;
  mb: number;
}

/** Intrinsic sizes — scale 1.0, so the in-chart type stays on its floor. */
const MOBILE: Geometry = { w: 332, h: 300, ml: 40, mr: 30, mt: 14, mb: 42 };
const DESKTOP: Geometry = { w: 980, h: 420, ml: 56, mr: 44, mt: 18, mb: 52 };

export function TeamDrive({
  points,
  team,
  coverage,
}: {
  points: HistoryPoint[];
  team: string;
  coverage: Coverage;
}) {
  const legend: LegendItem[] = [
    { swatch: 'solid', label: 'Cap+ as field position', tone: 'accent' },
    { swatch: 'benchmark', label: 'Midfield — Cap+ 100', tone: 'benchmark' },
    { swatch: 'hatch', label: 'Season not covered', tone: 'absence' },
  ];

  const covered = points.filter((p) => p.season > TIER2_BREAK && p.capplus.state !== 'blank');
  if (!covered.length) return null;

  return (
    <div>
      <div className={chart.atMobile}>
        <div className={css.driveScroll}>
          <DriveSvg points={points} team={team} geo={MOBILE} />
        </div>
      </div>
      <div className={chart.atDesktop}>
        <div className={css.driveScroll}>
          <DriveSvg points={points} team={team} geo={DESKTOP} />
        </div>
      </div>
      <Legend items={legend} />
      <ul className={css.bandKey}>
        <li className={`yy-label ${css.bandKeyItem}`}>
          <span className={`${css.bandSwatch} ${css.bandSwatchRed}`} aria-hidden="true" />
          {RED_ZONE_LABEL}
        </li>
        <li className={`yy-label ${css.bandKeyItem}`}>
          <span className={`${css.bandSwatch} ${css.bandSwatchSafety}`} aria-hidden="true" />
          {SAFETY_LABEL}
        </li>
      </ul>
      <ChartCaption>
        The same number as the arc above, read as ground gained: yards to the opponent&rsquo;s goal
        = 150 − Cap+, clamped to the hundred yards between the goal lines. Fifteen index points is
        fifteen yards, and the Cap+ ticks in the gutter carry the figure conventionally.
      </ChartCaption>
      <ChartCaption>{coverage.statement}</ChartCaption>
    </div>
  );
}

function DriveSvg({
  points,
  team,
  geo,
}: {
  points: HistoryPoint[];
  team: string;
  geo: Geometry;
}) {
  const { w, h, ml, mr, mt, mb } = geo;
  const innerW = w - ml - mr;
  const innerH = h - mt - mb;
  const id = chartId('drive', team, w);

  const seasons = points.map((p) => p.season);
  if (!seasons.length) return null;

  const x = scalePoint<number>().domain(seasons).range([0, innerW]).padding(0.5);
  const px = (s: number) => x(s) ?? 0;

  // y is YARDS TO THE OPPONENT'S GOAL: 0 at the top of the plot (their goal
  // line, Cap+ 150), 100 at the bottom (own goal line, Cap+ 50).
  const y = scaleLinear().domain([0, 100]).range([0, innerH]);
  const yOf = (capplus: number) => y(yardsToGoal(capplus));

  const series: SeriesPoint[] = points.map((p) => ({
    x: p.season,
    y: p.season > TIER2_BREAK && p.capplus.state !== 'blank' ? p.capplus.value : null,
  }));
  const runs = runsOf(series);
  const gaps = gapsOf(series).filter((g) => g.from > TIER2_BREAK);

  const ticks = thinTicks(seasons, tickBudget(innerW));
  const capTicks = [150, 125, 100, 75, 50];

  return (
    <>
      <svg
        className={chart.svgFixed}
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${team} — Cap+ as field position by season, ${seasons[0]} to ${seasons[seasons.length - 1]}`}
        aria-describedby={`${id}-d`}
      >
        <defs>
          <pattern
            id={`${id}-hatch`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--yy-partial)" strokeWidth="2" />
          </pattern>
        </defs>

        <g transform={`translate(${ml},${mt})`}>
          {/* the ground — flat card surface, never turf */}
          <rect x={0} y={0} width={innerW} height={innerH} fill="var(--yy-bg-card-flat)" />

          {/* §7 the red zone: 0–20 yards to the opponent's goal, Cap+ 130+ */}
          <rect
            x={0}
            y={0}
            width={innerW}
            height={y(yardsToGoal(RED_ZONE_CAPPLUS))}
            fill="var(--yy-accent)"
            opacity={0.06}
          />
          {/* §7 the safety band at the club's own goal line, Cap+ below 50 */}
          <rect
            x={0}
            y={y(98)}
            width={innerW}
            height={innerH - y(98)}
            fill="var(--yy-negative-fill)"
            opacity={0.06}
          />

          {/* yard lines every 10 — these ARE the gridlines */}
          {YARD_LINES.map((f) => {
            const yards = 100 - f * 100;
            const isMid = Math.round(yards) === 50;
            return (
              <line
                key={`y${f}`}
                x1={0}
                x2={innerW}
                y1={y(yards)}
                y2={y(yards)}
                stroke={isMid ? 'var(--yy-benchmark-line-under)' : 'var(--yy-gridline)'}
                strokeWidth={1}
              />
            );
          })}

          {/* §4.3 the blanked Cap+ seasons — hatched, labelled, never interpolated */}
          {gaps.map((g) => {
            const x0 = px(g.from) - (innerW / Math.max(1, seasons.length - 1)) * 0.5;
            const x1 = px(g.to) - (innerW / Math.max(1, seasons.length - 1)) * 0.5;
            const width = Math.max(6, x1 - x0);
            const cx = x0 + width / 2;
            return (
              <g key={`gap${g.from}`}>
                <rect
                  x={x0}
                  y={0}
                  width={width}
                  height={innerH}
                  fill={`url(#${id}-hatch)`}
                  stroke="var(--yy-absence)"
                  strokeWidth={1}
                  style={{ strokeDasharray: 'var(--yy-dash-absence)' }}
                />
                <text
                  className={chart.micro}
                  x={cx}
                  y={innerH / 2}
                  textAnchor="middle"
                  transform={`rotate(-90 ${cx} ${innerH / 2})`}
                >
                  No full-32 table
                </text>
              </g>
            );
          })}

          {/* §4.1 THE HARD BREAK. Cap+ begins at 2014 and no path crosses it. */}
          <line
            x1={px(TIER2_BREAK)}
            x2={px(TIER2_BREAK)}
            y1={0}
            y2={innerH}
            stroke="var(--yy-fg-dim)"
            strokeWidth={1}
            style={{ strokeDasharray: 'var(--yy-dash-absence)' }}
          />
          <text
            className={chart.micro}
            x={px(TIER2_BREAK) + 10}
            y={12}
            textAnchor="start"
            transform={`rotate(90 ${px(TIER2_BREAK) + 10} 12)`}
          >
            Tier 2 begins 2013
          </text>

          {/* one <path> per contiguous run — never `defined()` on one path */}
          {runs.map((run, i) => (
            <path
              key={`d${i}`}
              d={pathFor(run, px, yOf)}
              fill="none"
              stroke="var(--yy-accent)"
              strokeWidth="var(--yy-stroke-primary)"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="var(--yy-axis)" strokeWidth={1} />
          {ticks.map((s) => (
            <text key={`t${s}`} className={chart.tick} x={px(s)} y={innerH + 16} textAnchor="middle">
              &rsquo;{String(s).slice(2)}
            </text>
          ))}
          <text className={chart.axisTitle} x={innerW / 2} y={innerH + 34} textAnchor="middle">
            Season
          </text>

          {/* THE CAP+ AXIS, MANDATORY AND CONVENTIONAL — in the left gutter, in
            index units, alongside the field's own yard numbers on the right. */}
          {capTicks.map((v) => (
            <text
              key={`c${v}`}
              className={chart.tick}
              x={-8}
              y={yOf(v) + 4}
              textAnchor="end"
              fill={v === 100 ? 'var(--yy-benchmark)' : undefined}
            >
              {v}
            </text>
          ))}

          {/* the field's own numbers, 10…50…10 from each goal line */}
          {YARD_LINES.filter((f) => f > 0 && f < 1).map((f) => (
            <text
              key={`n${f}`}
              className={chart.micro}
              x={innerW + 8}
              y={y(100 - f * 100) + 3}
              textAnchor="start"
            >
              {yardNumber(f)}
            </text>
          ))}
        </g>

        <text className={chart.axisTitle} x={4} y={h - 6} textAnchor="start">
          Cap+ {FIELD_CAPPLUS_DOMAIN[0]}–{FIELD_CAPPLUS_DOMAIN[1]} · yards to goal
        </text>
      </svg>
      <p id={`${id}-d`} className="yy-visually-hidden">
        Cap+ plotted as field position across the season axis. The top of the plot is the
        opponent&rsquo;s goal line at Cap+ {FIELD_CAPPLUS_DOMAIN[1]}, the bottom the club&rsquo;s own
        at Cap+ {SAFETY_CAPPLUS}, and midfield is Cap+ 100, the league average. Seasons with no
        league-wide dead-money table are drawn as hatched gaps and are never interpolated.
      </p>
    </>
  );
}
