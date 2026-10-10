'use client';

/**
 * `LeagueField` — the first of the two field-literal surfaces.
 * `SPEC.md` §4, `CHART_ANATOMY.md` §7, `DECISIONS.md` 43.
 *
 * All 32 clubs placed by `yards_to_opponent_goal = 150 − Cap+`, on a domain
 * PINNED at Cap+ 50–150 for every season, with a CONVENTIONAL CAP+ AXIS
 * ALONGSIDE — two encodings of one number, never one instead of the other.
 *
 * THE LANES ARE THE EIGHT DIVISIONS. A club's lane never changes, so a season
 * scrub or a Review re-placement moves every mark along the field and only
 * along the field — the one direction that carries data. The picked division's
 * lane is lit and its four clubs take the chart's one lime; the field and the
 * division picker are the same control.
 *
 * LABELS ARE ABBREVIATIONS ONLY, placed collision-aware (`field-kit.ts`): a
 * mark is never nudged off its yard line; a label that cannot be placed is
 * suppressed, and the value is one hover, focus or tap away in a tooltip that
 * repeats and enriches (§8) — the full table stays directly beneath.
 *
 * ORIENTATION. Landscape at ≥1024px; below it the field stands up — the
 * opponent's end zone at the top — because a 300px-long field cannot hold 32
 * labels side by side (`2026-10-10-existing-review.md` B.5).
 *
 * MOTION (§6.1/§6.2). Marks travel on a season or Review change, because the
 * domain is pinned; durations are tokens, so reduced motion collapses them to
 * 1ms. Nothing moves on first paint. The gold midfield (the benchmark) never
 * moves at all.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import css from './field.module.css';
import { ChartCaption } from '../primitives';
import {
  END_ZONE,
  HASH_LINES,
  RED_ZONE_CAPPLUS,
  RED_ZONE_LABEL,
  YARD_LINES,
  alongField,
  alongYard,
  capplusAt,
  dodgeLabels,
  fieldPositionWords,
  wideLabelSlots,
  yardNumber,
  type ScrubClub,
  type ScrubFrame,
} from './field-kit';
import { SeasonScrubber, Segmented } from './season-scrubber';
import { tooltipStyle, useChartTooltip } from '../charts/chart-kit';
import {
  REVIEW_MODES,
  REVIEW_NAME,
  REVIEW_SHORT,
  useLeagueLink,
  type ReviewMode,
} from '../leaderboard/league-link';
import { DIVISION_SLUGS } from '@/lib/teams';
import { recordDash } from '@/lib/display';
import { CAPPLUS_OBLIGATION_LABEL, FUTURE_MORTGAGE_CAVEAT } from '@/lib/metric';

/** Wide: the widest abbreviation label plus air, px — turned into yards at the measured width. */
const WIDE_LABEL_PX = 28;
/** Wide, before the plot is measured: the gap at a 1024px viewport. */
const WIDE_GAP_YARDS = 4.6;
/** Tall: labels are ~13px apart; the tall plot draws 100 yards in ~443px. */
const TALL_GAP_YARDS = 3.1;

const LANE_HEAD: Record<string, [string, string]> = Object.fromEntries(
  DIVISION_SLUGS.map((d) => {
    const [conf, div] = d.split('-');
    return [d, [conf.toUpperCase(), div.toUpperCase()]];
  }),
);

function valueOf(c: ScrubClub, mode: ReviewMode): number | null {
  if (!c.ix) return null;
  return mode === 'raw' ? c.ix.raw : mode === 'qbn' ? c.ix.qbn : c.ix.obl;
}

function rankOf(c: ScrubClub, mode: ReviewMode): number | null {
  if (!c.ix) return null;
  return mode === 'raw' ? c.ix.rawRank : mode === 'qbn' ? c.ix.qbnRank : c.ix.oblRank;
}

