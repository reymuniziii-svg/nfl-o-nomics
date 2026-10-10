/**
 * Chart primitives — `CHART_ANATOMY.md` §8.
 *
 * Scales come from `d3-scale`; paths from `d3-shape`. **No charting library
 * that owns its own visual language** (`SPEC.md` §4). Everything below is
 * server-safe: these helpers return strings and numbers and the static charts
 * emit SVG that never hydrates. The one exception is `useChartTooltip` at the
 * foot of the file, which only a `'use client'` chart calls.
 *
 * COLOUR NEVER APPEARS HERE. SVG accepts `fill="var(--yy-accent)"`, so every
 * mark binds a custom property directly and a theme flip needs no re-render
 * (`CHART_ANATOMY.md` §8, "Theming").
 */

import * as React from 'react';
import { scaleBand, scaleLinear, scalePoint } from 'd3-scale';
import { line as d3line, curveLinear } from 'd3-shape';
import { extent } from 'd3-array';

/* ------------------------------------------------------------------ */
/* Domains                                                             */
/* ------------------------------------------------------------------ */

/**
 * Index charts run **76–124** — ±24 around 100 — and `.nice()` is OFF. A Cap+
 * axis that rescales per team makes two teams incomparable.
 */
export const INDEX_DOMAIN: [number, number] = [76, 124];

/** A cost/spend axis ALWAYS includes zero; an index axis never does. */
export function dollarDomain(values: number[], step = 5_000_000): [number, number] {
  const max = values.length ? Math.max(...values) : step;
  return [0, Math.max(step, Math.ceil((max * 1.05) / step) * step)];
}

export function symmetricDomain(values: number[]): [number, number] {
  const m = values.length ? Math.max(...values.map((v) => Math.abs(v))) : 1;
  const pad = m === 0 ? 1 : m * 1.08;
  return [-pad, pad];
}

export { extent, scaleBand, scaleLinear, scalePoint };

/* ------------------------------------------------------------------ */
/* Ticks                                                               */
/* ------------------------------------------------------------------ */

/** §2 — never more labels than `floor(axisLength / 64px)`. */
export function tickBudget(axisLengthPx: number): number {
  return Math.max(2, Math.floor(axisLengthPx / 64));
}

/**
 * Thin an ordinal domain (seasons) down to the budget, always keeping the first
 * and last. On a 25-season axis at 358px this yields five labels — exactly what
 * the mockup does.
 */
export function thinTicks<T>(domain: T[], budget: number): T[] {
  if (domain.length <= budget) return domain;
  const step = Math.ceil((domain.length - 1) / (budget - 1));
  const out: T[] = [];
  for (let i = 0; i < domain.length; i += step) out.push(domain[i]);
  const last = domain[domain.length - 1];
  if (out[out.length - 1] !== last) out[out.length - 1] = last;
  return out;
}

/** §3 — 3–5 gridlines, value axis only, at the mockup's quartile positions. */
export function gridValues([lo, hi]: [number, number], count = 4): number[] {
  const out: number[] = [];
  for (let i = 1; i <= count; i++) out.push(lo + ((hi - lo) * (i - 0.5)) / count);
  return out;
}

/* ------------------------------------------------------------------ */
/* Runs — the rule that makes a blank a blank                          */
/* ------------------------------------------------------------------ */

export interface SeriesPoint {
  x: number;
  y: number | null;
}

/**
 * Split a series into contiguous runs of present values.
 *
 * `CHART_ANATOMY.md` §8: **never `defined()` on a single path.** `defined()`
 * produces one `<path>` with a gap, and browsers still treat it as one shape for
 * `stroke-dasharray`, `pathLength` and hit-testing. Separate elements are
 * separate facts.
 */
