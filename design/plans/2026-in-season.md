<!-- design/plans/2026-in-season.md — produced by an Opus planning agent on 2026-10-11 from the repo at
commit 4e9a01f. Owner rulings recorded in DECISIONS.md when the build starts. -->

# YIELD/YARD: plan for the 2026 in-season layer

## 0. Findings that shape the plan

1. **The repo forbids part of this today.** SPEC §2.1 says no "as of week N" cap view may be built. DECISIONS 57 says in-season updates are v2. METHODOLOGY.md lines 212 and 248–249 tell readers that 2026 is excluded until it is complete. Shipping any live money figure needs a written amendment first. A live layer that carries only performance needs no cap figure at all, so it can ship under a narrower amendment. That makes it the right minimum (§6).
2. **"Week 6" is not honest yet.** The season opened Thursday 2026-09-10, so today, Sunday 10-11, is the Sunday of week 5. The last week where every game is finished is week 4. The first Tuesday run that can honestly say "2026 · week 6" is **Tue 2026-10-20**, after Monday night of week 6. The run on 10-13 will say "week 5".
3. **The existing pins already point at files that change.** `etl/pins.py` records tag `"pbp"`, but nflverse release tags are named per dataset and the assets inside them are overwritten. `games.csv` is read from nfldata `master`. A 2026 pbp file that changes weekly makes this gap matter. The live design closes it with content hashes and commit SHAs (§3).
4. **`web/lib/data/seasons.ts` takes its defaults from `max(team_season_results.season)`.** That covers `latestSeason()`, `allTeamSeasons()` and `latestSeasonByTeam()`. They drive the home season, the `/team/{abbr}` 301 target, the scrub frames in `division-view.tsx` (`frameSeasons = 2013..season`) and the entry cards. Adding 2026 rows to that mart would silently move every default onto a partial season.

---

## 1. What a 2026 live team-season row means at week N

### 1.1 The as-of definition

`asof_week` = the last **closed** regular-season week. Week W is closed only when, for every REG game with week ≤ W (minus a curated `LIVE_CANCELLED_GAMES` list, for cases like 2022 BUF–CIN):

- `games.csv` (read at a pinned commit) has both scores;
- the game's `game_id` is in the 2026 pbp file;
- the pbp final score (`home_score`/`away_score`) matches the schedule;
- the game has at least `LIVE_MIN_SCRIM_PLAYS` (about 80) pass and run plays.

`asof_date` is the latest `gameday` in that week, which is a data date and not a run time. **Every input is filtered to `week <= asof_week`.** A Wednesday or Thursday retry can already see the Thursday game of week N+1, and without the filter half a week would leak in.

### 1.2 Inputs that exist at week N

| Input | Source | State at week N |
|---|---|---|
| W/L/T, PF/PA, win_pct (ties count half), point diff per game | `games.csv` at a pinned SHA | Complete through week N |
| Raw and opponent-adjusted EPA margin (REG, `play_type IN ('pass','run')`) | `play_by_play_2026.parquet` at a pinned sha256 | Complete through week N |
| Cap held by rostered players, 2026 | `historical_contracts.parquet`, a single dated snapshot | **An in-season reading, not season-final.** It is frozen once (§1.4), never refreshed weekly |
| Scheduled cash, 2026 | Same snapshot (`cash_paid`) | Full-year scheduled cash. Cash paid to date is **not derivable** |
| 2026 league cap | A new curated row with `source_url` | A constant |
| Dead money, 2026 | None from nflverse. Only a curated press table, if a full-32 one exists | A preseason snapshot, an estimate, or nothing |

Teams on bye simply have `games_played = asof_week − 1`. All rates are per game or per play, so a bye is a complete reading over fewer games, not a blank.

### 1.3 Live Team Rating and live Cap+

