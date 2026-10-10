/**
 * THE FIELD COORDINATE SYSTEM — `SPEC.md` §4, `CHART_ANATOMY.md` §7,
 * `DECISIONS.md` 43.
 *
 * ```
 * yards_to_opponent_goal = 150 − Cap+      (clamped to 0…100)
 * ```
 *
 * 100 = midfield. 15 index points = 15 yards. Cap+ 130 → the 20 → red zone.
 * Cap+ 50 → own goal line → safety.
 *
 * THIS IS NOT THE CONVENTIONAL CHART DOMAIN AND MUST NEVER BE DRAWN ON IT.
 * `INDEX_DOMAIN` (76–124) is the value-axis rule for conventional Cap+ charts;
 * the field has its own coordinate system, fixed by the clamp above, whose Cap+
 * domain is 50–150. `CHART_ANATOMY.md` §7 defines the red-zone and safety bands
 * *inside that domain* — a window that made the red zone unreachable would be a
 * window this surface does not use. The two encodings run alongside one another
 * (§7: the Cap+ axis is "rendered as a conventional axis alongside the field"),
 * never one instead of the other.
 *
 * As a matter of fact the 50–150 domain contains 100% of both marts —
 * `capplus_official` runs 62.9 (CAR 2023) to 138.1 (BAL 2019), and five seasons
 * sit at or above 130 — while the conventional window clips about 9% of them.
 *
 * Exactly two surfaces use this: the league Field (`/`, `/division/{div}`) and
 * the team Drive (`/team/{abbr}/{season}`). Nowhere else.
 */

/** The Cap+ values the field's own geometry places at its two goal lines. */
export const FIELD_CAPPLUS_DOMAIN: [number, number] = [50, 150];

/** `CHART_ANATOMY.md` §7 — the band labels, verbatim. */
export const RED_ZONE_LABEL = 'Red zone — Cap+ 130+';
export const SAFETY_LABEL = 'Safety — Cap+ below 50';

/** Cap+ at the near edge of the red zone, and at the safety line. */
export const RED_ZONE_CAPPLUS = 130;
export const SAFETY_CAPPLUS = 50;

/** `yards_to_opponent_goal = 150 − Cap+`, clamped 0…100. */
export function yardsToGoal(capplus: number): number {
  return Math.max(0, Math.min(100, 150 - capplus));
}

/**
 * Distance downfield as a 0–1 fraction, measured from the club's OWN goal line.
 * 0 = own goal (Cap+ 50 or below), 1 = opponent goal (Cap+ 150 or above).
 */
export function downfield(capplus: number): number {
  return (100 - yardsToGoal(capplus)) / 100;
}

/** Every ten-yard line, as a fraction from the own goal line. */
export const YARD_LINES = Array.from({ length: 11 }, (_, i) => i / 10);

/** Every five-yard hash, excluding the ten-yard lines themselves. */
export const HASH_LINES = Array.from({ length: 21 }, (_, i) => i / 20).filter(
  (f) => Math.round(f * 100) % 10 !== 0,
);

/**
 * The conventional yard NUMBER at a ten-yard line — 10…50…10, counted from
 * whichever goal line is nearer, exactly as a field is painted. `[BRAND]`: yard
 * numbers "may reinforce an axis but must not replace conventional labels",
 * which is why the Cap+ axis runs alongside and is mandatory.
 */
export function yardNumber(fraction: number): number {
  const fromOwn = Math.round(fraction * 100);
  return fromOwn <= 50 ? fromOwn : 100 - fromOwn;
}

/** The Cap+ value at a given fraction downfield — the alongside axis's ticks. */
export function capplusAt(fraction: number): number {
  return 150 - (100 - fraction * 100);
}

/* ------------------------------------------------------------------ */
/* The scrubbed league frame — one season of all 32 clubs, client-shaped */
/* ------------------------------------------------------------------ */

/**
 * The compact, serializable season the scrubbed charts (the league Field and
 * the frontier) receive. Built on the server from `getLeagueFrame`; every
 * number is a mart column. `null` is ALWAYS paired with a reason on the frame.
 */
export interface ScrubClub {
  team: string;
  name: string;
  div: string;
  w: number;
  l: number;
  t: number;
  /** Cash spent, USD. */
  cash: number | null;
  /** Cash ÷ league cap (`cash_pct_of_league`). */
  share: number | null;
  /** The three published indices and their ranks, or null in a blank season. */
  ix: { raw: number; rawRank: number; qbn: number; qbnRank: number; obl: number; oblRank: number } | null;
  rookie: boolean | null;
  qb: string | null;
}

