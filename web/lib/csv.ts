/**
 * CSV projection — `COMPONENTS.md` §14, `DECISIONS.md` 55.
 *
 * The export is generated **from the same typed rows the view rendered**. The
 * projection happens here, on the server, beside the render, and the result
 * crosses to the client as plain data: a function cannot cross that boundary,
 * and shipping the accessor to the client would mean the export was built from
 * something other than what was drawn.
 *
 * The header comment block carries the source mart, the coverage statement,
 * every as-of date in play and the page URL, so the export renders the same
 * caveats the card does.
 */

export interface CsvColumn<T> {
  /** A stable id for the column, so a reordering is a diff and not a rewrite. */
  key?: string;
  /** The header cell. Snake-case, machine-readable — this is a data file. */
  label: string;
  get: (row: T) => unknown;
}

export interface CsvTable {
  columns: string[];
  rows: string[][];
  /** The caveats. One `# ` comment line each, above the header row. */
  meta: string[];
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

export function csvTable<T>(rows: T[], columns: CsvColumn<T>[], meta: string[]): CsvTable {
  return {
    columns: columns.map((c) => c.label),
    rows: rows.map((r) => columns.map((c) => cell(c.get(r)))),
    meta,
  };
}
