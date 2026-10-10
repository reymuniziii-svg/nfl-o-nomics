import { OG, OG_TEXT } from './theme';

/**
 * The field strip — Cap+ as field position (`SPEC.md` §4):
 * midfield = 100 = league average, 1 Cap+ point = 1 yard, the field covers
 * Cap+ 50–150. Beyond 150 the ball sits in the WORTH IT end zone; below 50, in
 * the MONEY PIT end zone, and its pill says so. The gold tick is the league
 * average and is named in words beneath it.
 *
 * Satori renders this: flex and absolute positioning only, inline styles only.
 */

export interface StripBall {
  key: string;
  label: string;
  capplus: number;
  bg: string;
  fg: string;
}

const PILL_W = 84;
const PILL_H = 40;

export function FieldStrip({
  lanes,
  width,
  laneHeight = 56,
}: {
  /** One ball per lane; a lane with `null` renders empty (its reason is printed elsewhere). */
  lanes: (StripBall | null)[];
  width: number;
  laneHeight?: number;
}) {
  const ez = 52;
  const field = width - ez * 2;
  const height = lanes.length * laneHeight;
  const xOf = (cap: number) => ez + ((Math.min(150, Math.max(50, cap)) - 50) / 100) * field;

  const yardLines = [60, 70, 80, 90, 110, 120, 130, 140].map((c) => xOf(c));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width }}>
      <div
        style={{
          display: 'flex',
          position: 'relative',
          width,
          height,
          background: OG.filmRoom,
          border: `2px solid ${OG.borderExport}`,
          borderRadius: 6,
        }}
      >
        {/* end zones */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: ez,
            height: height - 4,
            background: OG.endZone,
            borderRight: `2px solid ${OG.chalkStrong}`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            width: ez,
            height: height - 4,
            background: OG.endZone,
            borderLeft: `2px solid ${OG.chalkStrong}`,
          }}
        />
        {/* chalk every 10 yards */}
        {yardLines.map((x) => (
          <div
            key={x}
            style={{
              position: 'absolute',
              left: x - 1,
              top: 0,
              width: 2,
              height: height - 4,
              background: OG.chalk,
            }}
          />
        ))}
        {/* lane dividers */}
        {lanes.slice(1).map((_, i) => (
          <div
            key={`lane-${i}`}
            style={{
              position: 'absolute',
              left: ez,
              top: (i + 1) * laneHeight - 2,
              width: field,
              height: 1,
              background: OG.chalk,
            }}
          />
        ))}
        {/* league average — gold, midfield */}
        <div
          style={{
            position: 'absolute',
            left: xOf(100) - 2,
            top: -8,
            width: 4,
            height: height + 12,
            background: OG.gold,
          }}
        />
        {lanes.map((b, i) => {
          if (!b) return null;
          const beyond = b.capplus > 150 ? ' TD' : b.capplus < 50 ? ' SAF' : '';
          const w = Math.max(PILL_W, (b.label + beyond).length * 16 + 28);
          const x = Math.min(width - w - 4, Math.max(0, xOf(b.capplus) - w / 2));
          return (
            <div
              key={b.key}
              style={{
                position: 'absolute',
                left: x,
                top: i * laneHeight + (laneHeight - PILL_H) / 2 - 2,
                width: w,
                height: PILL_H,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: b.bg,
                color: b.fg,
                borderRadius: PILL_H / 2,
                border: `3px solid ${OG.surfaceApp}`,
                fontFamily: OG_TEXT.athletic,
                fontWeight: 600,
                fontSize: 28,
                lineHeight: 1,
              }}
            >
              {b.label + beyond}
            </div>
          );
        })}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 10,
          fontFamily: OG_TEXT.athletic,
          fontWeight: 600,
          fontSize: 28,
          lineHeight: 1,
          letterSpacing: 1,
          color: OG.ink2,
        }}
      >
        <span style={{ width: 170 }}>MONEY PIT</span>
        <span style={{ color: OG.gold }}>100 = LEAGUE AVERAGE</span>
        <span style={{ width: 170, justifyContent: 'flex-end', display: 'flex' }}>WORTH IT</span>
      </div>
    </div>
  );
}
