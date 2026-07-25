# DECISIONS.md — YIELD/YARD

One line each: **decision | reason | date.** Date is 2026-07-25 unless noted. This is the
record of what was settled, so a future maintainer can tell a decision from an accident.
Detail lives in `DATA_AUDIT.md`, `CAPPLUS_MEMO.md`, `SPEC.md` and the `audit/findings_*.md`
files — this file does not repeat it.

---

## Pipeline and repo

| # | Decision | Reason | Date |
|---:|---|---|---|
| 1 | **ETL is Python; the app is TypeScript.** No Python at request time. | The audit is already Python and its patterns are proven; the boundary between them is the mart schema and nothing else. | 2026-07-25 |
| 2 | **Governance docs live at repo root.** | They are read together, cross-reference each other by filename, and are the first thing a new engineer opens. | 2026-07-25 |
| 3 | **Team codes normalised to current-franchise (`LA`/`LAC`/`LV`) in all marts; era codes preserved in curated sources; one shared normalizer module.** | Four live conventions exist (nflverse retroactive, era-correct, PFR boxscore, PFR franchise); a single module is the only defence. Consequence accepted: `LA` in 1999 is the St. Louis Rams — franchise continuity preserved, geography not. | 2026-07-25 |
| 4 | **`PFR_DRAFT_TEAM_MAP` runs in front of `normalize_team` for draft data.** | `normalize_team` alone leaves 8 draft codes wrong (`GNB`, `KAN`, `LVR`, `NOR`, `NWE`, `SDG`, `SFO`, `TAM`). | 2026-07-25 |
| 5 | **The Rams are `LA`, never `LAR`.** | Neither upstream source ever emits `LAR`. | 2026-07-25 |
| 6 | **Idempotent, byte-stable ETL re-runs are the standard.** | It is what makes golden tests in CI meaningful; verified in the audit by two byte-identical cold runs. | 2026-07-25 |
| 7 | **DuckDB `httpfs` remote scan; `data/raw/` stays empty.** | pbp files carry 372 columns and we read six; nothing needs to land on disk. TLS verification stays on. | 2026-07-25 |
| 8 | **nflverse assets pinned to named release tags with row counts and checksums; never `latest`.** | Schema drift is observed, not hypothetical (roster breaks 2002 and 2016; the empty 2012 snaps asset). | 2026-07-25 |

## Performance and Cap+

