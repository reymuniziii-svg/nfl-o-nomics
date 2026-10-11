'use client';

/**
 * `FranchiseArc` — the 25-season history, and the team Drive folded into it.
 * `COMPONENTS.md` §4, `SPEC.md` §3.2.2, `CHART_ANATOMY.md` §7.
 *
 * THE THREE RULES THIS CHART EXISTS TO OBEY
 *  1. **The hard break at 2013.** A full-height rule at `x(2013)`; no series
 *     path crosses it. Cap+ begins at 2013.
 *  2. **Both lines on the 2013–2025 overlap**, told apart by color, stroke
 *     width and dash, plus a direct label at each terminus.
 *  3. **A blanked Cap+ season is a labeled gap**, one `<path>` per run, never
 *     `defined()` on one path. Under the shipping tier there is none: 2016,
 *     2020 and 2021 are ESTIMATED values with a dashed ring, and the hatching
 *     returns only under the SAFE-only reversal.
 *
 * WHAT CHANGED (review D #6, #7, #9; bug sweep)
 *  - **You are here.** The page's own season carries a rule, a ring on its
 *    point and a filled tick label, so `/team/kc/2019` and `/team/kc/2025` no
 *    longer draw identical charts.
 *  - **Every season is a link**, laid over the drawing as real `<a>` columns
 *    (`SeasonHitLayer`) with one roving tab stop and arrow-key travel. Hover,
 *    focus or a first tap shows a crosshair readout that repeats and enriches:
 *    season, record, Cap+ with its rank, Team Rating, cash per win against the
 *    league.
 *  - **The Drive is a toggle, not a second card.** "Read as field" swaps the
 *    index plot for the field-literal surface `SPEC.md` §4 requires. The field
 *    keeps its own 50–150 domain, so per `CHART_ANATOMY.md` §6.1 the swap
 *    CROSS-FADES; no mark travels between the two scales.
 *  - **Measured width, scale 1.0.** The chart lays itself out at its
 *    container's width instead of a fixed 332, which removes the 15px sideways
 *    scroller at 375 without letting type fall below the 11px floor.
 *  - **The live season is a separate mark** (DECISIONS 116). 2026 in progress
 *    sits after a dashed `IN PROGRESS` gap as ONE hatched, UNCONNECTED mark —
 *    Team Rating (performance only) · live, labelled `⟨GP/17⟩`. No `<path>`
 *    joins 2025 to it, and it never enters the series, the runs, the Drive or
 *    the CSV: a partial reading is not the next point of a final series.
 *  - **Labels never overprint.** Off-scale values on the same edge stagger to
 *    a second line; on the phone composition the terminus labels sit above and
 *    below the last point instead of in a right margin that clipped "TEAM
 *    RATING".
 */

import { useState } from 'react';
import css from './chart.module.css';
import team from '../team/team.module.css';
import { Legend, type LegendItem } from '../primitives';
import { SeasonHitLayer } from '../team/season-hit-layer';
import { DriveSvg, driveGeometry, driveLegend } from '../field/team-drive';
import {
  INDEX_DOMAIN,
  chartId,
  gapsOf,
  gridValues,
  pathFor,
  runsOf,
  scaleLinear,
  scalePoint,
  thinTicks,
  tickBudget,
  type SeriesPoint,
} from './chart-kit';
import { useMeasuredWidth } from '@/lib/hooks/use-measured-width';
import type { HistoryPoint } from '@/lib/data/team';
import { badgeNote, type Metric } from '@/lib/metric';
import { yardsToGoal } from '../field/field-kit';
import { ordinal } from '../team/format';

const TIER2_BREAK = 2013;

/**
 * The live season's one mark (DECISIONS 116): Team Rating (performance only) ·
 * live through `week`. Serialisable; built from `lib/data/live.ts` by the page.
 */
export interface ArcLiveMark {
  season: number;
  value: number;
  covered: number;
  total: number;
  week: number;
  date: string;
  rank: number;
  record: string;
}

/** What the readout adds to the two plotted values. Serialisable, formatted server-side. */
export interface ArcSeasonDetail {
  season: number;
  /** `6–11`. */
  record: string;
  /** `$53.1M per win (cash) · 60% above league`, the zero-win label, or the blank reason. */
  perWin: Metric<string>;
  /** Cap+ rank of 32 where the season is covered. */
  capplusRank: number | null;
}

interface Geometry {
  w: number;
  h: number;
  ml: number;
  mr: number;
  mt: number;
  mb: number;
  /** Phone composition: terminus labels above/below the point, not in a margin. */
  compact: boolean;
}

