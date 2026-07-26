# RESOLUTIONS.md — every divergence and open question, ruled

**Phase B.** Direction lock from Rey, 2026-07-26: **the division cost-per-win hero card follows
Study A, "The Receipt."**

Every row in `PHASE_A_TOKENS.md` §13 (D1–D15), every open question in `PHASE_A_STUDIES.md` (Q1–Q5),
and every conflict in `PHASE_A_COVERAGE.md` §9 (C1–C6) is answered here.

**Status key**

| Status | Meaning |
|---|---|
| **RESOLVED** | Ruled here. Defensible on cited evidence, **and overridable** — Rey can reverse any of these and the reversal is a token or a paragraph, not a redesign. |
| **NEEDS-REY** | Ruled here **and** it amends a brand rule, a product rule, or a budget line. It ships on this ruling unless Rey says otherwise, but he must see it. |
| **RESOLVED-BY-SPEC** | Not a design decision. `SPEC.md` or `DECISIONS.md` already settled it; recorded so it is not re-litigated. |

---

## 0. The NEEDS-REY list, in one place

| # | What | Amends | Where |
|---|---|---|---|
| 1 | **Rajdhani is the athletic face.** Squadron Black exists in no artefact; Rajdhani is the only face in the kit that serves the 400/500/600 ladder. **Token value unchanged.** Gate #2's font line goes to **$0**. | The brand's named athletic face; `BUILD_PLAN.md` gate #2 | D2 · `TYPE.md` §2 |
| 2 | **The lime dual-meaning rule.** Lime = the subject on team/H2H surfaces; lime = favourable-vs-benchmark on subjectless league/division surfaces. One meaning per surface, selected by a `subject` prop, and the card states which mode it is in. | The settled "lime = selected series" rule, by adding a second authorised meaning | Q1 · `COMPONENTS.md` §1.3 |
| 3 | **Red for dearer-than-average is a genuine negative** — but only on a benchmark axis, only where the benchmark is rendered, and never on a comparison series. | Nothing; it *interprets* the brand's "genuine negative only" | Q2/D3 · `COMPONENTS.md` §1.3, §5.1 |
| 4 | **Who is `/` for?** Benchmark mode leads with the division's cheapest; subject mode leads with the reader's team. The design supports both; which one `/` uses is a product call. | Product scope | Q3 · `COMPONENTS.md` §1.3 |
| 5 | **The brand's guideline page contradicts its own chart rule** (`.bar{linear-gradient(to top,#4f7413,var(--lime))}` against *"do not use gradients inside quantitative bars"*). The mockup is on the correct side; the guideline page should be corrected rather than copied. | The brand kit's `index.html` | D9 |
| 6 | **The logo SVGs ship as live `<text>` in Bebas Neue with `font-weight="700"`** and render in Arial Narrow on any machine without the font. Delivery bug in the identity assets, outside `design/system/`. | Identity assets | D11 · `TYPE.md` §8 |
| 7 | **Rajdhani and Inter are not shipped in the handoff** (Google Fonts only) and must be self-hosted before launch — `DECISIONS.md` 56 rules out third-party requests. | Asset delivery | `TYPE.md` §8 |

---

## 1. Divergences D1–D15

### D1 — Utility type scale · **RESOLVED**

> Mockup 8–10.5px labels vs the brand's 13–16px mobile section-label floor.

**Ruling: one utility floor at 11px, one 10px exception for tracked all-caps inside a data mark.**
Full derivation, the measured effect on The Receipt at 390px, and the system-wide consequences are
in `TYPE.md` §3.

Two findings decided it:

1. **The mockup's utility layer does not pass AA as drawn.** `#6E8078` — the most-used hex in the
   file, 48 uses, every one text — measures **4.11:1** on the mobile card. `#71807A` measures
   **3.82:1** on paper. AA for text below 18.66px bold / 24px regular is 4.5:1, and every one of
   those uses is a label at 8–10.5px. `SPEC.md` §8.3 makes AA non-negotiable. So "keep the mockup"
   was never available regardless of what the brand says.
2. **The brand's own guideline page runs below its own stated floor** — `.card-label` at 13px,
   `.metric small` at 10px, against a stated 14–18px desktop section-label floor. The brand's type
   table describes editorial and campaign surfaces (its Hero row is 120–176px; the mockup's largest
   display type is 76px). Its floors are honoured on the tiers it actually names.

