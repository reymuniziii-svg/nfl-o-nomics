'use client';

/**
 * `DeadMoneyDots` — the dot plot that refuses to connect its points.
 * `COMPONENTS.md` §8.4, `SPEC.md` §2.1 rule 3.
 *
 * **There is no connecting path and no code path that could draw one.** Each dot
 * is a separate dated reading, taken at a different point in a different league
 * year. They are not a trend.
 *
 * EVERY DOT CARRIES ITS OWN DATE, always — that is the affordance that makes the
 * rule visible rather than merely obeyed. The date is never behind a tooltip and
 * is never dropped: where the labels would collide the composition renders FEWER
 * SEASONS and says so (`SCREENSHOT_VARIANTS.md` §3), and the surviving dates are
 * rotated 90° under their own one-unit-wide column (`CHART_ANATOMY.md` §5.2).
 *
 * ONE MARK PER FACT. A season in which no league-wide table was published but a
 * leaders list named this club carries its reading in the OPEN RING style, so
 * the single mark says both "here is the figure" and "this is not a 32-team
 * reading". Drawing a filled dot *and* a baseline absence ring at the same x
 * asserted two contradictory things at one coordinate.
 */

import css from './chart.module.css';
import { ChartCaption, Legend, type LegendItem } from '../primitives';
import { chartId, gridValues, scaleLinear, scalePoint, thinTicks, tickBudget } from './chart-kit';
import type { Coverage } from '@/lib/display';
import { useMeasuredWidth } from '@/lib/hooks/use-measured-width';

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
  'Each dot is its own dated reading, taken at a different point in a different league year. ' +
  'Dots are not a trend, so nothing connects them. Height is dead money as a share of the ' +
  'adjusted cap, the league cap plus carryover.';

/** `SPEC.md` §1.1 — the first season of player-level economics. */
const TIER2_FIRST_SEASON = 2013;

/**
 * Both compositions paint at scale 1.0 so type sits on the 11px floor
 * (`DECISIONS.md` 65), at the width their container MEASURES rather than a
 * fixed 332 — which overflowed a 375 phone by 15px into an accidental
 * sideways scroller.
 */
const MOBILE = { w: 317, h: 306, ml: 34, mr: 14, mt: 12, mb: 122 };
const DESKTOP = { w: 980, h: 340, ml: 52, mr: 20, mt: 16, mb: 64 };

export interface DotPoint {
  season: number;
  /** Dead money ÷ `team_adjusted_cap_implied` — the axis states its denominator. */
  burden: number | null;
  usd: number;
  asOfDate: string;
  asOfStage: string;
  /** A published leaders list, not a league table (`SPEC.md` §7.5). */
  leadersOnly: boolean;
}

export function DeadMoneyDots({
  team,
  points,
  seasons,
  blankSeasons,
  coverage,
}: {
  team: string;
  points: DotPoint[];
  /** The full season domain. The axis is never shortened so a gap disappears. */
  seasons: number[];
  /**
   * Seasons with no league-wide table AND no leaders-list reading for this club
   * — the only ones that draw an empty ring at the baseline.
   */
  blankSeasons: number[];
  coverage: Coverage;
}) {
  const anyLeadersOnly = points.some((p) => p.leadersOnly);
  const [mRef, mW] = useMeasuredWidth<HTMLDivElement>(MOBILE.w);
  const [dRef, dW] = useMeasuredWidth<HTMLDivElement>(DESKTOP.w);

  const legend: LegendItem[] = [
    { swatch: 'dot', label: 'Dated reading, all 32 clubs', tone: 'partial' },
    { swatch: 'ring', label: 'Not a 32-team reading (on the baseline: no reading)', tone: 'absence' },
  ];

  // The reduced mobile domain: Tier 2 onward. Nothing is hidden by it — no
  // dead-money reading exists before 2013 on any surface — and it is stated.
  const mobileSeasons = seasons.filter((s) => s >= TIER2_FIRST_SEASON);
  const reduced = mobileSeasons.length < seasons.length && mobileSeasons.length > 0;
  const mobileDomain = mobileSeasons.length ? mobileSeasons : seasons;

  return (
    <div>
      <div className={css.atMobile}>
        <div ref={mRef} className={css.plotScroll}>
          <DotsSvg
            team={team}
            points={points.filter((p) => mobileDomain.includes(p.season))}
            seasons={mobileDomain}
            blankSeasons={blankSeasons}
            geo={{ ...MOBILE, w: mW }}
            rotateDates
          />
        </div>
        {reduced ? (
          <ChartCaption>
            {`At this width the axis runs ${mobileDomain[0]}–${mobileDomain[mobileDomain.length - 1]} so every dot keeps its own date. Nothing is hidden: dead money is recorded from ${TIER2_FIRST_SEASON} onward, and no reading exists before it.`}
          </ChartCaption>
        ) : null}
      </div>
      <div className={css.atDesktop}>
        <div ref={dRef} className={css.plotScroll}>
          <DotsSvg
            team={team}
            points={points}
            seasons={seasons}
            blankSeasons={blankSeasons}
            geo={{ ...DESKTOP, w: dW }}
            rotateDates={false}
          />
        </div>
      </div>
      <Legend items={legend} />
      <ChartCaption>{DOT_PLOT_CAPTION}</ChartCaption>
      {anyLeadersOnly ? (
        <ChartCaption>
          An open ring is a reading from a published leaders list, not a league-wide table. It is a
          real, dated figure for this club, but it can&rsquo;t be compared with the other 31.
        </ChartCaption>
      ) : null}
      <ChartCaption>{coverage.statement}</ChartCaption>
    </div>
  );
}

