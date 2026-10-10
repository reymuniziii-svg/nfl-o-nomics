/**
 * `HeadToHead` — `COMPONENTS.md` §5, `SPEC.md` §3.4, review 2026-10-10 D #4.
 *
 * A DIVERGING DOT PLOT. Per metric row, both team-seasons sit on ONE shared
 * axis whose zero is each side's OWN season league average, so the reader
 * compares two distances-from-average — never two raw numbers drawn as if they
 * were one scale. The v1 butterfly normalized every row to its own leader (so
 * every leader drew full width) and printed raw values beside bars that encoded
 * deltas. Both faults are gone:
 *
 *  - **Each metric has a PINNED domain** (`AXIS` below), chosen from the
 *    1999–2025 spread of that metric's within-season deltas. A +18 Team Rating
 *    and a +.250 win percentage draw at their real share of what the league has
 *    ever produced, and two different pairs are drawn on the same ruler. A
 *    value beyond the domain is drawn AT the edge with an off-scale chevron and
 *    its printed delta is exact — it is never silently clipped.
 *  - **The printed figure IS the plotted figure**: the delta is printed large,
 *    the raw value small beneath it.
 *  - **Every row names its better direction.** Money rows run the other way:
 *    this product measures what wins cost, so a lower cost per win or dead-money
 *    burden is better. Raw cash spent and cap held are shown as context,
 *    outside the tally: cost per win already carries the cost side, and scoring
 *    raw spend would reward being cheap regardless of result.
 *  - **A tally headline** states the verdict the rows add up to.
 *
 * Color roles (`DECISIONS.md` 69): side A is `--yy-accent` with a round dot and
 * a solid stem; side B is `--yy-compare` with a diamond and a dashed stem. Shape
 * and stroke carry the distinction, so color is never the sole carrier. **Red
 * does not appear on `/compare`.** Gold is the league average and nothing else:
 * one 2px rule per row, at the shared zero, named once in words above the plot.
 *
 * Motion: none. The page is server-rendered per URL; a new pair is a new
 * document, which is a cross-fade by construction (`CHART_ANATOMY.md` §6.1).
 */

import css from './head-to-head.module.css';
import { ChartCaption, Legend, type LegendItem } from '../primitives';
import { usdShort } from '@/lib/display';
import type { BenchmarkRow, BenchmarkSide, CompareBundle } from '@/lib/data/compare';
import type { Coverage } from '@/lib/display';

const TIER2_FIRST_SEASON = 2013;

/** Which way is better. `null` = context row, outside the tally. */
type Better = 'higher' | 'lower' | null;

/**
 * Pinned half-domains, in the row's own unit, symmetric about the league
 * average. Each is the max |within-season delta| observed 1999–2025 (or the
 * 99th percentile where one season is a far outlier), rounded up. They are
 * constants, not fitted per pair.
 */
const AXIS: Record<string, { half: number; better: Better }> = {
  win_pct: { half: 0.5, better: 'higher' },
  point_diff: { half: 320, better: 'higher' },
  epa_margin: { half: 0.35, better: 'higher' },
  team_rating: { half: 40, better: 'higher' },
  capplus: { half: 40, better: 'higher' },
  cash_spent: { half: 0.5, better: null },
  cap_used: { half: 0.35, better: null },
  cost_per_win: { half: 0.36, better: 'lower' },
  dead_money: { half: 0.25, better: 'lower' },
};

function axisFor(row: BenchmarkRow) {
  const pinned = AXIS[row.key];
  if (pinned) return pinned;
  // An unknown row still renders honestly: a symmetric domain wide enough for
  // both sides, and no claimed better direction.
  const m = Math.max(...[row.a.delta, row.b.delta].map((d) => Math.abs(d ?? 0)), 1e-9);
  return { half: m * 1.15, better: null as Better };
}

const MINUS = '−';

function sign(v: number): string {
  return v > 0 ? '+' : v < 0 ? MINUS : '±';
}

/** `.750`, `−.050` — a rate below 1 drops its leading zero, box-score style. */
function rate(v: number): string {
  const abs = Math.abs(v);
  const body = abs < 1 ? abs.toFixed(3).replace(/^0/, '') : abs.toFixed(3);
  return `${v < 0 ? MINUS : ''}${body}`;
}

/** The raw value, as the source states it. */
function rawText(unit: BenchmarkRow['unit'], v: number): string {
  switch (unit) {
    case 'usd':
      return usdShort(v);
    case 'index':
      return v.toFixed(1);
    case 'rate':
      return rate(v);
    case 'pct_of_cap':
      return `${(v * 100).toFixed(1)}%`;
    default:
      return `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(0)}`;
  }
}

