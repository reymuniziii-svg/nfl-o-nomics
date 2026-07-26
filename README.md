# YIELD/YARD

**Twenty-five seasons of what NFL teams spent, and what they got for it.** Every surface answers
one question — *was it worth it?* — for one team, one season, one contract, or one pair of teams.

The flagship metric is **Cap+**: on-field performance per dollar actually spent, indexed so that
100 is that season's league average, rendered as field position on exactly two surfaces
(`METHODOLOGY.md`).

---

## Repo map

| Path | What it is |
|---|---|
| `etl/` | Python production ETL. Reads nflverse releases remotely plus `data/curated/`, writes `data/marts/*.csv`. Offline, idempotent, **byte-stable**. |
| `data/` | `curated/` — hand-built sources, every row carrying a `source_url`. `marts/` — the 20 marts that are the entire contract surface with the app. `raw/` — **empty by design**, and the pipeline asserts it. |
| `web/` | The Next.js App Router front end. Reads **precomputed marts only** — no fetch, no parquet, no metric computed at request time. |
| `design/` | The Phase A handoff and the Phase B design system: `system/tokens.css` + `tokens.json`, the component and chart anatomy specs, and `system/RESOLUTIONS.md`, which rules every divergence. |
| `audit/` | The frozen Phase-0 evidence record and its findings files. **Read, imported and copied from — never written to.** |
| `tests/` | The CI harness: golden facts, structural invariants, per-mart schema contracts. Committed files only, no network. |
| `assets/` | The identity-asset pipeline — TeamMark (32 club logos), PlayerMark (Wikimedia Commons photos), and the `/credits` data. Nothing is ever hotlinked. |

---

## Quickstart

**Data.** Python 3.11. A full cold run is ~70s, almost all of it remote play-by-play scans.

```bash
pip install pandas numpy duckdb pyarrow requests pytest
python -m etl.pipeline            # everything, in dependency order
python -m etl.pipeline --list     # marts, contracts, aliases
```

Marts are committed, so you only need this if you are changing the pipeline.

**App.** Node ≥ 20.9.

```bash
cd web
npm install
npm run seed                      # marts -> database (PGlite by default)
npm run dev
```

`npm run seed` writes an in-process Postgres to `.data/` — **no provisioned service is needed to
develop or build.** `npm run build` produces 1,168 static units.

---

## Tests

```bash
pytest tests/ -v                          # 182 passed, ~0.4s
cd web && npm run lint && npm run typecheck
python3 design/system/verify_tokens.py    # CI gate: tokens.json mirrors tokens.css
python3 web/scripts/verify.py             # Playwright: both canvases, both themes (needs a build)
```

CI (`.github/workflows/ci.yml`) gates every push on **two** of these: the design-token mirror
assert, then the pytest suite. Both read **committed files only** — a test that fetches from the
network is testing nflverse's uptime, not this pipeline.

The suite is three things: 18 externally-verified golden facts (money at ±1%, everything else
exact, currently returning delta zero and $0), 11 structural invariants over whole marts, and a
schema contract per mart. `tests/README.md` explains how to add to each.

---

## Governance docs

Read together; they cross-reference each other by filename.

| Doc | What it is |
|---|---|
| `SPEC.md` | What gets built — product identity, the four views, the URL schema, every mart's columns. |
| `ARCHITECTURE.md` | How it is built — the ETL/app boundary, the data layer, environments, CI. |
| `BUILD_PLAN.md` | When, in phases, with the four approval gates and the ordered cut lines. Current status is at the top. |
| `RISKS.md` | What can go wrong, ranked by expected damage, each with a named owner and a mitigation. |
| `DECISIONS.md` | What was settled and why — one line each, dated, so a maintainer can tell a decision from an accident. |
| `DATA_AUDIT.md` | The evidence gate: coverage tables, the golden facts and their sources, and the **thirteen traps register** — required reading before writing a query. |
| `CAPPLUS_MEMO.md` | The Cap+ formula, its backtest, and the reasoning behind λ = 1.5. |
| `METHODOLOGY.md` | What the public is told. Becomes `/methodology`. |

---

## Deploy

**`DATABASE_URL` unset → PGlite. Set it to a Neon connection string and re-run
`npm run seed && npm run build` — same Drizzle schema, same seed program, same queries, no code
change.** Use a read-write role for the seed job and a read-only role for the app
(`ARCHITECTURE.md` §8); see `web/.env.example`.

The app deploys to Vercel as a static build. Neither the Neon project nor the Vercel project is
provisioned yet — both are open items in `BUILD_PLAN.md`, and until the Vercel project exists,
local verification stands in for deploy verification.

---

## Licensing and attribution

- **Data — nflverse.** Play-by-play, schedules, rosters, contracts, snap counts and draft data
  come from pinned nflverse release tags (`etl/pins.toml`), never `latest`. Cited on
  `/methodology`.
- **Draft value chart — Fitzgerald–Spielberger** (Over The Cap), a curated file with a per-row
  `source_url`, cited on `/methodology`.
- **Dead money — dated press snapshots**, per-row citations, tiered SAFE/REVIEW in
  `data/curated/`. The REVIEW tier is subject to an open licensing conversation (`RISKS.md`
  risk 1); `DEAD_MONEY_TIER=safe` is the one-line reversal.
- **Images — Wikimedia Commons.** Attribution is required on **223 of 244 assets and is legally
  load-bearing** — it is never hidden behind a hover or an "info" affordance. `/credits` carries
  the deduplicated author list. Photos are served as Commons published them, untransformed, with
  the treatment applied by CSS at render time (`RISKS.md` risk 3).
- **Team logos** are self-hosted from the nflverse colour/logo file behind the
  `TEAMMARK_KILLSWITCH` flag, with a typographic fallback chip (`RISKS.md` risk 2).
- **Fonts — Bebas Neue, Rajdhani, Inter.** All three under **SIL OFL 1.1**, self-hosted as
  latin-subset WOFF2 in `web/public/fonts/` with their licences and a reproducible subset
  command. There are no third-party font requests anywhere in the product.
