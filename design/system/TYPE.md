# TYPE.md — the YIELD/YARD type system

**Phase B. Binding.** Every value here exists as a token in `tokens.css` / `tokens.json`.
Nothing in a component sets a raw `font-size`, `font-weight`, `line-height` or
`letter-spacing`; it composes the recipes in §6.

Provenance keys as in `tokens.css`: `[BRAND]` `[MOCKUP]` `[PHASE-A]` `[STUDY]` `[RULED]`.

---

## 1. The three faces, as shipped

| Role | Face | Token | Weights used | Status |
|---|---|---|---|---|
| Display | **Bebas Neue** | `--yy-font-display` | **400 only** | Shipped OFL in the handoff kit. Unchanged. |
| Athletic / utility | **Rajdhani** | `--yy-font-athletic` | 400 · 500 · 600 | **Working face. Formally amends the brand's named face — see §2.** |
| Body / prose | **Inter** | `--yy-font-body` | 400 · 600 | Unchanged. |
| Tabular figures | **Inter** | `--yy-font-num` | 600 | New token. See §5. |

**Bebas is 400, always.** The mockup applies `font-weight:700` to Bebas in 15 declarations and the
brand's own logo SVGs do the same. Bebas Neue is a single-weight family; 700 is a synthetic bold and
it degrades the face. `[BRAND]` publishes `font-weight: 400` for the display stack and that is what
ships. Where the mockup used 700 for emphasis, the emphasis moves to **size and tracking** —
`--yy-track-display-wide` (0.1em) on all-caps Bebas reads heavier than synthetic bold and stays
crisp at 13px. (Divergence **D11**.)

**Squada One and DM Serif Display are not in the system.** Squada One is requested by the mockup and
used zero times; DM Serif is shipped and requested by nothing, and no serif appears anywhere in the
brand or the mockup. Neither has a role. Both stay in the kit as assets; neither gets a token.
Removing the mockup's Squada One font request is a one-line cleanup for the build.

---

## 2. ATHLETIC FACE RESOLUTION — Rajdhani is the working face

**This formally amends the brand's named athletic face and needs Rey's sign-off. It does not change
a token value.**

### What is actually true

- **Squadron Black exists in no artefact.** It is named by the brief, by `SPEC.md` §4, by
  `design.md`, and pictured on `assets/reference-board.png`. It appears in **zero** lines of
  implemented CSS, is not in the kit, and **nothing in this product has ever been drawn in it**.
- **The mockup runs a three-weight athletic ladder in product screens** — 400 ×25 (values), 500 ×60
  (the workhorse label weight), 600 ×23 (metrics). `[MOCKUP]`
- The brand prescribes `font-weight: 700` for the athletic face, **which is the one weight the
  product screens never use.** `[BRAND]`
- **Rajdhani is the only face in the kit that can serve that ladder.** Squada One and Bebas Neue are
  single-weight 400 display faces; "Squadron Black" is by name a single Black weight. Substituting
  any of them collapses a three-step hierarchy to one step, and every place the product
  distinguishes a label (500) from a value (600) stops distinguishing.

### The ruling

**Rajdhani is the athletic face the system is designed, measured and shipped against.** Its 400 /
500 / 600 ladder is load-bearing: the utility scale in §4 assumes it, the row anatomies in
`COMPONENTS.md` assume it, and the AA measurements in §7 were taken on it.

**The token value does not change.** `--yy-font-athletic` keeps its published value verbatim:

```css
--yy-font-athletic: "Squadron Black", "Rajdhani", "Arial Narrow", sans-serif;
```

Because Squadron Black is not installed anywhere, the browser falls through to Rajdhani on every
machine today. That is the behaviour we want, it honours extend-never-rename with a zero-diff token,
and it means **the default action on gate #2 is to do nothing**.

**If Squadron Black is ever licensed it may not simply render.** It must first pass three checks,
because it will silently take over 100% of the athletic layer the moment it is installed:

1. Does the licence include **400, 500 and 600** (not just Black)? If not, the label/value hierarchy
   collapses and the utility scale must be re-drawn.
2. Does it carry **tabular figures**? (Currently moot — see §5 — but it becomes live if
   `--yy-font-num` is ever repointed.)
