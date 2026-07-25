# SPEC.md — YIELD/YARD

**Product spec, v1.** Written 2026-07-25. Companion documents: `ARCHITECTURE.md` (how it is
built), `BUILD_PLAN.md` (when), `RISKS.md` (what can go wrong), `METHODOLOGY.md` (what the
public is told), `DECISIONS.md` (what was settled and why). Data facts in this document are
imported from `DATA_AUDIT.md` and `CAPPLUS_MEMO.md`; nothing here is recomputed.

---

## 1. Product identity

**YIELD/YARD.** Twenty-five seasons of what NFL teams spent, and what they got for it.

**Mission, one line:** *Was it worth it?*

Everything the product does answers that question for one team, one season, one contract, or
one pair of teams. Nothing else ships.

### 1.1 The two-tier data promise

Imported verbatim from `DATA_AUDIT.md` §5. This is what the product may claim, in these words.

**Tier 1 — Team performance and economic context · 1999/2000–2025.** Available for every
team-season, 861 of them, with no gaps: results (record, points for/against, point
differential, win percentage, 1999–2025); EPA (offensive, defensive, margin per play plus
totals, 1999–2025); coaching (HC/OC/DC for 830 team-seasons, 2000–2025, Houston enters 2002);
draft (every pick 2000–2025, 6,644 picks); league salary cap ceilings 1994–2025 as economic
context (2010 blank — uncapped).

**Tier 2 — Player-level economics · 2013–2025.** Available for 416 team-seasons / 32,105
player-seasons: per-player cap detail, team cap totals, positional cap allocation by group;
cash spending (annual, per player and per team); cost-per-win and related economics.

**Tier 2 does not exist before 2013 and the product must not imply otherwise.** Pre-2013
contract rows are a biased sample of notable deals (43 players/team in 2012, under 15% of a
team's cap by 2004), usable only for top-of-market questions, never for team totals.

Special cases (dead money, snap counts, player images) are specified in §2.3, §2.9 and §6.2
of this document; their coverage statements come from `DATA_AUDIT.md` §5 unchanged.

### 1.2 The never-silently-partial UI rule

Verbatim from `DATA_AUDIT.md` §5, non-negotiable:

> **Views must communicate tier boundaries explicitly — never silently show partial data.**
> A view that spans a boundary must say so at the boundary: label the year range it
> actually has, render the blank years as blanks with a stated reason, and never let a
> user infer from an unbroken axis that a metric exists for years it does not. A partial
> season is labelled partial. A dated snapshot renders its date. Absence is shown, not
> hidden.

Engineering consequence, stated so it is testable: **every chart component takes a
`coverage` prop and every metric value is a discriminated union**, never a bare
`number | null`.

```ts
type Metric<T> =
  | { state: 'value';    value: T; asOf?: AsOf; provisional?: boolean }
  | { state: 'blank';    reason: string }   // reason is rendered, never swallowed
  | { state: 'partial';  value: T; covered: number; total: number; reason: string };
```

A component that receives `state: 'blank'` renders the reason string. There is no code path
that renders an empty cell, a dash, a zero, or an interpolated point for missing data. A unit
test asserts that no chart series contains a synthesized point.

---

## 2. Metrics

Definitions are written so an implementer can code from them without asking a question.

### 2.1 The three money lenses

The product never says "spending" without saying which lens. All three are rendered as a
labelled trio on the team page (§5.2) and all three are Tier 2 (2013–2025).

**Lens 1 — Cap hit.** Source: OTC `cap_number`, summed per team-season into
`team_season_cap.cap_used_total`. **Season-final snapshot semantics: every figure in this
dataset is an end-of-league-year restatement, not an in-season reading.** Mahomes' 2023 cap
number resolves to $37,133,824 — the September rework — not the $49.293M scheduled number or
the ~$39.7M March restructure. No "as of week N" cap view is possible and none may be built.
Label in the UI: "Cap hit (season-final)".

`cap_used_total` is **cap held by players on the roster, not cap used.** It runs a structural
15–22% below each team's actual cap because dead money is absent, and the error is largest
exactly for the teams in cap hell. It is never labelled "cap used", "cap utilization", or
"% of cap".

**Lens 2 — Cash spent.** Source: OTC `cash_paid` (annual, not cumulative), summed into
`team_season_cap.cash_spent_total`. 100% non-null wherever cap is, same 2013 boundary. Ratios
sit near or above 1.0 of the league cap and are far better behaved than cap. Caveat rendered
on the lens: **cash paid to players released during the year is not included** — this is cash
to players on the roster.

**Lens 3 — Dead money.** Source: `data/curated/dead_money_team_season.csv` — curated, dated
press snapshots with a `source_url` on every row. Not derived, not derivable (see §2.3).

Definition rendered on the methodology page and in the dead-money card's info panel, **quoted
verbatim with credit to Dan Graziano, ESPN**:

> "A dead money charge is a charge on an NFL team's salary cap for a player who is no longer
> on the roster. It represents any remaining signing bonus proration that was not accounted
> for prior to the player's release or trade. It is not a cash payment..."

**As-of discipline — the hardest rule in the product.**

1. A `(team, season)` dead-money key without an `asof_date` is a bug and fails a structural
   test at build time.
2. **Value, date and stage always render together.** `$85.2M · as of 2024-11-27 · late season`.
   There is no compact variant that drops the date. There is no tooltip-only date.
3. **Dead-money values are never plotted as a connected cross-season series.** They are
   individually dated readings taken at different points in different league years. The
   renderer for dead money across seasons is a **dot plot with no connecting path**, each dot
   carrying its own date label. A line-chart component that receives a dead-money series
   throws in development and renders dots in production.
4. Same-season drift is real and measured: CHI 2022 reads $57.6M preseason → $85.8M midseason
   → $91.8M final (+59%); the 2018 league total reads $155.2M in March and $348.5M in July, a
   2.2× swing from measurement date alone.

Coverage, stated as a fact wherever dead money appears: **full 32 teams for nine seasons —
2014, 2015, 2017, 2018, 2019, 2022, 2023, 2024, 2025.** Four seasons are explicit blanks at
the team level: **2013 (5 teams published), 2016 (8), 2020 (5), 2021 (10)**. Those seasons
render a "biggest hits" leaderboard labelled as such, or nothing. A leaders-only list is
never rendered as a 32-team view with 22+ silent gaps.

### 2.2 Cap+ — the flagship metric

> ## PENDING APPROVAL GATE #1
> **No Cap+ value renders anywhere in the product until Rey signs the formula in
> `CAPPLUS_MEMO.md` §7.** The component may be built against the neutral placeholder theme
> and against `capplus_candidates.csv`, but the promotion to `capplus_official` and any
> route that renders a Cap+ number are gated. See `BUILD_PLAN.md` gate #1.

The recommended build from `CAPPLUS_MEMO.md` §7, formula block reproduced verbatim:

```
Cap+ = (100 + 15 × P) ÷ R
R    = team cost ÷ league-average cost, floored at the season's 25th percentile
cost = (cap charged to rostered players + 1.5 × dead money) ÷ league cap
```

Implementation rules, all mandatory:

- **One snapshot per season.** All 32 teams read from the same dated dead-money table. 2018 is
  the only season with two full-league tables; the later one (2018-07-14) is used.
- **The floor** is applied to the *cost* measure, and the league average is taken **after** the
  floor, so `mean(R)` is exactly 1.000 every season and `R = 1.00` still reads as
  "league-average cost". Eight of 32 teams are floored every season by construction.
- **Calibration.** Demeaned within season so each season's mean is exactly 100.000, then
  divided by **one single pooled within-season SD** across the whole window, so the pooled SD
  is exactly 15.000 and individual seasons are free to be tighter or wider.
- **Coverage: nine seasons, 288 of 416 team-seasons (69.2%)** — 2014, 2015, 2017, 2018, 2019,
  2022, 2023, 2024, 2025.
- **Four explicit blanks.** 2013, 2016, 2020 and 2021 render the literal sentence
  **"Not available — no league-wide dead-money table was published for this season."**
  Never a dash, never a blank cell, never a zero. Blanking is whole-season: where coverage is
  partial, the entire season is blank, not just the unlisted teams.
- **2014 and 2019 ship badged `provisional`.** Their tables were published before the league
  year opened — median team charge $4.0M and $3.4M against $50.3M in 2024. The badge carries
  a one-line explanation on hover and in the print/screenshot variant: *"published before the
  league year opened; understates the final figure."*
- **Publish the weighted cost and the plain cap-consumed percentage side by side.** At λ=1.5,
  44.1% of team-seasons exceed a cost of 1.00, so the weighted figure is a **cost index** and
  must never be labelled "% of cap used". Both ship: `cost_rec` and `cap_consumed_rec`.

### 2.3 Team Rating (performance only) — the 1999–2012 fallback

`perf_index = 100 + 15 × P`, the same performance composite with no resource term, computed
for all 861 team-seasons 1999–2025.

Labelling rules, from `CAPPLUS_MEMO.md` §4, all mandatory:

- The name is **"Team Rating (performance only)"**. It is **never** called "Cap+ (performance
  only)" — to a reader that is still Cap+.
