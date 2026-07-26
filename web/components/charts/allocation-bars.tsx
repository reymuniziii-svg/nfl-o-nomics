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

/**
 * THE GEOMETRY IS TOKENS AND PERCENTAGES — there is no viewBox to stretch.
 *
 * A 240-unit viewBox under `width:100%` is not a 240-unit track. The row's
 * middle column runs ~220px at the 390 canvas and ~990px at 1280, so the same
 * composition painted at 0.91× and at 4.2×: the 10-unit bar `COMPONENTS.md` §7
 * fixes at `--yy-bar-h-lg` (10px) arrived as 9px on mobile and **42px** on
 * desktop, the 16px track as 67px, the 2px corner radius as 8, and the 1px gold
 * league-average axis as 4px. Nothing in the stylesheet changed; the viewBox did
 * the inflating, exactly as it did to in-chart type before `DECISIONS.md` 65.
 *
 * Two geometry constants per canvas would fix the scale and lose the fluid row —
 * an intrinsic-width composition cannot fill a column that is 220px on one
 * canvas and 990px on the next without stretching again. So the track is built
 * the way the Receipt's bar + gold tick and the head-to-head butterfly are
 * already built in this system: **an HTML track whose heights are the tokens the
 * spec names and whose positions are percentages of the shared domain.** Heights
 * are then exactly `--yy-track-h` / `--yy-bar-h-lg` at every width, the domain
 * still maps linearly across the full row, and the defect is structurally
 * unavailable — at 1280, at 390, and at 195px under 200% zoom.
 */

/** The bar is at least this many CSS px, so a near-zero delta is still a mark. */
const MIN_BAR_PX = 1;

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
  /** Percent of the track, not pixels — the one scale both canvases share. */
  const pct = scaleLinear().domain(domain).range([0, 100]);
  const zero = pct(0);

  return (
    <div>
      {POSITION_GROUP_ORDER.map((group) => {
        const bar = bySlug.get(group);
        const isSelected = selected === group;
        const label = bar
          ? `${group}: ${signedPoints(bar.deltaVsLeague)} points versus the league average share`
          : `${group}: not covered`;
        const end = bar ? pct(bar.deltaVsLeague) : zero;

        return (
          <div className={css.allocRow} key={group}>
            <span className={`yy-label ${css.allocGroup}`}>{group}</span>

            <div className={css.allocTrack} role="img" aria-label={label}>
              {bar ? (
                <div
                  className={`${css.allocFill} ${isSelected ? css.allocFillSelected : ''}`}
                  style={{
                    insetInlineStart: `${Math.min(zero, end)}%`,
                    width: `${Math.abs(end - zero)}%`,
                    minWidth: `${MIN_BAR_PX}px`,
                  }}
                />
              ) : (
                /* `CHART_ANATOMY.md` §5.2 — absence occupies the same box, in the
                   same place, as a live mark. It is centred on the benchmark
                   because it takes no position on either side of it. */
                <div className={css.allocAbsent} style={{ insetInlineStart: `${zero}%` }} />
              )}
              {/* THE ZERO AXIS IS GOLD — it is the league average. It replaces
                  the mockup's near-invisible light-on-light centre rule. */}
              <div className={css.allocZero} style={{ insetInlineStart: `${zero}%` }} />
            </div>

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

