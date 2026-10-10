import css from './roster-receipt.module.css';
import { usdShort } from '@/lib/display';
import type { Metric } from '@/lib/metric';
import type { RosterReceipt, ReceiptVerdict } from '@/lib/data/team';
import { DEAD_MONEY_WEIGHT } from '@/lib/data/team';

/**
 * THE ROSTER RECEIPT — review E1 / blind proposal §2 "The Receipt".
 *
 * The brand's "receipts" promise made literal: an itemized bill on off-white
 * paper. Top 12 cap hits with games beside them, every other contract on one
 * line so the subtotal reconciles to `team_season_cap` to the dollar, dead
 * money as struck-through VOID lines at the Cap+ weight, the floor's
 * "unspent cap, no credit", then what the money bought and the total.
 *
 * WHAT IT NEVER DOES: divide a player's cap by his games or his production.
 * The two sit side by side; the reader does the judging. A per-player ratio
 * is a player grade and `SPEC.md` forbids it.
 *
 * Two sizes, one composition:
 *   column   — fluid, 390px-first, caps at 440px. The in-page receipt.
 *   portrait — fixed 540 × 675 CSS px; rasterize at devicePixelRatio 2 for the
 *              1080 × 1350 portrait-feed PNG.
 *
 * The paper is a fixed light surface in both themes, so every color on it is
 * an `-ink` / `ink-light` token, never a theme-switching one.
 */

export type RosterReceiptSize = 'column' | 'portrait';

const MINUS = '−';

function signed(n: number, digits = 0): string {
  const s = Math.abs(n).toFixed(digits);
  return n > 0 ? `+${s}` : n < 0 ? `${MINUS}${s}` : s;
}

function record(w: number, l: number, t: number): string {
  return t ? `${w}–${l}–${t}` : `${w}–${l}`;
}

const STAMP_TONE: Record<ReceiptVerdict['quintile'], string> = {
  1: css.toneGood,
  2: css.toneGood,
  3: css.toneMid,
  4: css.toneBad,
  5: css.toneBad,
};

/** "STEAL ≤ $17.9M < WORTH IT ≤ $25.9M < …" — the cutoff rule in words. */
function cutoffLadder(v: ReceiptVerdict): string {
  const [a, b, c, d] = v.cutoffs.map(usdShort);
  return `Steal ≤ ${a} < Worth it ≤ ${b} < Fair price ≤ ${c} < Overpaid ≤ ${d} < Money pit.`;
}

