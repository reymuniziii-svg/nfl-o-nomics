import type { ReactNode } from 'react';
import { ImageResponse } from 'next/og';
import { stageWords, usdShort } from '@/lib/display';
import { badgeNote, type AsOf } from '@/lib/metric';
import { FieldStrip, type StripBall } from './field-strip';
import { ogFonts } from './fonts';
import { OG, OG_TEXT, TONE_COLOR, toneOf } from './theme';
import type { DivisionCard, TeamCard } from './data';

/**
 * The 1200 × 630 share cards (blind proposals §6). Rules every card obeys:
 *  - NO TEXT UNDER 28px: X shrinks the card to ~500px wide.
 *  - Cap+ only ever appears beside "100 = LEAGUE AVERAGE" (CAPPLUS_LOCKUP §3).
 *  - A blank metric prints its reason; there is no dash, zero or "N/A".
 *  - Footer: the method in one line, the dated snapshot, the product mark at 55%.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
const FOOT_H = 104;
const MAIN_H = OG_SIZE.height - FOOT_H;
const BAND_W = 440;
const PANEL_PAD = 36;
const PANEL_W = OG_SIZE.width - BAND_W;
const STRIP_W = PANEL_W - PANEL_PAD * 2;

const MINUS = '−';
const signed = (n: number, d = 0) => {
  const r = Number(n.toFixed(d));
  return r > 0 ? `+${r.toFixed(d)}` : r < 0 ? `${MINUS}${Math.abs(r).toFixed(d)}` : (0).toFixed(d);
};
const rec = (w: number, l: number, t: number) => (t ? `${w}–${l}–${t}` : `${w}–${l}`);

export async function renderOg(node: ReactNode): Promise<ImageResponse> {
  return new ImageResponse(node as React.ReactElement, {
    ...OG_SIZE,
    fonts: await ogFonts(),
  });
}

/* ── shared pieces ─────────────────────────────────────────────────────── */

function Frame({
  band,
  panel,
  dated,
  method,
}: {
  band: ReactNode;
  panel: ReactNode;
  dated: string;
  method: string;
}) {
  return (
    <div
      style={{
        width: OG_SIZE.width,
        height: OG_SIZE.height,
        display: 'flex',
        flexDirection: 'column',
        background: OG.surfaceApp,
        color: OG.ink1,
        fontFamily: OG_TEXT.num,
      }}
    >
      <div style={{ display: 'flex', height: MAIN_H }}>
        {band}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: PANEL_W,
            height: MAIN_H,
            padding: `30px ${PANEL_PAD}px 22px`,
            background: OG.surfaceCard,
            justifyContent: 'space-between',
          }}
        >
          {panel}
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          height: FOOT_H,
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 36px',
          background: OG.filmRoom,
          borderTop: `2px solid ${OG.borderExport}`,
          fontFamily: OG_TEXT.athletic,
          fontWeight: 600,
          fontSize: 28,
          lineHeight: 1.15,
          color: OG.ink2,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span>{method}</span>
          <span>{dated}</span>
        </div>
        <span
          style={{
            display: 'flex',
            fontFamily: OG_TEXT.display,
            fontWeight: 400,
            fontSize: 36,
            letterSpacing: 1,
            color: 'rgba(234, 241, 236, 0.55)',
          }}
        >
          YIELD<span style={{ color: OG.lime }}>/</span>YARD
        </span>
      </div>
    </div>
  );
}

function datedLine(asOf: AsOf | null): string {
  return asOf
    ? `Dead money as of ${asOf.date} · ${stageWords(asOf.stage)} · cap season-final`
    : 'Results and EPA only · contract data begins 2013';
}

/** Satori renders a Fragment as a row container, so panels use an explicit column. */
const COL = {
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'space-between',
  height: '100%',
} as const;

const METHOD_TEAM = 'Cap+ = results per dollar vs the season’s league · dead money counted once';