- **`P_live`** uses the same equal-weight z-blend as the final build (`bt.build_performance`, SPEC §2.4), computed within the 32-team 2026 frame over games through week N.
- **`perf_index_live`** = 100 + 15·P_live. It is labelled "Team Rating (performance only) · live". It needs no money, so it ships first.
- **`capplus_live`** = (100 + 15·P_live) ÷ R_live, where:
  - cost_live = (cap snapshot + 2026 dead-money table) ÷ the 2026 league cap;
  - the cost floor is the 2026 25th percentile, and the mean of R is 1 after the floor;
  - the value is demeaned within 2026 and divided by the **frozen measured-season SD `sd_meas = 14.611541`**. That number is in `manifest.json` under `checks.capplus.pooled_sd_measured_raw`. It can be recomputed offline as the pooled within-season SD of `perf_index / R_rec` from `capplus_official.csv`, and the live build asserts the two agree.
  - This follows the same rule DECISIONS 113 applies to estimated seasons: a point means the same thing everywhere, and the live season never moves the scale.
- **Comparable within 2026 only.** Every row shares one as-of week and one money snapshot. Because R is frozen for the whole season, week-to-week changes in live Cap+ come from performance alone, which is worth saying on the methodology page.
- **The `in_season_live` badge** is new and separate from the existing `in_season` (a dated dead-money snapshot taken in-season, assigned in `deadmoney.resolve_same_stage`). Its `badge_reason` reads, for example:
  > "Live: through week 9 (2026-11-09), 8 of 17 games. Cap as of the 2026-10-06 contracts snapshot, not season-final. Dead money from the 2026-07-xx table (preseason)."

  It is a different type from `CapPlusBadge`, so the historical mart cannot carry it (§5).
- **In `Metric<T>`, a live value is `state: 'partial'`** with `covered = games_played` and `total = games_scheduled` (17). It is drawn with the existing 45° hatch (CHART_ANATOMY §5.2) and labelled `⟨8/17⟩`. The partial variant gains optional `badge`, `badgeReason` and `live` fields:

```ts
export type LiveBadge = 'in_season_live';
export interface LiveAsOf { season: number; week: number; date: string; gamesPlayed: number; gamesScheduled: number }
// partial variant gains: badge?: LiveBadge; badgeReason?: string; live?: LiveAsOf
```

### 1.4 The money side is one frozen snapshot

The money side is pinned once by a manual `python -m etl.live freeze-money`. It records the contracts asset's `updated_at`, size and sha256 and writes `data/marts/live/live_team_money.csv`. The weekly job never reads contracts.

This keeps to the "one snapshot per season" rule and the DECISIONS 57 worry that a refresh changes the as-of date of numbers already published. It also has a stated limit: OTC probably assigns a traded player's full 2026 year to his new team, and any trade after the snapshot is not reflected. Whether to re-pin once after the trade deadline is an owner decision (§6).

---

## 2. Mart design

### 2.1 Recommendation: a parallel `live_*` set

Put the live marts in `data/marts/live/`, with their own registry, manifest and contract tests. Do not join them to the 861/416-row marts.

Why:

1. **861 and 416 are promises.** They appear in the two-tier promise (SPEC §1.1), the URL count (§6), `EXPECTED_ROWS`, the seed's `expected:` values, `test_structural.py` (`SEASON_MAX = 2025`, `N_TEAM_SEASONS`), every `Mart(rows=…, seasons=(…, 2025))` in `test_contracts.py`, and the seed assertions. Joining would change all of them, and every row would now mean "possibly partial".
2. **Every `max(season)` default flips silently** (finding 4).
3. **Cap+ calibration would be contaminated.** A 2026 row inside `capplus.build` enters `bt.calibrate` and `pooled_within_season_sd`, which would move every published Cap+ value.
4. **Byte-stability of history.** Weekly churn in the frozen files would regenerate `manifest.json` and `pins.toml`. `pipeline.run` writes `pins.toml` on a full run and merges `data_version` on a partial one, so the history diff would never be quiet.
5. **Separate Drizzle tables are a physical guarantee.** An all-time query cannot select live rows by accident.
6. **Promotion stays an explicit act.** At the next preseason refresh, with a final 2026 dead-money table, 2026 joins the frozen marts (893/448) in a reviewed PR and the live directory resets.

The cost is small: about 32 rows per mart, a union in `generateStaticParams`, and a UI branch.

### 2.2 The marts (all `season = 2026`, no wall-clock anywhere)