| # | Decision | Reason | Date |
|---:|---|---|---|
| 9 | **`play_type IN ('pass','run')`, REG only.** | There is no `'rush'` literal; the numeric `pass`/`rush` flag columns use a wider definition and give different counts. | 2026-07-25 |
| 10 | **A tie counts as half a win.** | Standard, and per-team game counts drive it (2022 BUF and CIN played 16, not 17). | 2026-07-25 |
| 11 | **P = equal-weight (1/3, 1/3, 1/3) within-season z-blend of win %, point differential per game, EPA margin per play.** | Backtested weight-insensitive: correlation with alternates ≥ 0.9968, mean rank shift ≤ 0.74 places, no sniff verdict changes. Closed — spend no further product time on weights. | 2026-07-25 |
| 12 | **Cap+ recommended build = Total-Cost hybrid, λ = 1.5, floored at the season 25th percentile — PENDING APPROVAL GATE #1.** | Only construction in the evidence where the dead-money mechanism actually works; most credible all-time top/bottom 15; moves teams 2.23 rank places rather than 0.30. | 2026-07-25 |
| 13 | **λ = 1.5 is a published economic claim, not a tuning knob**, and the λ = 1 comparison is published beside it. | The "famous cap disasters rate poorly" requirement passes only because of λ; leaving λ unstated would let the algebra pick it. | 2026-07-25 |
| 14 | **The floor is applied to cost, and the league average is taken after it.** | Keeps `mean(R)` exactly 1.000 so `R = 1.00` still reads as "league-average cost". | 2026-07-25 |
| 15 | **One dead-money snapshot per season, all 32 teams; the later 2018 table (2018-07-14) is used.** | Reading teams at different dates manufactures punishment — Atlanta moves 88.1 → 98.8 when all 32 are read at one date. | 2026-07-25 |
| 16 | **Nine Cap+ seasons; four whole-season blanks (2013, 2016, 2020, 2021); 2014 and 2019 badged provisional.** | Partial seasons are blanked entirely, not partially — standardising a season where only the five worst offenders are observed would rate 2013 Oakland average. | 2026-07-25 |
| 17 | **The weighted cost figure is a cost index and is never labelled "% of cap used"; the plain cap-consumed share publishes beside it.** | At λ = 1.5, 44.1% of team-seasons exceed 1.00. | 2026-07-25 |
| 18 | **1999–2012 fallback is named "Team Rating (performance only)".** | Never "Cap+ (performance only)" — to a reader that is still Cap+. Hard visual break at 2013; both lines plotted on the 2014–2025 overlap. | 2026-07-25 |
| 19 | **The C-where-covered / B-elsewhere hybrid is rejected.** | Two metrics under one name that disagree violently (2023 LA: #14 on one, #1 on the other). | 2026-07-25 |
| 20 | **The four-season scenario brackets never ship as values.** | They are scenarios, not measurements. | 2026-07-25 |
| 21 | **Cap+ is framed as single-season resource accounting, never front-office quality, and the +0.158 adjustment persistence is published by us.** | It is the first thing a careful reader computes; better it comes from us. | 2026-07-25 |

## Money data

| # | Decision | Reason | Date |
|---:|---|---|---|
| 22 | **Dead money = curated dated press snapshots with per-row citations. In-house derivation rejected.** | A three-estimator prototype scored on **seven** known charges returned 15.3% median absolute error with a −38.5%…+171.3% spread and only 3 of 7 inside ±15%. Separately, five inference routes failed on **8 of 8** high-profile separations. (These are two different tests — see `RISKS.md` contradictions §2.) | 2026-07-25 |
| 23 | **SAFE / REVIEW licensing tiers pending legal**, with `license_tier` added as a column and `DEAD_MONEY_TIER ∈ {SAFE_ONLY, ALL}` as the seed-time filter. | Makes the legal contingency a configuration change on the day rather than a rebuild. **New this pass.** | 2026-07-25 |
| 24 | **`cap_used_total` is never presented as cap utilization**, and `dead_money_total` is typed `null` in that mart so misuse is a compile error. | It runs 15–22% below true cap and the error is largest for the worst-run teams. | 2026-07-25 |
| 25 | **Dead-money burden denominator = implied adjusted cap.** | It is the cap the team actually operated against; the league-cap version ships as a labelled secondary readout. | 2026-07-25 |
| 26 | **Zero-win display rule: total spend + "0 wins" label, ratio suppressed, excluded from ratio-ranked orderings. Never ∞.** | Exactly two cases: 2008 DET and 2017 CLE. Both are test fixtures. | 2026-07-25 |
| 27 | **Position = most-recent-signing-at-or-before-season, falling back to earliest.** | `position` is recorded at signing and drifts for 7.4% of players; the rule is stated in the UI as "position as of the deal then in force." | 2026-07-25 |
| 28 | **Positional allocation is labelled a share of rostered cap, never a share of cap.** | The denominator inherits the dead-money omission. | 2026-07-25 |
| 29 | **Cash is the default cost-per-win numerator; cap is a toggle.** | Cash ratios sit near 1.0 and are not distorted by the dead-money omission; cap systematically flatters the worst-run teams. **New this pass.** | 2026-07-25 |

## Coaching

| # | Decision | Reason | Date |
|---:|---|---|---|
| 30 | **Row = the titled holder of the role; play-caller detail lives in `note`; `NONE` = title genuinely unfilled; multi-stint rows preserved in chronological order.** | Established in the coaching audit and validated at 100% on head coaches and on a 10.2% coordinator sample. | 2026-07-25 |
| 31 | **`note` is display and provenance only — never parsed by code.** | It is free text; parsing it would make the pipeline depend on prose. **New this pass.** | 2026-07-25 |
| 32 | **A `NONE` coordinator slot takes the identity `NONE@<canonical HC name>` — the head coach absorbed the role. Transitions into or out of a `NONE` slot count at half weight.** | Third option between "parse the notes" and "treat as no change": it matches reality (ARI 2019–2022 OC is continuous under Kingsbury), registers churn correctly when the HC changes, and uses only join-safe fields. **New this pass.** | 2026-07-25 |
| 33 | **Name canonicalisations are load-bearing and must not be merged**: Jim E. Mora ≠ Jim L. Mora; Pete Carmichael Sr. ≠ Pete Carmichael Jr.; Herm Edwards (from "Herman Edwards"); Jimmy Raye II (≠ Raye III). Never fuzzy-match on name. | 435 distinct people in a surname space dense with relatives; the failure mode is silent. Join on `(coach_name, season, team, role)` plus a surrogate `coach_id`. | 2026-07-25 |
| 34 | **Coaching sources: Wikipedia-primary with independent verification** (franchise HC lists; pro-football-history.com for coordinators). PFR was blocked from the environment (403) and is not used. | 890/890 HC rows confirmed, 176/176 sampled coordinator rows confirmed, zero corrections required. | 2026-07-25 |
| 35 | **Stability Index formulation** — churn points: HC boundary 3.0, HC in-season 4.5, OC/DC boundary 1.0, OC/DC in-season 1.5, ×0.5 across a `NONE` transition; `W(t) = churn(t) + 0.6·churn(t−1) + 0.3·churn(t−2)`; `SI = clamp(0,100, 100 − 5·W)`. Regimes are defined by head-coach identity only. **Not an approval gate.** | Mid-season change is weighted 1.5× its boundary equivalent because a firing in October is both a change and a signal of crisis; coordinators weigh a third of a head coach; the three-season memory keeps a rebuild visible for as long as it is actually being felt. **New this pass.** | 2026-07-25 |
| 36 | **Each regime change is linked to the team's dead money in the two following seasons, but only where a full-32 table exists; each figure carries its own as-of date; the pair is never connected.** | This is the product's signature angle and it only stays honest if the coverage gaps are visible inside it. Aggregates print their own `n` and are worded as association, never cause. **New this pass.** | 2026-07-25 |

## Support data

| # | Decision | Reason | Date |
|---:|---|---|---|
| 37 | **Snap boundary is 2013.** | The 2012 asset returns HTTP 200 and contains zero rows. Check row counts, not status codes. | 2026-07-25 |
| 38 | **Snaps join via the `players.parquet` bridge on `gsis_id`, never directly on `pfr_id`.** | Direct join matches 34.5% in 2013 and 71.3% in 2023; bridged matches 99.99% / 99.95%. `gsis_id` is the hub, `pfr_id` is the only bridge to snaps, `otc_id` is the internal contracts key. | 2026-07-25 |
| 39 | **Draft value chart = the Fitzgerald–Spielberger NFL Draft Trade Value Chart (Over The Cap), cited on the methodology page.** | Its units are dollars of surplus value relative to rookie-contract cost — the same units as the rest of this product — rather than the Jimmy Johnson chart's trade-negotiation heuristic, which was never calibrated to on-field outcome. **New this pass.** | 2026-07-25 |
| 40 | **`car_av` is excluded from the draft mart entirely.** | 100% null — a dead column that looks live. Excluding it is cheaper than documenting it. | 2026-07-25 |
| 41 | **Draft capital and realized return are available 2000–2025; any dollar framing of a draft class renders 2013+ only.** | Respects the contract-data boundary. **New this pass.** | 2026-07-25 |

## Product, identity and presentation

| # | Decision | Reason | Date |
|---:|---|---|---|
| 42 | **Product name: YIELD/YARD**, per the design brief. | — | 2026-07-25 |
| 43 | **Cap+ renders as field position** — `yards_to_opponent_goal = 150 − Cap+`; 100 = midfield, 15 points = 15 yards, red zone elite, safety below 50 — on **exactly two** field-literal surfaces (league Field, team Drive). | Settled by the design brief. Every other chart uses conventional axes with a Cap+ axis always present, so the metaphor never replaces the number. | 2026-07-25 |
| 44 | **Value Stadium = money allocation**, not performance: sections are position groups by cap share, gold ring is league average, dead money is unlit seats. | Design reconciliation #1. | 2026-07-25 |
| 45 | **Division view is current-alignment only.** | The 2002 realignment is not modelled; stated on the view. | 2026-07-25 |
| 46 | **Window is 2000–2025 for coaching and draft, 1999–2025 for play-by-play and results; the 2025 season is included; 2026 is excluded.** | 2025 is complete through Super Bowl LX (2026-02-08); `games.csv` already carries 272 unplayed 2026 rows and every mart clips. | 2026-07-25 |
| 47 | **TeamMark: official logos self-hosted from the nflverse colour/logo file, never hotlinked, behind a global `TEAM_LOGOS_ENABLED` kill-switch with a typographic fallback chip.** | Glyph colour is computed black/white by relative luminance — 15 of 36 colour rows have primary/secondary contrast below 3.0 and 6 below 2.0; computed glyphs give a worst case of 4.66, all ≥ AA. | 2026-07-25 |
| 48 | **PlayerMark: Wikimedia Commons only, verified via Wikipedia article → Wikidata P18 → Commons, with English Wikipedia team-category confirmation outranking exact-name match.** | Exact-name-first resolved the Jaguars' Josh Allen to the Bills quarterback with high confidence. Wikidata P54 is too stale to be a verification signal; Commons full-text search stays gated. | 2026-07-25 |
| 49 | **Both image OPEN decisions stay open for Rey**, and the renderer implements `IMAGE_MIN_WIDTH_PX` as a config constant with the treatment step written as a configuration branch. | Either answer becomes a one-line change instead of a rewrite. **New this pass.** | 2026-07-25 |
| 50 | **Curated pickers only in v1. No free-form query builder.** | It is the v2 paid wedge; a PR that adds arbitrary filtering is rejected on sight. | 2026-07-25 |
| 51 | **The player view never renders a value grade, letter grade, star rating or composite player score.** | Published as a commitment in `METHODOLOGY.md` and enforced in review. | 2026-07-25 |
| 52 | **URL routes use current-franchise codes; era-correct identity is rendered inside the page; legacy codes 301-redirect.** | `/team/lv/2003` is the only URL for the 2003 Raiders and it renders "Oakland Raiders". Franchise continuity is preserved, geography is not — stated on the page. **New this pass.** | 2026-07-25 |
| 53 | **v1 player population = the 251 audited players (2021–2025 top-cap plus marquee dead-money names).** | Every player page then has known image status and known licence metadata; expanding it requires re-running the image pipeline and re-auditing collisions. **New this pass.** | 2026-07-25 |
| 54 | **The app reads precomputed marts only, and `capplus_candidates.csv` is never read by the app** — `capplus_official` is a promoted, narrowed mart. | The candidates file is a 69-column backtest artefact carrying rejected alternates. **New this pass.** | 2026-07-25 |
| 55 | **CSV export is generated client-side from the same typed rows the view rendered**, with a header comment block carrying source, coverage and as-of dates. | No separate export endpoint that could drift from the view. **New this pass.** | 2026-07-25 |
| 56 | **No auth, no accounts, no user data, no cookies, no third-party analytics in v1.** | Nothing to log in to and nothing to breach; also means no consent banner between a reader and a chart. | 2026-07-25 |
| 57 | **v1 data is a static snapshot refreshed manually preseason; in-season updates are v2.** | Contract figures are season-final restatements (no "as of week N" view is possible) and dead-money figures are dated snapshots — a mid-season refresh would silently change the as-of date of published numbers. **New this pass.** | 2026-07-25 |
| 58 | **Type is Bebas Neue (display) / Squadron Black (athletic, Rajdhani substituting until licensed) / Inter (body and data, tabular numerals).** | Substitution is a single token value; no layout depends on Squadron's metrics. | 2026-07-25 |
| 59 | **Dark is the flagship theme; a true designed light mode is required, not an inversion. Both pass WCAG AA.** | Every key card must survive being screenshotted into both a light and a dark feed. | 2026-07-25 |
| 60 | **Design tokens arrive as `--yy-*` CSS custom properties plus a JSON mirror, under an extend-never-rename contract; components are built against a neutral placeholder theme until they land.** | Makes the design integration a theme swap rather than a re-skin, and keeps Phases 1–2 unblocked while design files are unavailable. | 2026-07-25 |