- For 1999–2012 the Cap+ slot renders the literal sentence **"Not available — league-wide
  contract coverage begins in 2013"**.
- Team Rating renders in **visibly different styling** from Cap+ — different series colour
  role, different line weight, its own legend entry.
- Any franchise time series carries a **hard visual break at 2013**.
- **On the 2014–2025 overlap, plot both lines** — Team Rating *and* Cap+ — so the gap between
  them is visible before the Cap+ line stops.
- One honest bridge sentence renders on the page: *both are built from the identical
  performance composite; only the cap adjustment starts in 2013.*
- The scenario brackets in the backtest for the four uncovered seasons are scenarios, not
  measurements, and **never ship as values**.

### 2.4 Performance composite P

Within-season z-blend, **equal weights (1/3, 1/3, 1/3)**, of three inputs:

1. `win_pct` — **a tie counts as half a win**: `(wins + 0.5 × ties) / games`. Per-team game
   counts drive this, never a constant: 2022 BUF and 2022 CIN played 16 games, not 17.
2. `point_diff_per_game` — `(points_for − points_against) / games`.
3. `epa_margin_per_play` — offensive EPA/play minus defensive EPA/play, **`play_type IN
   ('pass','run')` only** (`play_type` is `'run'`, never `'rush'`), **REG only**.

```
P_raw = (1/3)·z(win_pct) + (1/3)·z(point_diff_per_game) + (1/3)·z(epa_margin_per_play)
P     = z(P_raw)          # both z's taken WITHIN season
```

All SDs are sample SDs (`ddof=1`). P has mean 0 and SD 1 in every season by construction.

Equal weights are settled and closed. Alternate weightings were backtested: correlation with
the default build is ≥ 0.9968 and mean absolute within-season rank shift never exceeds 0.74
places. No sniff-table verdict changes under any weighting. The three inputs correlate
0.87–0.97 with each other. **Spend no further product time on the weights.**

EPA is opponent- and era-unadjusted; league-mean offensive EPA/play drifts from −0.0561 (1999)
to +0.0314 (2020). Within-season z-scoring is what makes cross-era comparison legitimate, and
that is the sentence the head-to-head view prints (§5.4).

### 2.5 Cost per win / point / EPA-point

A three-part family with a **selectable numerator**:

- Numerator (user-selectable toggle, default **Cash**): `cash_spent_total` or `cap_used_total`.
  The toggle label states which; the lens caveats from §2.1 travel with the selection.
- Denominators: `wins` · `points_for` · positive EPA generated (`off_epa_total`, floored at 0).

Worked reference case, reproduced from `DATA_AUDIT.md` §3.2 — an implementer should reproduce
this exactly before shipping the card:

```
2023 SF:  cash_spent_total $258,275,910 ÷ 12 wins = $21,522,992.50 per win
          → displayed as $21.52M per win
```

**Zero-win rule — verbatim from `DATA_AUDIT.md` §4.1, non-negotiable:**

> **A cost-per-win figure is never rendered as infinity, "∞", "N/A", a blank, or a divide
> error.** When `wins == 0`, the view shows the **total spend figure** with an explicit
> **"0 wins"** label — e.g. *"$151.1M spent · 0 wins"* — and suppresses the ratio entirely.
> The team is excluded from ratio-ranked orderings rather than sorted to either extreme.

Exactly two team-seasons trigger it: **2017 CLE** (inside Tier 2: `cash_spent_total`
$151,136,223, `cap_used_total` $109,806,707 — renders "$151.1M spent · 0 wins") and **2008
DET** (Tier 1 only, pre-2013: renders its record and performance panel with the economics
panel showing the Tier 2 boundary message, not a zero and not a blank). Both are golden-test
fixtures; the rule ships with a test that asserts neither page ever emits `Infinity`.

### 2.6 Positional allocation

Cap share by position group per team-season versus the league average, **2013–2025 only**.

- **Position rule:** for each player-season, take the position from that player's **most recent
  signing at or before that season**, falling back to his earliest signing. `position` is a
  per-contract field recorded *at signing* and drifts for 949 of 12,857 players (7.4%). The UI
  label for the rule is *"position as of the deal then in force."*
