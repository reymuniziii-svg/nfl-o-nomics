/**
 * Runtime flags — `ARCHITECTURE.md` §8, `BUILD_PLAN.md` GATE #3.
 *
 * `etl/config.py` is the single home for the GATE #3 defaults and DECISIONS 63
 * requires each to stay a one-line reversal. TypeScript cannot read Python, so
 * `scripts/prepare.mjs` parses the four literals out of `etl/config.py` at build
 * prep time and writes `lib/generated/flags.json` — the JSON bridge.
 *
 * PRECEDENCE, highest first:
 *   1. environment variable (a Vercel env var, set per environment)
 *   2. lib/generated/flags.json  (the shipping default, from etl/config.py)
 *   3. the literal fallback in this file
 *
 * HOW TO FLIP A FLAG
 *   - permanently, for every surface: edit `etl/config.py`, re-run
 *     `npm run prepare:assets` (or any `npm run build`), redeploy.
 *   - for one environment only: set the env var in Vercel and redeploy.
 * None of these are `NEXT_PUBLIC_`; none reach the client bundle.
 */

import generated from './generated/flags.json';

function envBool(name: string): boolean | null {
  const v = process.env[name];
  if (v === undefined || v === '') return null;
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

function envInt(name: string): number | null {
  const v = process.env[name];
  if (v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type DeadMoneyTier = 'SAFE_ONLY' | 'ALL';

/** SPEC §5.1 — the global TeamMark kill-switch, app-side polarity. */
export const TEAM_LOGOS_ENABLED: boolean =
  envBool('TEAM_LOGOS_ENABLED') ?? generated.TEAM_LOGOS_ENABLED ?? true;

/** SPEC §7.5 — filters `dead_money_team_season` at seed time (RISKS.md risk 1). */
export const DEAD_MONEY_TIER: DeadMoneyTier =
  (process.env.DEAD_MONEY_TIER?.trim().toUpperCase().replace('-', '_') as DeadMoneyTier) ||
  ((generated.DEAD_MONEY_TIER as DeadMoneyTier) ?? 'ALL');

/** SPEC §5.2 OPEN DECISION 1 — the PlayerMark resolution floor, DECIDED at 300. */
export const IMAGE_MIN_WIDTH_PX: number =
  envInt('IMAGE_MIN_WIDTH_PX') ?? generated.IMAGE_MIN_WIDTH_PX ?? 300;

/** SPEC §5.2 OPEN DECISION 2 — DECIDED option (a): CSS-filter-only treatment. */
export const IMAGE_TREATMENT_MODE: string =
  process.env.IMAGE_TREATMENT_MODE || generated.IMAGE_TREATMENT_MODE || 'css_filter_only';

/** The tiers that survive the current `DEAD_MONEY_TIER` setting. */
export const LICENSE_TIERS_ALLOWED: readonly string[] =
  DEAD_MONEY_TIER === 'SAFE_ONLY'
    ? ['SAFE_LEAGUE', 'SAFE_EDITORIAL']
    : ['SAFE_LEAGUE', 'SAFE_EDITORIAL', 'REVIEW_SPOTRAC', 'REVIEW_OTC'];

export const FLAGS = {
  TEAM_LOGOS_ENABLED,
  DEAD_MONEY_TIER,
  IMAGE_MIN_WIDTH_PX,
  IMAGE_TREATMENT_MODE,
} as const;