**The result on the hero card:** the composition survives at 390 intact. Card height 360 → 371px on
an 844px canvas; the team column widens 74 → 84, the value column 74 → 78, the bar narrows 166 → 146,
and the delta drops the words `vs LG` — which the strap and the gold tick already say twice. Nothing
is dropped at 390. At square the card drops the **rank digits, the delta line, the nickname and the
toggle** rather than shrinking type.

Also fixed here: `--yy-ink-dark-3` moves `#6E8078` → **`#849489`** (5.38:1) and `--yy-ink-light-3`
moves `#71807A` → **`#616E69`** (5.33:1 white / 4.91:1 paper). The originals survive as
`--yy-ink-*-dim` for **non-text use only** (≥3:1 graphical objects — inactive tab *icons*, tick
marks, decorative rules). The tab bar splits accordingly: dim icon, `-3` label.

### D2 — Athletic face hardcoded; Squadron Black absent · **NEEDS-REY**

**Ruling: Rajdhani is the working athletic face. The token value does not change.**
`--yy-font-athletic` keeps its published value verbatim; Squadron Black is not installed anywhere, so
the stack already falls through to Rajdhani on every machine. Zero-diff token, explicit documented
amendment, and **the default action on gate #2 is to do nothing**.

Rationale: Squadron Black appears in zero lines of implemented CSS and nothing in this product has
ever been drawn in it; the mockup runs a **three-weight** athletic ladder (400/500/600) in product
screens and Rajdhani is the only face in the kit that can serve it — Squada One and Bebas are
single-weight 400 and "Squadron **Black**" is by name one weight; and the brand prescribes `700`,
which is the one weight the product never uses.

**Gate #2 finding: the font line is $0.** Recorded here, not edited into `BUILD_PLAN.md`.
Three re-qualification checks if Squadron is ever licensed are in `TYPE.md` §2.

D2's real cost is the **111 hardcoded call sites**, which make `SPEC.md` §4's "single token value"
premise false as drawn. Every athletic call site in this system routes through
`var(--yy-font-athletic)`; a component naming a font family literally fails review.

### D3 — Red used as a comparison series · **RESOLVED (see also NEEDS-REY #3)**

**Ruling: red never carries a comparison series. The red family splits by role instead of by shade.**

| Token | Role |
|---|---|
| `--yy-negative` `#D9503C` | **Fill only.** 4.22:1 on the dark card — legal as a graphical object (≥3:1), illegal as text. |
| `--yy-negative-soft` `#E8A08D` | **Text weight on dark.** 8.05:1. This is what the mockup's dead-cap KPI already does; it is now the rule rather than a coincidence. |
| `--yy-negative-ink` `#B33A26` | Text on light. 5.92:1 white / 5.45:1 paper. `[MOCKUP INK map]` |

**What carries a comparison series instead:** `--yy-series-compare` `#8FA39A` on dark and
`#5A6B63` on light — the mockup's own mid-band slate and its own `INK`-map pair, and exactly what
`[BRAND]` prescribes (*"White / muted gray: comparison series on dark backgrounds"*). Plus a
**pattern distinction** — a 45° hatch on bars, `--yy-dash-compare` on lines — so `SPEC.md` §8.3 is
satisfied without colour.

**Second correction, unprompted:** the mockup's dashed salmon means two things at once —
*"void/dead"* (a negative) and, by extension, *"does not exist"* (not a negative at all). A blanked
2013 Cap+ season is not a criticism of the team. Absence splits off into a neutral
`--yy-absence` (`rgba(168,177,173,.55)`); `--yy-void-rule` keeps the mockup's salmon verbatim for the
case where it genuinely is a negative. Two dashed rules, two legend entries.
(`CHART_ANATOMY.md` §5.1.)

**Consequence, overridable:** the hero card's zero-win row uses the **neutral** absence rule and
neutral ink. Study A drew it in salmon. `SPEC.md` §2.5's whole point is not to editorialise a
divide-by-zero.

### D4 — No dark-surface tokens in brand · **RESOLVED**

