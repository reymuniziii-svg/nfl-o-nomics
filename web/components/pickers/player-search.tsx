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

import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import css from './pickers.module.css';
import { IconSearch } from '../icons';

export interface PlayerOption {
  playerId: string;
  name: string;
  position: string | null;
  team: string | null;
}

/**
 * KEYBOARD (WAI-ARIA combobox, list autocomplete). Focus never leaves the
 * input; the active option is conveyed by `aria-activedescendant` and is the
 * only option with `aria-selected="true"`.
 *
 *   ArrowDown / ArrowUp — open the list and move through it (wrapping)
 *   Home / End          — first / last option while the list is open
 *   Enter               — go to the active option's player page
 *   Escape              — close the list; a second Escape clears the field
 */
export function PlayerSearch({
  players,
  populationStatement,
}: {
  players: PlayerOption[];
  populationStatement: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(true);
  const deferred = useDeferredValue(q);
  // The active index belongs to ONE result set: it is keyed by the query that
  // produced it, so a new query starts with nothing active and Enter can never
  // land on a stale index (a player the reader can no longer see).
  const [act, setAct] = useState<{ q: string; i: number }>({ q: '', i: -1 });
  const active = act.q === deferred ? act.i : -1;
  const setActive = (next: number | ((i: number) => number)) =>
    setAct((prev) => {
      const cur = prev.q === deferred ? prev.i : -1;
      return { q: deferred, i: typeof next === 'function' ? next(cur) : next };
    });
  const listId = useId();
  const optionId = (i: number) => `${listId}-opt-${i}`;
  const router = useRouter();
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const needle = deferred.trim().toLowerCase();
    if (!needle) return [];
    return players.filter((p) => p.name.toLowerCase().includes(needle)).slice(0, 20);
  }, [players, deferred]);

  // Keep the active option inside the scrolled panel.
  useEffect(() => {
    if (active < 0) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const expanded = open && results.length > 0;
  const showNoMatch = deferred.trim().length > 0 && results.length === 0;
  const count = results.length;

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown':
        if (!count) return;
        e.preventDefault();
        setOpen(true);
        setActive((i) => (!expanded ? 0 : (i + 1) % count));
        break;
      case 'ArrowUp':
        if (!count) return;
        e.preventDefault();
        setOpen(true);
        setActive((i) => (!expanded || i <= 0 ? count - 1 : i - 1));
        break;
      case 'Home':
        if (!expanded) return;
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
        if (!expanded) return;
        e.preventDefault();
        setActive(count - 1);
        break;
      case 'Enter':
        if (!expanded) return;
        e.preventDefault();
        // With nothing active, Enter takes the first match — the reader typed
        // a name and pressed Return, which is a request for that name.
        router.push(`/player/${results[active >= 0 ? active : 0].playerId}`);
        break;
      case 'Escape':
        e.preventDefault();
        if (expanded) {
          setOpen(false);
          setActive(-1);
        } else {
          setQ('');
        }
        break;
    }
  }

  return (
    <div className={css.searchWrap}>
      <div className={css.field}>
        <IconSearch size={20} />
        <input
          className={css.input}
          type="search"
          role="combobox"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
          aria-label="Search players"
          placeholder="Search players"
          autoComplete="off"
          spellCheck={false}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
      </div>

      {/* always visible, not only on no-match */}
      <p className={`yy-caption ${css.population}`}>{populationStatement}</p>

      <p className="yy-visually-hidden" aria-live="polite">
        {deferred.trim() ? `${count} ${count === 1 ? 'player matches' : 'players match'}` : ''}
      </p>

      {showNoMatch ? (
        <p className={`yy-caption ${css.population}`}>
          No player in the v1 population matches “{deferred.trim()}”.
        </p>
      ) : null}

      {/* The listbox is always in the DOM so `aria-controls` always resolves. */}
      <ul
        ref={listRef}
        className={css.results}
        id={listId}
        role="listbox"
        aria-label="Players"
        hidden={!expanded}
      >
        {expanded
          ? results.map((p, i) => (
              <li
                key={p.playerId}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                data-index={i}
                onMouseMove={() => setActive(i)}
              >
                {/* Not a tab stop: focus stays in the field (`aria-activedescendant`).
                    The link keeps pointer, middle-click and no-JS navigation. */}
                <Link
                  className={`yy-label-lg ${css.resultRow} ${i === active ? css.resultActive : ''}`}
                  href={`/player/${p.playerId}`}
                  tabIndex={-1}
                  // pickers.module.css is shared; the active-option ink is the
                  // selected-row recipe (COMPONENTS.md §11.2), set inline here.
                  style={
                    i === active
                      ? {
                          background: 'var(--yy-tint-selected)',
                          boxShadow: 'inset var(--yy-space-0h) 0 0 var(--yy-accent)',
                        }
                      : undefined
                  }
                >
                  <Highlight name={p.name} needle={deferred.trim()} />
                  <span className={`yy-label ${css.resultMeta}`}>
                    {[p.position, p.team].filter(Boolean).join(' · ')}
                  </span>
                </Link>
              </li>
            ))
          : null}
      </ul>
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
