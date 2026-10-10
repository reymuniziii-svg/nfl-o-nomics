/**
 * `DriveSvg` — the team Drive, the second field-literal surface.
 * `SPEC.md` §4, `CHART_ANATOMY.md` §7, `DECISIONS.md` 43.
 *
 * DECISION (review D #6): the Drive is no longer its own card. It is the
 * "Read as field" view of `FranchiseArc`. As a separate card it redrew the
 * arc's line directly underneath the arc, with 14 of its 27 seasons empty
 * field and the goal line at the top — the same chart with yard numbers. Cutting
 * it would drop one of the two field surfaces `SPEC.md` §4 names, so it is
 * folded in instead and REDRAWN AS A DRIVE CHART:
 *
 *  - the field runs left → right, own goal to opponent's goal, broadcast-style;
 *  - one row per season of the Cap+ era (2013–2025), oldest at the top, like a
 *    drive summary reads play by play;
 *  - each covered season is a carry from midfield (Cap+ 100, the league
 *    average) to its spot (`yards_to_opponent_goal = 150 − Cap+`), with the
 *    ball at the end and the index printed beside it;
 *  - the page's own season is the lit row.
 *
 * The rows stop at 2013 because the field IS Cap+; the Team Rating years have
 * no spot on it. The axis does not hide that: 2013 is its own hatched row and
 * the caption says the field view covers the Cap+ era only.
 *
 * Unchanged anatomy: the Cap+ axis is printed conventionally beneath the
 * field (§7: the field is the second encoding, never the only one); blank
 * seasons are hatched, labelled rows, never interpolated; no turf, no crowd.
 * The 50–150 domain contains 100% of `capplus_official` (62.9 to 138.1).
 */

import chart from '../charts/chart.module.css';
import { chartId, scaleLinear } from '../charts/chart-kit';
import type { LegendItem } from '../primitives';
import {
  FIELD_CAPPLUS_DOMAIN,
  RED_ZONE_CAPPLUS,
  SAFETY_CAPPLUS,
  yardNumber,
  yardsToGoal,
} from './field-kit';
import type { HistoryPoint } from '@/lib/data/team';

export interface DriveGeometry {
  w: number;
  h: number;
  ml: number;
  mr: number;
  mt: number;
  mb: number;
  rowH: number;
}

const ROW_H = 22;
/** The Cap+ era: 2013 (blank) through 2025 — 13 rows. */
const ROWS = 13;

export function driveGeometry(width: number): DriveGeometry {
  const mt = 34;
  const mb = 42;
  return { w: width, h: mt + ROWS * ROW_H + mb, ml: 46, mr: 14, mt, mb, rowH: ROW_H };
}

export const DRIVE_LEGEND: LegendItem[] = [
  { swatch: 'dot', label: 'Cap+ as field position — the ball', tone: 'accent' },
  { swatch: 'benchmark', label: 'Midfield — Cap+ 100, league average', tone: 'benchmark' },
  { swatch: 'hatch', label: 'Season not covered', tone: 'absence' },
];