/** The delta vs that side's own league — the plotted quantity. */
function deltaParts(unit: BenchmarkRow['unit'], d: number): { figure: string; unit: string } {
  const s = sign(d);
  const a = Math.abs(d);
  switch (unit) {
    case 'usd':
      return { figure: `${s}${usdShort(a)}`, unit: '' };
    case 'index':
      return { figure: `${s}${a.toFixed(1)}`, unit: '' };
    case 'rate':
      return { figure: `${s}${rate(a)}`, unit: '' };
    case 'pct_of_cap':
      return { figure: `${s}${(a * 100).toFixed(1)}`, unit: 'pts' };
    default:
      return { figure: `${s}${a.toFixed(0)}`, unit: '' };
  }
}

const yy = (season: number) => `’${String(season).slice(2)}`;
const tag = (side: BenchmarkSide) => `${side.ref.team} ${yy(side.ref.season)}`;

/** +1 when A is better, −1 when B is, 0 when level, null when not comparable. */
function edgeOf(row: BenchmarkRow): 1 | -1 | 0 | null {
  const { better } = axisFor(row);
  if (!better || row.a.delta === null || row.b.delta === null) return null;
  const dir = better === 'higher' ? 1 : -1;
  const a = dir * row.a.delta;
  const b = dir * row.b.delta;
  // Level within display precision is level — a tally that awards a row on the
  // fourth decimal of a three-decimal readout is a tally the reader can't check.
  const eps = row.unit === 'index' ? 0.05 : row.unit === 'count' ? 0.5 : 0.0005;
  if (Math.abs(a - b) < eps) return 0;
  return a > b ? 1 : -1;
}

export function HeadToHead({ bundle, coverage }: { bundle: CompareBundle; coverage: Coverage }) {
  const tier1 = bundle.rows.filter((r) => r.tier === 1);
  const tier2 = bundle.rows.filter((r) => r.tier === 2);

  const oneSided = bundle.a.season < TIER2_FIRST_SEASON !== bundle.b.season < TIER2_FIRST_SEASON;
  const olderSide = bundle.a.season < TIER2_FIRST_SEASON ? bundle.a : bundle.b;

  const aTag = `${bundle.a.team} ${yy(bundle.a.season)}`;
  const bTag = `${bundle.b.team} ${yy(bundle.b.season)}`;

  /* ---- the tally ---- */
  const edges = bundle.rows.map(edgeOf);
  const scored = edges.filter((e) => e !== null).length;
  const aWins = edges.filter((e) => e === 1).length;
  const bWins = edges.filter((e) => e === -1).length;
  const level = edges.filter((e) => e === 0).length;
  const context = bundle.rows.filter((r) => axisFor(r).better === null).length;
  const uncovered = bundle.rows.length - scored - context;

  const headline =
    scored === 0
      ? 'No measure covers both teams'
      : aWins === bWins
        ? `${aTag} and ${bTag} split ${aWins}–${bWins}`
        : aWins > bWins
          ? `${aTag} ahead on ${aWins} of ${scored}`
          : `${bTag} ahead on ${bWins} of ${scored}`;

  const subParts = [
    aWins > bWins && bWins
      ? `${bTag} ahead on ${bWins}`
      : bWins > aWins && aWins
        ? `${aTag} ahead on ${aWins}`
        : null,
    level ? `${level} level` : null,
    uncovered ? `${uncovered} not covered on one side` : null,
    context ? `${context} context rows, not scored` : null,
  ].filter(Boolean);

  const legend: LegendItem[] = [
    { swatch: 'solid', label: `${aTag} — round dot, solid stem`, tone: 'accent' },
    { swatch: 'dashed', label: `${bTag} — diamond, dashed stem`, tone: 'compare' },
    { swatch: 'benchmark', label: 'Each side’s own season league average', tone: 'benchmark' },
  ];
  const offScale = bundle.rows.some((r) => {
    const { half } = axisFor(r);
    return [r.a.delta, r.b.delta].some((d) => d !== null && Math.abs(d) > half);
  });
  if (offScale) {
    legend.push({
      swatch: 'offscale',
      label: 'Off the axis; the printed figure is exact',
      tone: 'compare',
    });
  }
  if (oneSided || bundle.rows.some((r) => r.a.raw.state === 'blank' || r.b.raw.state === 'blank')) {
    legend.push({ swatch: 'absence', label: 'Not covered', tone: 'absence' });
  }

  const descId = `h2h-${bundle.a.team}${bundle.a.season}-${bundle.b.team}${bundle.b.season}`;

  return (
    <div>
      {/* §5.2 — the standing band, directly beneath the era cards and above the
          first comparison chart. Copy verbatim from `SPEC.md` §3.4.2. */}
      <div className={css.statement}>
        <p className={`yy-label ${css.statementEyebrow}`}>How this comparison works</p>
        <p className={`yy-caption ${css.statementBody}`}>{bundle.crossEraStatement}</p>
      </div>

      <div className={css.tally}>
        <p className={css.tallyHead}>{headline}</p>
        {subParts.length ? (
          <p className={`yy-label ${css.tallySub}`}>{subParts.join(' · ')}</p>
        ) : null}
      </div>

      <div
        className={css.plot}
        role="img"
        aria-label={`${headline}. ${bundle.rows.length} measures, each plotted as its distance from that side’s own season league average.`}
        aria-describedby={descId}
      >
        <div className={css.scaleRow} aria-hidden="true">
          <span className={`yy-label ${css.scaleBelow}`}>‹ Below its league</span>
          <span className={`yy-label ${css.scaleAvg}`}>League avg</span>
          <span className={`yy-label ${css.scaleAbove}`}>Above its league ›</span>
        </div>

        <ul className={css.rows}>
          {tier1.map((row) => (
            <DotRow key={row.key} row={row} />
          ))}
        </ul>

        {tier2.length ? (
          <>
            <p className={`yy-label ${css.tierHead}`}>Money · 2013 onward</p>
            {oneSided ? (
              <p className={`yy-caption ${css.tierNote}`}>
                Cap and cash data start in 2013. {olderSide.team} {yy(olderSide.season)} shows team results only.
              </p>
            ) : null}
            <ul className={css.rows}>
              {tier2.map((row) => (
                <DotRow key={row.key} row={row} />
              ))}
            </ul>
          </>
        ) : null}
      </div>

      {/* The text equivalent of the plot, row by row. */}
      <ul id={descId} className="yy-visually-hidden">
        {bundle.rows.map((row) => (
          <li key={row.key}>{rowSentence(row)}</li>
        ))}
      </ul>

      <Legend items={legend} />
      <ChartCaption>
        Every row uses one fixed scale for all pairings, so a dot near the edge sits near the most
        extreme season on record. Higher wins on results rows. Lower wins on cost per win and on
        dead money, the cap you still pay for players who are gone. Cash spent and cap held are
        context only, because cost per win already covers cost and raw spend rewards cheap teams
        whether or not they won.
      </ChartCaption>
      <ChartCaption>{coverage.statement}</ChartCaption>
    </div>
  );
}

