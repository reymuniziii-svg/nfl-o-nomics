'use client';

/**
 * `CapPlusLeaderboard` — `COMPONENTS.md` §2, `SPEC.md` §3.1.3.
 *
 * **All 32 rows. Not a top-10.** Two compositions, one dataset: the row-card
 * list below 1024px and the real table at 1024+. Clubs whose index is `blank`
 * sort to a labeled group at the bottom, never interleaved, never zero.
 *
 * What the 2026-10-10 review changed (B.6, D #9, D #10):
 *   - THE RANK FOLLOWS THE SORT. Sorted by $/win, `#1` is the cheapest club,
 *     whichever direction the rows run — the column is never a stale Cap+ rank.
 *   - The first click on a column sorts it BEST-FIRST (cheapest $/win, most
 *     wins, highest index).
 *   - Sort and numerator live in the URL: `?sort=cpw&n=cap` (`-cpw` reverses).
 *   - Re-sorting is a FLIP: rows slide to their new places over
 *     `--yy-dur-base` (`CHART_ANATOMY.md` §6.2); reduced motion collapses it.
 *   - $/win carries a mark: a bar on one league-wide domain with the gold
 *     league tick, pinned across both numerators so the toggle animates
 *     truthfully.
 *   - Δ is against the LAST COVERED season, not a fixed five-year lag that
 *     landed on a blank year in all 32 rows.
 *   - The `R` chip names a rookie-window starting QB, and a split view ranks
 *     the two strata separately, each against its own mean.
 *   - The Review control (on the Field) swaps the index column to QB-neutral
 *     Cap+ or the CANDIDATE obligation index, with raw Cap+ kept beside it.
 */

