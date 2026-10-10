'use client';

/**
 * `FinePrint` — the inline expand of `MOBILE_PATTERNS.md` §3.1, for a chart's
 * method note (review D #9: "caveat prose outweighs the charts").
 *
 * THE DISCLOSURE PROHIBITION (§3.4) is honoured by construction: `short` is
 * always visible and must be a complete statement on its own; the region only
 * adds precision. Export scopes force it open (`.yy-export`), so a screenshot
 * never hides a caveat.
 */

import { useId, useState, type ReactNode } from 'react';
import css from './team.module.css';

export function FinePrint({
  short,
  children,
  label = 'Method note',
}: {
  short: ReactNode;
  children: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={css.fine}>
      <p className={`yy-caption ${css.fineShort}`}>{short}</p>
      <button
        type="button"
        className={`yy-label ${css.fineBtn}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
        <span className={css.fineChevron} aria-hidden="true" />
      </button>
      <div id={id} className={css.fineRegion} data-open={open}>
        <div className={css.fineInner}>{children}</div>
      </div>
    </div>
  );
}