export interface ScrubFrame {
  season: number;
  /** Why `ix` is null for every club this season, else null. */
  ixReason: string | null;
  /** Why `cash` / `share` are null, else null. */
  cashReason: string | null;
  /** League cash per win — the frontier's gold isoline. */
  avgCpw: number | null;
  avgCpwReason: string | null;
  /** League cap, USD. */
  cap: number | null;
  clubs: ScrubClub[];
}

/* ------------------------------------------------------------------ */
/* Placement along the full length, end zones included                  */
/* ------------------------------------------------------------------ */

/** Each end zone's share of the drawn length. The hundred yards fill the rest. */
export const END_ZONE = 0.09;

/**
 * 0 = the back of the club's own end zone, 1 = the back of the opponent's.
 * A Cap+ inside 50–150 lands on its yard line; a club past either goal line
 * sits in that END ZONE's center and is tagged TD or SAFETY — never at the
 * goal line, which would read as exactly 150 or 50.
 */
export function alongField(capplus: number): number {
  if (capplus >= FIELD_CAPPLUS_DOMAIN[1]) return 1 - END_ZONE / 2;
  if (capplus < FIELD_CAPPLUS_DOMAIN[0]) return END_ZONE / 2;
  return END_ZONE + downfield(capplus) * (1 - 2 * END_ZONE);
}

/** A yard-line fraction (0…1 of the hundred yards) on the drawn length. */
export function alongYard(fraction: number): number {
  return END_ZONE + fraction * (1 - 2 * END_ZONE);
}

/** `opp 38` / `own 31` / `midfield` — field position in words. */
export function fieldPositionWords(capplus: number): string {
  if (capplus >= FIELD_CAPPLUS_DOMAIN[1]) return 'in the end zone (touchdown)';
  if (capplus < FIELD_CAPPLUS_DOMAIN[0]) return 'behind its own goal line (safety)';
  const fromOwn = Math.round(downfield(capplus) * 100);
  if (fromOwn === 50) return 'at midfield';
  return fromOwn > 50 ? `at the opponent ${100 - fromOwn}` : `at its own ${fromOwn}`;
}

/* ------------------------------------------------------------------ */
/* Label placement — collision-aware, marks never move                   */
/* ------------------------------------------------------------------ */

/**
 * The across-field label slot for the wide (horizontal) field: each lane has a
 * slot below its marks and one above. A label takes the first slot whose
 * previous occupant is at least `gapYards` behind it, else it is SUPPRESSED —
 * the mark stays on its exact yard line and its name stays one hover, focus or
 * tap away (and in the text equivalent). A mark is never nudged to fit.
 */
export function wideLabelSlots(
  yards: { key: string; at: number }[],
  gapYards: number,
): Map<string, 'below' | 'above' | 'none'> {
  const out = new Map<string, 'below' | 'above' | 'none'>();
  let lastBelow = -Infinity;
  let lastAbove = -Infinity;
  for (const y of [...yards].sort((a, b) => a.at - b.at)) {
    if (y.at - lastBelow >= gapYards) {
      out.set(y.key, 'below');
      lastBelow = y.at;
    } else if (y.at - lastAbove >= gapYards) {
      out.set(y.key, 'above');
      lastAbove = y.at;
    } else out.set(y.key, 'none');
  }
  return out;
}

/**
 * The along-field label offset for the tall (vertical) field: labels sit beside
 * their marks and are pushed apart, in field units, until no two are closer
 * than `gap`; the stack is then re-centered on its marks. Returns each label's
 * offset from its own mark. Marks never move.
 */
export function dodgeLabels(
  items: { key: string; at: number }[],
  gap: number,
): Map<string, number> {
  const sorted = [...items].sort((a, b) => a.at - b.at);
  const pos = sorted.map((s) => s.at);
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < pos.length; i++) {
      if (pos[i] - pos[i - 1] < gap) pos[i] = pos[i - 1] + gap;
    }
    // re-center each touching run on the mean of its marks
    let start = 0;
    for (let i = 1; i <= pos.length; i++) {
      if (i === pos.length || pos[i] - pos[i - 1] > gap + 1e-9) {
        const run = sorted.slice(start, i);
        const shift =
          run.reduce((a, s) => a + s.at, 0) / run.length -
          pos.slice(start, i).reduce((a, p) => a + p, 0) / run.length;
        for (let j = start; j < i; j++) pos[j] += shift;
        start = i;
      }
    }
  }
  return new Map(sorted.map((s, i) => [s.key, pos[i] - s.at]));
}