**`live_status`** — 1 row:
- `season`, `asof_week`, `asof_date`, `weeks_in_season` (18), `games_scheduled_per_team` (17), `league_games_played`
- `pbp_sha256`, `pbp_asset_updated_at`, `games_commit_sha`, `money_asof_date`, `contracts_sha256`
- `dm_asof_date` and `dm_asof_stage` (nullable for the whole season), `dm_basis` ∈ {`full32`, `estimated`, `none`}
- `perf_state` ∈ {`value`, `blank`} and `perf_blank_reason`
- `capplus_state` ∈ {`value`, `blank`} and `capplus_blank_reason`

Whole-season blank sentences live here once, the same pattern as `dead_money_snapshot_resolution`.

**`live_team_perf`** — 32 rows, grain (season, team):
- `asof_week`, `games_played`, `games_scheduled`, `bye_week`, `bye_taken`
- `wins`, `losses`, `ties`, `win_pct`, `points_for`, `points_against`, `point_diff`, `point_diff_per_game`
- `off_plays`, `def_plays`, `off_epa_per_play`, `def_epa_per_play`, `epa_margin_per_play`, the three `*_adj` columns, `sos_epa`
- `P_live`, `perf_index_live`, `perf_rank_live`, `badge` (= `in_season_live`), `badge_reason`

**`live_team_money`** — 32 rows, written only by `freeze-money`:
- `money_asof_date`, `n_players`, `cap_used_snapshot`, `league_cap_2026`, `cap_pct_of_league`, `team_adjusted_cap_implied`, `unaccounted_vs_adjusted`, `cash_scheduled_2026`
- `dead_money_usd` (nullable whole-season), `dm_asof_date`, `dm_asof_stage`, `dm_source_url`, `dm_license_tier`, `dm_is_modeled`, `dm_lo_usd`, `dm_hi_usd`

**`live_capplus`** — 32 rows, or **0 rows** when gated off (the reason is in `live_status`):
- `capplus_live`, `cost_live`, `cap_consumed_live`, `cost_floor_live`, `R_live`, `was_floored`, `capplus_rank_live`, `asof_week`, `games_played`, `badge`, `badge_reason`

**Later (optional): `live_team_week`** — 32 × N rows. Each week is recomputed from the current pin, so it is a pure function with no state carried between runs. It enables a static "▲3 since wk 5" and a trajectory.

### 2.3 How blanks render

- **No per-team blanks in performance.** The closed-week rule means no team ever has a half-played week.
- **Bye:** "5 GP · bye wk 6", shown as a value.
- **Before `LIVE_PERF_MIN_WEEK` (4):** whole-season blank. Opponent adjustment needs a connected schedule graph, and the build asserts connectivity.
- **Live Cap+ blank:** the off-field group on the Field, headed `NOT COVERED — {capplus_blank_reason}`.
- **Live team-page blocks that do not exist** (coaching, draft ROI, QB context, mortgage, allocation): a new `BLANK_REASON.LIVE_SEASON`, "Not available while 2026 is in progress — this block publishes when the season is final."

### 2.4 ETL structure

New package `etl/live/`:

| File | What it holds |
|---|---|
| `config.py` | `LIVE_SEASON = 2026`, `LIVE_PERF_MIN_WEEK = 4`, `LIVE_CAPPLUS_MIN_WEEK = 9` (owner decision), `LIVE_CANCELLED_GAMES`, `LIVE_ADJ_MAX_SHIFT`, `LIVE_ADJ_MIN_CORR`, `LIVE_MARTS_DIR`, `EXPECTED_ROWS_LIVE` |
| `resolve.py` | GitHub API metadata, `closed_week()`, writes `etl/live/live_pins.toml` |
| `perf.py` | Live results, EPA and P |
| `money.py` | `freeze-money` |
| `capplus_live.py` | The live Cap+ build |
| `pipeline.py` | Its own `LIVE_MARTS` registry; `--check-stable`; writes `data/marts/live/manifest.json` |

It reuses `pipeline.Context` and `io_utils`. It never calls `etl.pipeline.run` and never writes outside `data/marts/live/`.

