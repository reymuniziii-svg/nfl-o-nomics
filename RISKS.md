# RISKS.md — YIELD/YARD

Ranked by expected damage. Written 2026-07-25. Referenced from `BUILD_PLAN.md`; numbers are
imported from `DATA_AUDIT.md`, `CAPPLUS_MEMO.md` and the findings files, not recomputed.

**Likelihood** and **impact** are High / Medium / Low. **Owner** is the person who can actually
move it.

---

## The register

| # | Risk | Likelihood | Impact | Owner |
|---:|---|---|---|---|
| 1 | Dead-money REVIEW-tier licensing withheld | Medium | **Critical** | Rey (licensing), engineering proceeding on defaults |
| 2 | Team logo IP takedown | Low | High | Engineering |
| 3 | ShareAlike photo derivative-work exposure | Medium | High | Rey (licensing), engineering proceeding on defaults |
| 4 | λ=1.5 public defensibility | Medium | Medium | Rey + Engineering |
| 5 | Timeline compression | **High** | Medium | Rey |
| 6 | nflverse schema drift / release timing | Medium | Medium | Engineering |
| 7 | Vercel Hobby non-commercial term | Low | Medium | Rey |
| 8 | Design-track file access blocked | **High (live now)** | High | **Rey** |
| 9 | Coaching name-string join fragility | Medium | Medium | Engineering |
| 10 | As-of snapshot misuse in future features | Medium | High | Engineering |
| 11 | Squadron Black licence cost unknown | Medium | Low | Design track |
| 12 | Single-maintainer bus factor | Medium | Medium | Rey |

---

### 1. Dead-money REVIEW-tier licensing — **the existential one**

Dead money is a derived quantity that only OverTheCap and Spotrac compute at scale, and neither
licenses it. The facts are not copyrightable; the exposure is in reproducing a compiler's
selection and arrangement, and a full 32-row table approaches the whole compilation. Rows are
tiered in `DATA_AUDIT.md` §5: SAFE-league-official 69 rows, SAFE-editorially-transformed 45,
REVIEW-Spotrac 64, REVIEW-OTC 192.

**If the REVIEW tier is withheld, full-32 coverage survives for 2014 and 2015 only.** 2017,
2024 and 2025 drop to **zero** teams; 2018 drops to 3, 2019 to 14, 2022 to 3, 2023 to 2. Seven
of the nine Cap+ seasons — including both most recent seasons — depend on REVIEW-tier rows.
**Cap+ would ship on two seasons, one of which (2014) is near content-free.**

**Status 2026-07-25 — owner Rey (licensing), engineering proceeding on defaults.** Gate #3
instance 3 ruled: build with full REVIEW-tier data, `DEAD_MONEY_TIER` stays wired so a reversal
is a config flip, Rey owns the legal conversation, Aug 22 checkpoint stands. **The Medium /
Critical rating is unchanged and stands until licensing concludes.**

**Mitigation, in order:**

1. **Legal review, started this week.** It has the longest lead time of anything on the plan
   and it is the only item whose clock we do not control. Needed by Aug 22
   (`BUILD_PLAN.md`).
2. **SAFE-tier-only fallback rendering plan, built regardless of the outcome.** The
   `license_tier` column on `dead_money_team_season` (`SPEC.md` §7.5) and the
   `DEAD_MONEY_TIER ∈ {SAFE_ONLY, ALL}` seed flag exist so this is a configuration change on
   the day, not a rebuild. Under `SAFE_ONLY`: Cap+ renders for 2014 and 2015; the other seven
   seasons take the same blank treatment as 2013/2016/2020/2021 with their own reason string;
   the marquee ledger (ESPN/Roster Management System provenance) is unaffected and becomes the
   primary dead-money surface; the team page leads with cost-per-win and the three-lens summary
   instead. **The product still works. It is smaller and it is honest.**
3. **Several REVIEW rows are independently corroborated by SAFE rows** for the same
   team-season — CHI/ATL 2022, LA/TB 2023 — and can ship from the SAFE row alone.
