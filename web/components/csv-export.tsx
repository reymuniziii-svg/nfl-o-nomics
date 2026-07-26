'use client';

/**
 * `CsvExport` — `COMPONENTS.md` §14, `SPEC.md` §8.1, `DECISIONS.md` 55.
 *
 * The file is assembled **in the browser** from the projected rows the view
 * rendered (`lib/csv.ts`), so there is no round-trip and no second query: the
 * export is the card.
 *
 * THE HEADER COMMENT BLOCK carries the source mart, the coverage statement,
 * every as-of date in play and the page URL — meaning **the export renders the
 * same caveats the card does**. A card whose caveats are not expressible in the
 * CSV header is a card whose caveats are not fully specified.
 *
 * Form: a text button, never an icon alone. Never a floating action button,
 * never a footer link, never a menu item.
 */

import css from './csv-export.module.css';
import { csvField } from '@/lib/display';
import type { CsvTable } from '@/lib/csv';

export function CsvExport({
  title,
  filename,
  table,
}: {
  /** The card title — the `aria-label` reads "Download {title} as CSV". */
  title: string;
  /** `yieldyard_{surface}_{params}_{season}.csv` */
  filename: string;
  table: CsvTable;
}) {
  function download() {
    const url = typeof window === 'undefined' ? '' : window.location.href;
    const header = [...table.meta, `page: ${url}`, `generated: ${new Date().toISOString()}`]
      .map((line) => `# ${line}`)
      .join('\n');

    const body = [
      table.columns.map(csvField).join(','),
      ...table.rows.map((r) => r.map(csvField).join(',')),
    ].join('\n');

    const blob = new Blob([`${header}\n${body}\n`], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(href);
  }

  return (
    <button
      type="button"
      className={`yy-label ${css.btn}`}
      onClick={download}
      aria-label={`Download ${title} as CSV`}
    >
      CSV
      <svg
        className={css.glyph}
        width="10"
        height="12"
        viewBox="0 0 10 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="var(--yy-stroke-icon)"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 1v7" />
        <path d="M2 5.5 5 8.5 8 5.5" />
        <path d="M1 11h8" />
      </svg>
    </button>
  );
}
