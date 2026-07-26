'use client';

/**
 * The menu panel — `COMPONENTS.md` §12.2, `MOBILE_PATTERNS.md` §3.2.
 *
 * **The one place the system uses elevation.** A dropdown at 1024+, a bottom
 * sheet at 390: full width, top corners only, `max-height: 70vh`, its own
 * scroll, a grab handle, and a scrim. Dismiss on scrim tap and on `Escape`;
 * focus returns to the trigger on close.
 *
 * Elevation is `--yy-elevation-menu`, which is `none` on dark (the raised
 * surface separates it) and a shadow on light — a 70px-blur shadow is invisible
 * on a dark surface (`DECISIONS.md` 86).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import css from './pickers.module.css';
import { IconChevronDown } from '../icons';

/**
 * EVERYTHING OUTSIDE THE MENU IS INERT WHILE IT IS OPEN.
 *
 * `MOBILE_PATTERNS.md` §3.2 gives this panel a scrim and a dismiss — which is a
 * modal in everything but name at 390, where it is a bottom sheet over a page
 * the reader can still Tab into, arrow through and click behind the scrim. The
 * fix is the platform's: mark every sibling on the path to `<body>` `inert`, so
 * focus, pointer events and the accessibility tree all stop at the menu's own
 * wrapper. The wrapper itself stays live, which keeps the trigger (focus returns
 * to it on Escape) and the scrim (a tap on it closes) working.
 *
 * Returns the undo, so the effect that opened the menu is the effect that
 * restores the page.
 */
function inertOutside(node: HTMLElement): () => void {
  const marked: HTMLElement[] = [];
  let el: HTMLElement | null = node;
  while (el && el !== document.body) {
    const parent: HTMLElement | null = el.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (sibling !== el && sibling instanceof HTMLElement && !sibling.hasAttribute('inert')) {
        sibling.setAttribute('inert', '');
        marked.push(sibling);
      }
    }
    el = parent;
  }
  return () => {
    for (const n of marked) n.removeAttribute('inert');
  };
}

/**
 * The close handler reaches items through context rather than through a render
 * callback: a function that reads a ref must not be CALLED during render, and a
 * render-prop is exactly that call.
 */
const MenuCloseContext = createContext<() => void>(() => {});

export function Menu({
  label,
  value,
  children,
  align,
}: {
  label: string;
  value: string;
  children: ReactNode;
  align?: 'end';
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    // The checked item, where there is one — a radio menu opens on the choice
    // already in force, not at the top of a 32-item list.
    const panel = panelRef.current;
    (
      panel?.querySelector<HTMLElement>('[data-menu-item][aria-checked="true"]') ??
      panel?.querySelector<HTMLElement>('[data-menu-item]')
    )?.focus();
    const restore = wrapRef.current ? inertOutside(wrapRef.current) : () => {};
    return () => {
      document.removeEventListener('keydown', onKey);
      restore();
    };
  }, [open]);

  /**
   * `role="menu"` is a promise about the keyboard: WAI-ARIA's menu pattern moves
   * between items with the arrow keys and puts Home/End at the ends, and the
   * items carry roving focus rather than each taking a tab stop. Declaring
   * `menu` + `menuitemradio` without any of that told assistive technology this
   * was a menu and then behaved like a list of buttons — 32 tab stops deep on
   * the team picker.
   */
  function onPanelKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('[data-menu-item]') ?? [],
    );
    if (!items.length) return;
    e.preventDefault();
    const here = items.indexOf(document.activeElement as HTMLElement);
    const next =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? items.length - 1
          : here < 0
            ? 0
            : e.key === 'ArrowDown'
              ? (here + 1) % items.length
              : (here - 1 + items.length) % items.length;
    items[next]?.focus();
  }

  // A stable callback: the panel's children receive it during render, and a
  // ref must not be read there.
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  return (
    <div className={css.menuWrap} ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`yy-label ${css.trigger}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="yy-visually-hidden">{label}: </span>
        {value}
        <IconChevronDown size={14} />
      </button>

      {open ? (
        <>
          <button
            type="button"
            className={css.scrim}
            aria-label="Close menu"
            onClick={close}
            tabIndex={-1}
          />
          <div
            id={id}
            ref={panelRef}
            className={css.panel}
            role="menu"
            aria-label={label}
            onKeyDown={onPanelKeyDown}
            style={align === 'end' ? { left: 'auto', right: 0 } : undefined}
          >
            <div className={css.grab} aria-hidden="true" />
            <MenuCloseContext.Provider value={close}>{children}</MenuCloseContext.Provider>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function MenuGroupLabel({ children }: { children: ReactNode }) {
  return <p className={`yy-label ${css.groupLabel}`}>{children}</p>;
}

export function MenuItem({
  children,
  selected,
  onSelect,
  trailing,
}: {
  children: ReactNode;
  selected?: boolean;
  onSelect: () => void;
  trailing?: ReactNode;
}) {
  const close = useContext(MenuCloseContext);
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={!!selected}
      data-menu-item
      /* ROVING FOCUS. The menu is one tab stop: Tab reaches the checked item (or
         the first, when the panel opens on a menu with no selection), and the
         arrow keys move within it. `tabIndex={0}` on every item would make a
         32-club picker 32 tab stops, which is the thing the menu pattern
         exists to avoid. */
      tabIndex={selected ? 0 : -1}
      className={`yy-label-lg ${css.item} ${selected ? css.itemSelected : ''}`}
      onClick={() => {
        onSelect();
        close();
      }}
    >
      {children}
      {trailing}
      {selected ? (
        <svg
          className={css.check}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="var(--yy-stroke-icon)"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M1.5 6.5 4.5 9.5 10.5 2.5" />
        </svg>
      ) : null}
    </button>
  );
}

export { css as menuCss };
