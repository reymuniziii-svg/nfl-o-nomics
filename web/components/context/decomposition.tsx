/**
 * `CapPlusDecomposition` — Cap+ split into its two published terms, drawn as a
 * waterfall on the Cap+ axis (`SPEC.md` §2.10, `CAPPLUS_MEMO.md` §8).
 *
 *   100 (league average) → + roster_pts → = QB-neutral Cap+ → + qb_timing_pts → = Cap+
 *
 * The sum is EXACT by construction (`qb_timing_pts + roster_pts = capplus − 100`),
 * so the bars close on the Cap+ dot without a remainder and nothing here is
 * computed except positions. The QB term is usually a sliver. That is the
 * finding, not a rendering problem: the caption says so in numbers.
 *
 * HTML, not SVG: every label is real text at the type floor at any width, and
 * the marks are positioned in percent of a FIXED 76–124 window (the index
 * window, `CHART_ANATOMY.md` §2 — never fitted to the team). A value outside it
 * is pinned to the edge with a chevron and its true figure stays in the value
 * column. (Strings that follow an expression are template literals on purpose:
 * the SWC JSX transform here drops the space between `{expr}` and text that
 * wraps onto the next source line.)
 */

import css from './context.module.css';
import { signedIndex } from '../team/format';
import { CAPPLUS_QB_NEUTRAL_LABEL } from '@/lib/metric';
import { INDEX_DOMAIN } from '../charts/chart-kit';

const [LO, HI] = INDEX_DOMAIN;
const pct = (v: number) => ((Math.max(LO, Math.min(HI, v)) - LO) / (HI - LO)) * 100;
const off = (v: number) => (v > HI ? 'above' : v < LO ? 'below' : null);

export function CapPlusDecomposition({
  capplus,
  rosterPts,
  qbTimingPts,
  qbNeutral,
}: {
  capplus: number;
  rosterPts: number;
  qbTimingPts: number;
  qbNeutral: number;
}) {
  const steps = [
    { key: 'roster', name: 'Roster & results', from: 100, to: qbNeutral, delta: rosterPts },
    { key: 'qb', name: 'QB contract timing', from: qbNeutral, to: capplus, delta: qbTimingPts },
  ];

  return (
    <div
      className={css.wf}
      role="img"
      aria-label={`Cap+ ${capplus.toFixed(1)} equals 100, plus ${signedIndex(rosterPts)} from the roster and results, giving ${CAPPLUS_QB_NEUTRAL_LABEL} ${qbNeutral.toFixed(1)}, plus ${signedIndex(qbTimingPts)} from the quarterback's contract timing.`}
    >
      <Row name="League average" value="100.0" valueClass={css.wfBench}>
        <span className={css.wfStart} style={{ left: `${pct(100)}%` }} />
      </Row>
      {steps.map((s) => {
        const a = pct(Math.min(s.from, s.to));
        const b = pct(Math.max(s.from, s.to));
        const o = off(s.to);
        return (
          <Row key={s.key} name={s.name} value={signedIndex(s.delta)}>
            <span
              className={`${css.wfBar} ${s.delta < 0 ? css.wfBarNeg : ''}`}
              style={{ left: `${a}%`, width: `max(2px, ${b - a}%)` }}
            />
            {o ? <span className={`${css.wfOff} ${o === 'above' ? css.wfOffHi : css.wfOffLo}`} aria-hidden="true" /> : null}
            {s.key === 'roster' ? (
              <span className={css.wfMark} style={{ left: `${pct(qbNeutral)}%` }} title={CAPPLUS_QB_NEUTRAL_LABEL} />
            ) : null}
          </Row>
        );
      })}
      <Row name="Cap+" value={capplus.toFixed(1)} valueClass={css.wfTotal}>
        <span className={css.wfDot} style={{ left: `${pct(capplus)}%` }} />
        {off(capplus) ? (
          <span className={`${css.wfOff} ${off(capplus) === 'above' ? css.wfOffHi : css.wfOffLo}`} aria-hidden="true" />
        ) : null}
      </Row>
      <div className={css.wfAxis} aria-hidden="true">
        <span />
        <span className={css.wfAxisTrack}>
          {[80, 90, 100, 110, 120].map((t) => (
            <span
              key={t}
              className={`yy-label ${css.wfTick} ${t === 100 ? css.wfTickBench : ''}`}
              style={{ left: `${pct(t)}%` }}
            >
              {t}
            </span>
          ))}
        </span>
        <span />
      </div>
      <p className={`yy-label ${css.wfNeutral}`}>
        {`${CAPPLUS_QB_NEUTRAL_LABEL} ${qbNeutral.toFixed(1)} — the same season with a median starter’s cap number in place of this one`}
      </p>
    </div>
  );
}

function Row({
  name,
  value,
  valueClass,
  children,
}: {
  name: string;
  value: string;
  valueClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={css.wfRow}>
      <span className={`yy-label ${css.wfName}`}>{name}</span>
      <span className={css.wfTrack}>
        <span className={css.wfGold} style={{ left: `${pct(100)}%` }} />
        {children}
      </span>
      <span className={`yy-num ${css.wfValue} ${valueClass ?? ''}`}>{value}</span>
    </div>
  );
}