**Ruling: the mockup's three neutral gradients ship as the surface tokens** — they are the visual
source of truth and they work. The brand's one hint (*"dark cards may use a subtle
top-left-to-bottom-right green gradient"*) is honoured by giving it the one job where it means
something: `--yy-surface-card-accent`, used on the **subject card**, which the mockup already draws
as a lime wash. The same edit removes the D15 leak (below).

### D5 — Effective 2px grid, not 4px · **RESOLVED**

**Ruling: 4px base, one documented half-step (`--yy-space-0h`, 2px) legal only inside a data mark.**
Every off-grid value maps to the nearest 4px step:

| Mockup | → | Mockup | → | Mockup | → |
|---:|---:|---:|---:|---:|---:|
| 2 | 2 (half-step) | 7 | 8 | 13 | 12 |
| 3 | 4 | 9 | 8 | 14 | 16 |
| 5 | 4 | 10 | 12 | 18 | 16 |
| 6 | 8 | 11 | 12 | 22 | 24 |
| | | | | 26 | 24 |

**Three visible consequences, stated up front:** mobile card padding `12px 13px` → `12px 12px`;
desktop card padding `26px 28px` → `24px 28px`; leaderboard row padding `9px` → `8px`, which with the
D1 type change puts row height at 48px (32 rows = 1,536px of scroll). Also fixed here: the tab bar's
hardcoded `22px` bottom inset becomes `--yy-safe-bottom` = `env(safe-area-inset-bottom, 24px)`.

### D6 — Tabular numerals absent, policy has a hole · **RESOLVED**

**Ruling: by alignment need, not by face preference.** A figure **in a column** is
`--yy-font-num` (Inter 600) + `tabular-nums` + `"tnum" 1,"ss01" 1`. A **standalone** figure may be
`--yy-font-athletic`. Full statement in `TYPE.md` §5.

This satisfies `SPEC.md` §4 literally ("every numeric **column**, always"), is robust whether or not
Rajdhani carries `tnum` (`font-variant-numeric` is a silent no-op on a face that lacks it), keeps the
mockup's display character on every big number, and is the brand's own instruction in its own words:
*"Default tables use Inter with tabular numerals."*

**Visible change from the mockup, overridable:** the leaderboard's index column moves from Rajdhani
600 to Inter 600. **One-token reversal** if Rajdhani is verified to carry `tnum`: repoint
`--yy-font-num` to `var(--yy-font-athletic)`.

### D7 — No light rendering of any chart · **RESOLVED**

**Ruling: a semantic token layer, with three things that change *kind* in light mode rather than
value** — because `SPEC.md` §4 asks for a designed light theme, not an inverted dark one.

1. **Card elevation.** Dark cards are separated by a gradient; a white card on a paper page has no
   gradient to separate it, so light mode gains `--yy-elevation-menu` on floating surfaces and
   relies on `--yy-line-card` for cards.
2. **The selected tint.** Lime at 6% on white is invisible (1.55:1). Light mode tints with
   `--yy-lime-ink` at 8% instead. Same for the focus ring: lime is **1.55:1 on white** and cannot be
   the light-mode ring; it flips to `--yy-lime-ink` (5.47:1).
3. **Chrome stays dark in both themes.** It is the brand's End Zone band, it is what makes the light
   theme read as the same product, and it is where the brand's 25% End Zone allocation lives.

Every chart element has a light pair (`CHART_ANATOMY.md`), seeded by the mockup's own `INK` map,
which `PHASE_A_TOKENS.md` §1.4 correctly calls the most valuable single artifact in the extraction.

### D8 — Mobile card radius below the brand floor · **RESOLVED**

**Ruling: 16px → `--yy-radius-card-sm` = 18px**, the bottom of the brand's stated 18–24 range. A 2px
change across 13 cards, invisible in isolation, and it removes the only radius divergence in the
system.

**The mockup's 11 / 12 / 14px pill radii all collapse to `--yy-radius-pill` (999px)** — every one of
them was an attempt at a full pill on a 22–28px control. Final radius set: `2` (marks) · `4` (chips)
· `8` (controls, published) · `18` (mobile card) · `22` (desktop card, published) · pill.

### D9 — The brand page breaks its own chart rule · **NEEDS-REY (informational)**

