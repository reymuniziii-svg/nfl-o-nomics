'use client';

/**
 * Team and season pickers — `COMPONENTS.md` §12.2.
 *
 * `DECISIONS.md` 85: **season options are never disabled for lack of coverage.**
 * A year with no Tier 2 data is selectable and the page renders the boundary
 * message. Graying it out would hide the product's own coverage story behind a
 * disabled control.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import css from './pickers.module.css';
import teamCss from '../team/team.module.css';
import { Menu, MenuGroupLabel, MenuItem } from './menu';

export interface TeamOption {
  abbr: string;
  name: string;
  conference: string;
  division: string;
}

const TIER2_FIRST_SEASON = 2013;

/**
 * Hrefs arrive as a PATTERN, not a callback: a function cannot cross the
 * server/client boundary, and a template keeps the route shape in the page file
 * where the rest of the routing lives.
 */
export function SeasonPicker({
  seasons,
  season,
  hrefPattern,
}: {
  seasons: number[];
  season: number;
  /** e.g. `/team/ne/{season}` */
  hrefPattern: string;
}) {
  const router = useRouter();
  return (
    <Menu label="Season" value={String(season)}>
      <div className={css.seasonGrid}>
        {seasons.map((s) => (
          <MenuItem
            key={s}
            selected={s === season}
            onSelect={() => router.push(hrefPattern.replace('{season}', String(s)))}
            trailing={
              s < TIER2_FIRST_SEASON ? (
                <span className={`yy-label ${css.uncovered}`}>Tier 1</span>
              ) : null
            }
          >
            {s}
          </MenuItem>
        ))}
      </div>
    </Menu>
  );
}

export function TeamPicker({
  teams,
  team,
  hrefPattern,
  label = 'Team',
}: {
  teams: TeamOption[];
  team: string;
  /** e.g. `/team/{abbr}/2024` */
  hrefPattern: string;
  label?: string;
}) {
  const router = useRouter();
  const current = teams.find((t) => t.abbr === team);

  const grouped = new Map<string, TeamOption[]>();
  for (const t of teams) {
    const key = `${t.conference} ${t.division}`;
    grouped.set(key, [...(grouped.get(key) ?? []), t]);
  }

  return (
    <Menu label={label} value={current?.name ?? team}>
      {[...grouped.entries()].map(([group, members]) => (
        <div key={group}>
          <MenuGroupLabel>{group}</MenuGroupLabel>
          {members.map((t) => (
            <MenuItem
              key={t.abbr}
              selected={t.abbr === team}
              onSelect={() => router.push(hrefPattern.replace('{abbr}', t.abbr.toLowerCase()))}
              trailing={<span className={`yy-label ${css.uncovered}`}>{t.abbr}</span>}
            >
              {t.name}
            </MenuItem>
          ))}
        </div>
      ))}
    </Menu>
  );
}

/**
 * The two-sided compare picker. Curated on both sides: a team menu × a season
 * menu, and nothing else. There is no free-form query builder in v1.
 */
export function ComparePicker({
  teams,
  seasons,
  a,
  b,
}: {
  teams: TeamOption[];
  seasons: number[];
  a: { team: string; season: number };
  b: { team: string; season: number };
}) {
  const router = useRouter();
  const go = (next: { a: typeof a; b: typeof b }) =>
    router.push(
      `/compare?a=${next.a.team.toLowerCase()}-${next.a.season}&b=${next.b.team.toLowerCase()}-${next.b.season}`,
    );

  return (
    <div className={css.compareBar}>
      <div className={css.side}>
        <span className={`yy-label ${css.sideLabel}`}>Side A</span>
        <TeamPickerInline
          teams={teams}
          team={a.team}
          onPick={(t) => go({ a: { ...a, team: t }, b })}
        />
        <SeasonPickerInline
          seasons={seasons}
          season={a.season}
          onPick={(s) => go({ a: { ...a, season: s }, b })}
        />
      </div>
      <div className={css.side}>
        <span className={`yy-label ${css.sideLabel}`}>Side B</span>
        <TeamPickerInline
          teams={teams}
          team={b.team}
          onPick={(t) => go({ a, b: { ...b, team: t } })}
        />
        <SeasonPickerInline
          seasons={seasons}
          season={b.season}
          onPick={(s) => go({ a, b: { ...b, season: s } })}
        />
      </div>
    </div>
  );
}