function Line({
  label,
  value,
  valueColor = OG.ink1,
  strike,
  aside,
  asideColor = OG.gold,
}: {
  label: string;
  value: string;
  valueColor?: string;
  strike?: string;
  aside?: string;
  asideColor?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        borderTop: `1px solid ${OG.chalk}`,
        paddingTop: 8,
        height: 48,
      }}
    >
      <span
        style={{
          fontFamily: OG_TEXT.athletic,
          fontWeight: 600,
          fontSize: 28,
          letterSpacing: 1,
          color: OG.ink2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <span style={{ display: 'flex', alignItems: 'baseline', gap: 14, fontSize: 30, fontWeight: 700 }}>
        {strike ? (
          <span style={{ textDecoration: 'line-through', color: OG.negativeSoft, fontWeight: 500, fontSize: 28 }}>
            {strike}
          </span>
        ) : null}
        <span style={{ color: valueColor }}>{value}</span>
        {aside ? (
          <span style={{ color: asideColor, fontWeight: 500, fontSize: 28 }}>{aside}</span>
        ) : null}
      </span>
    </div>
  );
}

/**
 * The season's badge as a small stamp beside the Cap+ figure: PROVISIONAL in
 * the badge's gold ink, ESTIMATED in a dashed ink box (the site's chip, drawn
 * for Satori). The reason sentence rides the footer's dated line.
 */
function BadgeStamp({ card }: { card: TeamCard }) {
  const note = badgeNote(card.capplus);
  if (!note) return null;
  return note.badge === 'estimated' ? (
    <span
      style={{
        display: 'flex',
        fontFamily: OG_TEXT.athletic,
        fontWeight: 600,
        fontSize: 26,
        letterSpacing: 1,
        color: OG.ink1,
        border: `2px dashed ${OG.ink2}`,
        borderRadius: 6,
        padding: '0 10px',
      }}
    >
      ESTIMATED
    </span>
  ) : (
    <span style={{ fontFamily: OG_TEXT.athletic, fontWeight: 600, fontSize: 28, color: OG.gold }}>
      PROVISIONAL
    </span>
  );
}

/** The dated footer line, with the estimated season's count of published teams. */
function badgeTail(card: TeamCard): string {
  const note = badgeNote(card.capplus);
  if (!note || note.badge !== 'estimated') return '';
  const m = /(\d+) of 32 teams/.exec(note.sentence);
  return m ? ` · estimated: ${m[1]}/32 published` : ' · estimated';
}

function Reason({ children }: { children: string }) {
  return (
    <div
      style={{
        display: 'flex',
        fontSize: 28,
        fontWeight: 500,
        lineHeight: 1.25,
        color: OG.ink2,
      }}
    >
      {children}
    </div>
  );
}

function Stamp({ card }: { card: TeamCard }) {
  if (card.verdict.state === 'blank') {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignSelf: 'flex-start',
          padding: '8px 16px',
          background: OG.surfaceApp,
          border: `3px solid ${OG.ink3}`,
          borderRadius: 8,
          color: OG.ink2,
        }}
      >
        <span style={{ fontFamily: OG_TEXT.display, fontSize: 48, lineHeight: 1 }}>
          {card.tier2 ? 'NO VERDICT' : 'NO RECEIPTS'}
        </span>
        <span style={{ fontFamily: OG_TEXT.athletic, fontWeight: 600, fontSize: 28 }}>
          {card.tier2 ? '0 WINS · NOT RANKED' : 'CONTRACTS BEGIN 2013'}
        </span>
      </div>
    );
  }
  const v = card.verdict.value;
  const tone = TONE_COLOR[toneOf(v.quintile)];
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignSelf: 'flex-start',
        padding: '8px 18px 6px',
        background: OG.surfaceApp,
        border: `5px solid ${tone}`,
        borderRadius: 8,
        transform: 'rotate(-4deg)',
      }}
    >
      <span style={{ fontFamily: OG_TEXT.display, fontSize: 64, lineHeight: 1, color: tone, letterSpacing: 2 }}>
        {v.label}
      </span>
      <span style={{ fontFamily: OG_TEXT.athletic, fontWeight: 600, fontSize: 28, color: OG.ink1 }}>
        {`${v.rank} OF ${v.of} · CAP PER WIN`}
      </span>
    </div>
  );
}