**Refactor `etl/performance.py` without changing output:**
- `_season_epa`, `_season_games` and `_opponent_adjust` take `max_week` and `expected_games: dict[team, int]` instead of the hard-coded 16/17 check at line 356.
- The live thresholds are parameters. `ADJ_MAX_SHIFT = 0.08` and `ADJ_MIN_CORR = 0.9` will fail at weeks 4–6 by design.
- Keep `ADJ_RIDGE_PLAYS = 0` so that live week-18 P equals the eventual final P, which becomes a test at promotion.
- **Proof of no change:** the full `python -m etl.pipeline --check-stable` must leave the committed historical marts byte-identical after the refactor.

---

## 3. Weekly refresh: `.github/workflows/live-refresh.yml`

```yaml
on:
  schedule: [{cron: '0 15 * * 2'}, {cron: '0 15 * * 3'}, {cron: '0 15 * * 4'}]  # Tue + Wed/Thu retries; 11 EDT / 10 EST
  workflow_dispatch: {inputs: {dry_run: {type: boolean, default: true}}}
permissions: {contents: write, issues: write}
concurrency: {group: live-refresh, cancel-in-progress: false}
```

### 3.1 Steps

1. **Resolve.** `python -m etl.live resolve` does three things:
   - Fetches `GET /repos/nflverse/nflverse-data/releases/tags/pbp` and finds the `play_by_play_2026.parquet` asset: `updated_at`, `size`, and `digest` if GitHub returns one.
   - Fetches `GET /repos/nflverse/nfldata/commits?path=data/games.csv&per_page=1` to get a commit SHA. `games.csv` is then read from `raw.githubusercontent.com/nflverse/nfldata/{sha}/data/games.csv`, which never changes.
   - Downloads the pbp file once to a temporary path and computes its sha256. The same downloaded file is reused for both stability passes. `data/raw/` stays empty at rest and `assert_raw_empty` still runs.
   - Computes `asof_week` and writes the proposed `live_pins.toml`.
2. **No-op exit.** If `asof_week` and every hash equal the committed `live_pins.toml`, exit 0. Nothing is committed and the site keeps the previous week.
3. **Build.** `python -m etl.live build --check-stable` reads only through the pins. If an asset's hash at read time differs from the pin, the job fails.
4. **History guard.** `git diff --exit-code -- data/marts/*.csv data/marts/manifest.json etl/pins.toml data/curated`. The live job must never touch the history.
5. **Tests.** `pytest tests/ -v`, the whole suite plus the live tests.
6. **Commit** `data/marts/live/*` and `etl/live/live_pins.toml` together, with a message like `live: 2026 through week 6 (2026-10-19) [pbp sha256:abcd…, games @1a2b…]`. A changed hash with an unchanged `asof_week` gets `live: restate week N`, because nflverse does reprocess earlier weeks.
7. **Push.** Pushes made with `GITHUB_TOKEN` do not trigger `ci.yml`, which is acceptable because step 5 already ran the suite. Vercel's Git integration rebuilds.
   - **Check first:** Vercel Hobby may block deploys of commits by an author who is not a project member, such as `github-actions[bot]`. If it does, commit under the owner's Git identity, or keep the push and call a Vercel Deploy Hook stored as a secret.
   - If `main` is protected, open a PR with auto-merge instead.

### 3.2 How the "never latest" rule survives an asset that keeps changing

The URL is not the pin. The pin is:
- the content hash for pbp;
- the immutable commit SHA for schedules;
- the weekly commit of `live_pins.toml`, which is the explicit "pin bump" commit that runs the tests (ARCHITECTURE §4.4, automated).

This is stronger than the historical pins, which name a tag that gets overwritten.

### 3.3 What byte-stability means for a mart that changes weekly

The mart's bytes must be a pure function of `live_pins.toml`. Concretely:
- two builds in one run give identical bytes;
- the same pins in a later run give zero diff, which is the no-op path;
- the frozen historical marts give zero diff on every run.

There is no accumulated state: each week's mart is rebuilt entirely from the current pins.

### 3.4 Failure modes (none of them blank the site)

