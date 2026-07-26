'use client';

/**
 * THE RECEIPT — `CostPerWinCard`. `COMPONENTS.md` §1, direction locked by Rey
 * 2026-07-26 (`DECISIONS.md` 64).
 *
 * One component, one `size` prop, three sizes. Ported from
 * `design/system/preview/hero-receipt-final.html`, which is this card's
 * reference implementation.
 *
 * THE LIME RULE (§1.3, `DECISIONS.md` 71) is selected by the `subject` prop and
 * the card STATES WHICH MODE IT IS IN, in the strap, so a reader who screenshots
 * it can still tell:
 *   subject undefined → lime = favourable vs the benchmark (subjectless surface)
 *   subject set       → lime = the subject, regardless of what it costs
 *
 * RED requires a rendered benchmark (`DECISIONS.md` 72). If `leagueAvg` is not
 * `state:'value'` no gold tick appears on any bar, the strap renders the blank
 * reason, and no row is painted as dear — a benchmark that is not known is not
 * drawn, and "above average" is meaningless without a visible average.
 */

import { useId, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import css from './receipt.module.css';
import type { Metric } from '@/lib/metric';
import {
  favourability,
  metricValue,
  pctVsLeague,
  usdShort,
  usdSignedShort,
  type Coverage,
} from '@/lib/display';

export type ReceiptSize = 'mobile' | 'square' | 'wide';
export type Numerator = 'cash' | 'cap';

export interface CpwRow {
  abbr: string;
  nickname: string;
  fullName: string;
  /** `13–4`, en dash, ties shown when they exist. */
  record: string;
  wins: number;
  season: number;
  /** Route to this team-season. Omitted in export — a screenshot is not tappable. */
  href?: string | null;
  /** The selected numerator, dollars. */
  spend: Metric<number>;
  costPerWin: Metric<number> | { state: 'suppressed'; reason: 'zero-wins'; spendLabel: string };
}

export interface CostPerWinCardProps {
  size: ReceiptSize;
  /** The card names its own subject: metric, scope, season. */
  title: string;
  season: number;
  rows: CpwRow[];
  /** Dollars per win, that season. The gold benchmark. */
  leagueAvg: Metric<number>;
  numerator: Numerator;
  /** Absent ⇒ the toggle is not rendered (square, and every export). */
  onNumeratorChange?: (n: Numerator) => void;
  /** Selects what lime means. See §1.3. */
  subject?: string;
  /** Driven by the data layer, never by a developer. Real data ⇒ no chip. */
  sample?: boolean;
  /** Applies `.yy-export` and force-expands the caveat. */
  export?: boolean;
  coverage: Coverage;
}

/** §1.8(a) — the always-visible short form, at every size, in every crop. */
const LENS_LINE: Record<Numerator, string> = {
  cash: 'Cash · roster only',
  cap: 'Cap hit · season-final · roster only',
};

/** §1.8(b) — the full sentence, one tap away, in-card. */
const LENS_SENTENCE: Record<Numerator, string> = {
  cash: 'Cash to players on the roster. Cash paid to players released in-year is not included.',
  cap: 'Cap hit is an end-of-league-year restatement, not an in-season reading. Cap held by players on the roster — not cap used.',
};

const SIZE_CLASS: Record<ReceiptSize, string> = {
  mobile: css.sizeMobile,
  square: css.sizeSquare,
  wide: css.sizeWide,
};

function isSuppressed(
  c: CpwRow['costPerWin'],
): c is { state: 'suppressed'; reason: 'zero-wins'; spendLabel: string } {
  return c.state === 'suppressed';
}

export function CostPerWinCard(props: CostPerWinCardProps) {
  const {
    size,
    title,
    season,
    rows,
    leagueAvg,
    numerator,
    onNumeratorChange,
    subject,
    sample = false,
    export: isExport = false,
    coverage,
  } = props;

  const [open, setOpen] = useState(false);
  const discloseId = useId();

  // At wide the disclosure does not exist — the sentence is always rendered.
  // In export it is force-expanded: no button, no toggle, no collapsed state.
  const isStatic = isExport || size === 'wide';
  const showToggle = !!onNumeratorChange && size !== 'square' && !isExport;

  /* ---- the shared linear domain. §1.5: never per-row normalised. ---- */
  const ratios = rows
    .map((r) => (isSuppressed(r.costPerWin) ? null : metricValue(r.costPerWin)))
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const STEP = 5_000_000;
  const domainMax = ratios.length
    ? Math.max(STEP, Math.ceil((Math.max(...ratios) * 1.05) / STEP) * STEP)
    : STEP;

  /* ---- the benchmark. Not `value` ⇒ no gold anywhere on the card. ---- */
  const benchmark = leagueAvg.state === 'blank' ? null : leagueAvg.value;
  const tickPct = benchmark === null ? null : (benchmark / domainMax) * 100;

  /* ---- ranking. The ratio-ranked order comes from the data layer; zero-win
     rows are EXCLUDED from it and always sort last (§1.6). ---- */
  const ranked = rows.filter((r) => !isSuppressed(r.costPerWin));
  const suppressed = rows.filter((r) => isSuppressed(r.costPerWin));
  const rankOf = new Map(ranked.map((r, i) => [r.abbr, i + 1]));

  // Subject mode pins the subject first and its TRUE rank still renders.
  const ordered = subject
    ? [...ranked].sort(
        (a, b) => Number(b.abbr === subject) - Number(a.abbr === subject),
      )
    : ranked;

  const allRows = [...ordered, ...suppressed];

  const straps: string[] = [];
  if (leagueAvg.state !== 'blank') {
    straps.push(
      subject
        ? `${subject} vs league avg ${usdShort(leagueAvg.value)} / win`
        : `League avg ${usdShort(leagueAvg.value)} / win`,
    );
    // CAPPLUS_LOCKUP.md §3.5 — at wide the dollar benchmark and the Cap+
    // caption share one strap line, and the Cap+ caption comes second.
    if (size === 'wide') straps.push('100 = league average');
  }

  return (
    <section
      className={[
        css.cpw,
        SIZE_CLASS[size],
        subject ? css.subjectMode : '',
        isStatic ? css.static : '',
        isExport ? 'yy-export' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={`Cost per win, ${title}, ${season}`}
    >
      <div>
        <div className={css.head}>
          <div>
            <p className={css.eyebrow}>
              {size === 'square' || isExport
                ? `Cost per win · ${numerator === 'cash' ? 'cash' : 'cap hit'} · ${season}`
                : `Cost per win · ${season}`}
            </p>
            <h2 className={css.title}>{title}</h2>
          </div>
          <div className={css.headSlot}>
            {/* §1.10 — the chip renders whenever ANY figure on the card comes
                from placeholder data. It never appears on real data. */}
            {sample ? (
              <span className={css.sample} data-sample-chip>
                Sample
              </span>
            ) : null}
            {showToggle ? (
              <NumeratorToggle value={numerator} onChange={onNumeratorChange!} />
            ) : null}
          </div>
        </div>

        <div className={css.rows}>
          {allRows.map((r) => (
            <ReceiptRow
              key={`${r.abbr}-${r.season}`}
              row={r}
              rank={rankOf.get(r.abbr) ?? null}
              size={size}
              domainMax={domainMax}
              tickPct={tickPct}
              benchmark={benchmark}
              subject={subject}
              href={isExport ? null : (r.href ?? null)}
            />
          ))}
        </div>
      </div>

      <div>
        {/* §1.8 — the lens line is always visible, at every size, in every
            crop, never truncated. */}
        <div className={css.lens}>
          <button
            className={css.lensBtn}
            type="button"
            aria-expanded={isStatic ? true : open}
            aria-controls={discloseId}
            tabIndex={isStatic ? -1 : 0}
            onClick={isStatic ? undefined : () => setOpen((v) => !v)}
          >
            <span>{LENS_LINE[numerator]}</span>
            {isStatic ? null : (
              <i className={css.i} aria-hidden="true">
                i
              </i>
            )}
          </button>
          <div className={css.disclose} id={discloseId}>
            <div>
              <p>{LENS_SENTENCE[numerator]}</p>
            </div>
          </div>
        </div>

        <div className={css.strap}>
          <div className={css.bench}>
            {leagueAvg.state === 'blank' ? (
              <span className={css.benchBlank}>{leagueAvg.reason}</span>
            ) : (
              <>
                <i className={css.benchGlyph} aria-hidden="true" /> {straps.join(' · ')}
              </>
            )}
          </div>
          <span className={css.mark} aria-hidden="true">
            YIELD<span className={css.markSlash}>/</span>YARD
          </span>
        </div>
        {leagueAvg.state === 'partial' ? (
          <p className={css.partialNote}>{leagueAvg.reason}</p>
        ) : null}
        <p className="yy-visually-hidden">{coverage.statement}</p>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */

function ReceiptRow({
  row,
  rank,
  size,
  domainMax,
  tickPct,
  benchmark,
  subject,
  href,
}: {
  row: CpwRow;
  rank: number | null;
  size: ReceiptSize;
  domainMax: number;
  tickPct: number | null;
  benchmark: number | null;
  subject?: string;
  href: string | null;
}) {
  const sub =
    size === 'mobile'
      ? `${row.nickname} · ${row.record}`
      : size === 'square'
        ? row.record
        : `${row.fullName} · ${row.record}`;

  /* ---- the zero-win row: a live rendering state, not an edge case ----
     `CHART_ANATOMY.md` §5.2 requires the suppressed mark to occupy "the same
     box, same position, same size as a live mark", and §1.4 fixes every column
     but the bar — so the track is only equal if the other columns are. The
     value here is a SENTENCE, not a ratio, and it does not fit the 78px figure
     column; taking the width out of the track instead made the dashed box 42%
     of a live bar, which reads as a small value rather than as an absence. So
     the row keeps the live grid and the sentence takes the line beneath it. */
  if (isSuppressed(row.costPerWin)) {
    return (
      <div className={`${css.row} ${css.zero}`}>
        <div className={css.rank} aria-hidden="true">
          —
        </div>
        <div className={css.team}>
          <div className={css.abbr}>{row.abbr}</div>
          <div className={css.sub}>
            {row.season} · {row.record}
          </div>
        </div>
        {/* no gold tick — there is no ratio to compare */}
        <div className={css.bar} />
        {/* the figure column's width, held open so the track matches a live one */}
        <div className={css.val} aria-hidden="true" />
        <div className={css.zeroNote}>
          <div className={css.num}>{row.costPerWin.spendLabel}</div>
          <div className={css.delta}>Ratio suppressed · excluded from ranking</div>
        </div>
      </div>
    );
  }

  const v = metricValue(row.costPerWin);

  if (v === null) {
    // A blank cost-per-win renders its reason. It is never a zero, a dash or an
    // empty cell (`SPEC.md` §1.2).
    const reason = row.costPerWin.state === 'blank' ? row.costPerWin.reason : '';
    return (
      <div className={`${css.row} ${css.zero}`}>
        <div className={css.rank} aria-hidden="true">
          —
        </div>
        <div className={css.team}>
          <div className={css.abbr}>{row.abbr}</div>
          <div className={css.sub}>{sub}</div>
        </div>
        <div className={css.bar} />
        <div className={css.val}>
          <div className={css.blankNote}>{reason}</div>
        </div>
      </div>
    );
  }

  const mode = subject
    ? row.abbr === subject
      ? css.isSubject
      : ''
    : benchmark === null
      ? css.isMid
      : { cheap: css.isCheap, mid: css.isMid, dear: css.isDear }[favourability(v, benchmark)];

  const widthPct = Math.max(0, Math.min(100, (v / domainMax) * 100));

  const delta =
    size === 'square'
      ? null
      : benchmark === null
        ? null
        : size === 'wide'
          ? pctVsLeague(v, benchmark)
          : usdSignedShort(v - benchmark);

  const inner = (
    <>
      <div className={`${css.rank} ${rank !== null && rank <= 3 ? css.rankTop : ''}`}>
        {rank ?? '—'}
      </div>
      <div className={css.team}>
        <div className={css.abbr}>{row.abbr}</div>
        <div className={css.sub}>{sub}</div>
      </div>
      <div className={css.bar}>
        <div className={css.fill} style={{ width: `${widthPct}%` }} />
        {tickPct === null ? null : (
          <div className={css.tick} style={{ left: `${Math.min(100, tickPct)}%` }} />
        )}
      </div>
      <div className={css.val}>
        <div className={css.num}>{usdShort(v)}</div>
        {delta ? <div className={css.delta}>{delta}</div> : null}
      </div>
    </>
  );

  return href ? (
    <Link className={`${css.row} ${mode}`} href={href}>
      {inner}
    </Link>
  ) : (
    <div className={`${css.row} ${mode}`}>{inner}</div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §1.7 THE NUMERATOR TOGGLE — role="radiogroup", arrow-key navigable          */
/* ══════════════════════════════════════════════════════════════════════════ */

const NUMERATORS: Numerator[] = ['cash', 'cap'];

export function NumeratorToggle({
  value,
  onChange,
}: {
  value: Numerator;
  onChange: (n: Numerator) => void;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = NUMERATORS.indexOf(value);
    const next = e.key === 'ArrowRight' ? (i + 1) % NUMERATORS.length : (i + NUMERATORS.length - 1) % NUMERATORS.length;
    onChange(NUMERATORS[next]);
  }

  return (
    <div className={css.toggle} role="radiogroup" aria-label="Numerator" onKeyDown={onKeyDown}>
      {NUMERATORS.map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          tabIndex={value === n ? 0 : -1}
          className={css.toggleBtn}
          onClick={() => onChange(n)}
        >
          {n === 'cash' ? 'Cash' : 'Cap'}
        </button>
      ))}
    </div>
  );
}