function ballOf(card: TeamCard, label: string = card.team): StripBall | null {
  return card.capplus.state === 'value'
    ? { key: `${card.team}-${card.season}`, label, capplus: card.capplus.value.capplus, bg: card.bg, fg: card.fg }
    : null;
}

function recordOf(card: TeamCard): string {
  return card.results.state === 'value'
    ? rec(card.results.value.wins, card.results.value.losses, card.results.value.ties)
    : card.results.reason;
}

function cpwOf(card: TeamCard): { value: string; lg: string | null; perWin: boolean } {
  if (card.receipt.state === 'blank') return { value: card.receipt.reason, lg: null, perWin: false };
  const r = card.receipt.value;
  const cpw = r.costPerWin.state === 'value' ? r.costPerWin.value : null;
  const lg = r.leagueCostPerWin.state !== 'blank' ? usdShort(r.leagueCostPerWin.value) : null;
  if (!cpw) return { value: r.costPerWin.state === 'blank' ? r.costPerWin.reason : '', lg, perWin: false };
  return {
    value: cpw.perWin != null ? usdShort(cpw.perWin) : (cpw.zeroWinLabel ?? ''),
    lg,
    perWin: cpw.perWin != null,
  };
}

/* ── TEAM-SEASON ───────────────────────────────────────────────────────── */

