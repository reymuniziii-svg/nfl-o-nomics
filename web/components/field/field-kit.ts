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
