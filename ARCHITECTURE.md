# ARCHITECTURE.md — YIELD/YARD

**How v1 is built.** Written 2026-07-25. What is built is in `SPEC.md`; when, in
`BUILD_PLAN.md`. Data facts come from `DATA_AUDIT.md`.

---

## 1. Shape of the system

```
   nflverse releases            curated CSVs (in-repo, per-row citations)
   (remote parquet)             dead_money_*, coaching_staff, league_cap
          │                                  │
          └──────────────┬───────────────────┘
                         ▼
             etl/  (Python 3.11, offline, idempotent)
                         ▼
              data/marts/*.csv   ← the contract surface (SPEC.md §7)
                         ▼
              seed/  (Drizzle push into Neon Postgres)
                         ▼
   Next.js App Router (TypeScript) · static + ISR · Vercel
                         ▼
              browser — no client-side data fetching for v1 page content
```

Two properties hold everywhere and are worth stating once:

1. **The app reads precomputed marts only.** It never reads nflverse, never reads a parquet,
   never computes Cap+, a z-score, or a positional share at request time. Every number a user
   sees was computed offline in Python, written to a mart, tested, and seeded.
2. **ETL is Python; the app is TypeScript.** The boundary between them is the mart schema in
   `SPEC.md` §7 and nothing else. No shared code, no shared runtime, no Python at request time.

---

## 2. App — Next.js App Router on Vercel

**Next.js (App Router) + TypeScript**, deployed on Vercel. React Server Components for all
data-bearing pages; client components only where interaction demands it (pickers, the
numerator toggle, chart hover, CSV export).

**Rendering strategy: static-first.** v1 data is a fixed snapshot, so nearly everything is
statically generated at build time.

| Route | Strategy | Pages |
|---|---|---:|
| `/` | static | 1 |
| `/division/{div}` | static, `generateStaticParams` | 8 |
| `/team/{abbr}` | static 301 to latest season | 32 |
| `/team/{abbr}/{season}` | static, `generateStaticParams` | **861** |
| `/player/{id}` | static, `generateStaticParams` | **~251** |
| `/compare` | **ISR on demand**, `revalidate` long, cached at the edge after first hit | unbounded |
| `/methodology`, `/credits` | static | 2 |

**~1,155 statically generated pages** (861 team-season + 32 franchise + 251 player + 8 division
+ 3 fixed) plus compare-on-demand. That is a small build; there is
no need for partial prerendering or build-time sharding.

`/compare` is the only route that cannot be enumerated — 861 × 861 ordered pairs is 741k
combinations, of which realistically a few hundred get visited. It renders on first request,
is cached, and revalidates only when the data snapshot changes. A canonical ordering
(`a` before `b` by `(team, season)`) collapses each pair to one cache entry.

**Styling.** CSS Modules plus the `--yy-*` custom-property token layer from `SPEC.md` §4. No
utility-CSS framework that would encourage hardcoded values outside the token system.

**Charts.** D3 scales + visx primitives, rendered as SVG in server components where static and
hydrated only for hover/tooltip. No charting library that owns its own visual language.