function TeamPickerInline({
  teams,
  team,
  onPick,
}: {
  teams: TeamOption[];
  team: string;
  onPick: (abbr: string) => void;
}) {
  const current = teams.find((t) => t.abbr === team);
  const grouped = new Map<string, TeamOption[]>();
  for (const t of teams) {
    const key = `${t.conference} ${t.division}`;
    grouped.set(key, [...(grouped.get(key) ?? []), t]);
  }
  return (
    <Menu label="Team" value={current?.name ?? team}>
      {[...grouped.entries()].map(([group, members]) => (
        <div key={group}>
          <MenuGroupLabel>{group}</MenuGroupLabel>
          {members.map((t) => (
            <MenuItem key={t.abbr} selected={t.abbr === team} onSelect={() => onPick(t.abbr)}>
              {t.name}
            </MenuItem>
          ))}
        </div>
      ))}
    </Menu>
  );
}

function SeasonPickerInline({
  seasons,
  season,
  onPick,
}: {
  seasons: number[];
  season: number;
  onPick: (season: number) => void;
}) {
  return (
    <Menu label="Season" value={String(season)}>
      <div className={css.seasonGrid}>
        {seasons.map((s) => (
          <MenuItem
            key={s}
            selected={s === season}
            onSelect={() => onPick(s)}
            trailing={
              s < TIER2_FIRST_SEASON ? (
                <span className={`yy-label ${css.uncovered}`}>Tier 1</span>
              ) : null
            }
          >
            {s}
          </MenuItem>
        ))}
      </div>
    </Menu>
  );
}

/**
 * Prev / next season — the header's time navigation (review D #6).
 *
 * Plain links, so the URL stays the state and the browser's back button
 * walks the seasons. `scroll={false}`: stepping a season keeps the reader
 * where they are on the page instead of throwing them back to the top. A
 * season off either end of the franchise record renders a disabled arrow
 * with its reason as the accessible name, never a missing control.
 */
export function SeasonStepper({
  seasons,
  season,
  hrefPattern,
}: {
  seasons: number[];
  season: number;
  hrefPattern: string;
}) {
  const sorted = [...seasons].sort((a, b) => a - b);
  const i = sorted.indexOf(season);
  const prev = i > 0 ? sorted[i - 1] : null;
  const next = i >= 0 && i < sorted.length - 1 ? sorted[i + 1] : null;
  const href = (s: number) => hrefPattern.replace('{season}', String(s));
  return (
    <nav className={teamCss.stepper} aria-label="Season">
      {prev !== null ? (
        <Link className={teamCss.stepperBtn} href={href(prev)} scroll={false} aria-label={`Previous season, ${prev}`}>
          <span aria-hidden="true">‹</span>
          <span className="yy-label">{prev}</span>
        </Link>
      ) : (
        <span className={`${teamCss.stepperBtn} ${teamCss.stepperOff}`} aria-disabled="true" aria-label="No earlier season in the record">
          <span aria-hidden="true">‹</span>
        </span>
      )}
      {next !== null ? (
        <Link className={teamCss.stepperBtn} href={href(next)} scroll={false} aria-label={`Next season, ${next}`}>
          <span className="yy-label">{next}</span>
          <span aria-hidden="true">›</span>
        </Link>
      ) : (
        <span className={`${teamCss.stepperBtn} ${teamCss.stepperOff}`} aria-disabled="true" aria-label="No later season in the record">
          <span aria-hidden="true">›</span>
        </span>
      )}
    </nav>
  );
}
