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

/**
 * A dead-money ledger `split_by_season` ("55400000/43800000") as dollars, each
 * figure paired with its season: `’26 $55.4M · ’27 $43.8M`.
 *
 * Returns `null` when there is nothing to split — a one-season charge whose
 * "split" is the total restates the figure beside it. A NULL split (Dareus/BUF)
 * is the caller's to render as "per-season split not established"; this helper
 * never infers one. If the season count and the figure count disagree, the
 * figures print unpaired rather than mis-paired.
 */
export function ledgerSplit(split: string | null, seasons: string): string | null {
  if (!split) return null;
  const parts = split
    .split('/')
    .map((p) => Number(p.trim()))
    .filter((n) => Number.isFinite(n));
  if (parts.length <= 1) return null;
  const years = seasons.split(/[-–]/).map((y) => Number(y.trim()));
  const from = years[0];
  const to = years[years.length - 1];
  const span =
    Number.isInteger(from) && Number.isInteger(to) && to >= from
      ? Array.from({ length: to - from + 1 }, (_, i) => from + i)
      : [];
  const money = parts.map((n) => usdCompact(n, 1));
  if (span.length !== parts.length) return money.join(' / ');
  return money.map((m, i) => `’${String(span[i]).slice(2)} ${m}`).join(' · ');
}