**Ruling: the mockup is correct; the guideline page is the error.** The rule stands — no gradients
inside quantitative marks, anywhere. The brand kit's `index.html` should be corrected rather than
copied. No change on our side.

### D10 — Comparison line weight below the product floor · **RESOLVED**

**Ruling: `--yy-stroke-compare` = 2px** (was 1.6). `[BRAND]`: minimum 2px in product UI.
The distinction from the 3px subject line narrows, so it is compensated on two other channels —
opacity `.85` and `--yy-dash-compare` — which `SPEC.md` §8.3 wanted anyway.

### D11 — Display face faux-bolded · **RESOLVED**

**Ruling: `--yy-weight-display` = 400, always.** Bebas Neue is a single-weight family; `700` is
synthetic and degrades it. Emphasis moves to size and `--yy-track-display-wide`, which at all-caps
reads heavier than a synthetic bold and stays crisp at 13px.
**The logo SVG delivery bug is NEEDS-REY #6** — separate problem, outside `design/system/`.

### D12 — Colour ratios inverted on mobile · **RESOLVED**

**Ruling: the brand's 55/25/12/6/2 ratio is a light-theme and marketing-surface composition ratio.**
It cannot describe a dark theme, which is by definition ~0% paper. Restated as two, with one shared
invariant:

| | Surface | Ink/neutral | Lime | Gold |
|---|---:|---:|---:|---:|
| Light theme | 55% paper/white · 25% End Zone (chrome) | 12% | ≤6% | ≤2% |
| Dark theme | ~70% app + card | ~18% | ≤6% | ≤2% |

**The invariant that survives both, and is the enforceable part: lime ≤ 6% and gold ≤ 2% of painted
area, measured per screen.** That is exactly what the brand is protecting against
(*"making either one the dominant page color will turn the product into an energy drink"*).
One lime element may be large — the 64px hero metric — provided the screen total stays under the cap.

### D13 — Film Room scoped to one element · **RESOLVED**

**Ruling: `--yy-film-room` becomes the chrome band colour in both themes** — the tab bar, the flat
fallback behind the header gradient, and the dark-feed reference in the export rig. That is the
brand's stated role (*"neutral black, text and interface chrome"*) instead of the mockup's 1/20th of
it.

### D14 — Motion unspecified on both sides · **RESOLVED (originated)**

**Ruling: a restrained broadcast set** — five durations, three easings, one stagger. Tokens in
`tokens.css` §21; per-chart behaviour in `CHART_ANATOMY.md` §6.

**What animates:** selection state (pill fill, tab underline, row tint) · disclosure height ·
mark position/length on a data change · menu open/close · sort re-order (FLIP).

**What never animates:** chart entry on first paint (`SPEC.md` §4, verbatim) · number count-ups
(they break tabular alignment mid-flight and show values that were never measured) · the gold
benchmark (a benchmark that moves is a benchmark that lies) · any coverage state (a blank that fades
in reads as loading) · the product mark, the SAMPLE chip, the as-of stamp · anything inside
`.yy-export`.

**The one rule that prevents lying with motion:** *if the scale domain changes, nothing animates —
the chart cross-fades over `--yy-dur-fast`. If the domain is stable, marks animate over
`--yy-dur-chart`.* Animating marks under a changing axis flies every mark through positions that
were never true of either dataset.

**`prefers-reduced-motion`** redefines the duration tokens themselves to `1ms` in `tokens.css` §26,
so no component writes the query. Transitions still fire — state changes still commit, they simply do
not travel.

Only one easing carries any "broadcast" character: `--yy-ease-snap`
(`cubic-bezier(.34,.8,.24,1)`), a slight settle with **no overshoot**, used only on selected-state
moves. Nothing in this product bounces.

### D15 — Reference-only palette leak · **RESOLVED**

**Ruling: removed.** `#031427` is the surface colour of the reference-only stitch exploration and it
leaked into the source of truth twice. The `α=0` gradient stop becomes `rgba(7,28,22,0)` (End Zone at
0 — visually identical) and the `α=.6` scatter-dot stroke becomes `rgba(7,28,22,.6)`. Both values are
now brand-sourced. No Rey needed; this is a leak, not a decision.

---

## 2. Open questions Q1–Q5 (`PHASE_A_STUDIES.md`)