interface Placed {
  club: ScrubClub;
  v: number;
  p: number;
  p0: number;
  lane: number;
  slot: 'below' | 'above' | 'none';
  dy: number;
}

export function LeagueField({
  frames,
  latestSeason,
  focusDivision,
}: {
  frames: ScrubFrame[];
  latestSeason: number;
  focusDivision: string;
}) {
  const { season, setSeason, review, setReview, hot, setHot } = useLeagueLink(latestSeason);
  const frame = frames.find((f) => f.season === season) ?? frames[frames.length - 1];
  const covered = frame.ixReason === null;
  const mode: ReviewMode = covered ? review : 'raw';

  const [wide, setWide] = useState(false);
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotW, setPlotW] = useState<number | null>(null);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener('change', on);
    const el = plotRef.current;
    const ro = el ? new ResizeObserver(() => setPlotW(el.getBoundingClientRect().width)) : null;
    if (el && ro) ro.observe(el);
    return () => {
      mq.removeEventListener('change', on);
      ro?.disconnect();
    };
  }, []);
  // labels need WIDE_LABEL_PX of field; the hundred yards are 82% of the plot
  const wideGap = plotW ? WIDE_LABEL_PX / ((plotW * (1 - 2 * END_ZONE)) / 100) : WIDE_GAP_YARDS;

  const placed: Placed[] = useMemo(() => {
    const live = frame.clubs
      .map((club) => ({ club, v: valueOf(club, mode), raw: club.ix?.raw ?? null }))
      .filter((x): x is { club: ScrubClub; v: number; raw: number } => x.v !== null && x.raw !== null);
    const slots = new Map<string, 'below' | 'above' | 'none'>();
    const dys = new Map<string, number>();
    DIVISION_SLUGS.forEach((d) => {
      const inLane = live.filter((x) => x.club.div === d).map((x) => ({ key: x.club.team, at: x.v }));
      wideLabelSlots(inLane, wideGap).forEach((v, k) => slots.set(k, v));
      dodgeLabels(inLane, TALL_GAP_YARDS).forEach((v, k) => dys.set(k, v));
    });
    return live.map((x) => ({
      club: x.club,
      v: x.v,
      p: alongField(x.v),
      p0: alongField(x.raw),
      lane: Math.max(0, DIVISION_SLUGS.indexOf(x.club.div as (typeof DIVISION_SLUGS)[number])),
      slot: slots.get(x.club.team) ?? 'none',
      dy: dys.get(x.club.team) ?? 0,
    }));
  }, [frame, mode, wideGap]);

  const { tip, tipId, bind, pin, hide } = useChartTooltip<Placed>((d) => d.club.team);
  // a season or mode change re-places every mark; an open tooltip would point at nothing
  useEffect(() => hide(), [season, mode, hide]);

  const at = (d: Placed) =>
    wide
      ? { x: d.p * 100, y: ((d.lane + 0.5) / 8) * 100 }
      : { x: ((d.lane + 0.3) / 8) * 100, y: (1 - d.p) * 100 };

  const ranked = [...placed].sort((a, b) => b.v - a.v);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const tds = placed.filter((d) => d.v >= 150);
  const safeties = placed.filter((d) => d.v < 50);
  const name = REVIEW_NAME[mode];
  const seasons = frames.map((f) => f.season);
  const blankSeasons = frames.filter((f) => f.ixReason !== null).map((f) => f.season);
  const focusLane = DIVISION_SLUGS.indexOf(focusDivision as (typeof DIVISION_SLUGS)[number]);

  return (
    <div className={css.wrap}>
      <div className={css.controls}>
        <SeasonScrubber
          seasons={seasons}
          value={frame.season}
          onChange={setSeason}
          blankSeasons={blankSeasons}
          label="Field season"
        />
        <div className={css.reviewRow}>
          <span className={`yy-label ${css.reviewLabel}`}>Review</span>
          <Segmented
            options={REVIEW_MODES}
            value={mode}
            onChange={setReview}
            label="Review: which index places the clubs"
            disabled={!covered}
            names={REVIEW_SHORT}
          />
        </div>
        <p className={`yy-caption ${css.reviewNote}`}>
          {!covered
            ? `${frame.season}: ${frame.ixReason}`
            : mode === 'raw'
              ? 'Placed by Cap+, a team’s performance divided by what its roster cost. Pick another review and every club moves; a ring marks where raw Cap+ had it.'
              : mode === 'qbn'
                ? `Placed by ${name}. Each starting QB is priced at the season’s median starter’s cap number. Rings mark raw Cap+.`
                : `Placed by ${name}. Cost counts cap, 1.5× dead money and half the future-cap mortgage. ${FUTURE_MORTGAGE_CAVEAT} Not a published claim yet; rings mark raw Cap+.`}
        </p>
      </div>

      <div className={css.pitch}>
        <div className={css.laneHeads} aria-hidden="true">
          {DIVISION_SLUGS.map((d, i) => (
            <span key={d} className={`yy-label ${css.laneHead} ${i === focusLane ? css.laneHeadOn : ''}`}>
              <span>{LANE_HEAD[d][0]}</span>{' '}
              <span>
                <span className={css.divFull}>{LANE_HEAD[d][1]}</span>
                <span className={css.divShort}>{LANE_HEAD[d][1][0]}</span>
              </span>
            </span>
          ))}
        </div>

        <div ref={plotRef} className={css.plot} onPointerLeave={() => (tip?.pinned ? null : hide())}>
          {/* the ground: everything here is drawn, nothing is interactive */}
          <div
            className={css.ground}
            role="img"
            aria-label={
              covered
                ? `League field, ${frame.season}: all ${placed.length} clubs placed by ${name} as field position, in eight division lanes. Midfield is ${name} 100, the league average; the opponent's goal line is 150. ${best ? `${best.club.team} is furthest downfield at ${best.v.toFixed(1)}; ${worst.club.team} is deepest at ${worst.v.toFixed(1)}.` : ''}`
                : `League field, ${frame.season}: no clubs placed. ${frame.ixReason}`
            }
          >
            <div className={`${css.endZone} ${css.endZoneOwn}`}>
              <span className={css.ezName}>Safety · Cap+ below 50</span>
              {covered && worst ? (
                <span className={css.ezNote}>
                  {safeties.length
                    ? `${safeties.length} club${safeties.length === 1 ? '' : 's'}: ${safeties.map((d) => d.club.team).join(', ')}`
                    : `Deepest: ${worst.club.team} ${worst.v.toFixed(1)}`}
                </span>
              ) : null}
            </div>
            <div className={`${css.endZone} ${css.endZoneOpp}`}>
              <span className={css.ezName}>Touchdown · Cap+ 150+</span>
              {covered && best ? (
                <span className={css.ezNote}>
                  {tds.length
                    ? `${tds.length} club${tds.length === 1 ? '' : 's'}: ${tds.map((d) => d.club.team).join(', ')}`
                    : `Furthest: ${best.club.team} ${best.v.toFixed(1)}`}
                </span>
              ) : null}
            </div>
            <div
              className={css.redZone}
              style={{ '--a': alongField(RED_ZONE_CAPPLUS), '--b': alongYard(1) } as CSSProperties}
            />
            {focusLane >= 0 ? (
              <div className={css.laneBand} style={{ '--lane': focusLane } as CSSProperties} />
            ) : null}
            {DIVISION_SLUGS.slice(1).map((d, i) => (
              <div
                key={d}
                className={`${css.laneRule} ${i === 3 ? css.laneRuleConf : ''}`}
                style={{ '--lane': i + 1 } as CSSProperties}
              />
            ))}
            {HASH_LINES.map((f) => (
              <div className={css.hash} key={`h${f}`} style={{ '--p': alongYard(f) } as CSSProperties} />
            ))}
            {YARD_LINES.map((f) =>
              f === 0.5 ? null : (
                <div className={css.yardLine} key={`y${f}`} style={{ '--p': alongYard(f) } as CSSProperties} />
              ),
            )}
            {/* MIDFIELD = 100 = THE LEAGUE AVERAGE. The benchmark: gold, named
              in the legend beneath, and the one line on the field that never
              moves. */}
            <div className={css.midfield} style={{ '--p': alongYard(0.5) } as CSSProperties} />
          </div>

          {covered && mode !== 'raw'
            ? placed.map((d) => (
                <span
                  key={`g-${d.club.team}`}
                  className={css.reviewTrail}
                  style={
                    {
                      '--a': Math.min(d.p, d.p0),
                      '--b': Math.max(d.p, d.p0),
                      '--lane': d.lane,
                    } as CSSProperties
                  }
                  aria-hidden="true"
                >
                  <i className={css.ghostRing} data-end={d.p0 <= d.p ? 'a' : 'b'} />
                </span>
              ))
            : null}

          {covered
            ? placed.map((d, i) => {
                const lit = d.club.div === focusDivision;
                const pos = at(d);
                const rank = rankOf(d.club, mode);
                return (
                  <a
                    key={d.club.team}
                    href={`/team/${d.club.team.toLowerCase()}/${frame.season}`}
                    className={[
                      css.ball,
                      lit ? css.ballLit : '',
                      hot === d.club.team ? css.ballHot : '',
                    ].join(' ')}
                    data-slot={d.slot}
                    style={
                      {
                        '--p': d.p,
                        '--lane': d.lane,
                        '--dy': d.dy,
                        '--i': Math.min(i, 8),
                      } as CSSProperties
                    }
                    aria-label={`${d.club.name}, ${frame.season}: ${name} ${d.v.toFixed(1)}${rank ? `, ${ordinal(rank)} of 32` : ''}, ${fieldPositionWords(d.v)}`}
                    {...bind(d, pos.x, pos.y)}
                    onPointerEnter={(e) => {
                      bind(d, pos.x, pos.y).onPointerEnter(e);
                      setHot(d.club.team);
                    }}
                    onPointerLeave={(e) => {
                      bind(d, pos.x, pos.y).onPointerLeave(e);
                      setHot(null);
                    }}
                    onFocus={() => {
                      bind(d, pos.x, pos.y).onFocus();
                      setHot(d.club.team);
                    }}
                    onBlur={() => {
                      bind(d, pos.x, pos.y).onBlur();
                      setHot(null);
                    }}
                    onClick={(e) => {
                      // touch: the first tap reads, the tooltip's link navigates
                      if ((e.nativeEvent as PointerEvent).pointerType === 'touch') {
                        e.preventDefault();
                        pin(d, pos.x, pos.y);
                      }
                    }}
                  >
                    <span className={css.dot} />
                    <span className={css.ballLabel}>{d.club.team}</span>
                  </a>
                );
              })
            : null}

          {!covered ? (
            <div className={css.blankPlot}>
              <p className="yy-label">Not covered · {frame.season}</p>
              <p className="yy-caption">{frame.ixReason}</p>
            </div>
          ) : null}

          {tip ? (
            <div
              id={tipId}
              role="tooltip"
              className={`${css.tip} ${tip.pinned ? css.tipPinned : ''}`}
              style={tooltipStyle(tip.x, tip.y)}
            >
              <FieldTip d={tip.datum} season={frame.season} mode={mode} />
            </div>
          ) : null}
        </div>

        {/* yard numbers, as a field is painted — they reinforce the axis */}
        <div className={css.yardAxis} aria-hidden="true">
          {YARD_LINES.filter((f) => f > 0 && f < 1).map((f) => (
            <span className={`yy-label ${css.tickAt}`} key={`n${f}`} style={{ '--p': alongYard(f) } as CSSProperties}>
              {yardNumber(f)}
            </span>
          ))}
        </div>
        {/* THE CAP+ AXIS — mandatory and conventional (§7, §2) */}
        <div className={css.capAxis} aria-hidden="true">
          {YARD_LINES.filter((_, i) => i % 2 === 0).map((f) => (
            <span
              className={`yy-label ${css.tickAt} ${css.capTick}`}
              key={`c${f}`}
              style={{ '--p': alongYard(f) } as CSSProperties}
            >
              {capplusAt(f).toFixed(0)}
            </span>
          ))}
        </div>
      </div>
      <p className={`yy-label ${css.axisTitle}`}>{name} · axis 50–150, pinned for every season</p>
      <ul className={css.fieldKey}>
        <li className={`yy-label ${css.fieldKeyItem}`}>
          <i className={css.keyMid} aria-hidden="true" /> Midfield = 100 = league average
        </li>
        <li className={`yy-label ${css.fieldKeyItem}`}>
          <i className={css.keyLit} aria-hidden="true" /> {LANE_HEAD[focusDivision]?.join(' ') ?? ''} clubs
        </li>
        {covered && mode !== 'raw' ? (
          <li className={`yy-label ${css.fieldKeyItem}`}>
            <i className={css.keyRing} aria-hidden="true" /> Raw Cap+ spot
          </li>
        ) : null}
        <li className={`yy-label ${css.fieldKeyItem}`}>
          <i className={css.keyRed} aria-hidden="true" /> {RED_ZONE_LABEL}
        </li>
      </ul>

      <ol className="yy-visually-hidden">
        {ranked.map((d) => (
          <li key={d.club.team}>
            {d.club.name}: {name} {d.v.toFixed(1)}, {fieldPositionWords(d.v)}
            {mode !== 'raw' && d.club.ix ? ` (Cap+ ${d.club.ix.raw.toFixed(1)})` : ''}
          </li>
        ))}
      </ol>

      <ChartCaption>
        Yards to the opponent&apos;s goal = 150 − the index, on a field pinned at 50–150 every
        season, so clubs slide yard by yard as you scrub.{' '}
        {covered && best && worst
          ? `${best.club.team} is furthest downfield in ${frame.season} (${best.v.toFixed(1)}); ${worst.club.team} is deepest (${worst.v.toFixed(1)}).`
          : ''}
      </ChartCaption>
    </div>
  );
}

