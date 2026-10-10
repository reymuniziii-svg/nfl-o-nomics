/**
 * The home page's dead-money ledger — `SPEC.md` §3.1 item 4.
 *
 * Built for this surface rather than reusing the team page's ledger table,
 * after the 2026-10-10 review (B.7): the split printed raw integers
 * ("SPLIT: 55400000/43800000") and "Verified" appeared three times a row.
 *
 *   - Each season's charge leads as a SHARE OF THAT SEASON'S CAP, dollars
 *     second: the cap was $123M in 2013 and $279M in 2025, so raw dollars make
 *     every recent charge look like the worst ever. The share is the published
 *     charge over the published cap — never an inferred split.
 *   - A season with no published cap in this snapshot (2026–27) says so and
 *     keeps its dollars; it is never estimated.
 *   - One standing chip per row: VERIFIED, or EST for a projection.
 *   - The as-of date rides on the same line as the total (`COMPONENTS.md` §8.1).
 *
 * A server component: nothing here moves.
 */

import css from './ledger-board.module.css';
import { usdShort } from '@/lib/display';
import type { Metric } from '@/lib/metric';
import type { LedgerCharge } from '@/lib/data';

/** Bars share one fixed domain: 0–25% of a season's cap. No charge exceeds it. */
const SHARE_MAX = 0.25;

export function seasonsOf(seasons: string): number[] {
  const m = seasons.match(/^(\d{4})(?:\s*[-–]\s*(\d{4}))?$/);
  if (!m) return [];
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

interface SeasonCharge {
  season: number;
  usd: number;
  share: number | null;
  capReason: string | null;
}

function chargesOf(c: LedgerCharge, caps: Map<number, Metric<number>>): SeasonCharge[] | null {
  const seasons = seasonsOf(c.seasons);
  if (!c.splitBySeason) return null;
  const parts = c.splitBySeason.split('/').map((x) => Number(x.trim()));
  if (parts.length !== seasons.length || parts.some((x) => !Number.isFinite(x))) return null;
  return seasons.map((season, i) => {
    const cap = caps.get(season);
    const known = cap && cap.state !== 'blank' ? cap.value : null;
    return {
      season,
      usd: parts[i],
      share: known ? parts[i] / known : null,
      capReason: known ? null : `no ${season} cap in this snapshot`,
    };
  });
}

export function LedgerBoard({
  rows,
  caps,
}: {
  rows: LedgerCharge[];
  caps: Map<number, Metric<number>>;
}) {
  return (
    <ol className={css.list}>
      {rows.map((c) => {
        const charges = chargesOf(c, caps);
        return (
          <li key={`${c.player}-${c.seasons}`} className={`${css.item} ${c.isActual ? '' : css.itemEst}`}>
            <div className={css.head}>
              <span className={css.player}>{c.player}</span>
              <span className={`yy-label ${css.meta}`}>
                {c.team} · {c.seasons}
              </span>
              <span className={`${css.chip} ${c.isActual ? css.chipVerified : css.chipEst}`}>
                {c.isActual ? 'Verified actual' : 'EST'}
              </span>
            </div>

            {charges ? (
              <ul className={css.seasons}>
                {charges.map((s) => (
                  <li key={s.season} className={css.season}>
                    <span className={`yy-label ${css.seasonYear}`}>{s.season}</span>
                    <span className={css.track} aria-hidden="true">
                      {s.share !== null ? (
                        <span
                          className={css.fill}
                          style={{ width: `${Math.min(100, (s.share / SHARE_MAX) * 100)}%` }}
                        />
                      ) : (
                        <span className={css.trackBlank} />
                      )}
                    </span>
                    <span className={css.figure}>
                      {s.share !== null ? (
                        <>
                          <span className={`yy-num ${css.pct}`}>{(s.share * 100).toFixed(1)}%</span>
                          <span className={`yy-label ${css.usd}`}>of cap · {usdShort(s.usd)}</span>
                        </>
                      ) : (
                        <>
                          <span className={`yy-num ${css.pctBlank}`}>{usdShort(s.usd)}</span>
                          <span className={`yy-label ${css.usd}`}>share n/a · {s.capReason}</span>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              /* NEVER AN INFERRED SPLIT (`SPEC.md` §2.7). */
              <p className={`yy-caption ${css.noSplit}`}>
                Per-season split not established — the total is not divided across seasons.
              </p>
            )}

            <div className={css.foot}>
              <span className={css.total}>
                <span className="yy-num">{usdShort(c.totalUsd)}</span>
                <span className={`yy-label ${css.stamp}`}> total · as of {c.verifiedAsof}</span>
              </span>
              <a className={`yy-label ${css.source}`} href={c.sourceUrl} rel="noopener noreferrer" target="_blank">
                Source ↗
              </a>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
