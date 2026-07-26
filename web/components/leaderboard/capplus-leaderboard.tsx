'use client';

/**
 * `CapPlusLeaderboard` — `COMPONENTS.md` §2, `SPEC.md` §3.1.3.
 *
 * **All 32 rows. Not a top-10.** No pagination, no "show more", no
 * virtualisation: 32 rows is 1.5 screens, and a "load more" on a 32-item list is
 * chrome pretending to be a feature.
 *
 * Two compositions, one dataset: the row-card list at 390 and the real table at
 * 1024+. Sorting never removes rows — teams whose index is `blank` sort to a
 * **labelled group at the bottom** headed `NOT COVERED — {reason}`, never
 * interleaved and never sorted as zero.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import css from './leaderboard.module.css';
import { FranchiseSparkline } from '../charts/franchise-sparkline';
import { indexBand, usdShort } from '@/lib/display';
import type { Metric } from '@/lib/metric';
import type { SparkPoint } from '@/lib/data/league';

export interface LeaderboardViewRow {
  team: string;
  teamName: string;
  record: string;
  wins: number;
  rank: number | null;
  index: Metric<number>;
  spend: Metric<number>;
  /** `null` by the ZERO-WIN RULE — the ratio is suppressed, never Infinity. */
  perWin: Metric<number>;
  delta5y: Metric<number>;
  href: string;
  spark: SparkPoint[];
}

type SortKey = 'rank' | 'team' | 'spend' | 'wins' | 'perWin' | 'index' | 'delta5y';

const NUMERIC: Record<SortKey, boolean> = {
  rank: true,
  team: false,
  spend: true,
  wins: true,
  perWin: true,
  index: true,
  delta5y: true,
};

function sortValue(row: LeaderboardViewRow, key: SortKey): number | string | null {
  switch (key) {
    case 'rank':
      return row.rank;
    case 'team':
      return row.teamName;
    case 'wins':
      return row.wins;
    case 'spend':
      return row.spend.state === 'blank' ? null : row.spend.value;
    case 'perWin':
      return row.perWin.state === 'blank' ? null : row.perWin.value;
    case 'index':
      return row.index.state === 'blank' ? null : row.index.value;
    case 'delta5y':
      return row.delta5y.state === 'blank' ? null : row.delta5y.value;
  }
}

