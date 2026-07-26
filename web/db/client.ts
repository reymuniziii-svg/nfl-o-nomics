/**
 * Database connection — local-first, Neon when provisioned.
 *
 * ONE SWITCH, read from the environment:
 *
 *   DATABASE_URL set   -> postgres-js against that URL (Neon: local, preview, prod
 *                         branches per `ARCHITECTURE.md` §8).
 *   DATABASE_URL unset -> PGlite, an in-process Postgres, loaded READ-ONLY from the
 *                         data-directory dump the seed writes to `.data/pgdata.tar.gz`.
 *
 * Why a dump rather than a live PGlite data directory: `next build` renders pages in
 * several worker processes and a PGlite data directory is single-writer. Each worker
 * therefore inflates its own private in-memory copy of the same immutable dump —
 * safe, parallel, and about 1–2s of one-time cost per worker.
 *
 * The app never writes. Seeding uses a separate credential and runs from CI or an
 * operator machine, never from a request handler (`ARCHITECTURE.md` §3).
 */

import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { schema, type Schema } from './schema';

export type YyDatabase = PgDatabase<PgQueryResultHKT, Schema, ExtractTablesWithRelations<Schema>>;

/** Absolute path of the PGlite dump, relative to the `web/` package root. */
export const PGLITE_DUMP_RELPATH = '.data/pgdata.tar.gz';
/** Live data directory the seed writes; the dump is taken from it. */
export const PGLITE_DATA_RELPATH = '.data/pglite';

export function databaseUrl(): string | null {
  const u = process.env.DATABASE_URL?.trim();
  return u ? u : null;
}

export function driverName(): 'postgres' | 'pglite' {
  return databaseUrl() ? 'postgres' : 'pglite';
}

async function webDir(): Promise<string> {
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}

export async function pgliteDumpPath(): Promise<string> {
  const path = await import('node:path');
  return path.join(await webDir(), PGLITE_DUMP_RELPATH);
}

export async function pgliteDataPath(): Promise<string> {
  const path = await import('node:path');
  return path.join(await webDir(), PGLITE_DATA_RELPATH);
}

/* ------------------------------------------------------------------ */
/* Connection factories                                                 */
/* ------------------------------------------------------------------ */

export interface Connection {
  db: YyDatabase;
  /** Raw SQL escape hatch — DDL and TRUNCATE only, never a formula. */
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
  driver: 'postgres' | 'pglite';
}

/** postgres-js against `DATABASE_URL` (Neon). */
export async function connectPostgres(url: string, opts: { max?: number } = {}): Promise<Connection> {
  const [{ default: postgres }, { drizzle }] = await Promise.all([
    import('postgres'),
    import('drizzle-orm/postgres-js'),
  ]);
  const sql = postgres(url, { max: opts.max ?? 1, prepare: false });
  const db = drizzle(sql, { schema }) as unknown as YyDatabase;
  return {
    db,
    driver: 'postgres',
    exec: async (statement: string) => {
      await sql.unsafe(statement);
    },
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}

/**
 * PGlite. `mode: 'dump'` inflates the immutable seed dump into memory (the read
 * path); `mode: 'dir'` opens the writable data directory (the seed path only).
 */
export async function connectPglite(
  mode: 'dump' | 'dir' = 'dump',
): Promise<Connection> {
  const [{ PGlite }, { drizzle }] = await Promise.all([
    import('@electric-sql/pglite'),
    import('drizzle-orm/pglite'),
  ]);

  let pg: InstanceType<typeof PGlite>;
  if (mode === 'dir') {
    pg = new PGlite({ dataDir: await pgliteDataPath() });
  } else {
    const { readFile } = await import('node:fs/promises');
    const dumpPath = await pgliteDumpPath();
    let raw: Buffer;
    try {
      raw = await readFile(dumpPath);
    } catch {
      throw new Error(
        `No seeded database found.\n` +
          `  expected: ${dumpPath}\n` +
          `  fix:      run \`npm run seed\` in web/ (or set DATABASE_URL to a seeded Postgres).`,
      );
    }
    pg = new PGlite({
      loadDataDir: new File([raw as unknown as BlobPart], 'pgdata.tar.gz', {
        type: 'application/x-gzip',
      }),
    });
  }
  await pg.waitReady;
  const db = drizzle(pg, { schema }) as unknown as YyDatabase;
  return {
    db,
    driver: 'pglite',
    exec: async (statement: string) => {
      await pg.exec(statement);
    },
    close: async () => {
      await pg.close();
    },
  };
}

/** Open a connection using the DATABASE_URL switch. */
export async function connect(
  pgliteMode: 'dump' | 'dir' = 'dump',
): Promise<Connection> {
  const url = databaseUrl();
  return url ? connectPostgres(url) : connectPglite(pgliteMode);
}

/* ------------------------------------------------------------------ */
/* Process-wide singleton for the read path                             */
/* ------------------------------------------------------------------ */

declare global {
  var __yyConnection: Promise<Connection> | undefined;
}

/**
 * The read-path connection. One per process — `next build` render workers each
 * get their own, and `next dev` reuses one across HMR reloads via globalThis.
 */
export function getConnection(): Promise<Connection> {
  if (!globalThis.__yyConnection) {
    globalThis.__yyConnection = connect('dump');
  }
  return globalThis.__yyConnection;
}

export async function getDb(): Promise<YyDatabase> {
  return (await getConnection()).db;
}
