/**
 * Which marts this snapshot actually contains.
 *
 * The seed writes a row per table into `seed_manifest`. Every accessor in
 * `lib/data/` consults it before querying, so a mart the ETL has not landed yet
 * degrades to an explicit `Metric` blank with a stated reason — never an
 * exception, and never a silent zero (`SPEC.md` §1.2).
 */

import { getDb } from '@/db/client';
import * as s from '@/db/schema';

export interface SeedManifestRow {
  tableName: string;
  sourceFile: string | null;
  status: string;
  reason: string | null;
  rowCount: number;
  expectedRows: number | null;
}

let manifestPromise: Promise<Map<string, SeedManifestRow>> | null = null;

export function getSeedManifest(): Promise<Map<string, SeedManifestRow>> {
  if (!manifestPromise) {
    manifestPromise = (async () => {
      const db = await getDb();
      const rows = await db
        .select({
          tableName: s.seedManifest.tableName,
          sourceFile: s.seedManifest.sourceFile,
          status: s.seedManifest.status,
          reason: s.seedManifest.reason,
          rowCount: s.seedManifest.rowCount,
          expectedRows: s.seedManifest.expectedRows,
        })
        .from(s.seedManifest);
      return new Map(rows.map((r) => [r.tableName, r]));
    })();
  }
  return manifestPromise;
}

/** True when the named mart was seeded with at least one row. */
export async function isSeeded(table: string): Promise<boolean> {
  const m = await getSeedManifest();
  const row = m.get(table);
  return !!row && row.status === 'seeded' && row.rowCount > 0;
}

export interface BuildStamp {
  driver?: string;
  dead_money_tier?: string;
  license_tiers_shipped?: string[];
  tables_seeded?: number;
  tables_skipped?: number;
  rows_total?: number;
}

let stampPromise: Promise<BuildStamp> | null = null;

/** The snapshot stamp, rendered in the footer so any screenshot is traceable. */
export function getBuildStamp(): Promise<BuildStamp> {
  if (!stampPromise) {
    stampPromise = (async () => {
      const db = await getDb();
      const rows = await db.select({ doc: s.seedStamp.doc }).from(s.seedStamp).limit(1);
      return (rows[0]?.doc ?? {}) as BuildStamp;
    })();
  }
  return stampPromise;
}