4. **A paid OTC or Spotrac licence is a v2 line item**, not a v1 expense against the $200
   ceiling.

**Not a mitigation:** in-house derivation. It was built and rejected — a three-estimator
prototype scored against seven known charges returned a best-model 15.3% median absolute error
with a distribution running −38.5% to **+171.3%**, and only 3 of 7 cases inside ±15%. Separately,
five inference routes and eight further high-profile separations returned zero rows, 8 of 8.
There is no field, flag or residual that recovers it (`audit/findings_deadmoney_sourcing.md`
Appendix D).

---

### 2. Team logo IP — takedown response plan, verbatim

Official team logos are self-hosted from the nflverse `teams_colors_logos` URLs. This is
standard practice for editorial sports products and the risk is low, but the response must be
mechanical, not improvised.

**On receipt of a takedown notice, in this order, same day:**

1. **Flip the `TEAM_LOGOS_ENABLED` kill-switch flag to false.**
2. **Purge the self-hosted assets** from the origin.
3. **Invalidate the CDN cache.**
4. **Fallback chips render product-wide** — team abbreviation on the team's primary colour,
   glyph colour computed black-or-white by relative luminance.

**No redesign is required and no page breaks.** The fallback chip is built and tested in Phase
2, not written in response to a notice. Because 15 of 36 colour rows have primary/secondary
contrast below 3.0 and 6 are below 2.0, the glyph colour is computed rather than taken from the
secondary colour — worst case 4.66, all ≥ WCAG AA.

Rehearse it once in Phase 3: flip the flag in preview, confirm every route still renders, flip
it back.

---

### 3. ShareAlike photo derivative-work question

**48.0% of usable photos (117 of 244) are CC BY-SA.** A colour-treated, cropped or recomposited
photo is a **derivative work**, and ShareAlike obliges the derivative to carry the same licence
— which for a commercial product means the treated asset arguably has to be offered CC BY-SA.
This was invisible until the image audit; the naive read is "it's all Creative Commons, we're
fine."

**Rey ruled 2026-07-25 — option (a)** (`SPEC.md` §5.2, OPEN DECISION 2). **Owner: Rey
(licensing), engineering proceeding on defaults; the Medium / High rating is unchanged and
stands until licensing concludes.** The three options as they were put to him:

- **(a) CSS-filter-only treatment over an unmodified source — the compliant middle path, and
  the recommended one.** The pipeline stores and serves the original file exactly as Commons
  published it; the treatment is applied by the browser at render time via CSS filters. **No
  new fixed derivative work is ever created or distributed**, so the ShareAlike obligation on
  derivatives is never triggered — we are redistributing the original under its own terms with
  attribution, which every one of these licences permits. **Keeps 97.2% coverage.** The cost is
  design latitude: the treatment must be expressible as CSS, so no compositing, no baked
  masking, no per-asset retouching.
- **(b) CC BY / PD / CC0 only** — 127 photos. **Coverage collapses to 50.6%.** Almost certainly
  unacceptable.
- **(c) Accept and honour CC BY-SA on treated assets** — keeps 97.2%, with licence obligations
  attached to served assets and a compliance surface to maintain forever.

**Independent of the choice:** attribution is required on **223 of 244 (91.4%)** assets, and it
is legally load-bearing. Hiding credits behind a hover or an "info" affordance is a licence
violation for those 223. Visible credit space is budgeted in PlayerMark and `/credits` carries
the deduplicated author list. Twelve assets additionally carry a `personality` restriction —
orthogonal to copyright, and relevant precisely because this is a commercial product.

---

### 4. λ = 1.5 public defensibility

λ is not a tuning knob; it is the product's one contestable editorial choice, and a sharp
reader will find it. The brief's requirement that 2022 Atlanta "rate poorly" **passes only
because λ = 1.5**: at λ = 1, Atlanta lands 19th — better than its 24th-place performance rank —
and the requirement fails.