export function DriveSvg({
  points,
  team,
  geo,
  currentSeason,
  activeSeason,
}: {
  /** Tier 2 seasons only, ascending. */
  points: HistoryPoint[];
  team: string;
  geo: DriveGeometry;
  currentSeason: number;
  activeSeason: number | null;
}) {
  const { w, h, ml, mr, mt, rowH } = geo;
  const innerW = Math.max(60, w - ml - mr);
  const innerH = points.length * rowH;
  const id = chartId('drive', team, w < 600 ? 'm' : 'd');

  // x is Cap+ on the field: own goal line (50) at the left, theirs (150) at the right.
  const x = scaleLinear().domain(FIELD_CAPPLUS_DOMAIN).range([0, innerW]);
  const rowY = (i: number) => i * rowH;
  const showHashes = innerW >= 320;

  const yardLines = Array.from({ length: 11 }, (_, i) => 50 + i * 10);
  const hashes = Array.from({ length: 10 }, (_, i) => 55 + i * 10);
  const capTicks = innerW >= 360 ? [50, 75, 100, 125, 150] : [50, 100, 150];

  return (
    <>
      <svg
        className={chart.svgFixed}
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${team} — Cap+ as field position, one row per season, ${points[0]?.season ?? ''} to ${points[points.length - 1]?.season ?? ''}; ${currentSeason} marked`}
        aria-describedby={`${id}-d`}
      >
        <defs>
          <pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--yy-partial)" strokeWidth="2" />
          </pattern>
        </defs>

        <g transform={`translate(${ml},${mt})`}>
          {/* the ground — flat card surface, never turf */}
          <rect x={0} y={0} width={innerW} height={innerH} fill="var(--yy-bg-card-flat)" />
          {/* §7 red zone — the last 20 yards, Cap+ 130+ */}
          <rect x={x(RED_ZONE_CAPPLUS)} y={0} width={innerW - x(RED_ZONE_CAPPLUS)} height={innerH} fill="var(--yy-accent)" opacity={0.06} />
          {/* §7 safety band at the own goal line */}
          <rect x={0} y={0} width={x(SAFETY_CAPPLUS + 2)} height={innerH} fill="var(--yy-negative-fill)" opacity={0.06} />

          {/* the page's own season and the inspected one — row tints beneath every mark */}
          {points.map((p, i) =>
            p.season === currentSeason || p.season === activeSeason ? (
              <rect
                key={`row${p.season}`}
                x={-ml + 2}
                y={rowY(i) + 1}
                width={innerW + ml - 2}
                height={rowH - 2}
                rx={2}
                fill={p.season === currentSeason ? 'var(--yy-tint-selected)' : 'var(--yy-bg-hover)'}
              />
            ) : null,
          )}

          {/* yard lines every 10 — these ARE the gridlines; midfield is the benchmark */}
          {yardLines.map((v) =>
            v === 100 ? null : (
              <line key={`yl${v}`} x1={x(v)} x2={x(v)} y1={0} y2={innerH} stroke="var(--yy-gridline)" strokeWidth={1} />
            ),
          )}
          {showHashes
            ? hashes.map((v) => (
                <g key={`h${v}`}>
                  <line x1={x(v)} x2={x(v)} y1={0} y2={4} stroke="var(--yy-gridline)" strokeWidth={1} />
                  <line x1={x(v)} x2={x(v)} y1={innerH - 4} y2={innerH} stroke="var(--yy-gridline)" strokeWidth={1} />
                </g>
              ))
            : null}
          <line x1={x(100)} x2={x(100)} y1={0} y2={innerH} stroke="var(--yy-benchmark-line-under)" strokeWidth={1} />
          <line
            x1={x(100)}
            x2={x(100)}
            y1={0}
            y2={innerH}
            stroke="var(--yy-benchmark-line)"
            strokeWidth={1}
            style={{ strokeDasharray: 'var(--yy-dash-benchmark)' }}
          />

          {/* yard numbers — reinforce, never replace, the Cap+ axis below */}
          {yardLines
            .filter((v) => v > 50 && v < 150)
            .map((v) => (
              <text key={`yn${v}`} className={chart.micro} x={x(v)} y={-6} textAnchor="middle">
                {yardNumber((v - 50) / 100)}
              </text>
            ))}
          <text className={chart.micro} x={0} y={-20} textAnchor="start">
            {innerW >= 420 ? `← Own goal · safety below ${SAFETY_CAPPLUS}` : '← Own goal'}
          </text>
          <text className={chart.micro} x={innerW} y={-20} textAnchor="end">
            Red zone {RED_ZONE_CAPPLUS}+ →
          </text>

          {points.map((p, i) => {
            const cy = rowY(i) + rowH / 2;
            const isCur = p.season === currentSeason;
            const label = (
              <text
                className={chart.tick}
                x={-8}
                y={cy + 4}
                textAnchor="end"
                fill={isCur ? 'var(--yy-fg-1)' : undefined}
                fontWeight={isCur ? 700 : undefined}
              >
                {p.season}
              </text>
            );
            if (p.capplus.state === 'blank') {
              return (
                <g key={`s${p.season}`}>
                  {label}
                  <rect
                    x={0}
                    y={rowY(i) + 3}
                    width={innerW}
                    height={rowH - 6}
                    fill={`url(#${id}-hatch)`}
                    stroke="var(--yy-absence)"
                    strokeWidth={1}
                    style={{ strokeDasharray: 'var(--yy-dash-absence)' }}
                  />
                  <text className={`${chart.micro} ${chart.microOnSunken}`} x={innerW / 2} y={cy + 3.5} textAnchor="middle">
                    No full-32 table — not covered
                  </text>
                </g>
              );
            }
            const v = p.capplus.value;
            const bx = x(Math.max(FIELD_CAPPLUS_DOMAIN[0], Math.min(FIELD_CAPPLUS_DOMAIN[1], v)));
            const gain = v >= 100;
            const ytg = Math.round(yardsToGoal(v));
            const spot = ytg === 50 ? 'mid' : ytg < 50 ? `opp ${ytg}` : `own ${100 - ytg}`;
            // The figure sits beyond the ball; when the ball is within a
            // label's width of a goal line it moves to the far side of
            // midfield instead, so it never overprints its own carry.
            const outward = gain ? bx + 76 < innerW : bx - 76 > 0;
            const tx = outward ? (gain ? bx + 10 : bx - 10) : gain ? x(100) - 8 : x(100) + 8;
            const anchor = outward === gain ? 'start' : 'end';
            return (
              <g key={`s${p.season}`}>
                {label}
                <line
                  x1={x(100)}
                  x2={bx}
                  y1={cy}
                  y2={cy}
                  stroke="var(--yy-accent)"
                  strokeWidth="var(--yy-stroke-primary)"
                  strokeLinecap="round"
                  opacity={isCur ? 1 : 0.7}
                />
                {/* the ball */}
                <ellipse
                  cx={bx}
                  cy={cy}
                  rx={6.5}
                  ry={4.25}
                  fill="var(--yy-accent)"
                  stroke={isCur ? 'var(--yy-fg-1)' : 'var(--yy-bg-card-flat)'}
                  strokeWidth={isCur ? 2 : 1}
                />
                <text
                  className={chart.figure}
                  x={tx}
                  y={cy + 4}
                  textAnchor={anchor}
                  fill={isCur ? 'var(--yy-fg-1)' : 'var(--yy-fg-2)'}
                >
                  {v.toFixed(1)}
                  <tspan className={chart.micro} fill="var(--yy-fg-3)" dx={4}>
                    {spot}
                  </tspan>
                </text>
              </g>
            );
          })}

          {/* THE CAP+ AXIS, conventional and mandatory (§7) */}
          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="var(--yy-axis)" strokeWidth={1} />
          {capTicks.map((v) => (
            <text
              key={`c${v}`}
              className={chart.tick}
              x={x(v)}
              y={innerH + 16}
              textAnchor={v === 50 ? 'start' : v === 150 ? 'end' : 'middle'}
              fill={v === 100 ? 'var(--yy-benchmark)' : undefined}
            >
              {v}
            </text>
          ))}
          <text className={chart.axisTitle} x={innerW / 2} y={innerH + 34} textAnchor="middle">
            Cap+ · 1 point = 1 yard
          </text>
        </g>
      </svg>
      <p id={`${id}-d`} className="yy-visually-hidden">
        A drive chart: one row per season from {points[0]?.season} to{' '}
        {points[points.length - 1]?.season}. The field runs from the club&rsquo;s own goal line at
        Cap+ {FIELD_CAPPLUS_DOMAIN[0]} on the left to the opponent&rsquo;s at Cap+{' '}
        {FIELD_CAPPLUS_DOMAIN[1]} on the right; midfield is Cap+ 100, the league average. Each
        covered season is drawn as a carry from midfield to its Cap+ spot. Seasons with no
        league-wide dead-money table are hatched rows and are never interpolated.
      </p>
    </>
  );
}
