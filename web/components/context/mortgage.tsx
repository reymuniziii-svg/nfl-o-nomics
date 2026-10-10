/**
 * `FutureMortgage` — prorated bonus already charged to future seasons, against
 * one league cap, with the CANDIDATE Cap+ (obligation) printed beside Cap+.
 * `SPEC.md` §2.10, `CAPPLUS_MEMO.md` §8.2–8.3.
 *
 * Two rules travel with this block and are structural here, not stylistic:
 *  - `FUTURE_MORTGAGE_CAVEAT` renders with every rendering of the mortgage.
 *  - `capplus_obligation` is a candidate. It renders only as
 *    `CAPPLUS_OBLIGATION_LABEL`, only BESIDE Cap+, and carries a "Candidate"
 *    tag. It is never "Cap+" alone.
 *
 * The bar's axis is fixed at 0–125% of one league cap for every club, so two
 * clubs' bars are comparable; the gold tick is the league median that season.
 */

import css from './context.module.css';
import { ordinal } from '../team/format';
import { usdShort } from '@/lib/display';
import {
  CAPPLUS_OBLIGATION_LABEL,
  FUTURE_MORTGAGE_CAVEAT,
  type Metric,
} from '@/lib/metric';
import type { CapPlusContextIndices } from '@/lib/data/context';

const MAX_SHARE = 1.25;
const pct = (v: number) => (Math.max(0, Math.min(MAX_SHARE, v)) / MAX_SHARE) * 100;

export function FutureMortgage({
  usd,
  share,
  leagueMedianShare,
  rank,
  n,
  rowsUnknown,
  alpha,
  indices,
}: {
  usd: number;
  share: number;
  leagueMedianShare: number | null;
  /** 1 = largest mortgage in the league. */
  rank: number | null;
  n: number;
  rowsUnknown: number;
  alpha: number;
  indices: Metric<CapPlusContextIndices>;
}) {
  const over = share > MAX_SHARE;
  return (
    <div className={css.mort}>
      <p className={css.mortHead}>
        <span className={`yy-num ${css.mortFigure}`}>{usdShort(usd)}</span>
        <span className={`yy-label ${css.mortUnit}`}>
          {`charged to future seasons (the future-cap mortgage) · ${Math.round(share * 100)}% of one league cap`}
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
      <p className={`yy-caption ${css.fine}`}>
        {FUTURE_MORTGAGE_CAVEAT}
        {rowsUnknown > 0
          ? ` ${rowsUnknown} contract row${rowsUnknown === 1 ? '' : 's'} on this roster ${rowsUnknown === 1 ? 'has' : 'have'} no contract length and ${rowsUnknown === 1 ? 'counts' : 'count'} as zero.`
          : ''}
      </p>

      {/* SPEC §2.10 — the candidate, only ever BESIDE Cap+. */}
      {indices.state === 'blank' ? (
        <p className={`yy-caption ${css.blank}`}>{indices.reason}</p>
      ) : (
        <div className={css.pair}>
          <div className={css.pairCell}>
            <span className={`yy-label ${css.pairLabel}`}>Cap+</span>
            <span className={`yy-num ${css.pairValue}`}>{indices.value.capplus.toFixed(1)}</span>
            <span className={`yy-label ${css.pairRank}`}>{ordinal(indices.value.capplusRank)} of 32</span>
          </div>
          <div className={css.pairCell}>
            <span className={`yy-label ${css.pairLabel}`}>
              {CAPPLUS_OBLIGATION_LABEL} <span className={css.candidate}>Candidate</span>
            </span>
            <span className={`yy-num ${css.pairValue}`}>{indices.value.capplusObligation.toFixed(1)}</span>
            <span className={`yy-label ${css.pairRank}`}>{ordinal(indices.value.obligationRank)} of 32</span>
          </div>
          <p className={`yy-caption ${css.pairNote}`}>
            {`${CAPPLUS_OBLIGATION_LABEL} charges ${alpha === 0.5 ? 'half' : `${alpha * 100}%`} of the future-cap mortgage to this season’s cost. It is a candidate under review, not the published index.`}
          </p>
        </div>
      )}
    </div>
  );
}
