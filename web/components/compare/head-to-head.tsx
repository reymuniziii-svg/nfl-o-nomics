/**
 * `HeadToHead` — `COMPONENTS.md` §5, `SPEC.md` §3.4.
 *
 * The mockup's butterfly geometry is kept; two things change.
 *
 * 1. **D3 is fixed here (`DECISIONS.md` 69).** In the mockup the older team is
 *    carried entirely in salmon, so every reader is told it is bad by colour
 *    alone. Side A takes `--yy-series-subject`, side B takes
 *    `--yy-series-compare` PLUS a 45° hatch and a dashed rule. **Red does not
 *    appear anywhere on `/compare`** — neither side is a negative and
 *    favourability is not encoded by hue here at all.
 * 2. **Each side is scored against ITS OWN season's league average** (§5.3), so
 *    the reader compares two distances-from-average rather than two raw numbers.
 *    The gold tick for each side sits at its own zero — which is the centre
 *    divider — so there is one gold element, not two.
 */

import css from './head-to-head.module.css';
import chart from '../charts/chart.module.css';
import { ChartCaption, Legend, type LegendItem } from '../primitives';
import { usdShort } from '@/lib/display';
import type { BenchmarkRow, CompareBundle } from '@/lib/data/compare';
import type { Coverage } from '@/lib/display';

const TIER2_FIRST_SEASON = 2013;

function fmt(unit: BenchmarkRow['unit'], v: number): string {
  switch (unit) {
    case 'usd':
      return usdShort(v);
    case 'index':
      return v.toFixed(1);
    case 'rate':
      return Math.abs(v) < 1 ? v.toFixed(3) : v.toFixed(2);
    default:
      return v.toFixed(0);
  }
}

