/**
 * `/team/{abbr}/2026` — the slim live variant (SPEC §6, §7.14, DECISIONS 116).
 *
 * What it carries: the header with the LIVE chip and the mart's badge sentence;
 * record, games played and the bye; Team Rating (performance only) · live with
 * the partial hatch and its rank within 2026; the opponent-adjusted EPA margin
 * with the raw margin and the schedule beside it; a coverage strip naming every
 * block it withholds; and the franchise arc with 2026 as one unconnected mark.
 *
 * What it never carries: a verdict, the receipt, a cost per win, a money lens,
 * Cap+ context, coaching, the draft or dead money. A season in progress has no
 * finished half to price.
 *
 * The same URL becomes the final page when 2026 is promoted into the frozen
 * marts, so the URL is permanent.
 */

import css from './team-page.module.css';
import live from '@/components/live/live.module.css';
import { getTeamBundle, getTeamMetaMap, divisionSlugForTeam, latestSeason } from '@/lib/data';
import { getLiveTeam } from '@/lib/data/live';
import { BLANK_REASON, BRIDGE_SENTENCE, blank, mapMetric, TEAM_RATING_LIVE_NAME } from '@/lib/metric';
import { eraIdentity, type TeamAbbr } from '@/lib/teams';
import { teamMark } from '@/lib/marks';
import { teamOgImage } from '@/lib/og';
import { Card, CardHeader, ChartCaption } from '@/components/primitives';
import { TeamHeader } from '@/components/team/team-blocks';
import { SeasonStepper } from '@/components/pickers/team-season-picker';
import { ShareButton } from '@/components/share/share-button';
import { FranchiseArc } from '@/components/charts/franchise-arc';
import { LiveAsOfLine, LiveChip, LiveRatingBar } from '@/components/live/live-marks';

/** The blocks a live page withholds, each with the one reason (BLANK_REASON.LIVE_SEASON). */
const WITHHELD = [
  'Cost per win',
  'Roster receipt and verdict',
  'Three money lenses',
  'What Cap+ can’t see',
  'Coaching & regimes',
  'Draft capital & return',
  'Dead money',
] as const;

