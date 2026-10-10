/**
 * Player bundle — `SPEC.md` §3.3.
 *
 * THE POPULATION IS FIXED. DECISIONS 53: the v1 player population is the 251
 * audited players, so every player page has known image status and known license
 * metadata. `getPlayerPopulation()` is the enumeration `generateStaticParams`
 * uses; it never falls back to "every otc_id in player_season_cap".
 *
 * NO VALUE GRADE. EVER. This module deliberately exposes no composite, no letter
 * grade, no verdict and no star count. There is nothing to render because there
 * is nothing to compute (`SPEC.md` §3.3 item 7).
 */

import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import * as s from '@/db/schema';
import { BLANK_REASON, blank, value, type Metric } from '@/lib/metric';
import type { TeamAbbr } from '@/lib/teams';
import { isSeeded } from './registry';

/** `SPEC.md` §3.3 item 5 — snaps 2013+; the 2012 asset exists and is empty. */
export const SNAPS_FIRST_SEASON = 2013;

/**
 * The AVAILABILITY window, which is not the same claim as the snaps boundary.
 *
 * `player_season_availability` holds 2013–2025 and nothing earlier — GAMES are
 * truncated at exactly the same boundary as snaps, not carried "the full
 * record". Saying otherwise turned Tom Brady's 23-season, 335-game career into
 * a "Games 158" tile with a caption asserting completeness, which is precisely
 * the failure `SPEC.md` §1.2 forbids. Both figures are labeled with the window
 * they actually cover.
 */
export const AVAILABILITY_FIRST_SEASON = 2013;
export const AVAILABILITY_LAST_SEASON = 2025;
export const AVAILABILITY_WINDOW = `${AVAILABILITY_FIRST_SEASON}–${AVAILABILITY_LAST_SEASON}`;

export interface PopulationEntry {
  playerId: string;
  player: string | null;
  team: string | null;
  position: string | null;
  maxCapSeason: number | null;
  capRank: number | null;
  hasUsableImage: boolean;
}

let populationPromise: Promise<PopulationEntry[]> | null = null;

/** The 251 audited players. The ONLY source of `/player/{id}` params. */
export function getPlayerPopulation(): Promise<PopulationEntry[]> {
  if (!populationPromise) {
    populationPromise = (async () => {
      if (!(await isSeeded('player_images'))) return [];
      const db = await getDb();
      const rows = await db
        .select({
          playerId: s.playerImages.playerId,
          player: s.playerImages.player,
          team: s.playerImages.team,
          position: s.playerImages.position,
          maxCapSeason: s.playerImages.maxCapSeason,
          capRank: s.playerImages.capRank,
          hasUsableImage: s.playerImages.hasUsableImage,
        })
        .from(s.playerImages)
        .orderBy(asc(s.playerImages.player), asc(s.playerImages.playerId));
      return rows;
    })();
  }
  return populationPromise;
}

/* ------------------------------------------------------------------ */

export interface ContractCard {
  yearSigned: number | null;
  years: number | null;
  value: number | null;
  apy: number | null;
  guaranteed: number | null;
  /** APY as % of that year's cap. */
  apyCapPct: number | null;
}

export interface CapVsCashPoint {
  season: number;
  team: TeamAbbr;
  capNumber: number;
  cashPaid: number | null;
  capPercent: number | null;
  positionGroup: string | null;
  /**
   * Dead-money marker. The TEAM THAT ATE THE CHARGE is carried explicitly and is
   * not the team on the player's row for that year — the source table follows
   * the player, not the charge (`SPEC.md` §3.3 item 4).
   */
  deadMoney: {
    charge: boolean;
    team: string | null;
    usd: number | null;
    totalUsd: number | null;
    seasons: string | null;
    isActual: boolean | null;
    sourceUrl: string | null;
  } | null;
}

export interface AvailabilityRow {
  season: number;
  team: TeamAbbr;
  games: number | null;
  /** 2013+ only; the boundary is stated, not absorbed. */
  offSnaps: number | null;
  defSnaps: number | null;
  stSnaps: number | null;
  /** A 0–1 FRACTION, not 0–100. */
  offPct: number | null;
}

export interface PlayerImageMeta {
  hasUsableImage: boolean;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  attribution: string | null;
  attributionRequired: boolean | null;
  shareAlike: boolean | null;
  lastVerifiedAt: string | null;
  width: number | null;
  height: number | null;
}

export interface PlayerBundle {
  playerId: string;
  name: string;
  position: string | null;
  team: string | null;
  gsisId: string | null;
  image: PlayerImageMeta;
  contract: Metric<ContractCard>;
  capVsCash: Metric<CapVsCashPoint[]>;
  availability: Metric<AvailabilityRow[]>;
  /** Rendered beside the availability table; the boundary is never absorbed. */
  snapsBoundaryNote: string;
  /** SPEC §3.3 item 7 — a published, enforced product commitment. */
  noValueGrade: true;
}

