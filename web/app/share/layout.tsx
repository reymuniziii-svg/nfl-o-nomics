import type { Metadata } from 'next';
import css from './share.module.css';

/**
 * `/share/*` — the bare card surfaces. No site chrome, no developer notes: the
 * page is the card. The root layout owns the chrome, so this segment marks its
 * subtree and `share.module.css` hides the header, footer and tab bar for any
 * page that carries the mark (`:has()`), leaving every other route untouched.
 *
 * These are duplicates of the canonical team/division pages, so they are kept
 * out of the index; the canonical page is what a share link should point at.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function ShareLayout({ children }: { children: React.ReactNode }) {
  return <div className={css.shareRoot}>{children}</div>;
}
