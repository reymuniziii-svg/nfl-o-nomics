/**
 * Token values for the OG renderer. Satori cannot resolve CSS custom
 * properties, so the handful of tokens the cards use are mirrored here BY NAME
 * from `app/tokens.css` (`SPEC.md` §4: the JSON mirror is the source for
 * anything that needs token values outside CSS). Extend-never-rename applies:
 * if a value changes in tokens.css, change it here under the same name.
 */
export const OG = {
  surfaceApp: '#0B0D0E', // --yy-surface-app
  surfaceCard: '#181C1D', // --yy-surface-card-flat
  filmRoom: '#111416', // --yy-film-room
  endZone: '#071C16', // --yy-end-zone
  ink1: '#EAF1EC', // --yy-ink-dark-1
  ink2: '#A8B1AD', // --yy-ink-dark-2
  ink3: '#849489', // --yy-ink-dark-3
  lime: '#A6E22E', // --yy-yield-lime / --yy-series-subject
  onLime: '#071C16', // --yy-selected-fg
  gold: '#D4AF37', // --yy-premium-gold / --yy-benchmark-fg
  negative: '#D9503C', // --yy-negative
  negativeSoft: '#E8A08D', // --yy-negative-soft
  mid: '#8FA39A', // --yy-band-mid
  track: '#39423E', // --yy-bg-track (dark)
  partial: 'rgba(168, 177, 173, 0.28)', // --yy-partial (dark) — the partial hatch
  borderExport: 'rgba(168, 177, 173, 0.42)', // --yy-card-border-export
  chalk: 'rgba(234, 241, 236, 0.18)', // --yy-ink-dark-1 at gridline weight
  chalkStrong: 'rgba(234, 241, 236, 0.45)', // goal lines
} as const;

export type VerdictTone = 'good' | 'mid' | 'bad';

export const TONE_COLOR: Record<VerdictTone, string> = {
  good: OG.lime,
  mid: OG.mid,
  bad: OG.negative,
};

export function toneOf(quintile: 1 | 2 | 3 | 4 | 5): VerdictTone {
  return quintile <= 2 ? 'good' : quintile === 3 ? 'mid' : 'bad';
}

export { OG_FONT as OG_TEXT } from './fonts';