function sideSentence(row: BenchmarkRow, side: BenchmarkSide): string {
  const who = tag(side);
  if (side.raw.state === 'blank') return `${who} not covered. ${side.raw.reason}`;
  const raw = rawText(row.unit, side.raw.value);
  if (side.delta === null) return `${who} ${raw}, no comparable league benchmark`;
  const d = deltaParts(row.unit, side.delta);
  return `${who} ${raw}, ${d.figure}${d.unit ? ` ${d.unit === 'pts' ? 'points of cap' : d.unit}` : ''} vs its league`;
}

function rowSentence(row: BenchmarkRow): string {
  const { better } = axisFor(row);
  const e = edgeOf(row);
  const dir =
    better === 'higher' ? 'Higher is better.' : better === 'lower' ? 'Lower is better.' : 'Context only, not scored.';
  const verdict =
    e === 1 ? `${tag(row.a)} ahead.` : e === -1 ? `${tag(row.b)} ahead.` : e === 0 ? 'Level.' : '';
  const end = (s: string) => (s.endsWith('.') ? s : `${s}.`);
  return `${row.label}. ${end(sideSentence(row, row.a))} ${end(sideSentence(row, row.b))} ${dir} ${verdict}`.trim();
}

/** Position on the track, 0–100%, and whether the value ran off the axis. */
function place(delta: number, half: number): { pct: number; off: -1 | 0 | 1 } {
  const t = delta / half;
  if (t > 1) return { pct: 100, off: 1 };
  if (t < -1) return { pct: 0, off: -1 };
  return { pct: 50 + t * 50, off: 0 };
}

function DotRow({ row }: { row: BenchmarkRow }) {
  const { half, better } = axisFor(row);
  const e = edgeOf(row);

  const dirLabel =
    better === 'higher'
      ? 'Higher is better'
      : better === 'lower'
        ? 'Lower is better'
        : 'Context · not scored';
  const edgeLabel =
    e === 1 ? `Edge ${tag(row.a)}` : e === -1 ? `Edge ${tag(row.b)}` : e === 0 ? 'Level' : null;

  return (
    <li className={css.row}>
      <div className={css.rowHead}>
        <span className={`yy-label ${css.rowLabel}`}>{row.label}</span>
        <span className={`yy-label ${css.rowDir}`}>
          {dirLabel}
          {edgeLabel ? (
            <>
              {' · '}
              <span className={css.rowEdge}>{edgeLabel}</span>
            </>
          ) : null}
        </span>
      </div>

      <Readout row={row} side="a" />

      <div className={css.track}>
        <Lane side={row.a} which="a" half={half} />
        <Lane side={row.b} which="b" half={half} />
        {/* the one gold element: the shared zero = each side's own league average */}
        <span className={css.zero} />
      </div>

      <Readout row={row} side="b" />
    </li>
  );
}

