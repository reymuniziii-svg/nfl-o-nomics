/**
 * Display formatting. Presentation only — nothing here changes a value.
 *
 * Tabular numerals are a design-token concern (`SPEC.md` §8.3); these helpers
 * only decide how many digits a reader sees.
 */

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function usd(n: number): string {
  return USD.format(n);
}

/** `$21.52M` — the screenshot-friendly form used on cards. */
export function usdCompact(n: number, digits = 2): string {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(digits)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(digits)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function pct(fraction: number, digits = 1): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** Signed, for diverging bars: `+3.8%` / `−3.8%`. */
export function signedPct(fraction: number, digits = 1): string {
  const v = fraction * 100;
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${Math.abs(v).toFixed(digits)}%`;
}

export function num(n: number, digits = 2): string {
  return n.toFixed(digits);
}

export function signed(n: number, digits = 0): string {
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(digits)}`;
}

/** `12-5-0` — ties are always shown, never dropped. */
export function record(wins: number, losses: number, ties: number): string {
  return `${wins}-${losses}-${ties}`;
}