**Mitigation:** publish it ourselves, first, in `METHODOLOGY.md`.

- **The one-sentence economic claim:** *a dollar of dead cap costs us half again what a live
  dollar does, because it buys no player and blocks a roster spot.*
- **The λ = 1 comparison table**, published beside it, so a reader can see exactly what the
  choice does: at λ = 1 the top-3 dead-money teams move −0.63 places / −1.1 points; at λ = 1.5,
  −3.22 places / −5.5 points; at λ = 2.0, −5.33 places / −9.2 points.
- **Fallback posture, per the memo:** if we will not defend λ in public, the honest alternative
  is λ = 1 and formally striking "famous cap disasters rate poorly" from the brief. What we
  must not do is leave λ unstated and let the algebra pick it.

Two related disclosures ship day one and pre-empt the two other questions a careful reader
asks: **2024 Denver is a non-event and that is correct** ($85.2M against a $50.3M league median;
cap consumption exactly the 2024 median — publish the median next to the number), and **Cap+
cannot see mortgaged future cap**, so all-in teams are flattered.

---

### 5. Timeline compression

Six weeks from a standing start to a public push, with one week of design application and a
hard external deadline. The most likely failure is not a catastrophe; it is Phase 3 arriving
late and eating Phase 4.

**Mitigation:** the ordered cut lines in `BUILD_PLAN.md` — Value Stadium, then head-to-head,
then the player view degrades to contract-card-only. The division hero card, the Cap+
leaderboard and the team view are never cut; if they are not ready, **the date moves and the
scope does not**. Two days of deliberate slack (Sep 8–9) sit between the public push and the
opener.

The single highest-leverage act available today is unblocking risk 8.

---

### 6. nflverse schema drift / release timing

Upstream is a volunteer open-data project and it changes. Observed already: two roster
structure breaks (2002 columns 30→36; 2016 row counts ~2,057→~3,085 as DEV/CUT/RES appear and
`gsis_id` becomes unique), a 2012 snap-counts asset that returns HTTP 200 and contains zero
rows, and a `car_av` column that is 100% null while looking live.

**Mitigation:** **pin release snapshots** in `etl/pins.toml` with per-asset row counts and
checksums; never read `latest`. Bumping a pin is an explicit commit that re-runs the golden
tests. **Golden tests run in CI against the built marts** — 18 externally-verified facts at
exact tolerance for counts and ±1% for money, currently returning delta zero and $0. **Check
row counts, not HTTP status codes** — that is the whole lesson of the 2012 snaps file.

Test 16b is retained as a **negative** golden test: if Wilson's Denver dead money ever appears
in the nflverse route, that is a finding requiring a human, not a fix, and the build fails so
someone looks.

---

### 7. Vercel Hobby non-commercial term

The Hobby tier is for non-commercial use. v1 is free, open, has no accounts, no payments and no
advertising, which is squarely inside that. The risk is the moment the product monetises — the
v2 query builder is explicitly described as a paid wedge.

**Mitigation:** **Vercel Pro is a v2 line item**, budgeted when monetisation is, not before. v1
stays free and open. If anything ambiguous ships earlier (sponsorship, a tip link, a paid
newsletter), the upgrade happens first. No revenue-bearing surface goes live on Hobby.

---

### 8. Design-track file access — **blocked right now**

**This is the only risk on the register that is already happening.** Phase 3 needs two artefacts
from the parallel design track — the `--yy-*` token set plus JSON mirror, and the component +
chart anatomy specs — and neither is reachable from the build environment. **The blocker is
file access, not design work.**

**Owner: Rey.** Two ways to unblock, either is fine: **"Send to Claude Code Web"** from the
design tool, or a **direct file drop** into `design/` at repo root.

**Mitigation while blocked:** every component is built against tokens with a neutral
placeholder theme, so Phases 1 and 2 proceed at full speed and the integration is a theme swap
plus corrections. That mitigation has a shelf life: it holds until **Aug 22**, and every day
past that comes straight out of the shortest phase on the plan.