3. Do its **cap height and set width** hold the column widths in `COMPONENTS.md` at 11px? Every
   fixed-width column in the system was measured against Rajdhani.

### The one Phase-B task this creates

**D2's real cost is the 111 hardcoded call sites, not the licence.** The mockup writes
`'Rajdhani',sans-serif` 111 times and never routes through the token, so `SPEC.md` §4's premise
("the substitution is a single token value") is false as drawn. Every athletic call site in this
system routes through `var(--yy-font-athletic)`. A component that names a font family literally
fails review.

### The gate-#2 finding

`BUILD_PLAN.md` gate #2 budgets "Squadron Black price TBD" against a $200 ceiling.
**On this ruling the font line is $0** and gate #2 reduces to the domain (~$15/yr). Recorded here,
not edited into `BUILD_PLAN.md`. → **NEEDS-REY.**

---

## 3. D1 — THE UTILITY SCALE. Resolved on the hero card first.

`PHASE_A_STUDIES.md` open question 5: *"D1 is not an abstract divergence; it is a layout decision on
the product's hero unit, and it should be settled on this card before it is settled anywhere else."*
So it is settled here, on The Receipt at 390px, and then generalised.

### 3.1 The disagreement, restated precisely

| | Section label | Data label | Body |
|---|---|---|---|
| `[BRAND]` type scale, mobile | 13–16px | 11–13px | 16px |
| `[MOCKUP]`, mobile | **8–10.5px** | **8–9.5px** | 11.5–12.5px |

The mockup runs 30–45% below the brand on every utility row. **9px alone accounts for 43
declarations.**

### 3.2 Two findings that decide it

**Finding 1 — the mockup's tertiary ink fails AA at any of these sizes.** `#6E8078` (the single
most-used hex in the file, 48 uses, every one of them text) measures **4.11:1** on the mobile card
surface `#181C1D`. WCAG AA for text below 18.66px bold / 24px regular is **4.5:1**. Every one of
those 48 uses is a label at 8–10.5px. `#71807A` on light measures **3.82:1** on paper. So the
mockup's utility layer is not merely small — **as drawn it does not pass AA at all**, and `SPEC.md`
§8.3 makes AA non-negotiable across both themes. The scale question cannot be answered by keeping
the mockup as-is regardless of what the brand says.

**Finding 2 — the brand's own guideline page does not obey the brand's stated floor.**
`uploads/yield-yard-brand-kit/index.html` sets `.card-label` (athletic caps) at **13px** and
`.metric small` at **10px**, against a stated desktop section-label floor of 14–18px. The brand's
type-scale table is written for **editorial and campaign surfaces** — read the top of it: Hero
120–176px, H1 80–104px. The mockup's largest display type is 76px, *below* the brand's H1 minimum.
The table is not, and has never been, a description of a dense product surface. Its floors are still
worth honouring where they describe something the product actually has.

### 3.3 The ruling

**One utility floor: 11px. A single 10px exception, and it may never carry a comparison.**

| Tier | Token | Mobile | Desktop | Face / weight | What it is | Was `[MOCKUP]` |
|---|---|---:|---:|---|---|---|
| Micro | `--yy-size-micro` | 10px | 10px | Rajdhani 500/600, caps, ≥`--yy-track-label` | **In-mark text only**: heat-cell values, in-bar percentages, legend swatch text, the SAMPLE chip | 8 / 8.5px |
| Label | `--yy-size-label` | **11px** | 11px | Rajdhani 500, caps for eyebrows | Axis ticks, legends, chips, pills, row sub-lines, column headers, deltas, benchmark strap | 8.5 / 9 / 9.5 / 10 / 10.5px |
| Label-lg | `--yy-size-label-lg` | **13px** | 14px | Rajdhani 500/600, caps | Anything that **names a surface**: tab-bar labels, nav items, sort headers, section labels | 9–11px |
| Card title | `--yy-size-display-xs` | **14px** | 18px | Bebas 400, `--yy-track-display-wide` | The title inside a card | 12–13px Bebas 700 |
| Caption | `--yy-size-caption` | 13px | 13px | Inter 400 | Explanatory copy inside a data card; caveat lines; as-of stamps in prose | 11.5–12.5px |
| Body | `--yy-size-body` | **16px** | 16px | Inter 400 | Prose surfaces: `/methodology`, deks, entry cards, boundary messages, the cross-era statement | 14px (desktop dek only) |

