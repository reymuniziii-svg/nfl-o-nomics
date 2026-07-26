'use client';

/**
 * `DivisionPicker` — `COMPONENTS.md` §12.1, `SPEC.md` §3.1.1.
 *
 * Eight divisions, current alignment only, AFC East default. Sticky beneath the
 * app header. **The selected pill scrolls itself into view on mount** — the
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
    const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [selected]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const i = options.findIndex((o) => o.slug === selected);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % options.length;
    if (e.key === 'ArrowLeft') next = (i - 1 + options.length) % options.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = options.length - 1;
    const el = listRef.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next];
    if (el) {
      e.preventDefault();
      el.focus();
    }
  }

  return (
    <div className={`${css.divisionWrap} ${scrolled ? css.divisionScrolled : ''}`}>
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
      {/* Below the picker, ALWAYS (`DECISIONS.md` 45). */}
      <p className={`yy-caption ${css.alignmentNote}`}>{ALIGNMENT_NOTE}</p>
    </div>
  );
}
