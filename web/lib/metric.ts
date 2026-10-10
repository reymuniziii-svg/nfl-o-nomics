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
 * Extension (2026-10-10, SPEC §2.2): a `value` may carry the Cap+ `badge` and its
 * `badgeReason`. An ESTIMATED season is a value with `badge: 'estimated'`, never a
 * blank; `provisional` stays as the boolean shorthand for `badge === 'provisional'`.
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

/** `SPEC.md` §7.4 — the Cap+ badge vocabulary. */
export type CapPlusBadge = 'provisional' | 'preseason' | 'in_season' | 'estimated';

export type Metric<T> =
  | {
      state: 'value';
      value: T;
      asOf?: AsOf;
      provisional?: boolean;
      /** The season's Cap+ badge, where the value comes from a badged season. */
      badge?: CapPlusBadge;
      /** The badge's one-line sentence (`badge_reason`); set for provisional / estimated. */
      badgeReason?: string;
    }
  | { state: 'blank'; reason: string }
  | { state: 'partial'; value: T; covered: number; total: number; reason: string };

export function value<T>(v: T, asOf?: AsOf, provisional?: boolean): Metric<T> {
  return asOf === undefined && provisional === undefined
    ? { state: 'value', value: v }
    : { state: 'value', value: v, ...(asOf ? { asOf } : {}), ...(provisional ? { provisional } : {}) };
}

/**
 * A value from a badged Cap+ season. `provisional` is derived from the badge so
 * the two can never disagree; `badgeReason` rides along only where the mart
 * carries one (provisional and estimated seasons).
 */
export function badged<T>(
  v: T,
  asOf: AsOf | undefined,
  badge: CapPlusBadge,
  badgeReason: string | null | undefined,
): Metric<T> {
  return {
    state: 'value',
    value: v,
    ...(asOf ? { asOf } : {}),
    ...(badge === 'provisional' ? { provisional: true } : {}),
    badge,
    ...(badgeReason ? { badgeReason } : {}),
  };
}

/** The two badges that render a chip: provisional and estimated. */
export type ChipBadge = 'provisional' | 'estimated';

export interface BadgeNote {
  badge: ChipBadge;
  /** "Provisional" / "Estimated". */
  label: string;
  /** The full sentence for hover and the print/screenshot variant. */
  sentence: string;
  /** The mart's own `badge_reason`, as carried on the metric. */
  reasonRaw: string | null;
}

const BADGE_LABEL: Record<ChipBadge, string> = { provisional: 'Provisional', estimated: 'Estimated' };

/**
 * The chip a metric carries, if any, with its sentence. The mart's reason is a
 * fragment for provisional seasons ("published before the league year opened;
 * understates the final figure.") and a full sentence for estimated ones
 * ("Estimated — 8 of 32 teams are …"), so the label is prefixed only where the
 * reason does not already open with it.
 */
export function badgeNote(m: Metric<unknown> | null | undefined): BadgeNote | null {
  if (!m || m.state !== 'value') return null;
  const b: ChipBadge | null =
    m.badge === 'estimated' ? 'estimated' : m.badge === 'provisional' || m.provisional ? 'provisional' : null;
  if (!b) return null;
  return {
    badge: b,
    label: BADGE_LABEL[b],
    sentence: badgeSentence(b, m.badgeReason),
    reasonRaw: m.badgeReason ?? null,
  };
}

/**
 * The reason WITHOUT its label, sentence-cased — for surfaces that print the
 * label separately (a stamp, a receipt tag): "8 of 32 teams are published …".
 */
export function badgeDetail(b: ChipBadge, reason: string | null | undefined): string {
  const full = badgeSentence(b, reason);
  const prefix = `${BADGE_LABEL[b]} — `;
  const rest = full.startsWith(prefix) ? full.slice(prefix.length) : full;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

export function badgeSentence(b: ChipBadge, reason: string | null | undefined): string {
  const r = (reason ?? '').trim();
  if (!r) return b === 'provisional' ? PROVISIONAL_BADGE_COPY : `${BADGE_LABEL[b]}.`;
  return r.startsWith(BADGE_LABEL[b]) ? r : `${BADGE_LABEL[b]} — ${r}`;
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
        ...(m.badge ? { badge: m.badge } : {}),
        ...(m.badgeReason ? { badgeReason: m.badgeReason } : {}),
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
  /**
   * A Tier 2 season with no Cap+ rows. Under the shipping tier there is none;
   * the SAFE-only reversal leaves only 2014–2015 and every other season reads this.
   */
  NO_DM_TABLE:
    'Not available — no league-wide dead-money table was published for this season.',
  /** Every pre-2013 Tier 2 slot. */
  PRE_TIER2: 'Not available — league-wide contract coverage begins in 2013.',
  /** Snap counts: the 2012 asset exists and is empty. */
  PRE_SNAPS: 'Not available — snap counts begin in 2013.',
  /** A mart the ETL has not produced yet (seed manifest says "skipped"). */
  MART_ABSENT: 'Not available — this dataset is not in the current data snapshot.',
} as const;

/**
 * The provisional fallback sentence, used only where a row carries no
 * `badge_reason` (2013 has its own: one week INTO the league year).
 */
export const PROVISIONAL_BADGE_COPY =
  'This Cap+ is provisional. Its dead-money table came out before the league year opened, so it understates the final figure.';

/**
 * SPEC §2.2 / §7.5 — a modeled dead-money figure never renders bare.
 * "estimated as of 2016-10-05, 80% range $7.2M–$16.4M"
 */
export function modeledRangeLabel(asOfDate: string, lo: string, hi: string): string {
  return `estimated as of ${asOfDate}, 80% range ${lo}–${hi}`;
}

/** SPEC §2.3 — never "Cap+ (performance only)", anywhere, in any surface. */
export const TEAM_RATING_NAME = 'Team Rating (performance only)';

/** SPEC §2.10 — Cap+ with the starter's cap number swapped for the season-median starter. */
export const CAPPLUS_QB_NEUTRAL_LABEL = 'QB-neutral Cap+';

/**
 * SPEC §2.10 / DECISIONS 111 — the mortgage's job, in one sentence: it is the
 * bridge between the two honest lenses, cash per win and cap per win.
 */
export const MORTGAGE_BRIDGE_SENTENCE =
  'The mortgage is cash paid ahead of cap, bonus money already handed out that later caps will still be charged for, and it’s the bridge between cash per win and cap per win.';

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
