# web/ — YIELD/YARD front end

Next.js App Router + TypeScript. Reads **precomputed marts only** (`ARCHITECTURE.md` §3): no
nflverse fetch, no parquet, no metric computed at request time.

The repo is polyglot — `etl/` is Python, `web/` is Node. This package owns everything under
`web/` and reads (never writes) the rest of the repo.

```
npm install
npm run seed      # marts -> database  (PGlite by default; see below)
npm run build     # 1,120+ static pages
npm start
```

`npm run dev` and `npm run build` both run `scripts/prepare.mjs` first, which mirrors the asset
pipeline's output, the design tokens and `METHODOLOGY.md` into `web/` and regenerates the
`etl/config.py` flag bridge. Everything it writes is gitignored.

## The DATABASE_URL swap, in one line

**`DATABASE_URL` unset → PGlite (in-process Postgres, `.data/pgdata.tar.gz`); set it to a Neon
connection string and re-run `npm run seed && npm run build` — same Drizzle schema, same seed
program, same queries, no code change.**

Local-first is the default so the project needs no provisioned service to develop or build
against: `npm run seed` writes `.data/pglite` and dumps it to `.data/pgdata.tar.gz`, which every
`next build` render worker inflates read-only into memory. When Neon is provisioned, set
`DATABASE_URL` (read-write role for the seed job, read-only role for the app — `ARCHITECTURE.md`
§8) and both programs follow it. See `.env.example`.

## Layout

| Path | What it is |
|---|---|
| `db/schema.ts` | Drizzle schema — the single TypeScript definition of `SPEC.md` §7 |
| `db/seed.ts` | The seed program. Tolerant mart location, tolerant of marts that do not exist yet, destructive and idempotent, prints a manifest |
| `db/client.ts` | The `DATABASE_URL` switch |
| `lib/data/` | The typed data layer. Every accessor returns `Metric<T>` |
| `lib/metric.ts` | `Metric<T>` and the approved launch copy |
| `lib/teams.ts` | The 32 codes, divisions, legacy redirects, and the era-identity table |
| `lib/marks.ts` | TeamMark / PlayerMark loaders and the kill-switch branch |
| `lib/flags.ts` | GATE #3 flags: env var > `etl/config.py` bridge > literal default |
| `app/` | The routes of `SPEC.md` §6 |
| `scripts/prepare.mjs` | Asset mirror, flag bridge, `METHODOLOGY.md` copy, token mirror |

## Routes

| Route | Rendering |
|---|---|
| `/` | static — home, AFC East default |
| `/division/{div}` | static, 8 |
| `/team/{abbr}` | **301** to the franchise's most recent season (`next.config.ts`) |
| `/team/{abbr}/{season}` | static, 861 |
| `/player/{id}` | static, 251 — the audited v1 population (DECISIONS 53) |
| `/compare?a=&b=` | on demand, cached at the edge for the life of the snapshot |
| `/methodology`, `/credits` | static |

Legacy franchise codes (`oak`, `stl`, `sd`, `lar`, `sl`, `jac`, `arz`, `blt`, `clv`, `hst`,
`wsh`, `wft`) **301** to the canonical route, with or without a season. The route key is
franchise-continuous; the rendered identity is era-correct, so `/team/lv/2003` is the 2003
Raiders and the page says **Oakland**.

## Design tokens

`app/globals.css` imports `./tokens.css`, which `scripts/prepare.mjs` mirrors from
`design/system/tokens.css` (and stubs with the same token names if the design track has not
published yet). Components bind to the semantic layer — `--yy-bg`, `--yy-fg-1`,
`--yy-line-divider` — never to a raw palette token, or they will not theme.
