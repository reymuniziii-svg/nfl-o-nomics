/**
 * `FranchiseArc` — the 25-season history. `COMPONENTS.md` §4, `SPEC.md` §3.2.2.
 *
 * Server-rendered static SVG: no hydration, no measurement, no chart library.
 * Scales are `d3-scale`; the paths are `d3-shape` with `curveLinear`.
 *
 * THE THREE RULES THIS CHART EXISTS TO OBEY
 *  1. **The hard break at 2013.** A full-height rule at `x(2013)`; no series
 *     path crosses it. Team Rating terminates at 2012 with a round cap; Cap+
 *     begins at 2014. A path that crossed would assert the two metrics are one
 *     series, which `DECISIONS.md` 18/19 forbid.
 *  2. **Both lines on the 2014–2025 overlap**, told apart by THREE channels —
 *     colour, stroke width and dash — plus a direct label at each terminus.
 *  3. **The four blanked Cap+ seasons are labelled gaps, never interpolated
 *     segments.** The path breaks into separate `<path>` elements (never
 *     `defined()` on one path) and the gap is hatched and named.
 */

import css from './chart.module.css';
import { ChartCaption, Legend, type LegendItem } from '../primitives';
import {
  INDEX_DOMAIN,
  chartId,
  gapsOf,
  gridValues,
  pathFor,
  runsOf,
  scaleLinear,
  scalePoint,
  thinTicks,
  tickBudget,
  type SeriesPoint,
} from './chart-kit';
import type { HistoryPoint } from '@/lib/data/team';
import type { Coverage } from '@/lib/display';

/**
 * SVG ACCESSIBLE NAMES ARE ATTRIBUTES, NOT ELEMENTS.
 *
 * `CHART_ANATOMY.md` §8 specifies `role="img"` plus `<title>`/`<desc>` on the
 * `<svg>`. React 19 HOISTS `<title>` as document metadata even inside the SVG
 * namespace: the server emits an empty `<title id>` in the chart and moves its
 * text to the document title slot, the client renders it in place, and the page
 * fails hydration and is regenerated. The same semantics are carried here by
 * `aria-label` (the name) and `aria-describedby` pointing at a visually-hidden
 * paragraph (the description) — identical to a screen reader, and it survives
 * the hoist.
 */

const TIER2_BREAK = 2013;

interface Geometry {
  w: number;
  h: number;
  ml: number;
  mr: number;
  mt: number;
  mb: number;
}

/**
 * Both compositions paint at their INTRINSIC size (scale 1.0) so the 11px type
 * floor survives — see `chart.module.css` `.svgFixed`. 332 is the card's content
 * width at the 390 canvas.
 */
const MOBILE: Geometry = { w: 332, h: 244, ml: 30, mr: 92, mt: 16, mb: 40 };
const DESKTOP: Geometry = { w: 980, h: 440, ml: 44, mr: 132, mt: 20, mb: 52 };

/**
 * OFF-SCALE GRAMMAR — `CHART_ANATOMY.md` §2 + §5.2.
 *
 * The index window is FIXED at 76–124 and is never auto-fitted: an axis that
 * rescales per team makes two clubs incomparable. But 9% of both marts sit
 * outside it (BAL 2019 at 138.1, CLE 2017 at 72.9, NE 2007's 139.5 Team Rating —
 * the very seasons this product exists to talk about), and a path that simply
 * stops at the plate edge tells the reader nothing about how far past it the
 * season went. Every off-window season therefore gets a boundary chevron in its
 * own series colour, on a dashed absence stem, WITH ITS TRUE VALUE PRINTED
 * BESIDE IT. The path is still clipped; it just never terminates silently.
 */
function offScale(v: number): 'above' | 'below' | null {
  if (v > INDEX_DOMAIN[1]) return 'above';
  if (v < INDEX_DOMAIN[0]) return 'below';
  return null;
}

