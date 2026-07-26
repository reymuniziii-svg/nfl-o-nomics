/**
 * `CapVsCash` — the player view's two-series chart. `SPEC.md` §3.3 item 4.
 *
 * Two series per season, told apart by colour AND pattern AND a direct label.
 * **Dead-money markers** sit above the season they attach to, drawn in the VOID
 * grammar (`--yy-void-rule`, `CHART_ANATOMY.md` §5.1) — this is the one case
 * where a dashed salmon rule is correct, because a contract year that lapses
 * into dead money genuinely is a negative.
 *
 * The marker names **the team that ate the charge**, which is not the team on
 * the player's row for that year: the source table follows the player, not the
 * charge.
 *
 * NO VALUE GRADE APPEARS ANYWHERE ON THIS SURFACE (`SPEC.md` §3.3 item 7).
 */

import css from './chart.module.css';
import { ChartCaption, Legend, type LegendItem } from '../primitives';
import { chartId, dollarDomain, gridValues, scaleBand, scaleLinear } from './chart-kit';
import { usdExact, usdShort } from '@/lib/display';
import type { CapVsCashPoint } from '@/lib/data/player';
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

/**
 * Both compositions paint at their INTRINSIC size (scale 1.0) so the 11px type
 * floor survives — see `chart.module.css` `.svgFixed`. 332 is the card's content
 * width at the 390 canvas.
 */
const MOBILE = { w: 332, h: 240, ml: 44, mr: 10, mt: 34, mb: 44 };
const DESKTOP = { w: 980, h: 380, ml: 60, mr: 16, mt: 40, mb: 52 };

export function CapVsCash({
  points,
  playerName,
  coverage,
}: {
  points: CapVsCashPoint[];
  playerName: string;
  coverage: Coverage;
}) {
  const legend: LegendItem[] = [
    { swatch: 'solid', label: 'Cap number', tone: 'accent' },
    { swatch: 'dashed', label: 'Cash paid', tone: 'compare' },
  ];
  if (points.some((p) => p.deadMoney)) {
    legend.push({
      swatch: 'absence',
      label: 'Void / dead — a charge from the ledger',
      tone: 'absence',
    });
  }

  return (
    <div>
      <div className={css.atMobile}>
        <div className={css.plotScroll}>
          <CapVsCashSvg points={points} playerName={playerName} geo={MOBILE} />
        </div>
      </div>
      <div className={css.atDesktop}>
        <div className={css.plotScroll}>
          <CapVsCashSvg points={points} playerName={playerName} geo={DESKTOP} />
        </div>
      </div>
      <Legend items={legend} />
      {/* THE FIGURES THEMSELVES.
          A paired-bar chart at this density can carry a value axis but not 2n
          per-bar labels: at the 390 composition the bars are ~14 units wide and
          `$37.1M` set at the 11px floor is wider than the bar it would sit on,
          so the labels would either collide or drop below the floor — and
          `DECISIONS.md` 65 forbids the second. The exact figure the reader came
          for (`$37,133,824`, the September rework, is the number
          `METHODOLOGY.md` cites by hand) therefore renders as a table beneath
          the chart, which is also this chart's tabular equivalent. */}
      <CapVsCashTable points={points} />
      <ChartCaption>
        Cap number is what the player held against the cap that season; cash paid is what the club
        actually paid out. A dead-money marker names the club that ate the charge, which is not
        always the club on the player&rsquo;s row for that year.
      </ChartCaption>
      <ChartCaption>{coverage.statement}</ChartCaption>
    </div>
  );
}

/**
 * Season × cap × cash, to the dollar.
 *
 * `SPEC.md` §1.2 — a season the source is silent about carries the words, never
 * a zero and never an empty cell. Figures are exact rather than the `$37.1M`
 * short form used on cards: this table exists precisely because the rounded form
 * is not the figure a reader is checking.
 */
