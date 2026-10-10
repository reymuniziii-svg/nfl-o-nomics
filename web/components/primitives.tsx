/**
 * Shared primitives.
 *
 * These are server components — none of them holds state, so none of them ships
 * JavaScript. The three that must be interactive (`Caveat`, `CsvExport`,
 * `LensToggle`) live in their own `'use client'` modules.
 *
 * Every value here is a token binding in `primitives.module.css`; no component
 * in this file names a color, a radius, a spacing or a font.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import css from './primitives.module.css';
import { badgeDetail, badgeNote, type AsOf as AsOfValue, type Metric } from '@/lib/metric';
import { indexBand, partialSuffix, stageWords, type Band } from '@/lib/display';

/* ══════════════════════════════════════════════════════════════════════════ */
/* CARD                                                                        */
/* ══════════════════════════════════════════════════════════════════════════ */

export function Card({
  children,
  accent = false,
  className,
  id,
  as: As = 'section',
  ariaLabel,
}: {
  children: ReactNode;
  accent?: boolean;
  className?: string;
  id?: string;
  as?: 'section' | 'div' | 'article';
  ariaLabel?: string;
}) {
  return (
    <As
      id={id}
      aria-label={ariaLabel}
      className={[css.card, accent ? css.cardAccent : '', className].filter(Boolean).join(' ')}
    >
      {children}
    </As>
  );
}

/**
 * The card header. The right slot is the SAME SLOT ON EVERY SURFACE
 * (`COMPONENTS.md` §14) — the CSV affordance lives there and a reader learns it
 * once.
 */
