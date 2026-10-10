/**
 * Identity-asset loaders — TeamMark (`SPEC.md` §5.1) and PlayerMark (§5.2).
 *
 * Both asset sets are self-hosted and NEVER hotlinked. The manifests written by
 * `assets/fetch_teammarks.py` / `assets/fetch_playermarks.py` are the inventory;
 * `scripts/prepare.mjs` mirrors `public/assets/**` from the repo root into
 * `web/public/` so the same JSON is both the manifest and the served path map.
 *
 * TeamMark resolution:
 *   TEAM_LOGOS_ENABLED === false  ->  ALWAYS the typographic fallback chip
 *   logo file missing in manifest ->  the chip
 *   otherwise                     ->  /assets/teammarks/<ABBR>.png
 * The chip's glyph color is the black-or-white value computed from the relative
 * luminance of the team's primary color, precomputed in chipdata.json. It is NOT
 * the secondary color and must not be "simplified" to it: 15 of 36 color rows
 * have primary/secondary contrast below 3.0 and 6 are below 2.0. Worst case as
 * shipped is LAC at 4.66, all >= WCAG AA.
 *
 * PlayerMark resolution:
 *   no asset row, or width_fetched < IMAGE_MIN_WIDTH_PX  ->  designed card fallback
 *   otherwise -> /assets/playermarks/<file>, plus the VISIBLE attribution line.
 * Attribution is the default, not the exception (91.4% of assets require it), so
 * `attribution` is returned as a required field on every photo mark and the
 * caller has no way to render the image without it.
 */

import chipdataJson from '@/public/assets/teammarks/chipdata.json';
import teammarksJson from '@/public/assets/teammarks/manifest.json';
import playermarksJson from '@/public/assets/playermarks/manifest.json';
import { IMAGE_MIN_WIDTH_PX, IMAGE_TREATMENT_MODE, TEAM_LOGOS_ENABLED } from './flags';
import type { TeamAbbr } from './teams';

/* ------------------------------------------------------------------ */
/* TeamMark                                                            */
/* ------------------------------------------------------------------ */

export interface TeamChip {
  abbr: string;
  teamName: string;
  conf: string;
  division: string;
  primary: string;
  secondary: string;
  /** Black-or-white, computed by relative luminance of `primary`. */
  glyph: string;
  glyphContrast: number;
  pairContrast: number;
}

export type TeamMark =
  | { kind: 'logo'; src: string; alt: string; width: number; height: number; chip: TeamChip }
  | { kind: 'chip'; label: string; background: string; glyph: string; alt: string; chip: TeamChip };

interface ChipRow {
  abbr: string;
  team_name: string;
  conf: string;
  division: string;
  primary: string;
  secondary: string;
  glyph: string;
  glyph_contrast: number;
  pair_contrast: number;
}

const CHIPS: ReadonlyMap<string, TeamChip> = new Map(
  (chipdataJson.teams as ChipRow[]).map((t) => [
    t.abbr,
    {
      abbr: t.abbr,
      teamName: t.team_name,
      conf: t.conf,
      division: t.division,
      primary: t.primary,
      secondary: t.secondary,
      glyph: t.glyph,
      glyphContrast: t.glyph_contrast,
      pairContrast: t.pair_contrast,
    },
  ]),
);

const TEAM_LOGO_FILES: ReadonlyMap<string, string> = new Map(
  Object.entries(teammarksJson.teams as Record<string, { file?: string; status?: string }>)
    .filter(([, v]) => v.status === 'ok' && typeof v.file === 'string')
    .map(([abbr, v]) => [abbr, v.file as string]),
);

export function teamChip(abbr: TeamAbbr | string): TeamChip | null {
  return CHIPS.get(abbr) ?? null;
}

export function allTeamChips(): TeamChip[] {
  return [...CHIPS.values()];
}

/**
 * Resolve the TeamMark for a franchise. `displayName` is the ERA-CORRECT name
 * for the season being rendered (`lib/teams.ts::eraIdentity`) — the mark is
 * franchise-continuous, the alt text is not.
 */
export function teamMark(abbr: TeamAbbr | string, displayName?: string): TeamMark | null {
  const chip = CHIPS.get(abbr);
  if (!chip) return null;
  const name = displayName ?? chip.teamName;
  const file = TEAM_LOGO_FILES.get(abbr);

  if (!TEAM_LOGOS_ENABLED || !file) {
    return {
      kind: 'chip',
      label: abbr,
      background: chip.primary,
      glyph: chip.glyph,
      alt: name,
      chip,
    };
  }
  return {
    kind: 'logo',
    src: `/assets/teammarks/${file}`,
    alt: name,
    width: 500,
    height: 500,
    chip,
  };
}

/* ------------------------------------------------------------------ */
/* PlayerMark                                                          */
/* ------------------------------------------------------------------ */

export interface PlayerPhotoMark {
  kind: 'photo';
  src: string;
  alt: string;
  width: number;
  height: number;
  /** Prerendered credit line. MUST render visibly — never behind a hover. */
  attribution: string;
  attributionRequired: boolean;
  license: string;
  licenseUrl: string | null;
  shareAlike: boolean;
  sourcePageUrl: string;
  /** Option (a): the treatment is CSS over an unmodified source. */
  treatment: string;
}

export interface PlayerCardMark {
  kind: 'card';
  /** Why the designed card is showing — surfaced to the operator, not the reader. */
  reason: 'no_usable_image' | 'below_resolution_floor' | 'not_in_population';
  initials: string;
  alt: string;
}

export type PlayerMark = PlayerPhotoMark | PlayerCardMark;

interface PlayerAssetRow {
  otc_id: string;
  player: string;
  team: string;
  position: string;
  file: string;
  width_fetched: number;
  height_fetched: number;
  author: string;
  license: string;
  license_url: string | null;
  attribution: string;
  attribution_required: boolean;
  share_alike: boolean;
  restrictions: string | null;
  source_file_page_url: string;
  last_verified_at: string;
  status: string;
}

const PLAYER_ASSETS = playermarksJson.assets as unknown as Record<string, PlayerAssetRow>;

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/**
 * Resolve the PlayerMark for an `otc_id`. Branches on width either way, so the
 * resolution floor stays a config constant (`IMAGE_MIN_WIDTH_PX`).
 */
export function playerMark(otcId: string | number, playerName: string): PlayerMark {
  const row = PLAYER_ASSETS[String(otcId)];
  if (!row || row.status !== 'ok') {
    return { kind: 'card', reason: 'no_usable_image', initials: initialsOf(playerName), alt: playerName };
  }
  if (row.width_fetched < IMAGE_MIN_WIDTH_PX) {
    return {
      kind: 'card',
      reason: 'below_resolution_floor',
      initials: initialsOf(playerName),
      alt: playerName,
    };
  }
  return {
    kind: 'photo',
    src: `/assets/playermarks/${row.file}`,
    alt: row.player,
    width: row.width_fetched,
    height: row.height_fetched,
    attribution: row.attribution,
    attributionRequired: row.attribution_required,
    license: row.license,
    licenseUrl: row.license_url,
    shareAlike: row.share_alike,
    sourcePageUrl: row.source_file_page_url,
    treatment: IMAGE_TREATMENT_MODE,
  };
}

/** Counts straight from the manifest — used by /credits and the build stamp. */
export const PLAYERMARK_COUNTS = playermarksJson.counts as unknown as Record<string, number>;
export const TEAMMARK_COUNTS = {
  teams_expected: teammarksJson.teams_expected,
  teams_ok: teammarksJson.teams_ok,
} as const;
