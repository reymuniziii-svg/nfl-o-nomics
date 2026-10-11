/**
 * The footer. `ARCHITECTURE.md` §7 item 5: the seed manifest renders as a build
 * stamp so any screenshot is traceable to a data version.
 *
 * The credits link is not optional — 223 of 244 photo assets legally require
 * visible attribution, and `/credits` is where the full roll lives
 * (`SPEC.md` §5.2).
 */

import Link from 'next/link';
import css from './shell.module.css';
import type { BuildStamp } from '@/lib/data';

export function AppFooter({
  stamp,
  deadMoneyTier,
  logosEnabled,
  live = null,
}: {
  stamp: BuildStamp;
  deadMoneyTier: string;
  logosEnabled: boolean;
  /** The live tier's as-of (DECISIONS 116): week, data date, short pbp hash, money date. */
  live?: { season: number; week: number; date: string | null; pbp: string; money: string | null } | null;
}) {
  return (
    <footer className={css.footer}>
      <nav className={css.footerLinks} aria-label="Secondary">
        <Link className={`yy-label ${css.footerLink}`} href="/methodology">
          Methodology
        </Link>
        <Link className={`yy-label ${css.footerLink}`} href="/credits">
          Credits &amp; image licenses
        </Link>
        <Link className={`yy-label ${css.footerLink}`} href="/division/afc-east">
          Divisions
        </Link>
        <Link className={`yy-label ${css.footerLink}`} href="/compare">
          Compare
        </Link>
      </nav>

      <p className={`yy-caption ${css.footerNote}`}>
        Every number here was computed offline from published sources and read back from a stored
        table. Nothing is computed when you load a page. Where a figure does not exist, we say so
        and leave it blank. We never estimate to fill a gap.
      </p>

      <p className={`yy-label ${css.stamp}`}>
        Data snapshot: {stamp.tables_seeded ?? 0} tables ·{' '}
        {(stamp.rows_total ?? 0).toLocaleString('en-US')} rows
        {stamp.tables_skipped ? ` · ${stamp.tables_skipped} not in this snapshot` : ''} · dead-money
        sources {stamp.dead_money_tier ?? deadMoneyTier} · team logos{' '}
        {logosEnabled ? 'on' : 'off (typographic fallback)'}
      </p>
      {live ? (
        <p className={`yy-label ${css.stamp}`}>
          Live {live.season}: as of week {live.week}
          {live.date ? ` · through ${live.date}` : ''} · pbp {live.pbp} · money{' '}
          {live.money ? `as of ${live.money}` : 'none (performance only)'}
        </p>
      ) : null}
    </footer>
  );
}