**Six mockup sizes (8, 8.5, 9, 9.5, 10, 10.5) collapse into two (10, 11).**

Check against the brand's own table: data label mobile 11–13 → we take **11**, at the floor ✅ ·
section label mobile 13–16 → we take **13**, at the floor ✅ · body mobile 16 → **16** ✅.
**The only tier below the brand's table is the 10px micro tier, and the brand's own guideline page
uses 10px for exactly that job.** `[BRAND index.html]`

The distinction between "body" and "caption" is the other half of the ruling: **explanatory copy
inside a data card is a caption, not body.** The brand's Body row governs prose surfaces. Raising a
card's inline note from 12px to 16px would blow up every card in the product for no legibility gain
a reader asked for; raising it to 13px clears the small-text problem and holds the layouts.

### 3.4 What this does to The Receipt at 390px — measured

Card width 390, padding `--yy-space-4` (16) → content **358px**.

**Vertical.** Sub-line 8.5→11px and delta 9→11px grow each row's content box from ~36px to ~38px.
Four rows: **+8px**. The head's eyebrow 9→11px: **+2px**. The footer strap is governed by the 13px
product mark and does not move. **Card height goes from ~360px to ~371px on an 844px canvas.**
The Receipt is not height-constrained. **Nothing is dropped at 390.**

**Horizontal — this is where it actually bites.** Two columns overflow at 11px:

| Element | At 9px | At 11px | Fix |
|---|---:|---:|---|
| Sub-line `BILLS · 13–4` | ~62px in a 74px column | ~76px | **Team column 74 → 84px** |
| Delta `−$7.5M vs LG` | ~68px in a 74px column | ~82px | **Drop `vs LG`; render `−$7.5M`. Value column 74 → 78px** |

Dropping `vs LG` is an improvement, not a concession: the benchmark is named once in the footer
strap (`LEAGUE AVG $25.8M / WIN`) and ticked in gold on **every** bar. Repeating "vs LG" four times
was restating a benchmark the card already carries twice.

Resulting mobile geometry: `rank 14 + gap 12 + team 84 + gap 12 + bar 146 + gap 12 + value 78 = 358`.
The bar loses 20px (166 → 146) and keeps the gold tick at 64.5%. That is the whole cost of D1 on the
product's hero unit.

**What moves at thumbnail (square 400).** The square does **not** shrink type — it drops the two
lowest-value columns:

| Dropped at square | Why |
|---|---|
| Rank digits | Rank is carried by row order |
| The delta line entirely | The bar and the gold tick carry distance-from-benchmark |
| The nickname (`BILLS` → nothing; record only) | Space, and the abbreviation already names the team |
| The CASH/CAP toggle | A screenshot cannot be toggled; the selected lens moves into the eyebrow (`COST PER WIN · CASH · 2025`) |

**Added at square:** the `SAMPLE` chip when the data is placeholder, and the force-expanded lens
caveat (§ `COMPONENTS.md` and `SCREENSHOT_VARIANTS.md`).

### 3.5 Generalised system-wide

The same ladder applies everywhere, with three consequences worth naming before they are discovered
in build:

| Surface | Consequence of the 11px floor |
|---|---|
| **League leaderboard, 32 rows** | Row height goes 44px → 48px. 32 rows = 1,536px of scroll instead of 1,408. Acceptable: the header is sticky and the list was always a scroll. |
| **Contract-cliffs / league heatmap matrices** | Cell text was 8–8.5px. It becomes `--yy-size-micro` (10px) — legal, because a heat cell's value is corroborated by its fill and the cell is direct-labelled. Cell height 18px → 20px; the matrix grows ~16px. |
| **Bottom tab bar** | Labels 9px → `--yy-size-label-lg` (13px). Tab height grows 4px; the bar keeps `--yy-tap-target` (44px) minimum on the touch area, which the mockup already exceeded. |
| **Axis ticks** | 9–9.5px → 11px. On the 25-season chart this forces tick thinning: label every 6th season (`'00 '06 '12 '18 '25`), which is what the mockup already does. No change. |

---

## 4. The full scale

