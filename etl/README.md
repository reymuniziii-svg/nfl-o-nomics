# `etl/` — YIELD/YARD production ETL

Python 3.11, offline, idempotent, **byte-stable**. Reads nflverse releases
(remotely, via DuckDB `httpfs`) plus the curated CSVs in `data/curated/`, and
writes `data/marts/*.csv` — the entire contract surface between this package and
the TypeScript app (`SPEC.md` §7, `ARCHITECTURE.md` §4).

`audit/` is the frozen Phase-0 evidence record. It is **read, imported and copied
from, never written to**. Where this package copies audit logic rather than
importing it, the copy is marked as deliberate in the module docstring and the
pipeline cross-checks it against the original.

---

## Run

```bash
python -m etl.pipeline                    # everything, in dependency order
python -m etl.pipeline --mart capplus_official
python -m etl.pipeline --mart stability_index --mart draft_capital
python -m etl.pipeline --list             # marts, contracts, aliases
python -m etl.pipeline --check-stable     # build each mart twice and diff
python -m etl.pipeline --download         # fallback when httpfs can't follow
                                          # GitHub's signed release redirects
```

A full cold run is **~3.5 minutes**, almost all of it the **54** remote
play-by-play scans — the 27 seasons are read twice, once at six columns for
`team_season_epa` and once at 36 for `player_season_production`. The two are
deliberately not merged: widening the EPA scan to serve both would change the
projected column set `etl/pins.toml` records for a mart that is final and
re-emits byte-identically. `--mart` takes BUILD_PLAN aliases as well as mart
names: `stability_index`, `draft_capital`, `positional_allocation`, `capplus`,
`fs_chart`, `regimes`, `snapshot_resolution`, `player_cap`, `production`.

**`data/raw/` is empty at rest and the pipeline asserts it** (`DECISIONS.md` 7).
The pbp files carry 372 columns and we read six of them for EPA and 36 for
production; nothing needs to land on disk.
TLS verification stays on — `ARCHITECTURE.md` §4.1 says that is not
re-litigated.

Requires network access to `github.com` (nflverse releases),
`raw.githubusercontent.com` (nfldata) and `overthecap.com` (the draft chart
verification, which degrades to a warning rather than failing the build).

---

## Modules

| Module | Promoted from | Produces |
|---|---|---|
| `config.py` | new | runtime flags, source URLs, season windows, launch copy |
| `team_codes.py` | `audit/team_codes.py` + the two maps the audit kept local | **the one normalizer** |
| `io_utils.py` | new | the deterministic CSV writer, md5, structural assertions |
| `sources.py` | the audit's `duck_connect` pattern | DuckDB httpfs remote scans |
| `performance.py` | `audit_pbp.py` + `audit_schedules.py` | `team_season_results`, `team_season_epa` |
| `contracts.py` | `audit_contracts.py` | `team_season_cap`, `player_season_cap`, `position_allocation` |
| `deadmoney.py` | `build_deadmoney_curated.py` | `dead_money_team_season` (+`license_tier`), `dead_money_ledger`, `dead_money_snapshot_resolution`, `dead_money_display` |
| `capplus.py` | `capplus_backtest.py` §15 | `capplus_official`, `team_rating` |
| `coaching.py` | new, per `SPEC.md` §2.8 | `coaching_staff`, `team_season_stability`, `regime_events` |
| `draft.py` | `audit_support.py` | the F-S chart, `draft_pick`, `draft_class_summary` |
| `availability.py` | `audit_support.py` (snaps) | `player_season_availability` |
| `production.py` | new, per `SPEC.md` §3.3.6 | `player_season_production` |
| `images.py` | `audit_images.py` + the asset pipeline | `player_images` |
| `curated.py` | new | `league_cap` passthrough |
| `pins.py` | new | `etl/pins.toml`, derived from the manifest |
| `pipeline.py` | new | orchestrator + `manifest.json` |

---

## Mart inventory

Row counts are the shipping (`DEAD_MONEY_TIER=full`) build.

