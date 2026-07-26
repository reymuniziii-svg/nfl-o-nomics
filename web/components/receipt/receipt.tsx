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
 * toggles and then rotates does not find a stale lens.
 *
 * `SPEC.md` §2.5 / `DECISIONS.md` 29: the default numerator is CASH.
 */

import { useState } from 'react';
import css from './receipt.module.css';
import { CostPerWinCard, type CpwRow, type Numerator } from './cost-per-win-card';
import type { Metric } from '@/lib/metric';
import type { Coverage } from '@/lib/display';

export interface ReceiptProps {
  title: string;
  /** The wide composition names the question as well as the scope. */
  wideTitle?: string;
  season: number;
  rows: Record<Numerator, CpwRow[]>;
  leagueAvg: Record<Numerator, Metric<number>>;
  subject?: string;
  sample?: boolean;
  coverage: Coverage;
}

export function Receipt({
  title,
  wideTitle,
  season,
  rows,
  leagueAvg,
  subject,
  sample,
  coverage,
}: ReceiptProps) {
  const [numerator, setNumerator] = useState<Numerator>('cash');

  const shared = {
    season,
    subject,
    sample,
    coverage,
    numerator,
    onNumeratorChange: setNumerator,
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
