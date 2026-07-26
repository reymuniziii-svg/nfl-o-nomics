/**
 * `TeamMark` (`COMPONENTS.md` §9) and `PlayerMark` (§10).
 *
 * Both resolve through `lib/marks.ts`, which owns the kill-switch branch and the
 * resolution floor. These components own only the *containment* — the geometry
 * assigned to the design track by name.
 *
 * IMAGES ARE NEVER RE-ENCODED. `next.config.ts` sets `images.unoptimized`, so
 * `<Image>` emits the byte-identical self-hosted file: `DECISIONS.md` 62 option
 * (a) requires the source stay untransformed and the treatment stay in CSS, and
 * an optimizer pass would bake a fixed derivative.
 */

import Image from 'next/image';
import css from './marks.module.css';
import { teamChip, type PlayerMark as PlayerMarkData, type TeamMark as TeamMarkData } from '@/lib/marks';

/* ══════════════════════════════════════════════════════════════════════════ */
/* TEAMMARK                                                                    */
/* ══════════════════════════════════════════════════════════════════════════ */

export type TeamMarkSize = 'xs' | 'sm' | 'md' | 'lg';

const SIZE_CLASS: Record<TeamMarkSize, string> = {
  xs: css.markXs,
  sm: css.markSm,
  md: css.markMd,
  lg: css.markLg,
};

const SIZE_PX: Record<TeamMarkSize, number> = { xs: 20, sm: 32, md: 48, lg: 64 };

/**
 * `alt` is always `""` — the mark is decorative and the team name is always
 * adjacent in text. That is also the test in §9.3 rule 4: any list that still
 * reads with `TEAM_LOGOS_ENABLED = false` is correctly designed.
 */
export function TeamMark({
  mark,
  size = 'sm',
  dense = false,
}: {
  mark: TeamMarkData | null;
  size?: TeamMarkSize;
  dense?: boolean;
}) {
  if (!mark) return null;
  const box = [css.mark, SIZE_CLASS[size], dense ? css.dense : ''].filter(Boolean).join(' ');

  if (mark.kind === 'chip') {
    return (
      <span className={box} aria-hidden="true">
        <span
          className={css.chip}
          style={{ background: mark.background, color: mark.glyph }}
        >
          {mark.label}
        </span>
      </span>
    );
  }

  return (
    <span className={box} aria-hidden="true">
      <Image
        className={css.logo}
        src={mark.src}
        alt=""
        width={SIZE_PX[size]}
        height={SIZE_PX[size]}
        sizes={`${SIZE_PX[size]}px`}
      />
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* PLAYERMARK                                                                  */
/* ══════════════════════════════════════════════════════════════════════════ */

export type PlayerMarkSize = 'chip' | 'card';

/**
 * The fallback is a DESIGNED ROSTER CARD, not a missing photo: the same box,
 * filled with the player's current team primary colour and its precomputed
 * glyph, carrying the jersey number (or the player's initials where the number
 * is unknown) over the position. A reader who sees a page of them sees a style,
 * not a failure.
 */
export function PlayerMark({
  mark,
  size = 'card',
  team,
  position,
  jersey,
}: {
  mark: PlayerMarkData;
  size?: PlayerMarkSize;
  team?: string | null;
  position?: string | null;
  jersey?: string | null;
}) {
  const frame = `${css.frame} ${size === 'card' ? css.frameCard : css.frameChip}`;

  if (mark.kind === 'card') {
    const chip = team ? teamChip(team) : null;
    return (
      <div className={css.player}>
        <div
          className={frame}
          style={chip ? { background: chip.primary, color: chip.glyph } : undefined}
          role="img"
          aria-label={`${mark.alt}${position ? `, ${position}` : ''}`}
        >
          <div className={css.fallback}>
            <span className={css.fallbackGlyph}>{jersey ?? mark.initials}</span>
            {position ? (
              <span className={`yy-label ${css.fallbackPos}`} style={{ color: 'inherit' }}>
                {position}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={css.player}>
      <div className={frame}>
        <Image
          className={css.photo}
          src={mark.src}
          alt={mark.alt}
          width={size === 'card' ? 120 : 56}
          height={size === 'card' ? 160 : 56}
          sizes={size === 'card' ? '120px' : '56px'}
        />
      </div>
      {/* §10.3 — directly beneath the mark, inside the chip's own box. Never
          overlaid, never in a footer, never in a tooltip. */}
      <p
        className={`yy-micro ${css.credit} ${size === 'chip' ? css.creditChipWidth : ''}`}
      >
        {mark.licenseUrl ? (
          <>
            {mark.attribution.split(',')[0]} ·{' '}
            <a href={mark.licenseUrl} rel="license noopener noreferrer" target="_blank">
              {mark.license}
            </a>
          </>
        ) : (
          <>{mark.attribution.split(',')[0]} · Public domain</>
        )}
      </p>
    </div>
  );
}