function fmtDelta(unit: BenchmarkRow['unit'], v: number): string {
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${fmt(unit, Math.abs(v))}`;
}

export function HeadToHead({ bundle, coverage }: { bundle: CompareBundle; coverage: Coverage }) {
  const tier1 = bundle.rows.filter((r) => r.tier === 1);
  const tier2 = bundle.rows.filter((r) => r.tier === 2);

  const oneSided = bundle.a.season < TIER2_FIRST_SEASON !== bundle.b.season < TIER2_FIRST_SEASON;
  const olderSide = bundle.a.season < TIER2_FIRST_SEASON ? bundle.a : bundle.b;

  const legend: LegendItem[] = [
    {
      swatch: 'solid',
      label: `${bundle.a.team} ’${String(bundle.a.season).slice(2)}`,
      tone: 'accent',
    },
    {
      swatch: 'dashed',
      label: `${bundle.b.team} ’${String(bundle.b.season).slice(2)}`,
      tone: 'compare',
    },
    { swatch: 'benchmark', label: 'Each side’s own season league average', tone: 'benchmark' },
  ];
  if (oneSided) {
    legend.push({ swatch: 'absence', label: 'Not covered', tone: 'absence' });
  }

  return (
    <div>
      {/* §5.2 — the standing band, directly beneath the era cards and above the
          first comparison chart. Copy verbatim from `SPEC.md` §3.4.2. */}
      <div className={css.statement}>
        <p className={`yy-label ${css.statementEyebrow}`}>How this comparison works</p>
        <p className={`yy-caption ${css.statementBody}`}>{bundle.crossEraStatement}</p>
      </div>

      {tier1.map((row) => (
        <ButterflyRow key={row.key} row={row} />
      ))}

      {tier2.length ? (
        <>
          {oneSided ? (
            <p className={`yy-caption ${css.tierNote}`}>
              Player-level economics begin in 2013. {olderSide.team} ’
              {String(olderSide.season).slice(2)} has team results only.
            </p>
          ) : null}
          {tier2.map((row) => (
            <ButterflyRow key={row.key} row={row} />
          ))}
        </>
      ) : null}

      <Legend items={legend} />
      <ChartCaption>{coverage.statement}</ChartCaption>
    </div>
  );
}

function ButterflyRow({ row }: { row: BenchmarkRow }) {
  const deltas = [row.a.delta, row.b.delta].filter((d): d is number => d !== null);
  const scaleMax = deltas.length ? Math.max(...deltas.map(Math.abs)) : 1;

  const width = (d: number | null) =>
    d === null || scaleMax === 0 ? 0 : Math.min(100, (Math.abs(d) / scaleMax) * 100);
  const below = (d: number | null) => d !== null && d < 0;

  return (
    <div className={chart.h2hRow}>
      <div className={`yy-num ${chart.h2hValue} ${chart.h2hValueA}`}>
        {row.a.raw.state === 'blank' ? (
          <span className={`yy-label ${chart.h2hNotCovered}`}>Not covered</span>
        ) : (
          fmt(row.unit, row.a.raw.value)
        )}
      </div>

      <div
        className={`${chart.h2hTrack} ${
          below(row.a.delta) ? chart.h2hTrackAwayA : chart.h2hTrackA
        }`}
      >
        {row.a.raw.state === 'blank' ? (
          <div className={chart.h2hAbsent} />
        ) : (
          <div
            className={`${chart.h2hBar} ${chart.h2hBarA}`}
            style={{ width: `${width(row.a.delta)}%` }}
          />
        )}
      </div>

      {/* one gold element, not two: each side's zero IS the centre divider */}
      <div className={chart.h2hCentre} aria-hidden="true" />

      <div className={`${chart.h2hTrack} ${below(row.b.delta) ? chart.h2hTrackAwayB : ''}`}>
        {row.b.raw.state === 'blank' ? (
          <div className={chart.h2hAbsent} />
        ) : (
          <div
            className={`${chart.h2hBar} ${chart.h2hBarB}`}
            style={{ width: `${width(row.b.delta)}%` }}
          />
        )}
      </div>

      <div className={`yy-num ${chart.h2hValue} ${chart.h2hValueB}`}>
        {row.b.raw.state === 'blank' ? (
          <span className={`yy-label ${chart.h2hNotCovered}`}>Not covered</span>
        ) : (
          fmt(row.unit, row.b.raw.value)
        )}
      </div>

      <div className={`yy-label ${chart.h2hLabel}`}>
        {row.label}
        <span className={chart.h2hDelta}>
          {row.a.delta === null
            ? row.a.raw.state === 'blank'
              ? row.a.raw.reason
              : 'No league average for this measure'
            : `${fmtDelta(row.unit, row.a.delta)} vs ’${String(row.a.ref.season).slice(2)} league`}
          {' · '}
          {row.b.delta === null
            ? row.b.raw.state === 'blank'
              ? row.b.raw.reason
              : 'No league average for this measure'
            : `${fmtDelta(row.unit, row.b.delta)} vs ’${String(row.b.ref.season).slice(2)} league`}
        </span>
      </div>
    </div>
  );
}

/** The two era cards. Side A is the subject, side B the comparison. */
export function EraCards({
  bundle,
  aIndex,
  bIndex,
}: {
  bundle: CompareBundle;
  aIndex: React.ReactNode;
  bIndex: React.ReactNode;
}) {
  return (
    <div className={css.eras}>
      <div className={`${css.era} ${css.eraA}`}>
        <div className={css.eraHead}>
          <span className={css.eraChip}>
            {bundle.a.team} ’{String(bundle.a.season).slice(2)}
          </span>
        </div>
        <span className={`yy-label ${css.eraName}`}>{bundle.aLabel}</span>
        {aIndex}
      </div>
      <div className={`${css.era} ${css.eraB}`}>
        <div className={css.eraHead}>
          <span className={css.eraChip}>
            {bundle.b.team} ’{String(bundle.b.season).slice(2)}
          </span>
        </div>
        <span className={`yy-label ${css.eraName}`}>{bundle.bLabel}</span>
        {bIndex}
      </div>
    </div>
  );
}
