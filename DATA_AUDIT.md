# DATA_AUDIT.md — YIELD/YARD (NFL-o-nomics) Phase-0 Hard Gate

Assembled 2026-07-25. Every figure in §3 and §4 was recomputed from the local marts and
curated files at assembly time; the two player-level contract figures were additionally
re-pulled live from the nflverse release parquet rather than read from staged output.
Detailed evidence lives in the appendix findings files linked in §7.

---

## 1. VERDICT

**PHASE-0 GATE: PASS — with three documented boundary corrections.**

All 18 golden tests pass at their stated tolerance, and all 11 structural tests pass. Every
exact-tolerance check (wins, point differential, cap ceilings, draft position, snap counts)
returns a delta of exactly zero, and every money check returns a delta of exactly $0 —
0.000% against a ±1% tolerance, not merely inside it. The three corrections the audit
forced on the original Phase-0 sketch are all *narrowings of scope*, not defects: **snap
counts begin in 2013, not 2012** (the 2012 release asset exists and returns HTTP 200 but
contains zero rows — an empty-file trap that a naive existence probe reports as coverage);
**the Tier 2 contracts boundary is 2013, not earlier** (1994–2012 is a sample of notable
contracts at 43 players/team or fewer, not a roster, and cannot carry a team-level
denominator); and **dead money is not derivable from nflverse in any form** — it is absent,
unflagged and uninferable, and an in-house derivation prototype was built, scored against
seven known cases and rejected (§6, trap 13). That gap is closed instead by two curated,
press-sourced datasets with per-row citations and dated-snapshot semantics. The one check
that fails on its original route — Wilson's $85M Denver dead money against nflverse —
passes exactly against the curated ledger, and the audit reports both results rather than
quietly substituting the one that works. Two open decisions are escalated to the product
owner in §5 and neither blocks the gate: the image resolution floor and the ShareAlike
derivative-work question. One material constraint is flagged for legal: **if the REVIEW
licensing tier is withheld, full-32 dead-money coverage survives for 2014 and 2015 only.**

---

## 2. COVERAGE MATRIX

Row counts are as verified at assembly. "Verified range" means every year in the range was
confirmed present and non-empty — not merely that the asset returned HTTP 200.