Mobile value first, desktop second where they differ. All values are tokens.

### Display — Bebas Neue 400, `--yy-track-display` (0.02em), `--yy-lh-display` (0.9)

| Token | Mobile | Desktop | Use |
|---|---:|---:|---|
| `--yy-size-display-xs` | 14 | 18 | Card title. Tracking `--yy-track-display-wide`. |
| `--yy-size-display-sm` | 22 | 28 | Screen title; hero-card title at mobile/square. |
| `--yy-size-display-md` | 28 | 44 | Hero-card title at wide; concept-card title. |
| `--yy-size-display-lg` | 40 | 76 | Page H1. |
| `--yy-size-wordmark` | 24 | 32 | The `YIELD/YARD` wordmark in chrome. |
| `--yy-size-mark` | 13 | 15 | The in-card product mark. |

**Display type follows the mockup, not the brand's type-scale table.** The mockup's desktop H1 is
76px against a brand H1 floor of 80px. `PHASE_A_COVERAGE.md` scores both page shells **FULL** — the
mockup is the visual source of truth for the surfaces it covers, and this is one of them. The
brand's 80–104px H1 governs marketing pages, which v1 does not have.

### Athletic utility — Rajdhani

| Token | Mobile | Desktop | Weight | Tracking | Use |
|---|---:|---:|---:|---|---|
| `--yy-size-micro` | 10 | 10 | 500 / 600 | `--yy-track-label` min | In-mark text only |
| `--yy-size-label` | 11 | 11 | 500 | `--yy-track-label` (caps) / none (mixed) | The workhorse |
| `--yy-size-label-lg` | 13 | 14 | 500 / 600 | `--yy-track-label` | Names a surface |

### Body — Inter

| Token | Mobile | Desktop | Weight | Line height | Use |
|---|---:|---:|---:|---|---|
| `--yy-size-caption` | 13 | 13 | 400 | `--yy-lh-body` | In-card copy, caveats |
| `--yy-size-body` | 16 | 16 | 400 | `--yy-lh-body` | Prose surfaces |
| `--yy-size-body-lg` | 18 | 20 | 400 | `--yy-lh-body` | Dek. Max width `--yy-measure` (680px). |

### Metric — `--yy-font-num` / `--yy-font-athletic` per §5, weight 600

| Token | Mobile | Desktop | Line height | Tracking | Use |
|---|---:|---:|---|---|---|
| `--yy-size-metric-xs` | 18 | 20 | `--yy-lh-tight` | `--yy-track-metric` | Table row value, index in a list |
| `--yy-size-metric-sm` | 22 | 24 | `--yy-lh-tight` | `--yy-track-metric` | KPI tile, hero-row value |
| `--yy-size-metric` | 30 | 34 | `--yy-lh-tight` | `--yy-track-metric` | Team-header index badge |
| `--yy-size-metric-lg` | 40 | 48 | `--yy-lh-display` | `--yy-track-metric-hero` | Era card in H2H |
| `--yy-size-metric-hero` | 64 | 76 | `--yy-lh-metric` | `--yy-track-metric-hero` | The single hero number |

---

## 5. Tabular numerals — D6, resolved

`SPEC.md` §4 and §8.3 make tabular numerals non-negotiable "on every numeric column, always".
`PHASE_A_TOKENS.md` §2.3 records the null finding: **zero occurrences in the mockup**, and the
brand's `font-feature-settings:"tnum" 1,"ss01" 1` prescription is written for **Inter only** while
the mockup sets ~90% of the product's numbers in Rajdhani. Rajdhani's `tnum` support is unverified
and `font-variant-numeric: tabular-nums` is a silent no-op on a face that lacks the feature.

### The ruling — by alignment need, not by face preference

**A figure in a column is set in `--yy-font-num`. A standalone figure may be set in
`--yy-font-athletic`.**

| | Face | Why |
|---|---|---|
| **Columnar figures** — every table cell, ledger row, matrix cell, axis-tick stack, leaderboard index, the four values in a division/hero card | `--yy-font-num` (Inter 600) + `font-variant-numeric: tabular-nums` + `font-feature-settings:"tnum" 1,"ss01" 1` | They must align vertically and must not jitter on data change. `SPEC.md` says "numeric **column**". `[BRAND]` says it in its own words: *"Default tables use Inter with tabular numerals."* |
| **Standalone figures** — the hero metric, the team-header index badge, the era-card index, a KPI tile's single value | `--yy-font-athletic` (Rajdhani 600) | A standalone figure has nothing to align with, so proportional figures cost nothing and the mockup's display character is preserved exactly. |

