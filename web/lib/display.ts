/**
 * Display helpers for the designed components.
 *
 * Presentation only — nothing here changes a value, and nothing here decides a
 * color: a component asks for a BAND NAME (`above` | `mid` | `below`) and binds
 * it to a semantic token in its own stylesheet. Hex never appears in TypeScript
 * either (`SPEC.md` §4).
 */

import { eraIdentity, type TeamAbbr } from './teams';
import type { Metric } from './metric';

/* ------------------------------------------------------------------ */
/* Records and names                                                    */
/* ------------------------------------------------------------------ */

/** `13–4` (en dash), `9–7–1` when the season had a tie. `TYPE.md`-set figure. */
export function recordDash(wins: number, losses: number, ties: number): string {
  return ties > 0 ? `${wins}–${losses}–${ties}` : `${wins}–${losses}`;
}

/**
 * `New England Patriots` → `Patriots`. The row sub-line at mobile is the
 * nickname, never the full name (`COMPONENTS.md` §1.5).
 */
export function nickname(abbr: TeamAbbr, season: number): string {
  const era = eraIdentity(abbr, season);
  const rest = era.name.startsWith(era.location)
    ? era.name.slice(era.location.length).trim()
    : era.name.split(' ').slice(-1).join(' ');
  return rest || era.name;
}

/* ------------------------------------------------------------------ */
/* Figures                                                              */
/* ------------------------------------------------------------------ */

/** `$18.3M` — the hero card's figure. One decimal at $M, two at $B. */
export function usdShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** `−$7.5M` / `+$12.2M` — the mobile delta. Minus is U+2212, never a hyphen. */
export function usdSignedShort(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** `29% BELOW LEAGUE` / `47% ABOVE LEAGUE` — the wide delta. */
export function pctVsLeague(v: number, benchmark: number): string {
  if (!Number.isFinite(benchmark) || benchmark === 0) return '';
  const rel = (v - benchmark) / benchmark;
  const pct = Math.round(Math.abs(rel) * 100);
  if (pct === 0) return 'AT LEAGUE AVERAGE';
  return `${pct}% ${rel < 0 ? 'BELOW' : 'ABOVE'} LEAGUE`;
}

/** `+3.6` / `−2.3` — allocation bars. Never colored (`COMPONENTS.md` §7.2). */
export function signedPoints(fraction: number, digits = 1): string {
  const v = fraction * 100;
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${Math.abs(v).toFixed(digits)}`;
}

/** `114` — an index, one decimal only when it would otherwise read as integer-exact. */
export function indexFigure(v: number): string {
  return v.toFixed(1);
}

/** `2024-11-27 · late season` — the as-of stamp's tail (`COMPONENTS.md` §8.1). */
export function stageWords(stage: string): string {
  return stage.replace(/_/g, ' ');
}

/* ------------------------------------------------------------------ */
/* Index bands — the product's core color-encoding rule                */
/* ------------------------------------------------------------------ */

export type Band = 'above' | 'mid' | 'below';

/** `idxColor()` from the mockup: ≥105 above · 95–104 mid · <95 below. */
export function indexBand(v: number): Band {
  if (v >= 105) return 'above';
  if (v >= 95) return 'mid';
  return 'below';
}

/* ------------------------------------------------------------------ */
/* Favorability — only ever applied where a benchmark renders            */
/* ------------------------------------------------------------------ */

export type Favorability = 'cheap' | 'mid' | 'dear';

/**
 * `COMPONENTS.md` §1.3, benchmark mode. "At average" is a ±2% band so a club a
 * rounding error from the mean is not painted as a negative — and `DECISIONS.md`
 * 72 makes red conditional on the benchmark actually rendering, which is the
 * caller's job: pass `null` and everything comes back `mid`.
 */
export function favorability(v: number, benchmark: number | null): Favorability {
  if (benchmark === null || !Number.isFinite(benchmark) || benchmark === 0) return 'mid';
  const rel = (v - benchmark) / benchmark;
  if (rel < -0.02) return 'cheap';
  if (rel > 0.02) return 'dear';
  return 'mid';
}

/* ------------------------------------------------------------------ */
/* Coverage — every chart component takes one                            */
/* ------------------------------------------------------------------ */

/**
 * `COMPONENTS.md` universal rule 3 / `CHART_ANATOMY.md` §1 rule 5: every chart
 * takes a `coverage` prop and absence is DRAWN, not omitted. This is the shape
 * of that prop — the surface's own coverage statement, plus the blank reasons
 * currently in play so the legend slot can name them.
 */
export interface Coverage {
  /** What this surface covers, in words. Rendered, never a tooltip. */
  statement: string;
  /** Distinct blank reasons on this surface. Each renders in the legend slot. */
  blanks?: string[];
}

/* ------------------------------------------------------------------ */
/* Metric helpers a component may use without unwrapping by hand         */
/* ------------------------------------------------------------------ */

export function metricValue<T>(m: Metric<T>): T | null {
  return m.state === 'blank' ? null : m.value;
}

/** `⟨18/32⟩` — the partial suffix (`CHART_ANATOMY.md` §5.2). */
export function partialSuffix<T>(m: Metric<T>): string | null {
  return m.state === 'partial' ? `⟨${m.covered}/${m.total}⟩` : null;
}

/* ------------------------------------------------------------------ */
/* Position groups — fixed order, never sorted by value                  */
/* ------------------------------------------------------------------ */

/** `SPEC.md` §2.6 order. A row order that changes between teams destroys
 *  cross-team comparison (`COMPONENTS.md` §7.1). */
export const POSITION_GROUP_ORDER = [
  'QB',
  'RB',
  'WR',
  'TE',
  'OL',
  'DL',
  'LB',
  'DB',
  'ST',
] as const;

export const POSITION_GROUP_NAME: Readonly<Record<string, string>> = {
  QB: 'Quarterback',
  RB: 'Running back',
  WR: 'Wide receiver',
  TE: 'Tight end',
  OL: 'Offensive line',
  DL: 'Defensive line',
  LB: 'Linebacker',
  DB: 'Defensive back',
  ST: 'Special teams',
};

/* ------------------------------------------------------------------ */
/* CSV                                                                  */
/* ------------------------------------------------------------------ */

/** RFC 4180 field escaping. */
export function csvField(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