| Failure | Result |
|---|---|
| nflverse pbp is late, or a week is half-loaded | `asof_week` stays at N−1, nothing is committed, the previous week stays live |
| A game is postponed | The week stays open until it is played or added to `LIVE_CANCELLED_GAMES` |
| Schema drift (projected column missing) | Scan raises, job red, no commit |
| Tests fail | No commit |
| Vercel build fails | The previous production deployment stays up (Vercel deploys atomically) |
| Data is stale | When the calendar says week N closed more than 48h ago but `asof_week < N`, the job opens or updates a GitHub issue "live data stale". The page always prints `asof_date`, never relative time like "3 days ago", which would go stale on a static page |

---

## 4. Surfaces

All colour rules hold:
- **One lime element** per chart: the selected club.
- **Gold only for the benchmark:** 100 = 2026 league average, which is valid by construction.
- **The LIVE chip is neither gold nor lime.** Add a token `--yy-live` (aliasing `--yy-fg-2`, extend-never-rename) with a 1px currentColor @40% border, and draw marks with the `--yy-partial` hatch. Gold already means "provisional" in the chip register (CHART_ANATOMY §5.3), so a gold LIVE chip would put a second gold meaning on a chart that already has the gold 100 line.

**Home** (`app/_shared/division-view.tsx`, `lib/data/home.ts`):
- A segmented control `2025 FINAL | 2026 · WK 6 LIVE` on the hero and the Field, using the `?season=` link state in `LeagueLinkProvider`. It is not another stop on `SeasonScrubber`: live is a different kind of reading, not the next season.
- Switching cross-fades. Marks never travel between a final and a live frame (CHART_ANATOMY §6.1 spirit). Nothing animates between weekly deploys.
- `/` keeps landing on 2025, which SPEC §3.1 requires ("most recent season with complete data").
- In live mode:
  - **Hero:** division live strip (record, GP, Team Rating live). The per-win price follows owner decision 3.
  - **Field:** live Cap+ positions when gated on; otherwise all 32 clubs sit in the off-field group with the reason. The Review "QB-neutral" mode is disabled with a reason.
  - **Frontier:** hidden with the reason "compares a full season's wins to a full season's cash; returns when 2026 is final".

**Team page:**
- `/team/{abbr}/2026` is 32 new static pages (plus 32 OG images and 32 share pages: 2,867 → about 2,963 units). `generateStaticParams` unions `live_team_perf` keys.
- It renders a **slim live variant**: verdict line without a verdict, live Team Rating or Cap+, record, the lens trio labelled "Cap hit · as of {money date} (not season-final)" and "Cash scheduled for 2026 (full season)", and the dead-money table with its date and stage.
- A coverage strip lists what is withheld.
- **On the arc**, the 2026 point is a separate, hatched, **unconnected** mark after a dashed `IN PROGRESS` gap. No `<path>` joins 2025 to 2026.
- The same URL becomes the final page after promotion, so URLs stay permanent.
- `/team/{abbr}` keeps redirecting to 2025. The 2025 page links to "2026 · week N live".

**Leaderboard:** 32 live rows (Rank, Club, Record, GP, Team Rating live, Cap+ live when gated on, adjusted EPA margin), sortable within 2026. The CSV header comment carries the source marts, `asof_week`/`asof_date`, `money_asof_date`, `dm_asof_date` and the pin hashes (SPEC §8.1).

**Share cards and OG** (`app/share/_og/data.ts`, `cards.tsx`, `opengraph-image.tsx`): a mandatory line `2026 · AS OF WEEK 6 · THROUGH 2026-10-19` in the stamp slot, and **no verdict stamp**. Live page metadata uses a versioned OG URL (`?wk=6`) so social feeds do not keep showing an old week. A cached card still prints its own as-of line.

**Footer stamp:** add live as-of week, pbp short hash and money date.

**Explicitly not shown:**
- No `ReceiptVerdict` (STEAL … MONEY PIT) on any live surface. `getReceiptVerdict` returns blank for live.
- No live rows in compare pickers, the frontier's fixed domain, scrub frames, `getSparkSeries`, `getFranchiseSeasonFacts`, `getIndexDelta5y`/`getIndexDeltaPrior`, `capplusBlankSeasons`, or any all-time or multi-season ordering.
- No cash-to-date, no QB-neutral, mortgage or stratum figures, no allocation, no live dead-money modelling without an anchor.

