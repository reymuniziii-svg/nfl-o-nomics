'use client';

/**
 * The app chrome — `COMPONENTS.md` §15.
 *
 * Client-side because three things depend on where the reader is and what they
 * have chosen: the active nav/tab item (the pathname), the scrolled state of the
 * header, and the theme. Nothing else in the shell hydrates.
 *
 * `[C1]`: the mockup's `W6` week chip is REMOVED — the data is a preseason-to-
 * final snapshot, not a live week. The season chip reads `2025`, never
 * `2025 · WEEK 6`.
 */

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import css from './shell.module.css';
import { IconContract, IconRoster, IconRoute, IconTarget } from '../icons';

const TABS = [
  { href: '/', label: 'League', Icon: IconTarget },
  { href: '/division/afc-east', label: 'Teams', Icon: IconRoster, match: '/team' },
  { href: '/player', label: 'Players', Icon: IconContract },
  { href: '/compare', label: 'Compare', Icon: IconRoute },
] as const;

function isActive(pathname: string, href: string, match?: string): boolean {
  if (href === '/') return pathname === '/';
  if (match && pathname.startsWith(match)) return true;
  return pathname.startsWith(href.split('?')[0]);
}

export function AppHeader({ eyebrow, season }: { eyebrow: string; season?: number }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`${css.header} ${scrolled ? css.headerScrolled : ''}`}>
      <Link className={css.brand} href="/">
        <span className={css.wordmark}>
          YIELD<span className={css.slash}>/</span>YARD
        </span>
        <span className={`yy-label ${css.eyebrow}`}>{eyebrow}</span>
      </Link>

      <nav className={css.nav} aria-label="Primary">
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className={`yy-label-lg ${css.navItem} ${
              isActive(pathname, t.href, 'match' in t ? t.match : undefined) ? css.navActive : ''
            }`}
          >
            {t.label}
          </Link>
        ))}
        <Link
          href="/methodology"
          className={`yy-label-lg ${css.navItem} ${
            pathname.startsWith('/methodology') ? css.navActive : ''
          }`}
        >
          Methodology
        </Link>
      </nav>

      <div className={css.headerRight}>
        {season ? <span className={`yy-label ${css.seasonChip}`}>{season}</span> : null}
        <ThemeToggle />
      </div>
    </header>
  );
}

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className={css.tabbar} aria-label="Sections">
      {TABS.map(({ href, label, Icon, ...rest }) => {
        const active = isActive(pathname, href, 'match' in rest ? rest.match : undefined);
        return (
          <Link
            key={href}
            href={href}
            className={`yy-label-lg ${css.tab} ${active ? css.tabActive : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className={css.tabIcon}>
              <Icon size={24} />
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * `COMPONENTS.md` §15.3 — a theme toggle sets `data-theme` on `<html>`; absent
 * that attribute, `prefers-color-scheme` decides. There is no third state and no
 * per-component theme override.
 */
/** `data-theme` on `<html>` is the source of truth, so it is read as EXTERNAL
 *  state rather than mirrored into React — the bootstrap script sets it before
 *  first paint and React must not fight it. */
function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribeTheme,
    () => document.documentElement.getAttribute('data-theme'),
    () => null,
  );

  function flip() {
    const next =
      theme === 'light'
        ? 'dark'
        : theme === 'dark'
          ? 'light'
          : window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'dark'
            : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try {
      window.localStorage.setItem('yy-theme', next);
    } catch {
      /* storage is not available; the attribute still applies for this session */
    }
  }

  return (
    <button type="button" className={`yy-label ${css.themeBtn}`} onClick={flip}>
      {theme === 'light' ? 'Dark' : 'Light'}
    </button>
  );
}
