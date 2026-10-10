# BUILD_PLAN.md — YIELD/YARD

**Dated backward from the 2026 season opener, Thursday 10 September 2026.** Written
2026-07-25. What gets built is in `SPEC.md`; how, in `ARCHITECTURE.md`; what can go wrong, in
`RISKS.md`.

```
 Jul 26 ─────────── Aug 7 ─────────── Aug 21 ── Aug 28 ──── Sep 4 ── Sep 7 ──── Sep 10
   │  PHASE 1        │   PHASE 2        │ P3      │  PHASE 4  │  PHASE 5 │        │
   │  ETL + marts    │   app + views    │ design  │  soft     │  fixes + │        │
   │  + Neon seed    │   (neutral)      │ applied │  launch   │  public  │      OPENER
   │  COMPLETE       │   COMPLETE       │ DONE    │           │          │        │
                                        ▲
                              DESIGN INTEGRATION POINT
                              ← PASSED 2026-07-26
```

Everything is dependency-ordered. A phase does not start on its date; it starts when its
predecessor's exit criteria are met. The dates are the commitment.

---

## Status — 2026-10-10

**v2 is merged to `main` and live at nfl-o-nomics.vercel.app** (PR #2). Since the 2026-07-26 status
below: the Vercel project exists and deploys from `main` (PGlite seeded at build, no Neon); gate #1
was **reopened on evidence** (`CAPPLUS_MEMO.md` §8, DECISIONS 100–107) and the `capplus_context`
mart ships beside an unchanged `capplus_official`; two Opus design reviews (`design/reviews/`) drove
the v2 surfaces: verdict-first team page, roster receipt, OG share cards, league Field with Review
control, frontier scatter, compare as a diverging dot plot. **Still Rey's:** the α = 0.5 ruling on
Cap+ (obligation); the domain (gate #2); the dead-money licensing conversation (gate #3); gate #4,
the public push. Phase 4's soft-launch circle has not been assembled.

## Status — 2026-07-26

**Phases 1, 2 and 3 are complete, roughly a month ahead of the schedule above.** The dates in
this document are left exactly as written on 2026-07-25; they are the commitment that was made,
and the record of a plan is worth more than a plan retconned to match its outcome.

| Milestone | Status |
|---|---|
| **PHASE 1** — ETL + marts + seed | **COMPLETE 2026-07-26** |
| **PHASE 2** — app + four views | **COMPLETE 2026-07-26** |
| **DESIGN INTEGRATION POINT** | **PASSED** — Phase B delivered *and applied* |
| **PHASE 3** — design application, a11y AA, screenshot variants | **COMPLETE 2026-07-26** |
| **PHASE 4** — soft launch | not started — gated on Rey-side items below |
| **PHASE 5** — fixes + public push | not started — gated on gate #4 |

**Everything remaining before Phase 4 is Rey-side.** Nothing on this list is engineering work,
and nothing engineering can do unblocks any of it:

1. **Neon provisioning + `DATABASE_URL`.** The schema, the seed program and the query layer are
   built and running; the swap is one environment variable (`web/README.md`).
2. **Vercel project + deploy.** The app builds locally to 1,168 static units; no project exists
   to deploy it to.
3. **Domain purchase — gate #2.** ~$15/yr, and now that gate's **only** spend: the font line
   went to $0 (`DECISIONS.md` 89).
4. **The dead-money licensing conversation — gate #3, instance 3.** Owner: Rey. **The Aug 22
   checkpoint stands.**
5. **The soft-launch feedback circle.** Assembling it is Rey's.
6. **Gate #4** for the public push.

**Local verification stands in for deploy verification until a Vercel project exists** — the
production build, both themes, both canvases and the Playwright assertion suite all run against
the local build (`web/README.md`), and the first deploy re-runs them against the real origin.

---

## Approval gates

Four gates sit across this plan — the four the product brief defines, and only those four: the
**Cap+ formula**, **anything that costs money**, the **IP/asset posture**, and the **production
launch**. Gates 1, 2 and 4 are Rey's; gate 3 is Rey's and legal's together. Nothing else on this
plan is an approval gate.

> ### GATE #1 — Cap+ formula
> **CLEARED 2026-07-25.** Rey approved the `CAPPLUS_MEMO.md` §7 build; it is the shipping
> formula and the render block below is lifted. Promotion to `capplus_official` still runs in
> Phase 1.
> **Blocks: any Cap+ value rendering anywhere.** Rey approves the formula in
> `CAPPLUS_MEMO.md` §7, or sends it back. Until it clears, the Cap+ component is built against
> `capplus_candidates.csv` in development only, `capplus_official` is not promoted, and the
> league leaderboard renders **Team Rating** under its own name.
> **Needed by: end of Phase 1 (Aug 7).** A rejection after Aug 21 costs the flagship metric
> its launch slot; a rejection during Phase 1 costs a week.

> ### GATE #2 — Domain + font licence
> **Blocks: production DNS and the Squadron Black type token.** Domain ~$15/yr; Squadron Black
> price TBD by the design track. Total spend to date is $0 against a $200 ceiling.
> **Needed by: start of Phase 4 (Aug 28)** for the domain — a soft launch on a
> `*.vercel.app` URL is acceptable but a public push is not. Font can land any time before
> Phase 5; Rajdhani substitutes until it does and the swap is one token value.

> ### GATE #3 — IP/asset posture
> **Rey ruled 2026-07-25: proceed on all three instances; licensing handled by Rey personally
> (owner: Rey). Engineering proceeds with the defaults below; every default is a one-line
> config reversal if licensing review changes the answer.**
>
> **The brief's third gate — any change to the IP or asset posture.** It carries three open
> instances: the two image decisions, and the dead-money REVIEW-tier sign-off folded in below.
>
> **Instances 1 and 2 — the image decisions (Rey; decision 2 needs legal input).**
> **Blocks: the PlayerMark treatment implementation and the resolution-floor branch.** Rey
> settles **OPEN DECISION 1 — image resolution floor** (no floor → 97.2% coverage / 2.8%
> fallback; 300px floor → 93.6% / 6.4%; 600px floor → 77.3% / 22.7%) and **OPEN DECISION 2 —
> ShareAlike derivative works** (48.0% of usable photos, 117 of 244, are CC BY-SA; option (a)
> CSS-filter-only keeps 97.2%, (b) CC BY/PD/CC0 only collapses to 50.6%, (c) accept CC BY-SA
> keeps 97.2%). Both are stated in `SPEC.md` §5.2 and `DATA_AUDIT.md` §5.
> **Needed by: start of Phase 3 (Aug 22)**, when the treatment step is implemented
> (`ARCHITECTURE.md` §5). Neither blocks Phases 1–2: `IMAGE_MIN_WIDTH_PX` is a config constant
> and the treatment is written as a configuration branch, so either answer is a one-line change
> (`DECISIONS.md` 49).
> **DECIDED 2026-07-25 — instance 1 (resolution floor):** ship at `IMAGE_MIN_WIDTH_PX = 300`
> (93.6% coverage / 6.4% fallback) as the default.
> **DECIDED 2026-07-25 — instance 2 (ShareAlike):** option (a), the recommended one in
> `RISKS.md` risk 3 — CSS-filter-only treatment, keeping 97.2% coverage, the original file
> served untransformed with attribution.
>
> **Instance 3 — dead-money REVIEW tier (legal).**
> **Blocks: Phase 3 shipping dead-money views for recent seasons.** Without sign-off on the
> REVIEW tier, full-32 dead-money coverage survives for **2014 and 2015 only**; 2017, 2024 and
> 2025 drop to **zero** teams, 2018 to 3, 2019 to 14, 2022 to 3, 2023 to 2. Seven of the nine
> Cap+ seasons — including both most recent seasons — depend on REVIEW-tier rows.
> **Needed by: start of Phase 3 (Aug 22).** This is the highest-impact open item in the
> project; see `RISKS.md` risk 1 for the fallback rendering plan.
> **Start the legal conversation this week.** It is the only item on this plan whose lead time
> is outside our control.
> **DECIDED 2026-07-25 — instance 3 (dead-money REVIEW tier):** build with full REVIEW-tier
> data; the `DEAD_MONEY_TIER` flag stays wired so a licensing reversal is a config flip. Rey
> owns the legal conversation; the Aug 22 checkpoint stands.

> ### GATE #4 — production launch
> **Blocks: the Phase 5 public push (Monday Sep 7).** Rey gives the go. It does **not** block
> the Phase 4 soft launch, which ships to the feedback circle only — real domain under gate #2,
> no public posting, no social, no press.
> **Needed by: Sep 7.** The deliberate Sep 8–9 slack sits between the push and the opener.

---

## PHASE 1 — ETL hardening, marts finalisation, Neon seed
**Jul 26 → Aug 7 (2 weeks).** No dependencies. Starts immediately.

> **COMPLETE 2026-07-26.** All items below shipped. 20 marts built by `etl/`, byte-stable across
> two independent cold runs; 182 tests green (golden + structural + contract); `capplus_official`
> promoted. **Neon is the one exception and it is Rey's** — the seed program is built and runs
> against PGlite locally, and provisioning is the `DATABASE_URL` swap in the Status block above.

1. **Stand up `etl/`** by promoting the audit scripts per `ARCHITECTURE.md` §4. `audit/` stays
   as the evidence record and is not deleted.
2. **`etl/team_codes.py` as the single shared normalizer**, with `PFR_DRAFT_TEAM_MAP` and
   `NICKNAME_TO_CODE` in the same module. Imported everywhere, copied nowhere.
3. **Pin the nflverse release tags** into `etl/pins.toml` with per-asset row counts and
   checksums.
4. **New marts, built to `SPEC.md` §7:**
   - `team_season_stability` + `regime_events` — the Stability Index (`SPEC.md` §2.8). New
     code; the largest single build item in this phase.
   - `draft_pick` + `draft_class_summary` — Fitzgerald–Spielberger chart values, `car_av`
     excluded.
   - `player_season_cap`, `player_season_availability`, `position_allocation`.
   - `player_images` — re-run the image pipeline with `share_alike` and `last_verified_at`
     added.
   - **`license_tier` added to `dead_money_team_season`**, derived deterministically from
     `source_url`. This is the mechanism the legal contingency depends on and it must exist
     before Phase 3 regardless of how legal resolves.
5. **`capplus_official` promotion path** wired and tested; no longer held — gate #1 cleared
   2026-07-25.
6. **Idempotency + byte-stable re-run** verified on every script (`ARCHITECTURE.md` §4.3).
7. **Golden tests in CI** — all 18 from `DATA_AUDIT.md` §3 at their stated tolerances, plus
   test 16b as a negative golden test, plus the 11 structural tests.
8. **Neon provisioned**, Drizzle schema written from `SPEC.md` §7, seed program built, marts
   seeded to the `dev` branch, post-seed structural assertions green.

**Exit criteria.** Every mart in `SPEC.md` §7 exists with the specified columns and row counts;
CI is green on golden + structural + byte-stability; a seeded Neon `dev` branch answers every
query the four views need. **Gate #1 cleared 2026-07-25**, ahead of the Aug 3 request deadline.

---

## PHASE 2 — App scaffold, URL schema, data layer, neutral-theme components, four views
**Aug 8 → Aug 21 (2 weeks).** Depends on Phase 1 marts (not on Phase 1 being fully polished —
the schema is enough to start against).

> **COMPLETE 2026-07-26.** All eight route shapes live, all four views rendering real data with
> real coverage behaviour, `Metric<T>` data layer, CSV export on every tabular surface, chart
> primitives built. **1,168 static units**; `npm run lint` and `tsc --noEmit` both clean.

1. **Scaffold** Next.js App Router + TypeScript on Vercel; local, preview and prod
   environments per `ARCHITECTURE.md` §8.
2. **URL schema implemented in full on day one** (`SPEC.md` §6) — all eight route shapes, the
   861 + 251 + 32 + 8 static params, the legacy-code 301s, and the era-correct identity resolution
   for moved franchises. **These URLs are permanent; getting them right now is cheaper than a
   redirect table later.**
3. **Data layer** — Drizzle queries behind a typed `Metric<T>` API (`SPEC.md` §1.2). Every
   accessor returns `value | blank | partial`, never a bare null. This is the layer that makes
   the never-silently-partial rule structural rather than aspirational.
4. **Token layer + neutral placeholder theme** — every component built against `--yy-*` custom
   properties from the first commit. Zero hardcoded colours, fonts, radii or spacing.
5. **The four views**, wireframe-complete against the neutral theme (`SPEC.md` §3):
   Home/Division · Team · Player · Head-to-head. Real data, real coverage handling, real blank
   states, unstyled.
6. **CSV export** on every tabular surface, with the header comment block.
7. **Chart primitives** in their generic form — axes, the dot-plot-not-line dead-money
   renderer, the diverging allocation bars, the stability track. Anatomy comes in Phase 3;
   correctness comes now.

**Exit criteria.** All four views render every route from seeded data with correct coverage
behaviour; the zero-win rule, the four Cap+ blanks, the 2013 break and the as-of discipline are
all live and testable; the app is deployable to preview. It will look plain. That is the plan.

---

## ✅ DESIGN INTEGRATION POINT — **PASSED 2026-07-26**
**Needed by: Aug 22 (start of Phase 3). Owner: Rey.**

> **PASSED 2026-07-26.** Both artefacts landed via a direct file drop into `design/` and were
> **applied**, not merely received: `design/system/tokens.css` + `tokens.json` (241 token names,
> 352 declarations, mirror generated and asserted by `verify_tokens.py`), plus the component and
> chart anatomy specs (`COMPONENTS.md`, `CHART_ANATOMY.md`, `TYPE.md`, `MOBILE_PATTERNS.md`,
> `SCREENSHOT_VARIANTS.md`, `CAPPLUS_LOCKUP.md`). Every divergence, open question and conflict is
> ruled in `design/system/RESOLUTIONS.md`; the seven NEEDS-REY items are accepted at
> `DECISIONS.md` 89–95. **The text below is the record as written on 2026-07-25, unedited.**

Phase 3 cannot start without two artefacts from the parallel design track:

1. **The token artefact** — `--yy-*` CSS custom properties plus the JSON mirror, per the
   extend-never-rename contract in `SPEC.md` §4.
2. **Component + chart anatomy specs** — TeamMark and PlayerMark containment, the chart anatomy
   spec, the three hero-card sizes, the 32-team palette usage recommendation, and the Value
   Stadium section geometry.

**The blocker is file access, not design work.** Two ways to unblock, either is fine:

- **"Send to Claude Code Web"** from the design tool, which drops the files into a session
  directly, **or**
- **a direct file drop into the repo** (`design/` at root) — tokens as `.css` + `.json`, specs
  as PDF/PNG/Figma export.

Until one of those happens, Phase 3 has no input. Phases 1 and 2 are unaffected and proceed at
full speed — that is exactly why the neutral placeholder theme exists. But **every day past
Aug 22 without the token artefact comes straight out of Phase 3**, and Phase 3 is the shortest
phase on the plan.

---

## PHASE 3 — Design application, chart anatomy, motion, accessibility, screenshot variants
**Aug 22 → Aug 28 (1 week).** Depends on the DESIGN INTEGRATION POINT and on the legal decision
for dead-money views.

> **COMPLETE 2026-07-26.** Real tokens applied, chart anatomy across every chart, **both
> field-literal surfaces built** (`DECISIONS.md` 98), Value Stadium, motion with
> `prefers-reduced-motion` redefining the duration tokens themselves, **WCAG AA in both themes**,
> the screenshot variants shipped as dedicated `/share/*` routes rather than a render mode, and a
> designed light mode. Dead-money views ship on the full REVIEW tier per gate #3 instance 3, with
> `DEAD_MONEY_TIER=safe` exercised and measured (`etl/README.md`). Verified by a 4-lens pass;
> all 30 findings fixed.

1. **Apply the real tokens.** If Phase 2 was disciplined, this is a theme-file swap plus
   corrections — not a re-skin.
2. **Chart anatomy** per the design spec, across every chart.
3. **The two field-literal surfaces** — league Field and team Drive — built against
   `yards_to_opponent_goal = 150 − Cap+`. Every other chart keeps conventional axes with a
   Cap+ axis present.
4. **Value Stadium** — position groups as sections by cap share, gold ring at league average,
   dead money as unlit seats.
5. **Motion**, principled and restrained; `prefers-reduced-motion` honoured throughout.
6. **Accessibility to WCAG AA**, both themes, automated axe in CI plus a manual pass. Colour is
   never the sole carrier of meaning.
7. **Screenshot card variants** — the hero division cost-per-win card at mobile/thumbnail/
   desktop, plus screenshot-able variants of the Cap+ leaderboard card, the cost-per-win card,
   the allocation bars and the dead-money ledger card. Each self-contained, titled, carrying
   "100 = league average" where Cap+ leads, carrying the product mark, tested against both a
   light and a dark feed background.
8. **True light mode** delivered as a designed theme, not an inversion.
9. **Dead-money views ship per the legal decision** — full REVIEW-tier rendering, or the
   SAFE-tier-only fallback in `RISKS.md` risk 1. The `license_tier` column and
   `DEAD_MONEY_TIER` flag make this a configuration change on the day, not a rebuild.

**Exit criteria.** Every route renders on the real theme in both light and dark, AA-clean; the
hero card exports cleanly at all three sizes; visual regression snapshots are captured as the
new baseline.

---

## PHASE 4 — Soft launch to the feedback circle
**Aug 28 → Sep 4 (1 week, preseason).**

1. Deploy to production on the real domain (gate #2).
2. Share with the feedback circle only — no public posting, no social, no press.
3. **Watch the specific things that are hard to test and easy to get wrong:** does anyone
   misread a dated dead-money figure as a trend; does anyone read Cap+ as a front-office grade;
   does anyone miss that four seasons are blank; does the field-position framing land or
   confuse; does the hero card survive being screenshotted into a group chat.
4. Fix copy first, code second. Most soft-launch feedback on a product like this is a labelling
   problem, not a bug.
5. Load and Web Vitals check on the real domain. ~1,155 static pages should be trivial; confirm
   rather than assume.

**Exit criteria.** No reader in the feedback circle misinterprets a coverage boundary or the
meaning of Cap+ without correction. That is the actual bar.

---

## PHASE 5 — Fixes and public push
**Sep 4 → Sep 7 (Labor Day week). Public push Monday Sep 7. Opener Thursday Sep 10.**

1. Land soft-launch fixes.
2. Visual regression becomes blocking.
3. `/methodology` and `/credits` final read-through — these are the pages that carry the
   product's credibility and they must not read like internal documents.
4. Public push Sep 7, three days ahead of the opener.

**Deliberate slack: Sep 8–9.** Two days between the public push and the opener, held empty on
purpose. If they get consumed by Phase 5 overrun, the launch still lands before kickoff.

---

## Launch-copy requirements

These are **copy deliverables, not code TODOs.** They are written, reviewed and approved as
text before Phase 4, and they are the sentences that make the product honest.

1. **The four blank Cap+ seasons.** 2013, 2016, 2020, 2021 render, verbatim: *"Not available —
   no league-wide dead-money table was published for this season."* Approved copy, not a
   placeholder.
2. **The pre-2013 Cap+ slot.** *"Not available — league-wide contract coverage begins in
   2013."*
3. **The provisional badge.** 2014 and 2019, with the explanation copy: *"published before the
   league year opened; understates the final figure."*
4. **The Team Rating name.** *"Team Rating (performance only)"* — never *"Cap+ (performance
   only)"*, anywhere, in any surface, including alt text and CSV headers.
5. **The bridge sentence** on every franchise time series: both indices are built from the
   identical performance composite; only the cap adjustment starts in 2013.
6. **The cross-era legitimacy statement** on the head-to-head view.
7. **The zero-win labels** for 2017 CLE and 2008 DET.
8. **The λ=1.5 economic claim**, published in `METHODOLOGY.md`: *a dollar of dead cap costs us
   half again what a live dollar does, because it buys no player and blocks a roster spot.*
9. **The two day-one disclosures** from `CAPPLUS_MEMO.md` §7: 2024 Denver is a non-event and
   that is correct (publish the league median beside it); and Cap+ cannot see mortgaged future
   cap.
10. **The +0.158 persistence figure**, published by us, before anyone else computes it.

---

## Cut lines

If the timeline slips, cuts come in this order. This is decided now, in the calm, so it is not
decided in the panic.

| Order | Cut | What survives |
|---:|---|---|
| **1** | **Value Stadium view** | The allocation diverging bars already carry the same information on the team page. The Stadium is the most design-dependent surface and the first thing whose absence nobody can name. |
| **2** | **Head-to-head view** | `/compare` 404s cleanly and the route is reserved. Every number it would show is reachable on two team pages. |
| **3** | **Player view degrades to contract-card-only** | Identity chip + contract card ship; cap-vs-cash chart, availability, and the production line are dropped. The PlayerMark licensing surface stays intact, which is the part that cannot be half-done. |

**Never cut, under any circumstance:** the **division hero cost-per-win card**, the **league
Cap+ leaderboard**, and the **team view**. Those three are the product. If they are not ready,
the launch date moves — the scope does not.

`/methodology` and `/credits` are also never cut. `/credits` is a licence obligation for 223 of
244 image assets, not a nice-to-have.