`--yy-font-num` currently resolves to Inter. **If Rajdhani is confirmed to carry `tnum`, repointing
`--yy-font-num` to `var(--yy-font-athletic)` is a one-token change** and the whole product moves
with it. That verification is a build task, not a design decision.

**Visible consequence, stated up front:** the leaderboard's index column (mockup: Rajdhani 600 18px)
becomes Inter 600 18px with `--yy-track-metric`. It is a real change from the mockup and it is the
brand's own instruction. `[RULED — overridable]`

**Every figure in the product carries tabular figures. No exceptions, including inside SVG `<text>`.**
Set it on the chart root, not per-element.

---

## 6. Recipes — the composed styles a component may use

Copy these. Do not invent a variant.

```css
/* eyebrow — the label above a title */
.yy-eyebrow{
  font-family:var(--yy-font-athletic); font-weight:var(--yy-weight-label);
  font-size:var(--yy-size-label); line-height:var(--yy-lh-label);
  letter-spacing:var(--yy-track-label-wide); text-transform:uppercase;
  color:var(--yy-fg-3);
}
/* card title */
.yy-card-title{
  font-family:var(--yy-font-display); font-weight:var(--yy-weight-display);
  font-size:var(--yy-size-display-xs); line-height:var(--yy-lh-tight);
  letter-spacing:var(--yy-track-display-wide); color:var(--yy-fg-1);
}
/* screen / hero title */
.yy-title{
  font-family:var(--yy-font-display); font-weight:var(--yy-weight-display);
  font-size:var(--yy-size-display-sm); line-height:var(--yy-lh-display);
  letter-spacing:var(--yy-track-display); color:var(--yy-fg-1);
}
/* utility label — pills, legends, sub-lines, column heads */
.yy-label{
  font-family:var(--yy-font-athletic); font-weight:var(--yy-weight-label);
  font-size:var(--yy-size-label); line-height:var(--yy-lh-label);
  letter-spacing:var(--yy-track-label); text-transform:uppercase;
  color:var(--yy-fg-2);
}
/* surface-naming label — tabs, nav, sort headers */
.yy-label-lg{
  font-family:var(--yy-font-athletic); font-weight:var(--yy-weight-label);
  font-size:var(--yy-size-label-lg); line-height:var(--yy-lh-label);
  letter-spacing:var(--yy-track-label); text-transform:uppercase;
}
/* in-mark micro — the only sub-11px text in the system */
.yy-micro{
  font-family:var(--yy-font-athletic); font-weight:var(--yy-weight-metric);
  font-size:var(--yy-size-micro); line-height:1;
  letter-spacing:var(--yy-track-label); text-transform:uppercase;
}
/* caption — copy inside a data card */
.yy-caption{
  font-family:var(--yy-font-body); font-weight:var(--yy-weight-body);
  font-size:var(--yy-size-caption); line-height:var(--yy-lh-body);
  color:var(--yy-fg-2);
}
/* body — prose surfaces */
.yy-body{
  font-family:var(--yy-font-body); font-weight:var(--yy-weight-body);
  font-size:var(--yy-size-body); line-height:var(--yy-lh-body);
  color:var(--yy-fg-2); max-width:var(--yy-measure);
}
/* columnar figure */
.yy-num{
  font-family:var(--yy-font-num); font-weight:var(--yy-weight-metric);
  font-variant-numeric:tabular-nums;
  font-feature-settings:"tnum" 1,"ss01" 1;
  letter-spacing:var(--yy-track-metric); line-height:var(--yy-lh-tight);
}
/* standalone figure */
.yy-metric{
  font-family:var(--yy-font-athletic); font-weight:var(--yy-weight-metric);
  font-variant-numeric:tabular-nums;
  letter-spacing:var(--yy-track-metric); line-height:var(--yy-lh-tight);
}
/* the hero number */
.yy-metric-hero{
  font-family:var(--yy-font-athletic); font-weight:var(--yy-weight-metric);
  font-variant-numeric:tabular-nums;
  font-size:var(--yy-size-metric-hero);
  line-height:var(--yy-lh-metric); letter-spacing:var(--yy-track-metric-hero);
}
```