---

## 5. Test plan

**`tests/test_live_contracts.py`** reuses the `Mart`/`Col` dataclasses with a `LIVE_REGISTRY` of 32 rows (`live_status`: 1; `live_capplus`: 32 or 0) and `seasons=(2026, 2026)`. It asserts:
- `badge` ∈ {`in_season_live`};
- one `asof_week` across every live mart, matching `live_status` and `live_pins.toml`;
- `games_played ∈ {asof_week−1, asof_week}`, adjusted for cancelled games;
- W+L+T = GP; league ΣPF = ΣPA; league wins = losses;
- P_live has mean 0 and SD 1 within 2026;
- `capplus_live` has mean exactly 100, and the SD read from the manifest equals the SD recomputed from `capplus_official.csv`;
- 0 Cap+ rows ⟺ `capplus_state = 'blank'` with a non-empty reason; rows ⟹ `asof_week ≥ LIVE_CAPPLUS_MIN_WEEK` and `dm_asof_date` is non-null.

If `LIVE_SEASON` is set and the live directory is missing, the test **fails**; it does not skip.

**`tests/test_live_isolation.py`** asserts:
- The frozen marts top out at 2025, `EXPECTED_ROWS` is unchanged, and `manifest.json`/`pins.toml` name no live asset.
- `conftest.DATA_DIRS` and `lib/paths.ts SEARCH_DIRS` exclude `data/marts/live`.
- `capplus_official.badge` never contains `in_season_live`.
- A source scan of `web/lib/data/*.ts` and `web/app/**`: only an allowlist (`lib/data/live.ts`, the live page and share variants) may reference `s.live*` tables. `seasons.ts`, `league.ts` (frames, spark, deltas), `compare.ts` and `metrics.ts` may not.
- A TypeScript brand `FinalSeason`, accepted by the all-time accessors, so mixing seasons is a type error at `npm run typecheck`.
- Post-seed asserts in `db/seed.ts`: `max(team_season_results.season) = 2025`, history still 861/416, live tables 32/0/1.

**Fixture smoke tests** (`tests/fixtures/live/`): a tiny `games.csv` plus a small pbp parquet. They check:
- `closed_week()` with a half-loaded week, a bye, a postponed game, and pbp lagging the schedule;
- that the week N+1 Thursday game is filtered out;
- two builds give identical bytes;
- unchanged pins produce a no-op.

**Workflow smoke:** run `workflow_dispatch` with `dry_run: true` once before enabling cron (it prints the diff and pushes nothing). `web/scripts/verify.py` adds three checks: no verdict label on `/team/*/2026` or the share pages; the as-of line is present; the compare picker has no 2026.

---

## 6. Cut list in build order

| # | Item | Effort |
|---|---|---|
| 1 | DECISIONS 115 (live layer; partly supersedes 57); amendments to SPEC §1.1, §1.2, §6 and new §7.14; METHODOLOGY copy for the **performance-only** live layer | S |
| 2 | Refactor `etl/performance.py` (parameterised weeks, games and thresholds) with proof that historical marts stay byte-identical | M |
| 3 | `etl/live/` resolve, closed-week, `live_pins.toml`, `live_status`, `live_team_perf`, live pipeline and manifest | L |
| 4 | Live contract, isolation and fixture tests | M |
| 5 | `db/schema.ts` live tables, seed, `lib/metric.ts` (`LiveBadge`, partial extension, `BLANK_REASON.LIVE_*`), `lib/data/live.ts` | M |
| 6 | Home toggle: live leaderboard (Team Rating live), live division strip on the hero, Field off-field reason, frontier withheld, CSV header | M |
| 7 | `live-refresh.yml`: dry run, then cron; staleness issue; Vercel author check | M |
| **MVP** | **Ships at 1–7. First honest "2026 · week 6" on Tue 2026-10-20** | |
| 8 | `/team/{abbr}/2026` slim page, arc mark, `generateStaticParams` union | M |
| 9 | Share and OG as-of line, verdict suppression, versioned OG URL | S |
| 10 | SPEC §2.1 amendment; `freeze-money`; 2026 league-cap curated row; `live_team_money`; lens trio | M |
| 11 | 2026 dead-money input in `data/curated/live/` (kept out of `dead_money_team_season.csv`, whose 402 rows and tier counts are asserted) | S engineering + M curation |
| 12 | `live_capplus` with gating; Field positions; leaderboard Cap+ live column | M |
| 13 | `live_team_week` history and static week deltas | M (optional) |
| 14 | Season-end runbook: hold at week 18, playoff note, promotion PR into the frozen marts, test that live week-18 P equals final P, reset the live directory | S |

