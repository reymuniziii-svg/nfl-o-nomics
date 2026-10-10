'use client';

/**
 * `QbWindowTimeline` — the franchise's Cap+ era with the rookie-QB windows
 * shaded, Cap+ and QB-neutral Cap+ as two lines (`SPEC.md` §2.10).
 *
 * The gap between the two lines IS `qb_timing_pts`. Read across a franchise it
 * shows how little the rookie window moved the index: the lines run nearly on
 * top of each other through the shaded seasons. That is the memo's finding,
 * drawn.
 *
 * Grammar shared with `FranchiseArc`: fixed 76–124 window (never fitted),
 * gold 100, one lime series (Cap+), Team-Rating-style dashed second series,
 * blank seasons hatched and named, one `<path>` per run, the page's season
 * marked. Measured width at scale 1.0, so no sideways scroller and no type
 * below the floor.
 */

import chart from '../charts/chart.module.css';
import css from './context.module.css';
import { Legend } from '../primitives';
import {
  INDEX_DOMAIN,
  chartId,
  gapsOf,
  gridValues,
  pathFor,
  runsOf,
  scaleLinear,
  scalePoint,
  type SeriesPoint,
} from '../charts/chart-kit';
import { useMeasuredWidth } from '@/lib/hooks/use-measured-width';
import { CAPPLUS_QB_NEUTRAL_LABEL } from '@/lib/metric';
import type { CapPlusContext } from '@/lib/data/context';