export function FranchiseArc({
  points,
  team,
  bridgeSentence,
  coverage,
}: {
  points: HistoryPoint[];
  team: string;
  bridgeSentence: string;
  coverage: Coverage;
}) {
  const provisional = points
    .filter((p) => p.capplus.state === 'value' && p.capplus.provisional)
    .map((p) => p.season);

  const blanks = [
    ...new Set(
      points
        .filter((p) => p.season >= TIER2_BREAK && p.capplus.state === 'blank')
        .map((p) => (p.capplus.state === 'blank' ? p.capplus.reason : '')),
    ),
  ].filter(Boolean);

  const offWindow = points.filter((p) => {
    const cp = p.capplus.state !== 'blank' && offScale(p.capplus.value);
    const tr = p.teamRating.state !== 'blank' && offScale(p.teamRating.value);
    return Boolean(cp || tr);
  });

  const legend: LegendItem[] = [
    { swatch: 'solid', label: 'Cap+', tone: 'accent' },
    {
      swatch: 'dashed',
      label: 'Team rating (performance only)',
      tone: 'compare',
    },
    { swatch: 'benchmark', label: '100 = league average', tone: 'benchmark' },
    { swatch: 'hatch', label: 'Season not covered', tone: 'absence' },
  ];
  if (offWindow.length) {
    legend.push({ swatch: 'offscale', label: 'Off scale — true value printed', tone: 'absence' });
  }
  if (provisional.length) {
    legend.push({
      swatch: 'provisional',
      label: 'Provisional',
      tone: 'partial',
    });
  }

  return (
    <div>
      <div className={css.atMobile}>
        <div className={css.plotScroll}>
          <ArcSvg points={points} team={team} geo={MOBILE} provisional={provisional} />
        </div>
      </div>
      <div className={css.atDesktop}>
        <div className={css.plotScroll}>
          <ArcSvg points={points} team={team} geo={DESKTOP} provisional={provisional} />
        </div>
      </div>
      <Legend items={legend} />
      {/* §4.4 — always present, never a tooltip. */}
      <ChartCaption>{bridgeSentence}</ChartCaption>
      {offWindow.length ? (
        <ChartCaption>
          The index window is fixed at {INDEX_DOMAIN[0]}–{INDEX_DOMAIN[1]} so that any two clubs can
          be read against one another. {offWindow.length} season
          {offWindow.length === 1 ? '' : 's'} on this chart fall outside it; each is marked at the
          boundary with its true value printed, never clamped onto the axis as though it had been
          measured there.
        </ChartCaption>
      ) : null}
      <ChartCaption>{coverage.statement}</ChartCaption>
      {blanks.map((b) => (
        <ChartCaption key={b}>{b}</ChartCaption>
      ))}
    </div>
  );
}