const signed = (v: number, d = 2) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`;

export async function LiveTeamSeasonPage({ team }: { team: TeamAbbr }) {
  const lt = await getLiveTeam(team);
  if (!lt || !lt.row) return null;
  const { status, row } = lt;
  const season = status.season;
  const finalSeason = await latestSeason();
  const [meta, slug, finalBundle] = await Promise.all([
    getTeamMetaMap(),
    divisionSlugForTeam(team),
    getTeamBundle(team, finalSeason),
  ]);
  const identity = eraIdentity(team, season);
  const abbrLower = team.toLowerCase();
  const divisionLabel = meta.get(team)?.division ?? '';
  const identityLine = [identity.location, divisionLabel, `${season} in progress`, row.record]
    .filter(Boolean)
    .join(' · ');
  const og = teamOgImage(abbrLower, season, status.week);
  const capplus = blank<number>(
    status.capplus.state === 'blank' ? status.capplus.reason : BLANK_REASON.LIVE_SEASON,
  );
  const rating = row.rating;
  const ratingValue = rating.state === 'blank' ? null : rating.value;
  const finalSeasons = finalBundle?.seasons ?? [];

  return (
    <>
      <TeamHeader
        name={identity.name.toUpperCase()}
        identityLine={identityLine}
        mark={teamMark(team, identity.name)}
        capplus={capplus}
        teamRating={mapMetric(rating, (v) => v)}
        season={season}
        tier2FirstSeason={2013}
        backHref={slug ? `/division/${slug}?season=live` : '/?season=live'}
        stepper={
          <SeasonStepper
            seasons={[...finalSeasons, season]}
            season={season}
            hrefPattern={`/team/${abbrLower}/{season}`}
          />
        }
        actions={
          <ShareButton
            path={`/team/${abbrLower}/${season}`}
            imageUrl={og.url}
            fileName={`yieldyard-${abbrLower}-${season}-wk${status.week}.png`}
          />
        }
      />
      {/* The header's live line: the LIVE chip, the as-of week and date, and
          the mart's badge sentence — first, and never dropped. */}
      <div className={live.headerLive}>
        <LiveAsOfLine season={season} week={status.week} date={status.date} reason={row.badgeReason} />
        <p className="yy-caption">{row.badgeReason}</p>
      </div>

      {/* ── 1. WHERE IT STANDS ─────────────────────────────────────────── */}
      <Card ariaLabel={`${identity.name}, ${season} in progress`}>
        <CardHeader eyebrow={`${identity.name} · ${season} in progress`} title="WHERE IT STANDS" />

        <dl className={live.facts}>
          <div className={live.fact}>
            <dt className={`yy-label ${live.factLabel}`}>Record</dt>
            <dd className={`yy-num ${live.factValue}`}>{row.record}</dd>
            <dd className={`yy-caption ${live.factNote}`}>
              {row.pointsFor}–{row.pointsAgainst} points · {signed(row.pointDiffPerGame, 1)} a game
            </dd>
          </div>
          <div className={live.fact}>
            <dt className={`yy-label ${live.factLabel}`}>Games played</dt>
            <dd className={`yy-num ${live.factValue}`}>
              {row.gamesPlayed} of {row.gamesScheduled}
            </dd>
            <dd className={`yy-caption ${live.factNote}`}>
              {row.byeTaken ? `Bye taken, week ${row.byeWeek}` : `Bye still to come, week ${row.byeWeek}`}
            </dd>
          </div>
          <div className={live.fact}>
            <dt className={`yy-label ${live.factLabel}`}>Rank in {season}</dt>
            <dd className={`yy-num ${live.factValue}`}>
              {row.rank} of 32
            </dd>
            <dd className={`yy-caption ${live.factNote}`}>By Team Rating · live</dd>
          </div>
          <div className={live.fact}>
            <dt className={`yy-label ${live.factLabel}`}>Point differential</dt>
            <dd className={`yy-num ${live.factValue}`}>{signed(row.pointDiff, 0)}</dd>
            <dd className={`yy-caption ${live.factNote}`}>Through week {status.week}</dd>
          </div>
        </dl>
      </Card>

      {/* ── 2. TEAM RATING · LIVE ──────────────────────────────────────── */}
      <Card ariaLabel={TEAM_RATING_LIVE_NAME}>
        <CardHeader eyebrow="Performance only · ranked within 2026" title="TEAM RATING · LIVE" />
        <div className={live.big}>
          <span className={`yy-num ${live.bigValue}`}>
            {ratingValue === null ? '' : ratingValue.toFixed(1)}
          </span>
          <span className="yy-micro yy-partial-ink">
            ⟨{row.gamesPlayed}/{row.gamesScheduled}⟩
          </span>
          <span className="yy-label">
            {row.rank} of 32 · 100 = the {season} league average
          </span>
          <LiveChip reason={row.badgeReason} />
        </div>
        <LiveRatingBar rating={rating} withValue={false} withCover={false} />
        <ChartCaption>
          {TEAM_RATING_LIVE_NAME} blends win %, point differential per game and opponent-adjusted EPA
          margin, each scored against the other 31 clubs through week {status.week}. The hatch marks
          a partial season: {row.gamesPlayed} of {row.gamesScheduled} games. It moves every week, so
          it carries no verdict.
        </ChartCaption>

        <div className={live.epaGrid}>
          <div className={live.fact}>
            <p className={`yy-label ${live.factLabel}`}>Adj. EPA margin</p>
            <p className={`yy-num ${live.factValue}`}>
              {row.epaAdj.state === 'blank' ? '' : signed(row.epaAdj.value)}
            </p>
            <p className={`yy-caption ${live.factNote}`}>Per play, opponent-adjusted</p>
          </div>
          <div className={live.fact}>
            <p className={`yy-label ${live.factLabel}`}>Raw margin</p>
            <p className={`yy-num ${live.factValue}`}>{signed(row.epaRaw)}</p>
            <p className={`yy-caption ${live.factNote}`}>
              {signed(row.offEpaRaw)} off · {signed(row.defEpaRaw)} def allowed
            </p>
          </div>
          <div className={live.fact}>
            <p className={`yy-label ${live.factLabel}`}>Schedule · opponents&apos; margin</p>
            <p className={`yy-num ${live.factValue}`}>{signed(row.sos)}</p>
            <p className={`yy-caption ${live.factNote}`}>
              {row.sos > 0 ? 'Tougher than average so far' : row.sos < 0 ? 'Softer than average so far' : 'Average so far'}
            </p>
          </div>
        </div>
      </Card>

      {/* ── 3. COVERAGE — what a season in progress can't show yet ───────── */}
      <Card ariaLabel="Not shown while the season is in progress">
        <CardHeader eyebrow={`${season} in progress`} title="NOT YET" />
        <ul className={live.coverage}>
          {WITHHELD.map((name) => (
            <li key={name} className={live.coverageItem}>
              <p className={`yy-label ${live.coverageName}`}>{name}</p>
              <p className="yy-blank">{BLANK_REASON.LIVE_SEASON}</p>
            </li>
          ))}
          <li className={live.coverageItem}>
            <p className={`yy-label ${live.coverageName}`}>Cap+ · live</p>
            <p className="yy-blank">{capplus.state === 'blank' ? capplus.reason : ''}</p>
          </li>
        </ul>
      </Card>

      {/* ── 4. THE FRANCHISE ARC — 2026 as one unconnected mark ────────── */}
      {finalBundle && ratingValue !== null ? (
        <Card ariaLabel="Franchise history">
          <CardHeader eyebrow={`1999–${finalSeason} · ${season} in progress`} title="THE FRANCHISE ARC" />
          <FranchiseArc
            points={finalBundle.history.points}
            team={identity.name}
            abbr={abbrLower}
            currentSeason={season}
            details={[]}
            live={{
              season,
              value: ratingValue,
              covered: row.gamesPlayed,
              total: row.gamesScheduled,
              week: status.week,
              date: status.date ?? '',
              rank: row.rank,
              record: row.record,
            }}
          />
          <ChartCaption>
            {BRIDGE_SENTENCE} {season} stands apart, after a dashed gap: one hatched mark for Team
            Rating · live through week {status.week}, never joined to {finalSeason}.
          </ChartCaption>
        </Card>
      ) : null}

      <p className={`yy-caption ${css.limeNote}`}>
        <a className={live.forward} href={`/team/${abbrLower}/${finalSeason}`}>
          ← {identity.name} · {finalSeason}, the last complete season
        </a>
      </p>
    </>
  );
}
