'use client';

/**
 * The shared state of the home / division view's linked surfaces — the
 * frontier, the league Field and the leaderboard.
 *
 *   review  — the Review control: which published index places the clubs.
 *   season  — the scrubbed season the Field and the frontier show.
 *   hot     — the club under the reader's pointer or focus, lit on every
 *             surface at once (`2026-10-10-existing-review.md` D #7).
 *
 * Plus `useUrlParam`, the one way a control on these static pages writes its
 * state into the address bar (`?sort=cpw&n=cap`) without opting the route out
 * of static rendering: it reads `location.search` after hydration and writes
 * with `history.replaceState`, which the App Router observes.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CAPPLUS_QB_NEUTRAL_LABEL } from '@/lib/metric';

/**
 * Two modes. The obligation candidate was retired 2026-10-10 (`DECISIONS.md`
 * 111): a stale `?review=obl` falls back to Raw like any unknown value.
 */
export type ReviewMode = 'raw' | 'qbn';

export const REVIEW_MODES: ReviewMode[] = ['raw', 'qbn'];

/** Control labels — short, because they sit in a segmented control at 375. */
export const REVIEW_SHORT: Record<ReviewMode, string> = {
  raw: 'Raw',
  qbn: 'QB-neutral',
};

/** The index's name wherever it is printed. */
export const REVIEW_NAME: Record<ReviewMode, string> = {
  raw: 'Cap+',
  qbn: CAPPLUS_QB_NEUTRAL_LABEL,
};

export type Numerator = 'cash' | 'cap';
export const NUMERATORS: Numerator[] = ['cash', 'cap'];

interface LinkState {
  /** The cost-per-win lens, shared by the hero card and the leaderboard: `?n=cap`. */
  numerator: Numerator;
  setNumerator: (n: Numerator) => void;
  review: ReviewMode;
  setReview: (m: ReviewMode) => void;
  season: number;
  setSeason: (s: number) => void;
  hot: string | null;
  setHot: (t: string | null) => void;
}

const Ctx = createContext<LinkState | null>(null);

export function LeagueLinkProvider({
  initialSeason,
  children,
}: {
  initialSeason: number;
  children: ReactNode;
}) {
  const [review, setReviewState] = useUrlParam<ReviewMode>('review', 'raw', REVIEW_MODES);
  const [numerator, setNumerator] = useUrlParam<Numerator>('n', 'cash', NUMERATORS);
  const [season, setSeason] = useState(initialSeason);
  const [hot, setHot] = useState<string | null>(null);
  const setReview = useCallback((m: ReviewMode) => setReviewState(m), [setReviewState]);
  const v = useMemo(
    () => ({ numerator, setNumerator, review, setReview, season, setSeason, hot, setHot }),
    [numerator, setNumerator, review, setReview, season, hot],
  );
  return <Ctx.Provider value={v}>{children}</Ctx.Provider>;
}

/** True inside a provider — lets a component that also lives elsewhere keep local state there. */
export function useHasLeagueLink(): boolean {
  return useContext(Ctx) !== null;
}

/** Outside a provider every surface still renders: raw, latest, nothing lit. */
export function useLeagueLink(fallbackSeason: number): LinkState {
  const v = useContext(Ctx);
  return (
    v ?? {
      numerator: 'cash',
      setNumerator: () => {},
      review: 'raw',
      setReview: () => {},
      season: fallbackSeason,
      setSeason: () => {},
      hot: null,
      setHot: () => {},
    }
  );
}

/**
 * One query parameter as React state. The server render and the first client
 * render use `fallback` (the page is static); the URL is read after hydration.
 * The default value is removed from the URL rather than written into it.
 */
export function useUrlParam<T extends string>(
  key: string,
  fallback: T,
  allowed: readonly T[],
): [T, (v: T) => void] {
  const [val, setVal] = useState<T>(fallback);

  useEffect(() => {
    const read = () => {
      const raw = new URLSearchParams(window.location.search).get(key);
      setVal(raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
    // `allowed` is a module constant at every call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fallback]);

  const set = useCallback(
    (v: T) => {
      setVal(v);
      const url = new URL(window.location.href);
      if (v === fallback) url.searchParams.delete(key);
      else url.searchParams.set(key, v);
      window.history.replaceState(window.history.state, '', url);
    },
    [key, fallback],
  );

  return [val, set];
}