function Lane({ side, which, half }: { side: BenchmarkSide; which: 'a' | 'b'; half: number }) {
  const laneCls = `${css.lane} ${which === 'a' ? css.laneA : css.laneB}`;
  // No value, or a value with no comparable benchmark: either way there is no
  // distance to draw, and the lane says so rather than sitting empty.
  if (side.raw.state === 'blank' || side.delta === null) {
    return (
      <span className={laneCls}>
        <span className={css.laneAbsent} />
      </span>
    );
  }
  const { pct, off } = place(side.delta, half);
  const lo = Math.min(50, pct);
  const width = Math.abs(pct - 50);
  return (
    <span className={laneCls}>
      <span className={css.stem} style={{ left: `${lo}%`, width: `${width}%` }} />
      <span
        className={`${css.mark} ${side.raw.state === 'partial' ? css.markPartial : ''}`}
        style={{ left: `${pct}%` }}
      />
      {off ? <span className={off > 0 ? css.offRight : css.offLeft} /> : null}
    </span>
  );
}

function Readout({ row, side }: { row: BenchmarkRow; side: 'a' | 'b' }) {
  const s = row[side];
  const cls = `${css.read} ${side === 'a' ? css.readA : css.readB}`;
  const who = (
    <span className={`yy-label ${css.who}`}>
      <span className={`${css.whoGlyph} ${side === 'a' ? css.glyphA : css.glyphB}`} aria-hidden="true" />
      {tag(s)}
    </span>
  );

  if (s.raw.state === 'blank') {
    return (
      <div className={cls}>
        {who}
        <span className={`yy-label ${css.notCovered}`}>Not covered</span>
        <span className={`yy-label ${css.raw}`}>{s.raw.reason}</span>
      </div>
    );
  }

  const raw = rawText(row.unit, s.raw.value);
  const usd = s.secondaryUsd !== null && s.secondaryUsd !== undefined ? usdShort(s.secondaryUsd) : null;
  const lg = s.leagueAvg !== null ? rawText(row.unit, s.leagueAvg) : null;
  const provisional = s.raw.state === 'value' && s.raw.provisional;

  return (
    <div className={cls}>
      {who}
      {s.delta === null ? (
        <span className={`yy-label ${css.notCovered}`}>No league benchmark</span>
      ) : (
        <span className={css.delta}>
          <span className="yy-num">{deltaParts(row.unit, s.delta).figure}</span>
          {deltaParts(row.unit, s.delta).unit ? (
            <span className={`yy-label ${css.deltaUnit}`}>{deltaParts(row.unit, s.delta).unit}</span>
          ) : null}
        </span>
      )}
      <span className={`yy-label ${css.raw}`}>
        <span className="yy-num">{raw}</span>
        {lg ? <> · avg {lg}</> : null}
        {s.raw.state === 'partial' ? (
          <span className={css.partialMark}>
            {' '}
            ⟨{s.raw.covered}/{s.raw.total}⟩
          </span>
        ) : null}
      </span>
      {usd ? <span className={`yy-label ${css.raw}`}>{usd}</span> : null}
      {provisional ? (
        <span className={`yy-label ${css.provisional}`}>Provisional</span>
      ) : null}
      {s.raw.state === 'partial' ? (
        <span className={`yy-label ${css.raw}`}>{s.raw.reason}</span>
      ) : null}
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
          <span className={`${css.whoGlyph} ${css.glyphA}`} aria-hidden="true" />
          <span className={css.eraChip}>
            {bundle.a.team} {yy(bundle.a.season)}
          </span>
        </div>
        <span className={`yy-label ${css.eraName}`}>{bundle.aLabel}</span>
        {aIndex}
      </div>
      <div className={`${css.era} ${css.eraB}`}>
        <div className={css.eraHead}>
          <span className={`${css.whoGlyph} ${css.glyphB}`} aria-hidden="true" />
          <span className={css.eraChip}>
            {bundle.b.team} {yy(bundle.b.season)}
          </span>
        </div>
        <span className={`yy-label ${css.eraName}`}>{bundle.bLabel}</span>
        {bIndex}
      </div>
    </div>
  );
}
