import {
  TIER2_FIRST_SEASON,
  getCapPlus,
  getDivisionSummary,
  getReceiptVerdict,
  getRosterReceipt,
  getTeamRating,
  getTeamSeasonResults,
  type CapPlusValue,
  type ReceiptVerdict,
  type RosterReceipt,
  type TeamResults,
} from '@/lib/data';
import type { Metric } from '@/lib/metric';
import { getLiveTeam, shortHash, type LiveTeamRow } from '@/lib/data/live';
import { teamChip } from '@/lib/marks';
import { divisionName, eraIdentity, type DivisionSlug, type TeamAbbr } from '@/lib/teams';
import { OG } from './theme';

/**
 * Everything a share card prints about one team-season, composed from the
 * `lib/data` accessors. Nothing here computes a metric: it only picks which
 * precomputed reading a card shows and how it is labeled.
 */
export interface TeamCard {
  team: TeamAbbr;
  season: number;
  name: string;
  /** TeamMark chip colors: team primary + its precomputed AA glyph. */
  bg: string;
  fg: string;
  results: Metric<TeamResults>;
  capplus: Metric<CapPlusValue>;
  teamRating: Metric<number>;
  receipt: Metric<RosterReceipt>;
  verdict: Metric<ReceiptVerdict>;
  tier2: boolean;
}

export async function loadTeamCard(team: TeamAbbr, season: number): Promise<TeamCard> {
  const tier2 = season >= TIER2_FIRST_SEASON;
  const [results, capplus, rating, receipt, verdict] = await Promise.all([
    getTeamSeasonResults(team, season),
    getCapPlus(season, team),
    getTeamRating(season, team),
    getRosterReceipt(season, team),
    getReceiptVerdict(season, team),
  ]);
  const chip = teamChip(team);
  return {
    team,
    season,
    name: eraIdentity(team, season).name,
    bg: chip?.primary ?? OG.surfaceCard,
    fg: chip?.glyph ?? OG.ink1,
    results,
    capplus,
    teamRating:
      rating.state === 'value'
        ? { state: 'value', value: rating.value.perfIndex }
        : { state: 'blank', reason: rating.reason },
    receipt,
    verdict,
    tier2,
  };
}

export interface DivisionCard {
  slug: DivisionSlug;
  name: string;
  season: number;
  teams: TeamCard[];
}

export async function loadDivisionCard(slug: DivisionSlug, season: number): Promise<DivisionCard> {
  const summary = await getDivisionSummary(slug, season, 'cap');
  const teams = await Promise.all(summary.teams.map((t) => loadTeamCard(t.team, season)));
  return { slug, name: divisionName(slug), season, teams };
}

/* ── the live tier (DECISIONS 116) ─────────────────────────────────────── */

/**
 * A live team card: the club's 2026 reading as of the closed week. No verdict,
 * no receipt, no money — the card prints the mandatory as-of line instead.
 */
export interface LiveTeamCard {
  team: TeamAbbr;
  season: number;
  name: string;
  bg: string;
  fg: string;
  week: number;
  date: string | null;
  /** The club's live row, or null with the whole-season reason. */
  row: LiveTeamRow | null;
  reason: string | null;
  pbpShort: string;
}

export async function loadLiveTeamCard(team: TeamAbbr): Promise<LiveTeamCard | null> {
  const live = await getLiveTeam(team);
  if (!live) return null;
  const chip = teamChip(team);
  return {
    team,
    season: live.status.season,
    name: eraIdentity(team, live.status.season).name,
    bg: chip?.primary ?? OG.surfaceCard,
    fg: chip?.glyph ?? OG.ink1,
    week: live.status.week,
    date: live.status.date,
    row: live.row,
    reason: live.reason,
    pbpShort: shortHash(live.status.pbpSha256),
  };
}
