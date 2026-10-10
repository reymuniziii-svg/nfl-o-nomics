/**
 * `AllocationBars` — spend mix vs league as a compact diverging lollipop.
 * `COMPONENTS.md` §7, `SPEC.md` §3.2.4 / §2.6, review D #9 / B-Team #6.
 *
 * v1 drew nine ~40px slabs (≈700px on a phone) where the delta was large and
 * the actual share was tiny. Now each row reads, left to right:
 *
 *   QB   27.4%   ·────────|──●      +7.3 pts
 *        share   gold = league share   delta
 *
 * The SHARE is the figure (large); the lollipop and the signed delta beside it
 * say how far that sits from the league's share for the group.
 *
 * Rules kept:
 *  - NINE GROUPS in the fixed §2.6 order, never sorted by value.
 *  - §7.2 THE COLOUR RULING: over/under-allocation is not favourable or
 *    unfavourable. Both directions take the same neutral ink; nothing is lime
 *    unless `selected`, and nothing is red.
 *  - The zero axis is GOLD: it is the league average.
 *  - The delta axis is FIXED at ±15 points for every club (it was fitted to
 *    each team, so two clubs' bars were not comparable). A delta beyond it pins
 *    to the edge with a chevron; its true figure is printed beside it.
 *
 * HTML, not SVG: all text is real text on the type floor at any width, and the
 * component is a single `role="img"` with a full text equivalent.
 */

import css from './chart.module.css';
import { ChartCaption } from '../primitives';
import { POSITION_GROUP_NAME, POSITION_GROUP_ORDER, signedPoints } from '@/lib/display';
import type { AllocationBar } from '@/lib/data/team';
import type { Coverage } from '@/lib/display';
import { chartId } from './chart-kit';

/** §7.3 — rendered on the chart, always. Never "share of cap by position group". */
export const ALLOCATION_CAVEAT =
  'Share of cap held by players on the roster — not share of cap. The denominator inherits the ' +
  'dead-money omission. Position is as of the deal then in force.';

/** Fixed delta window, in share points. */
const SPAN = 0.15;
const pos = (d: number) => 50 + (Math.max(-SPAN, Math.min(SPAN, d)) / SPAN) * 50;

export function AllocationBars({
  bars,
  coverage,
  selected,
  team = 'team',
}: {
  bars: AllocationBar[];
  coverage: Coverage;
  /** The one lime element on this card. */
  selected?: string;
  team?: string;
}) {
  const bySlug = new Map(bars.map((b) => [b.positionGroup, b]));
  const id = chartId('alloc', team);
  const described = POSITION_GROUP_ORDER.map((g) => {
    const b = bySlug.get(g);
    return b
      ? `${POSITION_GROUP_NAME[g] ?? g} ${(b.shareOfRosteredCap * 100).toFixed(1)}%, ${signedPoints(b.deltaVsLeague)} points against a league share of ${(b.leagueShare * 100).toFixed(1)}%.`
      : `${POSITION_GROUP_NAME[g] ?? g}: not covered.`;
  }).join(' ');

  return (
    <div>
      <div className={css.lolliHead} aria-hidden="true">
        <span className="yy-label">Group</span>
        <span className="yy-label">Share</span>
        <span className={`yy-label ${css.lolliScale}`}>
          <span>−15</span>
          <span className={css.lolliScaleMid}>League</span>
          <span>+15 pts</span>
        </span>
        <span className="yy-label">vs lg</span>
      </div>
      <div role="img" aria-label="Spend mix: share of rostered cap by position group against the league" aria-describedby={`${id}-d`}>
        {POSITION_GROUP_ORDER.map((group) => {
          const bar = bySlug.get(group);
          const isSelected = selected === group;
          const d = bar?.deltaVsLeague ?? 0;
          const p = pos(d);
          const offscale = bar ? Math.abs(d) > SPAN : false;
          return (
            <div className={css.lolliRow} key={group}>
              <span className={`yy-label ${css.allocGroup}`}>{group}</span>
              <span className={`yy-num ${css.lolliShare}`}>
                {bar ? `${(bar.shareOfRosteredCap * 100).toFixed(1)}%` : ''}
              </span>
              <span className={css.lolliTrack}>
                <span className={css.lolliZero} />
                {bar ? (
                  <>
                    <span
                      className={css.lolliStem}
                      style={{ left: `${Math.min(50, p)}%`, width: `${Math.abs(p - 50)}%` }}
                    />
                    <span
                      className={`${css.lolliDot} ${isSelected ? css.lolliDotSel : ''} ${offscale ? css.lolliDotOff : ''}`}
                      style={{ left: `${p}%` }}
                    />
                  </>
                ) : (
                  <span className={css.lolliAbsent} />
                )}
              </span>
              <span className={`yy-num ${css.lolliDelta}`}>
                {bar ? signedPoints(d) : <span className="yy-label">Not covered</span>}
              </span>
            </div>
          );
        })}
      </div>
      <p id={`${id}-d`} className="yy-visually-hidden">
        {described}
      </p>

      <ChartCaption>{ALLOCATION_CAVEAT}</ChartCaption>
      <ChartCaption>{coverage.statement}</ChartCaption>
    </div>
  );
}
