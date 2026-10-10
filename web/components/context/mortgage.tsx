/**
 * `FutureMortgage` — cash paid ahead of cap: prorated bonus already paid out
 * and still to be charged to future caps, against one league cap.
 * `SPEC.md` §2.10, `CAPPLUS_MEMO.md` §9.1, `DECISIONS.md` 111.
 *
 * Two rules travel with this block and are structural here, not stylistic:
 *  - `FUTURE_MORTGAGE_CAVEAT` renders with every rendering of the mortgage.
 *  - The mortgage is the BRIDGE between cash per win and cap per win
 *    (`MORTGAGE_BRIDGE_SENTENCE`). It is never folded into an index: the
 *    obligation blend that did so is retired.
 *
 * The bar's axis is fixed at 0–125% of one league cap for every club, so two
 * clubs' bars are comparable; the gold tick is the league median that season.
 */

import css from './context.module.css';
import { ordinal } from '../team/format';
import { usdShort } from '@/lib/display';
import { FUTURE_MORTGAGE_CAVEAT, MORTGAGE_BRIDGE_SENTENCE } from '@/lib/metric';

const MAX_SHARE = 1.25;
const pct = (v: number) => (Math.max(0, Math.min(MAX_SHARE, v)) / MAX_SHARE) * 100;

export function FutureMortgage({
  usd,
  share,
  leagueMedianShare,
  rank,
  n,
  rowsUnknown,
}: {
  usd: number;
  share: number;
  leagueMedianShare: number | null;
  /** 1 = largest mortgage in the league. */
  rank: number | null;
  n: number;
  rowsUnknown: number;
}) {
  const over = share > MAX_SHARE;
  return (
    <div className={css.mort}>
      <p className={css.mortHead}>
        <span className={`yy-num ${css.mortFigure}`}>{usdShort(usd)}</span>
        <span className={`yy-label ${css.mortUnit}`}>
          {`cash paid ahead of cap (the future-cap mortgage) · ${Math.round(share * 100)}% of one league cap`}
          {rank !== null ? ` · ${ordinal(rank)}-largest of ${n}` : ''}
        </span>
      </p>

      <div
        className={css.mortTrack}
        role="img"
        aria-label={`Future-cap mortgage ${Math.round(share * 100)}% of one league cap${
          leagueMedianShare !== null ? `; league median ${Math.round(leagueMedianShare * 100)}%` : ''
        }.`}
      >
        <span className={css.mortBar} style={{ width: `${pct(share)}%` }} />
        {over ? <span className={css.mortOver} aria-hidden="true" /> : null}
        <span className={css.mortCap} style={{ left: `${pct(1)}%` }} aria-hidden="true" />
        {leagueMedianShare !== null ? (
          <span className={css.mortMedian} style={{ left: `${pct(leagueMedianShare)}%` }} aria-hidden="true" />
        ) : null}
      </div>
      <div className={css.mortScale} aria-hidden="true">
        <span className="yy-label" style={{ left: 0 }}>
          0
        </span>
        <span className="yy-label" style={{ left: `${pct(1)}%` }}>
          One league cap
        </span>
      </div>
      {leagueMedianShare !== null ? (
        <p className={`yy-label ${css.mortMedianLabel}`}>
          <span className={css.mortMedianKey} aria-hidden="true" />
          League median {Math.round(leagueMedianShare * 100)}% this season
        </p>
      ) : null}
      <p className={`yy-caption ${css.caption}`}>{MORTGAGE_BRIDGE_SENTENCE}</p>
      <p className={`yy-caption ${css.fine}`}>
        {FUTURE_MORTGAGE_CAVEAT}
        {rowsUnknown > 0
          ? ` ${rowsUnknown} contract row${rowsUnknown === 1 ? '' : 's'} on this roster ${rowsUnknown === 1 ? 'has' : 'have'} no contract length and ${rowsUnknown === 1 ? 'counts' : 'count'} as zero.`
          : ''}
      </p>
    </div>
  );
}
