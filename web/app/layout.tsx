import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { getBuildStamp, type BuildStamp } from '@/lib/data';
import { DEAD_MONEY_TIER, TEAM_LOGOS_ENABLED } from '@/lib/flags';

export const metadata: Metadata = {
  title: {
    default: 'YIELD/YARD',
    template: '%s · YIELD/YARD',
  },
  description:
    'NFL team economics, 1999–2025: what a team spent, what it got, and where the record stops.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The seed manifest renders as a build stamp so any screenshot is traceable to
  // a data version (`ARCHITECTURE.md` §7 item 5).
  const stamp = await getBuildStamp().catch((): BuildStamp => ({}));

  return (
    <html lang="en">
      <body>
        <header className="yy-chrome">
          <nav aria-label="Primary">
            <Link href="/">YIELD/YARD</Link>
            <Link href="/division/afc-east">Divisions</Link>
            <Link href="/compare">Compare</Link>
            <Link href="/methodology">Methodology</Link>
            <Link href="/credits">Credits</Link>
          </nav>
        </header>

        <main className="yy-page">{children}</main>

        <footer className="yy-footer">
          <p>
            Data snapshot: {stamp.tables_seeded ?? 0} marts,{' '}
            {(stamp.rows_total ?? 0).toLocaleString()} rows
            {stamp.tables_skipped ? ` · ${stamp.tables_skipped} mart(s) not in this snapshot` : ''} ·
            dead-money tier {stamp.dead_money_tier ?? DEAD_MONEY_TIER} · TeamMark{' '}
            {TEAM_LOGOS_ENABLED ? 'on' : 'off (typographic fallback)'}
          </p>
          <p>
            Every number here was computed offline from published sources and read back from a
            mart. Nothing is computed at request time.
          </p>
        </footer>
      </body>
    </html>
  );
}