function CapVsCashTable({ points }: { points: CapVsCashPoint[] }) {
  if (!points.length) return null;
  return (
    <div className={css.tableScroll}>
      <table className={css.table}>
        <caption className="yy-visually-hidden">
          Cap number and cash paid by season, in dollars, with the club that carried each
          dead-money charge.
        </caption>
        <thead>
          <tr>
            <th scope="col" className="yy-label-lg">
              Season
            </th>
            <th scope="col" className="yy-label-lg">
              Team
            </th>
            <th scope="col" className={`yy-label-lg ${css.tableNum}`}>
              Cap number
            </th>
            <th scope="col" className={`yy-label-lg ${css.tableNum}`}>
              Cash paid
            </th>
            <th scope="col" className="yy-label-lg">
              Dead money
            </th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={`${p.season}-${p.team}`}>
              <th scope="row" className="yy-num">
                {p.season}
              </th>
              <td className="yy-label">{p.team}</td>
              <td className={`yy-num ${css.tableNum}`}>{usdExact(p.capNumber)}</td>
              <td className={`yy-num ${css.tableNum}`}>
                {p.cashPaid === null ? (
                  <span className="yy-label">Not recorded</span>
                ) : (
                  usdExact(p.cashPaid)
                )}
              </td>
              <td className="yy-label">
                {p.deadMoney
                  ? `${p.deadMoney.team ?? 'Club not named'}${
                      p.deadMoney.usd ? ` · ${usdShort(p.deadMoney.usd)}` : ''
                    }`
                  : 'No charge'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CapVsCashSvg({
  points,
  playerName,
  geo,
}: {
  points: CapVsCashPoint[];
  playerName: string;
  geo: typeof MOBILE;
}) {
  const { w, h, ml, mr, mt, mb } = geo;
  const innerW = w - ml - mr;
  const innerH = h - mt - mb;
  const id = chartId('cvc', playerName.replace(/\s+/g, ''), w);

  if (!points.length) return null;

  const seasons = points.map((p) => p.season);
  const band = scaleBand<number>().domain(seasons).range([0, innerW]).padding(0.18);
  const bw = band.bandwidth();

  const values = points.flatMap((p) => [p.capNumber, p.cashPaid ?? 0]);
  const domain = dollarDomain(values);
  const y = scaleLinear().domain(domain).range([innerH, 0]);
  const grid = gridValues(domain, 3);

  return (
    <>
      <svg
        className={css.svgFixed}
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${playerName} — cap number and cash paid by season`}
        aria-describedby={`${id}-d`}
      >
        <defs>
          <pattern
            id={`${id}-cash`}
            width="5"
            height="5"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="5" height="5" fill="var(--yy-compare)" opacity="0.75" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--yy-bg-card-flat)" strokeWidth="1" />
          </pattern>
        </defs>

        <g transform={`translate(${ml},${mt})`}>
          {grid.map((v) => (
            <line
              key={v}
              x1={0}
              x2={innerW}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--yy-gridline)"
              strokeWidth={1}
            />
          ))}

          {points.map((p) => {
            const x0 = band(p.season) ?? 0;
            const half = bw / 2;
            return (
              <g key={p.season}>
                <rect
                  x={x0}
                  y={y(p.capNumber)}
                  width={Math.max(1, half - 1)}
                  height={Math.max(0, innerH - y(p.capNumber))}
                  rx={2}
                  fill="var(--yy-accent)"
                />
                {p.cashPaid === null ? null : (
                  <rect
                    x={x0 + half + 1}
                    y={y(p.cashPaid)}
                    width={Math.max(1, half - 1)}
                    height={Math.max(0, innerH - y(p.cashPaid))}
                    rx={2}
                    fill={`url(#${id}-cash)`}
                  />
                )}
                {p.deadMoney ? (
                  <>
                    <rect
                      x={x0 - 1}
                      y={-24}
                      width={bw + 2}
                      height={18}
                      rx={2}
                      fill="var(--yy-absence-fill)"
                      stroke="var(--yy-void-rule)"
                      strokeWidth={1}
                      style={{ strokeDasharray: 'var(--yy-dash-absence)' }}
                    />
                    <text
                      className={css.micro}
                      x={x0 + bw / 2}
                      y={-11}
                      textAnchor="middle"
                      fill="var(--yy-negative-text)"
                    >
                      {p.deadMoney.team ?? 'Dead'}
                    </text>
                  </>
                ) : null}
              </g>
            );
          })}

          <line
            x1={0}
            x2={innerW}
            y1={innerH}
            y2={innerH}
            stroke="var(--yy-axis)"
            strokeWidth={1}
          />
          {seasons.map((s) => (
            <text
              key={s}
              className={css.tick}
              x={(band(s) ?? 0) + bw / 2}
              y={innerH + 18}
              textAnchor="middle"
            >
              &rsquo;{String(s).slice(2)}
            </text>
          ))}
          <text className={css.axisTitle} x={innerW / 2} y={innerH + 36} textAnchor="middle">
            Season · US dollars
          </text>

          {grid.map((v) => (
            <text key={`v${v}`} className={css.tick} x={-8} y={y(v) + 4} textAnchor="end">
              {usdShort(v)}
            </text>
          ))}
        </g>
      </svg>
      <p id={`${id}-d`} className="yy-visually-hidden">
        Paired bars per season. Cap number is drawn solid; cash paid is drawn hatched. Seasons
        carrying a dead-money charge from the ledger are marked in the void grammar.
      </p>
    </>
  );
}