export function RosterReceipt({
  receipt,
  size = 'column',
  fallbackTitle,
}: {
  receipt: Metric<RosterReceipt>;
  size?: RosterReceiptSize;
  /** Rendered as the heading when the receipt is blank ("Detroit Lions · 2008"). */
  fallbackTitle: string;
}) {
  const sizeClass = size === 'portrait' ? css.portrait : css.column;

  if (receipt.state === 'blank') {
    return (
      <div className={`${css.paper} ${sizeClass}`} data-export-root>
        <article className={css.sheet} aria-label={`${fallbackTitle} — roster receipt`}>
          <p className={css.kicker}>Roster receipt</p>
          <h2 className={css.team}>{fallbackTitle}</h2>
          <hr className={css.rule} />
          <p className={css.blank}>{receipt.reason}</p>
          <p className={css.blank}>No receipt is printed where there is no bill.</p>
          <footer className={css.foot}>
            <span className={css.mark} aria-hidden="true">
              YIELD<span className={css.markSlash}>/</span>YARD
            </span>
          </footer>
        </article>
      </div>
    );
  }

  const r = receipt.value;
  const res = r.results;
  const unlinkedGames = r.lines.some((l) => l.games.state === 'blank');
  const cpw = r.costPerWin.state === 'value' ? r.costPerWin.value : null;
  const lg = r.leagueCostPerWin.state !== 'blank' ? r.leagueCostPerWin.value : null;
  const verdict = r.verdict.state === 'value' ? r.verdict.value : null;
  /* The same blank reason prints once, on the dead-money line. */
  const deadReason = r.dead.state === 'blank' ? r.dead.reason : null;
  const reasonOnce = (reason: string) =>
    reason === deadReason ? 'not available without dead money.' : reason;

  return (
    <div className={`${css.paper} ${sizeClass}`} data-export-root>
      <article
        className={css.sheet}
        aria-label={`${r.identity.name} ${r.season} — roster receipt`}
      >
        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <header className={css.header}>
          <p className={css.kicker}>
            <span>Roster receipt</span>
            <span>No. {r.team}-{r.season}</span>
          </p>
          <h2 className={css.team}>{r.identity.name}</h2>
          <p className={css.meta}>
            {r.season} · HC {r.regime.state === 'value' ? r.regime.value : r.regime.reason}
            {r.snapshot
              ? ` · dead money as of ${r.snapshot.date} (${r.snapshot.stage.replace('_', ' ')})`
              : ' · dead money: no dated snapshot'}
          </p>
        </header>

        <hr className={css.rule} />

        {/* ── LINE ITEMS ─────────────────────────────────────────────── */}
        <table className={css.items}>
          <caption className={css.srOnly}>
            Top {r.lines.length} cap hits with games played beside each
          </caption>
          <thead>
            <tr>
              <th scope="col" className={css.colPos}>Pos</th>
              <th scope="col" className={css.colItem}>Item</th>
              <th scope="col" className={css.colNum}>G</th>
              <th scope="col" className={css.colNum}>Cap</th>
            </tr>
          </thead>
          <tbody>
            {r.lines.map((l, i) => (
              <tr key={`${l.player}-${i}`}>
                <td className={css.colPos}>{l.positionGroup ?? 'UNK'}</td>
                <td className={css.colItem}>
                  <span className={css.leader}>{l.player}</span>
                </td>
                <td className={css.colNum}>
                  {l.games.state === 'value' ? (
                    l.games.value
                  ) : (
                    <span title={l.games.reason}>n/r*</span>
                  )}
                </td>
                <td className={css.colNum}>{usdShort(l.capHit)}</td>
              </tr>
            ))}
            {r.others.count > 0 ? (
              <tr className={css.others}>
                <td className={css.colPos}>+{r.others.count}</td>
                <td className={css.colItem} colSpan={2}>
                  <span className={css.leader}>Other rostered contracts</span>
                </td>
                <td className={css.colNum}>{usdShort(r.others.capHit)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className={css.sum}>
          <span>Subtotal · roster cap ({r.rosterCount})</span>
          <span className={css.num}>{usdShort(r.rosterSubtotal)}</span>
        </div>

        {/* ── VOID + UNSPENT ─────────────────────────────────────────── */}
        {r.dead.state === 'blank' ? (
          <p className={css.blank}>Dead money: {r.dead.reason}</p>
        ) : (
          <div className={css.voids}>
            {r.dead.value.lines.map((v) => (
              <div className={css.void} key={v.label}>
                <span className={css.voidTag}>VOID</span>
                <span className={css.voidLabel}>
                  <s>
                    {v.label} {usdShort(v.usd)}
                  </s>{' '}
                  ×{DEAD_MONEY_WEIGHT}
                </span>
                <span className={css.num}>{usdShort(v.weighted)}</span>
              </div>
            ))}
            {r.dead.value.note ? <p className={css.fine}>{r.dead.value.note}</p> : null}
          </div>
        )}
        {r.unspent !== null ? (
          <div className={css.line}>
            <span>Unspent cap (no credit)</span>
            <span className={css.num}>{usdShort(r.unspent)}</span>
          </div>
        ) : null}
        {r.charged.state === 'value' ? (
          <div className={css.sum}>
            <span>Charged · Cap+ cost</span>
            <span className={css.num}>{usdShort(r.charged.value)}</span>
          </div>
        ) : (
          <p className={css.fine}>Cap+ cost: {reasonOnce(r.charged.reason)}</p>
        )}

        <hr className={css.rule} />

        {/* ── YOU GOT ────────────────────────────────────────────────── */}
        <section className={css.got} aria-label="What the money bought">
          <p className={css.section}>You got</p>
          <div className={css.line}>
            <span>Record · point diff</span>
            <span className={css.num}>
              {record(res.wins, res.losses, res.ties)} · {signed(res.pointDiff)}
            </span>
          </div>
          {r.epa.state === 'value' ? (
            <div className={css.line}>
              <span>EPA/play off · def allowed</span>
              <span className={css.num}>
                {signed(r.epa.value.offEpaPerPlay, 3)} · {signed(r.epa.value.defEpaPerPlay, 3)}
              </span>
            </div>
          ) : (
            <p className={css.fine}>EPA: {r.epa.reason}</p>
          )}
        </section>

        <hr className={css.ruleDouble} />

        {/* ── TOTAL ──────────────────────────────────────────────────── */}
        <section className={css.total} aria-label="Total">
          <div className={css.totalFigures}>
            <p className={css.section}>Total</p>
            {r.capplus.state === 'value' ? (
              <div className={css.line}>
                <span className={css.totalLabel}>
                  Cap+ <span className={css.cap100}>100 = league average</span>
                </span>
                <span className={css.big}>
                  {r.capplus.value.capplus.toFixed(0)}
                  {r.capplus.provisional ? <span className={css.prov}> prov.</span> : null}
                </span>
              </div>
            ) : (
              <p className={css.fine}>Cap+: {reasonOnce(r.capplus.reason)}</p>
            )}
            <div className={css.line}>
              <span className={css.totalLabel}>Cap per win</span>
              <span className={css.big}>
                {cpw?.perWin != null ? usdShort(cpw.perWin) : (cpw?.zeroWinLabel ?? '')}
              </span>
            </div>
            {lg !== null ? (
              <div className={css.line}>
                <span className={`${css.totalLabel} ${css.bench}`}>League avg per win</span>
                <span className={`${css.num} ${css.bench}`}>{usdShort(lg)}</span>
              </div>
            ) : null}
          </div>
          {verdict ? (
            <div
              className={`${css.stamp} ${STAMP_TONE[verdict.quintile]}`}
              role="img"
              aria-label={`Verdict: ${verdict.label}, ranked ${verdict.rank} of ${verdict.of} on cap per win`}
            >
              <span className={css.stampLabel}>{verdict.label}</span>
              <span className={css.stampRank}>
                {verdict.rank} of {verdict.of} per win
              </span>
            </div>
          ) : r.verdict.state === 'blank' ? (
            <p className={css.fine}>{r.verdict.reason}</p>
          ) : null}
        </section>

        {/* ── FINE PRINT ─────────────────────────────────────────────── */}
        <footer className={css.foot}>
          {verdict ? (
            <p className={css.fine}>
              {verdict.rule} {cutoffLadder(verdict)}
            </p>
          ) : null}
          <p className={css.fine}>
            Cap is the season-final cap hit of rostered players. Dead money is cap you still pay for
            players who are gone. It bills separately as VOID, weighted ×{DEAD_MONEY_WEIGHT} as in
            Cap+. Games sit beside cap and are never divided into it. This is a bill, not a player
            grade.
            {r.unspent !== null
              ? ' Unspent cap tops the bill up to the season’s cost floor, the 25th percentile of team cost. Spending less than that earns no credit.'
              : ''}
            {unlinkedGames ? ' *n/r: no snap record links to this contract.' : ''}
          </p>
          <span className={css.mark} aria-hidden="true">
            YIELD<span className={css.markSlash}>/</span>YARD
          </span>
        </footer>
      </article>
    </div>
  );
}