export function TeamOg({ card }: { card: TeamCard }) {
  const receipt = card.receipt.state === 'value' ? card.receipt.value : null;
  const res = card.results.state === 'value' ? card.results.value : null;
  const cpw = cpwOf(card);

  const band = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: BAND_W,
        height: MAIN_H,
        padding: '30px 36px 30px',
        background: card.bg,
        color: card.fg,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontFamily: OG_TEXT.display, fontSize: 168, lineHeight: 0.86, letterSpacing: 2 }}>
          {card.team}
        </span>
        <span style={{ fontFamily: OG_TEXT.display, fontSize: 112, lineHeight: 0.9, letterSpacing: 2 }}>
          {String(card.season)}
        </span>
        <span
          style={{
            fontFamily: OG_TEXT.athletic,
            fontWeight: 600,
            fontSize: 28,
            letterSpacing: 1,
            textTransform: 'uppercase',
            marginTop: 6,
          }}
        >
          {card.name}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={{ fontFamily: OG_TEXT.display, fontSize: 64, lineHeight: 0.9, letterSpacing: 1 }}>
          {res ? `${rec(res.wins, res.losses, res.ties)}  ·  ${signed(res.pointDiff)} PTS` : recordOf(card)}
        </span>
        <Stamp card={card} />
      </div>
    </div>
  );

  const head =
    card.capplus.state === 'value' ? (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <span style={{ fontFamily: OG_TEXT.athletic, fontWeight: 600, fontSize: 36, color: OG.ink2 }}>CAP+</span>
        <span style={{ fontFamily: OG_TEXT.display, fontSize: 88, lineHeight: 0.9, color: OG.ink1 }}>
          {card.capplus.value.capplus.toFixed(0)}
        </span>
        <span style={{ fontFamily: OG_TEXT.athletic, fontWeight: 600, fontSize: 28, color: OG.ink2 }}>
          {`#${card.capplus.value.seasonRank} OF 32`}
        </span>
        <BadgeStamp card={card} />
      </div>
    ) : card.tier2 ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontFamily: OG_TEXT.athletic, fontWeight: 600, fontSize: 32, color: OG.ink2 }}>
          CAP+ · NO BALL ON THE FIELD THIS SEASON
        </span>
        <Reason>{card.capplus.state === 'blank' ? card.capplus.reason : ''}</Reason>
      </div>
    ) : (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <span style={{ fontFamily: OG_TEXT.athletic, fontWeight: 600, fontSize: 36, color: OG.ink2 }}>
            TEAM RATING
          </span>
          <span style={{ fontFamily: OG_TEXT.display, fontSize: 88, lineHeight: 0.9, color: OG.ink1 }}>
            {card.teamRating.state === 'value' ? card.teamRating.value.toFixed(0) : 'UNRATED'}
          </span>
          <span style={{ fontFamily: OG_TEXT.athletic, fontWeight: 600, fontSize: 28, color: OG.gold }}>
            100 = LEAGUE AVERAGE
          </span>
        </div>
        <Reason>
          Results only. No field position, no receipt: Cap+ needs contract data, and that starts in
          2013.
        </Reason>
      </div>
    );

  const strip = <FieldStrip lanes={[ballOf(card)]} width={STRIP_W} laneHeight={64} />;

  const lines = receipt ? (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Line label={`Roster cap · ${receipt.rosterCount} contracts`} value={usdShort(receipt.rosterSubtotal)} />
      {receipt.dead.state === 'value' ? (
        <Line
          label="Void · dead money"
          value={`${usdShort(receipt.dead.value.total)}${receipt.dead.value.range ? ' est.' : ''}`}
          valueColor={OG.negativeSoft}
          aside={
            receipt.dead.value.range
              ? `80% ${usdShort(receipt.dead.value.range.lo)}–${usdShort(receipt.dead.value.range.hi)}`
              : undefined
          }
          asideColor={OG.ink2}
        />
      ) : (
        <Line label="Dead money" value="No dated snapshot" valueColor={OG.ink2} />
      )}
      <Line
        label="Cap per win"
        value={cpw.value}
        aside={cpw.lg && cpw.perWin ? `LEAGUE ${cpw.lg}` : undefined}
      />
      <Line
        label="You got · EPA/play adj."
        value={
          receipt.epa.state === 'value'
            ? `${signed(receipt.epa.value.offEpaPerPlayAdj, 2)} off · ${signed(receipt.epa.value.defEpaPerPlayAdj, 2)} def`
            : 'EPA not in snapshot'
        }
      />
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <Line label="Record" value={recordOf(card)} />
      <Line label="Point differential" value={res ? signed(res.pointDiff) : ''} />
      <Line label="Points for · against" value={res ? `${res.pointsFor} · ${res.pointsAgainst}` : ''} />
    </div>
  );

  return (
    <Frame
      band={band}
      dated={`${datedLine(receipt?.snapshot ?? null)}${badgeTail(card)}`}
      method={card.tier2 ? METHOD_TEAM : 'Team Rating = win %, point diff and EPA vs the season’s league'}
      panel={
        <div style={COL}>
          {head}
          {card.capplus.state === 'value' ? strip : null}
          {lines}
        </div>
      }
    />
  );
}

/* ── DIVISION ──────────────────────────────────────────────────────────── */