| Mart | Rows | Cols | Contract |
|---|---:|---:|---|
| `team_season_results` | 861 | 10 | SPEC §7.1 — grain `(season, team)`, 1999–2025 |
| `team_season_epa` | 861 | 9 | SPEC §7.2 — REG only, `play_type IN ('pass','run')` |
| `league_cap` | 32 | 5 | SPEC §7.11 — 1994–2025; **2010 NULL, uncapped** |
| `team_season_cap` | 416 | 14 | SPEC §7.3 — 2013–2025; dead-money columns **always null** |
| `player_season_cap` | 32,105 | 27 | SPEC §7.9 — player-season detail + marquee dead-money markers |
| `player_season_availability` | 28,190 | 10 | SPEC §7.9 — games + snaps, 2013–2025, REG only |
| `player_images` | 251 | 27 | SPEC §7.10 — licence, attribution, self-hosted rendition |
| `player_season_production` | 1,944 | 21 | SPEC §7.13 — REG production 1999–2025, the 251-player population |
| `position_allocation` | 3,744 | 7 | SPEC §7.12 / §2.6 — 13 × 32 × 9 groups |
| `dead_money_team_season` | 370 | 9 | SPEC §7.5 — dated snapshots + the derived `license_tier` |
| `dead_money_ledger` | 21 | 9 | SPEC §7.6 — verified individual charges |
| `dead_money_snapshot_resolution` | 13 | 18 | the pinned same-stage rule's choice, per season |
| `dead_money_display` | 316 | 21 | the RESOLVED view — one dated reading per team-season |
| `capplus_official` | 288 | 17 | SPEC §7.4 — nine seasons, gate #1 promotion |
| `team_rating` | 861 | 5 | SPEC §2.3 — **"Team Rating (performance only)"** |
| `coaching_staff` | 2,612 | 9 | SPEC §7.7 — **era-correct** codes + surrogate `coach_id` |
| `team_season_stability` | 830 | 17 | SPEC §2.8 — the Stability Index |
| `regime_events` | 214 | 20 | SPEC §7.7 — HC identity changes + dated `s+1`/`s+2` links |
| `draft_pick` | 6,644 | 18 | SPEC §7.8 — 2000–2025, **`car_av` excluded** |
| `draft_class_summary` | 830 | 17 | SPEC §7.8 — capital vs realized return per team-class |
| `capplus_candidates` | 861 | 69 | **verified, not rewritten** (see below) |

Plus `data/curated/fitzgerald_spielberger_chart.csv` (262 rows) — a new curated
file with a per-row `source_url`.

`draft_class_summary` is 830, not 832, because **Houston did not draft in 2000 or
2001**: 2 × 31 + 24 × 32 = 830. Same arithmetic as the 830 coaching team-seasons.

### `etl/pins.toml`

Generated on every full run by `etl/pins.py`, **derived from the manifest's own
`data_version` scheme** rather than hand-maintained: the release tag is parsed
from the URL the ETL actually read, the projected column set is the one the scan
requested, and the row count is what that scan returned. Nothing is typed twice,
so the pin file cannot drift from the pipeline.

`DECISIONS.md` 8 also asks for a **checksum** per asset and this file does not
carry one — a documented consequence of `DECISIONS.md` 7. Assets are read by
remote scan and `data/raw/` is empty at rest, so no file ever lands to hash.
What is pinned instead — named tag, exact projected columns, observed rows
consumed, and the 18 golden tests — is stronger for schema drift (`RISKS.md`
risk 6); the one uncovered case is a byte-level republish that changed nothing we
read. Closing it needs a `--download` verification pass and is recorded in
`etl/pins.py` as the open item rather than faked.

Observed consumption reconciles to `DATA_AUDIT.md` §2 exactly: games 6,967 REG ·
pbp 870,208 REG pass+run · contracts 41,976 deduped player-seasons · draft 6,644
picks · snaps 310,475 REG · players 9,338 `otc_id` crosswalk rows.

---

## The re-run / refresh model

