/**
 * The icon set — `COMPONENTS.md` §15.4.
 *
 * `[BRAND]`: 2px stroke at 24px, geometric line icons, rounded caps. The core
 * metaphor set is target · upward yield · play route · contract · roster · field
 * · bar chart · percentile, plus the five interface glyphs the components need.
 *
 * Every icon: `stroke: currentColor`, `stroke-width: var(--yy-stroke-icon)`,
 * `stroke-linecap: round`, `fill: none`, `viewBox="0 0 24 24"`.
 * **Never mix filled sports clip art with the line set.** `[BRAND]`
 */

import type { SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'fill'> & { size?: number };

function Icon({ size = 24, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="var(--yy-stroke-icon)"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** LEAGUE — the target. */
export function IconTarget(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" />
    </Icon>
  );
}

/** The upward yield — a rising line out of a floor. */
export function IconYield(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 20.5h18" />
      <path d="M4.5 16.5 10 11l3.5 3.5L20 8" />
      <path d="M15.5 8H20v4.5" />
    </Icon>
  );
}

/** TEAMS — the roster. */
export function IconRoster(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20.5c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 5.6M18.4 14.6a6.5 6.5 0 0 1 3.1 5.9" />
    </Icon>
  );
}

/** PLAYERS — the contract. */
export function IconContract(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M5.5 2.5h9L19 7v14.5H5.5z" />
      <path d="M14 2.5V7h5" />
      <path d="M8.5 12.5h7M8.5 16.5h4.5" />
    </Icon>
  );
}

/** COMPARE — the play route. */
export function IconRoute(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="5" cy="19" r="2.5" />
      <path d="M6.8 17.2 12 12V5" />
      <path d="M9 7.5 12 4.5l3 3" />
      <path d="M12 12h4.5a3 3 0 0 1 0 6H14" />
    </Icon>
  );
}

/** The field — a coordinate system, never an illustration. */
export function IconField(p: IconProps) {
  return (
    <Icon {...p}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="1.5" />
      <path d="M12 5.5v13M7.25 8v8M16.75 8v8" />
    </Icon>
  );
}

/** The bar chart. */
export function IconBars(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M3 20.5h18" />
      <path d="M6.5 20.5v-6M12 20.5V7M17.5 20.5v-9" />
    </Icon>
  );
}

/** The percentile — a distribution with a marked position. */
export function IconPercentile(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M2.5 17.5c3.5 0 4-11 9.5-11s6 11 9.5 11" />
      <path d="M15.5 4.5v16" />
    </Icon>
  );
}

/* ---- interface glyphs ---- */

export function IconChevronLeft(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M15 4.5 7.5 12l7.5 7.5" />
    </Icon>
  );
}

export function IconChevronRight(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="m9 4.5 7.5 7.5L9 19.5" />
    </Icon>
  );
}

export function IconChevronDown(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="m4.5 9 7.5 7.5L19.5 9" />
    </Icon>
  );
}

export function IconSearch(p: IconProps) {
  return (
    <Icon {...p}>
      <circle cx="10.5" cy="10.5" r="7" />
      <path d="m15.6 15.6 5 5" />
    </Icon>
  );
}

export function IconDownload(p: IconProps) {
  return (
    <Icon {...p}>
      <path d="M12 3.5v12" />
      <path d="m7 10.5 5 5 5-5" />
      <path d="M3.5 20.5h17" />
    </Icon>
  );
}
