/**
 * `LeagueField` — the first of the two field-literal surfaces.
 * `SPEC.md` §4, `CHART_ANATOMY.md` §7, `DECISIONS.md` 43.
 *
 * All 32 clubs placed by `yards_to_opponent_goal = 150 − Cap+`, clamped 0…100,
 * with a CONVENTIONAL CAP+ AXIS ALONGSIDE — two encodings of one number, never
 * one instead of the other (§7). It sits above the leaderboard's row list and
 * does not replace it: the list is the tabular reading and stays.
 *
 * WHAT THIS IS NOT. There is no turf texture, no crowd, no stadium, no green
 * fill. "The field is a coordinate system, not an illustration" (§7). The
 * ground is `--yy-bg-card-flat`, the yard lines *are* the gridlines and obey the
 * same 15% ceiling as any other, and the only two tinted bands are the ones the
 * spec names.
 *
 * BUILT IN HTML, NOT IN A SCALED SVG. Every label here is real page type at its
 * real size, so nothing on this surface can drift under the 11px floor when the
 * container changes width — and the marks are `TeamMark`s, which are images and
 * belong in the document, not in a viewBox.
 */

import css from './field.module.css';
import { TeamMark } from '../marks';
import { ChartCaption } from '../primitives';
import {
  HASH_LINES,
  RED_ZONE_CAPPLUS,
  RED_ZONE_LABEL,
  SAFETY_CAPPLUS,
  SAFETY_LABEL,
  YARD_LINES,
  capplusAt,
  downfield,
  yardNumber,
  yardsToGoal,
} from './field-kit';
import { teamMark } from '@/lib/marks';
import type { TeamAbbr } from '@/lib/teams';
import type { Metric } from '@/lib/metric';

export interface FieldTeam {
  team: string;
  teamName: string;
  index: Metric<number>;
  href: string;
}

/** Marks this far apart (as a fraction of field length) can share a lane. */
const LANE_GAP = 0.075;
const LANE_H = 30;
/** Clearance above the first lane and below the last, so no mark sits on a rule. */
const FIELD_PAD = 22;

/**
 * Lane assignment. Thirty-two clubs inside a 100-yard field collide; the answer
 * is vertical stacking in the order they sit on the field, never nudging a mark
 * off its own yard line. A mark's `left` is always exactly its Cap+.
 */
function assignLanes(placed: { fraction: number }[]): number[] {
  const laneLastX: number[] = [];
  return placed.map((p) => {
    let lane = 0;
    while (laneLastX[lane] !== undefined && p.fraction - laneLastX[lane] < LANE_GAP) lane += 1;
    laneLastX[lane] = p.fraction;
    return lane;
  });
}