export async function getPlayerBundle(playerId: string): Promise<PlayerBundle | null> {
  if (!(await isSeeded('player_images'))) return null;
  const db = await getDb();

  const imgRows = await db
    .select()
    .from(s.playerImages)
    .where(eq(s.playerImages.playerId, playerId))
    .limit(1);
  if (!imgRows.length) return null;
  const img = imgRows[0];

  const otcId = Number(playerId);

  const capRows = (await isSeeded('player_season_cap'))
    ? await db
        .select()
        .from(s.playerSeasonCap)
        .where(eq(s.playerSeasonCap.otcId, otcId))
        .orderBy(asc(s.playerSeasonCap.season))
    : [];

  const name = img.player ?? capRows[0]?.player ?? `Player ${playerId}`;
  const gsisId = capRows.find((c) => c.gsisId)?.gsisId ?? null;

  /* --- contract card: the top-level contract columns, most recent deal --- */
  const withContract = capRows.filter((c) => c.contractYearSigned !== null);
  const latest = withContract.length ? withContract[withContract.length - 1] : null;
  const contract: Metric<ContractCard> = latest
    ? value({
        yearSigned: latest.contractYearSigned,
        years: latest.contractYears,
        value: latest.contractValue,
        apy: latest.contractApy,
        guaranteed: latest.contractGuaranteed,
        apyCapPct: latest.contractApyCapPct,
      })
    : blank('Not available — no contract is on record for this player.');

  /* --- cap vs cash by year, with dead-money markers --- */
  const capVsCash: Metric<CapVsCashPoint[]> = capRows.length
    ? value(
        capRows.map((c) => ({
          season: c.season,
          team: c.team as TeamAbbr,
          capNumber: c.capNumber,
          cashPaid: c.cashPaid,
          capPercent: c.capPercent,
          positionGroup: c.positionGroup,
          deadMoney: c.dmLedgerCharge
            ? {
                charge: true,
                team: c.dmLedgerTeam,
                usd: c.dmLedgerUsd,
                totalUsd: c.dmLedgerTotalUsd,
                seasons: c.dmLedgerSeasons,
                isActual: c.dmLedgerIsActual,
                sourceUrl: c.dmLedgerSourceUrl,
              }
            : null,
        })),
      )
    : blank(BLANK_REASON.PRE_TIER2);

  /* --- availability --- */
  let availability: Metric<AvailabilityRow[]> = blank(BLANK_REASON.MART_ABSENT);
  if (gsisId && (await isSeeded('player_season_availability'))) {
    const rows = await db
      .select()
      .from(s.playerSeasonAvailability)
      .where(eq(s.playerSeasonAvailability.gsisId, gsisId))
      .orderBy(asc(s.playerSeasonAvailability.season));
    availability = rows.length
      ? value(
          rows.map((a) => ({
            season: a.season,
            team: a.team as TeamAbbr,
            games: a.games,
            offSnaps: a.offSnaps,
            defSnaps: a.defSnaps,
            stSnaps: a.stSnaps,
            offPct: a.offPct,
          })),
        )
      : blank('Not available — no games or snaps are on record for this player.');
  } else if (!gsisId) {
    availability = blank('Not available — this player has no GSIS ID (the NFL’s player ID), so snap counts can’t be matched.');
  }

  return {
    playerId,
    name,
    position: img.position ?? capRows[0]?.positionAtSigning ?? null,
    team: img.team ?? capRows[capRows.length - 1]?.team ?? null,
    gsisId,
    image: {
      hasUsableImage: img.hasUsableImage,
      author: img.author,
      license: img.license,
      licenseUrl: img.licenseUrl,
      attribution: img.attribution,
      attributionRequired: img.attributionRequired,
      shareAlike: img.shareAlike,
      lastVerifiedAt: img.lastVerifiedAt,
      width: img.width,
      height: img.height,
    },
    contract,
    capVsCash,
    availability,
    snapsBoundaryNote:
      `Availability runs ${AVAILABILITY_WINDOW}, and games and snap counts share that window. ` +
      'Seasons before it are not counted or estimated, and the 2012 snap source file is empty.',
    noValueGrade: true,
  };
}

/** Name search over the v1 population (`SPEC.md` §3.3 item 1). No filters. */
export async function searchPlayers(q: string, limit = 20): Promise<PopulationEntry[]> {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const all = await getPlayerPopulation();
  return all.filter((p) => (p.player ?? '').toLowerCase().includes(needle)).slice(0, limit);
}

/** Every player-season cap row for a set of players — used by the CSV export. */
export async function getPlayerSeasonRows(playerIds: string[]) {
  if (!playerIds.length || !(await isSeeded('player_season_cap'))) return [];
  const db = await getDb();
  return db
    .select()
    .from(s.playerSeasonCap)
    .where(inArray(s.playerSeasonCap.otcId, playerIds.map(Number)))
    .orderBy(asc(s.playerSeasonCap.otcId), asc(s.playerSeasonCap.season));
}