import { Fragment, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import Link from 'next/link';
import css from './leaderboard.module.css';
import { CapPlusCaption } from '../primitives';
import { Segmented } from '../field/season-scrubber';
import { indexBand, usdShort } from '@/lib/display';
import type { Metric } from '@/lib/metric';
import { REVIEW_NAME, useLeagueLink, useUrlParam, type ReviewMode } from './league-link';

export interface LeaderboardContext {
  qbn: number;
  qbnRank: number;
  obl: number;
  oblRank: number;
  stratumRank: number;
}

export interface LeaderboardViewRow {
  team: string;
  teamName: string;
  record: string;
  wins: number;
  rank: number | null;
  index: Metric<number>;
  /** Spend under each numerator, and the ratio. A zero-win ratio is blank by rule. */
  spend: { cash: Metric<number>; cap: Metric<number> };
  perWin: { cash: Metric<number>; cap: Metric<number> };
  delta: Metric<number>;
  href: string;
  ctx: LeaderboardContext | null;
  rookie: boolean | null;
  qb: string | null;
}

export interface StratumLine {
  n: number;
  mean: number;
}

type SortKey = 'index' | 'cpw' | 'wins' | 'spend' | 'team' | 'delta';
type Numerator = 'cash' | 'cap';

/** The direction each column's "best" runs. Rank 1 is always the best. */
const BEST_FIRST: Record<SortKey, 'asc' | 'desc'> = {
  index: 'desc',
  cpw: 'asc',
  wins: 'desc',
  spend: 'desc',
  team: 'asc',
  delta: 'desc',
};

const SORT_PARAMS = (['index', 'cpw', 'wins', 'spend', 'team', 'delta'] as const).flatMap((k) => [
  k,
  `-${k}`,
]);

function modeValue(r: LeaderboardViewRow, mode: ReviewMode): number | null {
  if (mode === 'raw' || !r.ctx) return r.index.state === 'blank' ? null : r.index.value;
  return mode === 'qbn' ? r.ctx.qbn : r.ctx.obl;
}

function sortValue(r: LeaderboardViewRow, key: SortKey, n: Numerator, mode: ReviewMode) {
  switch (key) {
    case 'index':
      return modeValue(r, mode);
    case 'cpw':
      return r.perWin[n].state === 'blank' ? null : r.perWin[n].value;
    case 'wins':
      return r.wins;
    case 'spend':
      return r.spend[n].state === 'blank' ? null : r.spend[n].value;
    case 'team':
      return r.teamName;
    case 'delta':
      return r.delta.state === 'blank' ? null : r.delta.value;
  }
}

function cmp(a: number | string | null, b: number | string | null, dir: 'asc' | 'desc') {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const c = typeof a === 'string' || typeof b === 'string' ? String(a).localeCompare(String(b)) : a - b;
  return dir === 'asc' ? c : -c;
}

const SORT_LABEL: Record<SortKey, string> = {
  index: 'index',
  cpw: '$/win',
  wins: 'wins',
  spend: 'spend',
  team: 'name',
  delta: 'change',
};

export function CapPlusLeaderboard({
  rows,
  season,
  indexName,
  isCapPlus,
  focusTeams = [],
  leagueAvg,
  priorSeason,
  strata,
  strataReason,
  csvSlot,
}: {
  rows: LeaderboardViewRow[];
  season: number;
  indexName: string;
  isCapPlus: boolean;
  focusTeams?: string[];
  /** League $/win per numerator — the gold tick on every $/win bar. */
  leagueAvg: { cash: number | null; cap: number | null };
  priorSeason: number | null;
  strata: { rookie: StratumLine | null; veteran: StratumLine | null } | null;
  strataReason?: string;
  csvSlot?: React.ReactNode;
}) {
  const { numerator: n, review, hot, setHot, season: fieldSeason } = useLeagueLink(season);
  const [sortParam, setSortParam] = useUrlParam<string>('sort', 'index', SORT_PARAMS);
  const [split, setSplit] = useState<'all' | 'split'>('all');
  const mode: ReviewMode = isCapPlus ? review : 'raw';

  const key = sortParam.replace(/^-/, '') as SortKey;
  const reversed = sortParam.startsWith('-');
  const dir: 'asc' | 'desc' = reversed ? (BEST_FIRST[key] === 'asc' ? 'desc' : 'asc') : BEST_FIRST[key];

  function onSort(k: SortKey) {
    if (k === key) setSortParam(reversed ? k : `-${k}`);
    else setSortParam(k);
  }

  const { live, blanked, rankBy } = useMemo(() => {
    const withIndex = rows.filter((r) => r.index.state !== 'blank');
    const withoutIndex = rows.filter((r) => r.index.state === 'blank');
    // the rank: best-first by the active key (by index for a name sort)
    const rankKey: SortKey = key === 'team' ? 'index' : key;
    // ties break on the club's Cap+ rank, in the rank AND in the row order, so
    // the rank column reads 1, 2, 3 down a best-first list
    const tie = (a: LeaderboardViewRow, b: LeaderboardViewRow) =>
      (a.rank ?? 99) - (b.rank ?? 99) || a.team.localeCompare(b.team);
    const best = [...withIndex].sort(
      (a, b) =>
        cmp(sortValue(a, rankKey, n, mode), sortValue(b, rankKey, n, mode), BEST_FIRST[rankKey]) ||
        tie(a, b),
    );
    const rankBy = new Map<string, number | null>(
      best.map((r, i) => [r.team, sortValue(r, rankKey, n, mode) === null ? null : i + 1]),
    );
    const sorted = [...withIndex].sort(
      (a, b) =>
        cmp(sortValue(a, key, n, mode), sortValue(b, key, n, mode), dir) ||
        (dir === BEST_FIRST[key] ? tie(a, b) : tie(b, a)),
    );
    return { live: sorted, blanked: withoutIndex, rankBy };
  }, [rows, key, dir, n, mode]);

  /* ---- FLIP: rows slide to their new places when the order changes ---- */
  const mobileRefs = useRef(new Map<string, HTMLElement>());
  const tableRefs = useRef(new Map<string, HTMLElement>());
  const lastTops = useRef(new Map<string, number>());
  const order = live.map((r) => r.team).join(',');
  const lastOrder = useRef(order);
  useLayoutEffect(() => {
    const changed = lastOrder.current !== order;
    lastOrder.current = order;
    for (const [prefix, refs] of [
      ['m', mobileRefs.current],
      ['t', tableRefs.current],
    ] as const) {
      for (const [team, el] of refs) {
        const top = el.offsetTop;
        const prev = lastTops.current.get(prefix + team);
        lastTops.current.set(prefix + team, top);
        if (!changed || prev === undefined || prev === top || !el.offsetParent) continue;
        const cs = getComputedStyle(el);
        const dur = parseFloat(cs.getPropertyValue('--yy-dur-base')) || 0;
        el.animate([{ transform: `translateY(${prev - top}px)` }, { transform: 'none' }], {
          duration: dur,
          easing: cs.getPropertyValue('--yy-ease-standard').trim() || 'ease',
        });
      }
    }
  }, [order]);

  const blankReason = blanked.length && blanked[0].index.state === 'blank' ? blanked[0].index.reason : '';
  const focus = new Set(focusTeams);

  /* one $/win domain for the season, across BOTH numerators — pinned */
  const cpwMax = useMemo(() => {
    const all = rows.flatMap((r) =>
      (['cash', 'cap'] as const).map((k) => (r.perWin[k].state === 'blank' ? 0 : r.perWin[k].value)),
    );
    return Math.max(1, ...all) * 1.04;
  }, [rows]);
  const tick = leagueAvg[n];
  const tickPct = tick === null ? null : (tick / cpwMax) * 100;

  const lens = n === 'cash' ? 'cash' : 'cap hit';
  const spendHead = n === 'cash' ? 'Cash spent' : 'Cap hit';
  const idxHead = mode === 'raw' ? (isCapPlus ? 'Cap+' : 'Rating') : REVIEW_NAME[mode];
  // the change column is always RAW Cap+ against its last covered season
  const deltaHead = `${mode === 'raw' ? '' : 'Cap+ '}${priorSeason ? `Δ vs ’${String(priorSeason).slice(2)}` : 'Δ'}`;
  const rookieCount = rows.filter((r) => r.rookie).length;

  const rowEvents = (team: string) => ({
    onPointerEnter: () => setHot(team),
    onPointerLeave: () => setHot(null),
    onFocus: () => setHot(team),
    onBlur: () => setHot(null),
  });

  /** The mobile secondary line is the sorted column, always (`MOBILE_PATTERNS.md` §4). */
  function secondary(r: LeaderboardViewRow): string {
    const pw = r.perWin[n];
    const cpw = pw.state === 'blank' ? 'no ratio (0 wins)' : `${usdShort(pw.value)}/win`;
    const sp = r.spend[n];
    switch (key) {
      case 'wins':
        return `${r.team} · ${r.record} · ${cpw}`;
      case 'spend':
        return `${r.team} · ${sp.state === 'blank' ? 'not covered' : `${usdShort(sp.value)} ${lens}`} · ${r.wins}W`;
      case 'delta':
        return `${r.team} · ${r.delta.state === 'blank' ? 'no prior reading' : `Cap+ ${signed(r.delta.value)} vs ${priorSeason ?? 'prior'}`}`;
      default:
        return `${r.team} · ${cpw} · ${r.wins}W`;
    }
  }

  const splitAvailable = isCapPlus && strata !== null;

  return (
    <div className={css.wrap}>
      <div className={css.toolbar}>
        <Segmented
          options={['all', 'split'] as const}
          value={split}
          onChange={setSplit}
          label="Leaderboard view"
          disabled={!splitAvailable}
          names={{ all: 'All 32', split: 'QB deal' }}
        />
        {fieldSeason !== season ? (
          <span className={`yy-label ${css.seasonNote}`}>Table shows {season}</span>
        ) : null}
      </div>

      {split === 'split' && splitAvailable ? (
        <SplitView
          rows={live}
          strata={strata!}
          mode={mode}
          hot={hot}
          focus={focus}
          rowEvents={rowEvents}
          n={n}
        />
      ) : (
        <>
          {/* ── mobile: the row-card list ─────────────────────────────────── */}
          <div className={css.mobileList}>
            <div className={css.headRow}>
              <SortHeader label="#" k="index" active={false} dir={dir} onSort={onSort} align="right" hidden />
              <SortHeader label="Team" k="team" active={key === 'team'} dir={dir} onSort={onSort} />
              <SortHeader label={`$/win`} k="cpw" active={key === 'cpw'} dir={dir} onSort={onSort} align="right" />
              <SortHeader
                label={mode === 'raw' ? idxHead : mode === 'qbn' ? 'QB-n' : 'Obl.*'}
                k="index"
                active={key === 'index'}
                dir={dir}
                onSort={onSort}
                align="right"
              />
            </div>
            <p className={`yy-label ${css.rankNote}`}>
              # = rank by {key === 'team' ? SORT_LABEL.index : SORT_LABEL[key]}
              {mode !== 'raw' ? ` · * ${REVIEW_NAME[mode]}` : ''}
            </p>

            {live.map((r) => (
              <Link
                key={r.team}
                href={r.href}
                ref={(el) => {
                  if (el) mobileRefs.current.set(r.team, el);
                  else mobileRefs.current.delete(r.team);
                }}
                className={[css.row, focus.has(r.team) ? css.rowFocus : '', hot === r.team ? css.rowHot : ''].join(' ')}
                {...rowEvents(r.team)}
              >
                <span className={`yy-num ${css.rank}`}>{rankBy.get(r.team) ?? '—'}</span>
                <span className={css.teamCell}>
                  <span className={css.teamName}>
                    {r.teamName}
                    {r.rookie ? <RChip qb={r.qb} /> : null}
                  </span>
                  <span className={`yy-label ${css.teamSub}`}>{secondary(r)}</span>
                </span>
                <CpwBar m={r.perWin[n]} max={cpwMax} tickPct={tickPct} />
                <IndexCell r={r} mode={mode} isCapPlus={isCapPlus} />
              </Link>
            ))}
          </div>

          {/* ── desktop: the real table ───────────────────────────────────── */}
          <div className={css.tableWrap}>
            <table className={css.table}>
              <caption className="yy-visually-hidden">
                {indexName} for all 32 clubs, {season}. 100 = league average. Sorted by{' '}
                {SORT_LABEL[key]}, {dir === BEST_FIRST[key] ? 'best first' : 'worst first'}.
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={`yy-label-lg ${css.numCell}`}>
                    <span className={css.rankHead}>
                      #<span className={css.rankHeadSub}>{key === 'team' ? SORT_LABEL.index : SORT_LABEL[key]}</span>
                    </span>
                  </th>
                  <th scope="col" className="yy-label-lg" aria-sort={ariaSort(key, dir, 'team')}>
                    <SortHeader label="Team" k="team" active={key === 'team'} dir={dir} onSort={onSort} />
                  </th>
                  <th scope="col" className={`yy-label-lg ${css.numCell}`} aria-sort={ariaSort(key, dir, 'spend')}>
                    <SortHeader label={spendHead} k="spend" active={key === 'spend'} dir={dir} onSort={onSort} align="right" />
                  </th>
                  <th scope="col" className={`yy-label-lg ${css.numCell}`} aria-sort={ariaSort(key, dir, 'wins')}>
                    <SortHeader label="Wins" k="wins" active={key === 'wins'} dir={dir} onSort={onSort} align="right" />
                  </th>
                  <th scope="col" className={`yy-label-lg ${css.cpwHead}`} aria-sort={ariaSort(key, dir, 'cpw')}>
                    <SortHeader label={`$/win (${lens})`} k="cpw" active={key === 'cpw'} dir={dir} onSort={onSort} align="right" />
                  </th>
                  <th scope="col" className={`yy-label-lg ${css.numCell} ${css.idxHead}`} aria-sort={ariaSort(key, dir, 'index')}>
                    <SortHeader label={idxHead} k="index" active={key === 'index'} dir={dir} onSort={onSort} align="right" />
                  </th>
                  <th scope="col" className={`yy-label-lg ${css.numCell}`} aria-sort={ariaSort(key, dir, 'delta')}>
                    <SortHeader label={deltaHead} k="delta" active={key === 'delta'} dir={dir} onSort={onSort} align="right" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {live.map((r) => (
                  <tr
                    key={r.team}
                    ref={(el) => {
                      if (el) tableRefs.current.set(r.team, el);
                      else tableRefs.current.delete(r.team);
                    }}
                    className={[focus.has(r.team) ? css.rowFocus : '', hot === r.team ? css.rowHot : ''].join(' ')}
                    {...rowEvents(r.team)}
                  >
                    <td className={`yy-num ${css.numCell} ${css.rankCell}`}>{rankBy.get(r.team) ?? '—'}</td>
                    <th scope="row">
                      <Link className={`yy-label-lg ${css.link}`} href={r.href}>
                        {r.teamName}
                      </Link>
                      {r.rookie ? <RChip qb={r.qb} /> : null}
                      <span className={`yy-label ${css.recordInline}`}>{r.record}</span>
                    </th>
                    <td className={`yy-num ${css.numCell}`}>
                      {r.spend[n].state === 'blank' ? (
                        <BlankCell reason={r.spend[n].reason} short="Not covered" />
                      ) : (
                        usdShort(r.spend[n].value)
                      )}
                    </td>
                    <td className={`yy-num ${css.numCell}`}>{r.wins}</td>
                    <td className={css.cpwCell}>
                      <CpwBar m={r.perWin[n]} max={cpwMax} tickPct={tickPct} withValue />
                    </td>
                    <td className={`yy-num ${css.numCell}`}>
                      <IndexCell r={r} mode={mode} isCapPlus={isCapPlus} wide />
                    </td>
                    <td className={`yy-num ${css.numCell}`}>
                      {r.delta.state === 'blank' ? (
                        <BlankCell reason={r.delta.reason} short="No prior" />
                      ) : (
                        signed(r.delta.value)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {blanked.length ? (
            <>
              <p className={`yy-label ${css.blankGroup}`}>Not covered · {blanked.length} clubs</p>
              <p className={`yy-caption ${css.blankReason}`}>{blankReason}</p>
              <ul className={css.blankList}>
                {blanked.map((r) => (
                  <li key={r.team}>
                    <Link className={`yy-label ${css.link}`} href={r.href}>
                      {r.teamName} · {r.record}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}

      {/* the key and the lens — the caveats travel with the figures */}
      <ul className={css.key}>
        <li className={`yy-label ${css.keyItem}`}>
          <i className={css.keyTick} aria-hidden="true" />
          League {lens} per win{tick !== null ? ` · ${usdShort(tick)}` : ''}
        </li>
        {rookieCount ? (
          <li className={`yy-label ${css.keyItem}`}>
            <span className={css.rChip} aria-hidden="true">
              R
            </span>
            Starting QB on his rookie deal · {rookieCount} clubs
          </li>
        ) : null}
      </ul>
      <p className={`yy-caption ${css.caption}`}>
        {n === 'cash' ? '$/win is cash per win' : '$/win is cap per win'}, set by the toggle on the
        cost-per-win card above.
      </p>
      {strataReason && isCapPlus ? <p className={`yy-caption ${css.caption}`}>{strataReason}</p> : null}
      <p className={`yy-caption ${css.caption}`}>
        <CapPlusCaption /> —{' '}
        {`${indexName} scores each club against its own season’s league. It is not a front-office grade.`}
        {mode === 'obl'
          ? ' Raw Cap+ runs beside the candidate in the table.'
          : ''}
      </p>
      {csvSlot}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */

function SplitView({
  rows,
  strata,
  mode,
  hot,
  focus,
  rowEvents,
  n,
}: {
  rows: LeaderboardViewRow[];
  strata: { rookie: StratumLine | null; veteran: StratumLine | null };
  mode: ReviewMode;
  hot: string | null;
  focus: Set<string>;
  rowEvents: (team: string) => Record<string, () => void>;
  n: Numerator;
}) {
  const groups = [
    { key: 'rookie', title: 'QB on his rookie deal', line: strata.rookie, rows: rows.filter((r) => r.rookie) },
    { key: 'veteran', title: 'QB on a veteran deal', line: strata.veteran, rows: rows.filter((r) => r.rookie === false) },
  ];
  return (
    <div className={css.split}>
      {groups.map((g) => {
        const ordered = [...g.rows].sort((a, b) => (a.ctx?.stratumRank ?? 99) - (b.ctx?.stratumRank ?? 99));
        const cut = g.line ? ordered.findIndex((r) => (r.index.state === 'blank' ? 0 : r.index.value) < g.line!.mean) : -1;
        return (
          <section key={g.key} className={css.splitCol} aria-label={g.title}>
            <h3 className={`yy-label ${css.splitHead}`}>
              {g.title} · {ordered.length} clubs
            </h3>
            {ordered.map((r, i) => (
              <Fragment key={r.team}>
                {i === cut && g.line ? <MeanRule mean={g.line.mean} n={g.line.n} /> : null}
                <Link
                  href={r.href}
                  className={[css.row, focus.has(r.team) ? css.rowFocus : '', hot === r.team ? css.rowHot : ''].join(' ')}
                  {...rowEvents(r.team)}
                >
                  <span className={`yy-num ${css.rank}`}>{r.ctx?.stratumRank ?? '—'}</span>
                  <span className={css.teamCell}>
                    <span className={css.teamName}>{r.teamName}</span>
                    <span className={`yy-label ${css.teamSub}`}>
                      {r.team} · {r.qb ?? 'starter unknown'} ·{' '}
                      {r.perWin[n].state === 'blank' ? 'no ratio' : `${usdShort(r.perWin[n].value)}/win`}
                    </span>
                  </span>
                  <span />
                  <IndexCell r={r} mode={mode} isCapPlus rawFirst />
                </Link>
              </Fragment>
            ))}
            {g.line && (cut === -1 || cut === ordered.length) ? <MeanRule mean={g.line.mean} n={g.line.n} /> : null}
          </section>
        );
      })}
      <p className={`yy-caption ${css.splitNote}`}>
        Each group ranks on Cap+ against itself, and the gold rule marks the group&apos;s own mean.
        Across the nine covered seasons, clubs with a rookie-deal starter average below 100
        because they are usually still bad. The cheap QB deal adds only about 2.8 points.
      </p>
    </div>
  );
}

function MeanRule({ mean, n }: { mean: number; n: number }) {
  return (
    <div className={css.meanRule} role="separator" aria-label={`Group mean, Cap+ ${mean.toFixed(1)}, ${n} clubs`}>
      <span className={`yy-label ${css.meanLabel}`}>
        Group mean · Cap+ {mean.toFixed(1)}
      </span>
    </div>
  );
}

function RChip({ qb }: { qb: string | null }) {
  return (
    <span className={css.rChip} title={`Starting QB on his rookie deal${qb ? `: ${qb}` : ''}`}>
      R<span className="yy-visually-hidden">, starting QB on his rookie deal{qb ? `: ${qb}` : ''}</span>
    </span>
  );
}

function CpwBar({
  m,
  max,
  tickPct,
  withValue = false,
}: {
  m: Metric<number>;
  max: number;
  tickPct: number | null;
  withValue?: boolean;
}) {
  if (m.state === 'blank') {
    return (
      <span className={css.cpw}>
        <span className={`${css.cpwTrack} ${css.cpwTrackBlank}`} aria-hidden="true" />
        {withValue ? <BlankCell reason={m.reason} short="Ratio suppressed" /> : null}
      </span>
    );
  }
  return (
    <span className={css.cpw}>
      <span className={css.cpwTrack} aria-hidden="true">
        <span className={css.cpwFill} style={{ width: `${(m.value / max) * 100}%` } as CSSProperties} />
        {tickPct !== null ? <span className={css.cpwTick} style={{ left: `${tickPct}%` }} /> : null}
      </span>
      {withValue ? <span className={`yy-num ${css.cpwValue}`}>{usdShort(m.value)}</span> : null}
    </span>
  );
}

/**
 * The index figure. Under a Review mode it leads with that index and keeps raw
 * Cap+ beneath (`SPEC.md` §2.10: the candidate renders only beside Cap+).
 * `rawFirst` flips the pair where the ORDER is raw Cap+ (the split view ranks
 * on the mart's stratum rank), so the leading figure always matches the order.
 */
function IndexCell({
  r,
  mode,
  isCapPlus,
  wide = false,
  rawFirst = false,
}: {
  r: LeaderboardViewRow;
  mode: ReviewMode;
  isCapPlus: boolean;
  wide?: boolean;
  rawFirst?: boolean;
}) {
  if (r.index.state === 'blank') return <BlankCell reason={r.index.reason} short="Not covered" />;
  const raw = r.index.value;
  const alt = modeValue(r, mode);
  const lead = rawFirst ? raw : alt;
  const band = !isCapPlus ? css.indexNeutral : lead === null ? '' : bandClass(lead);
  const fmt = (v: number) => v.toFixed(wide ? 1 : 0);
  return (
    <span className={css.indexStack}>
      <span className={`yy-num ${css.index} ${band}`}>{lead === null ? '—' : fmt(lead)}</span>
      {mode !== 'raw' ? (
        <span className={`yy-label ${css.indexRaw}`}>
          {rawFirst
            ? `${mode === 'qbn' ? 'QB-n' : 'Obl.*'} ${alt === null ? '—' : fmt(alt)}`
            : `Cap+ ${fmt(raw)}`}
        </span>
      ) : null}
    </span>
  );
}

function bandClass(v: number) {
  const b = indexBand(v);
  return b === 'above' ? css.indexAbove : b === 'mid' ? css.indexMid : css.indexBelow;
}

function signed(v: number): string {
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
}

/**
 * A cell whose metric is `blank`: a visible short form and the full reason as
 * the cell's accessible text — never a dash, a zero or an empty cell.
 */
function BlankCell({ reason, short }: { reason: string; short: string }) {
  return (
    <span className={`yy-label ${css.blankCell}`} title={reason}>
      {short}
      <span className="yy-visually-hidden">. {reason}</span>
    </span>
  );
}

function ariaSort(key: SortKey, dir: 'asc' | 'desc', k: SortKey): 'ascending' | 'descending' | 'none' {
  if (key !== k) return 'none';
  return dir === 'asc' ? 'ascending' : 'descending';
}

function SortHeader({
  label,
  k,
  active,
  dir,
  onSort,
  align,
  hidden = false,
}: {
  label: string;
  k: SortKey;
  active: boolean;
  dir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  align?: 'right';
  hidden?: boolean;
}) {
  if (hidden) return <span className={`yy-label ${css.alignRight}`}>{label}</span>;
  return (
    <button
      type="button"
      className={`yy-label ${css.sortBtn} ${active ? css.sortActive : ''} ${align === 'right' ? css.alignRight : ''}`}
      onClick={() => onSort(k)}
    >
      {label}
      {active ? (
        <svg className={css.caret} width="8" height="6" viewBox="0 0 8 6" aria-hidden="true" fill="currentColor">
          {dir === 'asc' ? <path d="M4 0 8 6H0z" /> : <path d="M4 6 0 0h8z" />}
        </svg>
      ) : null}
    </button>
  );
}