**v1 data is a static snapshot** (`ARCHITECTURE.md` §6, `DECISIONS.md` 57). There
is no scheduled job, no webhook, no in-season update path. The reason is in the
data, not the engineering: contract figures are **season-final restatements**, so
no "as of week N" cap view is possible; and dead-money figures are **dated press
snapshots**, so a mid-season refresh would silently change the as-of date of
already-published numbers.

The cycle is: **re-run → review the mart diff → seed → deploy.**

1. `python -m etl.pipeline`. Every script overwrites its outputs in full.
2. `git diff data/marts/` is the review surface. Marts are committed to the repo
   precisely so a data change shows up as a reviewable diff in a PR and a preview
   deploy needs no ETL run.
3. **A non-empty diff on an unchanged input is a bug**, not a refresh.
4. Seed (`seed/`, `ARCHITECTURE.md` §7), which is destructive and idempotent.

Cadence: a manual re-run preseason, plus corrections. Corrections follow the
published policy in `METHODOLOGY.md` — fix the curated row, re-run, re-seed,
note it.

### Byte-stability

`ARCHITECTURE.md` §4.3 / `DECISIONS.md` 6. Deterministic sort order on every
output, `QUOTE_MINIMAL`, LF endings, UTF-8, trailing newline, fixed float
rounding applied *before* the write, no dict-iteration dependence, and **no
timestamps in any output file**.

Verified two ways:

* Two independent cold runs of the whole pipeline in separate processes produce
  **byte-identical output for all 20 marts, the curated chart, `pins.toml` and
  `manifest.json`.**
* `--check-stable` builds each mart twice inside one run and diffs the bytes.

`manifest.json` carries **no wall clock**. A build is identified by the data it
read — season windows, input row counts, the resolved dead-money snapshot dates
per season, the configured tier — under `data_version`. That is what makes the
golden tests in CI meaningful: a timestamp would make every run differ and the
diff would stop meaning anything.

### `capplus_candidates` is verified, not rewritten

`DECISIONS.md` 54: the app never reads it; it is a 69-column backtest artefact
carrying rejected alternates. Re-emitting it would risk regressing the evidence
record for no product gain. Instead the pipeline recomputes the recommended
columns from scratch and asserts they still reproduce the committed file
(`capplus_rec` to 5e-7, which is the 6-decimal write rounding). Its md5 is
recorded in the manifest under `verified_not_rewritten`.

---

## Runtime flags — `BUILD_PLAN.md` GATE #3

Rey ruled 2026-07-25 to proceed on all three instances. `DECISIONS.md` 63
requires each to stay **a one-line reversal** for as long as licensing is open,
so all three read from the environment first and fall back to the shipping
default. None of them is duplicated inside a mart module.

| Flag | Default | Reversal |
|---|---|---|
| `DEAD_MONEY_TIER` | `full` — every curated row including the REVIEW tier | `safe` |
| `IMAGE_MIN_WIDTH_PX` | `300` — 93.6% coverage / 6.4% designed-card fallback | any integer |
| `TEAMMARK_KILLSWITCH` | `false` — logos render | `true` → typographic fallback chip everywhere |
| `IMAGE_TREATMENT_MODE` | `css_filter_only` — ShareAlike option (a) | `baked` (option (c)) |

`DEAD_MONEY_TIER` accepts the `SPEC.md` §7.5 spelling too (`ALL` / `SAFE_ONLY`)
so ETL and the seed program cannot disagree.

**The `safe` reversal, exercised and measured** (matches `DATA_AUDIT.md` §5 and
`RISKS.md` risk 1 exactly):

```
DEAD_MONEY_TIER=safe
  dead_money_team_season   370 -> 114 rows
  full-32 seasons            9 -> 2   (2014, 2015 only)
  capplus_official         288 -> 64  rows
  dead_money_display       316 -> 114 rows (full32 288 -> 64)
  team_rating              861 rows, UNCHANGED (performance-only, no cap term)
```

2017, 2024 and 2025 lose their league-wide table entirely. Cap+ ships on two
seasons, one of them (2014) near content-free. This is the contingency working,
not a regression — so the memo sniff checks and the 288-row assertion run on the
full tier only, and the tier-independent invariants (32 teams per covered season,
mean 100, pooled SD 15, 8 floored) run always.