export function runsOf(points: SeriesPoint[]): { x: number; y: number }[][] {
  const runs: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  for (const p of points) {
    if (p.y === null || !Number.isFinite(p.y)) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else {
      cur.push({ x: p.x, y: p.y });
    }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/** The contiguous spans where a series has NO value — each one a labelled gap. */
export function gapsOf(points: SeriesPoint[]): { from: number; to: number }[] {
  const gaps: { from: number; to: number }[] = [];
  let start: number | null = null;
  for (const p of points) {
    const missing = p.y === null || !Number.isFinite(p.y);
    if (missing && start === null) start = p.x;
    if (!missing && start !== null) {
      gaps.push({ from: start, to: p.x });
      start = null;
    }
  }
  if (start !== null) gaps.push({ from: start, to: points[points.length - 1].x });
  return gaps;
}

/**
 * `curveLinear`, never `curveMonotoneX` or `curveBasis`. A smoothed curve
 * invents values between measured seasons.
 */
export function pathFor(
  run: { x: number; y: number }[],
  x: (v: number) => number,
  y: (v: number) => number,
): string {
  const gen = d3line<{ x: number; y: number }>()
    .x((d) => x(d.x))
    .y((d) => y(d.y))
    .curve(curveLinear);
  // A single measured season is a point, not a line: emit a zero-length segment
  // so it still paints with a round cap rather than disappearing.
  if (run.length === 1) {
    const px = x(run[0].x);
    const py = y(run[0].y);
    return `M${px},${py}L${px},${py}`;
  }
  return gen(run) ?? '';
}

/* ------------------------------------------------------------------ */
/* Deterministic ids — server components have no `useId`               */
/* ------------------------------------------------------------------ */

export function chartId(...parts: (string | number)[]): string {
  return `yy-${parts.join('-').replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/* ------------------------------------------------------------------ */
/* The inspection layer — `CHART_ANATOMY.md` §8, "Tooltip"              */
/* ------------------------------------------------------------------ */

/**
 * `useChartTooltip` — the one shared tooltip state machine. CLIENT ONLY: call
 * it from a `'use client'` chart. (React is imported as a namespace so this
 * server-safe module stays importable from server components, which never call
 * the hook.)
 *
 * THE CONTRACT (§8): a tooltip may only REPEAT AND ENRICH what the surface
 * already carries. It is never the only place a caveat, a date or a coverage
 * reason lives. It is reachable three ways, and hover is never load-bearing
 * (`MOBILE_PATTERNS.md` §7):
 *   - hover    → `bind(d).onPointerEnter` shows, leave hides (unless pinned);
 *   - keyboard → the mark is focusable; focus shows, blur hides, Escape hides;
 *   - touch    → tap PINS it; a second tap or Escape unpins.
 *
 * Coordinates are whatever the chart positions in — the HTML-positioned charts
 * here use percentages of their plot box — and `tooltipStyle` turns them into
 * a box that stays inside the plot. The chart renders the box itself, with
 * `role="tooltip"` and the `id` from `tipId`, so a mark's `aria-describedby`
 * names it.
 */
export interface TooltipAnchor<T> {
  datum: T;
  /** 0–100, percent of the plot box from the left. */
  x: number;
  /** 0–100, percent of the plot box from the top. */
  y: number;
  pinned: boolean;
}

export function useChartTooltip<T>(key: (d: T) => string) {
  const [tip, setTip] = React.useState<TooltipAnchor<T> | null>(null);
  const base = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const tipId = `yy-tip-${base}`;

  const hide = React.useCallback(() => setTip(null), []);

  /** Spread onto a focusable mark. `x`/`y` are the mark's position, in %. */
  function bind(datum: T, x: number, y: number) {
    const isOpen = tip !== null && key(tip.datum) === key(datum);
    return {
      'aria-describedby': isOpen ? tipId : undefined,
      onPointerEnter: (e: { pointerType: string }) => {
        if (e.pointerType === 'mouse') setTip((t) => (t?.pinned ? t : { datum, x, y, pinned: false }));
      },
      onPointerLeave: (e: { pointerType: string }) => {
        if (e.pointerType === 'mouse') setTip((t) => (t?.pinned ? t : null));
      },
      onFocus: () => setTip({ datum, x, y, pinned: false }),
      onBlur: () => setTip((t) => (t?.pinned ? t : null)),
      onKeyDown: (e: { key: string }) => {
        if (e.key === 'Escape') setTip(null);
      },
    };
  }

  /** Tap to pin, tap again to release. Returns true when the tap was consumed. */
  function pin(datum: T, x: number, y: number) {
    setTip((t) => (t?.pinned && key(t.datum) === key(datum) ? null : { datum, x, y, pinned: true }));
  }

  return { tip, tipId, bind, pin, hide };
}

/**
 * Keep a tooltip box inside its plot: anchor to the mark, flip to the mark's
 * left past 60% across and above it past 55% down. Pure — returns a style.
 */
export function tooltipStyle(x: number, y: number): Record<string, string> {
  const flipX = x > 60;
  const flipY = y > 55;
  return {
    left: `${x}%`,
    top: `${y}%`,
    transform: `translate(${flipX ? 'calc(-100% - 12px)' : '12px'}, ${flipY ? 'calc(-100% - 8px)' : '8px'})`,
  };
}
