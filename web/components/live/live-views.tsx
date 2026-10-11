/**
 * Server-rendered live views for the home / division frame (DECISIONS 116):
 *
 *  - `LiveDivisionStrip` — the hero in live mode: the picked division's four
 *    clubs with record, games played and Team Rating live (the hatched partial
 *    mark and the LIVE chip). No per-win price, and one line says why.
 *  - `LiveWithheld` — a card body that says what is withheld and why, in place
 *    of a chart that would need a full season (the frontier).
 */

import Link from 'next/link';
import css from './live.module.css';
import { Card, CardHeader } from '../primitives';
import { LiveAsOfLine, LiveChip, LiveRatingBar } from './live-marks';
import type { LiveClubView } from './live-home';

export function LiveDivisionStrip({
  divisionName,
  clubs,
  season,
  week,
  date,
  weeksInSeason,
  blankReason,
}: {
  divisionName: string;
  clubs: LiveClubView[];
  season: number;
  week: number;
  date: string | null;
  weeksInSeason: number;
  /** The whole-season reason while Team Rating live is blank (before week 4). */
  blankReason: string | null;
}) {
  const reason = clubs.find((c) => c.rating.state === 'partial')?.rating;
  return (
    <Card ariaLabel={`${divisionName}, ${season} in progress`}>
      <CardHeader
        eyebrow={`${divisionName} · ${season} in progress`}
        title={`${divisionName.toUpperCase()} — ${season}, LIVE`}
      />
      <LiveAsOfLine
        season={season}
        week={week}
        date={date}
        reason={reason && reason.state === 'partial' ? reason.badgeReason : undefined}
      />
      {blankReason ? (
        <p className="yy-blank">{blankReason}</p>
      ) : (
        <ol className={css.strip}>
          {[...clubs]
            .sort((a, b) => a.rank - b.rank)
            .map((c) => (
              <li key={c.team} className={css.stripRow}>
                <div className={css.stripHead}>
                  <Link href={c.href} className={`yy-label-lg ${css.stripName}`}>
                    {c.teamName}
                  </Link>
                  <span className={`yy-label ${css.stripFacts}`}>
                    {c.record} · {c.gp} of {c.gs} GP{c.byeTaken ? ` · bye wk ${c.byeWeek}` : ''} · #{c.rank} of 32
                  </span>
                </div>
                <LiveRatingBar rating={c.rating} />
              </li>
            ))}
        </ol>
      )}
      <p className={`yy-caption ${css.why}`}>
        No price per win until {season}{' '}is final. That number divides a full season&apos;s cap by a
        full season&apos;s wins, and only {week} of {weeksInSeason} weeks are in.
      </p>
      {blankReason ? null : (
        <p className={`yy-caption ${css.why}`}>
          Bars run from the gold line, 100 = the {season} league average, on Team Rating
          (performance only) · live. The hatch marks a partial season. <LiveChip />
        </p>
      )}
    </Card>
  );
}

export function LiveWithheld({ title, reason }: { title: string; reason: string }) {
  return (
    <div className={css.withheld} role="note">
      <p className="yy-label">{title}</p>
      <p className="yy-caption">{reason}</p>
    </div>
  );
}