export function CapPlusLeaderboard({
  rows,
  season,
  indexName,
  isCapPlus,
  focusTeams = [],
  csvSlot,
}: {
  rows: LeaderboardViewRow[];
  season: number;
  indexName: string;
  isCapPlus: boolean;
  focusTeams?: string[];
  csvSlot?: React.ReactNode;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'rank',
    dir: 'asc',
  });

  const { live, blanked } = useMemo(() => {
    const withIndex = rows.filter((r) => r.index.state !== 'blank');
    const withoutIndex = rows.filter((r) => r.index.state === 'blank');
    const sorted = [...withIndex].sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp =
        typeof av === 'string' || typeof bv === 'string'
          ? String(av).localeCompare(String(bv))
          : (av as number) - (bv as number);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return { live: sorted, blanked: withoutIndex };
  }, [rows, sort]);

  function toggle(key: SortKey) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: NUMERIC[key] && key !== 'rank' ? 'desc' : 'asc' },
    );
  }

  const blankReason =
    blanked.length && blanked[0].index.state === 'blank' ? blanked[0].index.reason : '';

  const focus = new Set(focusTeams);
  const maxSpend = Math.max(
    1,
    ...rows.map((r) => (r.spend.state === 'blank' ? 0 : r.spend.value)),
  );
  const maxWins = Math.max(1, ...rows.map((r) => r.wins));

  /**
   * `SPEC.md` §1.2 / `CHART_ANATOMY.md` §5.2: a blank renders its reason, and a
   * blank with no visible reason is a bug. When the whole Δ 5Y column is blank
   * — which is the launch state, because 2025 − 5 = 2020 and 2020 Cap+ was
   * never published — the reason belongs once beneath the table rather than 32
   * times inside it. The per-cell short form still carries it as accessible
   * text, so nothing is lost to a screen reader.
   */
  const delta5yReasons = [
    ...new Set(rows.map((r) => (r.delta5y.state === 'blank' ? r.delta5y.reason : '')).filter(Boolean)),
  ];
  const allDelta5yBlank = rows.length > 0 && rows.every((r) => r.delta5y.state === 'blank');

  return (
    <div className={css.wrap}>
      {/* ── mobile: the row-card list ─────────────────────────────────────── */}
      <div className={css.mobileList}>
        <div className={css.headRow}>
          <SortHeader label="#" sortKey="rank" sort={sort} onSort={toggle} align="right" />
          <SortHeader label="Team" sortKey="team" sort={sort} onSort={toggle} />
          {/* `SPEC.md` §2.1 — the product never says "spend" without saying
            which lens. This card is cash, and the column says so. */}
          <span className={`yy-label ${css.alignRight}`}>Cash → wins</span>
          <SortHeader
            label={isCapPlus ? 'Cap+' : 'Rating'}
            sortKey="index"
            sort={sort}
            onSort={toggle}
            align="right"
          />
        </div>

        {live.map((r) => (
          <Link
            key={r.team}
            href={r.href}
            className={`${css.row} ${focus.has(r.team) ? css.rowFocus : ''}`}
          >
            <span
              className={`yy-num ${css.rank} ${r.rank !== null && r.rank <= 3 && isCapPlus ? css.rankTop : ''}`}
            >
              {r.rank ?? '—'}
            </span>
            <span className={css.teamCell}>
              <span className={css.teamText}>
                <span className={css.teamName}>{r.teamName}</span>
                <span className={`yy-label ${css.teamSub}`}>
                  {r.team} ·{' '}
                  {r.perWin.state === 'blank' ? 'no ratio' : `${usdShort(r.perWin.value)}/win`} ·{' '}
                  {r.wins}W
                </span>
              </span>
            </span>
            <span className={css.pair} aria-hidden="true">
              <span className={css.track}>
                <span
                  className={css.trackFill}
                  style={{
                    width: `${((r.spend.state === 'blank' ? 0 : r.spend.value) / maxSpend) * 100}%`,
                  }}
                />
              </span>
              <span className={css.track}>
                <span
                  className={`${css.trackFill} ${bandClass(r.index, isCapPlus, 'wins')}`}
                  style={{ width: `${(r.wins / maxWins) * 100}%` }}
                />
              </span>
            </span>
            <span className={`yy-num ${css.index} ${bandClass(r.index, isCapPlus, 'index')}`}>
              {r.index.state === 'blank' ? (
                <BlankCell reason={r.index.reason} short="Not covered" />
              ) : (
                r.index.value.toFixed(0)
              )}
            </span>
          </Link>
        ))}

        {blanked.length ? (
          <>
            <p className={`yy-label ${css.blankGroup}`}>Not covered — {blanked.length} clubs</p>
            <p className={`yy-caption ${css.blankReason}`}>{blankReason}</p>
            {blanked.map((r) => (
              <Link key={r.team} href={r.href} className={css.row}>
                {/* The rank is genuinely absent, not zero: a club with no index
                  is excluded from the ordering, not sorted to an extreme. It is
                  named by the group heading directly above. */}
                <span className={`yy-label ${css.rank}`} aria-hidden="true">
                  —
                </span>
                <span className={css.teamCell}>
                  <span className={css.teamText}>
                    <span className={css.teamName}>{r.teamName}</span>
                    <span className={`yy-label ${css.teamSub}`}>
                      {r.team} · {r.record}
                    </span>
                  </span>
                </span>
                <span />
                <span className={`yy-label ${css.indexBlank}`}>
                  {r.index.state === 'blank' ? (
                    <BlankCell reason={r.index.reason} short="Not covered" />
                  ) : null}
                </span>
              </Link>
            ))}
          </>
        ) : null}
      </div>

      {/* ── desktop: the real table ───────────────────────────────────────── */}
      <div className={css.tableWrap}>
        <table className={css.table}>
          <caption className="yy-visually-hidden">
            {indexName} for all 32 clubs, {season}. 100 is league average.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="yy-label-lg" aria-sort={ariaSort(sort, 'rank')}>
                <SortHeader label="#" sortKey="rank" sort={sort} onSort={toggle} />
              </th>
              <th scope="col" className="yy-label-lg" aria-sort={ariaSort(sort, 'team')}>
                <SortHeader label="Team" sortKey="team" sort={sort} onSort={toggle} />
              </th>
              <th scope="col" className="yy-label-lg">
                Trend
              </th>
              {/* `SPEC.md` §2.1 — the lens is named in the column head, not
                assumed from a neighbouring card. */}
              <th scope="col" className={`yy-label-lg ${css.numCell}`} aria-sort={ariaSort(sort, 'spend')}>
                <SortHeader label="Cash spent" sortKey="spend" sort={sort} onSort={toggle} align="right" />
              </th>
              <th scope="col" className={`yy-label-lg ${css.numCell}`} aria-sort={ariaSort(sort, 'wins')}>
                <SortHeader label="Wins" sortKey="wins" sort={sort} onSort={toggle} align="right" />
              </th>
              <th scope="col" className={`yy-label-lg ${css.numCell}`} aria-sort={ariaSort(sort, 'perWin')}>
                <SortHeader label="$/win (cash)" sortKey="perWin" sort={sort} onSort={toggle} align="right" />
              </th>
              <th scope="col" className={`yy-label-lg ${css.numCell}`} aria-sort={ariaSort(sort, 'index')}>
                <SortHeader
                  label={isCapPlus ? 'Cap+' : 'Rating'}
                  sortKey="index"
                  sort={sort}
                  onSort={toggle}
                  align="right"
                />
              </th>
              <th scope="col" className={`yy-label-lg ${css.numCell}`} aria-sort={ariaSort(sort, 'delta5y')}>
                <SortHeader label="Δ 5Y" sortKey="delta5y" sort={sort} onSort={toggle} align="right" />
              </th>
            </tr>
          </thead>
          <tbody>
            {live.map((r) => (
              <tr key={r.team} className={focus.has(r.team) ? css.rowFocus : undefined}>
                <td className={`yy-num ${css.numCell}`}>{r.rank ?? '—'}</td>
                <th scope="row">
                  <Link className={`yy-label-lg ${css.link}`} href={r.href}>
                    {r.teamName}
                  </Link>
                </th>
                <td>
                  <FranchiseSparkline series={r.spark} label={r.teamName} />
                </td>
                <td className={`yy-num ${css.numCell}`}>
                  {r.spend.state === 'blank' ? (
                    <span className="yy-label">Not covered</span>
                  ) : (
                    usdShort(r.spend.value)
                  )}
                </td>
                <td className={`yy-num ${css.numCell}`}>{r.wins}</td>
                <td className={`yy-num ${css.numCell}`}>
                  {r.perWin.state === 'blank' ? (
                    <span className="yy-label">Ratio suppressed</span>
                  ) : (
                    usdShort(r.perWin.value)
                  )}
                </td>
                <td className={`yy-num ${css.numCell} ${bandClass(r.index, isCapPlus, 'index')}`}>
                  {r.index.state === 'blank' ? (
                    <BlankCell reason={r.index.reason} short="Not covered" />
                  ) : (
                    r.index.value.toFixed(1)
                  )}
                </td>
                <td className={`yy-num ${css.numCell}`}>
                  {r.delta5y.state === 'blank' ? (
                    <BlankCell reason={r.delta5y.reason} short="Not covered" />
                  ) : (
                    `${r.delta5y.value > 0 ? '+' : r.delta5y.value < 0 ? '−' : ''}${Math.abs(
                      r.delta5y.value,
                    ).toFixed(1)}`
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {blanked.length ? (
          <>
            <p className={`yy-label ${css.blankGroup}`}>Not covered — {blanked.length} clubs</p>
            <p className={`yy-caption ${css.blankReason}`}>{blankReason}</p>
          </>
        ) : null}
      </div>

      {/* Every blank on this card renders its reason. When one is true of the
        whole column it is said once, in full, rather than 32 times. */}
      {allDelta5yBlank ? (
        <p className={`yy-caption ${css.blankReason}`}>{delta5yReasons.join(' ')}</p>
      ) : null}

      {/* §2.1 — the lens caveat travels with the figures it qualifies. This card
        offers one lens by design and says which, and says what it leaves out. */}
      <p className={`yy-caption ${css.caption}`}>
        Cash · roster only — cash to players on the roster, the same lens the cost-per-win card
        above uses. Cash paid to players released in-year is not included, and this card offers no
        cap-hit alternative: the leaderboard is cash-only by design.
      </p>
      {/* `CAPPLUS_LOCKUP.md` §3.5 — the `100 = LEAGUE AVERAGE` lockup line now
        renders in the card's header row, beside the title, where the reader
        meets it before the column rather than four screens after it. What stays
        here is the thing the lockup does not say: what the index is not. */}
      <p className={`yy-caption ${css.caption}`}>
        {indexName} is a season-relative index, not a front-office grade.
      </p>
      {csvSlot}
    </div>
  );
}

/**
 * A cell whose metric is `blank`. `COMPONENTS.md` universal rule 3: there is no
 * code path that renders an empty cell, a dash or a zero. The short form is
 * visible and the full reason is the cell's accessible text, so nothing is left
 * to a tooltip.
 *
 * The glyph vocabulary (`⊟`) is deliberately NOT used: none of the three shipped
 * faces carries it and a character that falls back to tofu is not a label
 * (`COMPONENTS.md` §5, legend swatches).
 */
function BlankCell({ reason, short }: { reason: string; short: string }) {
  return (
    <span className={`yy-label ${css.blankCell}`}>
      {short}
      <span className="yy-visually-hidden"> — {reason}</span>
    </span>
  );
}

function bandClass(index: Metric<number>, isCapPlus: boolean, kind: 'index' | 'wins') {
  if (index.state === 'blank') return kind === 'index' ? css.indexBlank : '';
  if (!isCapPlus) return kind === 'index' ? css.indexNeutral : '';
  const band = indexBand(index.value);
  if (kind === 'wins') {
    return band === 'above' ? css.winsAbove : band === 'mid' ? css.winsMid : css.winsBelow;
  }
  return band === 'above' ? css.indexAbove : band === 'mid' ? css.indexMid : css.indexBelow;
}

function ariaSort(
  sort: { key: SortKey; dir: 'asc' | 'desc' },
  key: SortKey,
): 'ascending' | 'descending' | 'none' {
  if (sort.key !== key) return 'none';
  return sort.dir === 'asc' ? 'ascending' : 'descending';
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' };
  onSort: (k: SortKey) => void;
  align?: 'right';
}) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      className={`yy-label ${css.sortBtn} ${active ? css.sortActive : ''} ${
        align === 'right' ? css.alignRight : ''
      }`}
      onClick={() => onSort(sortKey)}
    >
      {label}
      {active ? (
        <svg
          className={css.caret}
          width="8"
          height="6"
          viewBox="0 0 8 6"
          aria-hidden="true"
          fill="currentColor"
        >
          {sort.dir === 'asc' ? <path d="M4 0 8 6H0z" /> : <path d="M4 6 0 0h8z" />}
        </svg>
      ) : null}
    </button>
  );
}