- **Nine groups:** QB · RB (RB+FB) · WR · TE · OL · DL (IDL+ED) · LB · DB (CB+S) · ST (K+P+LS).
  Unmapped cap share is 0.375% and is dropped, not bucketed into "other".
- **Denominator caveat, rendered on the chart:** this is a share of *rostered* cap and
  therefore inherits the dead-money omission. It is "% of cap held by players on the roster",
  never "% of cap".
- Face-validity reference (league-wide 2023): DL 22.0% · OL 20.1% · DB 16.2% · WR 12.3% ·
  QB 9.6% · LB 6.8% · TE 5.2% · RB 5.0% · ST 2.9%.

### 2.7 Dead-money burden

- **Burden = dead money ÷ team cap**, where **team cap = `team_adjusted_cap_implied`** (the
  adjusted cap back-derived from OTC `cap_percent`; league cap + carryover). This is the right
  denominator because it is the cap the team actually operated against. The league-cap
  denominator is available as a secondary readout, labelled.
- Every burden figure inherits the full as-of discipline from §2.1: value + date + stage
  together, dots not lines.
- **Ledger view** from `data/curated/dead_money_ledger.csv`: 21 verified individual charges,
  20 players, 15 teams, era anchor 2017 (Dareus/BUF). All 21 rows are `is_actual = TRUE` and
  the flag renders as a visible "verified actual" chip — the product's strongest single asset
  and the place where the projected-vs-actual distinction is made explicit.
- **The Dareus/BUF row has a deliberately blank `split_by_season`.** Sources conflict and it
  was not guessed. The ledger renders the total with "per-season split not established" —
  never an inferred split.
- **Published lists mix projected and settled charges.** Five confirmed landmines carry
  corrective notes in the source data (Wilson/DEN, Tagovailoa/MIA, Julio Jones/ATL, Brady/TB,
  Murray/ARI). Four of the five have correct totals and wrong per-season splits, so a
  total-level checksum passes all four. **Reconcile on splits, never on totals alone.**

### 2.8 Stability Index (coaching)

Source: `data/curated/coaching_staff.csv` (2,612 rows, 830 team-seasons, 2000–2025, roles
HC/OC/DC, 435 distinct people + the `NONE` sentinel). Formulation proposed here and logged in
`DECISIONS.md`. **Not an approval gate** — it ships on this spec.

**Step 1 — slot resolution.** For each `(season, team, role)` slot:
- `opening_holder` = first row in chronological stint order; `closing_holder` = last row.
- `n_stints` = row count in the slot. 119 slots are multi-row (HC 58, OC 39, DC 22); three are
  3-row (NO 2012 HC, DET 2020 HC, CHI 2024 OC).

**Step 2 — `NONE` handling (decided, documented).** `NONE` (60 rows: OC 38, DC 22, HC 0) means
the title was genuinely unfilled. It is **not** parsed out of the free-text `note`, and it is
**not** treated as a flat no-change. The holder identity for a `NONE` slot is the sentinel
**`NONE@<canonical HC name>`** — the head coach absorbed the role. Consequences, all correct
against the data: ARI 2019–2022 OC is `NONE@Kliff Kingsbury` in all four seasons and registers
zero churn (Kingsbury called plays throughout); if the HC changes, the `NONE` slot changes too
and churn registers; a transition *into* or *out of* a `NONE` slot is a real change event but
is counted at **half weight**, because the title moved without a guaranteed change of
play-caller. The `note` column is never parsed by code — it is display and provenance only.

**Step 3 — change events** at season `t` versus season `t−1` for the same franchise:
- *Boundary change* for role R: `opening_holder(t) ≠ closing_holder(t−1)`.
- *In-season change* for role R: one event per extra stint, i.e. `n_stints(t) − 1`.

**Step 4 — churn points.**

| Event | Points |
|---|---:|
| HC boundary change | 3.0 |
| HC in-season change (each) | 4.5 |
| OC or DC boundary change | 1.0 |
| OC or DC in-season change (each) | 1.5 |
| × 0.5 multiplier if either side of the transition is a `NONE@…` sentinel | — |

Mid-season changes are weighted 1.5× their boundary equivalents throughout: a firing in
October is both a change and a signal of crisis.

**Step 5 — the index.**

```
W(t)  = churn(t) + 0.6 × churn(t−1) + 0.3 × churn(t−2)
SI(t) = clamp(0, 100, 100 − 5 × W(t))
```

100 = total continuity. A single offseason HC change reads 75. A season with an in-season HC
firing plus both coordinators replaced reads ~52. Three consecutive such seasons floor near 10.
Seasons 2000 and 2001 have a truncated window (no `t−1`/`t−2`); they are computed on the terms
available and flagged `window_truncated = true`, and the team page labels them accordingly.
HOU has no 2000/2001 rows at all — the franchise enters in 2002.

Alongside the index the mart carries the raw numbers the UI actually shows on the track:
`hc_tenure_seasons`, `oc_tenure_seasons`, `dc_tenure_seasons`, `regime_id`, `regime_season_n`.

**Step 6 — regimes.** A **regime** is a maximal run of consecutive seasons under the same
head-coach identity for one franchise. **Coordinator changes never start a regime**; they
contribute churn only. Each regime-change event is typed `offseason` or `in_season`.

**Step 7 — the signature angle: regime change → dead money.** For every regime-change event at
season `s` for team `T`, the product reports `T`'s dead money in seasons `s+1` and `s+2`,
**only where a full-32 dead-money table exists for that season** (2014, 2015, 2017, 2018, 2019,
2022, 2023, 2024, 2025). Each figure renders with its own as-of date and stage, beside the
league median for that same season as the benchmark. The two readings are **never connected**
— they are two independent dated readings, presented as a pair of chips, not a trend.

Where `s+1` or `s+2` has no full-32 table, the cell prints **"no league-wide dead-money table
published for {season}"**. Partial-coverage rows are never substituted.

