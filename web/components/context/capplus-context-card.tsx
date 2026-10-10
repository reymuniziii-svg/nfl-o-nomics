/**
 * "WHAT CAP+ CAN'T SEE" — the gate #1 reopen, made visible on the team page.
 * `SPEC.md` §2.10, `CAPPLUS_MEMO.md` §8, data `lib/data/context.ts`.
 *
 * Four readings, in the order a fan asks them:
 *  (a) who started at QB, and was he on his rookie deal — with the club's rank
 *      among clubs in the same position;
 *  (b) how much of Cap+ the QB's contract timing explains — usually about
 *      three points, which is the point;
 *  (c) what the roster has already charged to future caps, and what Cap+ would
 *      read if half of that were billed now (a CANDIDATE, printed beside Cap+);
 *  (d) the franchise's Cap+ era with the rookie windows shaded.
 *
 * Server component. Blank seasons render their reason strings; nothing is
 * dropped silently (`SPEC.md` §1.2).
 */

import css from './context.module.css';
import { CapPlusDecomposition } from './decomposition';
import { FutureMortgage } from './mortgage';
import { QbWindowTimeline } from './qb-window-timeline';
import { ordinal, signedIndex } from '../team/format';
import { usdShort } from '@/lib/display';
import type { Metric } from '@/lib/metric';
import type { CapPlusContext, LeagueContextRow, StrataSummary } from '@/lib/data/context';

/** `CAPPLUS_MEMO.md` §8.1 — the pooled 2013–2025 measurement the caption cites. */
const ROOKIE_WINDOW_MEAN_QB_PTS = 2.8;
const ROOKIE_WINDOW_N = 100;

