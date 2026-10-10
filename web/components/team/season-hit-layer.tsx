'use client';

/**
 * `SeasonHitLayer` — the inspection and navigation layer over a season-axis
 * chart (`CHART_ANATOMY.md` §8 "Tooltip", review D #6/#7).
 *
 * WHY HTML OVER THE SVG, NOT LINKS INSIDE IT. The chart `<svg>` is
 * `role="img"`, which makes its children presentational: a focusable `<a>`
 * inside it is a link a screen reader cannot reach. So the drawing stays an
 * image, and each season gets a real `<a href>` column laid over it here.
 *
 * KEYBOARD. One tab stop for the whole axis (roving tabindex): Tab lands on the
 * current season, ←/→ move season by season, Home/End jump to the ends, Enter
 * follows the link, Escape dismisses the readout. Focus shows the readout, so
 * a keyboard user gets exactly what a hover does.
 *
 * TOUCH. Hover is never load-bearing (`MOBILE_PATTERNS.md` §7). The first tap
 * on a season shows its readout; the readout carries the link, and a second tap
 * on the same column follows it.
 *
 * THE READOUT REPEATS AND ENRICHES. It never holds the only copy of a caveat,
 * a date or a coverage reason (`CHART_ANATOMY.md` §8) — every figure in it is
 * also on the page or in the CSV. It is `aria-hidden`: the column link's own
 * accessible name already speaks the same readout.
 */

import Link from 'next/link';
import { useRef, useState, type ReactNode, type KeyboardEvent } from 'react';
import css from './team.module.css';

export interface HitSeason {
  season: number;
  /**
   * Centre of the season's band along the season axis: px from the layer's
   * left edge for a column chart (`axis="x"`), from its top for a row chart.
   */
  x: number;
  href: string;
  /** The full spoken readout — the link's accessible name. */
  label: string;
}

export function SeasonHitLayer({
  seasons,
  top,
  height,
  current,
  active,
  onActive,
  renderTip,
  width,
  axis = 'x',
}: {
  seasons: HitSeason[];
  top: number;
  height: number;
  /** The page's own season — the one tab stop when nothing is active. */
  current: number;
  active: number | null;
  onActive: (season: number | null) => void;
  renderTip: (season: number) => ReactNode;
  /** The chart's painted width, so the readout can flip at the right edge. */
  width: number;
  /** `x`: seasons are columns (the arc). `y`: seasons are rows (the drive). */
  axis?: 'x' | 'y';
}) {
  const refs = useRef(new Map<number, HTMLAnchorElement>());
  const lastPointer = useRef<string>('mouse');
  const [focusWithin, setFocusWithin] = useState(false);

  if (!seasons.length) return null;
  const step =
    seasons.length > 1 ? Math.abs(seasons[1].x - seasons[0].x) : Math.min(44, width);
  const rovingSeason =
    active !== null && seasons.some((s) => s.season === active)
      ? active
      : seasons.some((s) => s.season === current)
        ? current
        : seasons[seasons.length - 1].season;

  const move = (e: KeyboardEvent<HTMLAnchorElement>, idx: number) => {
    let next = idx;
    const fwd = axis === 'x' ? ['ArrowRight', 'ArrowUp'] : ['ArrowDown', 'ArrowRight'];
    const back = axis === 'x' ? ['ArrowLeft', 'ArrowDown'] : ['ArrowUp', 'ArrowLeft'];
    if (fwd.includes(e.key)) next = Math.min(seasons.length - 1, idx + 1);
    else if (back.includes(e.key)) next = Math.max(0, idx - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = seasons.length - 1;
    else if (e.key === 'Escape') {
      onActive(null);
      return;
    } else return;
    e.preventDefault();
    const s = seasons[next].season;
    onActive(s);
    refs.current.get(s)?.focus();
  };

  const activeHit = active === null ? null : seasons.find((s) => s.season === active);
  const flip = activeHit ? activeHit.x > (axis === 'x' ? width : height) / 2 : false;
  const tipStyle = !activeHit
    ? undefined
    : axis === 'x'
      ? flip
        ? { right: width - activeHit.x + 10 }
        : { left: activeHit.x + 10 }
      : flip
        ? { right: 8, bottom: height - activeHit.x + step / 2 + 4 }
        : { right: 8, top: activeHit.x + step / 2 + 4 };

  return (
    <div
      className={css.hitLayer}
      style={{ top, height }}
      role="group"
      aria-label="Seasons — arrow keys move, Enter opens the season"
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse' && !focusWithin) onActive(null);
      }}
      onFocus={() => setFocusWithin(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setFocusWithin(false);
          onActive(null);
        }
      }}
    >
      {seasons.map((s, i) => (
        <Link
          key={s.season}
          ref={(node) => {
            if (node) refs.current.set(s.season, node);
            else refs.current.delete(s.season);
          }}
          href={s.href}
          prefetch={false}
          scroll={false}
          className={`${css.hitCol} ${s.season === current ? css.hitColCurrent : ''}`}
          style={
            axis === 'x'
              ? { left: s.x - step / 2, width: step, top: 0, bottom: 0 }
              : { top: s.x - step / 2, height: step, left: 0, right: 0 }
          }
          tabIndex={s.season === rovingSeason ? 0 : -1}
          aria-label={s.label}
          aria-current={s.season === current ? 'page' : undefined}
          onPointerDown={(e) => {
            lastPointer.current = e.pointerType;
          }}
          onPointerEnter={(e) => {
            if (e.pointerType === 'mouse') onActive(s.season);
          }}
          onFocus={() => onActive(s.season)}
          onKeyDown={(e) => move(e, i)}
          onClick={(e) => {
            // First tap on a touch screen reads; the second tap navigates.
            if (lastPointer.current !== 'mouse' && active !== s.season) {
              e.preventDefault();
              onActive(s.season);
            }
          }}
        />
      ))}
      {activeHit ? (
        <div
          className={`${css.tip} ${axis === 'x' ? css.tipAtCol : css.tipAtRow}`}
          style={tipStyle}
          aria-hidden="true"
        >
          {renderTip(activeHit.season)}
          {activeHit.season !== current ? (
            <Link
              className={`yy-label ${css.tipLink}`}
              href={activeHit.href}
              prefetch={false}
              scroll={false}
              tabIndex={-1}
            >
              Open {activeHit.season} →
            </Link>
          ) : (
            <span className={`yy-label ${css.tipHere}`}>You are here</span>
          )}
        </div>
      ) : null}
    </div>
  );
}