---

### 9. Coaching name-string join fragility

`coach_name` is not a safe join key. There are 435 distinct people in a surname space dense with
relatives, and the failure mode is silent: two people fused into one, or one person split into
two, with no error raised.

**Mitigation:** join on `(coach_name, season, team, role)`; use the dense-ranked surrogate
`coach_id`; **never fuzzy-match on name**. The canonicalisations already applied upstream are
load-bearing and must not be "simplified":

- **Jim E. Mora** (IND HC 2000–01) ≠ **Jim L. Mora** (SF DC 2000–03, ATL HC 2004–06, SEA HC
  2009) — father and son, **both present in 2000–2001**, the highest-risk pair in the dataset.
- **Pete Carmichael Sr.** (CLE 2000 OC) ≠ **Pete Carmichael Jr.** (NO 2009–2023 OC) — both on
  the 2000 Browns staff simultaneously. A naive merge would have fused two different people;
  the audit caught it as a latent data error.
- **Jimmy Raye II** (the coach) ≠ Jimmy Raye III (a personnel executive of the same era).
- Verified-distinct, keep separate: Gary/Klint/Klay Kubiak · Bob/Bobby Babich · Bob/Bobby
  Slowik · Norv/Scott Turner (both hold CAR 2019 OC rows) · Gregg/Blake Williams (both on the
  2012 Rams and 2018 Browns staffs) · Wade/Wes Phillips · Mike/Adam Zimmer.

Additional join hazards that break naive keys: `NONE` is a sentinel, not a person (60 rows —
filter before any coach-level aggregation); `(coach_name, season)` is not unique (Mike McCoy
holds LV 2025 OC and TEN 2025 HC); `(coach_name, season, team)` is not unique either — 33 rows
have an HC's name in an OC/DC row for the same team-season.

Structural tests assert the 436 distinct-name count and the 830 complete team-seasons, so a
silent merge fails the build.

---

### 10. As-of snapshot misuse in future features

The as-of discipline is correct in v1 by construction. The risk is a future feature — a trend
line, a "dead money over time" chart, a league-total series — that quietly joins snapshots
taken at different points in different league years and produces a confident, wrong trend.

The magnitude is not subtle: CHI 2022 reads $57.6M preseason → $85.8M midseason → $91.8M final,
+59%; the 2018 league total reads $155.2M in March and $348.5M in July, a **2.2× swing from
measurement date alone**. Roughly half of 2022 CHI/ATL's apparent punishment in the original
backtest was a measurement-date artefact — reading all 32 teams at the same date moved Atlanta
from 88.1 to 98.8, dead league average.

**Mitigation, enforced in code rather than in review:** `asof_date` and `asof_stage` are
`NOT NULL` and a null fails the build; the dead-money renderer is a dot plot and the line-chart
component throws in development if handed a dead-money series; value + date + stage render
together with no compact variant that drops the date; Cap+ resolves all 32 teams to one
snapshot per season. **The rule to carry forward: a `(team, season)` key without an `asof_date`
is a bug.**

---

### 11. Squadron Black licence cost unknown

The athletic display face is unpriced. **Mitigation:** Rajdhani substitutes until the licence
clears, the substitution is a single token value, and no layout depends on Squadron's metrics.
It sits inside approval gate #2 alongside the domain, against a $200 ceiling with $0 spent. If
the price is unreasonable, Rajdhani ships and nothing is lost but a little character.

---

### 12. Single-maintainer bus factor

One person holds the entire model of this system — the four team-code conventions, the thirteen
traps, the tier boundaries, the reasons behind each curated row.

