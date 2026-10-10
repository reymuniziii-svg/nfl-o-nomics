/**
 * `VerdictStrip` — the team page's first card (review D #1).
 *
 * The page exists to answer "was it worth it?" and v1 answered it in the sixth
 * card, 3,359px down a phone. This card answers it in one line —
 * `6 wins · $318.8M cash · $53.1M per win · 29th of 32 · 60% over league` — and
 * then does the thing v1 never did: when Cap+ and cost per win point in opposite
 * directions it says WHY, in one sentence built from the three performance
 * inputs' own ranks, so a fan does not conclude the site is broken.
 *
 * Every figure is read from a mart or is display arithmetic over mart columns
 * (a ratio of two published sums, an ordering). No index is recomputed.
 *
 * Server component: nothing here holds state.
 */

import css from './team.module.css';
import { BlankReason, Chip } from '../primitives';
import { ordinal, signedIndex, vsLeague } from './format';
import { usdShort } from '@/lib/display';
import { PROVISIONAL_BADGE_COPY, type Metric } from '@/lib/metric';
import type { CostPerWin, CapPlusValue } from '@/lib/data/metrics';
import type { SeasonInputRanks, TeamResults, TeamEpa } from '@/lib/data/team';

export interface VerdictProps {
  teamName: string;
  season: number;
  inTier2: boolean;
  results: Metric<TeamResults>;
  epa: Metric<TeamEpa>;
  /** Cash numerator — the default lens (`SPEC.md` §2.5). */
  cashPerWin: Metric<CostPerWin>;
  leagueCashPerWin: Metric<number>;
  /** Rank by cash per win, cheapest = 1st, among clubs with a ratio. */
  cpwRank: { rank: number; n: number } | null;
  capplus: Metric<CapPlusValue>;
  teamRating: Metric<number>;
  inputRanks: Metric<SeasonInputRanks>;
  /** `capplus_context.qb_timing_pts`, where the season is covered. */
  qbTimingPts: number | null;
}

export function VerdictStrip(p: VerdictProps) {
  const res = p.results.state === 'blank' ? null : p.results.value;
  const wins = res?.wins ?? null;

  return (
    <div className={css.verdict}>
      <p className={css.verdictLine}>
        {wins !== null ? <Item n={String(wins)} unit={wins === 1 ? 'win' : 'wins'} /> : null}
        {p.inTier2 ? <DollarItems {...p} /> : <PreTier2Items {...p} />}
      </p>

      {p.inTier2 ? <Reconcile {...p} /> : null}

      <dl className={css.verdictStats}>
        <Stat label="Record" value={res ? recordOf(res) : '—'} />
        <Stat
          label="Point diff"
          value={res ? signedInt(res.pointDiff) : '—'}
          note={rankNote(p.inputRanks, (r) => r.pointDiffRank)}
        />
        <Stat
          label="EPA margin / play"
          value={p.epa.state === 'blank' ? p.epa.reason : p.epa.value.epaMarginPerPlay.toFixed(3)}
          note={
            p.inputRanks.state !== 'blank' && p.inputRanks.value.epaMarginRank.state !== 'blank'
              ? `${ordinal(p.inputRanks.value.epaMarginRank.value)} of ${p.inputRanks.value.n}`
              : undefined
          }
        />
        {p.inTier2 ? (
          <Stat
            label="Cap+"
            value={p.capplus.state === 'blank' ? p.capplus.reason : p.capplus.value.capplus.toFixed(1)}
            note={
              p.capplus.state === 'blank'
                ? undefined
                : `${ordinal(p.capplus.value.seasonRank)} of 32 · 100 = league avg`
            }
            chip={p.capplus.state === 'value' && p.capplus.provisional ? 'provisional' : undefined}
          />
        ) : null}
        {!p.inTier2 || p.capplus.state === 'blank' ? (
          <Stat
            label="Team rating"
            value={p.teamRating.state === 'blank' ? p.teamRating.reason : p.teamRating.value.toFixed(1)}
            note="Performance only"
          />
        ) : null}
      </dl>

      {p.capplus.state === 'value' && p.capplus.provisional ? (
        <p className={`yy-caption ${css.verdictNote}`}>Provisional Cap+: {PROVISIONAL_BADGE_COPY}</p>
      ) : null}
    </div>
  );
}

function DollarItems(p: VerdictProps) {
  if (p.cashPerWin.state === 'blank') {
    return (
      <span className={css.verdictBlank}>
        <BlankReason reason={p.cashPerWin.reason} inline />
      </span>
    );
  }
  const c = p.cashPerWin.value;
  const avg = p.leagueCashPerWin.state === 'blank' ? null : p.leagueCashPerWin.value;
  return (
    <>
      <Item n={usdShort(c.spend)} unit="cash" />
      {c.perWin === null ? (
        // ZERO-WIN RULE (`SPEC.md` §2.5): no ratio, no rank — the spend and the zero say it.
        <Item n="No ratio" unit={c.zeroWinLabel ?? '0 wins'} />
      ) : (
        <>
          <Item n={usdShort(c.perWin)} unit="cash per win" lead />
          {p.cpwRank ? <Item n={ordinal(p.cpwRank.rank)} unit={`of ${p.cpwRank.n}`} /> : null}
          {avg !== null ? <VsLeagueItem v={c.perWin} avg={avg} /> : null}
        </>
      )}
    </>
  );
}