export function CardHeader({
  eyebrow,
  title,
  titleId,
  right,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  titleId?: string;
  right?: ReactNode;
}) {
  return (
    <header className={css.cardHead}>
      <div className={css.cardHeadText}>
        {eyebrow ? <p className={`yy-eyebrow ${css.cardEyebrow}`}>{eyebrow}</p> : null}
        <h2 id={titleId} className={`yy-card-title ${css.cardTitle}`}>
          {title}
        </h2>
      </div>
      {right ? <div className={css.cardHeadSlot}>{right}</div> : null}
    </header>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* CHIPS — CHART_ANATOMY.md §5.3                                               */
/* ══════════════════════════════════════════════════════════════════════════ */

const CHIP_CLASS = {
  provisional: css.chipProvisional,
  estimated: css.chipEstimated,
  early: css.chipEarly,
  projected: css.chipProjected,
  verified: css.chipVerified,
  sample: css.chipSample,
} as const;

const CHIP_TEXT = {
  provisional: 'Provisional',
  estimated: 'Estimated',
  early: 'Early',
  projected: 'Projected',
  verified: 'Verified actual',
  sample: 'Sample',
} as const;

export function Chip({
  kind,
  title,
}: {
  kind: keyof typeof CHIP_CLASS;
  title?: string;
}) {
  return (
    <span className={`yy-micro ${css.chip} ${CHIP_CLASS[kind]}`} title={title}>
      {CHIP_TEXT[kind]}
    </span>
  );
}

/**
 * The Cap+ season badge as a chip — Provisional or Estimated — for any metric
 * that carries one (`badgeNote`). The reason sentence is the chip's hover
 * title, its accessible text, and a visible line in the print/screenshot
 * variant (`.yy-export`, `@media print`), so a screenshot never drops it.
 * Renders nothing for an unbadged value. `sentence="inline"` prints it always.
 */
export function BadgeChip({
  metric,
  sentence = 'export',
}: {
  metric: Metric<unknown> | null | undefined;
  sentence?: 'export' | 'inline' | 'none';
}) {
  const note = badgeNote(metric);
  if (!note) return null;
  return (
    <span className={css.badgeChipWrap}>
      <span className={`yy-micro ${css.chip} ${CHIP_CLASS[note.badge]}`} title={note.sentence}>
        {note.label}
        <span className="yy-visually-hidden">: {badgeDetail(note.badge, note.reasonRaw)}</span>
      </span>
      {sentence === 'none' ? null : (
        <span
          className={`yy-label ${css.badgeChipSentence} ${sentence === 'inline' ? css.badgeChipSentenceInline : ''}`}
          aria-hidden="true"
        >
          {note.sentence}
        </span>
      )}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* AS-OF — COMPONENTS.md §8.1                                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * `$85.2M · as of 2024-11-27 · late season` — one line, one visual block.
 *
 * BINDING CONSTRAINTS (`COMPONENTS.md` §8.1, `DECISIONS.md` 74):
 *  - there is no compact variant;
 *  - the date is never behind a tooltip, a hover, an `(i)` or a disclosure —
 *    dead money is the one place the §1.8 disclosure pattern is PROHIBITED;
 *  - if the stamp does not fit, the container is wrong, not the stamp: it never
 *    truncates and never ellipses.
 */
export function AsOf({
  value,
  date,
  stage,
  valueClass = 'yy-num',
}: {
  value: string;
  date: string;
  stage: string;
  valueClass?: string;
}) {
  return (
    <span className={css.asof}>
      <span className={`${valueClass} ${css.asofValue}`}>{value}</span>
      <span className={`yy-label ${css.asofStamp}`}>
        · as of {date} · {stageWords(stage)}
      </span>
    </span>
  );
}

/** The same stamp, driven straight from a `Metric`'s own as-of. */
export function AsOfMetric({
  metric,
  format,
  valueClass,
}: {
  metric: Metric<number>;
  format: (n: number) => string;
  valueClass?: string;
}) {
  if (metric.state === 'blank') return <BlankReason reason={metric.reason} />;
  const asOf: AsOfValue | undefined = metric.state === 'value' ? metric.asOf : undefined;
  if (!asOf) {
    return <span className={valueClass ?? 'yy-num'}>{format(metric.value)}</span>;
  }
  return (
    <AsOf
      value={format(metric.value)}
      date={asOf.date}
      stage={asOf.stage}
      valueClass={valueClass}
    />
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* BOUNDARY MESSAGE — COMPONENTS.md §13.3                                      */
/* ══════════════════════════════════════════════════════════════════════════ */

export function BoundaryMessage({
  season,
  body,
}: {
  season?: number;
  body?: string;
}) {
  const copy =
    body ??
    `Player-level economics begin in 2013. For ${season ?? 'this season'} we have team results, expected points added (EPA), coaching and draft, but no contract, cap or cash data. Nothing here is estimated to fill the gap.`;
  return (
    <div className={css.boundary}>
      <p className={`yy-label ${css.sectionLabel}`}>Coverage</p>
      <p className={`yy-caption ${css.boundaryBody}`}>{copy}</p>
      <Link className={`yy-caption ${css.boundaryLink}`} href="/methodology">
        Read the coverage statement →
      </Link>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* BLANK — the reason string is RENDERED, never swallowed                      */
/* ══════════════════════════════════════════════════════════════════════════ */

export function BlankReason({ reason, inline = false }: { reason: string; inline?: boolean }) {
  return <span className={inline ? css.blankInline : css.blank}>{reason}</span>;
}

/**
 * Render a `Metric<T>`: a value renders through `format`, a partial renders the
 * value plus `⟨n/N⟩`, a blank renders its reason. There is no fourth branch and
 * no empty cell (`SPEC.md` §1.2).
 */
export function MetricText<T>({
  metric,
  format,
  className,
  inlineBlank = false,
}: {
  metric: Metric<T>;
  format: (v: T) => ReactNode;
  className?: string;
  inlineBlank?: boolean;
}) {
  if (metric.state === 'blank') {
    return <BlankReason reason={metric.reason} inline={inlineBlank} />;
  }
  const suffix = partialSuffix(metric);
  return (
    <span className={className}>
      {format(metric.value)}
      {suffix ? <span className={`yy-micro yy-partial-ink`}> {suffix}</span> : null}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* KPI TILE — COMPONENTS.md §13.1                                              */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * `[C4]` / `DECISIONS.md` 74: **a `KpiTile` that receives a dead-money value
 * throws in development.** The tile is exactly the compact variant `SPEC.md`
 * §2.1 forbids; dead money may only render through `<AsOf>`.
 */
export function KpiTile({
  label,
  value,
  unit,
  note,
  isDeadMoney = false,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  note?: string;
  isDeadMoney?: boolean;
}) {
  if (isDeadMoney) {
    const message =
      'KpiTile received a dead-money value. Dead money renders only through <AsOf> — ' +
      'value, date and stage on one line (SPEC.md §2.1, COMPONENTS.md §8.1).';
    if (process.env.NODE_ENV !== 'production') throw new Error(message);
  }
  return (
    <div className={css.kpi}>
      <p className={`yy-label ${css.kpiLabel}`}>{label}</p>
      <div className={css.kpiValueRow}>
        <span className={`yy-num ${css.kpiValue}`}>{value}</span>
        {unit ? <span className={`yy-label ${css.kpiUnit}`}>{unit}</span> : null}
      </div>
      {note ? <p className={`yy-caption ${css.kpiNote}`}>{note}</p> : null}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* INDEX BADGE — COMPONENTS.md §13.2, CAPPLUS_LOCKUP.md §3                     */
/* ══════════════════════════════════════════════════════════════════════════ */

export type BadgeScale = 'hero' | 'era' | 'header' | 'tile' | 'row';

const SCALE_CLASS: Record<BadgeScale, string> = {
  hero: css.scaleHero,
  era: css.scaleEra,
  header: css.scaleHeader,
  tile: css.scaleTile,
  row: css.scaleRow,
};

const BAND_CLASS: Record<Band, string> = {
  above: css.badgeAbove,
  mid: css.badgeMid,
  below: css.badgeBelow,
};

/**
 * The Cap+ / Team Rating figure with its name beneath.
 *
 * `metricName` is load-bearing, not decoration:
 *  - `capplus` → band-colored, label `CAP+`;
 *  - `teamRating` → **never band-colored** (`DECISIONS.md` 83), label
 *    `TEAM RATING` over a `PERFORMANCE ONLY` sub-label, and the badge column
 *    widens to 96px because the label wraps to two lines.
 *
 * The two indexes never share a badge, a color or a label.
 */
export function IndexBadge({
  metric,
  scale,
  metricName,
  showCaption = false,
}: {
  metric: Metric<number>;
  scale: BadgeScale;
  metricName: 'capplus' | 'teamRating';
  showCaption?: boolean;
}) {
  const isCapPlus = metricName === 'capplus';
  const wide = !isCapPlus;

  let figure: ReactNode;
  let toneClass = css.badgeNeutral;

  if (metric.state === 'blank') {
    /**
     * `SPEC.md` §2.2 and `CAPPLUS_MEMO.md` §4 — a blanked season (only the
     * SAFE-only reversal now) renders THE LITERAL SENTENCE: "never a dash, never a blank cell, never a zero".
     * The sentence prints beneath; the value slot carries the short form of the
     * same fact, not an em dash standing in for a number.
     */
    figure = <span className={css.badgeBlankShort}>Not covered</span>;
    toneClass = css.badgeBlank;
  } else {
    figure = metric.value.toFixed(0);
    toneClass = isCapPlus ? BAND_CLASS[indexBand(metric.value)] : css.badgeNeutral;
  }

  return (
    <div className={[css.badge, SCALE_CLASS[scale], wide ? css.badgeWide : ''].join(' ')}>
      <span className={`yy-metric ${css.badgeValue} ${toneClass}`}>{figure}</span>
      <span className={`${scale === 'header' ? 'yy-micro' : 'yy-label'} ${css.badgeName}`}>
        {isCapPlus ? (
          <CapPlusMark />
        ) : (
          <>
            Team Rating
            <br />
            <span className={css.badgeSub}>Performance only</span>
          </>
        )}
      </span>
      {metric.state === 'partial' ? (
        <span className={`yy-micro yy-partial-ink`}>{partialSuffix(metric)}</span>
      ) : null}
      {/* An estimated or provisional Cap+ carries its chip with the figure. */}
      {isCapPlus ? <BadgeChip metric={metric} /> : null}
      {metric.state === 'blank' ? (
        <span className={`yy-label ${css.badgeReason}`} style={{ textTransform: 'none' }}>
          {metric.reason}
        </span>
      ) : null}
      {showCaption ? <CapPlusCaption /> : null}
    </div>
  );
}

/**
 * `CAP+` — always all-caps, never a lime `+`, no space before the `+`.
 * The `+` is optically corrected only in the display face at ≥ display-sm, and
 * this label is set in the athletic face, so it needs none (`CAPPLUS_LOCKUP.md`
 * §2).
 */
export function CapPlusMark() {
  return <>Cap+</>;
}

/**
 * `100 = LEAGUE AVERAGE` — spelled out. There is no short form; if it does not
 * fit, the container is wrong (`CAPPLUS_LOCKUP.md` §3.5).
 */
export function CapPlusCaption({ className }: { className?: string }) {
  return (
    <span className={`yy-label ${css.capplusCaption} ${className ?? ''}`}>
      100 = league average
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* PRODUCT MARK — COMPONENTS.md §1.9                                           */
/* ══════════════════════════════════════════════════════════════════════════ */

export function ProductMark({ className }: { className?: string }) {
  return (
    <span className={`${css.productMark} ${className ?? ''}`} aria-hidden="true">
      YIELD<span className={css.productMarkSlash}>/</span>YARD
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* LEGEND — CHART_ANATOMY.md §5. Every series has a direct label AND a          */
/* shape/pattern distinction; color is never the sole carrier.                 */
/* ══════════════════════════════════════════════════════════════════════════ */

export type LegendTone = 'accent' | 'compare' | 'absence' | 'partial' | 'benchmark';

/**
 * Legend swatches are DRAWN, never set as a character.
 *
 * The system's absence and benchmark vocabulary reaches for `▮`, `⊟` and `▨`,
 * and none of the three shipped faces carries them (they are absent from Bebas
 * Neue, Rajdhani and Inter alike). A glyph that resolves to a fallback face — or
 * to tofu — is not a legend entry, so each mark is drawn in SVG at the same
 * weights the chart itself uses. That also makes the swatch a literal sample of
 * the mark it names rather than an approximation of it.
 */
export type LegendSwatch =
  | 'solid'
  | 'dashed'
  | 'hatch'
  | 'absence'
  | 'benchmark'
  | 'provisional'
  | 'estimated'
  | 'dot'
  | 'ring'
  | 'offscale';

const TONE_VAR: Record<LegendTone, string> = {
  accent: 'var(--yy-accent)',
  compare: 'var(--yy-compare)',
  absence: 'var(--yy-absence)',
  partial: 'var(--yy-partial)',
  benchmark: 'var(--yy-benchmark)',
};

export function LegendSwatchMark({
  swatch,
  tone,
}: {
  swatch: LegendSwatch;
  tone: LegendTone;
}) {
  const c = TONE_VAR[tone];
  return (
    <svg width="16" height="12" viewBox="0 0 16 12" aria-hidden="true" focusable="false">
      {swatch === 'solid' ? (
        <line x1="0" y1="6" x2="16" y2="6" stroke={c} strokeWidth="var(--yy-stroke-primary)" strokeLinecap="round" />
      ) : null}
      {swatch === 'dashed' ? (
        <line
          x1="0"
          y1="6"
          x2="16"
          y2="6"
          stroke={c}
          strokeWidth="var(--yy-stroke-compare)"
          strokeLinecap="round"
          style={{ strokeDasharray: 'var(--yy-dash-compare)' }}
        />
      ) : null}
      {swatch === 'benchmark' ? (
        <>
          <line x1="0" y1="6" x2="16" y2="6" stroke="var(--yy-benchmark-line-under)" strokeWidth="1" />
          <line
            x1="0"
            y1="6"
            x2="16"
            y2="6"
            stroke="var(--yy-benchmark-line)"
            strokeWidth="1"
            style={{ strokeDasharray: 'var(--yy-dash-benchmark)' }}
          />
        </>
      ) : null}
      {swatch === 'hatch' ? (
        <>
          <defs>
            <pattern id="yy-legend-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--yy-partial)" strokeWidth="2" />
            </pattern>
          </defs>
          <rect x="1.5" y="1" width="13" height="10" fill="url(#yy-legend-hatch)" stroke={c} strokeWidth="1" />
        </>
      ) : null}
      {swatch === 'absence' ? (
        <rect
          x="1.5"
          y="1"
          width="13"
          height="10"
          fill="var(--yy-absence-fill)"
          stroke={c}
          strokeWidth="1"
          style={{ strokeDasharray: 'var(--yy-dash-absence)' }}
        />
      ) : null}
      {swatch === 'provisional' ? (
        <rect
          x="4"
          y="2"
          width="8"
          height="8"
          transform="rotate(45 8 6)"
          fill="none"
          stroke="var(--yy-provisional-stroke)"
          strokeWidth="1"
        />
      ) : null}
      {swatch === 'estimated' ? (
        <circle
          cx="8"
          cy="6"
          r="4.5"
          fill="none"
          stroke="var(--yy-fg-2)"
          strokeWidth="1"
          style={{ strokeDasharray: '2 2' }}
        />
      ) : null}
      {swatch === 'offscale' ? (
        <>
          <line
            x1="8"
            y1="4"
            x2="8"
            y2="12"
            stroke="var(--yy-fg-dim)"
            strokeWidth="1"
            style={{ strokeDasharray: 'var(--yy-dash-absence)' }}
          />
          <path d="M3 6 8 0 13 6Z" fill={c} />
        </>
      ) : null}
      {swatch === 'dot' ? <circle cx="8" cy="6" r="5" fill={c} stroke="var(--yy-bg-card-flat)" strokeWidth="1" /> : null}
      {swatch === 'ring' ? (
        <circle
          cx="8"
          cy="6"
          r="5"
          fill="none"
          stroke={c}
          strokeWidth="1"
          style={{ strokeDasharray: 'var(--yy-dash-absence)' }}
        />
      ) : null}
    </svg>
  );
}

export interface LegendItem {
  swatch: LegendSwatch;
  label: string;
  tone: LegendTone;
}

export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <ul className={css.legend}>
      {items.map((i) => (
        <li key={i.label} className={`yy-label ${css.legendItem}`}>
          <span className={css.legendGlyph}>
            <LegendSwatchMark swatch={i.swatch} tone={i.tone} />
          </span>
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** The caption beneath a chart. Always present, never a tooltip. */
export function ChartCaption({ children }: { children: ReactNode }) {
  return <p className={`yy-caption ${css.chartCaption}`}>{children}</p>;
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <p className={`yy-label ${css.sectionLabel}`}>{children}</p>;
}