function DotsSvg({
  team,
  points,
  seasons,
  blankSeasons,
  geo,
  rotateDates,
}: {
  team: string;
  points: DotPoint[];
  seasons: number[];
  blankSeasons: number[];
  geo: typeof MOBILE;
  rotateDates: boolean;
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

  /**
   * `COMPONENTS.md` §8.4 and `SPEC.md` §2.1 rule 1: a dated reading without its
   * date cannot render. It is a build-time failure, not a silent omission.
   */
  if (process.env.NODE_ENV !== 'production') {
    const undated = points.find((p) => !p.asOfDate);
    if (undated) {
      throw new Error(
        `DeadMoneyDots received a ${undated.season} reading with no as-of date. ` +
          'Value, date and stage render together or not at all (SPEC.md §2.1).',
      );
    }
  }

  return (
    <>
      <svg
        className={css.svgFixed}
        width={w}
        height={h}
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

          {/* Seasons with no league-wide table AND no leaders-list reading for
            this club: an OPEN ring at the baseline, never a value and never an
            omission. A season this club DOES appear in carries its ring at its
            own reading instead — one mark, both facts. */}
          {blankSeasons
            .filter((s) => seasons.includes(s))
            .map((s) => (
              <g key={`b${s}`}>
                <circle
                  data-dm-absence={s}
                  cx={px(s)}
                  cy={innerH}
                  r={5}
                  fill="none"
                  stroke="var(--yy-absence)"
                  strokeWidth={1}
                  style={{ strokeDasharray: 'var(--yy-dash-absence)' }}
                />
                {/* Reads UPWARD from just above the ring, into the empty
                    column — v1 anchored it at its end, so it ran down through
                    the season tick labels. */}
                <text
                  className={css.micro}
                  x={px(s)}
                  y={innerH - 10}
                  dy={3.5}
                  textAnchor="start"
                  transform={`rotate(-90 ${px(s)} ${innerH - 10})`}
                >
                  No reading
                </text>
              </g>
            ))}

          {points.map((p) =>
            p.burden === null ? null : (
              <circle
                key={`p${p.season}-${p.asOfDate}`}
                /* Structural markers, so the build check can assert "every dot
                   keeps its date" and "no absence ring shares a season with a
                   reading" exactly, rather than inferring either from pixel
                   geometry. */
                data-dm-reading={p.season}
                cx={px(p.season)}
                cy={y(p.burden)}
                r={5}
                fill={p.leadersOnly ? 'none' : 'var(--yy-negative-fill)'}
                stroke={p.leadersOnly ? 'var(--yy-absence)' : 'var(--yy-bg-card-flat)'}
                strokeWidth={1}
                style={p.leadersOnly ? { strokeDasharray: 'var(--yy-dash-absence)' } : undefined}
              />
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
            <text key={`t${s}`} className={css.tick} x={px(s)} y={innerH + 16} textAnchor="middle">
              &rsquo;{String(s).slice(2)}
            </text>
          ))}

          {/* per-dot date labels — EVERY dot, always. Beneath the dot where
            there is room; rotated under its own one-unit-wide column where
            there is not. Never dropped. */}
          {points.map((p) =>
            p.burden === null ? null : rotateDates ? (
              <text
                key={`l${p.season}-${p.asOfDate}`}
                data-dm-asof={p.season}
                className={css.micro}
                x={px(p.season)}
                y={innerH + 30}
                textAnchor="end"
                fill="var(--yy-asof)"
                transform={`rotate(-90 ${px(p.season)} ${innerH + 30})`}
              >
                {p.asOfDate}
              </text>
            ) : (
              <text
                key={`l${p.season}-${p.asOfDate}`}
                data-dm-asof={p.season}
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

          {rotateDates ? null : (
            <text className={css.axisTitle} x={innerW / 2} y={innerH + 38} textAnchor="middle">
              Season
            </text>
          )}

          {grid.map((v) => (
            <text key={`vt${v}`} className={css.tick} x={-8} y={y(v) + 4} textAnchor="end">
              {(v * 100).toFixed(0)}%
            </text>
          ))}
        </g>

        {/* The axis label STATES ITS DENOMINATOR (`SPEC.md` §2.7). */}
        <text className={css.axisTitle} x={4} y={h - 6} textAnchor="start">
          Season · share of adjusted cap
        </text>
      </svg>
      <p id={`${id}-d`} className="yy-visually-hidden">
        A dot plot of dated dead-money readings. A filled dot is a reading from a league-wide
        table. An open dashed ring is a reading from a leaders list, which is not a 32-team
        reading.
      </p>
    </>
  );
}
