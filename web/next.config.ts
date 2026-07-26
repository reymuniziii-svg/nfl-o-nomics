import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { NextConfig } from 'next';
import { CURRENT_TEAMS, LEGACY_ROUTE_REDIRECTS } from './lib/teams';

/**
 * YIELD/YARD — Next.js configuration.
 *
 * RENDERING (`ARCHITECTURE.md` §2): static-first. Every enumerable route is
 * statically generated at build time via `generateStaticParams`, pinned with
 * `dynamic = 'force-static'` + `dynamicParams = false`. `output: 'export'` is
 * deliberately NOT set: it would forbid both the redirect table below and the
 * on-demand `/compare` route, and ISR-readiness is a stated requirement.
 *
 * REDIRECTS (`SPEC.md` §6): these URLs are permanent. Two families:
 *   1. `/team/{abbr}` -> the franchise's most recent season.
 *   2. Legacy franchise codes -> the canonical current-franchise route, both
 *      with and without a season: `/team/oak/2003` -> `/team/lv/2003`.
 * Both are emitted with an explicit `statusCode: 301` rather than Next's default
 * `permanent: true` (which is 308), because SPEC §6 names 301 and these are
 * GET-only document URLs where the method-preservation argument for 308 does
 * not apply.
 */

const REPO = path.resolve(process.cwd(), '..');

/**
 * The most recent season per franchise, read from the results mart.
 *
 * `redirects()` is evaluated by the Next CLI before any app code exists, so it
 * cannot await the data layer. It reads the same mart the database is seeded
 * from — never a second source of truth — and falls back to the snapshot's last
 * season if the file is not on disk (a deploy that ships only `web/`).
 */
function latestSeasonByTeam(): Map<string, number> {
  const out = new Map<string, number>();
  const file = path.join(REPO, 'data', 'marts', 'team_season_results.csv');
  if (!existsSync(file)) return out;
  try {
    const lines = readFileSync(file, 'utf8').split('\n');
    const header = lines[0].split(',');
    const iSeason = header.indexOf('season');
    const iTeam = header.indexOf('team');
    if (iSeason < 0 || iTeam < 0) return out;
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',');
      if (cols.length <= Math.max(iSeason, iTeam)) continue;
      const team = cols[iTeam];
      const season = Number(cols[iSeason]);
      if (!team || !Number.isInteger(season)) continue;
      if (!out.has(team) || out.get(team)! < season) out.set(team, season);
    }
  } catch {
    /* unreadable mid-write; the fallback below covers it */
  }
  return out;
}

/** Last resort when the mart is not on disk: the v1 snapshot ends in 2025. */
const SNAPSHOT_LAST_SEASON = 2025;

interface Rule {
  source: string;
  destination: string;
  statusCode: number;
}

function buildRedirects(): Rule[] {
  const latest = latestSeasonByTeam();
  const seasonOf = (abbr: string) => latest.get(abbr) ?? SNAPSHOT_LAST_SEASON;
  const rules: Rule[] = [];

  // 1. Legacy codes WITH a season — the more specific rule goes first.
  for (const [legacy, canonical] of Object.entries(LEGACY_ROUTE_REDIRECTS)) {
    const from = legacy.toLowerCase();
    const to = canonical.toLowerCase();
    rules.push({
      source: `/team/${from}/:season(\\d{4})`,
      destination: `/team/${to}/:season`,
      statusCode: 301,
    });
    // Straight to the canonical latest season, so a legacy bare-code URL costs
    // one redirect rather than two.
    rules.push({
      source: `/team/${from}`,
      destination: `/team/${to}/${seasonOf(canonical)}`,
      statusCode: 301,
    });
  }

  // 2. The 32 franchise entry points -> the franchise's most recent season.
  for (const abbr of CURRENT_TEAMS) {
    rules.push({
      source: `/team/${abbr.toLowerCase()}`,
      destination: `/team/${abbr.toLowerCase()}/${seasonOf(abbr)}`,
      statusCode: 301,
    });
  }

  return rules;
}

const nextConfig: NextConfig = {
  // Both carry native/WASM assets and must be required from node_modules rather
  // than bundled into the server chunks.
  serverExternalPackages: ['@electric-sql/pglite', 'postgres'],

  /**
   * IMAGES ARE SERVED BYTE-IDENTICAL. `DECISIONS.md` 62 instance 2 is ShareAlike
   * option (a): the asset pipeline stores Commons renditions untouched and the
   * duotone treatment happens in CSS at render time, so no fixed derivative is
   * ever created. Running them through the image optimizer would create one —
   * a re-encode is a derivative work — and would also add a runtime dependency
   * to a static-first build whose assets are already self-hosted and sized.
   * `COMPONENTS.md` §10 is written against this behaviour.
   */
  images: {
    unoptimized: true,
  },

  // `/compare` is the only route that cannot be enumerated (861 x 861 = 741k
  // ordered pairs). It renders on first request and is then cached at the edge
  // for the life of the data snapshot, which changes only on redeploy.
  async headers() {
    return [
      {
        source: '/compare',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, s-maxage=31536000, stale-while-revalidate=86400',
          },
        ],
      },
    ];
  },

  async redirects() {
    return buildRedirects();
  },

  // The PGlite dump is the local-first read path; trace it into the `/compare`
  // function so an on-demand render works without DATABASE_URL. With DATABASE_URL
  // set (Neon), the dump is unused and this include is inert.
  outputFileTracingIncludes: {
    '/compare': ['./.data/pgdata.tar.gz'],
  },
};

export default nextConfig;
