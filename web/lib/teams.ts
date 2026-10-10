/**
 * Team codes, divisions and ERA-CORRECT IDENTITY — `SPEC.md` §6.
 *
 * The route key is franchise-continuous; the *rendered identity* is era-correct.
 * `/team/lv/2003` is the correct and only URL for the 2003 Raiders and the page
 * renders "Oakland Raiders". `teams.csv` is era-correct only from 2002, so
 * 1999–2001 identity — and every relocation boundary — comes from the small
 * hardcoded table below. SPEC §6 requires that table to live in exactly one
 * module; this is that module, and it is the TypeScript counterpart of
 * `etl/team_codes.py` (which owns normalization; this owns rendering).
 *
 * No mart is read here. These are route constants, not data.
 */

/** The canonical 32 — `etl/team_codes.py::CURRENT_TEAMS`. The Rams are `LA`, never `LAR`. */
export const CURRENT_TEAMS = [
  'ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN',
  'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LA', 'LAC', 'LV', 'MIA',
  'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB',
  'TEN', 'WAS',
] as const;

export type TeamAbbr = (typeof CURRENT_TEAMS)[number];

const CURRENT_TEAM_SET: ReadonlySet<string> = new Set<string>(CURRENT_TEAMS);

export function isTeamAbbr(x: string): x is TeamAbbr {
  return CURRENT_TEAM_SET.has(x.toUpperCase());
}

/** URL form is lowercase; the mart key is uppercase. */
export function toAbbr(slug: string): TeamAbbr | null {
  const up = slug.toUpperCase();
  return CURRENT_TEAM_SET.has(up) ? (up as TeamAbbr) : null;
}

/* ------------------------------------------------------------------ */
/* Legacy route codes — `SPEC.md` §6, mirrors                          */
/* `etl/team_codes.py::LEGACY_ROUTE_REDIRECTS`. Every one of these      */
/* 301-redirects to the canonical route.                                */
/* ------------------------------------------------------------------ */

export const LEGACY_ROUTE_REDIRECTS: Readonly<Record<string, TeamAbbr>> = {
  OAK: 'LV',
  STL: 'LA',
  SD: 'LAC',
  LAR: 'LA',
  SL: 'LA',
  JAC: 'JAX',
  ARZ: 'ARI',
  BLT: 'BAL',
  CLV: 'CLE',
  HST: 'HOU',
  WSH: 'WAS',
  WFT: 'WAS',
};

/* ------------------------------------------------------------------ */
/* Divisions — CURRENT ALIGNMENT ONLY (`SPEC.md` §6).                   */
/* The 2002 realignment is not modeled. Membership is the same set the  */
/* asset pipeline recorded in public/assets/teammarks/chipdata.json and  */
/* the seed loads into `team_meta`; it is repeated here because route    */
/* params must resolve without a database round-trip.                    */
/* ------------------------------------------------------------------ */

export const DIVISION_SLUGS = [
  'afc-east', 'afc-north', 'afc-south', 'afc-west',
  'nfc-east', 'nfc-north', 'nfc-south', 'nfc-west',
] as const;

export type DivisionSlug = (typeof DIVISION_SLUGS)[number];

/** `/` defaults to AFC East (`SPEC.md` §3.1 item 1). */
export const DEFAULT_DIVISION: DivisionSlug = 'afc-east';

export function isDivisionSlug(x: string): x is DivisionSlug {
  return (DIVISION_SLUGS as readonly string[]).includes(x);
}

/** "NFC West" (as stored in `team_meta.division`) <-> "nfc-west" (as routed). */
export function divisionSlug(name: string): DivisionSlug {
  return name.toLowerCase().replace(/\s+/g, '-') as DivisionSlug;
}

export function divisionName(slug: DivisionSlug): string {
  const [conf, ...rest] = slug.split('-');
  return `${conf.toUpperCase()} ${rest.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')}`;
}

/* ------------------------------------------------------------------ */
/* THE ERA TABLE — `SPEC.md` §6.                                        */
/*                                                                      */
/* One row per identity a franchise-continuous code has carried inside   */
/* the 1999–2025 window, newest first. `through` is the last season the   */
/* identity was in force; `null` means "still current".                  */
/*                                                                      */
/* Covered here and nowhere else:                                        */
/*   - the three relocations (STL->LA 2016, SD->LAC 2017, OAK->LV 2020)   */
/*   - the two Washington renames (2020 WFT, 2022 Commanders)             */
/*   - expansion/return: HOU enters 2002, CLE returns 1999                */
/* ------------------------------------------------------------------ */

export interface EraIdentity {
  /** Full franchise name as it read that season. */
  name: string;
  /** Era-correct location, for the "Oakland Raiders · 2003" identity line. */
  location: string;
  /** The era-correct code the curated sources carry for that season. */
  eraCode: string;
  /** Last season this identity was in force; null = current. */
  through: number | null;
}