---

## Two rules worth reading before touching this code

### 1. The team-code normalizer

Four conventions are live and `etl/team_codes.py` is the only place any of them
is resolved. The full table is in that module's docstring. The one that bites:
**`normalize_team` alone leaves 8 draft codes wrong** (`GNB`, `KAN`, `LVR`,
`NOR`, `NWE`, `SDG`, `SFO`, `TAM`), so draft data goes through
`normalize_draft_team` / `normalize_draft_series`, which runs
`PFR_DRAFT_TEAM_MAP` in front. `etl/draft.py` asserts that exactly those 8 codes
would have been wrong — the trap is tested, not trusted.

### 2. The same-stage dead-money snapshot rule — PINNED

`CAPPLUS_MEMO.md` §7 condition 3 requires all 32 teams in a season to be read
from **one** dated snapshot. What the memo does not pin is the tie-break, and the
tie is real: `dead_money_team_season.csv` carries **two 2018 snapshots that are
both `full32` and both tagged `preseason`** — 2018-03-01 ($155.2M league-wide)
and 2018-07-14 ($348.5M), 2.25× apart. `asof_stage` cannot break that tie, so
resolving on stage alone is non-deterministic.

**The pinned rule, per season, in this order:**

1. Filter to the **broadest coverage class present**, ranked `full32` >
   `partial` > `top5`. Only `full32` is a league-wide reading; a season whose
   best class is anything else does **not** resolve and blanks whole-season
   (`DECISIONS.md` 16) — standardising a season in which only the five worst
   offenders are observed would rate 2013 Oakland as average.
2. Among those, take the **latest `asof_date`**. A table published after the
   league year has opened is the more complete accounting (`DECISIONS.md` 15).
3. **Record the chosen `asof_date` + `asof_stage` per season** in
   `dead_money_snapshot_resolution` — the choice is data the tests assert
   against, not behaviour buried in a function.

Verified outcomes, asserted by `deadmoney.assert_pinned_resolution`:

| Season | Resolves to | Stage | Badge | full32 candidates |
|---|---|---|---|---:|
| 2014 | 2014-02-18 | preseason | **provisional** | 1 |
| 2015 | 2015-10-28 | midseason | in_season | 1 |
| 2017 | 2017-07-05 | preseason | preseason | 1 |
| **2018** | **2018-07-14** | preseason | preseason | **2** |
| **2019** | **2019-03-10** | preseason | **provisional** | 1 |
| 2022 | 2022-07-05 | preseason | preseason | 1 |
| 2023 | 2023-07-14 | preseason | preseason | 1 |
| 2024 | 2024-11-27 | late_season | in_season | 1 |
| 2025 | 2025-12-17 | late_season | in_season | 1 |
| 2013 · 2016 · 2020 · 2021 | **unresolved** | — | — | 0 |

2018 and 2019 are resolved under the **same** rule, not opposite date rules.
2018 has two full-32 candidates and the later wins at step 2. 2019 has exactly
one full-32 candidate — the 2019-05-16 Forbes rows are `partial` (14 teams) and
lose at **step 1**, not step 2. Under this rule exactly two seasons end up as
pre-league-year tables, which is precisely how the memo badges them
`provisional`.

`etl/deadmoney.resolve_same_stage` is a deliberate copy of
`audit/capplus_backtest.resolve_dead_money_same_stage` minus its hard
nine-season assertion, so the `safe` reversal can run. `etl/capplus.py`
cross-checks the copy against the frozen audit original on every full-tier run —
values, dates and row alignment — so it cannot drift from the evidence record.

---

## What the pipeline asserts (build fails on any of these)

Golden facts, re-run against the built marts at `DATA_AUDIT.md` §3 tolerances:

* 2007 NE 16-0-0, 2008 DET 0-16-0, 2017 CLE 0-16-0 — exact.
* Mahomes KC 2023 `$37,133,824` and Wilson SEA 2013 `$681,085` — **delta $0**.
* Tom Brady 2000: round 6, pick 199, raw code `NWE` → `NE` — exact.
* The ten `CAPPLUS_MEMO.md` §3.1 sniff values, to ±0.05 index points **and exact
  rank**, including 2023 SF 133.9 #1, 2022 CHI 77.2 #31, 2024 DEN 104.4 #13.

