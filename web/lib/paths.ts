/**
 * Repo-root file resolution for BUILD-TIME programs only (the seed, next.config).
 *
 * The app itself never reads a CSV — it reads the seeded database
 * (`ARCHITECTURE.md` §3). Nothing in `app/` or `lib/data/` may import this module.
 *
 * `findMart` is the TypeScript twin of `tests/conftest.py::find_mart`: resolve the
 * first existing file among a list of candidate names, searching `data/marts`
 * then `data/curated` (then `data/curated/staging`, which is where the audited
 * player population still lives). Bare stems try `.csv` then `.parquet` so a mart
 * that lands in either format is picked up without a code change, and BUILD_PLAN
 * alias filenames can be passed as extra candidates.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_DIR = path.resolve(WEB_DIR, '..');

/**
 * `YY_DATA_DIR` relocates the mart tree without a code change. Two uses: a CI or
 * preview job that mounts `data/` elsewhere, and testing the seed's
 * missing-mart tolerance against a pruned copy without touching the repo.
 */
export const DATA_DIR = process.env.YY_DATA_DIR
  ? path.resolve(process.env.YY_DATA_DIR)
  : path.join(REPO_DIR, 'data');
export const MARTS_DIR = path.join(DATA_DIR, 'marts');
export const CURATED_DIR = path.join(DATA_DIR, 'curated');
export const STAGING_DIR = path.join(CURATED_DIR, 'staging');

/** Searched in order, exactly as `tests/conftest.py::DATA_DIRS` (plus staging). */
export const SEARCH_DIRS = [MARTS_DIR, CURATED_DIR, STAGING_DIR] as const;

/**
 * Resolve the first existing file among `candidates`.
 * Returns an absolute path, or `null` when no candidate exists anywhere.
 */
export function findMart(...candidates: string[]): string | null {
  for (const name of candidates) {
    const base = path.basename(name);
    const stems = base.includes('.') ? [name] : [`${name}.csv`, `${name}.parquet`];
    for (const stem of stems) {
      for (const dir of SEARCH_DIRS) {
        const p = path.join(dir, stem);
        if (existsSync(p)) return p;
      }
    }
  }
  return null;
}

/** Path relative to the repo root, for readable manifest output. */
export function rel(p: string): string {
  const r = path.relative(REPO_DIR, p);
  return r.startsWith('..') ? p : r;
}