function VsLeagueItem({ v, avg }: { v: number; avg: number }) {
  const words = vsLeague(v, avg);
  const [n, ...rest] = words.split(' ');
  return rest.length && n.endsWith('%') ? <Item n={n} unit={rest.join(' ')} /> : <Item n="At" unit="league average" />;
}

function PreTier2Items(p: VerdictProps) {
  return (
    <>
      {p.teamRating.state !== 'blank' ? (
        <Item n={p.teamRating.value.toFixed(1)} unit="team rating" lead />
      ) : null}
      <span className={`yy-label ${css.verdictUnit}`}>· No dollar figures before 2013</span>
    </>
  );
}

function Item({ n, unit, lead = false }: { n: string; unit: string; lead?: boolean }) {
  return (
    <span className={css.verdictItem}>
      <span className={`yy-num ${lead ? css.verdictLead : css.verdictNum}`}>{n}</span>
      <span className={`yy-label ${css.verdictUnit}`}>{unit}</span>
    </span>
  );
}

function Stat({
  label,
  value,
  note,
  chip,
}: {
  label: string;
  value: string;
  note?: string;
  chip?: 'provisional';
}) {
  return (
    <div className={css.verdictStat}>
      <dt className={`yy-label ${css.verdictStatLabel}`}>{label}</dt>
      <dd className={css.verdictStatValue}>
        <span className={`yy-num ${value.startsWith('Not available') ? css.verdictStatBlank : ''}`}>
          {value}
        </span>
        {chip ? (
          <span className={css.chipFloor}>
            <Chip kind={chip} />
          </span>
        ) : null}
      </dd>
      {note ? <dd className={`yy-label ${css.verdictStatNote}`}>{note}</dd> : null}
    </div>
  );
}

/**
 * THE RECONCILIATION — rendered only when the two headline measures disagree.
 *
 * Cap+ blends win %, point differential per game and EPA margin per play, then
 * divides by cap cost (`SPEC.md` §2.2, §2.4). Cost per win divides CASH by WINS.
 * So they part company in exactly two ways: the performance inputs other than
 * wins run ahead of (or behind) the record, or cap cost sits away from the
 * league average. The sentence names whichever of the two the marts show.
 */
function Reconcile(p: VerdictProps) {
  if (p.capplus.state === 'blank' || p.cashPerWin.state === 'blank' || p.leagueCashPerWin.state === 'blank')
    return null;
  const cp = p.capplus.value;
  const perWin = p.cashPerWin.value.perWin;
  if (perWin === null) return null;
  const avg = p.leagueCashPerWin.value;
  const rel = (perWin - avg) / avg;
  const capHigh = cp.capplus >= 100;
  const cpwDear = rel > 0.02;
  const cpwCheap = rel < -0.02;
  if (!(capHigh && cpwDear) && !(!capHigh && cpwCheap)) return null;

  const ranks = p.inputRanks.state === 'blank' ? null : p.inputRanks.value;
  const n = ranks?.n ?? 32;
  const epaRank =
    ranks && ranks.epaMarginRank.state !== 'blank' ? ranks.epaMarginRank.value : null;

  const reasons: string[] = [];
  if (ranks) {
    const ahead = (r: number) => (capHigh ? r < ranks.winPctRank : r > ranks.winPctRank);
    const drivers = [
      ahead(ranks.pointDiffRank) ? `point differential (${ordinal(ranks.pointDiffRank)})` : null,
      epaRank !== null && ahead(epaRank) ? `EPA margin (${ordinal(epaRank)})` : null,
    ].filter(Boolean);
    if (drivers.length) {
      reasons.push(
        `${drivers.join(' and ')} ${capHigh ? 'outran' : 'trailed'} the record (${ordinal(ranks.winPctRank)} of ${n} on win %)`,
      );
    }
  }
  const costPct = Math.round(Math.abs(cp.rRec - 1) * 100);
  if (capHigh ? cp.rRec < 0.99 : cp.rRec > 1.01) {
    reasons.push(
      `its cap cost ran ${costPct}% ${cp.rRec < 1 ? 'below' : 'above'} the league average${
        cp.wasFloored ? ' (floored at the 25th percentile)' : ''
      }`,
    );
  }

  const lead = `Cap+ is ${cp.capplus.toFixed(1)}, ${capHigh ? 'above' : 'below'} 100,`;
  const body = reasons.length
    ? ` because ${reasons.join(', and ')}.`
    : ' because it scores point differential and EPA margin as well as wins.';
  const tail = ' Cost per win counts wins only, and prices them in cash, not cap.';

  return (
    <p className={`yy-caption ${css.verdictReconcile}`}>
      <span className={`yy-label ${css.verdictReconcileTag}`}>Why they disagree</span>
      {lead}
      {body}
      {tail}
      {p.qbTimingPts !== null
        ? ` Of the ${signedIndex(cp.capplus - 100)}, the quarterback’s contract accounts for ${signedIndex(p.qbTimingPts)}.`
        : ''}
    </p>
  );
}

function recordOf(r: TeamResults): string {
  return r.ties ? `${r.wins}–${r.losses}–${r.ties}` : `${r.wins}–${r.losses}`;
}

function signedInt(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

function rankNote(
  m: Metric<SeasonInputRanks>,
  pick: (r: SeasonInputRanks) => number,
): string | undefined {
  return m.state === 'blank' ? undefined : `${ordinal(pick(m.value))} of ${m.value.n}`;
}
