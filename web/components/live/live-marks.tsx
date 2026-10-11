/**
 * Live marks — stateless, so they render on the server and inside client
 * components alike.
 *
 *  - `LiveRatingBar`: Team Rating (performance only) · live, as a bar from the
 *    gold 100 (= the 2026 league average, valid by construction) on ONE domain
 *    pinned at 55–145 for every week, so a club's bar never rescales between
 *    deploys. The bar is a PARTIAL mark (CHART_ANATOMY §5.2): normal fill plus
 *    the `--yy-partial` hatch, labelled `⟨GP/17⟩`. No lime: the live strip is
 *    subjectless.
 *  - `LiveChip`: the LIVE chip, `--yy-live` ink, the mart's badge sentence as
 *    its hover title and accessible text.
 */

import type { CSSProperties } from 'react';
import css from './live.module.css';
import { Chip } from '../primitives';
import { partialSuffix } from '@/lib/display';
import { liveAsOfLine, type Metric } from '@/lib/metric';

/** ±3 SD of the composite (15 points each side per SD) around the 100 line. */
export const LIVE_RATING_DOMAIN: [number, number] = [55, 145];

const pct = (v: number) =>
  ((Math.max(LIVE_RATING_DOMAIN[0], Math.min(LIVE_RATING_DOMAIN[1], v)) - LIVE_RATING_DOMAIN[0]) /
    (LIVE_RATING_DOMAIN[1] - LIVE_RATING_DOMAIN[0])) *
  100;

export function LiveRatingBar({
  rating,
  withValue = true,
  withCover = true,
  digits = 1,
}: {
  rating: Metric<number>;
  withValue?: boolean;
  withCover?: boolean;
  digits?: number;
}) {
  if (rating.state === 'blank') {
    return <span className="yy-blank">{rating.reason}</span>;
  }
  const v = rating.value;
  const at = pct(v);
  const mid = pct(100);
  const left = Math.min(at, mid);
  const width = Math.max(1, Math.abs(at - mid));
  const off = v > LIVE_RATING_DOMAIN[1] ? 'right' : v < LIVE_RATING_DOMAIN[0] ? 'left' : null;
  const suffix = partialSuffix(rating);
  return (
    <span className={css.rating}>
      <span className={css.ratingTrack} aria-hidden="true">
        <span
          className={`${css.ratingFill} ${css.hatch}`}
          style={{ left: `${left}%`, width: `${width}%` } as CSSProperties}
        />
        <span className={css.ratingTick} style={{ left: `${mid}%` }} />
        {off ? (
          <span className={`${css.ratingOff} ${off === 'right' ? css.ratingOffRight : css.ratingOffLeft}`} />
        ) : null}
      </span>
      {withValue ? <span className={`yy-num ${css.ratingValue}`}>{v.toFixed(digits)}</span> : null}
      {withCover && suffix ? <span className={`yy-micro yy-partial-ink ${css.cover}`}>{suffix}</span> : null}
    </span>
  );
}

export function LiveChip({ metric, reason }: { metric?: Metric<unknown>; reason?: string }) {
  const sentence =
    reason ?? (metric && metric.state === 'partial' ? (metric.badgeReason ?? metric.reason) : undefined);
  return (
    <span>
      <Chip kind="live" title={sentence} />
      {sentence ? <span className="yy-visually-hidden">: {sentence}</span> : null}
    </span>
  );
}

/** `2026 · AS OF WEEK 4 · THROUGH 2026-10-05`, with the LIVE chip. */
export function LiveAsOfLine({
  season,
  week,
  date,
  reason,
  className,
}: {
  season: number;
  week: number;
  date: string | null;
  reason?: string;
  className?: string;
}) {
  return (
    <p className={`yy-label ${css.asofLine} ${className ?? ''}`}>
      <LiveChip reason={reason} />
      <span>{liveAsOfLine({ season, week, date }).toUpperCase()}</span>
    </p>
  );
}
