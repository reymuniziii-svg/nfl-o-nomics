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
  type ReactNode,
} from 'react';
import css from './pickers.module.css';
import { IconChevronDown } from '../icons';

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
    panelRef.current?.querySelector<HTMLElement>('[data-menu-item]')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // A stable callback: the panel's children receive it during render, and a
  // ref must not be read there.
  const close = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  return (
    <div className={css.menuWrap}>
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