| Metric | Verified year range | Rows / grain | Source | Caveats |
|---|---|---|---|---|
| Play-by-play / EPA | **1999–2025** (27 seasons) | 1,279,628 pbp rows; 909,271 pass+run scrimmage plays; mart 861 team-seasons | nflverse `play_by_play_{YEAR}.parquet` | `play_type` is `'run'`, never `'rush'`. Team codes retroactively rewritten to present-day abbreviations. EPA is opponent- and era-unadjusted — centre per season for cross-era work. |
| Schedules / results | **1999–2025** (27 seasons) | 6,967 REG + 309 POST games; mart 861 team-seasons | nfldata `games.csv` | File extends to 2026 (272 unplayed rows, null scores) — mart clips to 1999–2025. Era-correct codes (STL/SD/OAK), unlike pbp. |
| Contracts — player-season cap detail | **2013–2025** | 32,105 player-seasons; 416 team-seasons | nflverse `historical_contracts.parquet` (OTC-derived) | Tier 2 boundary. 1994–2012 excluded: a sample of notable contracts, not a roster. 2010 uncapped. `cap_used_total` is cap held by *rostered* players — 15–22% below true cap because dead money is absent. |
| Cash spending | **2013–2025** | 32,105 player-seasons (cash 100% non-null wherever cap is) | same | Annual, not cumulative. Ratios sit near/above 1.0 and are far better behaved than cap. Excludes cash paid to released players. |
| Dead money — team-season | **2013–2025, 9 full-32 + 4 partial** | 370 dated snapshot rows / 316 distinct team-seasons | curated press snapshots, per-row `source_url` | **full32: 2014, 2015, 2017, 2018, 2019, 2022, 2023, 2024, 2025** (9 seasons). **partial: 2013 (5 teams), 2016 (8), 2020 (5), 2021 (10)**. Each row carries `asof_date` + `asof_stage`; snapshots are taken at different points in the league year and **must never be joined into a time series**. Same-season drift measured at up to 2.2× (2018: $155.2M league-wide in March vs $348.5M in July). |
| Dead money — marquee ledger | era anchors **2017**–2027 | 21 charges, 20 players, 15 teams | ESPN / Roster Management System + press | All 21 rows `is_actual=TRUE`. One row (`Dareus/BUF`) has a deliberately blank per-season split — sources conflict and it was not guessed. |
| League salary cap | **1994–2025** (32 rows) | 32 year rows | curated, per-row citation | **2010 is null — uncapped year**, no denominator exists. 2011 stored exact at $120,375,000 (NFL Ops rounds to $120.0M). |
| Draft picks | **2000–2025** | 6,644 picks in window (12,927 rows, file spans 1980–2026) | nflverse `draft_picks.parquet` | `car_av` is 100% null — a dead column. `gsis_id` 95.7% over window (worst 2005 @ 85.9%). Team codes are PFR **boxscore** codes (`NWE`, `GNB`, `SFO`) — a fourth convention. |
| Snap counts | **2013–2025** | 324,611 rows (310,475 REG); 1,928–2,301 players/season | nflverse `snap_counts_{YEAR}.parquet` | **The 2012 file exists (HTTP 200) and is empty (0 rows).** Effective coverage starts 2013. Keys on `pfr_player_id` only — no `gsis_id` in the schema. Postseason uses WC/DIV/CON/SB, never a `POST` literal. |
| Rosters | **1999–2025** | 66,480 rows (35,475 in 1999–2015; 31,005 in 2016–2025) | nflverse `roster_{YEAR}.parquet` | **Two structure breaks.** 2002: schema goes 30→36 columns (week/game_type appear; 1999–2001 lack them). 2016: row count jumps ~2,057→~3,085/season as DEV/CUT/RES statuses are added, and `gsis_id` becomes unique — 1,339 duplicate-gsis rows exist across 1999–2015, 1 across 2016–2025. |
| Player IDs / crosswalk | rookie seasons 1974–2026 | 25,035 players | nflverse `players.parquet` | `gsis_id` 100% and unique — the hub of the star schema. `otc_id` only 37.3% overall (0.4% for pre-2000 rookies) and lives **only** here; `pfr_id` 90.1% and is the **only** bridge to snap counts. |
| Coaching staff | **2000–2025** | 2,612 rows / **830 team-seasons** (26×32 − HOU 2000–01) | curated, per-row `source_url` | 890 HC / 870 OC / 852 DC. 436 distinct `coach_name` values = 435 people + the `NONE` sentinel (60 rows, title genuinely unfilled). `coach_name` is **not** a safe join key — 3 resolved father/son collisions. |
| Team colours | current 32 (+4 legacy) | 36 rows (`teams_colors_logos`), 40 rows (`teamcolors`) | external nflverse colour files | Conference/division/colour are **absent from `teams.csv`** (800 rows, 2002–2026) and must come from the colour file. **15 of 36 rows have primary/secondary contrast < 3.0**; 6 below 2.0. Mitigation: pick glyph colour by relative luminance — worst case then 4.66, all ≥ WCAG AA. |
| Player images | 251-player sample (2021–2025 top-cap) | 244 usable / 251 = **97.2%** | Wikimedia Commons / Wikidata P18 | Fallback 2.8% at any-resolution. Rises to **6.4% at a 300px floor, 22.7% at a 600px floor**. 48.0% of usable photos are ShareAlike. 91.4% require attribution. See §5 open decisions. |

---

## 3. GOLDEN TESTS — receipts

Tolerance: **exact** for wins, records, point differential, cap ceilings, draft position and
snap counts; **±1%** for money. Every pipeline value below was recomputed at assembly time
from `data/marts/` and `data/curated/`; external values and URLs are from
`audit/golden_facts_sources.md`.

