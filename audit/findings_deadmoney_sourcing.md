# Dead Money Sourcing — Findings

## Verdicts

| Question | Verdict |
|---|---|
| NFLPA public cap report as dead-money source | INFEASIBLE — no such field exists; archive captures nothing |
| Per-team-season dead money 2013–2025 | PARTIAL — full-32 for 2022–25, top-5 for 2020–21, nothing 2013–19 |
| Marquee individual-charge ledger | FEASIBLE — verified, league-official provenance |
| League-wide annual totals | INFEASIBLE per-season — no outlet publishes them |
| Openly licensed dataset with dead money | INFEASIBLE — none exists anywhere |

> **REVISION 2026-07-25.** Row 2 of this table is superseded by the 2013–2019 press
> sweep recorded in Appendix B. Per-team-season coverage is now **FULL-32 for
> 2014, 2015, 2017, 2018, 2019 and 2022–2025**, partial for 2013, 2016, 2020, 2021.
> The original verdict text is preserved above as written; see §2 and Appendix B.

## 1. NFLPA — route conclusively closed

The page is https://nflpa.com/reports/public-salary-cap-report (not /salary-cap-report, which 404s). It's an empty Telerik shell that AJAXes from an Azure proxy, with the key published in-page. I exercised the REST flow and rendered the report to XLSX. Complete field list: Team | Current Contracts | Previous Year Carryover | Team Cap | Cap Room. Title "Top 51 League Cap Report / generated daily", Year: 2026, Unadjusted Team Cap: $301,200,000.

No Dead Money, no Cap Adjustments, no Cap Spent field. Not derivable either — Team Cap − Cap Room bundles active salary and dead money into one figure. The report is current-year-only (no year parameter), and the API resolves exactly one report — PublicDeadMoneyReport.trdp, PublicCashSpendingReport.trdp etc. all 404.

Wayback gives zero. ~90 captures spanning 2020-04 → 2026-06 look promising and are worthless: because the table is AJAX-rendered, every raw (id_) snapshot pulled (2020, 2021, 2022, 2023, 2025) contains only data-report="PublicLeagueCapReport.trdp" and "loading...". No archived snapshot holds a single data value. No captures at all pre-April 2020.

## 2. Per-team-season coverage map

**REVISED 2026-07-25.** The table below supersedes the original coverage map, which
recorded 2013–2019 as NONE/ISOLATED. A dedicated 2013–2019 press sweep recovered
five additional full-32 tables. The original table is preserved verbatim in
Appendix B for audit purposes.