### Q1 — What does lime mean on this card? · **NEEDS-REY #2**

**Ruling: one meaning per surface, selected by a `subject` prop, and the card states which mode it
is in.**

| `subject` | Surface | Lime means |
|---|---|---|
| undefined | `/`, `/division/{div}` — no subject exists | **favourable vs. the benchmark** |
| set | `/team/{abbr}/{season}` — the page has a subject | **the subject**, even when it is the most expensive row |

Colliding views, specified:

- **The hero card appears on both `/division` and `/team`** — same component, two colour meanings.
  Resolved by the prop, and disclosed to the reader in the strap:
  benchmark mode reads `LEAGUE AVG $25.8M / WIN`; subject mode reads
  `BUF vs LEAGUE AVG $25.8M / WIN`. A screenshot therefore still says which mode it is in.
- **`/compare`** has two subjects and neither is favourable. Lime = side A, `--yy-series-compare` =
  side B, and **favourability is not encoded by hue at all** — it is encoded by distance from each
  side's own gold benchmark.
- **`/player/{id}`** has one subject and **no** favourability encoding anywhere (`SPEC.md` §3.3.7).
- **The league leaderboard** is subjectless: lime = Cap+ ≥ 105. The reader's focus row is
  distinguished by tint + a left rule, not by turning the row lime — otherwise the two meanings
  collide on the one surface that has 32 rows.

In subject mode all other rows go neutral. Distance from the benchmark is still carried — by the gold
tick and the signed delta — just not by hue.

### Q2 — Is "dearer than average" a genuine negative? · **NEEDS-REY #3**

**Ruling: yes, with two constraints.**

