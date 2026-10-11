'use client';

/**
 * The live frame of the league surfaces on `/` and `/division/{div}`
 * (DECISIONS 116, plan §4). Two components, both comparable within 2026 only:
 *
 *  - `LiveField` — live Cap+ is gated, so the Field places NO club: all 32 sit
 *    in the off-field group headed `NOT COVERED — {reason}`, and the Review
 *    control is disabled with its reason. Nothing is drawn on the yard lines,
 *    because nothing there would be true.
 *  - `LiveLeaderboard` — 32 rows: rank, club, record, GP, Team Rating live
 *    (the hatched partial mark, `⟨GP/17⟩`) and the opponent-adjusted EPA
 *    margin; sortable within 2026. No $/win, no spend, no Δ, no verdict.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import lb from '../leaderboard/leaderboard.module.css';
import field from '../field/field.module.css';
import css from './live.module.css';
import { Segmented } from '../field/season-scrubber';
import { REVIEW_MODES, REVIEW_SHORT, useLeagueLink } from '../leaderboard/league-link';
import { LiveRatingBar } from './live-marks';
import { DIVISION_SLUGS, divisionName, type DivisionSlug } from '@/lib/teams';
import type { Metric } from '@/lib/metric';

/** The serializable slice of a live row the client needs. */
export interface LiveClubView {
  team: string;
  teamName: string;
  div: string | null;
  record: string;
  winPct: number;
  gp: number;
  gs: number;
  byeWeek: number;
  byeTaken: boolean;
  rank: number;
  rating: Metric<number>;
  epaAdj: number;
  epaRaw: number;
  href: string;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE FIELD, LIVE                                                             */
/* ══════════════════════════════════════════════════════════════════════════ */

export function LiveField({
  clubs,
  focusDivision,
  capplusReason,
  season,
}: {
  clubs: LiveClubView[];
  focusDivision: string;
  capplusReason: string;
  season: number;
}) {
  const { hot, setHot } = useLeagueLink(season);
  const byDiv = DIVISION_SLUGS.map((d) => ({
    d,
    clubs: clubs.filter((c) => c.div === d).sort((a, b) => a.team.localeCompare(b.team)),
  }));
  return (
    <div>
      <div className={css.reviewRow}>
        <span className={`yy-label ${field.reviewLabel}`}>Review</span>
        <Segmented
          options={REVIEW_MODES}
          value="raw"
          onChange={() => {}}
          label="Review: which index places the clubs (not available while 2026 is in progress)"
          disabled
          names={REVIEW_SHORT}
        />
      </div>
      <p className={`yy-caption ${field.reviewNote}`}>
        Review is off in {season}: it re-places clubs by Cap+, and there&apos;s no live Cap+ to place
        them by yet.
      </p>

      <section className={css.offField} aria-label={`Off the field: all ${clubs.length} clubs, ${season}`}>
        <p className={`yy-label ${css.offHead}`}>Not covered — {capplusReason}</p>
        <p className="yy-caption">
          All {clubs.length}{' '}clubs stand on the sideline. The Field places a club by Cap+, which
          prices a season&apos;s results against a season&apos;s cap. Mid-season, neither half is
          finished.
        </p>
        <div className={css.offGrid}>
        {byDiv.map(({ d, clubs: cs }) =>
          cs.length ? (
            <div className={css.offDiv} key={d}>
            <p className={`yy-label ${css.offDivName}`}>{divisionName(d as DivisionSlug)}</p>
            <ul className={css.offList} aria-label={divisionName(d as DivisionSlug)}>
              {cs.map((c) => (
                <li key={c.team}>
                  <Link
                    href={c.href}
                    className={`yy-label ${css.offClub} ${c.div === focusDivision || hot === c.team ? css.offClubLit : ''}`}
                    onPointerEnter={() => setHot(c.team)}
                    onPointerLeave={() => setHot(null)}
                  >
                    {c.team} {c.record}
                  </Link>
                </li>
              ))}
            </ul>
            </div>
          ) : null,
        )}
        </div>
      </section>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* THE LEADERBOARD, LIVE                                                       */
/* ══════════════════════════════════════════════════════════════════════════ */

type SortKey = 'rating' | 'record' | 'gp' | 'epa' | 'team';

const BEST_FIRST: Record<SortKey, 'asc' | 'desc'> = {
  rating: 'desc',
  record: 'desc',
  gp: 'desc',
  epa: 'desc',
  team: 'asc',
};

const SORT_LABEL: Record<SortKey, string> = {
  rating: 'rating',
  record: 'win %',
  gp: 'games',
  epa: 'adj. EPA',
  team: 'name',
};

function sortValue(c: LiveClubView, k: SortKey): number | string | null {
  switch (k) {
    case 'rating':
      return c.rating.state === 'blank' ? null : c.rating.value;
    case 'record':
      return c.winPct;
    case 'gp':
      return c.gp;
    case 'epa':
      return c.epaAdj;
    case 'team':
      return c.teamName;
  }
}

function cmp(a: number | string | null, b: number | string | null, dir: 'asc' | 'desc') {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const c = typeof a === 'string' || typeof b === 'string' ? String(a).localeCompare(String(b)) : a - b;
  return dir === 'asc' ? c : -c;
}

const signed = (v: number, d = 2) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`;

function gpLine(c: LiveClubView): string {
  return `${c.gp} GP${c.byeTaken ? ` · bye wk ${c.byeWeek}` : ''}`;
}

export function LiveLeaderboard({
  clubs,
  season,
  focusTeams = [],
}: {
  clubs: LiveClubView[];
  season: number;
  focusTeams?: string[];
}) {
  const { hot, setHot } = useLeagueLink(season);
  const [sort, setSort] = useState<{ key: SortKey; reversed: boolean }>({ key: 'rating', reversed: false });
  const dir: 'asc' | 'desc' = sort.reversed
    ? BEST_FIRST[sort.key] === 'asc'
      ? 'desc'
      : 'asc'
    : BEST_FIRST[sort.key];

  const { rows, rankBy } = useMemo(() => {
    const rankKey: SortKey = sort.key === 'team' ? 'rating' : sort.key;
    const tie = (a: LiveClubView, b: LiveClubView) => a.rank - b.rank || a.team.localeCompare(b.team);
    const best = [...clubs].sort(
      (a, b) => cmp(sortValue(a, rankKey), sortValue(b, rankKey), BEST_FIRST[rankKey]) || tie(a, b),
    );
    // Equal values share a rank (the mart's rule: ties share the lower rank).
    const rankBy = new Map<string, number>();
    best.forEach((c, i) => {
      const prev = best[i - 1];
      rankBy.set(
        c.team,
        prev && sortValue(prev, rankKey) === sortValue(c, rankKey) ? rankBy.get(prev.team)! : i + 1,
      );
    });
    const rows = [...clubs].sort(
      (a, b) =>
        cmp(sortValue(a, sort.key), sortValue(b, sort.key), dir) ||
        (dir === BEST_FIRST[sort.key] ? tie(a, b) : tie(b, a)),
    );
    return { rows, rankBy };
  }, [clubs, sort, dir]);

  const onSort = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, reversed: !s.reversed } : { key: k, reversed: false }));
  const focus = new Set(focusTeams);
  const rowEvents = (team: string) => ({
    onPointerEnter: () => setHot(team),
    onPointerLeave: () => setHot(null),
    onFocus: () => setHot(team),
    onBlur: () => setHot(null),
  });
  const rankKeyLabel = sort.key === 'team' ? SORT_LABEL.rating : SORT_LABEL[sort.key];

  return (
    <div className={lb.wrap}>
      {/* ── mobile: the row-card list ───────────────────────────────────── */}
      <div className={lb.mobileList}>
        <div className={`${lb.headRow} ${css.lbRow}`}>
          <span className={`yy-label ${lb.alignRight}`}>#</span>
          <SortButton label="Team" k="team" sort={sort} dir={dir} onSort={onSort} />
          <SortButton label="Adj. EPA" k="epa" sort={sort} dir={dir} onSort={onSort} align="right" />
          <SortButton label="Rating" k="rating" sort={sort} dir={dir} onSort={onSort} align="right" />
        </div>
        <p className={`yy-label ${lb.rankNote}`}># = rank by {rankKeyLabel}, within {season}</p>
        {rows.map((c) => (
          <Link
            key={c.team}
            href={c.href}
            className={[lb.row, css.lbRow, focus.has(c.team) ? lb.rowFocus : '', hot === c.team ? lb.rowHot : ''].join(' ')}
            {...rowEvents(c.team)}
          >
            <span className={`yy-num ${lb.rank}`}>{rankBy.get(c.team)}</span>
            <span className={lb.teamCell}>
              <span className={lb.teamName}>{c.teamName}</span>
              <span className={`yy-label ${lb.teamSub}`}>
                {c.team} · {c.record} · {gpLine(c)}
              </span>
            </span>
            <span className={`yy-num ${lb.alignRight}`}>{signed(c.epaAdj)}</span>
            <span className={css.mobRating}>
              <span className={`yy-num ${lb.index}`}>
                {c.rating.state === 'blank' ? '' : c.rating.value.toFixed(0)}
              </span>
              <LiveRatingBar rating={c.rating} withValue={false} withCover={false} />
            </span>
          </Link>
        ))}
      </div>

      {/* ── desktop: the table ──────────────────────────────────────────── */}
      <div className={lb.tableWrap}>
        <table className={lb.table}>
          <caption className="yy-visually-hidden">
            Team Rating (performance only), live, for all {clubs.length} clubs, {season} in progress. 100
            = the {season} league average. Sorted by {SORT_LABEL[sort.key]},{' '}
            {dir === BEST_FIRST[sort.key] ? 'best first' : 'worst first'}.
          </caption>
          <thead>
            <tr>
              <th scope="col" className={`yy-label-lg ${lb.numCell}`}>
                <span className={lb.rankHead}>
                  #<span className={lb.rankHeadSub}>{rankKeyLabel}</span>
                </span>
              </th>
              <th scope="col" className="yy-label-lg" aria-sort={ariaSort(sort.key, dir, 'team')}>
                <SortButton label="Team" k="team" sort={sort} dir={dir} onSort={onSort} />
              </th>
              <th scope="col" className={`yy-label-lg ${lb.numCell}`} aria-sort={ariaSort(sort.key, dir, 'record')}>
                <SortButton label="Record" k="record" sort={sort} dir={dir} onSort={onSort} align="right" />
              </th>
              <th scope="col" className={`yy-label-lg ${lb.numCell}`} aria-sort={ariaSort(sort.key, dir, 'gp')}>
                <SortButton label="GP" k="gp" sort={sort} dir={dir} onSort={onSort} align="right" />
              </th>
              <th scope="col" className={`yy-label-lg ${css.lbRating}`} aria-sort={ariaSort(sort.key, dir, 'rating')}>
                <SortButton label="Team Rating · live" k="rating" sort={sort} dir={dir} onSort={onSort} align="right" />
              </th>
              <th scope="col" className={`yy-label-lg ${lb.numCell}`} aria-sort={ariaSort(sort.key, dir, 'epa')}>
                <SortButton label="Adj. EPA margin" k="epa" sort={sort} dir={dir} onSort={onSort} align="right" />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.team}
                className={[focus.has(c.team) ? lb.rowFocus : '', hot === c.team ? lb.rowHot : ''].join(' ')}
                {...rowEvents(c.team)}
              >
                <td className={`yy-num ${lb.numCell} ${lb.rankCell}`}>{rankBy.get(c.team)}</td>
                <th scope="row">
                  <Link className={`yy-label-lg ${lb.link}`} href={c.href}>
                    {c.teamName}
                  </Link>
                </th>
                <td className={`yy-num ${lb.numCell}`}>{c.record}</td>
                <td className={`yy-num ${lb.numCell}`}>
                  {c.gp}
                  {c.byeTaken ? <span className={`yy-label ${lb.recordInline}`}> bye wk {c.byeWeek}</span> : null}
                </td>
                <td className={css.lbRating}>
                  <LiveRatingBar rating={c.rating} />
                </td>
                <td className={`yy-num ${lb.numCell}`} title={`Raw ${signed(c.epaRaw)} EPA/play`}>
                  {signed(c.epaAdj)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className={lb.key}>
        <li className={`yy-label ${lb.keyItem}`}>
          <i className={lb.keyTick} aria-hidden="true" />
          100 = the {season} league average
        </li>
        <li className={`yy-label ${lb.keyItem}`}>
          <span className={`${css.hatch}`} style={{ display: 'inline-block', width: 14, height: 10 }} aria-hidden="true" />
          Partial season — games played of {clubs[0]?.gs ?? 17}
        </li>
      </ul>
      <p className={`yy-caption ${lb.caption}`}>
        Team Rating (performance only) · live ranks 2026 clubs against each other, on win %, point
        differential per game and opponent-adjusted EPA margin through the closed week. It moves
        every week and carries no verdict. Adj. EPA margin is EPA per play on offense minus EPA per
        play allowed, adjusted for the opponents faced.
      </p>
    </div>
  );
}

function ariaSort(key: SortKey, dir: 'asc' | 'desc', k: SortKey): 'ascending' | 'descending' | 'none' {
  if (key !== k) return 'none';
  return dir === 'asc' ? 'ascending' : 'descending';
}

function SortButton({
  label,
  k,
  sort,
  dir,
  onSort,
  align,
}: {
  label: string;
  k: SortKey;
  sort: { key: SortKey };
  dir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  align?: 'right';
}) {
  const active = sort.key === k;
  return (
    <button
      type="button"
      className={`yy-label ${lb.sortBtn} ${active ? lb.sortActive : ''} ${align === 'right' ? lb.alignRight : ''}`}
      onClick={() => onSort(k)}
    >
      {label}
      {active ? (
        <svg className={lb.caret} width="8" height="6" viewBox="0 0 8 6" aria-hidden="true" fill="currentColor">
          {dir === 'asc' ? <path d="M4 0 8 6H0z" /> : <path d="M4 6 0 0h8z" />}
        </svg>
      ) : null}
    </button>
  );
}
