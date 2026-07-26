/**
 * `FranchiseSparkline` — `COMPONENTS.md` §4.5. Originated; the mockup has no
 * small-multiple form.
 *
 * 96 × 24, ONE series only (Cap+ where covered, else Team Rating), no axis, no
 * gridline, a single gold 1px tick at the 100 baseline, and the 2013 break as a
 * 1px `--yy-fg-dim` vertical.
 *
 * Blanked seasons BREAK the path; they are **not** hatched at this size — there
 * is no room for the label, and an unlabelled hatch is worse than a visible gap.
 * Nothing animates.
 */

import css from './chart.module.css';
import {
  INDEX_DOMAIN,
  pathFor,
  runsOf,
  scaleLinear,
  scalePoint,
  type SeriesPoint,
} from './chart-kit';
import type { SparkPoint } from '@/lib/data/league';

const W = 96;
const H = 24;
const TIER2_BREAK = 2013;

export function FranchiseSparkline({
  series,
  label,
}: {
  series: SparkPoint[];
  /** The accessible name. The mark is corroboration; the text names the team. */
  label: string;
}) {
  if (!series.length) return null;

  const seasons = series.map((p) => p.season);
  const x = scalePoint<number>()
    .domain(seasons)
    .range([1, W - 1])
    .padding(0.5);
  const y = scaleLinear()
    .domain(INDEX_DOMAIN)
    .range([H - 2, 2]);
  const px = (s: number) => x(s) ?? 0;

  // One series: Cap+ where the franchise has any, else Team Rating. The two are
  // never spliced into one line — that is exactly what the 2013 break forbids.
  const hasCapPlus = series.some((p) => p.capplus !== null);
  const points: SeriesPoint[] = series.map((p) => ({
    x: p.season,
    y: hasCapPlus
      ? p.season > TIER2_BREAK
        ? p.capplus
        : null
      : p.season === TIER2_BREAK
        ? null
        : p.teamRating,
  }));

  const runs = runsOf(points);

  return (
    <svg
      className={css.spark}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`${label}: ${hasCapPlus ? 'Cap+' : 'Team rating'} by season, 100 is league average`}
    >
      {/* the single gold tick at the 100 baseline */}
      <line
        x1={0}
        x2={W}
        y1={y(100)}
        y2={y(100)}
        stroke="var(--yy-benchmark-tick)"
        strokeWidth={1}
      />
      {/* the 2013 break */}
      {seasons.includes(TIER2_BREAK) ? (
        <line
          x1={px(TIER2_BREAK)}
          x2={px(TIER2_BREAK)}
          y1={0}
          y2={H}
          stroke="var(--yy-fg-dim)"
          strokeWidth={1}
        />
      ) : null}
      {runs.map((run, i) => (
        <path
          key={i}
          d={pathFor(run, px, y)}
          fill="none"
          stroke={hasCapPlus ? 'var(--yy-accent)' : 'var(--yy-compare)'}
          strokeWidth="var(--yy-stroke-compare)"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