**Yes**, because: paying more per win than every other team in the league is, in this product's own
terms, an unfavourable outcome — the product's mission is literally *"was it worth it?"*; the brand's
prohibition is against red-as-decoration and red-because-the-team-wears-red, neither of which this
is; and the mockup already uses red for exactly this on **three** independent surfaces (the `<95`
index band, the movers' negative side, the diverging bars).

**Constraint 1 — red requires a rendered benchmark.** "Above average" is only meaningful against a
named average, so a card that uses red for above-benchmark **must render the benchmark on the same
surface**. A card without a visible benchmark may not use red.

**Constraint 2 — red never carries a comparison series** (D3), and red is **fill-only** on dark
(`--yy-negative`, 4.22:1); text takes `--yy-negative-soft` (8.05:1).

**Where red therefore does *not* appear, despite looking like it should:** `/compare` (neither side
is a negative) · the allocation bars (over/under-allocation is not favourable/unfavourable — see
§3 below) · any zero-win row (a suppressed ratio is an absence, not a negative) · any blanked season.

### Q3 — Which figure leads: the division's best, or the viewer's team? · **NEEDS-REY #4**

**Ruling: it falls out of Q1 and needs no separate mechanism.** Benchmark mode leads with the
division's cheapest, ranked. Subject mode pins the subject first **and still shows its true rank** —
a `4` on a first-position row is correct and is the point. Which mode `/` uses is a product question
(who is `/` for), not a design one; the design supports both and the switch is one prop.

### Q4 — Where does the cash-lens caveat live at 390px? · **RESOLVED**

**Ruling: an always-visible short form on the card, the full sentence one tap away in-card, and every
export force-expands it.** Full spec in `COMPONENTS.md` §1.8.

- **(a)** `CASH · ROSTER ONLY` renders at every size, in every crop, never truncated. Those three
  words are the caveat's operative content.
- **(b)** The full sentence expands **inline, in-card, pushing the strap down** — a
  `grid-template-rows: 0fr → 1fr` disclosure, not a tooltip, not a hover, not a modal. Two lines,
  42px; the card goes 371 → 413px on an 844px canvas.
- **(c)** `export` forces it open, with no button and no collapsed state. **A screenshot cannot be
  tapped, so a screenshot never hides a caveat.** This generalises:
  *any affordance that hides required text is expanded in export, never removed.*

Why this satisfies §2.1: the "no tooltip-only" prohibition in §2.1 is written for **dead money**
("value, date and stage always render together"), and dead money is prohibited from the disclosure
pattern entirely everywhere in this system. The **cash** lens requires the caveat be *rendered on the
lens*, which (a) does at every size.

### Q5 — The type-scale question lands here first · **RESOLVED**

See D1. Settled on The Receipt at 390px, measured, then generalised. The studies were right that it
had to be settled here: at the brand's stated 13–16px the composition would have lost a row, and at
the mockup's 8.5px it fails AA. The 11px floor does neither.

---

## 3. Conflicts C1–C6 (`PHASE_A_COVERAGE.md` §9)

### C1 — Weekly / in-season framing · **RESOLVED-BY-SPEC**

`SPEC.md` §2.1: *"Season-final snapshot semantics… No 'as of week N' cap view is possible and none
may be built."* `DECISIONS.md` 57: v1 data is a static preseason snapshot.

Five modules and two navigation elements in the mockup rest on a cadence the data cannot support.
**Design consequence, recorded:** the `W6` header chip and the `2025 · WEEK 6` picker are removed
(`COMPONENTS.md` §15); `MOVERS · WEEK 6`, `WEEKLY SWING` and the `COST-PER-WIN CLOCK` are re-based
on **season-over-season** deltas, which the data does support, and are out of the v1 inventory
either way. No design work is lost — the movers geometry (gold zero line, bar offset by sign)
transfers unchanged to a Δ-vs-last-season card.

### C2 — `PLAYER VALUE QUADRANT` is a per-player value grade · **RESOLVED-BY-SPEC**

`SPEC.md` §3.3.7 and `DECISIONS.md` 51: no composite player rating, letter grade, worth-it verdict,
star count or invented per-player score. Ever. Published in `METHODOLOGY.md`, enforced in review.

The quadrant plots named players on cap hit × production, colours them good/neutral/bad, and labels
the corners `BARGAIN` and `ALBATROSS`. It is a worth-it verdict delivered by position and colour
instead of by number. **It cannot ship on a player surface and it is not in this system.**
`CAPPLUS_LOCKUP.md` §4.1 rule 4 makes the general form of the prohibition permanent: **there is no
Player+ and there never will be.**

The geometry survives at **team level with position groups and no verdict encoding** (no good/bad
colour, no corner labels) — but that is not a v1 row and it is not specified here.

### C3 — Red as a comparison series · **RESOLVED** — see D3.

### C4 — Every dead-money figure renders without its date · **RESOLVED**

`SPEC.md` §2.1: value, date and stage always render together; no compact variant, no tooltip-only
date.

**Ruling: `<AsOf>` is a component, not a formatting convention, and it is the only way dead money
renders.** `$85.2M · as of 2024-11-27 · late season` on one line, in one visual block.
**A `KpiTile` that receives a dead-money value throws in development.** If the stamp does not fit the
container, the container is wrong. Dead money is the one place in this system where the §1.8
disclosure pattern is **prohibited**. (`COMPONENTS.md` §8.1.)

### C5 — Cap labelling conflicts with the lens rules · **RESOLVED-BY-SPEC**

`SPEC.md` §2.1 and §2.6, `DECISIONS.md` 24 and 28. Forbidden copy, everywhere: "cap used", "cap
utilization", "% of cap", "share of cap by position group", "where $233M goes".

**Design consequence, which is the part that is design work:** the correct labels are longer.
`CAP HIT (SEASON-FINAL)` is 21 characters and wraps to two lines in a 3-column desktop layout, so
the three-lens block reserves **two label lines at every size** to keep the figures baseline-aligned.
Allocation renders *"share of cap held by players on the roster"* plus the denominator caveat as a
full sentence beneath the chart (`COMPONENTS.md` §6, §7.3).

### C6 — Leaderboard shows 12, SPEC requires 32 · **RESOLVED**

`SPEC.md` §3.1.3: *"Not a top-10. The full table."*
**Ruling: all 32, one scroll, no pagination, no virtualisation, no "show more".** Sticky pill +
header group; row height 48px at the D1 floor; 1,536px of scroll, which is 1.5 screens. Blank-Cap+
teams group at the bottom under a labelled heading rather than interleaving or sorting as zero.
An **export** that shows fewer must say so on the card (`SCREENSHOT_VARIANTS.md` §3 —
`TOP 10 OF 32`). (`COMPONENTS.md` §2.2.)

---

## 4. Rulings made in Phase B that were not on anyone's list

Recorded separately because nobody asked for them and Rey should be able to find them.

| # | Ruling | Why | Reversal cost |
|---|---|---|---|
| **N1** | **Allocation diverging bars are not coloured by sign.** The mockup renders overweight-vs-league in lime and underweight in red. Spending more on receivers than the league average is not a positive and less on the D-line is not a negative — that is a **value grade on a roster construction decision**, the exact judgment `DECISIONS.md` 51 forbids. Bars go neutral; the gold zero axis carries the benchmark; lime is freed for the selected group. | `SPEC.md` §3.3.7 · §2.6's own denominator caveat | One line. Visibly changes the mockup's `SPEND MIX` card. |
| **N2** | **The allocation centre rule changes colour.** The mockup uses `rgba(234,241,236,.28)` on an `rgba(7,28,22,.06)` track — light-on-light, near-invisible on the light desktop card. It becomes the gold benchmark axis (4.52:1 on paper as `--yy-gold-ink`). | AA; `PHASE_A_COVERAGE.md` row 19 flags it | One token |
| **N3** | **Team Rating is never band-coloured.** The `≥105`/`95–104`/`<95` bands are a Cap+ encoding; applying them to a performance-only rating tells the reader the two numbers are the same metric. | `DECISIONS.md` 18 | One conditional |
| **N4** | **A nine-step categorical ramp is not achievable in this brand and the system does not ship one.** Measured all-pairs minimum ΔL\* ≈ 2 across the best green/slate nine-set. Nine-group surfaces encode by position + label + magnitude. `--yy-pos-1…5` ship with a hard cap of five simultaneous categories. | Team colour is never a chart colour; red reserved; gold benchmarks-only; lime capped at one series — there is no ninth hue available | Would require a brand extension |
| **N5** | **The Value Stadium's sections are not colour-coded by position group** — `--yy-bg-track` with one lime highlight; the gold ring, the unlit seats and direct labels carry the rest. Not a v1 row; recorded so it is not designed wrongly later. | N4 | — |
| **N6** | **Season options are never disabled for lack of coverage.** A year with no Tier 2 data is selectable and the page renders the boundary message. Greying it out hides the product's own coverage story behind a disabled control. | `SPEC.md` §1.2 — absence is shown, not hidden | One line |
| **N7** | **The 32-team palette recommendation** `SPEC.md` §4 asks the design track for, written down: team colour is never a chart colour; it appears in exactly one place, the TeamMark fallback chip; in dense lists TeamMark runs at `xs` and `opacity:.85`; identity in a list is carried by the abbreviation, and the test is whether the list still reads with `TEAM_LOGOS_ENABLED = false`. | `[MOCKUP]`'s implicit answer, now explicit; `[BRAND]` prohibitions | Written ruling |
| **N8** | **`--yy-shadow` (published, used zero times in the mockup) is scoped to floating overlays in light mode only.** Cards are border + gradient in both themes. The published token gets a job instead of being orphaned. | Extend-never-rename means the token stays; it should mean something | One token |
| **N9** | **The `+` in Cap+ is never coloured.** The brand already owns a coloured glyph — the lime slash — and a second one four characters long halves its distinctiveness and spends the lime budget on punctuation. The `+` is brandable by geometry (0.82em, raised 0.06em in Bebas). | `[BRAND]`: the slash is *"the central visual device"* | One rule |

---

## 5. What is still open after this document

Nothing in D1–D15, Q1–Q5 or C1–C6. What remains is **production**, not decision:

| Item | Status |
|---|---|
| The eight icons | Geometry fully specified (`COMPONENTS.md` §15.4); the drawings do not exist |
| League **Field** and team **Drive** compositions | Anatomy specified (`CHART_ANATOMY.md` §7); the compositions do not exist |
| **Value Stadium** | Semantics settled (`DECISIONS.md` 44) + N5; not a v1 row |
| `/credits` and `/methodology` page designs | Content-led; the components they need all exist here |
| Self-hosting Rajdhani + Inter | NEEDS-REY #7 — a build task with a launch deadline |
| Rajdhani `tnum` verification | Build task. Determines whether `--yy-font-num` can be repointed. |
