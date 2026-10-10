/**
 * Team-page blocks: the header (`COMPONENTS.md` §3), the three-lens summary
 * (§6) and the dead-money ledger (§8.3).
 *
 * All three are server components: none of them holds state, and two of them
 * carry text that `SPEC.md` forbids hiding behind an interaction, so there is
 * nothing here to hydrate.
 */

import Link from "next/link";
import css from "./team.module.css";
import { AsOf, BlankReason, Chip, IndexBadge, MetricText } from "../primitives";
import { TeamMark } from "../marks";
import { IconChevronLeft } from "../icons";
import { partialSuffix, usdShort } from "@/lib/display";
import { ledgerSplit } from "@/lib/format";
import { NOT_A_32_TEAM_READING, type Metric } from "@/lib/metric";
import type { TeamMark as TeamMarkData } from "@/lib/marks";
import type { LedgerRow, Lens } from "@/lib/data/team";

/* ══════════════════════════════════════════════════════════════════════════ */
/* §3 TEAM HEADER — the mockup's composition plus the four things it omits     */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * THE DUAL NAMING (`DECISIONS.md` 83). The badge's label is not always `CAP+`:
 *
 *  - 2013–2025, covered      → `CAP+`, band-colored
 *  - 2013–2025, blanked      → `CAP+` and `—`, neutral, blank reason beneath
 *  - 1999–2012               → `TEAM RATING` + `PERFORMANCE ONLY`, **never
 *    band-colored** — the bands are a Cap+ encoding, and applying them to a
 *    performance-only rating tells the reader the two numbers are the same
 *    metric.
 *
 * The two indexes never share a badge, a color or a label.
 */