export function CapPlusContextBody({
  context,
  series,
  strata,
  league,
  season,
  teamName,
}: {
  context: Metric<CapPlusContext>;
  series: Metric<CapPlusContext[]>;
  strata: Metric<StrataSummary>;
  league: Metric<LeagueContextRow[]>;
  season: number;
  teamName: string;
}) {
  if (context.state === 'blank') {
    return <p className={`yy-caption ${css.blank}`}>{context.reason}</p>;
  }
  const c = context.value;
  const ix = c.indices;

  // League mortgage median and this club's rank — an ordering of published values.
  let medianShare: number | null = null;
  let mortRank: number | null = null;
  let n = 32;
  if (league.state !== 'blank') {
    const shares = league.value.map((r) => r.futureMortgageShare).sort((a, b) => a - b);
    n = shares.length;
    const m = Math.floor(shares.length / 2);
    medianShare = shares.length % 2 ? shares[m] : (shares[m - 1] + shares[m]) / 2;
    mortRank = 1 + shares.filter((v) => v > c.futureMortgageShare).length;
  }

  const stratumName = c.qbRookieWindow ? 'rookie-window' : 'veteran-QB';

  return (
    <div className={css.body}>
      {/* (a) THE QUARTERBACK */}
      <section className={css.block} aria-label="Starting quarterback">
        <p className={`yy-label ${css.blockLabel}`}>Starting QB · {season}</p>
        <p className={css.qbLine}>
          <span className={css.qbName}>{c.startingQb}</span>
          {c.qbRookieWindow ? (
            <span className={css.rChip} title="On the contract signed in his draft year, within four seasons of the draft">
              R<span className="yy-visually-hidden"> — on his rookie deal</span>
            </span>
          ) : (
            <span className={`yy-label ${css.qbVet}`}>Veteran deal</span>
          )}
        </p>
        <p className={`yy-label ${css.qbMeta}`}>
          Cap number {usdShort(c.qbCapNumber)} · {(c.qbCapShare * 100).toFixed(1)}% of the league cap ·
          median starter {usdShort(c.leagueMedianStarterQbCap)}
        </p>
        {/* The stratum rank is a Cap+ rank: on a blanked season the
            decomposition beside it states the reason once, rather than this
            line repeating it. */}
        {ix.state === 'blank' ? null : (
          <p className={css.stratum}>
            <span className={`yy-num ${css.stratumRank}`}>{ordinal(ix.value.stratumRank)}</span>
            <span className={`yy-label ${css.stratumUnit}`}>
              of {c.stratumSize} {stratumName} teams on Cap+
            </span>
          </p>
        )}
      </section>

      {/* (b) THE DECOMPOSITION */}
      <section className={css.block} aria-label="Where Cap+ came from">
        <p className={`yy-label ${css.blockLabel}`}>Where the {ix.state === 'blank' ? 'index' : ix.value.capplus.toFixed(1)} came from</p>
        {ix.state === 'blank' ? (
          <p className={`yy-caption ${css.blank}`}>{ix.reason}</p>
        ) : (
          <>
            <CapPlusDecomposition
              capplus={ix.value.capplus}
              rosterPts={ix.value.rosterPts}
              qbTimingPts={ix.value.qbTimingPts}
              qbNeutral={ix.value.capplusQbNeutral}
            />
            <p className={`yy-caption ${css.caption}`}>
              QB contract timing is worth {signedIndex(ix.value.qbTimingPts)} here. For a rookie-deal
              starter it averages about three points (+{ROOKIE_WINDOW_MEAN_QB_PTS} across{' '}
              {ROOKIE_WINDOW_N} team-seasons since 2013) — a fifth of one standard deviation. Cap+
              rewards a cheap quarterback far less than the debate assumes; it rewards winning.
              {strata.state !== 'blank' &&
              strata.value.rookieWindow.state !== 'blank' &&
              strata.value.veteran.state !== 'blank'
                ? ` In ${season}: rookie-window clubs ${signedIndex(strata.value.rookieWindow.value.meanQbTimingPts)} on average (${strata.value.rookieWindow.value.n} clubs), veteran-QB clubs ${signedIndex(strata.value.veteran.value.meanQbTimingPts)} (${strata.value.veteran.value.n}).`
                : ''}
            </p>
          </>
        )}
      </section>

      {/* (c) THE MORTGAGE + the candidate beside Cap+ */}
      <section className={css.block} aria-label="Future-cap mortgage">
        <p className={`yy-label ${css.blockLabel}`}>Already charged to future caps</p>
        <FutureMortgage
          usd={c.futureMortgageUsd}
          share={c.futureMortgageShare}
          leagueMedianShare={medianShare}
          rank={mortRank}
          n={n}
          rowsUnknown={c.mortgageRowsUnknown}
          alpha={c.mortgageAlpha}
          indices={ix}
        />
      </section>

      {/* (d) THE FRANCHISE'S WINDOWS */}
      <section className={`${css.block} ${css.blockWide}`} aria-label="Rookie-QB windows">
        <p className={`yy-label ${css.blockLabel}`}>
          {teamName} · Cap+ vs QB-neutral, {series.state === 'blank' ? '' : `${series.value[0]?.season}–${series.value[series.value.length - 1]?.season}`}
        </p>
        {series.state === 'blank' ? (
          <p className={`yy-caption ${css.blank}`}>{series.reason}</p>
        ) : (
          <>
            <QbWindowTimeline series={series.value} currentSeason={season} teamName={teamName} />
            <p className={`yy-caption ${css.caption}`}>
              Where the two lines part, the quarterback&rsquo;s contract moved Cap+.{' '}
              {windowSentence(series.value)} The record starts in 2013, the first season with
              league-wide contract data.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

/** The franchise's own rookie-window gap, in words — never asserted, always measured. */
function windowSentence(rows: CapPlusContext[]): string {
  const rookie = rows.filter((r) => r.qbRookieWindow && r.indices.state !== 'blank');
  if (!rookie.length) {
    return 'No starter here was on his rookie deal in a covered season.';
  }
  const gaps = rookie.map((r) => (r.indices.state === 'blank' ? 0 : r.indices.value.qbTimingPts));
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return `Across ${rookie.length} covered rookie-deal season${rookie.length === 1 ? '' : 's'} the gap averages ${signedIndex(mean)} points.`;
}
