'use client';

/**
 * The Receipt as it appears in the product: the mobile composition below
 * 1024px and the wide composition at and above it.
 *
 * `MOBILE_PATTERNS.md` §5/§8: *"the mobile and desktop compositions are
 * different components, not one component at two widths"* — the two sizes drop
 * different columns, carry different sub-line content and write the delta
 * differently, so they are two renders of the one component, switched by the
 * single breakpoint. The **numerator state is lifted here** so a reader who
 * toggles and then rotates does not find a stale lens — and, on the home and
 * division views, lifted once more into the shared link state so the address
 * bar (`?n=cap`) and the leaderboard follow it.
 *
 * THE DOMAIN IS PINNED. `CHART_ANATOMY.md` §6.1: if the scale domain changes,
 * nothing animates. One domain covers BOTH numerators (and, given `league`,
 * all 32 clubs), so the Cash ⇄ Cap toggle moves bars along a fixed scale and
 * the width transition is a true reading of the change.
 *
 * `SPEC.md` §2.5 / `DECISIONS.md` 29: the default numerator is CASH.
 */

import { useMemo, useState } from 'react';
import css from './receipt.module.css';
import { CostPerWinCard, type CpwRow, type LeagueRank, type Numerator } from './cost-per-win-card';
import { metricValue } from '@/lib/display';
import type { Metric } from '@/lib/metric';
import type { Coverage } from '@/lib/display';
import { useHasLeagueLink, useLeagueLink } from '../leaderboard/league-link';

/** Every club's ratio for the season under one numerator. Zero-win clubs are absent. */
export interface LeagueRatios {
  ratios: { abbr: string; perWin: number }[];
}

export interface ReceiptProps {
  title: string;
  /** The wide composition names the question as well as the scope. */
  wideTitle?: string;
  season: number;
  rows: Record<Numerator, CpwRow[]>;
  leagueAvg: Record<Numerator, Metric<number>>;
  /**
   * All 32 clubs' ratios, per numerator. Given, the bars share one LEAGUE-WIDE
   * domain for the season (so two divisions' screenshots compare), every track
   * carries a ghost tick per club, and each figure carries its league rank.
   */
  league?: Record<Numerator, LeagueRatios>;
  subject?: string;
  sample?: boolean;
  coverage: Coverage;
}

const STEP = 5_000_000;

function ratiosOf(rows: CpwRow[]): number[] {
  return rows
    .map((r) => (r.costPerWin.state === 'suppressed' ? null : metricValue(r.costPerWin)))
    .filter((v): v is number => v !== null && Number.isFinite(v));
}

export function Receipt({
  title,
  wideTitle,
  season,
  rows,
  leagueAvg,
  league,
  subject,
  sample,
  coverage,
}: ReceiptProps) {
  const linked = useHasLeagueLink();
  const link = useLeagueLink(season);
  const [local, setLocal] = useState<Numerator>('cash');
  const numerator = linked ? link.numerator : local;
  const setNumerator = linked ? link.setNumerator : setLocal;

  const pinned = useMemo(() => {
    const all = league
      ? [...league.cash.ratios, ...league.cap.ratios].map((r) => r.perWin)
      : [...ratiosOf(rows.cash), ...ratiosOf(rows.cap)];
    const bench = (['cash', 'cap'] as const)
      .map((n) => metricValue(leagueAvg[n]))
      .filter((v): v is number => v !== null);
    const max = Math.max(0, ...all, ...bench);
    const domainMax = Math.max(STEP, Math.ceil((max * 1.05) / STEP) * STEP);

    const rank = (n: Numerator): Record<string, LeagueRank> => {
      if (!league) return {};
      const sorted = [...league[n].ratios].sort((a, b) => a.perWin - b.perWin);
      return Object.fromEntries(sorted.map((r, i) => [r.abbr, { rank: i + 1, of: sorted.length }]));
    };

    return {
      domainMax,
      ghosts: {
        cash: league ? league.cash.ratios.map((r) => r.perWin) : undefined,
        cap: league ? league.cap.ratios.map((r) => r.perWin) : undefined,
      },
      ranks: { cash: rank('cash'), cap: rank('cap') },
    };
  }, [league, rows, leagueAvg]);

  const shared = {
    season,
    subject,
    sample,
    coverage,
    numerator,
    onNumeratorChange: setNumerator,
    domainMax: pinned.domainMax,
    ghosts: pinned.ghosts[numerator],
    leagueRank: league ? pinned.ranks[numerator] : undefined,
  };

  return (
    <>
      <div className={css.atMobile}>
        <CostPerWinCard
          {...shared}
          size="mobile"
          title={title}
          rows={rows[numerator]}
          leagueAvg={leagueAvg[numerator]}
        />
      </div>
      <div className={css.atDesktop}>
        <CostPerWinCard
          {...shared}
          size="wide"
          title={wideTitle ?? title}
          rows={rows[numerator]}
          leagueAvg={leagueAvg[numerator]}
        />
      </div>
    </>
  );
}
