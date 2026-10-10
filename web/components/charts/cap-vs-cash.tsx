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
import { chartId, dollarDomain, scaleBand, scaleLinear } from './chart-kit';
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

/**
 * Both compositions paint at their INTRINSIC size (scale 1.0) so the 11px type
 * floor survives — see `chart.module.css` `.svgFixed`. 332 is the card's content
 * width at the 390 canvas. The top margin holds the cash-spike callout and the
 * dead-money markers; the value domain carries ~12% headroom for direct labels.
 */
const MOBILE = { w: 332, h: 276, ml: 44, mr: 10, mt: 64, mb: 44, maxCallouts: 1 };
const DESKTOP = { w: 980, h: 420, ml: 60, mr: 16, mt: 70, mb: 52, maxCallouts: 1 };

/**
 * A CASH SPIKE: the club paid at least $10M more cash than the cap charged that
 * season, and at least 25% more. Cash running ahead of cap is, by construction,
 * money paid now and charged to later cap years — a signing or restructure
 * bonus being prorated. Which of the two it was is not in the mart, so the
 * callout names both and claims neither.
 */
const SPIKE_MIN_USD = 10_000_000;
const SPIKE_MIN_RATIO = 1.25;

export function cashSpikes(points: CapVsCashPoint[]): CapVsCashPoint[] {
  return points
    .filter(
      (p) =>
        p.cashPaid !== null &&
        p.cashPaid - p.capNumber >= SPIKE_MIN_USD &&
        p.cashPaid >= p.capNumber * SPIKE_MIN_RATIO,
    )
    .sort((a, b) => (b.cashPaid ?? 0) - b.capNumber - ((a.cashPaid ?? 0) - a.capNumber));
}

/** Axis ticks are round by construction: `$20M`, not `$20.0M`. */
function tickUsd(v: number): string {
  return v % 1e6 === 0 ? `$${v / 1e6}M` : usdShort(v);
}

const yy = (season: number) => `’${String(season).slice(2)}`;

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
    { swatch: 'dashed', label: 'Cash paid (hatched)', tone: 'compare' },
  ];
  if (points.some((p) => p.deadMoney)) {
    legend.push({
      swatch: 'absence',
      label: 'Void / dead — a charge from the ledger',
      tone: 'absence',
    });
  }
  const spikes = cashSpikes(points);
  const spikeSeasons = [...spikes].sort((a, b) => a.season - b.season);

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
      <ChartCaption>
        Cap number is what the player held against the cap that season; cash paid is what the club
        actually paid out. A dead-money marker names the club that ate the charge, which is not
        always the club on the player&rsquo;s row for that year.
      </ChartCaption>
      {spikeSeasons.length ? (
        <ChartCaption>
          Cash ran at least $10M ahead of the cap number in{' '}
          {spikeSeasons
            .map((p) => `${p.season} (+${usdShort((p.cashPaid ?? 0) - p.capNumber)})`)
            .join(', ')}
          . Cash ahead of cap is a bonus paid that year and charged across later cap years; the
          record does not say whether it came from a new deal or a restructure.
        </ChartCaption>
      ) : null}
      <ChartCaption>{coverage.statement}</ChartCaption>
    </div>
  );
}

interface Label {
  key: string;
  x: number;
  y: number;
  text: string;
  fill: string;
  /** Lower draws first and wins a collision. */
  priority: number;
}

/** Rajdhani 11px tracked caps — a conservative advance per glyph. */
const GLYPH_W = 6.2;
const LABEL_H = 12;

