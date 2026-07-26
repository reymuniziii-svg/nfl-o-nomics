'use client';

/**
 * Team and season pickers — `COMPONENTS.md` §12.2.
 *
 * `DECISIONS.md` 85: **season options are never disabled for lack of coverage.**
 * A year with no Tier 2 data is selectable and the page renders the boundary
 * message. Greying it out would hide the product's own coverage story behind a
 * disabled control.
 */

import { useRouter } from 'next/navigation';
import css from './pickers.module.css';
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
                <span className={`yy-micro ${css.uncovered}`}>Tier 1</span>
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
                <span className={`yy-micro ${css.uncovered}`}>Tier 1</span>
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
