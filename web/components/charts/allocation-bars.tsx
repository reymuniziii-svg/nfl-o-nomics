/**
 * `AllocationBars` — `COMPONENTS.md` §7, `SPEC.md` §3.2.4 / §2.6.
 *
 * NINE GROUPS, not seven, in the fixed §2.6 order — QB · RB · WR · TE · OL · DL
 * · LB · DB · ST — **never sorted by value**. A row order that changes between
 * teams destroys cross-team comparison.
 *
 * THE COLOUR RULING (§7.2, `DECISIONS.md` 82): **over/under-allocation is not
 * favourable/unfavourable.** Both directions take the same neutral fill.
 * Spending more on receivers than the league average is not a positive and less
 * on the defensive line is not a negative — that is a value grade on a roster
 * construction decision, which is precisely the judgment `SPEC.md` §3.3.7 and
 * `DECISIONS.md` 51 commit the product to never making. Lime is freed for the
 * selected group; the zero axis is GOLD, because it is the league average.
 */

import css from './chart.module.css';
import { ChartCaption } from '../primitives';
import { scaleLinear, symmetricDomain } from './chart-kit';
import { POSITION_GROUP_ORDER, signedPoints } from '@/lib/display';
import type { AllocationBar } from '@/lib/data/team';
import type { Coverage } from '@/lib/display';

/** §7.3 — rendered on the chart, always. Never "share of cap by position group". */
export const ALLOCATION_CAVEAT =
  'Share of cap held by players on the roster — not share of cap. The denominator inherits the ' +
  'dead-money omission. Position is as of the deal then in force.';

const TRACK_W = 240;

export function AllocationBars({
  bars,
  coverage,
  selected,
}: {
  bars: AllocationBar[];
  coverage: Coverage;
  /** The one lime element on this card. */
  selected?: string;
}) {
  const bySlug = new Map(bars.map((b) => [b.positionGroup, b]));
  const deltas = bars.map((b) => b.deltaVsLeague);
  const domain = symmetricDomain(deltas);
  const x = scaleLinear().domain(domain).range([0, TRACK_W]);
  const zero = x(0);

  return (
    <div>
      {POSITION_GROUP_ORDER.map((group) => {
        const bar = bySlug.get(group);
        const isSelected = selected === group;

        return (
          <div className={css.allocRow} key={group}>
            <span className={`yy-label ${css.allocGroup}`}>{group}</span>

            <svg
              className={css.svg}
              viewBox={`0 0 ${TRACK_W} 16`}
              role="img"
              aria-label={
                bar
                  ? `${group}: ${signedPoints(bar.deltaVsLeague)} points versus the league average share`
                  : `${group}: not covered`
              }
            >
              <rect x={0} y={0} width={TRACK_W} height={16} rx={2} fill="var(--yy-bg-sunken)" />
              {bar ? (
                <rect
                  x={bar.deltaVsLeague >= 0 ? zero : x(bar.deltaVsLeague)}
                  y={3}
                  width={Math.max(1, Math.abs(x(bar.deltaVsLeague) - zero))}
                  height={10}
                  rx={2}
                  fill={isSelected ? 'var(--yy-accent)' : 'var(--yy-series-neutral)'}
                />
              ) : (
                <rect
                  x={zero - 20}
                  y={3}
                  width={40}
                  height={10}
                  rx={2}
                  fill="var(--yy-absence-fill)"
                  stroke="var(--yy-absence)"
                  strokeWidth={1}
                  style={{ strokeDasharray: 'var(--yy-dash-absence)' }}
                />
              )}
              {/* THE ZERO AXIS IS GOLD — it is the league average. It replaces
                  the mockup's near-invisible light-on-light centre rule. */}
              <line
                x1={zero}
                x2={zero}
                y1={-2}
                y2={18}
                stroke="var(--yy-benchmark)"
                strokeWidth={1}
              />
            </svg>

            <span className={`yy-num ${css.allocValue}`}>
              {bar ? signedPoints(bar.deltaVsLeague) : '—'}
              <span className={`yy-label ${css.allocShare}`}>
                {bar ? `${(bar.shareOfRosteredCap * 100).toFixed(1)}%` : 'Not covered'}
              </span>
            </span>
          </div>
        );
      })}

      <ChartCaption>{ALLOCATION_CAVEAT}</ChartCaption>
      <ChartCaption>{coverage.statement}</ChartCaption>
    </div>
  );
}
