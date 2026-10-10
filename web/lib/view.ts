/**
 * View models — the thin layer that turns a data-layer bundle into component
 * props.
 *
 * It exists so a page file contains routing and composition and nothing else,
 * and so the two surfaces that render the same card (`/`, `/division/{div}` and
 * `/team/{abbr}/{season}`) cannot drift in how they build its rows.
 *
 * Nothing here queries. Nothing here computes a published metric.
 */

import type { CpwRow } from '@/components/receipt/cost-per-win-card';
import { blank, value, type Metric } from '@/lib/metric';
import type { CostPerWin } from '@/lib/data/metrics';
import { nickname, recordDash, usdShort, type Coverage } from '@/lib/display';
import { eraIdentity, type TeamAbbr } from '@/lib/teams';

/**
 * `DivisionSummary` → the Receipt's rows.
 *
 * The ZERO-WIN RULE arrives here already applied by `getCostPerWin`: a club with
 * no wins carries `perWin: null` and a `zeroWinLabel`, and this maps it to the
 * card's own `suppressed` state. The ratio is never Infinity, never "N/A",
 * never a blank cell (`SPEC.md` §2.5).
 */
export interface ReceiptSource {
  season: number;
  teams: {
    team: TeamAbbr;
    wins: number;
    losses: number;
    ties: number;
    costPerWin: Metric<CostPerWin>;
  }[];
}

export function receiptRows(division: ReceiptSource, linked = true): CpwRow[] {
  return division.teams.map((t) => {
    const season = division.season;
    const abbr = t.team;
    const era = eraIdentity(abbr, season);
    const record = recordDash(t.wins, t.losses, t.ties);

    let costPerWin: CpwRow['costPerWin'];
    let spend: Metric<number>;

    if (t.costPerWin.state === 'blank') {
      costPerWin = blank<number>(t.costPerWin.reason);
      spend = blank<number>(t.costPerWin.reason);
    } else {
      const c = t.costPerWin.value;
      spend = value(c.spend);
      costPerWin =
        c.perWin === null
          ? {
              state: 'suppressed',
              reason: 'zero-wins',
              spendLabel: c.zeroWinLabel ?? `${usdShort(c.spend)} spent · 0 wins`,
            }
          : value(c.perWin);
    }

    return {
      abbr,
      nickname: nickname(abbr, season),
      fullName: era.name,
      record,
      wins: t.wins,
      season,
      href: linked ? `/team/${abbr.toLowerCase()}/${season}` : null,
      spend,
      costPerWin,
    };
  });
}

/** The coverage statement every Receipt carries (`COMPONENTS.md` rule 3). */
export function receiptCoverage(season: number, teams: number): Coverage {
  return {
    statement:
      `Cost per win for ${teams} clubs in ${season}. Contract, cap and cash data start in 2013. ` +
      'A club with no wins shows its total spend and sits out the ratio ranking.',
  };
}

/** `SPEC.md` §3.1 item 1 — stated below the division picker, always. */
export const ALIGNMENT_NOTE = 'Current alignment only. We don’t model the 2002 realignment.';

export function teamHref(abbr: TeamAbbr | string, season: number): string {
  return `/team/${String(abbr).toLowerCase()}/${season}`;
}