export function LeagueField({
  teams,
  season,
  focusTeams = [],
}: {
  teams: FieldTeam[];
  season: number;
  focusTeams?: string[];
}) {
  const covered = teams
    .filter((t) => t.index.state !== 'blank')
    .map((t) => ({
      ...t,
      capplus: t.index.state === 'blank' ? 0 : t.index.value,
    }))
    .map((t) => ({ ...t, fraction: downfield(t.capplus), yards: yardsToGoal(t.capplus) }))
    .sort((x, y) => x.fraction - y.fraction);

  /**
   * `CHART_ANATOMY.md` §7: a club with a blank Cap+ is OFF THE FIELD, in a
   * labelled group beneath it. It is never placed at a goal line, which would
   * read as Cap+ 150 or Cap+ 50 — a value it does not have.
   */
  const notCovered = teams.filter((t) => t.index.state === 'blank');
  const notCoveredReason =
    notCovered.length && notCovered[0].index.state === 'blank' ? notCovered[0].index.reason : '';

  const lanes = assignLanes(covered);
  const laneCount = Math.max(1, ...lanes.map((l) => l + 1));
  const focus = new Set(focusTeams);

  const redZoneStart = downfield(RED_ZONE_CAPPLUS) * 100;

  return (
    <div className={css.wrap}>
      <div
        className={css.field}
        style={{ height: `${laneCount * LANE_H + FIELD_PAD}px` }}
        role="img"
        aria-label={`All 32 clubs placed by Cap+ as field position, ${season}. Cap+ 150 is the opponent goal line, Cap+ 50 the club's own.`}
      >
        {/* the two named bands — the only tinted regions on the field */}
        <div className={css.redZone} style={{ left: `${redZoneStart}%` }} aria-hidden="true" />
        <div className={css.safety} aria-hidden="true" />

        {/* hash marks every 5 yards; dropped at mobile, where the field is
          under the 320px of length §7 sets as their floor */}
        {HASH_LINES.map((f) => (
          <div className={css.hash} key={`h${f}`} style={{ left: `${f * 100}%` }} aria-hidden="true" />
        ))}

        {/* yard lines every 10 — these ARE the gridlines */}
        {YARD_LINES.map((f) => (
          <div
            className={f === 0.5 ? `${css.yardLine} ${css.midfield}` : css.yardLine}
            key={`y${f}`}
            style={{ left: `${f * 100}%` }}
            aria-hidden="true"
          />
        ))}

        {covered.map((t, i) => {
          const mark = teamMark(t.team as TeamAbbr, t.teamName);
          return (
            <a
              key={t.team}
              href={t.href}
              className={`${css.mark} ${focus.has(t.team) ? css.markFocus : ''}`}
              style={{ left: `${t.fraction * 100}%`, top: `${lanes[i] * LANE_H}px` }}
            >
              <span className={css.stem} aria-hidden="true" />
              <TeamMark mark={mark} size="xs" dense />
              <span className={`yy-label ${css.markLabel}`}>
                {t.team} {t.capplus.toFixed(0)}
              </span>
            </a>
          );
        })}
      </div>

      {/* yard numbers — 10…50…10 from each goal line, as a field is painted */}
      <div className={css.axis} aria-hidden="true">
        {YARD_LINES.filter((f) => f > 0 && f < 1).map((f) => (
          <span className={`yy-label ${css.yardNumber}`} key={`n${f}`} style={{ left: `${f * 100}%` }}>
            {yardNumber(f)}
          </span>
        ))}
      </div>

      {/* THE CAP+ AXIS IS MANDATORY AND CONVENTIONAL — §7 and §2. The field is
        the second encoding, never the only one. The two end ticks anchor to
        their own edge rather than centring on it: a centred `150` at the goal
        line paints half of itself outside the card and reads as `15`. */}
      <div className={css.axis}>
        {YARD_LINES.filter((_, i) => i % 2 === 0).map((f) => (
          <span
            className={`yy-label ${css.capTick} ${f === 0 ? css.tickStart : ''} ${f === 1 ? css.tickEnd : ''}`}
            key={`c${f}`}
            style={{ left: `${f * 100}%` }}
          >
            {capplusAt(f).toFixed(0)}
          </span>
        ))}
      </div>
      <p className={`yy-label ${css.axisTitle}`}>Cap+ · 100 = league average</p>

      <ul className={css.bandKey}>
        <li className={`yy-label ${css.bandKeyItem}`}>
          <span className={`${css.bandSwatch} ${css.bandSwatchRed}`} aria-hidden="true" />
          {RED_ZONE_LABEL}
        </li>
        <li className={`yy-label ${css.bandKeyItem}`}>
          <span className={`${css.bandSwatch} ${css.bandSwatchSafety}`} aria-hidden="true" />
          {SAFETY_LABEL}
        </li>
      </ul>

      {notCovered.length ? (
        <div className={css.offField}>
          <p className={`yy-label ${css.offFieldHead}`}>
            Not covered — {notCoveredReason || 'no Cap+ was published for this season.'}
          </p>
          <ul className={css.offFieldList}>
            {notCovered.map((t) => (
              <li key={t.team}>
                <a className={`yy-label ${css.offFieldItem}`} href={t.href}>
                  <TeamMark mark={teamMark(t.team as TeamAbbr, t.teamName)} size="xs" dense />
                  {t.teamName}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ChartCaption>
        Field position is Cap+ read a second way: {`yards to the opponent's goal = 150 − Cap+`},
        clamped to the hundred yards between the two goal lines. Fifteen index points is fifteen
        yards. The Cap+ axis beneath carries the same numbers conventionally — the field never
        replaces them.
      </ChartCaption>
      <ChartCaption>
        A club is placed by where its Cap+ falls, not by where it finished:{' '}
        {covered.length ? describeExtremes(covered) : 'no club has a Cap+ this season.'}
      </ChartCaption>
    </div>
  );
}

function describeExtremes(covered: { team: string; capplus: number; yards: number }[]): string {
  const best = covered[covered.length - 1];
  const worst = covered[0];
  const inRedZone = covered.filter((t) => t.capplus >= RED_ZONE_CAPPLUS).length;
  const inSafety = covered.filter((t) => t.capplus < SAFETY_CAPPLUS).length;
  return (
    `${best.team} is furthest downfield at the ${Math.max(1, Math.round(best.yards))}, ` +
    `${worst.team} is deepest in its own half at the ${Math.round(100 - worst.yards)}. ` +
    (inRedZone
      ? `${inRedZone} club${inRedZone === 1 ? ' is' : 's are'} in the red zone.`
      : 'The red zone is empty this season, which is the correct reading and not a missing mark.') +
    (inSafety ? ` ${inSafety} club${inSafety === 1 ? ' is' : 's are'} behind the safety line.` : '')
  );
}
