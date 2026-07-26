import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppHeader, TabBar } from '@/components/shell/chrome';
import { AppFooter } from '@/components/shell/footer';
import { getBuildStamp, latestSeason, type BuildStamp } from '@/lib/data';
import { DEAD_MONEY_TIER, TEAM_LOGOS_ENABLED } from '@/lib/flags';

export const metadata: Metadata = {
  title: {
    default: 'YIELD/YARD',
    template: '%s · YIELD/YARD',
  },
  description:
    'NFL team economics, 1999–2025: what a team spent, what it got, and where the record stops.',
  icons: { icon: '/brand/monogram.svg' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  /**
   * The one literal colour in the app, and it cannot be anything else: the
   * browser paints its own chrome from this meta tag before any stylesheet
   * loads, so it takes no custom property. It is `--yy-surface-app`, the dark
   * flagship's page ground.
   */
  themeColor: '#0B0D0E',
};

/**
 * Pin the theme before first paint, ALWAYS EXPLICITLY.
 *
 * `COMPONENTS.md` §15.3: a toggle sets `data-theme` on `<html>`; absent that
 * attribute, `prefers-color-scheme` decides. This script resolves the second
 * case into the first, which matters for one specific reason:
 * `SCREENSHOT_VARIANTS.md` §7 step 2 requires every export to carry an
 * **explicit** `data-theme`, "never inherited". `tokens.css` §27 pairs
 * `.yy-export` with `[data-theme="light"]` only — a reader whose OS is light
 * but who has no attribute set would get the export's dark card surfaces under
 * light-theme ink, which is unreadable. Resolving the preference into the
 * attribute at boot closes that gap without touching the token file.
 *
 * The OS preference is still followed: the media listener keeps the attribute
 * in step until the reader makes a choice of their own, which is what the
 * stored value records.
 */
const THEME_BOOTSTRAP = [
  '(function(){var d=document.documentElement;var m=matchMedia("(prefers-color-scheme: light)");',
  'function stored(){try{return localStorage.getItem("yy-theme")}catch(e){return null}}',
  'function apply(){var t=stored();d.setAttribute("data-theme",t==="dark"||t==="light"?t:(m.matches?"light":"dark"))}',
  'apply();m.addEventListener("change",function(){if(!stored())apply()})})();',
].join('');

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The seed manifest renders as a build stamp so any screenshot is traceable to
  // a data version (`ARCHITECTURE.md` §7 item 5).
  const [stamp, season] = await Promise.all([
    getBuildStamp().catch((): BuildStamp => ({})),
    latestSeason().catch(() => 2025),
  ]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>
        <div className="yy-app">
          <AppHeader eyebrow="What a win costs" season={season} />
          <main className="yy-page">{children}</main>
          <AppFooter
            stamp={stamp}
            deadMoneyTier={DEAD_MONEY_TIER}
            logosEnabled={TEAM_LOGOS_ENABLED}
          />
          <TabBar />
        </div>
      </body>
    </html>
  );
}
