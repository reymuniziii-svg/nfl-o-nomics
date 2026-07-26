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
import { usdShort } from '@/lib/display';
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

const MOBILE = { w: 358, h: 240, ml: 44, mr: 10, mt: 34, mb: 44 };
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
        <CapVsCashSvg points={points} playerName={playerName} geo={MOBILE} />
      </div>
      <div className={css.atDesktop}>
        <CapVsCashSvg points={points} playerName={playerName} geo={DESKTOP} />
      </div>
      <Legend items={legend} />
      <ChartCaption>
        Cap number is what the player held against the cap that season; cash paid is what the club
        actually paid out. A dead-money marker names the club that ate the charge, which is not
        always the club on the player&rsquo;s row for that year.
      </ChartCaption>
      <ChartCaption>{coverage.statement}</ChartCaption>
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
        className={css.svg}
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