function FieldTip({ d, season, mode }: { d: Placed; season: number; mode: ReviewMode }) {
  const c = d.club;
  const rank = rankOf(c, mode);
  return (
    <>
      <p className={css.tipHead}>
        {c.name} · {season}
      </p>
      <dl className={css.tipList}>
        <dt>{REVIEW_NAME[mode]}</dt>
        <dd>
          {d.v.toFixed(1)}
          {rank ? ` · ${ordinal(rank)} of 32` : ''}
        </dd>
        {mode !== 'raw' && c.ix ? (
          <>
            <dt>Cap+ (raw)</dt>
            <dd>
              {c.ix.raw.toFixed(1)} · {ordinal(c.ix.rawRank)}
            </dd>
          </>
        ) : null}
        <dt>Field</dt>
        <dd>{fieldPositionWords(d.v)}</dd>
        <dt>Record</dt>
        <dd>{recordDash(c.w, c.l, c.t)}</dd>
        {c.qb ? (
          <>
            <dt>Starting QB</dt>
            <dd>
              {c.qb}
              {c.rookie ? ' · rookie deal' : ''}
            </dd>
          </>
        ) : null}
      </dl>
      {mode === 'obl' ? <p className={css.tipNote}>{CAPPLUS_OBLIGATION_LABEL} is a candidate index.</p> : null}
      <a className={css.tipLink} href={`/team/${c.team.toLowerCase()}/${season}`}>
        Open {c.team} {season} →
      </a>
    </>
  );
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