| Year | Coverage | Source | As-of | Timing caveat |
|---|---|---|---|---|
| 2013 | TOP-5 | Corry / National Football Post, syndicated Yahoo (https://sports.yahoo.com/dead-money-leaders-183000069--nfl.html) | 2013-12-06 | late season; near-final |
| 2014 | FULL 32 | ESPN Inside Slant, Kevin Seifert, via Roster Management System (https://web.archive.org/web/20140220id_/http://espn.go.com/blog/nflnation/post/_/id/117248/inside-slant-dead-money-totals) | 2014-02-18 | **pre-league-year; understates final** |
| 2015 | FULL 32 | ESPN Stats & Information (https://www.espn.com/nfl/story/_/id/13957641/dead-money-how-new-orleans-saints-salary-cap-woes-affect-drew-brees-future) | 2015-10-28 | midseason (through Week 7); strongest year |
| 2016 | TOP-4 + bottom-4 | The Comeback, Andrea Hangst (https://thecomeback.com/nfl/examining-dead-money-and-injured-reserve-spending-at-nfls-quarter-season-mark.html) | 2016-10-05 | quarter-season mark |
| 2017 | FULL 32 | USA TODAY For The Win, Steven Ruiz (https://ftw.usatoday.com/story/sports/nfl/2017/07/05/nfl-salary-cap-dead-money-leaders-definition-ravens/81897409007/) | 2017-07-05 | pre-season |
| 2018 | FULL 32 ×2 | theScore, Jack Browne (https://www.thescore.com/nfl/news/1571301 and https://www.thescore.com/nfl/news/1501210) | 2018-07-14 and 2018-03 | two snapshots, both kept |
| 2018 | PARTIAL (3 teams) | CBS Sports, Joel Corry (https://www.cbssports.com/nfl/news/agents-take-heres-the-three-nfl-teams-wasting-the-most-salary-cap-resources/) | 2018-10-10 | midseason reading; BUF/NYG/DAL only |
| 2019 | FULL 32 | theScore (https://www.thescore.com/nfl/news/1723008/updated-salary-cap-space-for-all-32-teams) | 2019-03-10 | **PREDATES THE LEAGUE YEAR — severe understatement** |
| 2019 | PARTIAL (14 teams) | Forbes, Bill Huber (https://www.forbes.com/sites/billhuber/2019/05/16/dead-cap-money-puts-teams-behind-franchise-building-eight-ball/) | 2019-05-16 | better-timed top-8 + bottom-6 |
| 2020 | TOP-5 | NBC Sports Boston (https://www.nbcsportsboston.com/boston/patriots/could-patriots-ranking-among-dead-money-leaders-cost-team-2020) | post-June-1 (2020-06-02) | |
| 2021 | TOP-5 + bottom-5 | NBC Sports Philadelphia (https://www.nbcsportsphiladelphia.com/nfl/philadelphia-eagles/how-the-eagles-wound-up-with-50-million-in-dead-money/189838/) | after final cuts (2021-09-06) | |
| 2022 | FULL 32 | ProFootballRumors Jul 5 2022 (https://www.profootballrumors.com/2022/07/nfl-teams-with-most-dead-cap) | pre-season | |
| 2023 | FULL 32 | ProFootballRumors Jul 14 2023 (https://www.profootballrumors.com/2023/07/2023-nfl-dead-money-by-team) | training camp | |
| 2024 | FULL 32 | ProFootballRumors Nov 27 2024 (https://www.profootballrumors.com/2024/11/2024-nfl-dead-money-by-team) | final third of season | |
| 2025 | FULL 32 | ProFootballRumors Dec 17 2025 (https://www.profootballrumors.com/2025/12/2025-nfl-dead-money-by-team) | 3 weeks left | |

Why 2013–19 is empty isn't a search failure. ESPN, citing Roster Management System, states all top-20 individual charges have come since 2019 and all top-5 team-seasons since 2022. Dead money at product-interesting scale is a post-2019 phenomenon — which is exactly why the recurring annual series start when they do.

> **REVISION 2026-07-25.** The first sentence of the paragraph above is falsified —
> 2013–2019 was a search-depth failure, not an absence of sources. The *rest* of the
> paragraph still holds and was independently re-verified: ESPN/RMS does state that
> all top-20 individual charges post-date 2019 and all top-5 team-seasons post-date
> 2022, and the recovered 2013–2019 tables confirm the order-of-magnitude difference
> (2014 league total $161.2M vs. 2015 $471.3M vs. a single 2025 team at $107.8M).

Critical finding — as-of date is load-bearing. Dead money accrues monotonically, and each year's snapshot is taken at a different point (July for 2022–23, late Nov 2024, mid-Dec 2025). Stacking them naively produces a false trend. Measured drift on the same team-season: CHI 2022 $57,643,341 preseason → $85.81M midseason → $91.8M final (+59%); ATL 2022 $63,209,124 → $78.62M → $87.6M (+38%); DEN 2024 $85.21M midseason → ~$89.1M final (+4.6%). A (team, season) key without asof_date is a bug.

The 2018 pair recovered in the 2013–2019 sweep is now the cleanest available
demonstration of this effect within a single season: the same 32 teams read
$155.2M in aggregate in March 2018 and $348.5M in July 2018 — a 2.2× swing driven
purely by measurement date. Buffalo alone moves $18.7M (Mar) → $46.71M (Jul) →
$53.66M (Oct).

Assembly recipe (2022–25, 128 rows): transcribe the four PFR lists into dead_money_team_season.csv with per-row citation (same pattern as league_cap.csv), normalize via audit/team_codes.py, overlay ESPN's season-final values as second rows rather than silently resolving the delta, add 2020/21 top-5 marked partial.

⚠️ Licensing flag: PFR's full-32 tables explicitly credit OverTheCap (2023–25) and Spotrac (2022). Press domain, facts not copyrightable, per-row citation — satisfies the letter of the constraint. But reproducing all 32 rows approaches reproducing their compilation. Safer tier: ESPN's top-5 and Corry's top-3/4 team columns are editorially transformed, and ESPN sources to Roster Management System (the league's own system, not OTC/Spotrac). Recommend legal review before shipping verbatim full-32.

## 3. Marquee ledger — verified

Core table: ESPN via Roster Management System (https://www.espn.com/nfl/story/_/id/39665413/what-dead-money-largest-nfl-salary-cap-hits-ever-player-team) (Mar 6 2024, retrieved via Wayback) — cleanest provenance found. Canonical definition, per Dan Graziano: "A dead money charge is a charge on an NFL team's salary cap for a player who is no longer on the roster. It represents any remaining signing bonus proration that was not accounted for prior to the player's release or trade. It is not a cash payment..."

Top charges (total basis): Tagovailoa/MIA $99.2M (2026–27, $55.4M/$43.8M) · Wilson/DEN $85M (2024–25, $53M/$32M) · Jones/NYG $69.315M ($47.105M/$22.21M) · Murray/ARI $54.7M (2026) · Ryan/ATL $40.525M (2022) · Rodgers/GB $40.3M (2023) · Brady/TB $35.104M (2023–24, ~$10.78M/~$24.32M) · Samuel/SF $34.107M (2025) · Wentz/PHI $33.82M (2021) · Lattimore/NO $31.66M (2025) · Diggs/BUF $31.096M (2024) · L.Williams/NYG $26.9M (2023) · Wilson/SEA $26M (2022) · Goff/LAR $24.7M (2021) · Mack/CHI $24M (2022) · Dareus/BUF $23.94M (2017–18) · Donald/LAR $23.83M (2024) · Julio Jones/ATL $23.25M (2021–22) · Brees/NO $22.65M (2021–22) · Suh/MIA $22.2M (2018–19). Era anchor: A.Brown/PIT $21.12M (2019).

Top team-seasons ever (ESPN/RMS): CHI 2022 $91.8M · ATL 2022 $87.6M · HOU 2022 $81.3M · LAR 2023 $79.6M · TB 2023 $79.6M.

⚠️ Biggest landmine — published lists mix PROJECTED and ACTUAL charges. Three confirmed cases: Wilson widely published $35.4M/$49.6M is WRONG (DEN declined the $22M option bonus; actual $53M/$32M — ESPN's own RMS table and PFN carry the projection). Tagovailoa widely published $67.4M/$31.8M is WRONG (MIA exercised the option bonus pre-release; actual $55.4M/$43.8M — PFR Jul 2026 carries the initial figure). Julio Jones widely published $23.25M all in 2021 is WRONG per-season (post-June-1 trade; actual $7.75M/$15.5M — total correct, both per-season values wrong, a total-level checksum passes). Mitigation: is_actual + verified_asof on every row; prefer Corry's Oct–Dec year-end columns over March projections.

> **REVISION 2026-07-25.** Build-time re-verification of every ledger row found **two
> further projected-vs-actual defects in this section's own figures** — Brady and
> Murray. Both are corrected in `data/curated/dead_money_ledger.csv`; the
> per-row evidence is in Appendix C. The landmine count is five, not three.

## 4. League-wide totals — none published

No outlet states a league-wide dead money total for any single season. Only aggregate: $9.73B combined 2019–2025 with per-team 7-year cumulatives (Eagles $453M high, Bengals $151M low) — The Big Lead, Feb 19 2026 (https://www.thebiglead.com/nfl-dead-cap-hits-over-the-last-7-seasons-v/) — not decomposable. Corry's structural indicator: $20M+ charges rose from 3 (2022) to 8 (2024).

> **REVISION 2026-07-25.** One exception now exists. The 2015 ESPN Stats & Information
> piece states a league-wide **average** of $14.7 million per team, which multiplies
> to ~$470.4M and reconciles against the transcribed 32-team table's exact sum of
> $471,327,913 (computed average $14.73M). 2015 is the only season 2013–2025 with a
> citable league-wide figure. No other season has one, and sums computed from the
> transcribed tables are **derived, not published** — they must not be presented as
> outlet-stated totals.

## 5. Open datasets — clean dead end

Swept nflverse (all 25 release tags — contracts is the only finance asset; upstream rotc scraper doesn't touch dead money at all), PFR.com (rostered-player cap hits only, same blind spot), Kaggle, HuggingFace, data.world, academic replication data. The near-miss — Kaggle "NFL Salary Cap Spending 2013–2022", right grain/window/MIT license — is positional active-roster spend only, no dead-money bucket. The one GitHub hit with real dead money (cap-alpha/cap-alpha-protocol) is all-rights-reserved AND a Spotrac scrape — worse than the source, not a laundering path.

Structural conclusion: dead money is a derived quantity only OTC and Spotrac compute, and neither licenses it. Unexplored Phase-1 option: derive it in-house from nflverse contracts (unamortized bonus proration at separation × transaction dates), sidestepping licensing entirely.

## 6. Recommendation

Ship: (A) marquee ledger — strongest asset, RMS provenance, ship top-20 + top-5 team-seasons with is_actual flags; (B) per-team-season 2022–25 with as-of date rendered next to the figure, and no connecting line in time-series charts — these are four differently-timed snapshots, not a series; (C) definitions page using the Graziano quote verbatim.

Degrade: 2020–21 → 5-row "biggest hits" leaderboard, never a 32-team view with 27 blanks. 2013–19 → no per-team view at all; show era anchors (Dareus, Suh, Romo, Brown) plus an honest note that pre-2020 charges were an order of magnitude smaller and untracked. League-wide → only the $9.73B aggregate with its 7-year framing intact.

One-line promise: Dead money by team is available for 2022–2025 as dated snapshots, with the biggest individual charges in league history verified back to 2017; team-level figures before 2020 are not published by any clean-terms source.

> **REVISION 2026-07-25.** The degrade plan for 2013–19 and the one-line promise are
> both superseded. Per-team views are now supportable for 2014, 2015, 2017, 2018 and
> 2019 subject to the timing caveats in §2 and the licensing tiers in Appendix A.
> Revised one-line promise: *Dead money by team is available for 2014, 2015 and
> 2017–2025 as individually dated snapshots — never as a connected time series — with
> the biggest individual charges in league history verified back to 2017.*

---

# Appendix A — Licensing tiers (required reading before public shipping)

Dead money is a **derived** quantity. Only OverTheCap and Spotrac compute it at
scale, and neither licenses it. Every figure in `dead_money_team_season.csv`
therefore traces back to one of a small number of compilers, and the risk is not
copyright in the *facts* (facts are not copyrightable) but in reproducing a
compiler's **selection and arrangement** — a full 32-row table is close to the
whole compilation.

CSV cannot carry a header comment row, so the tier assignment lives here.

| Tier | Rows | Compiler credited | Assessment |
|---|---|---|---|
| **SAFE — league-official** | 2014 full-32; 2015 full-32; ESPN/RMS season-final rows (CHI/ATL/HOU 2022, LA/TB 2023) | ESPN Roster Management System / ESPN Stats & Information | RMS is the league's own contract system, not OTC/Spotrac. Editorially transformed. **Cleanest tier — ship first.** |
| **SAFE — editorially transformed** | 2013 top-5; 2016 top-4+bottom-4; 2018-10 3 teams; 2019-05 top-8+bottom-6; 2020 top-5; 2021 top-5+bottom-5 | Corry/NFP, The Comeback, CBS, Forbes, NBC | Partial selections written as prose analysis, not reproduced tables. Low risk. |
| **REVIEW — Spotrac-derived** | 2017 full-32; 2022 full-32 | Spotrac (PFR 2022 credits "h/t Sportrac"; the CBS mirror of the 2017 USA TODAY piece credits Spotrac the same day) | Full-32 reproduction of a Spotrac compilation. **Legal review required.** |
| **REVIEW — OTC-derived** | 2018 full-32 ×2; 2019 full-32; 2023, 2024, 2025 full-32 | OverTheCap (theScore: "courtesy of Over the Cap"; PFR 2024/25 credit OTC; the 2018-03 theScore piece credits "NFL Players Association and Over The Cap") | Full-32 reproduction of an OTC compilation. **Legal review required.** |

Operational rule: the SAFE tiers are shippable now. The REVIEW tiers are staged in
the CSV with per-row `source_url` so they can be withheld by a single filter on
`asof_date`/`source_url` if counsel objects. Do not ship a REVIEW-tier full-32
table without sign-off.

Corroboration note: several REVIEW-tier rows are independently corroborated by
SAFE-tier rows for the same team-season (e.g. CHI 2022, ATL 2022, TB 2023, LA 2023
appear in both PFR and ESPN/RMS at different as-of dates). Those team-seasons could
be shipped from the SAFE row alone if the REVIEW tier is withheld.

# Appendix B — Coverage-map changelog

The original §2 coverage map, as written by the sourcing investigation and before
the 2013–2019 sweep, read:

| Year | Coverage | Source | As-of |
|---|---|---|---|
| 2013–15 | NONE | — | — |
| 2016–18 | ISOLATED | scattered single-team mentions | varies |
| 2019 | players only | CBS/Corry top-12 individual | Oct 2019 |
| 2020 | TOP-5 | NBC Sports Boston | post-June-1 |
| 2021 | TOP-5 + bottom-5 | NBC Sports Philadelphia | after final cuts |
| 2022 | FULL 32 | ProFootballRumors Jul 5 2022 | pre-season |
| 2023 | FULL 32 | ProFootballRumors Jul 14 2023 | training camp |
| 2024 | FULL 32 | ProFootballRumors Nov 27 2024 | final third of season |
| 2025 | FULL 32 | ProFootballRumors Dec 17 2025 | 3 weeks left |

Rows changed: 2013 NONE → TOP-5; 2014 NONE → FULL 32; 2015 NONE → FULL 32;
2016 ISOLATED → TOP-4+bottom-4; 2017 ISOLATED → FULL 32; 2018 ISOLATED → FULL 32 ×2
plus a partial; 2019 "players only" → FULL 32 plus a partial. 2020–2025 unchanged.

## Transcription QA — checksums computed at build time

Every recovered full-32 table was verified against an independently stated total or
extreme before being written to the CSV.

| Table | n | Computed sum | Independent check | Result |
|---|---|---|---|---|
| 2014 ESPN/RMS | 32 | $161,159,908 | stated $161,159,908; Panthers $17,840,241 high, Jets $48,958 low | **exact match** |
| 2015 ESPN S&I | 32 | $471,327,913 | stated $471,327,913; article states avg $14.7M (computed $14.73M); Saints $32,482,518 high, Bengals $2,398,947 low | **exact match** |
| 2017 USA TODAY | 32 | $236.03M | expected ~$236.0M; Chargers $21.84M high, Raiders $55K low | **match** |
| 2018-07 theScore | 32 | $348.47M | expected ~$348.5M; Bills $46.71M high | **match** |
| 2018-03 theScore | 32 | $155.23M | expected ~$155.2M | **match** |
| 2019-03 theScore | 32 | — | Cardinals $16.39M high | **match** |
| 2022 PFR | 32 | — | CHI $57,643,341 / ATL $63,209,124 vs. prior probe file | **exact match** |
| 2023 PFR | 32 | — | TB $75.32M / LA $74.23M / CIN $593K vs. prior probe file | **exact match** |
| 2024 PFR | 32 | — | DEN $85.21M vs. prior probe file | **exact match** |
| 2025 PFR | 32 | — | NO $107.83M / SF $103.77M vs. prior probe file | **exact match** |

Recovery notes. The 2014 ESPN table is stripped from the live page and from default
Wayback renderings; it survives only at the `id_` raw-capture URL. Its San Francisco
row carries no team-name text node in the archived HTML and was recovered by
elimination (all 31 other franchises present; the orphan row is TEAM CAP
$121,006,338 / DEAD MONEY $1,934,689) — the exact-sum checksum confirms the
assignment. The 2017 USA TODAY entry for the Giants is printed without a dollar sign
in the source ("24. Giants: 3.09M") and is transcribed as $3.09M. The 2015 ESPN page
returns an empty body to direct fetches and was recovered from Wayback.

Date correction: an automated read of the 2018-07 theScore article reported
"August 2018"; the page's own `datePublished` metadata is `2018-07-14T22:28:55.000Z`,
which is the date used in the CSV.

# Appendix C — Ledger verification log (build-time re-verification)

Every row of `dead_money_ledger.csv` was re-verified against primary press sources
at build time. The ESPN/RMS core table was recovered in full from Wayback and its
top-20 "Highest Dead Money Charges, By Year" table and top-5 team-season list both
reproduce exactly as quoted in §3.

**Confirmed as written (no change):** Ryan/ATL $40.525M 2022 · Rodgers/GB $40.3M 2023
· Wentz/PHI $33.82M 2021 · L.Williams/NYG $26.9M 2023 · Wilson/SEA $26M 2022 ·
Goff/LA $24.7M 2021 · Mack/CHI $24M 2022 · A.Brown/PIT $21.12M 2019 (all present in
the ESPN/RMS by-year table) · Samuel/SF $34,106,705 2025 and Lattimore/NO
$31,661,837 2025 (Corry, CBS, 2025-12-03, exact to the dollar) · Diggs/BUF $31.096M
2024 · Jones/NYG $69.315M split $47.105M 2024 / $22.21M 2025.

**Landmines confirmed as already-corrected in §3 (3 of 5):**

1. **Wilson/DEN.** ESPN's own RMS table, recovered in full, carries the projection —
   ranks 1 and 4 read "Russell Wilson, Broncos, 2025, $49.6 million" and "Russell
   Wilson, Broncos, 2024, $35.4 million", asterisked "*Wilson's cap charges will
   become official at the start of the league year". Corry's 2025-12-03 CBS column
   lists the settled figure: Wilson, Broncos, **$32,000,000** for 2025. The §3
   correction to $53M/$32M is confirmed by an independent post-hoc source.
2. **Tagovailoa/MIA.** Confirmed: $99.2M total, released with a post-June-1
   designation, option bonus exercised *before* release, moving the 2026 charge from
   the widely-reported ~$67M down to **$55.4M**, with **$43.8M** in 2027.
3. **Julio Jones/ATL.** Confirmed: $23.25M was the *pre*-June-1 figure. The trade was
   executed after June 1, splitting the charge **$7.75M (2021) / $15.5M (2022)**.

**NEW landmines found at build time (2 of 5) — §3 was itself wrong:**

4. **Brady/TB — §3's split is wrong.** §3 records "$35.104M (2023–24, ~$10.78M/~$24.32M)".
   That two-year split was a *conditional* scenario contingent on Brady signing a
   nominal extension. He did not; his second retirement accelerated the entire charge
   onto the 2023 cap. Two independent confirmations: ESPN/RMS lists "Tom Brady, Bucs,
   **2023**, $35.1 million" as a single-season charge (rank 5), and the same article's
   team-season list gives TB 2023 $79.6M with "Biggest cap charge: Tom Brady, $35.1
   million". Pro Football Talk reported the decision contemporaneously ("With Bucs
   planning to take full $35.1 million cap charge in 2023"). **Ledger corrected to
   $35,104,000 in 2023 only.** Total-level checksum passes either way — exactly the
   failure mode §3 warns about for Julio Jones.
5. **Murray/ARI — §3's season assignment is wrong.** §3 records "$54.7M (2026)".
   $54.7M was the figure for a *straight* pre-June-1 release. Arizona actually
   released Murray **with a post-June-1 designation**, splitting the charge
   **$47.5M (2026) / $7.2M (2027)**. Total is right; the single-season assignment is
   wrong. **Ledger corrected.** Same failure mode again.

**Reduced-confidence rows (flagged in the CSV `notes`, not silently smoothed):**

- **Dareus/BUF $23.94M (2017–18).** Total retained from §3, but the per-season split
  could not be corroborated and press accounts conflict: one ESPN account puts the
  Bills' 2017 dead charge at ~$23.5M with ~$14.2M more in 2018 (sum ≫ $23.94M);
  another reports $10.6M (2017) + $14.2M (2018) = $24.8M. `split_by_season` is left
  **empty** rather than guessed.
- **Donald/LA $23.83M (2024).** Not in the ESPN/RMS table — Donald retired 2024-03-15,
  nine days *after* the article published. Press corroboration is approximate
  ("roughly $24 million in 2024"), and there is an additional ~$9M 2025 tail from void
  years that the single-season figure excludes. Flagged `is_actual=TRUE` but with a
  precision caveat.
- **Suh/MIA $22.2M (2018–19)** and **Brees/NO $22.65M (2021–22)** splits were recovered
  from press rather than RMS: Suh $9.1M/$13.1M and Brees $11.15M/$11.5M. Both sum
  exactly to the §3 totals, which is a meaningful check.

**Standing rule this log validates:** a total-level checksum is *not* sufficient
validation for a multi-season charge. Four of the five landmines (Julio Jones, Brady,
Murray, and arguably Tagovailoa) have correct totals and wrong per-season splits. Any
QA that reconciles only on totals will pass all four.

# Appendix D — Derivation prototype: can we compute dead money ourselves?

**Verdict: NO. Not shippable. The curated press snapshots stand alone.**

§5 closed with the one unexplored escape from the licensing problem: derive dead
money in-house from clean-terms contract data, sidestepping OTC and Spotrac
entirely. `audit/derive_deadmoney.py` tests that idea against
`historical_contracts.parquet`. It does not work.

## What was built

Accounting model: a signing bonus is paid up front but charged to the cap in equal
installments over at most five years; on release or trade every uncharged
installment accelerates at once. So

    dead_money = unamortized_signing_bonus_proration + accelerating_guarantees

A separation is detected where a player's `cols` team changes between consecutive
years; the governing contract is the latest one signed with the departed team,
with the signing team resolved from `cols` at `year_signed` (the contract-level
`team` string is unusable for multi-team deals — Wentz's 2019 Philadelphia
extension is labelled `IND/PHI/WAS`, so slash order is not signing-team-first).
Restructures are invisible in the schema and were inferred from year-over-year
jumps in `prorated_bonus`.

Three **general** estimators, no per-case tuning — each is one formula applied to
all 8,898 detected separations (7,863, or 88.4%, resolve to a governing contract):

- **M1 flat** — remaining proration = last observed rate × years left in the
  nominal window, plus unpaid guarantees.
- **M2 layered** — each inferred restructure layer amortizes over
  `min(5, years left in contract)`. Conservative; assumes no void years.
- **M3 layered-5yr** — each layer amortizes over a full five years regardless of
  contract end. Permissive; approximates void-year behaviour.

## Results

| Case | Actual | M1 flat | Δ% | M2 layered | Δ% | M3 layered-5yr | Δ% |
|---|---|---|---|---|---|---|---|
| Wilson / DEN 2024+2025 | $85.00M | $89.00M | **+4.7%** | $89.00M | **+4.7%** | $89.00M | **+4.7%** |
| Ryan / ATL 2022 | $40.52M | $24.91M | −38.5% | $24.91M | −38.5% | $56.99M | +40.6% |
| Rodgers / GB 2023 | $40.30M | $109.33M | **+171.3%** | $109.33M | **+171.3%** | $109.33M | **+171.3%** |
| Brady / TB 2023 | $35.10M | n/a | n/a | n/a | n/a | n/a | n/a — *no separation detected* |
| Wentz / PHI 2021 | $33.82M | $39.42M | +16.6% | $39.42M | +16.6% | $39.42M | +16.6% |
| Mack / CHI 2022 | $24.00M | $12.40M | −48.3% | $18.00M | −25.0% | $24.00M | **+0.0%** |
| Dareus / BUF 2017+2018 | $23.94M | $20.60M | −14.0% | $20.60M | −14.0% | $20.60M | −14.0% |
| **median abs error** | | | **27.5%** | | **20.8%** | | **15.3%** |
| **within ±15%** | | | **2/7** | | **2/7** | | **3/7** |

Team-season totals:

| Case | Actual | M1 | Δ% | M2 | Δ% | M3 | Δ% |
|---|---|---|---|---|---|---|---|
| CHI 2022 (45 separations) | $91.80M | $49.83M | −45.7% | $55.43M | −39.6% | $96.08M | +4.7% |
| ATL 2022 (25 separations) | $87.60M | $33.07M | −62.2% | $33.07M | −62.2% | $102.24M | +16.7% |

The best model, M3, lands at a 15.3% median absolute error — nominally at the
threshold, and the two team totals look tolerable (+4.7%, +16.7%). **That headline
is not trustworthy and the gate should not be read as passed.** The median is
carried by two cases that happen to land well; the distribution runs from −38.5%
to +171.3%, only 3 of 7 cases fall inside ±15%, and one case cannot be evaluated
at all. A median computed over seven points, three of which are wrong by more than
a third, is not evidence of a working model. The team totals agreeing is the
weakest signal in the table: they are sums over 45 and 25 separations in which
large positive and negative per-player errors cancel. Cancellation is not accuracy,
and it will not survive a different team-season.

## Why it fails — three structural blockers, not tuning problems

1. **The old contract's schedule is destroyed.** When a player signs elsewhere, the
   new team's schedule overwrites the future years of `cols` — and those future
   years *are* the dead money. Wilson's Denver rows for 2024–25 simply become
   Pittsburgh and New York rows. The quantity being derived has been overwritten
   by the time we look for it.
2. **Restructures are invisible and unattributable.** This is what destroys the
   Rodgers case. Green Bay's observed 2022 proration of $27.33M is the *stacked*
   residue of layers created in 2018, 2019, 2021 and 2022, each with its own
   remaining life. With no restructure events in the schema, any estimator must
   guess how to split that figure across layers. Treating it as one fresh 5-year
   window gives $109.33M against an actual $40.30M — a 171% overshoot from a single
   unresolvable ambiguity. The same ambiguity is why Ryan swings from −38.5% (M2)
   to +40.6% (M3) on nothing but a change in assumed layer life.
3. **No transaction dates, so no post-June-1 logic.** Whether a charge lands in one
   season or splits across two is a function of the transaction date, which the
   dataset does not carry. Every multi-season charge in the ledger — five of the
   twenty-one rows, including all five landmines — is therefore unsplittable by
   construction. Even a perfect total would be assigned to the wrong seasons, which
   Appendix C establishes is the single most common way these figures go wrong.

Void years compound all three: they extend proration past the nominal contract end
by an amount the data never states.

## Route R — the one thing that does work, and why it doesn't help

There is a narrow exception. The overwrite in blocker 1 only happens if the player
signs somewhere else. For a player who **retires**, the career table is never
overwritten, and OTC leaves the accelerated charge sitting in `cap_number` on a
season with no base salary. The signature is
`base_salary == 0 AND cap_number > 0 AND prorated_bonus > 0`.

Tom Brady, TB 2023: direct read **$35,104,000** against a published $35,104,000 —
exact to the dollar, **0.0% error**, and not a derivation at all but a direct read
carrying no model error. It is also why Brady shows as "no separation detected"
above: he never changed teams, so the team-change detector cannot see him.

This route matches **14 rows for 14 players across the entire file** — 0.2% of the
8,898 separation events. It cannot see a single trade or release, which is where
essentially all dead money is created. It is a curiosity, not a data asset.

## Recommendation

Do not ship derived dead money. Do not present M3's 15.3% median as a passing
grade; the dispersion and the Rodgers case make it unusable, and the team-total
agreement is error cancellation rather than accuracy.

The blockers are properties of the source, not of the estimator — no amount of
model work recovers a schedule the file no longer contains. Revisiting this would
require a source that carries signing-bonus amounts, restructure events and
transaction dates. nflverse contracts carries none of the three, and §5 established
that no openly licensed source anywhere does.

The curated assets stand alone: `dead_money_ledger.csv` (21 press-verified
individual charges) and `dead_money_team_season.csv` (370 dated team-season
snapshots). Both remain subject to the Appendix A licensing tiers.

Reproduce with `python3.11 audit/derive_deadmoney.py`. Staging outputs:
`deadmoney_derived_estimates.csv` (7,863 scored separations),
`deadmoney_derivation_scorecard.csv`, `deadmoney_derivation_team_scorecard.csv`,
`deadmoney_direct_read.csv`.