---

## 7. Big-number hierarchy — the hero-metric recipe at its scale steps

The mockup gives the Cap+ index number **five coherent scales**, scored **FULL** in
`PHASE_A_COVERAGE.md` row 47. They are adopted verbatim, retuned only where D6 or the utility floor
touches them.

| Step | Size (m/d) | Line height | Tracking | Paired label | Label size | Rule |
|---|---:|---|---|---|---:|---|
| Hero | 64 / 76 | `--yy-lh-metric` (.85) | −.05em | `CAP+` or the unit, Bebas caps | `--yy-size-label` | **One per screen.** Never two hero metrics in one viewport. |
| Era | 40 / 48 | `--yy-lh-display` (.9) | −.05em | Era chip above (`NE '07`) | `--yy-size-label` | Only in H2H, only in pairs. |
| Header | 30 / 34 | `--yy-lh-tight` | −.03em | `CAP+` beneath, `--yy-track-label-wide` | `--yy-size-micro` | The team-header badge. |
| Tile | 22 / 24 | `--yy-lh-tight` | −.03em | Label above, `--yy-track-label-wide` | `--yy-size-label` | KPI tiles, hero-card row values. |
| Row | 18 / 20 | `--yy-lh-tight` | −.03em | Column header | `--yy-size-label` | Table and list values. **Columnar → `--yy-font-num`.** |

**Five rules that make the ladder legible rather than merely large.**

1. **The number's colour carries its band, its label never does.** The index value takes
   `--yy-band-above` / `--yy-band-mid` / `--yy-band-below`; the `CAP+` label beside it is always
   `--yy-fg-2` or `--yy-fg-3`. If both were coloured the card would read as two data points.
2. **A big number is always paired with a unit or a benchmark, inside the same optical block.**
   `114` alone is meaningless; `114 / CAP+ / 100 = LEAGUE AVERAGE` is a claim. `SPEC.md` §4 requires
   the caption wherever Cap+ leads.
3. **Optical alignment beats box alignment.** Tracking is negative at every step ≥18px, so a
   right-aligned column of figures is set with `padding-right` equal to the tracking value
   (`0.03em`) to restore the right edge. Without it, every column in the product hangs left by a
   third of a character.
4. **Descend one step per level of nesting, never two.** Hero → tile inside the hero card is legal;
   hero → row is not, because a 64px number over an 18px number in the same card reads as a headline
   over a footnote and the reader stops comparing them.
5. **Currency and unit glyphs do not scale with the number.** `$` and `M` in `$18.3M` are set at the
   number's size (they are part of the figure), but `per win`, `pts`, `/ WIN` are always
   `--yy-size-label` in `--yy-fg-3`. The mockup does this consistently; it is what keeps a 64px
   number from becoming a 64px sentence.

---

## 8. Font loading

- Bebas Neue: **self-hosted** from the handoff kit
  (`design/handoff/project/uploads/Bebas_Neue,DM_Serif_Display,Squada_One/Bebas_Neue/BebasNeue-Regular.ttf`),
  `font-display: swap`. It is OFL and it is already in the repo.
- Rajdhani (400/500/600) and Inter (400/600) are **not shipped in the handoff** — Google Fonts only.
  They must be **self-hosted before launch**: `SPEC.md` §8 ships with no third-party requests
  (`DECISIONS.md` 56: no third-party analytics, no cookies), and a Google Fonts request is a
  third-party request. WOFF2 subset to `latin`.
- Fallback metrics matter: the athletic stack falls to `Arial Narrow`, which is materially narrower
  than Rajdhani. Every fixed-width column in `COMPONENTS.md` is specified with the 11px Rajdhani
  measurement **plus 8%**, so a fallback render does not clip.
- **The brand's logo SVGs ship as live `<text>` in Bebas Neue with `font-weight="700"`.** On any
  machine without Bebas installed they render in Arial Narrow. That is a delivery bug in the
  identity assets, independent of this system. → **NEEDS-REY** (outlines, and drop the 700).
