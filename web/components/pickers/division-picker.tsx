'use client';

/**
 * `DivisionPicker` — `COMPONENTS.md` §12.1, `SPEC.md` §3.1.1.
 *
 * Eight divisions, current alignment only, AFC East default. Sticky beneath the
 * app header — at the header's MEASURED height, not a constant: the header is
 * 71px at 375 (its type and padding are tokens that move), and a hard-coded
 * `top: 62px` slid the picker 9px under it. Only the pill row sticks; the
 * alignment note scrolls away beneath it (`MOBILE_PATTERNS.md` §5: exactly
 * three things stick, and a caption is not one of them). **The selected pill scrolls itself into view on mount** — the
 * eight pills are ~640px wide against 390px of viewport, and the edge fade is
 * how the reader learns there are more.
 *
 * Keyboard: `role="tablist"`, arrow keys move selection, Home/End jump.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import css from './pickers.module.css';
import { ALIGNMENT_NOTE } from '@/lib/view';

export interface DivisionOption {
  slug: string;
  name: string;
  href: string;
}

export function DivisionPicker({
  options,
  selected,
}: {
  options: DivisionOption[];
  selected: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Scroll the ROW, not the page: `scrollIntoView` also scrolls every
    // ancestor and was fighting the row's scroll-snap.
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (list && el) list.scrollLeft = el.offsetLeft - (list.clientWidth - el.offsetWidth) / 2;
  }, [selected]);

  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const header = document.querySelector('header');
    const wrap = wrapRef.current;
    if (!header || !wrap) return;
    const sync = () => wrap.style.setProperty('--yy-sticky-top', `${header.getBoundingClientRect().height}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /**
   * Roving tabindex means the seven unselected pills are skipped by Tab and the
   * arrows are the only way into them — so the arrows have to move from WHERE
   * FOCUS ACTUALLY IS, not from the selected slug. Computing the origin from
   * `selected` made ArrowRight land on selected+1 forever: five of the eight
   * divisions could never be focused through this control at all.
   */
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const tabs = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])];
    if (!tabs.length) return;
    const focused = tabs.indexOf(document.activeElement as HTMLElement);
    const i = focused >= 0 ? focused : Math.max(0, options.findIndex((o) => o.slug === selected));
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = tabs.length - 1;
    const el = tabs[next];
    if (el) {
      e.preventDefault();
      el.focus();
    }
  }

  return (
    <>
    <div ref={wrapRef} className={`${css.divisionWrap} ${scrolled ? css.divisionScrolled : ''}`}>
      <div
        className={css.pills}
        role="tablist"
        aria-label="Division"
        ref={listRef}
        onKeyDown={onKeyDown}
      >
        {options.map((o) => {
          const isSelected = o.slug === selected;
          return (
            <Link
              key={o.slug}
              href={o.href}
              role="tab"
              aria-selected={isSelected}
              tabIndex={isSelected ? 0 : -1}
              className={`yy-label ${css.pill} ${isSelected ? css.pillSelected : ''}`}
            >
              {o.name}
            </Link>
          );
        })}
      </div>
    </div>
    {/* Below the picker, ALWAYS (`DECISIONS.md` 45) — and outside the sticky
      region, so it scrolls instead of eating the viewport. */}
    <p className={`yy-caption ${css.alignmentNote}`}>{ALIGNMENT_NOTE}</p>
    </>
  );
}
