/**
 * Team-page display helpers. Plain module — safe from server and client.
 */

/** `1st`, `2nd`, `29th`, `11th`. */
export function ordinal(n: number): string {
  const v = n % 100;
  const s = v >= 11 && v <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${s}`;
}

/** `+4.1` / `−2.4` / `0.0` — index points. Minus is U+2212. */
export function signedIndex(v: number, digits = 1): string {
  const r = Number(v.toFixed(digits));
  const sign = r > 0 ? '+' : r < 0 ? '−' : '';
  return `${sign}${Math.abs(r).toFixed(digits)}`;
}

/** `60% over league` / `21% under league` / `at league average`. */
export function vsLeague(v: number, benchmark: number): string {
  if (!Number.isFinite(benchmark) || benchmark === 0) return '';
  const rel = (v - benchmark) / benchmark;
  const pct = Math.round(Math.abs(rel) * 100);
  if (pct === 0) return 'at league average';
  return `${pct}% ${rel > 0 ? 'over' : 'under'} league`;
}
