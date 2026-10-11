'use client';

/**
 * The final | live switch on the home and division views (DECISIONS 116,
 * plan §4 "Home"), and the frames it swaps.
 *
 * `2025 FINAL | 2026 · WK 4 LIVE` is a segmented control, not another stop on
 * the season scrubber: live is a different KIND of reading, not the next
 * season. It writes `?season=live` through the shared link state; `/` without
 * it still lands on the last complete season (SPEC §3.1).
 *
 * `ModeFrames` renders BOTH frames on the server and shows one. A switch
 * cross-fades over `--yy-dur-fast` (CHART_ANATOMY §6.1): the two frames are
 * separate DOM trees on different domains, so no mark ever travels from a final
 * position to a live one. Reduced motion collapses the duration to 1ms through
 * the tokens. Nothing animates on first paint or when the URL is read after
 * hydration.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import css from './live.module.css';
import { Segmented } from '../field/season-scrubber';
import { SEASON_MODES, useLeagueLink, type SeasonMode } from '../leaderboard/league-link';

export function SeasonModeSwitch({
  finalSeason,
  liveSeason,
  liveWeek,
  label = 'Season',
  note,
}: {
  finalSeason: number;
  liveSeason: number;
  liveWeek: number;
  label?: string;
  /** One line beside the control, per mode. */
  note?: Partial<Record<SeasonMode, string>>;
}) {
  const { mode, setMode, liveAvailable } = useLeagueLink(finalSeason);
  if (!liveAvailable) return null;
  const names: Record<SeasonMode, string> = {
    final: `${finalSeason} Final`,
    live: liveWeek > 0 ? `${liveSeason} · Wk ${liveWeek} Live` : `${liveSeason} · Live`,
  };
  return (
    <div className={css.modeBar}>
      <Segmented
        options={SEASON_MODES}
        value={mode}
        onChange={setMode}
        label={`${label}: the ${finalSeason} final season or ${liveSeason} in progress`}
        names={names}
      />
      {note?.[mode] ? <p className={`yy-caption ${css.modeNote}`}>{note[mode]}</p> : null}
    </div>
  );
}

export function ModeFrames({ final, live }: { final: ReactNode; live: ReactNode }) {
  const { mode } = useLeagueLink(0);
  const [shown, setShown] = useState<SeasonMode>(mode);
  const [leaving, setLeaving] = useState<SeasonMode | null>(null);
  const mountedAt = useRef<number | null>(null);

  useEffect(() => {
    mountedAt.current = performance.now();
  }, []);

  useEffect(() => {
    if (mode === shown) return;
    // The URL is read just after hydration: that first swap paints, never fades.
    const settling = mountedAt.current === null || performance.now() - mountedAt.current < 400;
    setLeaving(settling ? null : shown);
    setShown(mode);
  }, [mode, shown]);

  const frame = (m: SeasonMode, node: ReactNode) => {
    const isShown = shown === m;
    const isLeaving = leaving === m;
    return (
      <div
        hidden={!isShown && !isLeaving}
        aria-hidden={isLeaving || undefined}
        className={isShown && leaving ? css.frameIn : isLeaving ? css.frameOut : undefined}
        onAnimationEnd={isLeaving ? () => setLeaving(null) : undefined}
        data-season-frame={m}
      >
        {node}
      </div>
    );
  };

  return (
    <div className={css.frames} data-leaving={leaving ?? undefined}>
      {frame('final', final)}
      {frame('live', live)}
    </div>
  );
}

/** Render children only in one mode — for a small slot such as a card header's CSV. */
export function InMode({ mode: want, children }: { mode: SeasonMode; children: ReactNode }) {
  const { mode } = useLeagueLink(0);
  return mode === want ? <>{children}</> : null;
}