export function DivisionOg({ card }: { card: DivisionCard }) {
  const ranked = card.teams
    .filter((t) => t.verdict.state === 'value')
    .sort(
      (a, b) =>
        (a.verdict.state === 'value' ? a.verdict.value.rank : 99) -
        (b.verdict.state === 'value' ? b.verdict.value.rank : 99),
    );
  const best = ranked[0] ?? null;
  const [conf, ...rest] = card.name.toUpperCase().split(' ');
  const asOf =
    card.teams.map((t) => (t.receipt.state === 'value' ? t.receipt.value.snapshot : null)).find(Boolean) ??
    null;

  const band = (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: BAND_W,
        height: MAIN_H,
        padding: '30px 36px',
        background: OG.endZone,
        color: OG.ink1,
        borderRight: `2px solid ${OG.borderExport}`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontFamily: OG_TEXT.display, fontSize: 120, lineHeight: 0.86, letterSpacing: 2 }}>{conf}</span>
        <span style={{ fontFamily: OG_TEXT.display, fontSize: 120, lineHeight: 0.86, letterSpacing: 2 }}>
          {rest.join(' ')}
        </span>
        <span style={{ fontFamily: OG_TEXT.display, fontSize: 80, lineHeight: 0.9, letterSpacing: 2, color: OG.ink2 }}>
          {String(card.season)}
        </span>
      </div>
      {best ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontFamily: OG_TEXT.athletic, fontWeight: 600, fontSize: 28, color: OG.ink2 }}>
            {`CHEAPEST WINS · ${best.team}`}
          </span>
          <Stamp card={best} />
        </div>
      ) : null}
    </div>
  );

  const lanes = card.teams.map((t) => ballOf(t));
  const panel = (
    <div style={COL}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <span style={{ fontFamily: OG_TEXT.athletic, fontWeight: 600, fontSize: 32, color: OG.ink2 }}>
          {`CAP+ BY CLUB · ${card.season}`}
        </span>
      </div>
      {lanes.some(Boolean) ? (
        <FieldStrip lanes={lanes} width={STRIP_W} laneHeight={46} />
      ) : (
        <Reason>
          {card.teams[0]?.capplus.state === 'blank' ? card.teams[0].capplus.reason : ''}
        </Reason>
      )}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {card.teams.map((t) => {
          const cpw = cpwOf(t);
          const v = t.verdict.state === 'value' ? t.verdict.value : null;
          return (
            <div
              key={t.team}
              style={{
                display: 'flex',
                alignItems: 'center',
                height: 46,
                gap: 18,
                borderTop: `1px solid ${OG.chalk}`,
                fontSize: 28,
              }}
            >
              <span
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  width: 76,
                  padding: '2px 0',
                  borderRadius: 6,
                  background: t.bg,
                  color: t.fg,
                  fontFamily: OG_TEXT.athletic,
                  fontWeight: 600,
                }}
              >
                {t.team}
              </span>
              <span style={{ width: 110, fontWeight: 700 }}>{recordOf(t)}</span>
              <span style={{ width: 230, fontWeight: 700 }}>{`${cpw.value} / WIN`}</span>
              <span
                style={{
                  fontFamily: OG_TEXT.display,
                  fontSize: 36,
                  color: v ? TONE_COLOR[toneOf(v.quintile)] : OG.ink2,
                }}
              >
                {v ? v.label : 'NO VERDICT'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <Frame
      band={band}
      panel={panel}
      dated={datedLine(asOf)}
      method="Cap per win = rostered cap hit ÷ wins · stamp = season quintile"
    />
  );
}

/* ── COMPARE ───────────────────────────────────────────────────────────── */

export function CompareOg({ a, b }: { a: TeamCard; b: TeamCard }) {
  const half = (c: TeamCard) => (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        height: MAIN_H / 2 - 2,
        padding: '0 36px',
        background: c.bg,
        color: c.fg,
      }}
    >
      <span style={{ fontFamily: OG_TEXT.display, fontSize: 104, lineHeight: 0.9, letterSpacing: 2 }}>
        {`${c.team} ${c.season}`}
      </span>
      <span style={{ fontFamily: OG_TEXT.athletic, fontWeight: 600, fontSize: 28, letterSpacing: 1 }}>
        {`${recordOf(c)} · ${c.verdict.state === 'value' ? c.verdict.value.label : c.tier2 ? 'NO VERDICT' : 'NO RECEIPTS'}`}
      </span>
    </div>
  );

  const capA = a.capplus.state === 'value' ? a.capplus.value.capplus : null;
  const capB = b.capplus.state === 'value' ? b.capplus.value.capplus : null;
  let gap: string;
  if (capA !== null && capB !== null) {
    const d = Math.round(capA - capB);
    gap =
      d === 0
        ? `${a.team} ${a.season} AND ${b.team} ${b.season} · SAME YARD LINE`
        : d > 0
          ? `${a.team} ${a.season} +${d} YDS OVER ${b.team} ${b.season}`
          : `${b.team} ${b.season} +${-d} YDS OVER ${a.team} ${a.season}`;
  } else {
    gap = 'ONE SIDE HAS NO CAP+ · NO YARDAGE GAP';
  }

  const cell = (s: string, color: string = OG.ink1) => (
    <span style={{ display: 'flex', justifyContent: 'flex-end', width: 200, color }}>{s}</span>
  );
  const row = (label: string, va: string, vb: string, color?: string) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 46,
        borderTop: `1px solid ${OG.chalk}`,
        fontSize: 28,
        fontWeight: 700,
      }}
    >
      <span
        style={{
          flex: 1,
          fontFamily: OG_TEXT.athletic,
          fontWeight: 600,
          color: OG.ink2,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      {cell(va, color)}
      {cell(vb, color)}
    </div>
  );
  const capStr = (c: TeamCard) =>
    c.capplus.state === 'value'
      ? `${c.capplus.value.capplus.toFixed(0)}${badgeNote(c.capplus)?.badge === 'estimated' ? ' est.' : ''}`
      : c.tier2
        ? 'No table'
        : 'Pre-2013';
  const deadStr = (c: TeamCard) =>
    c.receipt.state === 'value' && c.receipt.value.dead.state === 'value'
      ? `${usdShort(c.receipt.value.dead.value.total)}${c.receipt.value.dead.value.range ? ' est.' : ''}`
      : 'No snapshot';
  const lgStr = (c: TeamCard) => cpwOf(c).lg ?? 'Pre-2013';
  const cpwStr = (c: TeamCard) => {
    if (c.receipt.state === 'blank') return 'Pre-2013';
    const v = c.receipt.value.costPerWin;
    if (v.state !== 'value') return 'No cap row';
    return v.value.perWin != null ? usdShort(v.value.perWin) : '0 wins';
  };

  const panel = (
    <div style={COL}>
      <span style={{ fontFamily: OG_TEXT.display, fontSize: 52, lineHeight: 1, color: OG.ink1 }}>{gap}</span>
      <FieldStrip lanes={[ballOf(a, `${a.team} '${String(a.season).slice(2)}`), ballOf(b, `${b.team} '${String(b.season).slice(2)}`)]} width={STRIP_W} laneHeight={50} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', fontFamily: OG_TEXT.athletic, fontWeight: 600, fontSize: 28, color: OG.ink2 }}>
          <span style={{ flex: 1 }}>VS OWN SEASON</span>
          {cell(`${a.team} ${a.season}`, OG.ink2)}
          {cell(`${b.team} ${b.season}`, OG.ink2)}
        </div>
        {row('Cap+', capStr(a), capStr(b))}
        {row('Cap per win', cpwStr(a), cpwStr(b))}
        {row('League per win', lgStr(a), lgStr(b), OG.gold)}
        {row('Dead money', deadStr(a), deadStr(b), OG.negativeSoft)}
      </div>
    </div>
  );

  const snap = (c: TeamCard) =>
    c.receipt.state === 'value' && c.receipt.value.snapshot ? c.receipt.value.snapshot.date : null;
  const dates = [snap(a), snap(b)];
  const dated = dates.some(Boolean)
    ? `Dead money as of ${dates.map((d, i) => `${d ?? 'none'} (${i === 0 ? a.team : b.team} ${i === 0 ? a.season : b.season})`).join(' · ')}`
    : 'Results and EPA only · contract data begins 2013';

  return (
    <Frame
      band={
        <div style={{ display: 'flex', flexDirection: 'column', width: BAND_W, height: MAIN_H }}>
          {half(a)}
          <div style={{ display: 'flex', height: 4, background: OG.surfaceApp }} />
          {half(b)}
        </div>
      }
      panel={panel}
      dated={dated}
      method={METHOD_TEAM}
    />
  );
}