The aggregate readout ("teams carry X% more dead money in the two seasons after a coaching
regime change") is computed only over pairs where the full-32 table exists, prints its own `n`,
and is worded as an association, never a cause.

**Step 8 — name joins.** `coach_name` is **not** a safe join key. Join on
`(coach_name, season, team, role)`. Build a surrogate `coach_id` by dense-ranking the distinct
`coach_name` strings in the curated file exactly as delivered. **Never fuzzy-match on name.**
The canonicalizations already applied upstream are load-bearing and must not be "simplified":

- **Jim E. Mora** (IND HC 2000–01) ≠ **Jim L. Mora** (SF DC 2000–03, ATL HC 2004–06, SEA HC
  2009) — father and son, both present in 2000–2001, the highest-risk pair in the dataset.
- **Pete Carmichael Sr.** (CLE 2000 OC) ≠ **Pete Carmichael Jr.** (NO 2009–2023 OC) — both on
  the 2000 Browns staff simultaneously.
- **Jimmy Raye II** is the coach; Jimmy Raye III is a personnel executive of the same era.
- Verified-distinct and never to be merged: Gary/Klint/Klay Kubiak · Bob/Bobby Babich ·
  Bob/Bobby Slowik · Norv/Scott Turner (both hold CAR 2019 OC rows) · Gregg/Blake Williams
  (both on the 2012 Rams and 2018 Browns staffs) · Wade/Wes Phillips · Mike/Adam Zimmer.

Structural tests (fail the build): 830 team-seasons; every one has ≥1 HC, ≥1 OC, ≥1 DC;
zero `HC = NONE`; 436 distinct `coach_name` values (435 people + `NONE`); `(coach_name, season)`
is **not** unique and no code may assume it is (Mike McCoy holds LV 2025 OC and TEN 2025 HC);
`(coach_name, season, team)` is **not** unique either — 33 rows have an HC's name in an OC/DC
row for the same team-season.

Documented ambiguities that must survive into the UI notes and not be "fixed": WAS 2004–07 DC
(Gregg Williams retained; Greg Blache held the formal title — external title-exact joins will
disagree), STL 2012 DC (`NONE`; three-way source conflict), SD 2001 DC (possible unrecorded
interim stint, deliberately not added).

### 2.9 Draft+ / draft capital ROI

**Value chart: the Fitzgerald–Spielberger NFL Draft Trade Value Chart**, published at Over The
Cap (`https://overthecap.com/draft-trade-value-chart`), cited on the methodology page and in
the chart footer. Chosen because its units are dollars of surplus value produced by a pick
relative to its rookie-contract cost — the same units as the rest of this product — rather
than the Jimmy Johnson chart's 1990s trade-negotiation heuristic, which was never calibrated
to on-field outcome. Logged in `DECISIONS.md`.

**Capital spent per class.** For each `(season, team)`, sum the chart value of every pick the
team made. Source `draft_picks.parquet`, window **2000–2025**, 6,644 picks. **Team codes are
PFR boxscore codes** (`NWE`, `GNB`, `SFO`, `LVR`, `SDG`) — a fourth convention;
`PFR_DRAFT_TEAM_MAP` must run **in front of** `normalize_team`, which alone leaves 8 codes
wrong.

**Realized return per class.** Reported as a small set of independently-sourced columns, never
blended into a single invented score:

| Column | Coverage over window | Notes |
|---|---|---|
| `games` | 91.2% | primary availability measure |
| `w_av` | 91.2% | weighted approximate value — the primary return measure |
| `seasons_started` | 100% | |
| `probowls`, `allpro` | 100% | secondary, count-based |
| snaps | **2013+ only** | via the `players.parquet` bridge, §7.3 |

**`car_av` is 100% null — a dead column that looks live.** It is excluded from the schema
entirely so no one can read it by accident. A structural test asserts it is absent from the
mart.

**Tier boundaries are respected.** Draft capital and realized return are Tier 1 and available
for all classes 2000–2025. Any framing of a draft class in **dollars** — cost per point of
capital, rookie-contract cap share — is **Tier 2 and renders only for 2013+**. The draft ROI
card on a pre-2013 team page shows capital and return, and shows the Tier 2 boundary message
in the dollar row.

`gsis_id` coverage over the window is 95.7% (worst 2005 at 85.9%); the 4.3% without it are
carried in capital totals (a pick is a pick) and excluded from return joins, with the excluded
count printed on the card.

---

## 3. Views

Mobile-first at **390px**; every layout below is specified at that width first, then relaxes.
Four views ship in v1, plus `/methodology` and `/credits`.

**Curated pickers only. There is no free-form query builder in v1.** Every selection is a
division picker, a team picker, a season picker, a player search, or a two-team-season
comparison picker. The query builder is the v2 paid wedge and is explicitly out of scope; a
PR that adds arbitrary filtering is rejected on sight.

### 3.1 Home / Division — `/` and `/division/{div}`

1. **Division picker**, sticky at top. Eight divisions, current alignment only. Default
   selection on `/`: **AFC East**.
2. **Hero: division cost-per-win card.** The product's hero unit (§4, design contract). Four
   teams, current season, cost per win with the numerator toggle from §2.5, ranked. Renders at
   three sizes; the mobile size is the canonical one.
3. **League Cap+ leaderboard — all 32 teams.** Not a top-10. The full table, sortable,
   CSV-exportable, with the "100 = league average" caption. Gated on approval gate #1; until
   the gate clears this slot renders the Team Rating leaderboard under its own name.
4. **Largest dead-money charges** — from the ledger, with `is_actual` chips and as-of dates.
5. **Entry cards** — three fixed cards routing into the team, player and compare views, each
   seeded with a concrete example rather than an empty state.

Season selection on the division view follows the same rule as everywhere: the most recent
season with complete data (2025 at launch).

### 3.2 Team — `/team/{abbr}/{season}`

1. **Header.** TeamMark (§6.1) + era-correct franchise name for that season + record + index
   badge (Cap+ where covered, Team Rating where not, each under its own name and styling).
2. **25-season history.** The franchise's full 1999–2025 arc. **Hard visual break at 2013.**
   **Both lines plotted on the 2014–2025 overlap** — Team Rating and Cap+ — per
   `CAPPLUS_MEMO.md` §4. Four Cap+ seasons render as labelled gaps with the blank-reason text,
   not as interpolated segments. The bridge sentence renders beneath the chart.
3. **Three-lens summary.** Cap hit / cash / dead money as a labelled trio (§2.1), each with its
   own caveat line. Pre-2013 this block is replaced by the Tier 2 boundary message.
4. **Allocation diverging bars.** Cap % by position group versus league average, nine groups,
   2013+ (§2.6). Diverging from a zero-centred league-average axis.
5. **Cost-per-win card** (§2.5), screenshot-able, with the zero-win rule live.
6. **Coaching stability track + regime timeline** (§2.8). The track is a horizontal band across
   the 2000–2025 axis showing HC/OC/DC tenure runs; regime-change markers sit on it; selecting
   a marker opens the two dated dead-money chips for `s+1` and `s+2`.
7. **Dead-money ledger** — this franchise's rows from `dead_money_ledger.csv`, plus its
   team-season snapshots as a **dot plot, never a line** (§2.1).
8. **Draft ROI summary** (§2.9) — capital spent versus realized return by class.
9. **CSV export.**

### 3.3 Player — `/player/{id}`

1. **Search** — name search over the v1 player population (§8.4), typeahead, no filters.
2. **Identity chip** — PlayerMark (§6.2) + name + position + team + attribution credit line
   rendered visibly, not behind a hover (91.4% of assets legally require it).
3. **Contract card** — terms from the top-level contract columns: value, APY, guaranteed,
   APY as % of cap, years, year signed. Available back to 1994 for players who have a
   contract row.
4. **Cap vs cash by year** — two series, with **dead-money markers** where a charge from the
   ledger attaches to this player. The marker carries the team that ate the charge, which is
   **not** the team on the player's row for that year — the source table follows the player,
   not the charge.
5. **Availability** — games, and **snaps 2013+** (2012 is an empty file; the boundary is
   stated, not absorbed).
6. **Production line, position-appropriate** — passing for QBs, rushing for RBs, receiving for
   WR/TE, defensive counts where available. Sparse coverage is labelled sparse.
7. **NO VALUE GRADE. EVER.** The player view never renders a composite player rating, a letter
   grade, a "worth it / not worth it" verdict, a star count, or any invented per-player score.
   This is a product commitment, published in `METHODOLOGY.md`, and it is enforced in review.

### 3.4 Head-to-head — `/compare?a={abbr}-{season}&b={abbr}-{season}`

1. **Two team-season pickers.** Curated: team dropdown × season dropdown, both sides.
2. **Cross-era legitimacy statement, rendered in the UI, not buried:** *"Both teams are scored
   against their own season's league. Every input is standardized within its season before
   comparison — that is what makes a 2003 team and a 2024 team comparable here."*
3. **Stacked benchmark comparison.** Each metric renders as a paired bar against the league
   average of its own season, so the reader compares two distances-from-average rather than
   two raw numbers. Where one side is pre-2013, the Tier 2 rows render the boundary message on
   that side only and the Tier 1 rows compare normally.
4. **CSV export.**

---

## 4. Design contract

These are the engineering-side commitments to the parallel design track. They are binding on
the app repo; the design track owns everything on the other side of the token boundary.

**Tokens.** Design tokens arrive as **`--yy-*` CSS custom properties plus a JSON mirror** of
the same values. The contract is **extend-never-rename**: once a token name ships, it is never
renamed or repurposed; new needs get new tokens. The JSON mirror is the source for anything
that needs token values in JS (chart scales, canvas rendering). A build step asserts the two
are in sync.

**Neutral placeholder theme.** Every component is built against tokens from day one, using a
**neutral placeholder theme** (grayscale + one accent) until the real tokens land. No component
hardcodes a colour, a font stack, a radius, or a spacing value. Swapping the theme file is the
entire integration; see `BUILD_PLAN.md` Phase 3 and the DESIGN INTEGRATION POINT.

**Cap+ as field position.** Cap+ renders as field position on **exactly two field-literal
surfaces**: the **league Field** (the leaderboard on `/` and `/division/{div}`) and the **team
Drive** (the 25-season history on the team page). Nowhere else.

```
yards_to_opponent_goal = 150 − Cap+      (clamped to 0…100)
```

100 = midfield. 15 index points = 15 yards. Cap+ 130 → the 20 → **red zone = elite**. Cap+ 50 →
own goal line → **safety = below 50**. **Every other chart in the product uses conventional
axes**, and every chart that involves Cap+ carries a **Cap+ axis** — the field metaphor never
replaces the number.

**Value Stadium.** The Value Stadium view is **money allocation**, not performance: stadium
sections are position groups sized by cap share, the **gold ring is the league average**, and
**dead money renders as unlit seats**. This is design reconciliation #1 and it is settled.

**Colour roles.**
- **Lime** — the selected series. **One series per chart, maximum.**
- **Gold** — benchmarks (league average, the Stadium's average ring, reference lines).
- **Red** — genuine negatives only. Never decoration, never "team colour that happens to be
  red", never a heat scale's warm end.
- **White / gray / muted green** — comparison series.
- The **32-team palette usage rule awaits the design track's recommendation.** Until it lands,
  team colour is used only inside TeamMark, never as a chart series colour.

**Hero unit.** The **division cost-per-win card** is the hero, built at three sizes:
**mobile (390px full-bleed), thumbnail (square, feed/OG), desktop (wide)**. All three render
from one component with a size prop; they are not three implementations.

**Every key card is screenshot-able.** Self-contained (no meaning depends on surrounding page
chrome), titled, carrying the caption **"100 = league average"** wherever Cap+ leads, carrying
a subtle product mark, and legible when dropped into both a **light and a dark** social feed.
Screenshot variants are a build target, not an afterthought.

**Type.**
- **Bebas Neue** — display.
- **Squadron Black** — athletic/numeric accent. **Rajdhani is the substitute until Squadron is
  licensed** (approval gate #2, price TBD by the design track). The substitution is a single
  token value.
- **Inter** — body and data, with **tabular numerals** (`font-variant-numeric: tabular-nums`)
  on every numeric column, always.

**Theme.** **Dark is the flagship. A true light mode is required** — not an inverted dark
theme, a designed light theme. Both must pass AA.

**Charts.** Custom, built on **D3 scales with visx primitives**, per the forthcoming chart
anatomy spec from the design track. No charting library that owns its own visual language.

**Motion.** Principled and restrained: motion communicates state change and nothing else. No
decorative animation, no chart-entry choreography. Everything respects
`prefers-reduced-motion`.

---

## 5. Identity assets

### 5.1 TeamMark

Official team logos, **self-hosted** from the URLs in nflverse `teams_colors_logos`
(`team_logo_espn`, `team_logo_squared`, `team_wordmark`). Fetched once by the asset pipeline
(`ARCHITECTURE.md` §5) and served from our own origin — never hotlinked.

Containment (crop, padding, aspect, safe area) is specified by the design track.

**Global kill-switch flag.** A single environment-level boolean, `TEAM_LOGOS_ENABLED`. When
false, every TeamMark instance product-wide renders the **typographic fallback chip**: the team
abbreviation set on the team's **primary colour**, with the glyph colour computed
black-or-white by **relative luminance**. This is required, not cosmetic: **15 of 36 rows have
primary/secondary contrast below 3.0 and 6 are below 2.0** — a secondary-colour glyph on the
primary background is illegible for those teams. Computing the glyph by luminance gives a
worst case of **4.66 (LAC)**, all ≥ WCAG AA.

Conference, division and colour are **absent from `teams.csv`** and must come from
`teams_colors_logos`. NYJ and TEN have null `team_color3`/`team_color4`; the schema allows it.

The takedown response plan is in `RISKS.md` risk 2.

### 5.2 PlayerMark

**Wikimedia Commons only.** No press photography, no team media, no scraped images.

Coverage on the 251-player audited sample: **244 usable / 251 = 97.2%**, expected fallback
2.8% at any resolution. The seven misses are genuine and hand-verified; all seven are recent,
non-skill-position players. **Plan the fallback card for trench players, not for retired
stars.**

**Per-asset licence metadata schema** — implemented as specified in
`audit/findings_image_audit.md` §6, stored per asset in the `player_images` mart (§8.10).
Two fields that audit only implied and that must exist: **`share_alike`** (derived from
`license_machine`) and **`last_verified_at`** (Commons files get renamed, relicensed and
deleted; a cached asset without a re-verification timestamp silently rots).
`license_url` **must be nullable** — all 14 public-domain files have none.

**Attribution is the default, not the exception: 223 of 244 (91.4%) require it.** A design that
hides credits behind a hover or an "info" affordance is a licence violation for those 223
assets. Visible credit space is budgeted in PlayerMark from the first mockup, and a **credits
page at `/credits`** carries the full attribution list, **deduplicated by author** — three
authors (All-Pro Reels, Jeffrey Beall, Erik Drost) account for ~49% of all usable photos, so
rendering 244 near-identical lines would be worse than useless.

12 assets carry `Restrictions = personality` — orthogonal to copyright, and relevant precisely
because this is a commercial product. The flag is stored and surfaced to the operator, not to
the reader.

**Designed card fallback** whenever `has_usable_image` is false **or** the asset is below the
resolution floor. The renderer branches on width either way, so the floor is a config constant
(`IMAGE_MIN_WIDTH_PX`) and changing it is a one-line change.

> **OPEN DECISION 1 — image resolution floor (Rey).** Options and their implied coverage:
> **no floor → 97.2% coverage / 2.8% fallback**; **300px floor → 93.6% / 6.4% fallback**;
> **600px floor → 77.3% / 22.7% fallback**. The distribution is bimodal — median 1165×1496 with
> a thin tail of unusable thumbnails; the single highest-cap player in the population, Dak
> Prescott, is **138×239**.

> **OPEN DECISION 2 — ShareAlike derivative works (Rey, legal).** 48.0% of usable photos
> (117 of 244) are CC BY-SA. A colour-treated, cropped or recomposited photo is a **derivative
> work**, and ShareAlike obliges the derivative to carry the same licence. Three options in
> decreasing risk: **(a)** restrict the treatment to CSS filters over an unmodified source, so
> no new fixed derivative is created — **keeps 97.2%**; **(b)** use only the CC BY / PD / CC0
> half, 127 photos — **coverage collapses to 50.6%**; **(c)** accept and honour CC BY-SA on
> treated assets — **keeps 97.2%**, with licence obligations attached to served assets.

Identity resolution rules that must not be "simplified" by a future maintainer: **team
confirmation always outranks an exact name match** (this is the single most important rule —
an exact-name-first rule resolved Jaguars' Josh Allen to the Bills quarterback with high
confidence); **Wikidata `P54` is too stale to be a verification signal** (it missed the current
team for Herbert, Cousins and Geno Smith) — use the English Wikipedia team category; **Commons
full-text search stays gated** behind independent verification (it returned a soccer player, a
17th-century chaplain and two teammates in this audit, all correctly rejected). 16.7% of
players hit a name collision, and that recurs on every population refresh.

---

## 6. URL schema

Stable from day one. These URLs are permanent; changing one after launch requires a redirect,
not an edit.

| Route | Rendering | Count |
|---|---|---:|
| `/` | Home; division picker defaulted to AFC East | 1 |
| `/division/{div}` | Division view; `{div}` ∈ `afc-east`, `afc-north`, `afc-south`, `afc-west`, `nfc-east`, `nfc-north`, `nfc-south`, `nfc-west` | 8 |
| `/team/{abbr}` | Franchise entry point — 301 to the franchise's most recent season | 32 |
| `/team/{abbr}/{season}` | Team-season | 861 |
| `/player/{id}` | Player; `{id}` is `otc_id` | ~251 |
| `/compare?a={abbr}-{season}&b={abbr}-{season}` | Head-to-head | on demand |
| `/methodology` | Public methodology (`METHODOLOGY.md`) | 1 |
| `/credits` | Image attribution, data credits | 1 |

**`{abbr}` is always the current-franchise code** — the 32-code set the marts are keyed on:
`ARI ATL BAL BUF CAR CHI CIN CLE DAL DEN DET GB HOU IND JAX KC LA LAC LV MIA MIN NE NO NYG NYJ
PHI PIT SEA SF TB TEN WAS`. Lowercased in the URL. **The Rams are `LA`, never `LAR`** — neither
upstream source ever emits `LAR`.

**Era handling for moved franchises.** The route key is franchise-continuous; the *rendered
identity* is era-correct.

- `/team/lv/2003` is the correct and only URL for the 2003 Raiders. The page renders **"Oakland
  Raiders"**, the 2003 wordmark and the era-correct location, resolved from `teams.csv` (which
  is era-correct, 2002–2026) joined on the code map. The header carries a small "Oakland
  Raiders · 2003" identity line so there is never ambiguity about which city is being shown.
- Legacy codes **301-redirect** to the canonical route: `/team/oak/2003 → /team/lv/2003`,
  `/team/stl/2003 → /team/la/2003`, `/team/sd/2003 → /team/lac/2003`, plus the defensive
  aliases in `team_codes.py` (`LAR`, `SL`, `JAC`, `ARZ`, `BLT`, `CLV`, `HST`, `WSH`, `WFT`).
- The consequence is stated on the page and in `METHODOLOGY.md`: **franchise continuity is
  preserved, geography is not.** A query for `LA` in 1999 returns the *St. Louis* Rams.
- `teams.csv` starts in 2002, so 1999–2001 identity comes from a small hardcoded era table for
  the three relocated franchises plus HOU/CLE expansion handling. That table lives in one
  module and is covered by a test.

**Division alignment is current-alignment only.** The realignment of 2002 is not modelled; a
1999 team-season is reachable through its franchise's *current* division. This is stated on
the division view.

---

## 7. Data contracts

TypeScript types for every mart the app reads. **The app reads precomputed marts only** — never
raw nflverse, never at request time (`ARCHITECTURE.md` §3). Nullability below is what was
actually observed, not what is theoretically possible.

Shared:

```ts
type Season = number;            // 1999…2025
type TeamAbbr = 'ARI'|'ATL'|…;   // the 32 current-franchise codes, §6
type AsOfStage = 'preseason' | 'midseason' | 'late_season' | 'final';
interface AsOf { date: string; stage: AsOfStage }   // ISO date; both always present
```

### 7.1 `team_season_results` — 861 rows, grain `(season, team)`

```ts
interface TeamSeasonResults {
  season: Season; team: TeamAbbr;
  games: number; wins: number; losses: number; ties: number;
  win_pct: number;                 // ties count half; = (wins + 0.5*ties)/games
  points_for: number; points_against: number; point_diff: number;
}
```
No nullable fields. 31 teams in 1999–2001, 32 from 2002. `games` is 16 for 2022 BUF and
2022 CIN — never assume 17 from 2021.

### 7.2 `team_season_epa` — 861 rows, grain `(season, team)`

```ts
interface TeamSeasonEpa {
  season: Season; team: TeamAbbr;
  off_plays: number; def_plays: number;
  off_epa_per_play: number; def_epa_per_play: number; epa_margin_per_play: number;
  off_epa_total: number; def_epa_total: number;
}
```
REG only, `play_type IN ('pass','run')` only. Joins 1:1 with `team_season_results`.

### 7.3 `team_season_cap` — 416 rows, grain `(season, team)`, 2013–2025

```ts
interface TeamSeasonCap {
  season: Season; team: TeamAbbr;
  n_players: number;
  cap_used_total: number;             // USD; cap held by ROSTERED players — not cap used
  league_cap: number;                 // USD
  cap_pct_of_league: number;
  team_adjusted_cap_implied: number;  // league cap + carryover, back-derived
  cap_pct_of_adjusted: number;
  dead_money_total: null;             // ALWAYS NULL — not derivable from this source
  dead_money_pct: null;               // ALWAYS NULL
  cash_spent_total: number;           // USD; annual cash to rostered players
  cash_pct_of_league: number;
  unaccounted_vs_adjusted: number;    // UPPER BOUND on dead money — never label as dead money
  unaccounted_pct: number;
}
```
`dead_money_total` and `dead_money_pct` are typed `null`, not `number | null`, so any code that
tries to read a dead-money value from this mart fails to compile. Dead money comes from §7.5.

### 7.4 `capplus_official` — 288 rows, grain `(season, team)`, nine seasons

Promoted from `capplus_candidates.csv` **only after approval gate #1**. The app never reads
`capplus_candidates` — that file is a backtest artefact with 69 columns of alternates.

```ts
interface CapPlusOfficial {
  season: Season; team: TeamAbbr;
  capplus: number;                    // the flagship value
  perf_index: number;                 // 100 + 15*P — also the Team Rating value
  P: number;                          // within-season z, mean 0 SD 1
  cost_rec: number;                   // weighted COST INDEX — never "% of cap used"
  cap_consumed_rec: number;           // plain cap-consumed share — published beside cost_rec
  cost_floor: number;                 // season 25th percentile
  R_rec: number;                      // cost ÷ league-average cost, after the floor
  was_floored: boolean;               // 8 of 32 every season
  dead_money_rec: number;             // USD, the resolved same-stage figure
  dm_asof: AsOf;                      // ALWAYS present — a row without it is a bug
  badge: 'provisional' | 'preseason' | 'in_season';   // 2014 & 2019 = provisional
  season_rank: number;                // 1…32 within season
}
```

Companion `team_rating` covers all 861 team-seasons:
```ts
interface TeamRating { season: Season; team: TeamAbbr; perf_index: number; P: number;
                       season_rank: number }
```

Seasons **2013, 2016, 2020, 2021** have **no rows** in `capplus_official`. The data layer
exposes `getCapPlus(season, team): Metric<CapPlusOfficial>` which returns
`{state:'blank', reason:'Not available — no league-wide dead-money table was published for this season.'}`
for those four, and the 1999–2012 reason string for pre-Tier-2 seasons.

### 7.5 `dead_money_team_season` — 370 rows, grain `(season, team, asof_date)`

```ts
interface DeadMoneyTeamSeason {
  season: Season; team: TeamAbbr;
  dead_money_usd: number;
  asof_date: string;                  // NOT NULL — a row without it fails the build
  asof_stage: AsOfStage;              // NOT NULL
  coverage: 'full32' | 'partial' | 'top5';
  source_url: string;                 // NOT NULL — per-row citation
  note: string | null;
  license_tier: 'SAFE_LEAGUE' | 'SAFE_EDITORIAL' | 'REVIEW_SPOTRAC' | 'REVIEW_OTC';
}
```

**`license_tier` is a new column that ETL must add** (derived deterministically from
`source_url`) and it is the mechanism for the legal contingency in `RISKS.md` risk 1. A single
runtime flag `DEAD_MONEY_TIER ∈ {SAFE_ONLY, ALL}` filters the mart at seed time. Tier counts
from `DATA_AUDIT.md` §5: SAFE-league-official 69 rows, SAFE-editorial 45, REVIEW-Spotrac 64,
REVIEW-OTC 192.

Multiple rows exist per `(season, team)` — 370 rows over 316 distinct team-seasons. The UI
selects one snapshot per season by the same-stage resolution used by Cap+ and **shows the
others as alternate readings on request**, never averaged, never merged.

### 7.6 `dead_money_ledger` — 21 rows

```ts
interface DeadMoneyLedgerRow {
  player: string; team: TeamAbbr;
  seasons: string;                    // e.g. "2024-2025" — a display string, not a range type
  total_usd: number;
  split_by_season: string | null;     // "53000000/32000000"; NULL for Dareus/BUF — never guessed
  is_actual: true;                    // all 21 rows
  verified_asof: string;
  source_url: string; notes: string | null;
}
```

### 7.7 `coaching_staff` — 2,612 rows, grain `(season, team, role, stint)`

```ts
interface CoachingStaffRow {
  season: Season; team: string;       // ERA-CORRECT codes here (STL/SD/OAK) — 35 codes
  role: 'HC' | 'OC' | 'DC';
  coach_name: string;                 // 'NONE' is a sentinel, not a person (60 rows)
  note: string | null;                // display + provenance only — NEVER parsed by code
  source_url: string;
}
```
This is a **curated source**, so it preserves era codes. The derived mart normalizes.

Derived: `team_season_stability` — 830 rows, grain `(season, team)`, per §2.8:

```ts
interface TeamSeasonStability {
  season: Season; team: TeamAbbr;     // normalized
  churn_points: number;
  W: number;                          // 3-season decayed sum
  stability_index: number;            // 0…100
  window_truncated: boolean;          // true for 2000, 2001
  hc: string; oc: string; dc: string; // closing holders; 'NONE@<HC>' where unfilled
  hc_tenure_seasons: number; oc_tenure_seasons: number; dc_tenure_seasons: number;
  hc_stints: number; oc_stints: number; dc_stints: number;
  regime_id: string;                  // e.g. "NE-2000-Belichick"
  regime_season_n: number;
}
```

Derived: `regime_events` — one row per regime change:

```ts
interface RegimeEvent {
  team: TeamAbbr; season: Season;     // the season the new regime begins
  kind: 'offseason' | 'in_season';
  outgoing_hc: string; incoming_hc: string;
  regime_id: string;
  dm_next1: { season: Season } & (
    { state:'value'; usd:number; asof:AsOf; league_median_usd:number } |
    { state:'blank'; reason:string });
  dm_next2: { season: Season } & ( /* same shape */ );
}
```

### 7.8 Draft marts

```ts
interface DraftPick {
  season: Season;                     // 2000…2025
  team: TeamAbbr;                     // PFR_DRAFT_TEAM_MAP then normalize_team
  round: number; pick: number;        // overall
  player_name: string;
  gsis_id: string | null;             // 95.7% over window
  pfr_player_id: string | null;       // 96.1%
  position: string; side: string | null; college: string;
  chart_value: number;                // Fitzgerald–Spielberger
  games: number | null;               // 91.2%
  w_av: number | null;                // 91.2% — PRIMARY return measure
  seasons_started: number;            // 100%
  probowls: number; allpro: number; hof: boolean;
  // car_av is NOT in this schema — 100% null in source, deliberately excluded
}

interface DraftClassSummary {
  season: Season; team: TeamAbbr;
  n_picks: number; capital: number;           // Σ chart_value
  capital_rank: number;                       // 1…32 in season
  return_games: number | null; return_w_av: number | null;
  return_seasons_started: number;
  n_excluded_no_gsis: number;                 // printed on the card
  snaps_available: boolean;                   // season >= 2013
}
```

### 7.9 Player-season marts

```ts
interface PlayerSeasonCap {
  otc_id: number;                     // INTERNAL KEY — 100% coverage, 1 otc_id → 1 gsis_id
  gsis_id: string | null;             // 91.9% of contracts; 32 gsis_ids map to >1 otc_id
  season: Season;                     // 2013…2025 for team-total-safe use
  team: TeamAbbr;
  position_at_signing: string; position_group: PositionGroup;
  cap_number: number;                 // USD (source is $ millions — ETL converts)
  cash_paid: number;                  // USD, ANNUAL not cumulative
  base_salary: number | null; prorated_bonus: number | null;
  roster_bonus: number | null; guaranteed_salary: number | null;
  cap_percent: number | null;         // 96.6% — DENOMINATOR IS THE ADJUSTED CAP
}

interface PlayerSeasonAvailability {
  gsis_id: string; season: Season; team: TeamAbbr;
  games: number | null;
  off_snaps: number | null; def_snaps: number | null; st_snaps: number | null;  // 2013+ only
  off_pct: number | null;             // a 0–1 FRACTION, not 0–100
}
```

Snap joins go **through `players.parquet` on `gsis_id`, then `pfr_id`** — never a direct
`pfr_id` join to rosters, which matches 34.5% in 2013 and 71.3% in 2023 against 99.99% / 99.95%
bridged. Snap rows filter `game_type = 'REG'`; the postseason uses `WC/DIV/CON/SB` and there is
no `POST` literal.

### 7.10 `player_images` — licence metadata, one row per player

Fields exactly as `audit/findings_image_audit.md` §6, plus `share_alike` and
`last_verified_at`:

```ts
interface PlayerImage {
  player_id: string;                  // otc_id
  has_usable_image: boolean;
  file_title: string | null;          // THE key for re-fetch and takedown
  file_url: string | null;            // a FETCH source, never a hotlink
  width: number | null; height: number | null;
  author: string;                     // non-null only via Artist → Credit → uploader fallback
  license: string;                    // display, e.g. "CC BY-SA 2.0"
  license_machine: string;            // FILTER ON THIS, e.g. "cc-by-sa-2.0"
  license_url: string | null;         // NULL for all 14 PD files — must not be NOT NULL
  attribution: string;                // prerendered credit line
  attribution_required: boolean;      // true for 91.4%
  share_alike: boolean;               // true for 48.0%
  restrictions: string | null;        // 'personality' on 12 files
  verification_method: 'wikidata_p18_team' | 'wikipedia_lead_image' | 'none' | 'api_error';
  wikidata_qid: string | null; wikipedia_article: string | null;
  notes: string | null;
  last_verified_at: string;
}
```

Any non-zero `api_error` count in a refresh run is a **re-run signal, not a result** — a failed
call is never a miss.

### 7.11 `league_cap` — 32 rows, 1994–2025

```ts
interface LeagueCap {
  year: number;
  cap_usd: number | null;             // NULL for 2010 — uncapped year, no denominator exists
  note: string | null; source_url: string; secondary_source_url: string | null;
}
```
2011 is stored exact at **$120,375,000** (NFL Ops rounds to $120.0M). Any view that divides by
`cap_usd` must handle the 2010 null explicitly; 2010 is outside the Tier 2 window anyway.

### 7.12 `position_allocation` — grain `(season, team, position_group)`, 2013–2025

```ts
interface PositionAllocation {
  season: Season; team: TeamAbbr; position_group: PositionGroup;
  cap_usd: number; share_of_rostered_cap: number;   // NOT "share of cap"
  league_share: number; delta_vs_league: number;
}
type PositionGroup = 'QB'|'RB'|'WR'|'TE'|'OL'|'DL'|'LB'|'DB'|'ST';
```

---

## 8. Cross-cutting requirements

**8.1 CSV export on every tabular surface.** Every table and every chart backed by a table
exposes a CSV download. The export contains exactly the rows and columns the reader is looking
at, plus a header comment block carrying: the source mart, the coverage statement, every as-of
date in play, and the URL of the page. Exports are generated client-side from the same typed
rows the view rendered — there is no separate export endpoint that could drift.

**8.2 Coverage flags travel with data.** Every mart row that can be partial carries its
coverage state into the type system (§1.2). A view never infers coverage from a null.

**8.3 Accessibility.** WCAG **AA** across both themes. Colour is never the sole carrier of
meaning in a chart — every series has a direct label or a shape/pattern distinction. Tabular
numerals everywhere. `prefers-reduced-motion` respected.

**8.4 v1 player population.** The player view ships the **251-player audited population**
(2021–2025 top-cap plus the marquee dead-money names) — the exact set the image audit verified,
so every player page has known image status and known licence metadata. Search returns only
that set and says so. Expanding the population is a v2 task that requires re-running the image
pipeline and re-auditing collisions.

**8.5 Traps.** Every engineer touching this data reads **`DATA_AUDIT.md` §6, the known traps
register** — 12 numbered traps, each of which fails silently and plausibly. The `cols`
replication trap alone inflates team totals 3–7× in dollars that look real. `RISKS.md` carries
the pointer.
