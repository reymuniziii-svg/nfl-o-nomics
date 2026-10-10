'use client';

/**
 * A horizontal scroller that OPENS at a given x (bug sweep: the regime band is
 * 900px wide and opened at 2000, with the current regime off-screen on a
 * phone). Server-rendered children; the only client work is one scrollLeft on
 * mount. No smooth scroll — this is a starting position, not motion.
 */

import { useEffect, useRef, type ReactNode } from 'react';

export function ScrollToX({
  x,
  className,
  children,
  label,
}: {
  x: number;
  className?: string;
  children: ReactNode;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    el.scrollLeft = Math.max(0, x - el.clientWidth * 0.35);
  }, [x]);
  return (
    <div ref={ref} className={className} role={label ? 'region' : undefined} aria-label={label} tabIndex={label ? 0 : undefined}>
      {children}
    </div>
  );
}
