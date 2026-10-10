# YIELD/YARD

**NFL team economics, 1999 through 2025: what a win costs.** Results cover every season;
contract data starts in 2013. Every surface answers one question for one team, one season, one
contract, or one pair of teams.

The flagship metric is **Cap+**: on-field performance against the cap money a team carried,
indexed so 100 is that season's league average, drawn as field position on the league Field and
the team Drive. It is a descriptive price tag, not a front-office grade. It correlates 0.96
with the performance-only Team Rating, and `METHODOLOGY.md` says why. It covers all 13 contract
seasons, 2013–2025: ten measured, three (2016, 2020, 2021) built on estimated dead money and
badged as such.

**Live:** https://nfl-o-nomics.vercel.app (v2, deployed on Vercel). Gate #1 on Cap+ was reopened
and ruled on 2026-10-10 (λ = 1, opponent-adjusted EPA, obligation index retired, the blank
seasons filled; `CAPPLUS_MEMO.md` §9). The marts carry the ruled build.

---

## Repo map

| Path | What it is |
|---|---|
| `etl/` | Python production ETL. Reads nflverse releases remotely plus `data/curated/`, writes `data/marts/*.csv`. Offline, idempotent, **byte-stable**. |
| `data/` | `curated/` — hand-built sources, every row carrying a `source_url`. `marts/` — the 21 marts that are the entire contract surface with the app, including `capplus_context` (QB window, QB-neutral Cap+, future-cap mortgage). `raw/` — **empty by design**, and the pipeline asserts it. |
| `web/` | The Next.js App Router front end. Reads **precomputed marts only** — no fetch, no parquet, no metric computed at request time. |
| `design/` | The Phase A handoff and the Phase B design system: `system/tokens.css` + `tokens.json`, the component and chart anatomy specs, and `system/RESOLUTIONS.md`, which rules every divergence. `reviews/` holds the 2026-10-10 critique of shipped v1 and the blind visualization proposals that drove v2. |
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

`npm run seed` writes an in-process Postgres to `.data/`. **No provisioned service is needed to
develop or build.** `npm run build` produces a static build. `prepare.mjs` runs before `dev` and
`build`; it mirrors `METHODOLOGY.md`, the asset manifests and the flags into `web/lib/generated/`.
`.claude/launch.json` defines `web-dev` (port 3000) and `web-prod` (port 3005) for the preview
tools.

---

## Tests

```bash
pytest tests/ -v                          # 225 passed
cd web && npm run lint && npm run typecheck
python3 design/system/verify_tokens.py    # CI gate: tokens.json mirrors tokens.css
python3 web/scripts/verify.py             # Playwright: both canvases, both themes (needs a build)
```

CI (`.github/workflows/ci.yml`) gates every push on **two** of these: the design-token mirror
assert, then the pytest suite. Both read **committed files only**. A test that fetches from the
network tests nflverse's uptime, not this pipeline.

The suite has three layers: externally verified golden facts (money at ±1%, everything else
exact), structural invariants over whole marts, and a schema contract per mart.
`test_contracts.py` also pins the Cap+ context finding (Cap+ above 0.9 correlated with Team
Rating, the rookie-QB lever under 5 points), so the reopen's evidence can't quietly erode, and
`test_capplus_v3.py` pins the 2026-10-10 rulings, including the SAFE-tier reversal. `tests/README.md` explains how to add
to each layer.

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
| `CAPPLUS_MEMO.md` | The Cap+ formula and its backtest (the July λ = 1.5 build), §8 the 2026-10-10 reopen, and §9 the rulings that closed it (λ = 1). |
| `METHODOLOGY.md` | What the public is told. `prepare.mjs` copies it into the app and it renders at `/methodology`. Edit the root file, never the generated copy. |

---

## Deploy

Production runs on Vercel at https://nfl-o-nomics.vercel.app. `web/vercel.json` builds with
`npm run prepare:assets && npm run seed && npm run build`, so each deploy seeds from the
committed marts and ships a static build.

**`DATABASE_URL` unset means PGlite**, an in-process Postgres loaded from a dump the seed writes.
Set it to a Postgres connection string and re-run `npm run seed && npm run build` for the same
Drizzle schema, seed program and queries on a hosted database, with no code change. Use a
read-write role for the seed job and a read-only role for the app (`ARCHITECTURE.md` §8). See
`web/.env.example`. Neon is the intended host if that swap happens, and it isn't provisioned.

`NEXT_PUBLIC_SITE_URL` overrides the base for `og:` and `twitter:` URLs when a custom domain
lands.

---

## Licensing and attribution

- **Data — nflverse.** Play-by-play, schedules, rosters, contracts, snap counts and draft data
  come from pinned nflverse release tags (`etl/pins.toml`), never `latest`. Cited on
  `/methodology`.
- **Draft value chart — Fitzgerald–Spielberger** (Over The Cap), a curated file with a per-row
  `source_url`, cited on `/methodology`.
- **Dead money — dated press snapshots**, per-row citations, tiered SAFE/REVIEW in
  `data/curated/`, plus the curated estimate for 2016, 2020 and 2021
  (`dead_money_estimated.csv`, written by `etl/deadmoney_estimate.py`). The REVIEW tier is
  subject to an open licensing conversation (`RISKS.md` risk 1); `DEAD_MONEY_TIER=safe` is the
  one-line reversal, and it withdraws the estimate too.
- **Images — Wikimedia Commons.** Attribution is required on **223 of 244 assets and is legally
  load-bearing** — it is never hidden behind a hover or an "info" affordance. `/credits` carries
  the deduplicated author list. Photos are served as Commons published them, untransformed, with
  the treatment applied by CSS at render time (`RISKS.md` risk 3).
- **Team logos** are self-hosted from the nflverse color/logo file behind the
  `TEAMMARK_KILLSWITCH` flag, with a typographic fallback chip (`RISKS.md` risk 2).
- **Fonts — Bebas Neue, Rajdhani, Inter.** All three under **SIL OFL 1.1**, self-hosted as
  latin-subset WOFF2 in `web/public/fonts/` with their licenses and a reproducible subset
  command. There are no third-party font requests anywhere in the product.