/** The top cap hits for a team-season — the team page's roster surface. */
export async function getTopCapHits(season: number, team: string, limit = 10) {
  if (!(await isSeeded('player_season_cap'))) return [];
  const db = await getDb();
  return db
    .select({
      otcId: s.playerSeasonCap.otcId,
      player: s.playerSeasonCap.player,
      positionGroup: s.playerSeasonCap.positionGroup,
      capNumber: s.playerSeasonCap.capNumber,
      cashPaid: s.playerSeasonCap.cashPaid,
      capPercent: s.playerSeasonCap.capPercent,
    })
    .from(s.playerSeasonCap)
    .where(and(eq(s.playerSeasonCap.season, season), eq(s.playerSeasonCap.team, team)))
    .orderBy(desc(s.playerSeasonCap.capNumber))
    .limit(limit);
}

/* ------------------------------------------------------------------ */
/* Featured players — the `/player` landing (review 2026-10-10, Player) */
/* ------------------------------------------------------------------ */

export interface FeaturedCapHit {
  playerId: string;
  name: string;
  position: string | null;
  team: string;
  capNumber: number;
  /** Share of that season's ADJUSTED cap, 0–1. */
  capPercent: number | null;
}

export interface FeaturedDeadMoney {
  /** `null` where the ledger name has no page in the v1 population. */
  playerId: string | null;
  name: string;
  /** The club that ate the charge. */
  team: string;
  seasons: string;
  totalUsd: number;
  verifiedAsof: string;
}

export interface FeaturedPlayers {
  season: number;
  capHits: Metric<FeaturedCapHit[]>;
  deadMoney: Metric<FeaturedDeadMoney[]>;
}

/**
 * Two entry lists for the search page: the season's biggest cap hits and the
 * biggest charges in the dead-money ledger. Both are restricted to — or linked
 * through — the 251-player population, so every row that links has a page.
 * Ranked on published figures only; no player is scored.
 */
export async function getFeaturedPlayers(season: number, limit = 8): Promise<FeaturedPlayers> {
  const pop = await getPlayerPopulation();
  const byId = new Map(pop.map((p) => [p.playerId, p]));

  let capHits: Metric<FeaturedCapHit[]> = blank(BLANK_REASON.MART_ABSENT);
  let deadMoney: Metric<FeaturedDeadMoney[]> = blank(BLANK_REASON.MART_ABSENT);
  if (!pop.length) return { season, capHits, deadMoney };

  const db = await getDb();

  if (await isSeeded('player_season_cap')) {
    const rows = await db
      .select({
        otcId: s.playerSeasonCap.otcId,
        player: s.playerSeasonCap.player,
        team: s.playerSeasonCap.team,
        positionGroup: s.playerSeasonCap.positionGroup,
        capNumber: s.playerSeasonCap.capNumber,
        capPercent: s.playerSeasonCap.capPercent,
      })
      .from(s.playerSeasonCap)
      .where(
        and(
          eq(s.playerSeasonCap.season, season),
          inArray(s.playerSeasonCap.otcId, pop.map((p) => Number(p.playerId))),
        ),
      )
      .orderBy(desc(s.playerSeasonCap.capNumber))
      .limit(limit);
    capHits = rows.length
      ? value(
          rows.map((r) => {
            const id = String(r.otcId);
            const p = byId.get(id);
            return {
              playerId: id,
              name: p?.player ?? r.player ?? `Player ${id}`,
              position: p?.position ?? r.positionGroup,
              team: r.team,
              capNumber: r.capNumber,
              capPercent: r.capPercent,
            };
          }),
        )
      : blank(`Not available — no ${season} cap data is on record for the players this site covers.`);
  }

  if (await isSeeded('dead_money_ledger')) {
    const ledger = await db
      .select()
      .from(s.deadMoneyLedger)
      .orderBy(desc(s.deadMoneyLedger.totalUsd))
      .limit(limit);

    // The cap mart carries the ledger name on the player's own rows, which is
    // the join the ledger itself lacks. A name match against the population is
    // the fallback; a name that matches neither stays unlinked, never guessed.
    const links = (await isSeeded('player_season_cap'))
      ? await db
          .selectDistinct({
            otcId: s.playerSeasonCap.otcId,
            name: s.playerSeasonCap.dmLedgerPlayer,
          })
          .from(s.playerSeasonCap)
          .where(eq(s.playerSeasonCap.dmLedgerCharge, true))
      : [];
    const idByLedgerName = new Map<string, string>();
    for (const l of links) {
      if (l.name && byId.has(String(l.otcId))) idByLedgerName.set(l.name, String(l.otcId));
    }
    const idByName = new Map<string, string>();
    for (const p of pop) if (p.player) idByName.set(p.player, p.playerId);

    deadMoney = value(
      ledger.map((r) => ({
        playerId: idByLedgerName.get(r.player) ?? idByName.get(r.player) ?? null,
        name: r.player,
        team: r.team,
        seasons: r.seasons,
        totalUsd: r.totalUsd,
        verifiedAsof: r.verifiedAsof,
      })),
    );
  }

  return { season, capHits, deadMoney };
}
