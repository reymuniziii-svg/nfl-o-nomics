'use client';

/**
 * `PlayerSearch` — `COMPONENTS.md` §12.3, `SPEC.md` §3.3.1 / §8.4.
 * Originated: the mockup contains no text input anywhere.
 *
 * **The population statement is always visible beneath the field**, not only on
 * no-match. The field is 16px — never smaller, or iOS zooms the viewport on
 * focus and does not zoom back.
 *
 * The matched substring is distinguished by INK, not by weight: a weight change
 * reflows a proportionally-set list under the reader's finger.
 */

import { useDeferredValue, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import css from './pickers.module.css';
import { IconSearch } from '../icons';

export interface PlayerOption {
  playerId: string;
  name: string;
  position: string | null;
  team: string | null;
}

export function PlayerSearch({
  players,
  populationStatement,
}: {
  players: PlayerOption[];
  populationStatement: string;
}) {
  const [q, setQ] = useState('');
  const deferred = useDeferredValue(q);
  const listId = useId();

  const results = useMemo(() => {
    const needle = deferred.trim().toLowerCase();
    if (!needle) return [];
    return players.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 20);
  }, [players, deferred]);

  const showNoMatch = deferred.trim().length > 0 && results.length === 0;

  return (
    <div className={css.searchWrap}>
      <div className={css.field}>
        <IconSearch size={20} />
        <input
          className={css.input}
          type="search"
          role="combobox"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search players"
          placeholder="Search players"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* always visible, not only on no-match */}
      <p className={`yy-caption ${css.population}`}>{populationStatement}</p>

      <p className="yy-visually-hidden" aria-live="polite">
        {deferred.trim() ? `${results.length} players match` : ''}
      </p>

      {showNoMatch ? (
        <p className={`yy-caption ${css.population}`}>
          No player in the v1 population matches “{deferred.trim()}”.
        </p>
      ) : null}

      {results.length ? (
        <ul className={css.results} id={listId} role="listbox" aria-label="Players">
          {results.map((p) => (
            <li key={p.playerId} role="option" aria-selected="false">
              <Link className={`yy-label-lg ${css.resultRow}`} href={`/player/${p.playerId}`}>
                <Highlight name={p.name} needle={deferred.trim()} />
                <span className={`yy-label ${css.resultMeta}`}>
                  {[p.position, p.team].filter(Boolean).join(' · ')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Highlight({ name, needle }: { name: string; needle: string }) {
  const i = needle ? name.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (i < 0) return <span className={css.resultRest}>{name}</span>;
  return (
    <span>
      <span className={css.resultRest}>{name.slice(0, i)}</span>
      <span className={css.resultMatch}>{name.slice(i, i + needle.length)}</span>
      <span className={css.resultRest}>{name.slice(i + needle.length)}</span>
    </span>
  );
}