**Fonts.** Self-hosted, subset, `font-display: swap`. Bebas Neue and Inter are open-licensed
and ship immediately; Rajdhani substitutes for Squadron Black until licensing clears
(`BUILD_PLAN.md` gate #2).

---

## 3. Data layer — Neon Postgres + Drizzle

**Neon Postgres** with **Drizzle ORM**. Drizzle schema files are the single TypeScript
definition of the mart shapes in `SPEC.md` §7 — the app's types are inferred from the schema,
so a mart column change breaks the type-check rather than the page.

Why a database at all, when v1 data is static and would fit in JSON:

- The compare route is on-demand and benefits from indexed lookups rather than shipping the
  whole dataset into a serverless function.
- Player search wants an index, not a linear scan.
- v2 (in-season refresh, more players, the query builder) needs it, and retrofitting a
  database after 1,100 static pages have been built against a JSON import is more work than
  starting with one.
- Neon's free tier covers this comfortably; the dataset is on the order of 40k rows.

**The app reads marts and only marts.** There are no computed columns, no views that recompute
metrics, no SQL that implements a formula. If a number needs computing, it is computed in ETL.
The read path is: Server Component → Drizzle query → typed row → `Metric<T>` wrapper
(`SPEC.md` §1.2) → component.

**No writes from the app.** The app has read-only credentials. Seeding uses a separate
credential and runs from CI or a local operator machine, never from a request handler.

---

## 4. ETL — Python, offline

`etl/` is promoted from the audit scripts. The audit scripts stay in `audit/` as the evidence
record and are not deleted; `etl/` is the production path and imports the shared modules rather
than copying them.

| `etl/` script | Promoted from | Produces |
|---|---|---|
| `etl/team_codes.py` | `audit/team_codes.py` | **the shared normalizer** (§4.2) |
| `etl/performance.py` | `audit_pbp.py` + `audit_schedules.py` | `team_season_results`, `team_season_epa` |
| `etl/contracts.py` | `audit_contracts.py` | `team_season_cap`, `player_season_cap`, `position_allocation` |
| `etl/support.py` | `audit_support.py` | draft marts, `player_season_availability`, team metadata |
| `etl/deadmoney.py` | `build_deadmoney_curated.py` | `dead_money_team_season` (+ `license_tier`), `dead_money_ledger` |
| `etl/coaching.py` | new, per `SPEC.md` §2.8 | `team_season_stability`, `regime_events` |
| `etl/capplus.py` | `capplus_backtest.py` §15 | `capplus_official`, `team_rating` |
| `etl/images.py` | `audit_images.py` | `player_images` |
| `etl/assets.py` | new | logo + photo fetch, treatment, credits generation (§5) |

### 4.1 Remote-scan strategy

**DuckDB `httpfs` scans each nflverse release parquet remotely and projects only the columns
needed**, so no raw parquet ever lands on disk. The pbp files carry 372 columns and we read
six. `data/raw/` is empty at rest and a test asserts it. `--download` remains as a
one-season-at-a-time fallback that deletes each file immediately after aggregating.

DuckDB's httpfs is pointed at `HTTPS_PROXY` and `/root/.ccr/ca-bundle.crt`; **TLS verification
stays enabled**. This is the established pattern in every audit script and it is not
re-litigated.

### 4.2 The team-code normalizer — one shared module

**Four conventions exist and every one of them is live:**

| Source | Convention | Example |
|---|---|---|
| nflverse pbp | **retroactive current-franchise** | `LA`/`LAC`/`LV` even in 1999; `STL`/`SD`/`OAK` never appear |
| `games.csv`, `teams.csv` | **era-correct** | `STL` 1999–2015, `SD` 1999–2016, `OAK` 1999–2019 |
| `draft_picks.team` | **PFR boxscore** | `NWE`, `GNB`, `SFO`, `LVR`, `SDG`, `KAN`, `NOR`, `TAM` |
| `teams.csv.pfr` | **PFR franchise** | `CRD`, `RAV`, `OTI`, `RAM` |

Everything routes through `etl/team_codes.py`. **`normalize_team` alone leaves 8 draft codes
wrong** — `PFR_DRAFT_TEAM_MAP` must run in front of it for draft data. OTC additionally emits
nicknames (`Oilers`→`TEN`, `Redskins`/`Washington`/`Commanders`→`WAS`), handled by
`NICKNAME_TO_CODE` in the same module.

The module is imported, never copied. A structural test asserts each mart's team-code set is
exactly the expected 32 (or the era-correct set, for curated sources that deliberately preserve
era codes — `coaching_staff.csv` keeps 35).

### 4.3 Idempotency and byte-stable re-runs

**Established standard, carried forward without exception:** every ETL script is idempotent,
overwrites its outputs in full, and produces byte-identical output on re-run given identical
inputs. This was verified in the audit (two independent cold runs of the image pipeline
produced a byte-identical CSV) and it is the property that makes the golden tests meaningful in
CI.

Concretely: deterministic sort order on every output, `csv.QUOTE_MINIMAL`, LF line endings,
UTF-8, trailing newline, fixed float formatting, no timestamps in output files, no dict
iteration order dependence, fixed random seeds where sampling occurs.

A CI job runs the ETL against pinned inputs and diffs the marts. A non-empty diff on an
unchanged input is a bug.

### 4.4 Release pinning

nflverse assets are pinned to a **named release tag**, not `latest`. The pinned tag is recorded
in `etl/pins.toml` alongside a row-count and a checksum for each asset. Bumping a pin is an
explicit commit that re-runs the golden tests. This is the mitigation for schema drift
(`RISKS.md` risk 6).

---

## 5. Asset pipeline

Two independent pipelines, both offline, both writing into `public/` (or object storage) and a
metadata mart.

**Logos.** `etl/assets.py logos` fetches the URLs in nflverse `teams_colors_logos` once,
normalizes to the containment spec from the design track, writes self-hosted files, and records
`(team, variant, source_url, fetched_at, sha256)`. **Nothing is ever hotlinked.** The
`TEAM_LOGOS_ENABLED` kill-switch (`SPEC.md` §5.1) is a build-time and runtime flag; the takedown
runbook is `RISKS.md` risk 2.

**Player photos.** `etl/assets.py photos`:
1. Resolves each player through the verified route (Wikipedia article → Wikidata → P18 →
   Commons `imageinfo`), with **team-category confirmation outranking exact-name match**.
2. Captures the full licence metadata block (`SPEC.md` §7.10) including `share_alike` and
   `last_verified_at`.
3. Applies the **automated treatment step** per the design spec. **OPEN DECISION 2 cleared
   2026-07-25 — option (a)** (`SPEC.md` §5.2): under option (a) the
   pipeline stores the unmodified source and the treatment is CSS-only at render time, so no
   fixed derivative is created; under (c) the pipeline bakes the treatment and stamps the
   asset's licence obligations into the metadata. The pipeline is written so this is a
   configuration branch, not a rewrite.
4. Generates the `/credits` page content, **deduplicated by author** — three authors account
   for ~49% of usable photos.

**Politeness is not optional** on the Wikimedia APIs: `maxlag=5`, ~60ms spacing, exponential
backoff over 7 attempts on 429/503, descriptive User-Agent with contact, batched requests
(50 Wikidata entities / 20 Commons files per call). A cold full run is ~1,740 calls / ~7 min.
**A failed call is never recorded as a miss** — it raises and is counted separately as
`api_error`, because an empty result is indistinguishable from "this player has no photo".

Assets are refreshed on the same cadence as the data (§6) and the run **diffs** against the
previous metadata rather than replacing it silently: Commons files get renamed, relicensed and
deleted, and team categories change every March in free agency.

---

## 6. Data refresh model

**v1 is a static snapshot.** The dataset is frozen at build time. There is no scheduled job, no
webhook, no in-season update path.

- **Cadence:** a manual ETL re-run preseason (and after any pin bump), reviewed by a human, then
  seeded and redeployed. That is roughly once a year plus corrections.
- **In-season updates are v2.** The reason is in the data, not in the engineering: contract
  figures are **season-final restatements** (`DATA_AUDIT.md` §6, trap 12), so no "as of week N"
  cap view is possible; and dead-money figures are dated press snapshots, so a mid-season
  refresh would change the as-of date of published numbers, which is exactly the misuse the
  as-of discipline exists to prevent.
- **Corrections** follow the published corrections policy (`METHODOLOGY.md`): fix the curated
  row, re-run, re-seed, note it.

The 2025 season is complete (pbp through Super Bowl LX on 2026-02-08), so the launch snapshot
covers 1999–2025 in full. The 2026 season is **not** in scope for v1 — `games.csv` already
carries 272 unplayed 2026 rows with null scores, and every mart clips to 1999–2025.

---

## 7. Seeding

`seed/` is a small TypeScript program using the same Drizzle schema the app uses:

1. Read `data/marts/*.csv`.
2. Validate against the Drizzle schema (a type error here means ETL and app disagree — that is
   the point).
3. Apply the `DEAD_MONEY_TIER` filter (`SPEC.md` §7.5).
4. Truncate and insert inside a transaction. Seeding is **destructive and idempotent** — never
   an upsert-merge, so the database is always exactly the marts.
5. Emit a seed manifest: row counts per table, the ETL pin set, the snapshot date. The manifest
   is rendered in the page footer as a build stamp so any screenshot is traceable to a data
   version.

Structural assertions run post-seed and fail the deploy: 861 result rows, 861 EPA rows, 416 cap
rows, 288 Cap+ rows over exactly nine seasons, 370 dead-money rows (or the SAFE-only subset),
2,612 coaching rows over 830 team-seasons, zero dead-money rows with a null `asof_date`.

---

## 8. Environments

| Env | Host | Database | Data |
|---|---|---|---|
| **local** | `next dev` | Neon branch `dev` | full marts, seeded locally |
| **preview** | Vercel preview per PR | Neon branch per preview | seeded from committed marts |
| **prod** | Vercel production | Neon `main` | seeded on release |

Neon database branching gives each preview its own isolated copy at no meaningful cost. Marts
are committed to the repo (they are small, text, and reviewable in a diff) — which means a
preview deploy needs no ETL run and a data change shows up as a reviewable diff in the PR.

Secrets: `DATABASE_URL` (read-only for app, read-write for seed), `TEAM_LOGOS_ENABLED`,
`DEAD_MONEY_TIER`, `IMAGE_MIN_WIDTH_PX`. All are Vercel environment variables; none are baked
into the client bundle.

---

## 9. Analytics

**Vercel Analytics, free tier.** Page views and Web Vitals only. **No third-party analytics, no
cookies, no fingerprinting, no session recording, no user identifiers.** Consequence worth
stating: with no cookies and no personal data, v1 needs no consent banner, which is one fewer
thing between a reader and a chart.

---

## 10. Cost

**Spent to date: $0. Ceiling: $200.**

| Item | Cost | Status |
|---|---|---|
| Vercel Hobby | $0 | in use — see `RISKS.md` risk 7 on the non-commercial term |
| Neon free tier | $0 | in use |
| GitHub Actions | $0 | public repo |
| Wikimedia / nflverse data | $0 | open |
| **Domain** | **~$15/yr** | **pending — approval gate #2** |
| **Squadron Black licence** | **TBD** | **pending — approval gate #2, price from the design track** |

Nothing else is committed. Everything above the two pending items is free-tier and stays that
way for v1.

---

## 11. No accounts, no user data

**v1 has no authentication, no accounts, no user-generated content, no saved views, no
newsletter capture, no user data of any kind.** There is nothing to log in to and nothing to
breach. Every page is public and identical for every visitor.

This is a scope decision, not a deferral of one: the moment accounts exist, so do password
resets, GDPR obligations, a consent banner, and an abuse surface. None of that buys anything
for a product whose entire value is public charts.

---

## 12. Testing

**Golden tests — the load-bearing layer.** The 18 externally-verified facts in `DATA_AUDIT.md`
§3 are re-run **in CI against the built marts**, at their stated tolerances: exact for wins,
records, point differential, cap ceilings, draft position and snap counts; ±1% for money. They
currently return delta zero on every exact check and $0 on every money check. A drift of one
dollar fails the build.

Test 16b is retained as a **negative golden test**: Wilson's $85M Denver dead money must
continue to be absent from the nflverse route and present in the curated ledger. If it ever
appears in nflverse, that is a finding, not a fix, and it fails the build so a human looks.

**Structural tests** — the 11 in `DATA_AUDIT.md` §4, plus the mart-specific assertions in §7
above, plus:
- No chart series contains a synthesized point (`SPEC.md` §1.2).
- No dead-money value reaches a line-chart component.
- Neither `/team/det/2008` nor `/team/cle/2017` emits `Infinity` or `NaN` (`SPEC.md` §2.5).
- `car_av` is absent from the draft mart.
- Every Cap+ row carries a non-null `dm_asof`.
- Byte-stable ETL re-run (§4.3).

**Type-level tests.** `dead_money_total: null` in `team_season_cap` means any attempt to read a
dead-money number from the wrong mart is a compile error, not a runtime bug. Same for the
`Metric<T>` union — a component cannot render a value without handling the blank case.

**Unit tests** for the metric implementations: P composite (equal weights, within-season z,
ties as half a win), the Cap+ floor and calibration, the Stability Index weighting, the
Fitzgerald–Spielberger chart lookup, and the field-position transform (`150 − Cap+`).

**Accessibility** — automated axe checks on every route in CI, both themes.

**Visual regression** — deferred until after the design tokens land (`BUILD_PLAN.md` Phase 3).
Snapshotting a neutral placeholder theme would produce a wall of expected diffs on the day the
real theme arrives. Playwright screenshots are wired up in Phase 3 and become blocking in
Phase 5.
