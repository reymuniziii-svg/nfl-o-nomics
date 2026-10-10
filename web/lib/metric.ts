/**
 * `Metric<T>` — the never-silently-partial rule made structural (`SPEC.md` §1.2).
 *
 * Verbatim from the spec:
 *
 *   type Metric<T> =
 *     | { state: 'value';   value: T; asOf?: AsOf; provisional?: boolean }
 *     | { state: 'blank';   reason: string }
 *     | { state: 'partial'; value: T; covered: number; total: number; reason: string };
 *
 * Every data-layer accessor returns one of these, never a bare `number | null`.
 * A component that receives `state: 'blank'` renders the reason string; there is
 * no code path that renders an empty cell, a dash, a zero, or an interpolated
 * point for missing data.
 */

export type Season = number; // 1999…2025

export type AsOfStage = 'preseason' | 'midseason' | 'late_season' | 'final';

export interface AsOf {
  date: string; // ISO date — both fields always present
  stage: AsOfStage;
}

export type Metric<T> =
  | { state: 'value'; value: T; asOf?: AsOf; provisional?: boolean }
  | { state: 'blank'; reason: string }
  | { state: 'partial'; value: T; covered: number; total: number; reason: string };

export function value<T>(v: T, asOf?: AsOf, provisional?: boolean): Metric<T> {
  return asOf === undefined && provisional === undefined
    ? { state: 'value', value: v }
    : { state: 'value', value: v, ...(asOf ? { asOf } : {}), ...(provisional ? { provisional } : {}) };
}

export function blank<T>(reason: string): Metric<T> {
  return { state: 'blank', reason };
}

export function partial<T>(v: T, covered: number, total: number, reason: string): Metric<T> {
  return { state: 'partial', value: v, covered, total, reason };
}

/**
 * Project a Metric onto a different value type, PRESERVING THE STATE.
 *
 * This is the only sanctioned way to go from `Metric<Row>` to `Metric<number>`:
 * a `blank` stays blank and keeps its reason, a `partial` keeps its coverage
 * counts, and a `value` keeps its as-of and provisional flags. Rewriting the
 * ternary by hand is how a reason string gets dropped on the floor.
 */
export function mapMetric<A, B>(m: Metric<A>, f: (a: A) => B): Metric<B> {
  switch (m.state) {
    case 'value':
      return {
        state: 'value',
        value: f(m.value),
        ...(m.asOf ? { asOf: m.asOf } : {}),
        ...(m.provisional ? { provisional: m.provisional } : {}),
      };
    case 'partial':
      return {
        state: 'partial',
        value: f(m.value),
        covered: m.covered,
        total: m.total,
        reason: m.reason,
      };
    default:
      return m;
  }
}

/** Narrow a nullable row into a Metric without ever inventing a value. */
export function fromNullable<T>(v: T | null | undefined, reason: string): Metric<T> {
  return v === null || v === undefined ? blank<T>(reason) : value<T>(v);
}

/* ------------------------------------------------------------------ */
/* Approved launch copy — BUILD_PLAN.md "Launch-copy requirements".     */
/* These strings render verbatim. They are data, not UI detail, and     */
/* they are mirrored from etl/config.py so both sides say the same      */
/* sentence.                                                            */
/* ------------------------------------------------------------------ */

export const BLANK_REASON = {
  /** The four whole-season Cap+ blanks: 2013, 2016, 2020, 2021. */
  NO_DM_TABLE:
    'Not available — no league-wide dead-money table was published for this season.',
  /** Every pre-2013 Tier 2 slot. */
  PRE_TIER2: 'Not available — league-wide contract coverage begins in 2013.',
  /** Snap counts: the 2012 asset exists and is empty. */
  PRE_SNAPS: 'Not available — snap counts begin in 2013.',
  /** A mart the ETL has not produced yet (seed manifest says "skipped"). */
  MART_ABSENT: 'Not available — this dataset is not in the current data snapshot.',
} as const;

/** The provisional badge explanation — 2014 and 2019. */
export const PROVISIONAL_BADGE_COPY =
  'This Cap+ is provisional. Its dead-money table came out before the league year opened, so it understates the final figure.';

/** SPEC §2.3 — never "Cap+ (performance only)", anywhere, in any surface. */
export const TEAM_RATING_NAME = 'Team Rating (performance only)';

/**
 * SPEC §2.10 — the gate #1 reopen labels. `capplus_obligation` is a CANDIDATE:
 * it renders under this label only, and only on a surface that also shows Cap+.
 * Never "Cap+" alone until the gate clears.
 */
export const CAPPLUS_OBLIGATION_LABEL = 'Cap+ (obligation)';

/** SPEC §2.10 — Cap+ with the starter's cap number swapped for the season-median starter. */
export const CAPPLUS_QB_NEUTRAL_LABEL = 'QB-neutral Cap+';

/** SPEC §2.10 — travels with every rendering of `future_mortgage_usd` / `_share`. */
export const FUTURE_MORTGAGE_CAVEAT =
  'The future-cap mortgage is bonus money already booked against later caps. It’s an estimate that spreads each bonus evenly, so it misses void years, the dummy contract years that push cap hits later.';

/** SPEC §3.4 — rendered in the UI on the head-to-head view, not buried. */
export const CROSS_ERA_STATEMENT =
  'Both teams are scored against their own season’s league. Every input is first measured as ' +
  'its distance from that year’s average, in units of that year’s spread. That is what lets a ' +
  '2003 team and a 2024 team sit side by side.';

/** SPEC §3.2 item 2 — the bridge sentence under every franchise time series. */
export const BRIDGE_SENTENCE =
  'Both indices use the same performance score. Only the cap adjustment starts in 2013.';

/** SPEC §6 — stated on the page, not just in the methodology. */
export const ERA_CONTINUITY_NOTE =
  'We follow franchises, not cities. Ask for LA in 1999 and you get the St. Louis Rams.';

/** SPEC §6 — stated on the division view. */
export const DIVISION_ALIGNMENT_NOTE =
  'Current alignment only. We don’t model the 2002 realignment, so a 1999 team-season sits in ' +
  'its franchise’s current division.';

/**
 * SPEC §2.1 — the dead-money definition, quoted VERBATIM with its credit, in
 * both places the spec names: the methodology page and the dead-money card's
 * info panel. It is a quotation, not house copy, and it is never paraphrased.
 */
export const DEAD_MONEY_DEFINITION =
  '“A dead money charge is a charge on an NFL team’s salary cap for a player who is no longer ' +
  'on the roster. It represents any remaining signing bonus proration that was not accounted ' +
  'for prior to the player’s release or trade. It is not a cash payment…”';

export const DEAD_MONEY_DEFINITION_CREDIT = 'the standard definition, from Dan Graziano at ESPN';

/** SPEC §7.5 — a leaders-list reading is not a league table. */
export const NOT_A_32_TEAM_READING = 'Not a 32-team reading';

/** SPEC §2.9 — the draft value chart, cited on the card and in the methodology. */
export const DRAFT_CHART_NAME = 'Fitzgerald–Spielberger NFL Draft Trade Value Chart';
export const DRAFT_CHART_URL = 'https://overthecap.com/draft-trade-value-chart';

/** SPEC §2.1 — dead money never renders without its date and stage. */
export function asOfLabel(asOf: AsOf): string {
  const stage = asOf.stage.replace('_', ' ');
  return `as of ${asOf.date} · ${stage}`;
}
