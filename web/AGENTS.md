# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# YIELD/YARD, specifically

- The app reads **precomputed marts only** (`ARCHITECTURE.md` §3). Never fetch nflverse, never
  read a parquet, never compute Cap+, a z-score or a positional share at request time. If a
  number needs computing, it is computed in `etl/` (Python) and lands in `data/marts/`.
- Every accessor in `lib/data/` returns `Metric<T>` — `value | blank | partial`, never a bare
  null (`SPEC.md` §1.2). A component that receives `blank` renders the reason string.
- `db/schema.ts` is the single TypeScript definition of the mart shapes in `SPEC.md` §7.
- Nothing outside `web/` is written by this package. `scripts/prepare.mjs` mirrors repo-root
  assets, tokens and `METHODOLOGY.md` **into** `web/`; it never writes back out.
