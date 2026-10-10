'use client';

/**
 * `Frontier` — the efficiency frontier. Spec'd in the handoff mockup and
 * `CHART_ANATOMY.md` §6.2, never built until now (`2026-10-10-existing-review.md`
 * D #2): every club's wins against what it paid, one dot per club.
 *
 * x = CASH SPENT AS A SHARE OF THAT SEASON'S CAP (`team_season_cap.
 *     cash_pct_of_league`, verbatim). Dollars inflate ~$12M a year; a share
 *     axis is the only x the scrubber can PIN across 2013–2025, and a pinned
 *     domain is the condition for marks to travel (§6.1). Dollars ride in the
 *     tooltip and the text equivalent. The axis does not start at zero: this is
 *     a position encoding, not a bar's length, and no club has spent under
 *     half a cap.
 * y = WINS, 0–17, pinned.
 *
 * THE GOLD LINE is the league's cash per win that season (`Σ cash ÷ Σ wins`):
 * a club ON it bought its wins at the league price; above it, cheaper. It is
 * the chart's one gold element and it never animates — on a scrub it is simply
 * redrawn at the new season's price. The faint ±25% lines are neutral
 * references, not benchmarks.
 *
 * ONE LIME SERIES: the division's four clubs, labelled. The other 28 are
 * neutral, unlabelled, and one hover, focus or tap from a tooltip that repeats
 * and enriches.
 */

import { useMemo, type CSSProperties } from 'react';
import css from './frontier.module.css';
import { tooltipStyle, useChartTooltip } from './chart-kit';
import { SeasonScrubber } from '../field/season-scrubber';
import { dodgeLabels, type ScrubClub, type ScrubFrame } from '../field/field-kit';
import { useLeagueLink } from '../leaderboard/league-link';
import { pctVsLeague, recordDash, usdShort } from '@/lib/display';

const Y_MAX = 17;
const Y_TICKS = [0, 4, 8, 12, 16];

interface Dot {
  club: ScrubClub;
  share: number;
  cash: number;
  x: number;
  y: number;
  perWin: number | null;
  rank: number | null;
  dy: number;
  lit: boolean;
}