/** Below this the phone composition is used. Above it, the wide one. */
const COMPACT_BELOW = 600;

function arcGeometry(width: number): Geometry {
  const compact = width < COMPACT_BELOW;
  return compact
    ? { w: width, h: 256, ml: 30, mr: 30, mt: 26, mb: 40, compact }
    : { w: width, h: 420, ml: 44, mr: 116, mt: 24, mb: 52, compact };
}

function offScale(v: number): 'above' | 'below' | null {
  if (v > INDEX_DOMAIN[1]) return 'above';
  if (v < INDEX_DOMAIN[0]) return 'below';
  return null;
}

type Mode = 'index' | 'field';

export function FranchiseArc({
  points,
  team: teamName,
  abbr,
  currentSeason,
  details,
  live = null,
}: {
  points: HistoryPoint[];
  team: string;
  /** Lower-case route key, for the season links. */
  abbr: string;
  currentSeason: number;
  details: ArcSeasonDetail[];
  /** The season in progress, drawn apart from the series; null without a live tier. */
  live?: ArcLiveMark | null;
}) {
  const [mode, setMode] = useState<Mode>('index');
  /** The cross-fade plays on a user's toggle only — never on first paint (§6.3). */
  const [toggled, setToggled] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [measureRef, width] = useMeasuredWidth<HTMLDivElement>(317);

  const hasField = points.some((p) => p.season > TIER2_BREAK && p.capplus.state !== 'blank');
  const effectiveMode: Mode = hasField ? mode : 'index';

  const provisional = points
    .filter((p) => badgeNote(p.capplus)?.badge === 'provisional')
    .map((p) => p.season);
  const estimated = points
    .filter((p) => badgeNote(p.capplus)?.badge === 'estimated')
    .map((p) => p.season);
  // Hatching only where a Tier 2 season has no Cap+ at all (the SAFE-only reversal).
  const anyGap = points.some((p) => p.season > TIER2_BREAK && p.capplus.state === 'blank');
  const anyOffWindow = points.some(
    (p) =>
      (p.capplus.state !== 'blank' && offScale(p.capplus.value)) ||
      (p.teamRating.state !== 'blank' && offScale(p.teamRating.value)),
  );

  const legend: LegendItem[] =
    effectiveMode === 'index'
      ? [
          { swatch: 'solid', label: 'Cap+', tone: 'accent' },
          { swatch: 'dashed', label: 'Team Rating (performance only)', tone: 'compare' },
          { swatch: 'benchmark', label: '100 = league average', tone: 'benchmark' },
          ...(anyGap ? [{ swatch: 'hatch', label: 'Season not covered', tone: 'absence' } as LegendItem] : []),
          ...(anyOffWindow
            ? [{ swatch: 'offscale', label: 'Off scale — true value printed', tone: 'absence' } as LegendItem]
            : []),
          ...(provisional.length
            ? [{ swatch: 'provisional', label: 'Provisional', tone: 'partial' } as LegendItem]
            : []),
          ...(estimated.length
            ? [{ swatch: 'estimated', label: 'Estimated', tone: 'partial' } as LegendItem]
            : []),
          ...(live
            ? [
                {
                  swatch: 'hatch',
                  label: `${live.season} in progress · Team Rating live, through week ${live.week} ⟨${live.covered}/${live.total}⟩`,
                  tone: 'partial',
                } as LegendItem,
              ]
            : []),
        ]
      : driveLegend({ gap: anyGap, estimated: estimated.length > 0 });

  const detailBy = new Map(details.map((d) => [d.season, d]));
  const pointBy = new Map(points.map((p) => [p.season, p]));

  const renderTip = (season: number) => {
    if (live && season === live.season) {
      return (
        <>
          <p className={`yy-label ${team.tipHead}`}>
            {live.season} · {live.record} · live
          </p>
          <TipRow
            name="Team Rating"
            value={`${live.value.toFixed(1)} ⟨${live.covered}/${live.total}⟩ · ${ordinal(live.rank)} of 32`}
          />
          <TipRow name="As of" value={`week ${live.week} · through ${live.date}`} />
          <TipRow name="Cap+" value="Not until the season is final" />
        </>
      );
    }
    const p = pointBy.get(season);
    const d = detailBy.get(season);
    if (!p) return null;
    return (
      <>
        <p className={`yy-label ${team.tipHead}`}>
          {season}
          {d ? ` · ${d.record}` : ''}
        </p>
        <TipRow
          name="Cap+"
          value={
            season < TIER2_BREAK
              ? 'Not available — before 2013'
              : p.capplus.state === 'blank'
                ? 'Not covered — no league-wide table'
                : `${p.capplus.value.toFixed(1)}${d?.capplusRank ? ` · ${ordinal(d.capplusRank)} of 32` : ''}${
                    badgeNote(p.capplus) ? ` · ${badgeNote(p.capplus)!.label.toLowerCase()}` : ''
                  }`
          }
        />
        {effectiveMode === 'field' && p.capplus.state !== 'blank' ? (
          <TipRow name="Field" value={fieldSpot(p.capplus.value)} />
        ) : null}
        <TipRow
          name="Team Rating"
          value={p.teamRating.state === 'blank' ? p.teamRating.reason : p.teamRating.value.toFixed(1)}
        />
        {d ? (
          <TipRow
            name="Per win"
            value={d.perWin.state === 'blank' ? d.perWin.reason : d.perWin.value}
          />
        ) : null}
      </>
    );
  };

  const hitSeasons = (geo: Geometry, xOf: (s: number) => number, seasons: number[]) =>
    seasons.map((s) => {
      if (live && s === live.season) {
        return {
          season: s,
          x: geo.ml + xOf(s),
          href: `/team/${abbr}/${s}`,
          label: [
            `${s}, ${live.record}, in progress`,
            `Team Rating live ${live.value.toFixed(1)}, ${live.covered} of ${live.total} games, as of week ${live.week}`,
            s === currentSeason ? 'this page' : '',
          ]
            .filter(Boolean)
            .join('. '),
        };
      }
      const p = pointBy.get(s);
      const d = detailBy.get(s);
      const cp =
        !p || s < TIER2_BREAK
          ? 'Cap+ not available before 2013'
          : p.capplus.state === 'blank'
            ? 'Cap+ not covered'
            : `Cap+ ${p.capplus.value.toFixed(1)}${d?.capplusRank ? `, ${ordinal(d.capplusRank)} of 32` : ''}`;
      const tr = p && p.teamRating.state !== 'blank' ? `Team Rating ${p.teamRating.value.toFixed(1)}` : '';
      const pw = d && d.perWin.state !== 'blank' ? d.perWin.value : '';
      return {
        season: s,
        x: geo.ml + xOf(s),
        href: `/team/${abbr}/${s}`,
        label: [`${s}${d ? `, ${d.record}` : ''}`, cp, tr, pw, s === currentSeason ? 'this page' : '']
          .filter(Boolean)
          .join('. '),
      };
    });

  return (
    <div>
      <div className={team.arcBar}>
        <p className={`yy-label ${team.arcHint}`}>
          Hover or tap a season to read it. Click or tap again to open it.
        </p>
        {hasField ? (
          <div className={team.segmented} role="radiogroup" aria-label="Read the history as">
            {(['index', 'field'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={effectiveMode === m}
                className={`yy-label ${team.segment}`}
                onClick={() => {
                  if (m !== effectiveMode) setToggled(true);
                  setMode(m);
                  setActive(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    const next = m === 'index' ? 'field' : 'index';
                    setMode(next);
                    setToggled(true);
                    setActive(null);
                    const sibs = e.currentTarget.parentElement?.querySelectorAll('button');
                    sibs?.[next === 'index' ? 0 : 1]?.focus();
                  }
                }}
                tabIndex={effectiveMode === m ? 0 : -1}
              >
                {m === 'index' ? 'Index' : 'Field'}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div ref={measureRef} className={team.arcFrame}>
        {/* §6.1 — the field runs 50–150 and the index 76–124: a DIFFERENT
            domain, so the swap cross-fades and nothing travels. Keyed so the
            fade replays on each change and never on first paint. */}
        <div key={effectiveMode} className={toggled ? team.fadeIn : undefined}>
          {effectiveMode === 'index' ? (
            <IndexView
              points={points}
              teamName={teamName}
              geo={arcGeometry(width)}
              provisional={provisional}
              estimated={estimated}
              currentSeason={currentSeason}
              active={active}
              setActive={setActive}
              hitSeasons={hitSeasons}
              renderTip={renderTip}
              live={live}
            />
          ) : (
            <FieldView
              points={points}
              teamName={teamName}
              width={width}
              currentSeason={currentSeason}
              active={active}
              setActive={setActive}
              hitSeasons={hitSeasons}
              renderTip={renderTip}
            />
          )}
        </div>
      </div>
      <Legend items={legend} />
    </div>
  );
}

function TipRow({ name, value }: { name: string; value: string }) {
  return (
    <p className={team.tipRow}>
      <span className={`yy-label ${team.tipName}`}>{name}</span>
      <span className={`yy-num ${team.tipValue}`}>{value}</span>
    </p>
  );
}

function fieldSpot(capplus: number): string {
  const ytg = Math.round(yardsToGoal(capplus));
  if (ytg === 50) return 'Midfield';
  return ytg < 50 ? `Opponent ${ytg}` : `Own ${100 - ytg}`;
}


type HitBuilder = (
  geo: Geometry,
  xOf: (s: number) => number,
  seasons: number[],
) => { season: number; x: number; href: string; label: string }[];

/* ══════════════════════════════════════════════════════════════════════════ */
/* INDEX VIEW                                                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

function IndexView({
  points,
  teamName,
  geo,
  provisional,
  estimated,
  currentSeason,
  active,
  setActive,
  hitSeasons,
  renderTip,
  live,
}: {
  points: HistoryPoint[];
  teamName: string;
  geo: Geometry;
  provisional: number[];
  estimated: number[];
  currentSeason: number;
  active: number | null;
  setActive: (s: number | null) => void;
  hitSeasons: HitBuilder;
  renderTip: (s: number) => React.ReactNode;
  live: ArcLiveMark | null;
}) {
  const { w, h, ml, mr, mt, mb, compact } = geo;
  const innerW = Math.max(40, w - ml - mr);
  const innerH = h - mt - mb;
  const id = chartId('arc', teamName, compact ? 'm' : 'd');

  const seasons = points.map((p) => p.season);
  if (!seasons.length) return null;

  // The live season takes the slot after an empty GAP slot (2025.5): the gap
  // is where the dashed IN PROGRESS rule stands, and no series crosses it.
  const gapSlot = live ? live.season - 0.5 : null;
  const xDomain = live && gapSlot !== null ? [...seasons, gapSlot, live.season] : seasons;
  const x = scalePoint<number>().domain(xDomain).range([0, innerW]).padding(0.5);
  const y = scaleLinear().domain(INDEX_DOMAIN).range([innerH, 0]);
  const px = (s: number) => x(s) ?? 0;
  const step = x.step();

  const capplusPoints: SeriesPoint[] = points.map((p) => ({
    x: p.season,
    y: p.season > TIER2_BREAK && p.capplus.state !== 'blank' ? p.capplus.value : null,
  }));
  const ratingPoints: SeriesPoint[] = points.map((p) => ({
    x: p.season,
    // §4.1 — Team Rating terminates at 2012 and resumes at 2014; the 2013
    // reading lives in the CSV export, this chart's tabular equivalent.
    y: p.season === TIER2_BREAK || p.teamRating.state === 'blank' ? null : p.teamRating.value,
  }));

  const capplusRuns = runsOf(capplusPoints);
  const ratingRuns = runsOf(ratingPoints);
  const capplusGaps = gapsOf(capplusPoints).filter((g) => g.from > TIER2_BREAK);

  const lastCapplus = capplusRuns.at(-1)?.at(-1) ?? null;
  const lastRating = ratingRuns.at(-1)?.at(-1) ?? null;

  const clampY = (v: number) => y(Math.max(INDEX_DOMAIN[0], Math.min(INDEX_DOMAIN[1], v)));

  /* Terminus labels. Wide: in the right margin, pushed apart when they would
     touch. Compact: above / below the last point, right-aligned to it, so no
     margin has to hold "TEAM RATING". Never rotated (§8). */
  const cY = lastCapplus ? clampY(lastCapplus.y) : 0;
  const rY = lastRating ? clampY(lastRating.y) : 0;
  const capAbove = !lastRating || cY <= rY;
  let capLabel: { x: number; y: number; anchor: 'start' | 'end' } | null = null;
  let ratingLabel: { x: number; y: number; anchor: 'start' | 'end' } | null = null;
  if (compact) {
    // Phone: there is no room beside the terminus without overprinting the
    // ring, the gap labels or the other series, so the two names sit in the
    // top margin, right-aligned, each carrying its last value — still direct
    // labels, still never rotated.
    if (lastCapplus) capLabel = { x: innerW + mr - 2, y: -9, anchor: 'end' };
    if (lastRating) ratingLabel = { x: innerW + mr - 2 - (lastCapplus ? 78 : 0), y: -9, anchor: 'end' };
  } else {
    const collide = lastCapplus && lastRating && Math.abs(cY - rY) < 15;
    // With a live mark, the names sit right of it: the 2026 mark and the gap
    // rule own the two slots after 2025.
    const after = (s: number) => (live ? px(live.season) + 14 : px(s) + 10);
    if (lastCapplus)
      capLabel = { x: after(lastCapplus.x), y: cY + (collide ? (capAbove ? -6 : 9) : 4), anchor: 'start' };
    if (lastRating)
      ratingLabel = { x: after(lastRating.x), y: rY + (collide ? (capAbove ? 15 : -1) : 4), anchor: 'start' };
  }

  /* Tick labels: the budget, plus the page's own season, which is always
     labeled; any budget tick within 26px of it gives way. */
  const budget = thinTicks(seasons, tickBudget(innerW));
  const ticks = budget.filter(
    (s) =>
      (s === currentSeason || Math.abs(px(s) - px(currentSeason)) >= 26) &&
      // phone: the "Contracts →" marker owns the axis just right of the break
      !(compact && px(s) > px(TIER2_BREAK) - 14 && px(s) < px(TIER2_BREAK) + 56),
  );
  const grid = gridValues(INDEX_DOMAIN, 4).filter((v) => Math.abs(v - 100) > 3);
  const valueTicks = [80, 90, 110, 120];

  /* Off-scale marks. Same-edge neighbors closer than a label's width
     stagger to a second line — the 130.5 / 127.3 overprint at 375. */
  type Off = { season: number; series: 'capplus' | 'rating'; dir: 'above' | 'below'; value: number; row: number };
  const offMarks: Off[] = [];
  for (const [series, pts] of [
    ['capplus', capplusPoints],
    ['rating', ratingPoints],
  ] as const) {
    for (const p of pts) {
      const dir = p.y === null ? null : offScale(p.y);
      if (p.y !== null && dir) offMarks.push({ season: p.x, series, dir, value: p.y, row: 0 });
    }
  }
  for (const dir of ['above', 'below'] as const) {
    const edge = offMarks.filter((m) => m.dir === dir).sort((a, b) => a.season - b.season);
    const lastX = [-Infinity, -Infinity];
    for (const m of edge) {
      const mx = px(m.season);
      const row = mx - lastX[0] >= 34 ? 0 : mx - lastX[1] >= 34 ? 1 : 2;
      m.row = Math.min(row, 1);
      lastX[m.row] = mx;
    }
  }

  const cur = points.find((p) => p.season === currentSeason);
  const curY =
    cur && cur.season > TIER2_BREAK && cur.capplus.state !== 'blank'
      ? clampY(cur.capplus.value)
      : cur && cur.teamRating.state !== 'blank' && cur.season !== TIER2_BREAK
        ? clampY(cur.teamRating.value)
        : null;

  const act = active === null ? null : points.find((p) => p.season === active);

  return (
    <div className={team.plotWrap}>
      <svg
        className={css.svgFixed}
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${teamName} — Cap+ and Team Rating, ${seasons[0]} to ${seasons[seasons.length - 1]}; ${currentSeason} marked`}
        aria-describedby={`${id}-d`}
      >
        <defs>
          <pattern id={`${id}-hatch`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--yy-partial)" strokeWidth="2" />
          </pattern>
          <clipPath id={`${id}-plot`}>
            <rect x={-2} y={-2} width={innerW + 4} height={innerH + 4} />
          </clipPath>
        </defs>

        <g transform={`translate(${ml},${mt})`}>
          {grid.map((v) => (
            <line key={`g${v}`} x1={0} x2={innerW} y1={y(v)} y2={y(v)} stroke="var(--yy-gridline)" strokeWidth={1} />
          ))}

          {/* §4 the benchmark — two elements */}
          <line x1={0} x2={innerW} y1={y(100)} y2={y(100)} stroke="var(--yy-benchmark-line-under)" strokeWidth={1} />
          <line
            x1={0}
            x2={innerW}
            y1={y(100)}
            y2={y(100)}
            stroke="var(--yy-benchmark-line)"
            strokeWidth={1}
            style={{ strokeDasharray: 'var(--yy-dash-benchmark)' }}
          />

          {/* §4.3 blanked Cap+ seasons */}
          {capplusGaps.map((g) => {
            const x0 = px(g.from) - step * 0.5;
            const x1 = px(g.to) - step * 0.5;
            const gw = Math.max(6, x1 - x0);
            const cx = x0 + gw / 2;
            return (
              <g key={`gap${g.from}`}>
                <rect
                  x={x0}
                  y={0}
                  width={gw}
                  height={innerH}
                  fill={`url(#${id}-hatch)`}
                  stroke="var(--yy-absence)"
                  strokeWidth={1}
                  style={{ strokeDasharray: 'var(--yy-dash-absence)' }}
                />
                {gw >= 11 ? (
                  <text
                    className={css.micro}
                    x={cx}
                    y={innerH / 2}
                    textAnchor="middle"
                    transform={`rotate(-90 ${cx} ${innerH / 2})`}
                    dy={3.5}
                  >
                    No league-wide table
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* §4.1 the hard break */}
          <line
            x1={px(TIER2_BREAK)}
            x2={px(TIER2_BREAK)}
            y1={0}
            y2={innerH}
            stroke="var(--yy-fg-dim)"
            strokeWidth={1}
            style={{ strokeDasharray: 'var(--yy-dash-absence)' }}
          />
          {compact ? (
            <text className={css.micro} x={px(TIER2_BREAK) + 3} y={innerH + 17} textAnchor="start">
              Contracts →
            </text>
          ) : (
            <text
              className={css.micro}
              x={px(TIER2_BREAK) + 6}
              y={18}
              textAnchor="start"
              transform={`rotate(90 ${px(TIER2_BREAK) + 6} 18)`}
            >
              Contract data begins 2013
            </text>
          )}

          {/* YOU ARE HERE — a rule beneath the series, so the lines read over it. */}
          {cur ? (
            <line
              x1={px(currentSeason)}
              x2={px(currentSeason)}
              y1={0}
              y2={innerH}
              stroke="var(--yy-fg-mid)"
              strokeWidth={1}
            />
          ) : null}

          <g clipPath={`url(#${id}-plot)`}>
            {ratingRuns.map((run, i) => (
              <path
                key={`tr${i}`}
                d={pathFor(run, px, y)}
                fill="none"
                stroke="var(--yy-compare)"
                strokeWidth="var(--yy-stroke-compare)"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={0.85}
                style={{ strokeDasharray: 'var(--yy-dash-compare)' }}
              />
            ))}
            {capplusRuns.map((run, i) => (
              <path
                key={`cp${i}`}
                d={pathFor(run, px, y)}
                fill="none"
                stroke="var(--yy-accent)"
                strokeWidth="var(--yy-stroke-primary)"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </g>

          {/* off-scale marks, staggered */}
          {offMarks.map((m) => {
            const mx = px(m.season);
            const edgeY = m.dir === 'above' ? 0 : innerH;
            const ly = m.dir === 'above' ? 8 + m.row * 12 : innerH - 2 - m.row * 12;
            const flip = mx + 40 > innerW + mr;
            return (
              <g key={`off-${m.series}-${m.season}`}>
                <line
                  x1={mx}
                  x2={mx}
                  y1={edgeY}
                  y2={m.dir === 'above' ? 10 : innerH - 10}
                  stroke="var(--yy-fg-dim)"
                  strokeWidth={1}
                  style={{ strokeDasharray: 'var(--yy-dash-absence)' }}
                />
                <path
                  d={
                    m.dir === 'above'
                      ? `M${mx - 5},6 L${mx},0 L${mx + 5},6 Z`
                      : `M${mx - 5},${innerH - 6} L${mx},${innerH} L${mx + 5},${innerH - 6} Z`
                  }
                  fill={m.series === 'capplus' ? 'var(--yy-accent)' : 'var(--yy-compare)'}
                />
                <text
                  className={css.micro}
                  x={flip ? mx - 8 : mx + 8}
                  y={ly}
                  textAnchor={flip ? 'end' : 'start'}
                  fill={m.series === 'capplus' ? 'var(--yy-accent)' : 'var(--yy-compare)'}
                >
                  {m.value.toFixed(1)}
                </text>
              </g>
            );
          })}

          {provisional.map((s) => {
            const p = capplusPoints.find((q) => q.x === s);
            if (!p || p.y === null || offScale(p.y)) return null;
            return (
              <circle
                key={`pv${s}`}
                cx={px(s)}
                cy={y(p.y)}
                r={4}
                fill="none"
                stroke="var(--yy-provisional-stroke)"
                strokeWidth={1}
              />
            );
          })}

          {/* ESTIMATED seasons: a dashed ring, so a modeled season never reads
              as a measured one. */}
          {estimated.map((s) => {
            const p = capplusPoints.find((q) => q.x === s);
            if (!p || p.y === null || offScale(p.y)) return null;
            return (
              <circle
                key={`es${s}`}
                cx={px(s)}
                cy={y(p.y)}
                r={4.5}
                fill="none"
                stroke="var(--yy-fg-2)"
                strokeWidth={1}
                style={{ strokeDasharray: '2 2' }}
              />
            );
          })}

          {/* THE LIVE SEASON (DECISIONS 116): a dashed IN PROGRESS rule in its
              own slot, then ONE hatched, unconnected mark. No path joins it. */}
          {live && gapSlot !== null ? (
            <g data-live-mark={live.season}>
              <line
                x1={px(gapSlot)}
                x2={px(gapSlot)}
                y1={0}
                y2={innerH}
                stroke="var(--yy-fg-dim)"
                strokeWidth={1}
                style={{ strokeDasharray: 'var(--yy-dash-absence)' }}
              />
              <text
                className={css.micro}
                x={px(gapSlot) - 4}
                y={innerH - 4}
                textAnchor="start"
                transform={`rotate(-90 ${px(gapSlot) - 4} ${innerH - 4})`}
              >
                In progress
              </text>
              {(() => {
                const lx = px(live.season);
                const ly = clampY(live.value);
                const off = offScale(live.value);
                return (
                  <>
                    <rect x={lx - 5.5} y={ly - 5.5} width={11} height={11} fill="var(--yy-compare)" />
                    <rect
                      x={lx - 5.5}
                      y={ly - 5.5}
                      width={11}
                      height={11}
                      fill={`url(#${id}-hatch)`}
                      stroke="var(--yy-compare)"
                      strokeWidth={1}
                    />
                    <rect x={lx - 5.5} y={ly - 5.5} width={11} height={11} fill={`url(#${id}-hatch)`} />
                    {off ? (
                      <text
                        className={css.micro}
                        x={lx}
                        y={off === 'above' ? ly + 18 : ly - 10}
                        textAnchor="middle"
                        fill="var(--yy-compare)"
                      >
                        {live.value.toFixed(1)}
                      </text>
                    ) : null}
                    {!compact ? (
                      <text
                        className={css.micro}
                        x={lx}
                        y={off === 'above' ? ly + 30 : ly + 18}
                        textAnchor="middle"
                        fill="var(--yy-fg-3)"
                      >
                        {`⟨${live.covered}/${live.total}⟩`}
                      </text>
                    ) : null}
                    {currentSeason === live.season ? (
                      <rect
                        x={lx - 8.5}
                        y={ly - 8.5}
                        width={17}
                        height={17}
                        fill="none"
                        stroke="var(--yy-fg-1)"
                        strokeWidth={2}
                      />
                    ) : null}
                  </>
                );
              })()}
            </g>
          ) : null}

          {/* YOU ARE HERE — the ring on the page's own point. */}
          {cur && curY !== null ? (
            <circle
              cx={px(currentSeason)}
              cy={curY}
              r={6}
              fill="var(--yy-bg-card)"
              fillOpacity={0}
              stroke="var(--yy-fg-1)"
              strokeWidth={2}
            />
          ) : null}

          {/* Crosshair for the inspected season. */}
          {act ? (
            <g aria-hidden="true">
              <line
                x1={px(act.season)}
                x2={px(act.season)}
                y1={0}
                y2={innerH}
                stroke="var(--yy-fg-2)"
                strokeWidth={1}
              />
              {act.season > TIER2_BREAK && act.capplus.state !== 'blank' ? (
                <circle cx={px(act.season)} cy={clampY(act.capplus.value)} r={4} fill="var(--yy-accent)" />
              ) : null}
              {act.season !== TIER2_BREAK && act.teamRating.state !== 'blank' ? (
                <circle
                  cx={px(act.season)}
                  cy={clampY(act.teamRating.value)}
                  r={3.5}
                  fill="var(--yy-bg-card)"
                  stroke="var(--yy-compare)"
                  strokeWidth={2}
                />
              ) : null}
            </g>
          ) : null}

          {capLabel ? (
            <text className={css.seriesLabel} x={capLabel.x} y={capLabel.y} textAnchor={capLabel.anchor} fill="var(--yy-accent)">
              {compact && lastCapplus ? `Cap+ ${lastCapplus.y.toFixed(1)}` : 'Cap+'}
            </text>
          ) : null}
          {ratingLabel ? (
            <text
              className={css.seriesLabel}
              x={ratingLabel.x}
              y={ratingLabel.y}
              textAnchor={ratingLabel.anchor}
              fill="var(--yy-compare)"
            >
              {compact && lastRating ? `Rating ${lastRating.y.toFixed(1)}` : 'Team Rating'}
            </text>
          ) : null}

          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="var(--yy-axis)" strokeWidth={1} />
          {ticks.map((s) =>
            s === currentSeason ? null : (
              <text key={`t${s}`} className={css.tick} x={px(s)} y={innerH + 18} textAnchor="middle">
                &rsquo;{String(s).slice(2)}
              </text>
            ),
          )}
          {live && live.season !== currentSeason ? (
            <text className={css.tick} x={px(live.season)} y={innerH + 18} textAnchor="middle">
              &rsquo;{String(live.season).slice(2)}
            </text>
          ) : null}
          {/* the page's own season — a filled tick label */}
          <g>
            <rect x={px(currentSeason) - 19} y={innerH + 5} width={38} height={18} rx={2} fill="var(--yy-fg-1)" />
            <text
              className={css.tick}
              x={px(currentSeason)}
              y={innerH + 18}
              textAnchor="middle"
              fill="var(--yy-bg-card-flat)"
            >
              {currentSeason}
            </text>
          </g>
          <text className={css.axisTitle} x={innerW / 2} y={innerH + 38} textAnchor="middle">
            Season
          </text>

          {valueTicks.map((v) => (
            <text key={`v${v}`} className={css.tick} x={-8} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          ))}
          <text className={css.tick} x={-8} y={y(100) + 4} textAnchor="end" fill="var(--yy-benchmark)">
            100
          </text>
        </g>
      </svg>
      <SeasonHitLayer
        seasons={hitSeasons(geo, px, live ? [...seasons, live.season] : seasons)}
        top={mt}
        height={innerH + 24}
        current={currentSeason}
        active={active}
        onActive={setActive}
        renderTip={renderTip}
        width={w}
      />
      <p id={`${id}-d`} className="yy-visually-hidden">
        Two indices on one season axis, with a hard break at 2013. Team Rating scores performance
        only and runs 1999 to 2025. Cap+ runs 2013 to 2025.
        {estimated.length ? ` ${estimated.join(', ')} are estimated and carry a dashed ring.` : ''}
        {provisional.length ? ` ${provisional.join(', ')} are provisional.` : ''} Any season with no
        Cap+ shows as a hatched gap and is never interpolated. The {currentSeason} season is marked.
        {live
          ? ` ${live.season} is in progress: after a dashed gap, one separate hatched mark shows Team Rating live, ${live.value.toFixed(1)} through week ${live.week}, ${live.covered} of ${live.total} games. No line connects it to ${live.season - 1}. `
          : ''}
        Each season below the chart is a link with its values.
      </p>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* FIELD VIEW — the Drive, Tier 2 seasons only                                 */
/* ══════════════════════════════════════════════════════════════════════════ */

function FieldView({
  points,
  teamName,
  width,
  currentSeason,
  active,
  setActive,
  hitSeasons,
  renderTip,
}: {
  points: HistoryPoint[];
  teamName: string;
  width: number;
  currentSeason: number;
  active: number | null;
  setActive: (s: number | null) => void;
  hitSeasons: HitBuilder;
  renderTip: (s: number) => React.ReactNode;
}) {
  const tier2 = points.filter((p) => p.season >= TIER2_BREAK);
  const geo = driveGeometry(width);
  const seasons = tier2.map((p) => p.season);
  // Rows: the season axis runs down the field, one row per season.
  const rowCenter = (s: number) => seasons.indexOf(s) * geo.rowH + geo.rowH / 2;
  const hits = hitSeasons(
    { w: geo.w, h: geo.h, ml: 0, mr: geo.mr, mt: geo.mt, mb: geo.mb, compact: geo.w < COMPACT_BELOW },
    rowCenter,
    seasons,
  );
  return (
    <div className={team.plotWrap}>
      <DriveSvg
        points={tier2}
        team={teamName}
        geo={geo}
        currentSeason={currentSeason}
        activeSeason={active}
      />
      <SeasonHitLayer
        seasons={hits}
        top={geo.mt}
        height={seasons.length * geo.rowH}
        current={currentSeason}
        active={active}
        onActive={setActive}
        renderTip={renderTip}
        width={geo.w}
        axis="y"
      />
    </div>
  );
}