**Mitigation: these documents are the mitigation.** `DATA_AUDIT.md` is the gate and the
evidence record; the findings files are authoritative on detail; `SPEC.md`, `ARCHITECTURE.md`
and `BUILD_PLAN.md` are executable by someone who was not here; `DECISIONS.md` records why each
choice was made so a future maintainer can tell a decision from an accident. Every curated row
carries a `source_url`; every ETL script is idempotent and re-runnable; every golden fact has
an external citation. **The test of this mitigation is whether a new engineer can rebuild the
marts from scratch without asking a question — and that test is worth actually running in
Phase 1.**

---

## Traps register

**Every engineer touching this data reads `DATA_AUDIT.md` §6 before writing a query.** Thirteen
numbered traps, each of which fails silently and plausibly, in dollars that look real. The
highest-severity one — the `cols` replication trap — inflates every team total 3–7× without
raising a single error. That register is required reading and is not summarised here, because a
summary is exactly how a trap gets missed.

---

## Cross-source contradictions found while writing these documents

Recorded rather than silently resolved.

1. **`DATA_AUDIT.md` §1 and §3.1 cite "§6, trap 12" for the rejected in-house dead-money
   derivation.** Trap 12 in §6 is the Mahomes season-final-snapshot trap; the derivation
   rejection is not in the traps register at all. The substance is correct and lives in
   `audit/findings_deadmoney_sourcing.md` Appendix D — only the cross-reference is wrong.
   (The neighbouring "§6, trap 11" citation for `cap_used_total` *is* correct.)
   **RESOLVED 2026-07-25 — trap 13.** The derivation rejection is now its own entry in the
   `DATA_AUDIT.md` §6 register (trap 13); §1 and §3.1 both cite it. Trap 12 is unchanged and
   still the Mahomes trap, so `ARCHITECTURE.md`'s "§6, trap 12" citation stays correct.
2. **Two different failure counts are easy to conflate.** The **8-of-8** figure is eight
   high-profile separations returning zero rows via five inference routes; the **7-case**
   figure is the scoring set for the rejected derivation prototype (3 of 7 inside ±15%). They
   are different tests. Any single-line summary saying "validated 8-case failure" for the
   derivation is imprecise; the derivation was scored on seven.
3. **`CAPPLUS_MEMO.md` §5 says "only 2014 and 2015 are SAFE."** `DATA_AUDIT.md` §5 shows SAFE
   rows also exist in 2013, 2016, 2018, 2019, 2020, 2021, 2022 and 2023 — they just do not
   reach full-32. Both statements are true about different things (full-32 coverage vs. row
   existence); the memo's compression reads as though no SAFE rows exist elsewhere. Use the
   `DATA_AUDIT.md` table when reasoning about the fallback, and note that 2022/2023 retain
   SAFE-tier season-final rows that the memo's phrasing would hide.
   **RESOLVED 2026-07-25 — memo.** `CAPPLUS_MEMO.md` §5 now reads "only 2014 and 2015 reach
   full-32 coverage from SAFE-tier rows alone" and names the eight other seasons carrying
   SAFE rows. The recommendation, the conditions and every figure are unchanged.
4. **`CAPPLUS_MEMO.md` §3.3 flags its own source conflict** and it is carried here: the
   backtest's §7.1 says seven marquee sniff cases are unscoreable, while its own table marks
   2013 OAK unscoreable too — the correct count is **eight**.
   **RESOLVED 2026-07-25 — backtest.** `audit/findings_capplus_backtest.md` §7.1 and §7.2 now
   say eight and list 2013 OAK, each with a parenthetical recording the correction. The memo's
   own flag is left standing above as the historical record of who caught it.
5. **`audit/findings_deadmoney_sourcing.md` §6 contains superseded text** ("team-level figures
   before 2020 are not published by any clean-terms source", and the 2013–19 degrade plan),
   explicitly overridden by the REVISION note in that file. It must never be quoted; the live
   coverage statement is `DATA_AUDIT.md` §5.
   **RESOLVED 2026-07-25 — banner.** §6 now opens with a SUPERSEDED banner naming the
   2013–2019 press sweep and the curation pass, and directing readers to the Appendices and
   `data/curated/*`. The superseded text is preserved beneath it, not deleted.