function placeLabels(candidates: Label[]): Label[] {
  const placed: Label[] = [];
  for (const l of [...candidates].sort((a, b) => a.priority - b.priority)) {
    const w = l.text.length * GLYPH_W;
    const hit = placed.some((p) => {
      const pw = p.text.length * GLYPH_W;
      return Math.abs(p.x - l.x) < (w + pw) / 2 + 2 && Math.abs(p.y - l.y) < LABEL_H;
    });
    if (!hit) placed.push(l);
  }
  return placed;
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
  const { w, h, ml, mr, mt, mb, maxCallouts } = geo;
  const innerW = w - ml - mr;
  const innerH = h - mt - mb;
  const id = chartId('cvc', playerName.replace(/\s+/g, ''), w);

  if (!points.length) return null;

  const seasons = points.map((p) => p.season);
  const band = scaleBand<number>().domain(seasons).range([0, innerW]).padding(0.18);
  const bw = band.bandwidth();
  const half = bw / 2;

  // A cost axis always includes zero (`CHART_ANATOMY.md` §2); the 12% lift is
  // headroom for the direct labels, not a rescale of the data.
  const values = points.flatMap((p) => [p.capNumber, p.cashPaid ?? 0]);
  const domain = dollarDomain(values.map((v) => v * 1.12));
  const y = scaleLinear().domain(domain).range([innerH, 0]);
  // Round-dollar gridlines ($20M, $40M…), not quartile positions: a reader
  // estimating a cap number needs ticks they can do arithmetic with.
  const grid = y.ticks(4).filter((v) => v > 0);

  const capX = (p: CapVsCashPoint) => (band(p.season) ?? 0) + (half - 1) / 2;
  const cashX = (p: CapVsCashPoint) => (band(p.season) ?? 0) + half + 1 + (half - 1) / 2;

  /* ---- direct value labels ---- */
  const spikes = cashSpikes(points).slice(0, maxCallouts);
  const spikeSet = new Set(spikes.map((p) => p.season));
  const labelEvery = half >= 38;
  const maxCap = points.reduce((m, p) => (p.capNumber > m.capNumber ? p : m), points[0]);
  const withCash = points.filter((p) => p.cashPaid !== null);
  const maxCash = withCash.length
    ? withCash.reduce((m, p) => ((p.cashPaid ?? 0) > (m.cashPaid ?? 0) ? p : m), withCash[0])
    : null;
  const last = points[points.length - 1];

  const candidates: Label[] = [];
  for (const p of points) {
    const capPri = labelEvery
      ? 3
      : p === maxCap
        ? 1
        : p === last
          ? 2
          : null;
    if (capPri !== null) {
      candidates.push({
        key: `c${p.season}`,
        x: capX(p),
        y: y(p.capNumber) - 5,
        text: usdShort(p.capNumber),
        fill: 'var(--yy-accent)',
        priority: capPri,
      });
    }
    if (p.cashPaid !== null) {
      const cashPri = spikeSet.has(p.season)
        ? 0
        : labelEvery
          ? 3
          : p === maxCash
            ? 1
            : p === last
              ? 2
              : null;
      if (cashPri !== null) {
        candidates.push({
          key: `k${p.season}`,
          x: cashX(p),
          y: y(p.cashPaid) - 5,
          text: usdShort(p.cashPaid),
          fill: 'var(--yy-fg-2)',
          priority: cashPri,
        });
      }
    }
  }
  // Two labels on one season whose bars end within a line of each other: the
  // shorter bar's label is lifted above the taller one rather than dropped.
  for (const p of points) {
    const c = candidates.find((l) => l.key === `c${p.season}`);
    const k = candidates.find((l) => l.key === `k${p.season}`);
    if (c && k && Math.abs(c.y - k.y) < LABEL_H) {
      if (c.y > k.y) c.y = k.y - LABEL_H;
      else k.y = c.y - LABEL_H;
    }
  }
  const labels = placeLabels(candidates);

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

          {/* direct value labels — the number is the chart's subject */}
          {labels.map((l) => (
            <text
              key={l.key}
              className={css.figure}
              x={l.x}
              y={l.y}
              textAnchor="middle"
              fill={l.fill}
              // A halo in the card colour keeps a label legible where it
              // overhangs the neighbouring bar on a narrow band.
              stroke="var(--yy-bg-card-flat)"
              strokeWidth={3}
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {l.text}
            </text>
          ))}

          {/* the cash-spike callout, in the top margin, with a leader */}
          {spikes.map((p) => {
            const cx = cashX(p);
            const lbl = labels.find((l) => l.key === `k${p.season}`);
            const leaderEnd = (lbl ? lbl.y - LABEL_H + 2 : y(p.cashPaid ?? 0) - 4);
            const textW = 34 * 5.6;
            const anchor = cx - textW / 2 < 0 ? 'start' : cx + textW / 2 > innerW ? 'end' : 'middle';
            const tx = anchor === 'start' ? Math.max(0, cx - 8) : anchor === 'end' ? Math.min(innerW, cx + 8) : cx;
            const top = -mt + 12;
            return (
              <g key={`spike${p.season}`}>
                <text className={css.micro} x={tx} y={top} textAnchor={anchor} fill="var(--yy-fg-1)">
                  {yy(p.season)} · cash {usdShort((p.cashPaid ?? 0) - p.capNumber)} over cap
                </text>
                <text className={css.micro} x={tx} y={top + 12} textAnchor={anchor} fill="var(--yy-fg-2)">
                  Bonus paid now, charged to later caps
                </text>
                <line
                  x1={cx}
                  x2={cx}
                  y1={top + 17}
                  y2={leaderEnd}
                  stroke="var(--yy-fg-dim)"
                  strokeWidth={1}
                />
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

          {/* zero is labelled: a cost axis always starts at it */}
          <text className={css.tick} x={-8} y={innerH + 4} textAnchor="end">
            $0
          </text>
          {grid.map((v) => (
            <text key={`v${v}`} className={css.tick} x={-8} y={y(v) + 4} textAnchor="end">
              {tickUsd(v)}
            </text>
          ))}
        </g>
      </svg>
      <div id={`${id}-d`} className="yy-visually-hidden">
        <p>
          Paired bars per season. Cap number is drawn solid; cash paid is drawn hatched. Seasons
          carrying a dead-money charge from the ledger are marked in the void grammar.
        </p>
        <ul>
          {points.map((p) => (
            <li key={p.season}>
              {p.season} ({p.team}): cap number {usdShort(p.capNumber)}, cash paid{' '}
              {p.cashPaid === null ? 'not recorded' : usdShort(p.cashPaid)}
              {p.deadMoney
                ? `; dead-money charge to ${p.deadMoney.team ?? 'an unnamed club'}${
                    p.deadMoney.usd ? ` of ${usdShort(p.deadMoney.usd)}` : ''
                  }`
                : ''}
              .
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
