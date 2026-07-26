/**
 * `DeadMoneyDots` — the dot plot that refuses to connect its points.
 * `COMPONENTS.md` §8.4, `SPEC.md` §2.1 rule 3.
 *
 * **There is no connecting path and no code path that could draw one.** Each dot
 * is a separate dated reading, taken at a different point in a different league
 * year. They are not a trend.
 *
 * EVERY DOT CARRIES ITS OWN DATE, always — that is the affordance that makes the
 * rule visible rather than merely obeyed. The date is never behind a tooltip.
 */

import css from './chart.module.css';
import { ChartCaption, Legend, type LegendItem } from '../primitives';
import { chartId, gridValues, scaleLinear, scalePoint, thinTicks, tickBudget } from './chart-kit';
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

/** Always beneath the plot. */
export const DOT_PLOT_CAPTION =
  'Each dot is a separate dated reading, taken at a different point in a different league year. ' +
  'They are not a trend and are deliberately not connected.';

/** `DECISIONS.md` 16 — the four seasons with no league-wide table. */
const BLANK_SEASONS = [2013, 2016, 2020, 2021];

const MOBILE = { w: 358, h: 220, ml: 34, mr: 12, mt: 12, mb: 56 };
const DESKTOP = { w: 980, h: 340, ml: 52, mr: 20, mt: 16, mb: 64 };

export interface DotPoint {
  season: number;
  /** Dead money ÷ `team_adjusted_cap_implied` — the axis states its denominator. */
  burden: number | null;
  usd: number;
  asOfDate: string;
  asOfStage: string;
}

export function DeadMoneyDots({
  team,
  points,
  seasons,
  coverage,
}: {
  team: string;
  points: DotPoint[];
  /** The full season domain. The axis is never shortened so a gap disappears. */
  seasons: number[];
  coverage: Coverage;
}) {
  const legend: LegendItem[] = [
    { swatch: 'dot', label: 'Dated reading', tone: 'partial' },
    { swatch: 'ring', label: 'Not a 32-team reading', tone: 'absence' },
  ];

  return (
    <div>
      <div className={css.atMobile}>
        <DotsSvg team={team} points={points} seasons={seasons} geo={MOBILE} everyLabel={false} />
      </div>
      <div className={css.atDesktop}>
        <DotsSvg team={team} points={points} seasons={seasons} geo={DESKTOP} everyLabel />
      </div>
      <Legend items={legend} />
      <ChartCaption>{DOT_PLOT_CAPTION}</ChartCaption>
      <ChartCaption>{coverage.statement}</ChartCaption>
    </div>
  );
}

function DotsSvg({
  team,
  points,
  seasons,
  geo,
  everyLabel,
}: {
  team: string;
  points: DotPoint[];
  seasons: number[];
  geo: typeof MOBILE;
  everyLabel: boolean;
}) {
  const { w, h, ml, mr, mt, mb } = geo;
  const innerW = w - ml - mr;
  const innerH = h - mt - mb;
  const id = chartId('dm', team, w);

  if (!seasons.length) return null;

  const x = scalePoint<number>().domain(seasons).range([0, innerW]).padding(0.5);
  const px = (s: number) => x(s) ?? 0;

  const burdens = points.map((p) => p.burden).filter((b): b is number => b !== null);
  const max = burdens.length ? Math.max(...burdens) : 0.2;
  const y = scaleLinear()
    .domain([0, Math.max(0.05, max * 1.15)])
    .range([innerH, 0]);

  const grid = gridValues([0, Math.max(0.05, max * 1.15)], 3);
  const ticks = thinTicks(seasons, tickBudget(innerW));

  // The date label under every dot is the point of the component; at mobile the
  // labels collide, so the composition renders fewer SEASONS and says so — it
  // never drops the labels (`SCREENSHOT_VARIANTS.md` §3).
  const shown = everyLabel
    ? points
    : points.filter((p) => ticks.includes(p.season) || points.length <= 8);

  return (
    <>
      <svg
        className={css.svg}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${team} — dead money as a share of the adjusted cap`}
        aria-describedby={`${id}-d`}
      >
        <g transform={`translate(${ml},${mt})`}>
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

          {/* the four seasons with no league-wide table: an OPEN ring at the
            baseline, never a value and never an omission */}
          {BLANK_SEASONS.filter((s) => seasons.includes(s)).map((s) => (
            <circle
              key={`b${s}`}
              cx={px(s)}
              cy={innerH}
              r={5}
              fill="none"
              stroke="var(--yy-absence)"
              strokeWidth={1}
              style={{ strokeDasharray: 'var(--yy-dash-absence)' }}
            />
          ))}

          {points.map((p) =>
            p.burden === null ? null : (
              <circle
                key={`p${p.season}-${p.asOfDate}`}
                cx={px(p.season)}
                cy={y(p.burden)}
                r={5}
                fill="var(--yy-negative-fill)"
                stroke="var(--yy-bg-card-flat)"
                strokeWidth={1}
              />
            ),
          )}

          {/* per-dot date labels — every dot, always */}
          {shown.map((p) =>
            p.burden === null ? null : (
              <text
                key={`l${p.season}-${p.asOfDate}`}
                className={css.micro}
                x={px(p.season)}
                y={y(p.burden) + 18}
                textAnchor="middle"
                fill="var(--yy-asof)"
              >
                {p.asOfDate}
              </text>
            ),
          )}

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
          <text className={css.axisTitle} x={innerW / 2} y={innerH + 38} textAnchor="middle">
            Season
          </text>

          {grid.map((v) => (
            <text key={`vt${v}`} className={css.tick} x={-8} y={y(v) + 4} textAnchor="end">
              {(v * 100).toFixed(0)}%
            </text>
          ))}
        </g>

        {/* The axis label STATES ITS DENOMINATOR (`SPEC.md` §2.7). */}
        <text className={css.axisTitle} x={4} y={h - 6} textAnchor="start">
          Share of implied adjusted cap
        </text>
      </svg>
      <p id={`${id}-d`} className="yy-visually-hidden">
        A dot plot of individually dated dead-money readings. The points are deliberately not
        connected: each is a separate press snapshot taken at a different point in a different
        league year.
      </p>
    </>
  );
}