function ArcSvg({
  points,
  team,
  geo,
  provisional,
}: {
  points: HistoryPoint[];
  team: string;
  geo: Geometry;
  provisional: number[];
}) {
  const { w, h, ml, mr, mt, mb } = geo;
  const innerW = w - ml - mr;
  const innerH = h - mt - mb;
  const id = chartId('arc', team, w);

  const seasons = points.map((p) => p.season);
  if (!seasons.length) return null;

  // `scalePoint`, not `scaleTime` — seasons are ordinal labels, not instants,
  // and `scaleTime` will happily interpolate across a blank.
  const x = scalePoint<number>().domain(seasons).range([0, innerW]).padding(0.5);
  const y = scaleLinear().domain(INDEX_DOMAIN).range([innerH, 0]);
  const px = (s: number) => x(s) ?? 0;

  /* ---- the two series, each already broken at the tier boundary ---- */
  const capplusPoints: SeriesPoint[] = points.map((p) => ({
    x: p.season,
    y: p.season > TIER2_BREAK && p.capplus.state !== 'blank' ? p.capplus.value : null,
  }));
  const ratingPoints: SeriesPoint[] = points.map((p) => ({
    x: p.season,
    // §4.1 — Team Rating terminates at 2012 and resumes at 2014. No path
    // crosses the break rule; the 2013 reading lives in the CSV export, which
    // is this chart's accessible tabular equivalent.
    y: p.season === TIER2_BREAK || p.teamRating.state === 'blank' ? null : p.teamRating.value,
  }));

  const capplusRuns = runsOf(capplusPoints);
  const ratingRuns = runsOf(ratingPoints);
  const capplusGaps = gapsOf(capplusPoints).filter((g) => g.from > TIER2_BREAK);

  const lastCapplus = capplusRuns.at(-1)?.at(-1) ?? null;
  const lastRating = ratingRuns.at(-1)?.at(-1) ?? null;

  // Direct labels sit at the right terminus of each series. Where the two
  // termini are within a line-height of one another the labels are pushed
  // apart — `CHART_ANATOMY.md` §8 forbids rotating a data label, so the answer
  // is separation, not rotation.
  const capplusLabelY = lastCapplus === null ? 0 : y(lastCapplus.y);
  const ratingLabelY = lastRating === null ? 0 : y(lastRating.y);
  const collide =
    lastCapplus !== null && lastRating !== null && Math.abs(capplusLabelY - ratingLabelY) < 15;
  const capplusDy = collide && capplusLabelY <= ratingLabelY ? -6 : collide ? 9 : 4;
  const ratingDy = collide && capplusLabelY <= ratingLabelY ? 15 : collide ? -1 : 4;

  const ticks = thinTicks(seasons, tickBudget(innerW));
  const grid = gridValues(INDEX_DOMAIN, 4).filter((v) => Math.abs(v - 100) > 3);
  const valueTicks = [80, 90, 110, 120];

  // Every season whose measured value lies outside the fixed window, on either
  // series. The chevron is drawn from the SAME points the paths are drawn from,
  // so a mark can never disagree with the line it belongs to.
  const offMarks: { season: number; series: 'capplus' | 'rating'; dir: 'above' | 'below'; value: number }[] =
    [];
  for (const p of capplusPoints) {
    const dir = p.y === null ? null : offScale(p.y);
    if (p.y !== null && dir) offMarks.push({ season: p.x, series: 'capplus', dir, value: p.y });
  }
  for (const p of ratingPoints) {
    const dir = p.y === null ? null : offScale(p.y);
    if (p.y !== null && dir) offMarks.push({ season: p.x, series: 'rating', dir, value: p.y });
  }

  return (
    <>
      <svg
        className={css.svgFixed}
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${team} — Cap+ and Team Rating, 1999 to 2025`}
        aria-describedby={`${id}-d`}
      >
        <defs>
          {/* §5.2 partial/absence hatch — one shared pattern per chart, by id. */}
          <pattern
            id={`${id}-hatch`}
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--yy-partial)" strokeWidth="2" />
          </pattern>
          {/* The index window is FIXED at 76–124 and is never auto-fitted (§2):
              a Cap+ axis that rescales per team makes two teams incomparable. A
              season outside that window therefore has to LEAVE the plot rather
              than be clamped onto its edge — clamping would draw a value that
              was never measured. The clip cuts the path at the boundary, so a
              line that runs off the scale reads as off the scale instead of
              painting over the axis. */}
          <clipPath id={`${id}-plot`}>
            <rect x={-2} y={-2} width={innerW + 4} height={innerH + 4} />
          </clipPath>
        </defs>

        <g transform={`translate(${ml},${mt})`}>
          {/* §3 gridlines — value axis only, 1px, never dashed, beneath every
            mark, and NOT at the benchmark's own position. */}
          {grid.map((v) => (
            <line
              key={`g${v}`}
              x1={0}
              x2={innerW}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--yy-gridline)"
              strokeWidth={1}
            />
          ))}

          {/* §4 the benchmark: two elements, exactly as the mockup composites it. */}
          <line
            x1={0}
            x2={innerW}
            y1={y(100)}
            y2={y(100)}
            stroke="var(--yy-benchmark-line-under)"
            strokeWidth={1}
          />
          <line
            x1={0}
            x2={innerW}
            y1={y(100)}
            y2={y(100)}
            stroke="var(--yy-benchmark-line)"
            strokeWidth={1}
            style={{ strokeDasharray: 'var(--yy-dash-benchmark)' }}
          />

          {/* §4.3 the blanked Cap+ seasons — hatched, labelled, never interpolated */}
          {capplusGaps.map((g) => {
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
                  className={css.micro}
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

          {/* §4.1 THE HARD BREAK. Full height, dashed, named. */}
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
            className={css.micro}
            x={px(TIER2_BREAK) + 10}
            y={12}
            textAnchor="start"
            transform={`rotate(90 ${px(TIER2_BREAK) + 10} 12)`}
          >
            Tier 2 begins 2013
          </text>

          <g clipPath={`url(#${id}-plot)`}>
            {/* Team Rating — 2px, dashed, .85 opacity, round cap at its terminus */}
            {ratingRuns.map((run, i) => (
              <path
                key={`tr${i}`}
                d={pathFor(run, px, y)}
                fill="none"
                stroke="var(--yy-compare)"
                strokeWidth="var(--yy-stroke-compare)"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.85}
                style={{ strokeDasharray: 'var(--yy-dash-compare)' }}
              />
            ))}

            {/* Cap+ — 3px, solid, full opacity. One lime series, maximum. */}
            {capplusRuns.map((run, i) => (
              <path
                key={`cp${i}`}
                d={pathFor(run, px, y)}
                fill="none"
                stroke="var(--yy-accent)"
                strokeWidth="var(--yy-stroke-primary)"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>

          {/* §2 / §5.2 THE OFF-SCALE MARK. A clipped path that simply stops at
            the plate edge says nothing; this says how far past it the season
            went, in the series' own colour, on a dashed absence stem, with the
            measured figure printed beside it. */}
          {offMarks.map((m) => (
            <g key={`off-${m.series}-${m.season}`}>
              <line
                x1={px(m.season)}
                x2={px(m.season)}
                y1={m.dir === 'above' ? 0 : innerH}
                y2={m.dir === 'above' ? 10 : innerH - 10}
                stroke="var(--yy-fg-dim)"
                strokeWidth={1}
                style={{ strokeDasharray: 'var(--yy-dash-absence)' }}
              />
              <path
                d={
                  m.dir === 'above'
                    ? `M${px(m.season) - 5},6 L${px(m.season)},0 L${px(m.season) + 5},6 Z`
                    : `M${px(m.season) - 5},${innerH - 6} L${px(m.season)},${innerH} L${px(m.season) + 5},${innerH - 6} Z`
                }
                fill={m.series === 'capplus' ? 'var(--yy-accent)' : 'var(--yy-compare)'}
              />
              <text
                className={css.micro}
                x={px(m.season) + 8}
                y={m.dir === 'above' ? 8 : innerH - 2}
                textAnchor="start"
                fill={m.series === 'capplus' ? 'var(--yy-accent)' : 'var(--yy-compare)'}
              >
                {m.value.toFixed(1)}
              </text>
            </g>
          ))}

          {/* §5.2 provisional — the normal mark plus a 1px provisional outline */}
          {provisional.map((s) => {
            const p = capplusPoints.find((q) => q.x === s);
            if (!p || p.y === null) return null;
            return (
              <circle
                key={`pv${s}`}
                cx={px(s)}
                cy={y(p.y)}
                r={4}
                fill="none"
                stroke="var(--yy-provisional-stroke)"
                strokeWidth={1}
              />
            );
          })}

          {/* Direct labels at the right terminus — colour is never the sole
            carrier of meaning. */}
          {lastCapplus ? (
            <text
              className={css.seriesLabel}
              x={px(lastCapplus.x) + 8}
              y={capplusLabelY + capplusDy}
              fill="var(--yy-accent)"
            >
              Cap+
            </text>
          ) : null}
          {lastRating ? (
            <text
              className={css.seriesLabel}
              x={px(lastRating.x) + 8}
              y={ratingLabelY + ratingDy}
              fill="var(--yy-compare)"
            >
              Team rating
            </text>
          ) : null}

          {/* §2 — the DOMAIN axis only gets a line. No tick marks: the gridline
            is the tick. */}
          <line
            x1={0}
            x2={innerW}
            y1={innerH}
            y2={innerH}
            stroke="var(--yy-axis)"
            strokeWidth={1}
          />
          {ticks.map((s) => (
            <text key={`t${s}`} className={css.tick} x={px(s)} y={innerH + 18} textAnchor="middle">
              &rsquo;{String(s).slice(2)}
            </text>
          ))}
          <text className={css.axisTitle} x={innerW / 2} y={innerH + 36} textAnchor="middle">
            Season
          </text>

          {/* The Cap+ axis is MANDATORY on every Cap+ chart, in index units. */}
          {valueTicks.map((v) => (
            <text key={`v${v}`} className={css.tick} x={-8} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          ))}
          <text
            className={css.tick}
            x={-8}
            y={y(100) + 4}
            textAnchor="end"
            fill="var(--yy-benchmark)"
          >
            100
          </text>
        </g>
      </svg>
      <p id={`${id}-d`} className="yy-visually-hidden">
        Two indices plotted against a continuous season axis with a hard break at 2013. Team Rating
        scores performance only and runs 1999 to 2012 and 2014 to 2025; Cap+ scores wins produced
        per dollar and runs 2014 to 2025 with four seasons blanked. Blanked seasons are drawn as
        hatched gaps and are never interpolated.
      </p>
    </>
  );
}