| # | Fact | External source value + URL | Pipeline value (recomputed) | Delta | Verdict |
|---|---|---|---|---|---|
| 1 | 2007 NE regular-season record | **16–0** — [Wikipedia](https://en.wikipedia.org/wiki/2007_New_England_Patriots_season) | **16-0-0**, 16 games | 0 | **PASS** (exact) |
| 2 | 2007 NE point differential | **+315** (589 PF / 274 PA) — [Wikipedia](https://en.wikipedia.org/wiki/2007_New_England_Patriots_season); PA corroborated by [Patriots.com](https://www.patriots.com/news/inside-the-numbers-the-2007-season-140016) | **+315** (589 PF / 274 PA) | 0 / 0 / 0 | **PASS** (exact) |
| 3 | 2008 DET regular-season record | **0–16** — [Wikipedia](https://en.wikipedia.org/wiki/2008_Detroit_Lions_season) | **0-16-0**, PF 268 / PA 517 | 0 | **PASS** (exact) |
| 4 | 2017 CLE regular-season record | **0–16** — [Wikipedia](https://en.wikipedia.org/wiki/2017_Cleveland_Browns_season) | **0-16-0**, PF 234 / PA 410 | 0 | **PASS** (exact) |
| 5 | 2023 KC regular-season record | **11–6** — [Wikipedia](https://en.wikipedia.org/wiki/2023_NFL_season) | **11-6-0**, 17 games, PF 371 / PA 294 | 0 | **PASS** (exact) |
| 6 | 2023 SF regular-season record | **12–5** — [Wikipedia](https://en.wikipedia.org/wiki/2023_NFL_season) | **12-5-0**, 17 games, PF 491 / PA 298 | 0 | **PASS** (exact) |
| 7 | League cap 2011 | **$120,375,000** — [NFL Ops](https://operations.nfl.com/calendar-events/nfl-free-agency/nfl-salary-cap) / [PFT exact](https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/the-cba-in-a-nutshell) | **$120,375,000** | $0 (0.000%) | **PASS** (exact) |
| 8 | League cap 2013 | **$123,000,000** — [NFL.com](https://www.nfl.com/news/salary-cap-rise-to-133-million-shows-how-new-cba-is-working-0ap2000000331237) | **$123,000,000** | $0 (0.000%) | **PASS** (exact) |
| 9 | League cap 2020 | **$198,200,000** — [NFL Ops](https://operations.nfl.com/calendar-events/nfl-free-agency/nfl-salary-cap) | **$198,200,000** | $0 (0.000%) | **PASS** (exact) |
| 10 | League cap 2024 | **$255,400,000** — [CBS Sports](https://www.cbssports.com/nfl/news/nfl-salary-cap-skyrockets-to-255-4-million-for-2024-season-up-record-30-6-million-from-2023/) | **$255,400,000** | $0 (0.000%) | **PASS** (exact) |
| 11 | League cap 2025 | **$279,200,000** — [NFL.com](https://www.nfl.com/news/nfl-sets-salary-cap-at-279-2-million-per-team-for-2025-season) | **$279,200,000** | $0 (0.000%) | **PASS** (exact) |
| 12 | Mahomes 2023 cap hit | **$37,133,824** — [Over The Cap](https://overthecap.com/player/patrick-mahomes/5594) | **$37,133,824** (KC; live re-pull) | $0 (0.000%) | **PASS** (±1%) |
| 13 | Wilson 2013 SEA cap hit | **$681,085** — [Over The Cap](https://overthecap.com/player/russell-wilson/1569) | **$681,085** (SEA; live re-pull) | $0 (0.000%) | **PASS** (±1%) |
| 14 | Wilson DEN dead money **2024** | **$53,000,000** — [ESPN](https://www.espn.com/nfl/story/_/id/39654399/broncos-cut-russell-wilson-take-85m-dead-money-hit), [PFT split](https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/broncos-release-russell-wilson-opt-for-53-million-cap-charge-in-2024) | **$53,000,000** (curated ledger) | $0 (0.000%) | **PASS** (±1%) |
| 15 | Wilson DEN dead money **2025** | **$32,000,000** — same sources | **$32,000,000** (curated ledger) | $0 (0.000%) | **PASS** (±1%) |
| 16 | Wilson DEN dead money **total** | **$85,000,000** — [CBS Sports](https://www.cbssports.com/nfl/news/broncos-to-release-russell-wilson-reportedly-take-on-an-nfl-record-85-million-in-dead-cap) | **$85,000,000** (curated ledger) | $0 (0.000%) | **PASS** (±1%) |
| 16b | *Same fact, nflverse route* | $85,000,000 | **$0 — absent.** Wilson's only 2024 row is PIT $1,210,000; only 2025 row is NYG $11,029,412; **zero DEN rows in either season** | −$85,000,000 (−100%) | **FAIL → resolved, see below** |
| 17 | Tom Brady 2000 draft position | **Round 6, pick 199, NE** — [Patriots.com](https://www.patriots.com/video/25th-anniversary-of-tom-brady-s-199-overall-draft-selection-by-the-patriots-in-2000-nfl-draft) | **round 6, pick 199**, team `NWE` → `NE` after normalization | 0 / 0 | **PASS** (exact) |
| 18 | Laken Tomlinson 2023 NYJ offensive snaps | **1,101** (100% of team offensive snaps) — [NewYorkJets.com](https://www.newyorkjets.com/news/jets-snap-count-breakdown-2023-season-cj-mosley-quincy-williams) | **1,101** REG snaps, 17 games, avg `offense_pct` = 1.000 | 0 | **PASS** (exact) |

### 3.1 Test 16b — the one failing route, and its disposition

Tests 14–16 are scored against `data/curated/dead_money_ledger.csv` and pass exactly. Test
16b runs the *same fact* against the nflverse contracts parquet and fails completely. Both
are reported because the failure is the load-bearing finding of the whole audit, and
reporting only the passing route would misrepresent where the number comes from.

**This is sourced-curated data, not nflverse-derived, and it cannot be otherwise.**
nflverse `historical_contracts` stores a *player-following career table* — exactly one row
per player per year, attributed to the team he was on that year. When a player is released
or traded, the table simply switches teams; the charge left behind on the old team is never
written. Five independent inference routes were tested and all five returned zero rows,
including eight further high-profile separations (Ryan, Wentz, Lance, Garoppolo, Mayfield,
Cousins, Osweiler, Rodgers) — **8 of 8 fail**. There is no field, flag or residual that
recovers it. A three-estimator in-house derivation was then built and scored against seven
known charges: best model 15.3% median absolute error, but with a distribution running
−38.5% to **+171.3%** and only 3 of 7 cases inside ±15%. It was rejected (§6, trap 13; `audit/findings_deadmoney_sourcing.md` Appendix D).

**Independent cross-check on the curated figures.** Wilson's ledger charges must be
components of Denver's team totals, and they are: DEN 2024 team dead money is **$85,210,000**
(as-of 2024-11-27) against Wilson's $53,000,000, and DEN 2025 is **$42,780,000** (as-of
2025-12-17) against Wilson's $32,000,000. Both containments hold with room for other
charges, which is the expected shape.

### 3.2 Hand-computed cost-per-win — 2023 San Francisco 49ers

Worked step by step from the two source files, no intermediate metric.

```
Source A  data/marts/team_season_cap.csv, row (season=2023, team=SF)
            cash_spent_total = $258,275,910
            (n_players = 81; cap_used_total = $165,975,853; league_cap = $224,800,000)

Source B  data/marts/team_season_results.csv, row (season=2023, team=SF)
            wins = 12   (record 12-5-0, 17 games, PF 491 / PA 298)

Arithmetic  $258,275,910 ÷ 12 wins
          = $21,522,992.50 per win
          → displayed as $21.52M per win
```

Both inputs independently confirmed: the wins figure matches the external 12–5 record
(test 6, exact); the cash figure was re-derived from the source parquet at assembly time as
the sum of `cash_paid` over 81 SF 2023 player-seasons and reproduces `cash_spent_total` to
the dollar. Cash — not `cap_used_total` — is the correct numerator here, because
`cap_used_total` omits dead money and therefore systematically flatters the worst-run teams
(§6, trap 11).

---

## 4. STRUCTURAL TESTS

| # | Test | Result | Evidence recomputed at assembly |
|---|---|---|---|
| S1 | Era-correct team-season completeness | **PASS** | 31 teams in each of 1999, 2000, 2001; 32 in every season 2002–2025. Total = 31×3 + 32×24 = **861 rows**, actual 861. Zero violations. |
| S2 | Zero missing REG scores | **PASS** | 0 null cells across `points_for`, `points_against`, `wins`, `losses`, `ties`, `games` in all 861 rows. |
| S3 | League-wide points balance | **PASS** | `Σ points_for == Σ points_against` in every one of the 27 seasons. |
| S4 | Record arithmetic closes | **PASS** | `wins + losses + ties == games` for all 861 rows. |
| S5 | 1:1 mart joins | **PASS** | EPA↔results: 861 keys each, 861 matched, symmetric difference 0, zero duplicate keys on either side. Cap↔results (2013–2025): 416 keys each, 416 matched, symmetric difference 0, zero duplicates. |
| S6 | EPA sanity band, all seasons | **PASS** | League-mean offensive EPA/play spans **−0.0561 (1999) to +0.0314 (2020)** — all 27 seasons inside the −0.15…+0.15 band, no season near an edge. Team-season extremes −0.3024…+0.2578; zero team-seasons exceed \|0.5\|. EPA null rate on pass/run plays: **14 of 909,271 = 0.0015%**. |
| S7 | Zero-win seasons render without division-by-zero | **PASS** | Exactly **2** zero-win team-seasons exist in the marts and both are present with `wins = 0`: **2008 DET** (0-16-0, PF 268 / PA 517) and **2017 CLE** (0-16-0, PF 234 / PA 410). See display rule below. |
| S8 | 2022 BUF/CIN 16-game exception | **PASS, documented** | 2022 games distribution: 30 teams × 17, **2 teams × 16 — exactly BUF and CIN**. 2022 has 271 REG games, not 272. Any assertion that every team plays 17 games from 2021 produces a false positive here. |
| S9 | League cap-spend plausibility bounds | **PASS** | Over 416 team-seasons: `cap_pct_of_league` 0.5327–1.0855 (median 0.8726); `cash_pct_of_league` 0.5554–1.4007 (median 0.9902); `cap_pct_of_adjusted` 0.5107–0.9645. **0 rows** with cap share > 1.15; **0 rows** with cash share outside 0.5–1.5. `league_cap` joined non-null on 416/416. `dead_money_total` non-null on **0** rows, as designed. |
| S10 | Coaching completeness | **PASS** | 2,612 rows over **830 team-seasons**; **0** team-seasons missing any of HC/OC/DC; 0 blank names, 0 blank source URLs; roles confined to {HC, OC, DC}. |
| S11 | Dead-money coverage shape | **PASS, with blanks explicit** | 370 rows over 316 distinct team-seasons; 9 full-32 seasons and 4 partial; **no season in 2013–2025 has zero rows**; every row carries a non-null `asof_date` and `asof_stage`. |

### 4.1 Zero-win display rule — stated normatively

> **A cost-per-win figure is never rendered as infinity, "∞", "N/A", a blank, or a divide
> error.** When `wins == 0`, the view shows the **total spend figure** with an explicit
> **"0 wins"** label — e.g. *"$151.1M spent · 0 wins"* — and suppresses the ratio entirely.
> The team is excluded from ratio-ranked orderings rather than sorted to either extreme.

Verified against both cases:

- **2017 CLE** — inside the Tier 2 window. `cash_spent_total = $151,136,223`,
  `cap_used_total = $109,806,707`, `wins = 0`. Renders as **"$151.1M spent · 0 wins"**.
- **2008 DET** — Tier 1 only (pre-2013; no cap or cash row exists by design). Renders its
  record and performance panel with the economics panel showing the Tier 2 boundary
  message, **not** a zero or a blank.

---

## 5. TWO-TIER DATA PROMISE

This is the user-facing contract. It is what the product may claim, in these words.

### Tier 1 — Team performance and economic context · **1999/2000–2025**

Available for **every team-season, 861 of them**, with no gaps:

- **Results** — record, points for/against, point differential, win percentage (1999–2025).
- **EPA** — offensive, defensive and margin EPA per play, plus totals (1999–2025).
- **Coaching** — HC/OC/DC for 830 team-seasons (2000–2025; Houston enters 2002).
- **Draft** — every pick 2000–2025, 6,644 picks.
- **League salary cap** ceilings 1994–2025 as economic context (2010 blank — uncapped).

### Tier 2 — Player-level economics · **2013–2025**

Available for **416 team-seasons / 32,105 player-seasons**:

- Per-player cap detail, team cap totals, and positional cap allocation by group.
- Cash spending (annual, per player and per team).
- Cost-per-win and related economics.

Tier 2 **does not exist before 2013** and the product must not imply otherwise. Pre-2013
contract rows are a biased sample of notable deals (43 players/team in 2012, under 15% of a
team's cap by 2004), usable only for top-of-market questions, never for team totals.

### Special cases

**Dead money — per team.** Available for **9 of 13 seasons: 2014, 2015, 2017, 2018, 2019,
2022, 2023, 2024, 2025** (all 32 teams). **Four seasons are explicit blanks at the team
level: 2013, 2016, 2020, 2021** — only 5, 8, 5 and 10 teams respectively are published, and
a leaders-only list must never be rendered as a 32-team view with 22+ silent gaps. These
seasons show a "biggest hits" leaderboard, labelled as such, or nothing.

Every figure carries **dated-snapshot semantics**: dead money accrues monotonically through
a league year and each season's snapshot was taken at a different point (February for 2014,
midseason for 2015, preseason for 2017/2018/2019/2022/2023, late season for 2024/2025). The
as-of date renders **next to the figure**, and **these values are never connected by a line
in a time-series chart** — they are individually dated readings, not a series. Measured
in-season drift reaches 2.2× league-wide (2018) and +59% on a single team (CHI 2022).

**Dead money — marquee ledger.** 21 verified individual charges, 20 players, back to the
2017 era anchor (Dareus/BUF), all flagged `is_actual`. This is the strongest asset in the
group: league-official Roster Management System provenance for the core table.

**Licensing tiers — what ships now, what waits.** Dead money is a *derived* quantity that
only OverTheCap and Spotrac compute at scale, and neither licenses it. Risk is not in the
facts but in reproducing a compiler's selection and arrangement — a full 32-row table
approaches the whole compilation. Rows are tiered and the tier is filterable:

| Tier | Rows | Seasons touched | Ships |
|---|---:|---|---|
| SAFE — league-official (ESPN/RMS) | 69 | 2014, 2015, + season-final rows in 2022, 2023 | **now** |
| SAFE — editorially transformed | 45 | 2013, 2016, 2018, 2019, 2020, 2021 | **now** |
| REVIEW — Spotrac-derived | 64 | 2017, 2022 | pending legal sign-off |
| REVIEW — OTC-derived | 192 | 2018, 2019, 2023, 2024, 2025 | pending legal sign-off |

> **Material constraint for legal, quantified.** If the REVIEW tier is withheld, full-32
> coverage survives for **2014 and 2015 only**. 2017, 2024 and 2025 drop to **zero** teams;
> 2018 drops to 3, 2019 to 14, 2022 to 3, 2023 to 2. Seven of the nine full-32 seasons —
> including both most recent seasons — depend on REVIEW-tier rows. Several REVIEW rows are
> independently corroborated by SAFE rows for the same team-season (CHI/ATL 2022, LA/TB
> 2023) and could ship from the SAFE row alone.

**Snap counts.** 2013–2025 only. The 2012 asset exists and is empty; there is no 2012 snap
data to show and the boundary is stated, not silently absorbed.

**Player images.** 97.2% coverage on the 251-player audited sample (2.8% fallback), with
attribution visibly rendered — 91.4% of assets legally require it, so credits cannot hide
behind a hover or an info affordance.

### Open decisions for the product owner

Both are escalated unresolved. Neither blocks the Phase-0 gate; both must be settled before
build.

> **OPEN DECISION 1 — image resolution floor.** The headline 97.2% assumes *any* resolution
> is acceptable. The distribution is bimodal: median 1165×1496, with a thin tail of
> unusable thumbnails — the single highest-cap player in the population, Dak Prescott, is
> **138×239**. Options and their implied coverage: **no floor → 97.2% coverage / 2.8%
> fallback**; **300px floor → 93.6% / 6.4% fallback**; **600px floor → 77.3% / 22.7%
> fallback**. Choose deliberately; the renderer must branch on width either way.

> **OPEN DECISION 2 — ShareAlike derivative works.** 48.0% of usable photos (117 of 244)
> are CC BY-SA. A colour-treated, cropped or recomposited photo is a **derivative work**,
> and ShareAlike obliges the derivative to carry the same licence. Three options in
> decreasing risk: (a) restrict the treatment to CSS filters over an unmodified source, so
> no new fixed derivative is created — **keeps 97.2%**; (b) use only the CC BY / PD / CC0
> half — 127 photos, **coverage collapses to 50.6%**; (c) accept and honour CC BY-SA on
> treated assets — **keeps 97.2%**, with licence obligations attached to served assets.
> This is a legal question, not a design one, and it was invisible until this audit.

### The UI rule — verbatim, non-negotiable

> **Views must communicate tier boundaries explicitly — never silently show partial data.**
> A view that spans a boundary must say so at the boundary: label the year range it
> actually has, render the blank years as blanks with a stated reason, and never let a
> user infer from an unbroken axis that a metric exists for years it does not. A partial
> season is labelled partial. A dated snapshot renders its date. Absence is shown, not
> hidden.

---

## 6. KNOWN TRAPS REGISTER

Required reading for every engineer touching this data. One line each.

1. **The `cols` replication trap.** nflverse contracts replicates a player's *entire career
   cap table* byte-identically onto every one of his contract rows (100% of the 6,788
   multi-contract players); unnesting without deduplicating on `(otc_id, year)` yields
   304,313 rows instead of 41,976 and inflates every team total 3–7× — silently, in
   plausible-looking dollars.
2. **VARCHAR year junk.** `cols.year` is a **string** containing `'Total'`, `'0'` and
   `'201'`; the 45,833 `'Total'` footer rows carry real-looking dollar sums and will corrupt
   any aggregate that does not `TRY_CAST` and range-filter first.
3. **`play_type` is `'run'`, never `'rush'`.** All scrimmage logic is
   `play_type IN ('pass','run')`; the separate numeric `pass`/`rush` flag columns use a
   wider definition (they attribute penalty-nullified and `no_play` snaps) and give
   different counts.
4. **Four team-code conventions, one normalizer.** pbp uses *retroactive* current-franchise
   codes (`LA`/`LAC`/`LV` even in 1999 — `STL`, `SD`, `OAK` never appear); `games.csv` and
   `teams.csv` are *era-correct* (`STL` 1999–2015 etc.); `draft_picks.team` uses PFR
   **boxscore** codes (`NWE`, `GNB`, `SFO`, `LVR`, `SDG`); `teams.csv.pfr` uses PFR
   **franchise** codes (`CRD`, `RAV`, `OTI`, `RAM`). Everything routes through
   `audit/team_codes.py`; `normalize_team` **alone** leaves 8 draft codes wrong and needs
   the `PFR_DRAFT_TEAM_MAP` in front of it. Consequence: `LA` in 1999 is the *St. Louis*
   Rams — franchise continuity is preserved, geography is not.
5. **Snaps join via the `players.parquet` bridge only.** Snap counts carry `pfr_player_id`
   and no `gsis_id`; a direct `pfr_id` join to rosters matches **34.5% in 2013 / 71.3% in
   2023**, while bridging through `players.parquet` on `gsis_id` matches **99.99% / 99.95%**.
   There is no `otc_id` anywhere in rosters, snaps or draft — the crosswalk through
   `players.parquet` is mandatory, `gsis_id` is the hub, `pfr_id` is the only bridge to snaps.
6. **The 2012 snaps file is empty.** It returns HTTP 200 and contains 0 rows. An existence
   probe reports coverage that is not there; check row counts, not status codes.
7. **Rosters pre-2016 have duplicate `gsis_id`s.** Multi-team players get one row per team,
   so `gsis_id` is not unique in 1995–2019 (1,339 duplicate rows across 1999–2015). Two
   further breaks: 1999–2001 files have 30 columns and **no week/game_type**; 2016+ jumps
   from ~2,057 to ~3,085 rows/season by adding DEV/CUT/RES statuses.
8. **`car_av` is 100% null** in `draft_picks.parquet` — a dead column that looks live.
9. **Dead-money as-of discipline.** A `(team, season)` key without `asof_date` is a bug.
   Snapshots are taken at different points in the league year, dead money accrues
   monotonically, and stacking them produces a false trend: CHI 2022 reads $57.6M
   (preseason) → $85.8M (midseason) → $91.8M (final), +59%; the 2018 league total reads
   $155.2M in March and $348.5M in July, a 2.2× swing from measurement date alone.
10. **Projected-vs-actual landmines — five confirmed cases.** Published lists mix projected
    and settled charges: **Wilson/DEN** (published $35.4M/$49.6M is the projection; actual
    $53M/$32M), **Tagovailoa/MIA** (published $67.4M/$31.8M; actual $55.4M/$43.8M),
    **Julio Jones/ATL** (published $23.25M all in 2021; actual $7.75M/$15.5M),
    **Brady/TB** (published as a 2023–24 split; actual $35.104M entirely in 2023), and
    **Murray/ARI** (published $54.7M in 2026; actual $47.5M/$7.2M post-June-1). **Four of the
    five have correct totals and wrong per-season splits — a total-level checksum passes all
    four.** Reconcile on splits, never on totals alone.
11. **`cap_used_total` is not cap utilization.** It is cap held by *rostered* players and
    runs 15–22% below each team's actual cap because dead money is absent — and the error is
    largest exactly for the teams in cap hell, biasing any efficiency metric **in favour of
    badly-run teams**. Relatedly, `cap_percent`'s denominator is the team's *adjusted* cap
    (league cap + carryover), not the league cap.
12. **Mahomes' cap number is season-final snapshot semantics.** The 2023 figure resolves to
    $37,133,824 — the September rework — not the $49.293M scheduled number or the ~$39.7M
    March restructure. Every figure in this dataset is an end-of-league-year restatement;
    **no "as of week N" cap view is possible.**
13. **Dead money cannot be derived in-house — the prototype was built and rejected; do not
    rebuild it.** A three-estimator prototype (`audit/derive_deadmoney.py`) scored against
    seven known charges returned a best-model **15.3% median absolute error**, but with a
    distribution running **−38.5% to +171.3%** and only **3 of 7** cases inside ±15%; the two
    team-season totals agree only because large per-player errors cancel. Separately, five
    inference routes returned zero rows on **8 of 8** high-profile separations. The blockers
    are properties of the source, not the estimator: the departed team's future schedule is
    **overwritten** when the player signs elsewhere, restructures are invisible and
    unattributable, and there are no transaction dates, so post-June-1 splits are
    unrecoverable. Dead money comes from the curated press snapshots or it does not come at
    all (`audit/findings_deadmoney_sourcing.md` Appendix D).

---

## 7. Appendices

The findings files are the evidence base for everything above and remain authoritative on
detail. This document is the gate; they are the record.

| Appendix | File | Covers |
|---|---|---|
| A | `audit/findings_performance.md` | pbp/EPA and schedules/results, 1999–2025; team-code conventions |
| B | `audit/findings_contracts.md` | contracts schema, Tier 2 boundary, dead-money non-derivability, cash, positional allocation |
| C | `audit/findings_support_datasets.md` | draft, snaps, rosters, players crosswalk, teams/colours, join-rate matrix |
| D | `audit/findings_deadmoney_sourcing.md` | dead-money sourcing, coverage map, licensing tiers, ledger verification, derivation prototype |
| E | `audit/findings_coaching.md` | coaching-staff assembly, verification, name collisions |
| F | `audit/findings_image_audit.md` | player images, licence distribution, collisions, resolution |
| G | `audit/findings_capplus_backtest.md` | Cap+ candidate backtest; §3/§9 for dead-money window and coverage |
| H | `audit/golden_facts_sources.md` | externally verified golden facts with source URLs |

Reproduce: `python3.11 audit/audit_pbp.py`, `audit_schedules.py`, `audit_contracts.py`,
`audit_support.py`, `build_deadmoney_curated.py`, `derive_deadmoney.py`, `audit_images.py`.
All are idempotent and all leave `data/raw/` empty — verified empty at assembly.
