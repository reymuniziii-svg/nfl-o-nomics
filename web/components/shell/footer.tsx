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
}: {
  stamp: BuildStamp;
  deadMoneyTier: string;
  logosEnabled: boolean;
}) {
  return (
    <footer className={css.footer}>
      <nav className={css.footerLinks} aria-label="Secondary">
        <Link className={`yy-label ${css.footerLink}`} href="/methodology">
          Methodology
        </Link>
        <Link className={`yy-label ${css.footerLink}`} href="/credits">
          Credits &amp; image licences
        </Link>
        <Link className={`yy-label ${css.footerLink}`} href="/division/afc-east">
          Divisions
        </Link>
        <Link className={`yy-label ${css.footerLink}`} href="/compare">
          Compare
        </Link>
      </nav>

      <p className={`yy-caption ${css.footerNote}`}>
        Every number here was computed offline from published sources and read back from a mart.
        Nothing is computed at request time. Where a figure does not exist, this product says so
        and leaves it blank — it is never estimated to fill a gap.
      </p>

      <p className={`yy-label ${css.stamp}`}>
        Snapshot: {stamp.tables_seeded ?? 0} marts ·{' '}
        {(stamp.rows_total ?? 0).toLocaleString('en-US')} rows
        {stamp.tables_skipped ? ` · ${stamp.tables_skipped} not in this snapshot` : ''} · dead-money
        tier {stamp.dead_money_tier ?? deadMoneyTier} · TeamMark{' '}
        {logosEnabled ? 'on' : 'off (typographic fallback)'}
      </p>
    </footer>
  );
}