export function QbWindowTimeline({
  series,
  currentSeason,
  teamName,
}: {
  series: CapPlusContext[];
  currentSeason: number;
  teamName: string;
}) {
  const [ref, width] = useMeasuredWidth<HTMLDivElement>(317);
  const compact = width < 600;
  const w = width;
  const ml = 30;
  const mr = compact ? 14 : 24;
  const mt = 26;
  const mb = 30;
  const h = compact ? 210 : 260;
  const innerW = Math.max(40, w - ml - mr);
  const innerH = h - mt - mb;
  const id = chartId('qbw', teamName, compact ? 'm' : 'd');

  const seasons = series.map((r) => r.season);
  const x = scalePoint<number>().domain(seasons).range([0, innerW]).padding(0.5);
  const px = (s: number) => x(s) ?? 0;
  const step = x.step();
  const [LO, HI] = INDEX_DOMAIN;
  const y = scaleLinear().domain(INDEX_DOMAIN).range([innerH, 0]);
  const clampY = (v: number) => y(Math.max(LO, Math.min(HI, v)));

  const cp: SeriesPoint[] = series.map((r) => ({
    x: r.season,
    y: r.indices.state === 'blank' ? null : r.indices.value.capplus,
  }));
  const qn: SeriesPoint[] = series.map((r) => ({
    x: r.season,
    y: r.indices.state === 'blank' ? null : r.indices.value.capplusQbNeutral,
  }));
  const gaps = gapsOf(cp);

  // Contiguous rookie-window runs under one QB — one band, one label.
  const bands: { from: number; to: number; qb: string }[] = [];
  for (const r of series) {
    if (!r.qbRookieWindow) continue;
    const last = bands[bands.length - 1];
    if (last && last.qb === r.startingQb && r.season === last.to + 1) last.to = r.season;
    else bands.push({ from: r.season, to: r.season, qb: r.startingQb });
  }

  const offMarks = [
    ...cp.map((p) => ({ ...p, s: 'cp' as const })),
    ...qn.map((p) => ({ ...p, s: 'qn' as const })),
  ].filter((p) => p.y !== null && (p.y > HI || p.y < LO));

  const surname = (n: string) => n.split(/\s+/).slice(-1)[0] ?? n;
  const hasCurrent = seasons.includes(currentSeason);

  return (
    <div ref={ref} className={css.timeline}>
      <svg
        className={chart.svgFixed}
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={`${teamName} — Cap+ and ${CAPPLUS_QB_NEUTRAL_LABEL} by season, ${seasons[0]} to ${seasons[seasons.length - 1]}, rookie-deal seasons shaded`}
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
          {/* rookie-window bands — beneath everything */}
          {bands.map((b) => {
            const x0 = px(b.from) - step / 2;
            const bw = px(b.to) - px(b.from) + step;
            const label = `R · ${surname(b.qb)}`;
            const fits = label.length * 7 + 8 <= bw;
            return (
              <g key={`band${b.from}`}>
                <rect x={x0} y={0} width={bw} height={innerH} fill="var(--yy-bg-sunken)" />
                <text
                  className={`${chart.micro} ${chart.microOnSunken}`}
                  x={x0 + 4}
                  y={-8}
                  textAnchor="start"
                >
                  {fits || bw >= 28 ? (fits ? label : 'R') : ''}
                </text>
              </g>
            );
          })}

          {gridValues(INDEX_DOMAIN, 4)
            .filter((v) => Math.abs(v - 100) > 3)
            .map((v) => (
              <line key={`g${v}`} x1={0} x2={innerW} y1={y(v)} y2={y(v)} stroke="var(--yy-gridline)" strokeWidth={1} />
            ))}
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

          {gaps.map((g) => {
            const x0 = px(g.from) - step / 2;
            const gw = Math.max(6, px(g.to) - px(g.from));
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
                    className={chart.micro}
                    x={cx}
                    y={innerH / 2}
                    dy={3.5}
                    textAnchor="middle"
                    transform={`rotate(-90 ${cx} ${innerH / 2})`}
                  >
                    No league-wide table
                  </text>
                ) : null}
              </g>
            );
          })}

          {hasCurrent ? (
            <line x1={px(currentSeason)} x2={px(currentSeason)} y1={0} y2={innerH} stroke="var(--yy-fg-mid)" strokeWidth={1} />
          ) : null}

          <g clipPath={`url(#${id}-plot)`}>
            {runsOf(qn).map((run, i) => (
              <path
                key={`qn${i}`}
                d={pathFor(run, px, y)}
                fill="none"
                stroke="var(--yy-compare)"
                strokeWidth="var(--yy-stroke-compare)"
                strokeLinecap="round"
                style={{ strokeDasharray: 'var(--yy-dash-compare)' }}
              />
            ))}
            {runsOf(cp).map((run, i) => (
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

          {offMarks.map((m) => {
            const hi = (m.y as number) > HI;
            const mx = px(m.x);
            const fill = m.s === 'cp' ? 'var(--yy-accent)' : 'var(--yy-compare)';
            return (
              <g key={`off${m.s}${m.x}`}>
                <path
                  d={hi ? `M${mx - 5},6 L${mx},0 L${mx + 5},6 Z` : `M${mx - 5},${innerH - 6} L${mx},${innerH} L${mx + 5},${innerH - 6} Z`}
                  fill={fill}
                />
                <text className={chart.micro} x={mx + 8} y={hi ? 8 + (m.s === 'qn' ? 12 : 0) : innerH - 2 - (m.s === 'qn' ? 12 : 0)} fill={fill}>
                  {(m.y as number).toFixed(1)}
                </text>
              </g>
            );
          })}

          {hasCurrent && cp.find((p) => p.x === currentSeason)?.y != null ? (
            <circle
              cx={px(currentSeason)}
              cy={clampY(cp.find((p) => p.x === currentSeason)!.y as number)}
              r={6}
              fill="none"
              stroke="var(--yy-fg-1)"
              strokeWidth={2}
            />
          ) : null}

          <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke="var(--yy-axis)" strokeWidth={1} />
          {seasons.map((s, i) => {
            const show = s === currentSeason || (compact ? i % 3 === 0 : i % 2 === 0) || i === seasons.length - 1;
            if (!show) return null;
            if (s !== currentSeason && hasCurrent && Math.abs(px(s) - px(currentSeason)) < 26) return null;
            return s === currentSeason ? (
              <g key={`t${s}`}>
                <rect x={px(s) - 19} y={innerH + 5} width={38} height={18} rx={2} fill="var(--yy-fg-1)" />
                <text className={chart.tick} x={px(s)} y={innerH + 18} textAnchor="middle" fill="var(--yy-bg-card-flat)">
                  {s}
                </text>
              </g>
            ) : (
              <text key={`t${s}`} className={chart.tick} x={px(s)} y={innerH + 18} textAnchor="middle">
                &rsquo;{String(s).slice(2)}
              </text>
            );
          })}
          {[80, 90, 110, 120].map((v) => (
            <text key={`v${v}`} className={chart.tick} x={-8} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          ))}
          <text className={chart.tick} x={-8} y={y(100) + 4} textAnchor="end" fill="var(--yy-benchmark)">
            100
          </text>
        </g>
      </svg>
      <p id={`${id}-d`} className="yy-visually-hidden">
        {series
          .map((r) =>
            r.indices.state === 'blank'
              ? `${r.season}: ${r.startingQb}${r.qbRookieWindow ? ', rookie deal' : ''}; not covered.`
              : `${r.season}: ${r.startingQb}${r.qbRookieWindow ? ', rookie deal' : ''}; Cap+ ${r.indices.value.capplus.toFixed(1)}, ${CAPPLUS_QB_NEUTRAL_LABEL} ${r.indices.value.capplusQbNeutral.toFixed(1)}.`,
          )
          .join(' ')}
      </p>
      <p className={`yy-label ${css.rKey}`}>
        <span className={css.rSwatch} aria-hidden="true" />
        Shaded seasons mark a starting QB on his rookie deal (R)
      </p>
      <Legend
        items={[
          { swatch: 'solid', label: 'Cap+', tone: 'accent' },
          { swatch: 'dashed', label: CAPPLUS_QB_NEUTRAL_LABEL, tone: 'compare' },
          { swatch: 'benchmark', label: '100 = league average', tone: 'benchmark' },
          { swatch: 'hatch', label: 'Season not covered', tone: 'absence' },
        ]}
      />
    </div>
  );
}