export function Frontier({
  frames,
  latestSeason,
  focusDivision,
  divisionName,
}: {
  frames: ScrubFrame[];
  latestSeason: number;
  focusDivision: string;
  divisionName: string;
}) {
  const { season, setSeason, hot, setHot } = useLeagueLink(latestSeason);
  const frame = frames.find((f) => f.season === season) ?? frames[frames.length - 1];

  /* THE PINNED DOMAIN — every season's shares, so a scrub never rescales. */
  const [xLo, xHi] = useMemo(() => {
    const all = frames.flatMap((f) => f.clubs.map((c) => c.share)).filter((v): v is number => v !== null);
    const lo = Math.floor((Math.min(...all) - 0.02) * 10) / 10;
    const hi = Math.ceil((Math.max(...all) + 0.02) * 10) / 10;
    return [lo, hi];
  }, [frames]);
  const sx = (v: number) => ((v - xLo) / (xHi - xLo)) * 100;
  const sy = (w: number) => (1 - w / Y_MAX) * 100;
  const xTicks = useMemo(() => {
    const out: number[] = [];
    for (let v = Math.ceil(xLo * 5) / 5; v <= xHi + 1e-9; v += 0.2) out.push(Math.round(v * 100) / 100);
    return out;
  }, [xLo, xHi]);

  const dots: Dot[] = useMemo(() => {
    const live = frame.clubs.filter(
      (c): c is ScrubClub & { share: number; cash: number } => c.share !== null && c.cash !== null,
    );
    const ranked = live
      .filter((c) => c.w > 0)
      .map((c) => ({ team: c.team, perWin: c.cash / c.w }))
      .sort((a, b) => a.perWin - b.perWin);
    const rankOf = new Map(ranked.map((r, i) => [r.team, i + 1]));
    const lit = live.filter((c) => c.div === focusDivision);
    const dys = dodgeLabels(
      lit.map((c) => ({ key: c.team, at: c.w })),
      0.8,
    );
    return live.map((c) => ({
      club: c,
      share: c.share,
      cash: c.cash,
      x: sx(c.share),
      y: sy(c.w),
      perWin: c.w > 0 ? c.cash / c.w : null,
      rank: rankOf.get(c.team) ?? null,
      dy: dys.get(c.team) ?? 0,
      lit: c.div === focusDivision,
    }));
    // sx/sy close over the pinned domain only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, focusDivision, xLo, xHi]);
  const rankedN = dots.filter((d) => d.rank !== null).length;

  /* the isolines: wins = share × cap ÷ $/win, straight through the origin */
  const k = frame.cap !== null && frame.avgCpw !== null ? frame.cap / frame.avgCpw : null;
  const iso = (kk: number) => ({ x1: sx(xLo), y1: sy(kk * xLo), x2: sx(xHi), y2: sy(kk * xHi) });
  const exitLabel = (kk: number) => {
    // where the line leaves the plot: the right edge, or the top if it is steeper
    const xAtTop = Y_MAX / kk;
    return xAtTop < xHi ? { x: sx(xAtTop), y: 0, edge: 'top' as const } : { x: 100, y: sy(kk * xHi), edge: 'right' as const };
  };

  const { tip, tipId, bind, pin, hide } = useChartTooltip<Dot>((d) => d.club.team);
  const seasons = frames.map((f) => f.season);
  const litDots = dots.filter((d) => d.lit);
  const ordered = [...dots].sort((a, b) => (a.perWin ?? Infinity) - (b.perWin ?? Infinity));

  return (
    <div className={css.wrap}>
      <SeasonScrubber seasons={seasons} value={frame.season} onChange={(s) => { hide(); setSeason(s); }} label="Frontier season" />

      <div className={css.chart}>
        <div className={css.yAxis} aria-hidden="true">
          {Y_TICKS.map((w) => (
            <span key={w} className={`yy-label ${css.yTick}`} style={{ top: `${sy(w)}%` }}>
              {w}
            </span>
          ))}
        </div>

        <div className={css.plot} onPointerLeave={() => (tip?.pinned ? null : hide())}>
          <svg
            className={css.svg}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            role="img"
            aria-label={`Efficiency frontier, ${frame.season}: wins against cash spent as a share of the season's cap for ${dots.length} clubs.${
              k !== null && frame.avgCpw !== null
                ? ` The gold line is the league price, ${usdShort(frame.avgCpw)} of cash per win; clubs above it bought wins cheaper.`
                : ''
            } ${divisionName} clubs: ${litDots
              .map((d) => `${d.club.team} ${d.club.w} wins on ${usdShort(d.cash)}`)
              .join('; ')}.`}
          >
            {Y_TICKS.slice(1).map((w) => (
              <line key={w} x1={0} x2={100} y1={sy(w)} y2={sy(w)} className={css.grid} />
            ))}
            {k !== null ? (
              <>
                <line {...iso(k / 0.75)} className={css.isoFaint} />
                <line {...iso(k / 1.25)} className={css.isoFaint} />
                <line {...iso(k)} className={css.isoUnder} />
                <line {...iso(k)} className={css.iso} />
              </>
            ) : null}
          </svg>

          {k !== null && frame.avgCpw !== null ? (
            <>
              <IsoLabel at={exitLabel(k)} className={css.isoLabel}>
                League {usdShort(frame.avgCpw)} / win
              </IsoLabel>
              <IsoLabel at={exitLabel(k / 0.75)} className={css.isoLabelFaint}>
                25% cheaper
              </IsoLabel>
              <IsoLabel at={exitLabel(k / 1.25)} className={css.isoLabelFaint}>
                25% dearer
              </IsoLabel>
            </>
          ) : (
            <p className={`yy-caption ${css.noBench}`}>{frame.avgCpwReason ?? frame.cashReason}</p>
          )}

          <span className={`yy-label ${css.corner} ${css.cornerTl}`} aria-hidden="true">
            ↑ Cheaper wins
          </span>
          <span className={`yy-label ${css.corner} ${css.cornerBr}`} aria-hidden="true">
            Dearer wins ↓
          </span>

          {dots.map((d, i) => (
            <button
              key={d.club.team}
              type="button"
              className={[css.dot, d.lit ? css.dotLit : '', hot === d.club.team ? css.dotHot : ''].join(' ')}
              style={{ left: `${d.x}%`, top: `${d.y}%`, '--i': Math.min(i, 8), '--dy': d.dy } as CSSProperties}
              aria-label={`${d.club.name}: ${d.club.w} wins, ${usdShort(d.cash)} cash, ${(d.share * 100).toFixed(0)}% of the cap${
                d.perWin !== null ? `, ${usdShort(d.perWin)} per win` : ', no wins'
              }`}
              {...bind(d, d.x, d.y)}
              onPointerEnter={(e) => {
                bind(d, d.x, d.y).onPointerEnter(e);
                setHot(d.club.team);
              }}
              onPointerLeave={(e) => {
                bind(d, d.x, d.y).onPointerLeave(e);
                setHot(null);
              }}
              onFocus={() => {
                bind(d, d.x, d.y).onFocus();
                setHot(d.club.team);
              }}
              onBlur={() => {
                bind(d, d.x, d.y).onBlur();
                setHot(null);
              }}
              onClick={() => pin(d, d.x, d.y)}
            >
              <span className={css.mark} />
              {d.lit ? <span className={css.label}>{d.club.team}</span> : null}
              {!d.lit && hot === d.club.team ? <span className={css.label}>{d.club.team}</span> : null}
            </button>
          ))}

          {tip ? (
            <div
              id={tipId}
              role="tooltip"
              className={`${css.tip} ${tip.pinned ? css.tipPinned : ''}`}
              style={tooltipStyle(tip.x, tip.y)}
            >
              <FrontierTip d={tip.datum} season={frame.season} avg={frame.avgCpw} n={rankedN} />
            </div>
          ) : null}
        </div>

        <div className={css.xAxis} aria-hidden="true">
          {xTicks.map((v) => (
            <span key={v} className={`yy-label ${css.xTick}`} style={{ left: `${sx(v)}%` }}>
              {Math.round(v * 100)}%
            </span>
          ))}
        </div>
      </div>
      <p className={`yy-label ${css.axisTitle}`}>
        Cash spent · % of the {frame.season} cap{frame.cap !== null ? ` (${usdShort(frame.cap)})` : ''} · axis pinned 2013–2025
      </p>

      <ul className={css.key}>
        <li className={`yy-label ${css.keyItem}`}>
          <i className={css.keyGold} aria-hidden="true" /> League cash per win{frame.avgCpw !== null ? ` · ${usdShort(frame.avgCpw)}` : ''}
        </li>
        <li className={`yy-label ${css.keyItem}`}>
          <i className={css.keyFaint} aria-hidden="true" /> ±25% per win
        </li>
        <li className={`yy-label ${css.keyItem}`}>
          <i className={css.keyLit} aria-hidden="true" /> {divisionName}
        </li>
      </ul>

      <ol className="yy-visually-hidden">
        {ordered.map((d) => (
          <li key={d.club.team}>
            {d.club.name}: {d.club.w} wins, {usdShort(d.cash)} cash ({(d.share * 100).toFixed(0)}% of cap),{' '}
            {d.perWin !== null ? `${usdShort(d.perWin)} per win` : 'no wins — ratio suppressed'}
          </li>
        ))}
      </ol>
    </div>
  );
}

function IsoLabel({
  at,
  className,
  children,
}: {
  at: { x: number; y: number; edge: 'top' | 'right' };
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`${css.isoLabelBase} ${className}`}
      data-edge={at.edge}
      style={{ left: `${Math.min(100, at.x)}%`, top: `${Math.max(0, Math.min(100, at.y))}%` }}
    >
      {children}
    </span>
  );
}

function FrontierTip({ d, season, avg, n }: { d: Dot; season: number; avg: number | null; n: number }) {
  const c = d.club;
  return (
    <>
      <p className={css.tipHead}>
        {c.name} · {season}
      </p>
      <dl className={css.tipList}>
        <dt>Record</dt>
        <dd>{recordDash(c.w, c.l, c.t)}</dd>
        <dt>Cash spent</dt>
        <dd>
          {usdShort(d.cash)} · {(d.share * 100).toFixed(0)}% of cap
        </dd>
        <dt>Cash / win</dt>
        <dd>
          {d.perWin !== null ? (
            <>
              {usdShort(d.perWin)}
              {d.rank !== null ? ` · #${d.rank} of ${n}` : ''}
            </>
          ) : (
            'No wins · ratio suppressed'
          )}
        </dd>
        {d.perWin !== null && avg !== null ? (
          <>
            <dt>Vs league</dt>
            <dd>{pctVsLeague(d.perWin, avg).toLowerCase()}</dd>
          </>
        ) : null}
        {c.ix ? (
          <>
            <dt>Cap+</dt>
            <dd>{c.ix.raw.toFixed(1)}</dd>
          </>
        ) : null}
      </dl>
      <a className={css.tipLink} href={`/team/${c.team.toLowerCase()}/${season}`}>
        Open {c.team} {season} →
      </a>
    </>
  );
}
