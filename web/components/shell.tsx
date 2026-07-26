/**
 * Structural shells — Phase 2 scaffold only.
 *
 * These are DELIBERATELY UNSTYLED beyond the token-bound base rules in
 * `globals.css`. They exist to prove the data layer end-to-end: every route
 * renders live data as headings and definition lists. The designed components —
 * the hero cost-per-win card, the chart primitives, the Value Stadium, the
 * TeamMark/PlayerMark containment — are the next agent's work.
 *
 * The ONE rule these shells already enforce, because it is structural rather
 * than cosmetic: a `Metric<T>` in the `blank` state renders its reason string.
 * There is no code path here that emits an empty cell, a dash, a zero or an
 * interpolated point for missing data (`SPEC.md` §1.2).
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { asOfLabel, type Metric } from '@/lib/metric';
import type { PlayerMark, TeamMark } from '@/lib/marks';

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="yy-caveat">{children}</p>;
}

export function Definitions({ children }: { children: ReactNode }) {
  return <dl>{children}</dl>;
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

/**
 * Render a `Metric<T>`. The blank branch renders the reason; the partial branch
 * renders the value AND its coverage; the value branch renders the as-of line
 * and the provisional badge whenever they are present.
 */
export function MetricValue<T>({
  metric,
  format,
}: {
  metric: Metric<T>;
  format: (v: T) => ReactNode;
}) {
  if (metric.state === 'blank') {
    return <span className="yy-blank">{metric.reason}</span>;
  }
  if (metric.state === 'partial') {
    return (
      <>
        <span className="yy-partial">{format(metric.value)}</span>{' '}
        <span className="yy-caveat">
          ({metric.covered} of {metric.total} — {metric.reason})
        </span>
      </>
    );
  }
  return (
    <>
      <span>{format(metric.value)}</span>
      {metric.provisional ? (
        <>
          {' '}
          <span className="yy-badge yy-badge-provisional">provisional</span>
        </>
      ) : null}
      {metric.asOf ? (
        <>
          {' '}
          <span className="yy-asof-line">{asOfLabel(metric.asOf)}</span>
        </>
      ) : null}
    </>
  );
}

/** TeamMark: the self-hosted logo, or the typographic fallback chip (SPEC §5.1). */
export function TeamMarkView({ mark }: { mark: TeamMark | null }) {
  if (!mark) return null;
  if (mark.kind === 'chip') {
    return (
      <span
        className="yy-mark"
        style={{ background: mark.background, color: mark.glyph }}
        role="img"
        aria-label={mark.alt}
      >
        {mark.label}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="yy-mark" src={mark.src} alt={mark.alt} width={40} height={40} />
  );
}

/**
 * PlayerMark. The attribution line renders VISIBLY beside the photo — 91.4% of
 * assets legally require it, and hiding it behind a hover is a licence violation.
 */
export function PlayerMarkView({ mark }: { mark: PlayerMark }) {
  if (mark.kind === 'card') {
    return (
      <span className="yy-mark" style={{ background: 'var(--yy-bg-empty)' }} role="img" aria-label={mark.alt}>
        {mark.initials}
      </span>
    );
  }
  return (
    <span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="yy-mark" src={mark.src} alt={mark.alt} width={40} height={40} />{' '}
      <span className="yy-asof-line">{mark.attribution}</span>
    </span>
  );
}

export function TeamSeasonLink({ team, season }: { team: string; season: number }) {
  return <Link href={`/team/${team.toLowerCase()}/${season}`}>{`${team} ${season}`}</Link>;
}