Structural:

* 861 / 861 / 416 / 288 / 830 / 370 / 21 / 316 / 2,612 / 6,644 / 251 row counts.
* 31 teams in 1999–2001, 32 from 2002; record arithmetic closes; league points
  balance every season; **2022 BUF and CIN played 16 games**, asserted by name.
* `team_season_cap.dead_money_total` and `dead_money_pct` are **all-null**.
* `car_av` is **absent** from `draft_pick`.
* Every `capplus_official` row carries a non-null `dm_asof_date` and stage.
* `mean(R_rec)` is exactly 1.000 per season; 8 of 32 floored per season; season
  mean exactly 100; pooled within-season SD exactly 15; `P` has within-season
  mean 0 and SD 1.
* 2013/2016/2020/2021 have **zero rows** in `capplus_official`; every blank
  `dead_money_display` row carries the approved sentence verbatim; every row
  carrying a reading declares a `license_tier`.
* `license_tier` counts are exactly 69 / 45 / 64 / 192, and an unmapped
  `source_url` **raises** — a new curated row must declare its tier rather than
  default into the shippable half.
* 830 coaching team-seasons; every one has ≥1 HC, OC and DC; zero `HC = NONE`;
  436 distinct `coach_name` values (435 people + the sentinel).
* Position-group shares sum to exactly 1.000 per team-season and per season.
* `dead_money_display` is the RESOLVED view: every row matches a real dated
  source reading on `(season, team, asof_date)` — never an average or a merge —
  and its key set is exactly the source's, so no team-season is invented or
  dropped. `season_coverage = 'leaders_only'` marks exactly the four blank
  seasons (2013: 5, 2016: 8, 2020: 5, 2021: 10 published leaders).
* `player_season_availability` reproduces golden test 18 from the mart: Laken
  Tomlinson 2023 NYJ, **1,101 REG offensive snaps over 17 games, `off_pct`
  1.000** (a 0-1 fraction). The 2012 snap asset is asserted still empty rather
  than the 2013 boundary being trusted.
* `player_season_production` bridges **251/251** of the audited population from
  `otc_id` to `gsis_id` (all 251 from `player_season_cap`'s resolved pairs; the
  `players.parquet` crosswalk is the fallback and did not need to fire) and
  fails the build on anything less — a partial bridge would ship a player page
  whose production line is silently empty. Three goldens re-score from the mart
  at **exact** tolerance: Mahomes 2023 4,183 passing yards on 401/597, Watt 2021
  **22.5** sacks, Jefferson 2022 1,809 receiving yards on 128/184. League-wide
  attribution floors hold: sacks 99.17%, interceptions 100.00%, scrimmage plays
  99.9998%. **No assertion is ever written on tackles** — the pbp route gives
  Watt 58 against the official 64, which is what `tackles_basis = 'pbp'`
  discloses.
* `player_images` reproduces both published coverage numbers: 244/251 = 97.2%
  Commons coverage and 235/251 = 93.6% rendered at `IMAGE_MIN_WIDTH_PX = 300`
  (6.4% designed-card fallback = 7 no photo + 9 below floor). The licence block
  is complete for all 244 usable assets and null only where there is no photo;
  `license_url` is genuinely null for the public-domain files. Any non-zero
  `api_error` in the asset manifest fails the build as a re-run signal.
* `data/raw/` is empty.

---

## Known documentation discrepancy

`SPEC.md` §2.6 and `audit/findings_contracts.md` print the 2023 league-wide WR
cap share as **12.3%**. The computed value is **12.232%**, which rounds to 12.2%.
The audit's own staged output (`data/curated/staging/contracts_position_alloc.csv`)
gives 12.23% under every aggregation method, so this is prose rounding in the
findings file, not a data defect — `position_allocation` reproduces the audit
figure exactly. Every other face-validity share matches to the printed decimal.