### Owner decisions

1. **Does live Cap+ render before week 9?** I recommend no. Ship live Team Rating from week 4. Gate live Cap+ at week 9, which falls about at the early-November trade deadline. Optionally re-pin money once, post-deadline, as a dated and announced change.
2. **How to treat a 2026 dead-money snapshot.** Options:
   - (a) A curated, dated full-32 2026 table, so live Cap+ discloses a preseason dead-money basis. **Recommended if one exists.** The note on the Tua row in `dead_money_ledger.csv` cites a "PFR Jul 2026" source; check whether it is a 32-team table.
   - (b) The estimator's prior-season-neighbour pattern, anchored on a dated top-k list, badged `estimated` with ranges.
   - (c) None: live Cap+ stays blank all season.

   Never treat a missing table as zero dead money. Do not switch tables mid-season.
3. **Cash to date or full-season cash?** I recommend full-season scheduled cash, labelled as such and never divided by wins to date. Cash to date would mean modelling payment timing that OTC's annual `cash_paid` does not contain. For the live hero's per-win price, choose between:
   - pro-rated cap per win: cap × GP/17 ÷ wins, labelled "pro-rated", with the zero-win rule applying to the 0-win clubs; or
   - no ratio until the season is final.
4. **Minor:**
   - Should `/` default to live during the season? (SPEC §3.1 says no today.)
   - Should the bot push straight to `main` or open an auto-merged PR?

### Where a naive build would silently show partial data

1. 2026 rows added to `team_season_results`/`team_season_epa`, which flips the `seasons.ts` defaults (finding 4).
2. Removing the null-score `raise` in `build_team_season_results` (`etl/performance.py:112–117`) produces partial rows that carry no flag.
3. Relaxing the 16/17 check in `_opponent_adjust` (line 356) without recording the games-played coverage.
4. Not filtering pbp and schedule to `week <= asof_week`, which lets a half week in on retry days.
5. `NUMERATOR_LABEL.cap = 'Cap hit (season-final)'` in `lib/data/metrics.ts:162` printed over a 2026 snapshot.
6. `getCostPerWin`, the receipt and the frontier dividing full-year cap or cash by wins to date.
7. Missing 2026 dead money treated as 0, or 2025's resolution reused.
8. 2026 included in `capplus.build`, which shifts `sd_meas` and every published Cap+.
9. 2026 entering the frontier's fixed domain, `frameSeasons`, the sparkline, the deltas, `getFranchiseSeasonFacts`, or compare.
10. A connected arc path from 2025 to 2026.
11. `ReceiptVerdict` on live rows.
12. CSV exports without the as-of week.
13. OG cards without the as-of line.
14. A live run going through `etl.pipeline.run`, which rewrites `manifest.json` and `pins.toml`.
15. Rendering "updated N days ago" on a static page.

### Critical files

- /Users/rey/Desktop/Active-Projects/nfl-o-nomics/etl/performance.py
- /Users/rey/Desktop/Active-Projects/nfl-o-nomics/etl/capplus.py
- /Users/rey/Desktop/Active-Projects/nfl-o-nomics/etl/pipeline.py
- /Users/rey/Desktop/Active-Projects/nfl-o-nomics/web/lib/metric.ts
- /Users/rey/Desktop/Active-Projects/nfl-o-nomics/web/lib/data/seasons.ts

The other files touched: `etl/config.py`, `etl/pins.py`, `web/db/seed.ts`, `web/db/schema.ts`, `web/app/_shared/division-view.tsx`, `web/components/field/league-field.tsx`, `web/app/share/_og/data.ts`, `tests/test_contracts.py`, `.github/workflows/ci.yml`.