const ERA_TABLE: Readonly<Partial<Record<TeamAbbr, readonly EraIdentity[]>>> = {
  LA: [
    { name: 'Los Angeles Rams', location: 'Los Angeles', eraCode: 'LA', through: null },
    { name: 'St. Louis Rams', location: 'St. Louis', eraCode: 'STL', through: 2015 },
  ],
  LAC: [
    { name: 'Los Angeles Chargers', location: 'Los Angeles', eraCode: 'LAC', through: null },
    { name: 'San Diego Chargers', location: 'San Diego', eraCode: 'SD', through: 2016 },
  ],
  LV: [
    { name: 'Las Vegas Raiders', location: 'Las Vegas', eraCode: 'LV', through: null },
    { name: 'Oakland Raiders', location: 'Oakland', eraCode: 'OAK', through: 2019 },
  ],
  WAS: [
    { name: 'Washington Commanders', location: 'Washington', eraCode: 'WAS', through: null },
    { name: 'Washington Football Team', location: 'Washington', eraCode: 'WAS', through: 2021 },
    { name: 'Washington Redskins', location: 'Washington', eraCode: 'WAS', through: 2019 },
  ],
};

/** Current-identity fallback for the 28 franchises whose identity never moved. */
const CURRENT_NAMES: Readonly<Record<TeamAbbr, [name: string, location: string]>> = {
  ARI: ['Arizona Cardinals', 'Arizona'],
  ATL: ['Atlanta Falcons', 'Atlanta'],
  BAL: ['Baltimore Ravens', 'Baltimore'],
  BUF: ['Buffalo Bills', 'Buffalo'],
  CAR: ['Carolina Panthers', 'Carolina'],
  CHI: ['Chicago Bears', 'Chicago'],
  CIN: ['Cincinnati Bengals', 'Cincinnati'],
  CLE: ['Cleveland Browns', 'Cleveland'],
  DAL: ['Dallas Cowboys', 'Dallas'],
  DEN: ['Denver Broncos', 'Denver'],
  DET: ['Detroit Lions', 'Detroit'],
  GB: ['Green Bay Packers', 'Green Bay'],
  HOU: ['Houston Texans', 'Houston'],
  IND: ['Indianapolis Colts', 'Indianapolis'],
  JAX: ['Jacksonville Jaguars', 'Jacksonville'],
  KC: ['Kansas City Chiefs', 'Kansas City'],
  LA: ['Los Angeles Rams', 'Los Angeles'],
  LAC: ['Los Angeles Chargers', 'Los Angeles'],
  LV: ['Las Vegas Raiders', 'Las Vegas'],
  MIA: ['Miami Dolphins', 'Miami'],
  MIN: ['Minnesota Vikings', 'Minnesota'],
  NE: ['New England Patriots', 'New England'],
  NO: ['New Orleans Saints', 'New Orleans'],
  NYG: ['New York Giants', 'New York'],
  NYJ: ['New York Jets', 'New York'],
  PHI: ['Philadelphia Eagles', 'Philadelphia'],
  PIT: ['Pittsburgh Steelers', 'Pittsburgh'],
  SEA: ['Seattle Seahawks', 'Seattle'],
  SF: ['San Francisco 49ers', 'San Francisco'],
  TB: ['Tampa Bay Buccaneers', 'Tampa Bay'],
  TEN: ['Tennessee Titans', 'Tennessee'],
  WAS: ['Washington Commanders', 'Washington'],
};

/** First season the franchise exists inside the 1999–2025 window. */
export const FRANCHISE_FIRST_SEASON: Readonly<Partial<Record<TeamAbbr, number>>> = {
  HOU: 2002, // expansion
  CLE: 1999, // returned 1999
};

/**
 * The era-correct identity for a franchise-continuous code in a given season.
 * This is the ONLY place a rendered franchise name is resolved.
 */
export function eraIdentity(abbr: TeamAbbr, season: number): EraIdentity {
  const rows = ERA_TABLE[abbr];
  if (rows) {
    // Oldest boundary first: the identity in force is the first one whose
    // `through` still covers the season. `through: null` is the current identity
    // and therefore the last candidate, never the first — getting this backwards
    // is how /team/lv/2003 renders "Las Vegas Raiders".
    const ordered = [...rows].sort(
      (a, b) => (a.through ?? Number.POSITIVE_INFINITY) - (b.through ?? Number.POSITIVE_INFINITY),
    );
    for (const row of ordered) {
      if (row.through === null || season <= row.through) return row;
    }
    return ordered[ordered.length - 1];
  }
  const [name, location] = CURRENT_NAMES[abbr];
  return { name, location, eraCode: abbr, through: null };
}

/** "Oakland Raiders · 2003" — the header identity line required by SPEC §6. */
export function eraIdentityLine(abbr: TeamAbbr, season: number): string {
  return `${eraIdentity(abbr, season).name} · ${season}`;
}