export function TeamHeader({
  name,
  identityLine,
  mark,
  capplus,
  teamRating,
  season,
  tier2FirstSeason,
  backHref,
  stepper,
  actions,
}: {
  name: string;
  identityLine: string;
  mark: TeamMarkData | null;
  capplus: Metric<number>;
  teamRating: Metric<number>;
  season: number;
  tier2FirstSeason: number;
  backHref: string;
  /** Prev / next season arrows (`SeasonStepper`). */
  stepper?: React.ReactNode;
  /** Header actions — the share button where one exists. */
  actions?: React.ReactNode;
}) {
  const inTier2 = season >= tier2FirstSeason;

  return (
    <>
      <header className={css.header}>
        <Link
          className={css.back}
          href={backHref}
          aria-label="Back to the league view"
        >
          <IconChevronLeft size={24} />
        </Link>
        <div className={css.identity}>
          <TeamMark mark={mark} size="sm" />
          <div className={css.identityText}>
            <h1 className={css.name}>{name}</h1>
            <p className={`yy-label ${css.identityLine}`}>{identityLine}</p>
          </div>
        </div>
        {/* THE INDEX RULE (`COMPONENTS.md` §3): the SEASON decides which index
        the badge carries. Inside Tier 2 that is Cap+ — but where Cap+ is
        blanked, dropping Team Rating entirely loses a figure that exists for
        all 861 team-seasons and that `/compare` already renders for the same
        team-season. `CAPPLUS_MEMO.md` §4: "The four uncovered seasons inside
        the Cap+ era get the same treatment" as the pre-2013 pages. So the Cap+
        slot states its blank in full, and Team Rating renders beside it under
        its own name and without band color (`DECISIONS.md` 83). */}
        <div className={css.badges}>
          <IndexBadge
            metric={inTier2 ? capplus : teamRating}
            scale="header"
            metricName={inTier2 ? "capplus" : "teamRating"}
          />
          {inTier2 && capplus.state === "blank" ? (
            <IndexBadge
              metric={teamRating}
              scale="header"
              metricName="teamRating"
            />
          ) : null}
        </div>
      </header>
      {stepper || actions ? (
        <div className={css.headerTools}>
          {stepper}
          {actions ? <div className={css.headerActions}>{actions}</div> : null}
        </div>
      ) : null}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §6 THREE-LENS SUMMARY — three figures, three caveats                       */
/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * The product's stated discipline: it never says "spending" without saying which
 * lens. Each caveat is ALWAYS VISIBLE — there is no disclosure on this block.
 *
 * The as-of strap is DEAD MONEY ONLY and it is mandatory: it renders inline on
 * the same line as the figure, never beneath it and never truncated.
 *
 * Copy that is forbidden here and everywhere `[C5]`: "cap used", "cap
 * utilization", "% of cap", "where $233M goes".
 */
export function ThreeLens({ lenses }: { lenses: Lens[] }) {
  return (
    <div className={css.lenses}>
      {lenses.map((lens) => (
        <div className={css.lens} key={lens.key}>
          <p className={`yy-label-lg ${css.lensName}`}>{lens.label}</p>

          {lens.key === "dead_money" ? (
            lens.amount.state === "blank" ? (
              <BlankReason reason={lens.amount.reason} />
            ) : lens.asOf ? (
              <>
                <AsOf
                  value={usdShort(lens.amount.value)}
                  date={lens.asOf.date}
                  stage={lens.asOf.stage}
                  valueClass={`yy-num ${css.lensFigure}`}
                />
                {/* `SPEC.md` §2.8 / `CAPPLUS_MEMO.md` §3 — the season's league
                  median renders BESIDE the figure. $85.2M is an indictment on
                  its own and an unremarkable number against a $50.3M median,
                  and the memo's defense of λ=1.5 rests on the reader seeing the
                  second one. */}
                {lens.leagueMedianUsd !== null ? (
                  <span className={`yy-label ${css.lensBenchmark}`}>
                    League median {usdShort(lens.leagueMedianUsd)} this season
                  </span>
                ) : null}
                {/* `SPEC.md` §1.2 — a partial season is labeled partial. A
                  leaders-list figure looks exactly like a league-wide one
                  unless the surface says otherwise. */}
                {lens.amount.state === "partial" ? (
                  <span className={`yy-label ${css.lensPartial}`}>
                    {NOT_A_32_TEAM_READING}{" "}
                    <span className="yy-partial-ink">
                      {partialSuffix(lens.amount)}
                    </span>
                  </span>
                ) : null}
              </>
            ) : (
              /* A dead-money key without an as-of date is a build-time test
                 failure (`SPEC.md` §2.1 rule 1); if one ever reaches the view it
                 says so rather than printing a bare figure. */
              <BlankReason reason="Not available — this reading has no recorded as-of date, so it cannot be shown." />
            )
          ) : (
            <MetricText
              metric={lens.amount}
              className={`yy-num ${css.lensFigure}`}
              format={(v) => usdShort(v)}
            />
          )}

          <p className={`yy-caption ${css.lensCaveat}`}>{lens.caveat}</p>
          {lens.amount.state === "partial" ? (
            <p className={`yy-caption ${css.lensCaveat}`}>
              {lens.amount.reason}
            </p>
          ) : null}
          {lens.sourceUrl ? (
            <a
              className={`yy-label ${css.lensSource}`}
              href={lens.sourceUrl}
              rel="noopener noreferrer"
              target="_blank"
            >
              Source
            </a>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* §8.3 DEAD-MONEY LEDGER                                                      */
/* ══════════════════════════════════════════════════════════════════════════ */

export interface LedgerViewRow extends LedgerRow {
  team: string;
}

export function DeadMoneyLedger({ rows }: { rows: LedgerViewRow[] }) {
  if (!rows.length) {
    return (
      <BlankReason reason="Not available — the ledger lists no marquee dead-money charge for this club." />
    );
  }

  return (
    <>
      {/* mobile — the row-card list */}
      <div className={css.ledgerCards}>
        {rows.map((r) => (
          <div className={css.ledgerCard} key={`${r.player}-${r.seasons}`}>
            <div className={css.ledgerCardHead}>
              <span className={css.ledgerPlayer}>{r.player}</span>
              <span className={`yy-label ${css.ledgerMeta}`}>
                {r.team} · {r.seasons}
              </span>
            </div>
            <AsOf
              value={usdShort(r.totalUsd)}
              date={r.verifiedAsof}
              stage="ledger"
            />
            <LedgerSplit row={r} />
            <div className={css.chipRow}>
              <span className={css.chipFloor}>
                <Chip kind={r.isActual ? "verified" : "projected"} />
              </span>
              <a
                className={`yy-label ${css.source}`}
                href={r.sourceUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Source
              </a>
            </div>
          </div>
        ))}
      </div>

      {/* desktop — the real table */}
      <div className={css.ledgerTableWrap}>
        <table className={css.ledger}>
          <thead>
            <tr>
              <th scope="col" className="yy-label-lg">
                Player
              </th>
              <th scope="col" className="yy-label-lg">
                Team
              </th>
              <th scope="col" className="yy-label-lg">
                Seasons
              </th>
              <th scope="col" className="yy-label-lg">
                Charge
              </th>
              <th scope="col" className="yy-label-lg">
                Standing
              </th>
              <th scope="col" className="yy-label-lg">
                Source
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.player}-${r.seasons}`}>
                <th scope="row" className="yy-label-lg">
                  {r.player}
                </th>
                <td className="yy-label">{r.team}</td>
                <td className="yy-label">{r.seasons}</td>
                <td className={css.ledgerNum}>
                  <AsOf
                    value={usdShort(r.totalUsd)}
                    date={r.verifiedAsof}
                    stage="ledger"
                  />
                  <LedgerSplit row={r} />
                </td>
                <td>
                  <span className={css.chipFloor}>
                    <Chip kind={r.isActual ? "verified" : "projected"} />
                  </span>
                </td>
                <td>
                  <a
                    className={`yy-label ${css.source}`}
                    href={r.sourceUrl}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {new URL(r.sourceUrl).hostname.replace(/^www\./, "")}
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * The per-season split, in dollars. NEVER AN INFERRED SPLIT (`SPEC.md` §2.7):
 * where none was published the row says so; a one-season split repeats the
 * total and renders nothing.
 */
function LedgerSplit({ row }: { row: LedgerViewRow }) {
  if (row.splitBySeason === null) {
    return (
      <span className={`yy-label ${css.noSplit}`}>
        Per-season split not established
      </span>
    );
  }
  const split = ledgerSplit(row.splitBySeason, row.seasons);
  return split ? (
    <span className={`yy-label ${css.ledgerMeta}`}>Split {split}</span>
  ) : null;
}

/* ══════════════════════════════════════════════════════════════════════════ */
/* Label / value pairs — the row-card detail block                            */
/* ══════════════════════════════════════════════════════════════════════════ */

export function Pairs({
  items,
}: {
  items: { label: string; value: React.ReactNode }[];
}) {
  return (
    <dl className={css.pairs}>
      {items.map((i) => (
        <div key={i.label} style={{ display: "contents" }}>
          <dt className={`yy-label ${css.pairKey}`}>{i.label}</dt>
          <dd className={`yy-num ${css.pairVal}`}>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatGrid({ children }: { children: React.ReactNode }) {
  return <div className={css.stats}>{children}</div>;
}
