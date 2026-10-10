'use client';

/**
 * The width a chart actually has to paint in.
 *
 * Charts here paint at scale 1.0 so in-chart type stays on the 11px floor
 * (`DECISIONS.md` 65). A FIXED intrinsic width (the old 332) therefore
 * overflows any card narrower than the 390 canvas — 15px at 375, 30px at 360 —
 * and every one of those became an accidental sideways scroller. Measuring the
 * container and laying the chart out AT that width keeps scale 1.0 and removes
 * the scroller at every viewport.
 *
 * Server render uses `fallback`; the first ResizeObserver callback replaces it.
 * A hidden container (`display:none`, the other composition) reports 0 and
 * keeps the fallback rather than collapsing.
 */

import { useCallback, useState } from 'react';

export function useMeasuredWidth<T extends HTMLElement>(
  fallback: number,
): [(node: T | null) => void, number] {
  const [width, setWidth] = useState(fallback);
  const ref = useCallback((node: T | null) => {
    if (!node || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const w = Math.floor(entries[0]?.contentRect.width ?? 0);
      if (w > 0) setWidth((prev) => (Math.abs(prev - w) >= 1 ? w : prev));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
