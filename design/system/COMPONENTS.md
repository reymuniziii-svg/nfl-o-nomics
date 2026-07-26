# COMPONENTS.md — build specifications

**Phase B. Binding.** Precise enough that a build agent needs zero aesthetic judgment. Every value
is a token from `tokens.css`; a literal colour, radius, spacing or font-size in a component fails
review.

Provenance keys as in `tokens.css`. `[RULED]` values carry a divergence or question ID pointing at
`RESOLUTIONS.md`.

**Universal rules — every component obeys these without restating them.**

1. **Cards are border + gradient. Never a shadow.** `--yy-shadow` is scoped to floating overlays in
   light mode only. `[MOCKUP]`
2. **Every figure carries tabular numerals**, set on the component root, per `TYPE.md` §5.
3. **Every chart component takes a `coverage` prop; every metric value is `Metric<T>`**
   (`SPEC.md` §1.2). There is no code path that renders an empty cell, a dash, a zero or an
   interpolated point.
4. **Colour is never the sole carrier of meaning** (`SPEC.md` §8.3). Every series has a direct label
   *and* a shape/pattern distinction.
5. **Focus is visible in both themes**: `outline: var(--yy-focus-width) solid var(--yy-focus-ring);
   outline-offset: var(--yy-focus-offset)`. Lime is 1.55:1 on white and is never the light-mode ring
   — the token flips to `--yy-lime-ink` (5.47:1). `[RULED]`
6. **Minimum touch target `--yy-tap-target` (44px)** on every interactive element, regardless of its
   painted size.
7. **One lime element per chart, and lime never exceeds ~6% of painted area per screen.** `[BRAND]`

---

## 1. HERO — the division cost-per-win card (`CostPerWinCard`)

**Direction: Study A, "The Receipt"** (locked by Rey, 2026-07-26). One component, one `size` prop,
three sizes. `SPEC.md` §3.1.2, §2.5, §4.

### 1.1 API

```ts
type Size = 'mobile' | 'square' | 'wide';
type Numerator = 'cash' | 'cap';

interface CostPerWinCardProps {
  size: Size;
  division: DivisionId;          // AFC_EAST …
  season: number;
  rows: CpwRow[];                // 4 for a division; N for a team page's peer set
  leagueAvg: Metric<number>;     // dollars per win, that season
  numerator: Numerator;          // default 'cash' (DECISIONS 29, SPEC §2.5)
  onNumeratorChange?: (n: Numerator) => void;   // absent => toggle not rendered
  subject?: TeamAbbr;            // SEE 1.3 — this prop selects the colour meaning
  sample?: boolean;              // renders the SAMPLE chip
  export?: boolean;              // applies .yy-export; forces caveat open
  coverage: Coverage;
}

interface CpwRow {
  abbr: TeamAbbr; nickname: string; fullName: string;
  record: string;                                  // "13–4"
  wins: number;
  spend: Metric<number>;                           // the selected numerator, dollars
  costPerWin: Metric<number> | { state: 'suppressed'; reason: 'zero-wins' };
}
```

### 1.2 Composition — four zones, at every size

```
┌─────────────────────────────────────────────┐
│ HEAD    eyebrow / title            toggle   │
├─────────────────────────────────────────────┤
│ ROWS    rank · team · bar · value           │  ← 4 rows (+ zero-win rows)
├─────────────────────────────────────────────┤
│ LENS    lens line + disclosure   (mobile/sq)│  ← SEE 1.6
├─────────────────────────────────────────────┤
│ STRAP   gold benchmark        product mark  │
└─────────────────────────────────────────────┘
```

**Surface.** `background: var(--yy-bg-card)` at mobile/square, `var(--yy-bg-card-lg)` at wide.
`border: 1px solid var(--yy-line-card)`. Radius `--yy-radius-card-sm` (18px) at mobile/square,
`--yy-radius-card` (22px) at wide — the mockup's own split, with the mobile value raised from 16 to
the brand's 18px floor. `[RULED D8]`

**Padding.** mobile `--yy-space-4` (16) · square `--yy-space-5` (20) · wide `--yy-space-7`
(28) block / `--yy-space-7` inline.

### 1.3 THE LIME RULE — the `subject` prop selects the meaning `[RULED Q1 — NEEDS-REY]`

One meaning per surface, and **the card states which mode it is in**, so a reader who screenshots it
can still tell.

| `subject` | Surface | Lime means | Row colouring | Strap reads |
|---|---|---|---|---|
| **undefined** | `/`, `/division/{div}` — no subject exists | **favourable vs. the benchmark** | Below league avg → `--yy-accent`. At avg (±2%) → `--yy-fg-mid`. Above → `--yy-negative-fill` (bar) / `--yy-negative-text` (figure) | `LEAGUE AVG $25.8M / WIN` |
| **set** | `/team/{abbr}/{season}` — the page has a subject | **the subject** | Subject row → `--yy-accent`, **regardless of whether it is cheap or dear**. Every other row → `--yy-fg-2` bar, `--yy-fg-1` figure. No favourability colour anywhere. | `{ABBR} vs LEAGUE AVG $25.8M / WIN` |

In subject mode the subject row is **pinned first** and its true rank still renders in the rank
column (`4` on a first-position row is correct and is the point). Distance from the benchmark is
still carried — by the gold tick on every bar and by the signed delta — it is simply not carried by
hue. `[RULED Q3]`

### 1.4 Geometry — measured, at each size

All three use `display:flex; align-items:center` with `gap: --yy-space-3` (12) at mobile/square and
`--yy-space-4` (16) at wide. Column widths are fixed except the bar, which is `flex:1`.

| | **mobile 390** | **square 400** | **wide 1040** |
|---|---:|---:|---:|
| content width | 358 | 360 | 984 |
| rank col | 14 | — *(dropped)* | 20 |
| team col | 84 | 76 | 180 |
| bar (flex) | 146 | 200 | 542 |
| value col | 78 | 60 | 194 |
| row padding-block | `--yy-space-3` (12) | `--yy-space-2` (8) | `--yy-space-4` (16) |
| bar height | `--yy-bar-h` (8) | `--yy-bar-h` (8) | `--yy-bar-h-lg` (10) |
| title | `--yy-size-display-sm` (22) | `--yy-size-display-sm` (22) | `--yy-size-display-md` (44) |
| value figure | `--yy-size-metric-sm` (22) | `--yy-size-metric-sm` (22) | `--yy-size-metric` (34) |
| abbr | `--yy-size-display-sm` (22) Bebas | 22 Bebas | 28 Bebas |

**Column widths were measured at 11px Rajdhani + 8% fallback headroom** (`TYPE.md` §8). See
`TYPE.md` §3.4 for the derivation and for what the 11px floor cost: the bar loses 20px and the delta
loses the words `vs LG`.

### 1.5 Row anatomy

**Rank** — `.yy-label`, `--yy-fg-3`. Top-3 in benchmark mode take `--yy-accent`; in subject mode no
rank is coloured. `[MOCKUP leaderboard]`

**Team** — abbreviation in Bebas 400 (`--yy-track-display`, `--yy-lh-tight`, `--yy-fg-1`) over a
sub-line in `.yy-label` `--yy-fg-3`.
Sub-line content by size: mobile `BILLS · 13–4` · square `13–4` · wide `BUFFALO BILLS · 13–4`.

**Bar** — a shared-scale track, `height` per §1.4, `background: var(--yy-bg-sunken)`,
`border-radius: var(--yy-radius-mark)` (2px).
- **Scale.** One linear domain shared by all rows: `[0, ceil(max(costPerWin) × 1.05 / 5M) × 5M]`.
  Never per-row normalised — the bar is the only place the true spread survives.
- **Fill.** Absolutely positioned from `left:0`, same radius, colour per §1.3.
  **No gradient inside the fill, ever.** `[BRAND]`
- **Gold tick.** `position:absolute; width:1px; top:-4px; bottom:-4px;
  background: var(--yy-benchmark-tick)` at `left: leagueAvg / domainMax`. **On every bar, including
  the ones it does not cross.** Lifted verbatim from the mockup's division strip. `[MOCKUP]`
- The tick is centred **on the track, not on the card**. Centring on the card misaligns the
  benchmark from the bars by the label/value column-width difference. `[STUDY B]`

**Value** — right-aligned. Figure `.yy-num` (columnar — four figures in a column) at the size in
§1.4, colour per §1.3, with `padding-right: 0.03em` to restore the optical right edge
(`TYPE.md` §7 rule 3). Beneath it, the delta in `.yy-label` `--yy-fg-3`:

| Size | Delta text |
|---|---|
| mobile | `−$7.5M` |
| square | *(dropped)* |
| wide | `29% BELOW LEAGUE` |

**Divider** — `border-top: 1px solid var(--yy-line-divider)` on every row but the first.

### 1.6 THE ZERO-WIN ROW — `SPEC.md` §2.5, `DECISIONS.md` 26

A live rendering state, not an edge case. Exactly two team-seasons trigger it (2017 CLE, 2008 DET);
both are golden-test fixtures.

```
—   CLE   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   $151.1M spent · 0 wins
    2017  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   RATIO SUPPRESSED · EXCLUDED FROM RANKING
```

| Element | Value |
|---|---|
| Rank | `—` in `--yy-fg-3`. **Never a number** — the team is excluded from ratio-ranked ordering, not sorted to an extreme. |
| Bar | `background: var(--yy-absence-fill)` (transparent) + `border: 1px dashed var(--yy-absence)`, same height and radius as a live bar. **No gold tick** — there is no ratio to compare. |
| Figure | The **total spend and the win count**, `.yy-num` at `--yy-size-metric-xs` (18/20, one step down — it is a sentence, not a ratio), colour `--yy-suppressed` |
| Sub-value | `RATIO SUPPRESSED · EXCLUDED FROM RANKING`, `.yy-label` `--yy-fg-3` |
| Sort position | Always last, after the ranked rows |

**The absence rule is neutral, not salmon.** Study A drew this row in the mockup's dashed-salmon
void grammar; that grammar means *"a void year that becomes dead money"* — a negative. A team with
zero wins is not being editorialised by the ratio's absence, and §2.5's whole point is to not
editorialise a divide-by-zero. `--yy-absence` is muted-based and reads as "does not exist".
`[RULED D3 — overridable]`

The card **never** emits `Infinity`, `∞`, `N/A`, a blank or a divide error. A unit test asserts it.

### 1.7 THE NUMERATOR TOGGLE

Two segments, `CASH` (default, `DECISIONS.md` 29) and `CAP`, built from the mockup's selected-pill
recipe.

| | Selected | Unselected |
|---|---|---|
| background | `--yy-selected-bg` | transparent |
| colour | `--yy-selected-fg` | `--yy-fg-2` |
| border | `1px solid var(--yy-selected-bg)` | `1px solid var(--yy-line-card)` |
| radius | `--yy-radius-pill` | `--yy-radius-pill` |
| type | `.yy-label` | `.yy-label` |
| padding | `--yy-space-1` block, `--yy-space-3` inline | same |

`role="radiogroup"`, arrow-key navigable, `aria-checked`. Transition: `background-color` and `color`
over `--yy-dur-fast` with `--yy-ease-snap`. Hit area padded to `--yy-tap-target`.

**Not rendered at square** (`onNumeratorChange` absent). The selected lens moves into the eyebrow:
`COST PER WIN · CASH · 2025`.

### 1.8 THE CASH CAVEAT AT 390 — SOLVED `[RULED Q4]`

The studies left this unsolved: the caveat fits at 1040 and does not fit at 390, and `SPEC.md` §2.1
forbids dropping it ("the lens caveats travel with the selection").

**A three-part solution. The short form is always visible; the long form is one tap away, in-card;
every export force-expands it.**

**(a) The lens line — always visible, at every size, in every crop, never truncated.**
Sits between the rows and the strap.

```
CASH · ROSTER ONLY                                                    (i)
```

`.yy-label`, `--yy-fg-2`, `padding-block: --yy-space-2`,
`border-top: 1px solid var(--yy-line-divider)`. Those three words are the caveat's operative
content. Per lens:

| Lens | Line | Source |
|---|---|---|
| `cash` | `CASH · ROSTER ONLY` | §2.1 lens 2 |
| `cap` | `CAP HIT · SEASON-FINAL · ROSTER ONLY` | §2.1 lens 1 |

**(b) The disclosure — inline, in-card, pushes the strap down.** A `<button aria-expanded>` carrying
the `(i)` glyph (`--yy-stroke-icon` circle, 16px, `--yy-fg-3`); the whole lens line is the hit area.
Expanded, it renders the full sentence in `.yy-caption` `--yy-fg-2` directly beneath, animating
`grid-template-rows: 0fr → 1fr` over `--yy-dur-base` / `--yy-ease-standard`.

> Cash to players on the roster. Cash paid to players released in-year is not included.

> Cap hit is an end-of-league-year restatement, not an in-season reading. Cap held by players on the
> roster — not cap used.

At 358px in 13px Inter this is **two lines, 42px**, taking the card from ~371px to ~413px on an
844px canvas. It is not a tooltip, not a hover, not a modal, and it does not leave the card.

**(c) The export rule that makes the disclosure safe.**
**Any affordance that hides required text is force-EXPANDED in export, never removed.**
When `export` is true the disclosure has no button, no toggle and no collapsed state — the full
sentence is simply rendered. A screenshot cannot be tapped, so a screenshot never hides a caveat.
This rule is general and is repeated in `SCREENSHOT_VARIANTS.md`.

**At wide, the disclosure does not exist** — the full sentence is always rendered in the strap, as
Study A already draws it.

Why this satisfies §2.1: the tooltip-only prohibition in §2.1 is written for **dead money**
("value, date and stage always render together… no tooltip-only date") and dead money is not
permitted a disclosure anywhere in this system (§8 below). The cash lens requires that the caveat be
*rendered on the lens*, which the always-visible line does at every size, in every crop.

### 1.9 THE PRODUCT MARK

`YIELD/YARD` in `--yy-font-display` at `--yy-size-mark` (13/15), `--yy-track-display`, colour
`--yy-fg-1` at 55% (`rgba(234,241,236,.55)` on dark / `rgba(7,28,22,.55)` on light), with the slash
in `--yy-accent`. Bottom-right of the strap, baseline-aligned with the benchmark text.
**Never larger, never full-opacity, never given clear space at the expense of a row.** It is a
signature, not a logo lockup — the brand's 140px minimum wordmark size governs the *logo*, and this
is not it. Discipline in `SCREENSHOT_VARIANTS.md` §5.

### 1.10 THE SAMPLE CHIP

`.yy-micro` in `--yy-negative-text`, `border: 1px solid var(--yy-negative-text)` at 40% alpha,
`border-radius: var(--yy-radius-chip)`, padding `--yy-space-1` / `--yy-space-2`. Top-right of the
head, replacing the toggle at square.

**Rule:** the chip renders whenever **any** figure on the card comes from placeholder data. It is
driven by the data layer, not by a prop a developer remembers to set. Real data ⇒ no chip. There is
no "mostly real" state. `[STUDY A]`

### 1.11 The strap

Left: `▮ LEAGUE AVG $25.8M / WIN` — the `▮` glyph in `--yy-benchmark`, the text in `.yy-label`
`--yy-fg-2`. Right: the product mark. `border-top: 1px solid var(--yy-line-hairline)`,
`padding-top: --yy-space-3`, `margin-top: --yy-space-3`.

If `leagueAvg.state !== 'value'` the strap renders the blank reason in `.yy-label` `--yy-fg-3` and
**no gold tick appears on any bar** — a benchmark that is not known is not drawn.

---

## 2. LEAGUE CAP+ LEADERBOARD (`CapPlusLeaderboard`)

`SPEC.md` §3.1.3. **All 32 rows. Not a top-10.** Row anatomy is the mockup's, scored PART; the
extensions are density, sort states, the desktop table, CSV and D6.

### 2.1 Row — mobile 390

| Column | Width | Content | Type | Colour |
|---|---:|---|---|---|
| rank | 26 | `1`–`32` | `.yy-num` `--yy-size-metric-xs` | top-3 `--yy-accent`, else `--yy-fg-mid` `[MOCKUP]` |
| team | flex | name (Bebas 400 `--yy-size-display-xs`, `--yy-track-display`) over sub-line | `.yy-label` | name `--yy-fg-1`, sub `--yy-fg-3` |
| spend→wins | 74 | two stacked `--yy-bar-h-sm` (5px) tracks, `--yy-space-1` gap | — | spend `--yy-bg-track`; wins band-coloured |
| Cap+ | 52 | index | `.yy-num` `--yy-size-metric-xs` | band colour |

Sub-line: `CIN · $19.4M/WIN · 12W`. Row padding `--yy-space-2` block (was 9 → 8, `[RULED D5]`),
`--yy-space-4` inline. `border-top: 1px solid var(--yy-line-divider)`.
**Row height 44 → 48px** at the 11px floor; 32 rows = 1,536px of scroll.

**Focus row** (the reader's team): `background: var(--yy-tint-selected)` plus a
`--yy-space-0h` (2px) left rule in `--yy-accent` — the tint alone is 1.06:1 and is not a
distinction. `[RULED — AA]`

### 2.2 The 32-row density answer `[C6]`

- **Sticky group:** the metric pills + the column-header row stick together at the top of the scroll
  container, `background: var(--yy-bg)`, with a `--yy-line-hairline` bottom border that appears only
  once `scrollTop > 0`.
- **No pagination, no "show more", no virtualisation in v1.** 32 rows is 1.5 screens; a "load more"
  on a 32-item list is chrome pretending to be a feature.
- **Conference rule:** an optional `--yy-line-hairline` divider with an `AFC` / `NFC` label between
  rank 16 and 17 when the sort is by conference. Off by default.
- **Every 5th row gets no zebra.** No zebra striping anywhere in the system — the divider hairline
  is the row separator and a stripe would compete with the focus tint.

### 2.3 Sort states

Column headers are `<button>`s, `.yy-label-lg`, `--yy-fg-3`. Active: `--yy-fg-1` plus a caret
(`▲`/`▼`, `--yy-size-micro`, `--yy-accent`). `aria-sort` on the header cell.
Re-order animates with a FLIP transform over `--yy-dur-base` / `--yy-ease-standard`, staggered
`--yy-stagger` capped at `--yy-stagger-max` rows. Under reduced motion the tokens collapse to 1ms
and the list simply re-paints.

**Teams with `state:'blank'` Cap+ sort to a labelled group at the bottom** headed
`NOT COVERED — {reason}`, never interleaved and never sorted as zero.

### 2.4 Desktop table (none exists in the mockup — originated)

Same columns plus `SPEND`, `WINS`, `$/WIN`, `Δ 5Y`. Container `--yy-bg-card-lg`,
`--yy-radius-card`, `--yy-space-7` padding. Header row `.yy-label-lg` `--yy-fg-3` with
`border-bottom: 1px solid var(--yy-line-hairline)`. Row hover `--yy-bg-hover` over `--yy-dur-fast`.
Column alignment: text left, all figures right, `.yy-num`.

### 2.5 The caption

`100 = LEAGUE AVERAGE` renders in `.yy-label` `--yy-fg-2` in the header row, right-aligned,
**on every surface where Cap+ leads** (`SPEC.md` §4). See `CAPPLUS_LOCKUP.md` §3.

---

## 3. TEAM PAGE HEADER (`TeamHeader`)

`SPEC.md` §3.2.1. The mockup's composition, plus the four things it omits.

```
‹   [TeamMark 32]  RAIDERS                                        114
                   OAKLAND · AFC WEST · 2003 · 4–12               CAP+
```

| Element | Spec |
|---|---|
| Back | `‹` chevron, `--yy-stroke-icon`, `--yy-fg-3`, `--yy-tap-target` |
| TeamMark | 32×32, `--yy-space-3` right gap. See §9. |
| Name | Bebas 400, `--yy-size-display-sm`, `--yy-track-display`, `--yy-chalk-white` |
| Identity line | `.yy-label` `--yy-track-label-wide`, `--yy-fg-3`. **Era-correct**: `OAKLAND · AFC WEST · 2003 · 4–12`. `/team/lv/2003` renders "Oakland Raiders" (`DECISIONS.md` 52). |
| Index badge | Right-aligned. `.yy-metric` at `--yy-size-metric` (30/34), `--yy-track-metric`, band-coloured, over its **name label** |

**Dual naming — the thing the mockup omits.** The badge's label is not always `CAP+`:

| Season | Label | Label style | Number style |
|---|---|---|---|
| 2013–2025, covered | `CAP+` | `.yy-micro` `--yy-track-label-wide` `--yy-fg-3` | band-coloured |
| 2013–2025, blanked season | `CAP+` + `—` | same | `--yy-fg-3`, and the blank reason renders beneath in `.yy-label` |
| 1999–2012 | `TEAM RATING` + a `PERFORMANCE ONLY` sub-label | same, but the label wraps to two lines and the badge column widens to 96px | `--yy-fg-1`, **never band-coloured** |

**Team Rating is never band-coloured.** The bands (`≥105` / `95–104` / `<95`) are a Cap+ encoding;
applying them to a performance-only rating tells the reader the two numbers are the same metric.
`DECISIONS.md` 18: never "Cap+ (performance only)" — to a reader that is still Cap+. `[RULED]`

---

## 4. 25-SEASON HISTORY (`FranchiseArc`) — the team page's `Drive` surface

`SPEC.md` §3.2.2. One of exactly two field-literal surfaces (`SPEC.md` §4); the field treatment is
specified in `CHART_ANATOMY.md` §7. This section specifies the data anatomy, which is identical
either way.

### 4.1 The hard break at 2013

The x-axis is continuous 1999–2025. At `x(2013)` a **full-height break rule** renders:
`width:1px`, `background: var(--yy-fg-dim)`, `stroke-dasharray: var(--yy-dash-absence)`, with a
rotated `.yy-micro` label `TIER 2 BEGINS 2013` on the right side, `--yy-fg-3`.
**No series path crosses it.** Team Rating's path terminates at 2012 with a round cap; Cap+'s path
begins at 2014 (2013 is a blanked season). A path that crossed the break would assert the two
metrics are one series, which is the exact thing `DECISIONS.md` 18 and 19 forbid.

### 4.2 The overlap rule — both lines on 2014–2025

Both series render on the overlap, **and they are told apart by three channels, not one**:

| Series | Colour | Stroke | Dash | Direct label |
|---|---|---|---|---|
| Cap+ | `--yy-accent` | `--yy-stroke-primary` (3px) | solid | `CAP+` at the right terminus |
| Team Rating | `--yy-compare` | `--yy-stroke-compare` (2px, was 1.6 `[RULED D10]`) | `--yy-dash-compare` | `TEAM RATING` at the right terminus |

Opacity: Cap+ `1`, Team Rating `.85`. `[MOCKUP]`

### 4.3 The four blanked Cap+ seasons

2013, 2016, 2020, 2021 (`DECISIONS.md` 16). Each renders as a **labelled gap**, never as an
interpolated segment:

- the path **breaks** (two separate `<path>` elements, not one path with a jump);
- the gap span is filled with `--yy-partial` at a 45° 2px hatch;
- a `.yy-micro` label sits in the gap, rotated 90° where the gap is one season wide:
  `NO FULL-32 TABLE`;
- the legend carries one entry: `▨ SEASON NOT COVERED`.

`CHART_ANATOMY.md` §5 generalises this into the coverage-state vocabulary.

### 4.4 The bridge sentence

Beneath the chart, `.yy-caption` `--yy-fg-2`, max `--yy-measure`. Always present, never a tooltip:

> Two metrics are plotted. Team Rating (1999–2025) scores performance only. Cap+ (2014–2025) scores
> wins produced per dollar. They are shown together on the overlap so you can see where they
> disagree — not because they measure the same thing.

### 4.5 The compact sparkline (`FranchiseSparkline`)

The mockup has no small-multiple form. Originated: 96×24px, one series only (Cap+ where covered,
else Team Rating), `--yy-stroke-compare`, no axis, no gridline, a single gold 1px tick at the 100
baseline, and the 2013 break rendered as a 1px `--yy-fg-dim` vertical. Blanked seasons break the
path; they are **not** hatched at this size (there is no room for the label, and an unlabelled
hatch is worse than a visible gap). Used inside leaderboard rows and entry cards.

---

## 5. H2H COMPARISON STACK (`HeadToHead`)

`SPEC.md` §3.4. The mockup's butterfly geometry is excellent and is kept; two things change.

### 5.1 D3 IS FIXED HERE — red never carries a comparison series `[RULED D3 / C3]`

In the mockup, `NE '07` is carried entirely in salmon `#E8A08D` — border, label, index and bars —
against `KC '24` in lime. The older team is not a negative; it is the comparison. Every H2H reader
is told the older team is bad by colour alone.

**What carries a comparison series instead:**

| | Side A | Side B |
|---|---|---|
| Colour, dark | `--yy-series-subject` (`#A6E22E`) | `--yy-series-compare` (`#8FA39A`) |
| Colour, light | `--yy-lime-ink` (`#4F7413`) | `--yy-series-compare-light` (`#5A6B63`) |
| Bar fill | solid at `.75` alpha | solid at `.75` alpha **+ a 45° 1px hatch** in `--yy-bg-card-flat` |
| Line stroke | `--yy-stroke-primary`, solid | `--yy-stroke-compare`, `--yy-dash-compare` |
| Era chip border | `--yy-accent` at `.4` | `--yy-compare` at `.4` |
| Era chip fill | `--yy-accent` at `.05` | `--yy-compare` at `.05` |

`#8FA39A` is the mockup's own mid-band slate, and its light-surface pair `#5A6B63` is in the
mockup's own `INK` map. It is exactly what `[BRAND]` prescribes: *"White / muted gray: comparison
series on dark backgrounds."* The hatch and the dash satisfy `SPEC.md` §8.3 (colour is never the
sole carrier).

**Red does not appear anywhere on `/compare`.** Neither side is a negative and favourability is not
encoded by hue here at all — it is encoded by **distance from each side's own gold benchmark**
(§5.3). If both sides render an above-benchmark value, both render in their own series colour.

### 5.2 The cross-era statement — placement

`SPEC.md` §3.4.2 requires it "rendered in the UI, not buried". The mockup's gesture at it (`THE
TAKE`) is editorial commentary a writer supplies, not a standing guarantee.

**Placement, binding:** a **standing band directly beneath the two era cards and above the first
comparison chart**, at every size. Not a footnote, not a tooltip, not below the fold, not inside an
accordion.

| Property | Value |
|---|---|
| container | `border-left: var(--yy-space-0h) solid var(--yy-benchmark)`, `padding-inline-start: --yy-space-3`, no background, no border box |
| eyebrow | `.yy-label` `--yy-track-label-wide` `--yy-benchmark` — `HOW THIS COMPARISON WORKS` |
| body | `.yy-caption` (13px) mobile / `.yy-body` (16px) desktop, `--yy-fg-2`, max `--yy-measure` |
| copy | verbatim from `SPEC.md` §3.4.2 — not paraphrased, not shortened |

It takes the **gold** rule because it is a statement about the benchmark method, and gold is the
benchmark colour. It is the only non-chart element in the product that carries gold. `[RULED]`

### 5.3 The benchmark dimension — the structural change the mockup lacks

The mockup compares A directly against B. `SPEC.md` §3.4.3 requires **each side against its own
season's league average**, so the reader compares two distances-from-average.

Per metric row, per side:

```
  NE '07                                          KC '24
  11.2%  ████████████▏· · · · ·│· · · ·▕██████████  14.5%
         −1.8 vs '07 LG        │        +2.1 vs '24 LG
                          QUARTERBACK
```

- Each side's bar is drawn on **its own** axis whose zero is that side's league average, mirrored
  about the centre divider (`1px`, `--yy-line-hairline`, `height: --yy-track-h + 4`).
- Bars grow **outward from the centre** when above that season's average and **inward toward it**
  when below, so length reads as `|distance from own benchmark|` and side reads as which team.
- The **gold tick** for each side sits at its own zero — which is the centre divider — so there is
  one gold element, not two. `[BRAND: gold marks benchmarks]`
- Bar inner corners are squared at the axis: `border-radius: 2px 0 0 2px` / `0 2px 2px 0`. `[MOCKUP]`
- Value columns 38px `[MOCKUP]` → **48px** at the 11px floor; position label centred beneath in
  `.yy-label` `--yy-fg-3`.

### 5.4 One-sided Tier 2 boundary

`SPEC.md` §3.4.3: where one side is pre-2013, that side's Tier 2 rows render the boundary message
and the Tier 1 rows compare normally.

Per row, on the unavailable side only: the bar is replaced by a `--yy-absence-fill` box with
`1px dashed var(--yy-absence)`, and the value column reads `NOT COVERED` in `.yy-label`
`--yy-fg-3`. The row's centre divider, position label and *available* side render unchanged.
Above the affected block, one `.yy-caption` line: `Player-level economics begin in 2013. NE '07 has
team results only.` **No row is silently omitted and no side renders zero.**

---

## 6. THREE-LENS SUMMARY (`ThreeLens`)

`SPEC.md` §3.2.3, §2.1. Three figures, three caveats. The product's stated discipline: it never says
"spending" without saying which lens.

Mobile: a vertical stack of three blocks. Desktop: three columns, equal width, `--yy-space-4` gap.

| Per block | Spec |
|---|---|
| Lens name | `.yy-label-lg` `--yy-fg-3` — `CAP HIT (SEASON-FINAL)` · `CASH SPENT` · `DEAD MONEY` |
| Figure | `.yy-num` `--yy-size-metric-sm`, `--yy-fg-1` |
| **As-of strap** | **Dead money only, and mandatory** — `· as of 2024-11-27 · late season` in `.yy-label` `--yy-asof`, rendered **inline on the same line as the figure**, never beneath it and never truncated |
| Caveat | `.yy-caption` `--yy-fg-2`, always visible, **no disclosure** |
| Divider | `border-top: 1px solid var(--yy-line-divider)` between blocks on mobile |

Caveat copy, verbatim from `SPEC.md` §2.1:

- Cap hit — *"An end-of-league-year restatement, not an in-season reading. This is cap held by
  players on the roster, not cap used."*
- Cash — *"Cash to players on the roster. Cash paid to players released in-year is not included."*
- Dead money — *"A dated press snapshot, not a derived figure. Same-season drift is real: CHI 2022
  read $57.6M preseason and $91.8M final."*

**Copy that is forbidden here and everywhere** `[C5]`: "cap used", "cap utilization", "% of cap",
"where $233M goes". Layouts must budget for the longer correct labels — `CAP HIT (SEASON-FINAL)` is
21 characters and wraps to two lines at `--yy-size-label-lg` in a 3-column desktop layout. That is
expected; the block's label area is 2 lines tall at every size so the three figures stay baseline-
aligned.

**Pre-2013 this whole block is replaced by the Tier 2 boundary message** (§13.3), not by zeros and
not by an empty state.

---

## 7. ALLOCATION DIVERGING BARS (`AllocationBars`)

`SPEC.md` §3.2.4, §2.6. The mockup's `SPEND MIX vs LEAGUE` is the strongest single answer in the
handoff. Three changes.

### 7.1 Nine groups, not seven

`SPEC.md` §2.6: QB · RB · WR · TE · OL · DL · LB · DB · ST. The mockup draws seven (RB and TE
missing). Order is fixed and is the §2.6 order, never sorted by value — a row order that changes
between teams destroys cross-team comparison.

### 7.2 THE COLOUR RULING — over/under-allocation is not favourable/unfavourable `[RULED — overridable]`

The mockup colours the bars lime when the team is **over** the league average and red when
**under**. Spending more on receivers than the league average is not a positive and spending less on
the defensive line is not a negative — that is a **value grade on a roster construction decision**,
which is precisely the judgment `SPEC.md` §3.3.7 and `DECISIONS.md` 51 commit the product to never
making. §2.6's own denominator caveat says the figure inherits the dead-money omission, so it is not
a figure to be confident about in either direction.

| Element | Value |
|---|---|
| Bar fill, both directions | `--yy-series-neutral` (`--yy-fg-2` on dark, `--yy-ink-light-2` on light) |
| Selected/hovered group | `--yy-accent` — the only lime on the card |
| Zero axis | `1px`, `--yy-benchmark` — **it is the league average, so it is gold** `[BRAND]` |
| Value ink | `--yy-fg-1`, signed (`+3.6` / `−2.3`), never coloured |
| Track | `--yy-bg-sunken`, `--yy-track-h` (16px), `--yy-radius-mark` |
| Bar | `--yy-bar-h-lg` (10px), `--yy-radius-mark`, offset left/right by sign |

The mockup's centre rule is `rgba(234,241,236,.28)` on an `rgba(7,28,22,.06)` track — light-on-light,
**near-invisible on the light desktop card**. `PHASE_A_COVERAGE.md` row 19 flags it. It is replaced
by the gold axis above, which measures 4.52:1 on paper as `--yy-gold-ink`. `[RULED — AA]`

### 7.3 The denominator caveat

Rendered on the chart, always, `.yy-caption` `--yy-fg-2`:

> Share of cap held by players on the roster — not share of cap. The denominator inherits the
> dead-money omission. Position is as of the deal then in force.

Never "share of cap by position group" (the mockup's label). `[C5]`

---

## 8. DEAD-MONEY LEDGER (`DeadMoneyLedger`) + snapshots (`DeadMoneyDots`)

`SPEC.md` §3.2.7, §2.1, §2.7. The highest-risk data in the product, and the one rule that must be
*visible* rather than merely obeyed.

### 8.1 The as-of stamp — a component, not a formatting convention

```tsx
<AsOf value="$85.2M" date="2024-11-27" stage="late season" />
```

Renders **on one line, in one visual block**: `$85.2M · as of 2024-11-27 · late season`.
Figure `.yy-num`, `--yy-fg-1`; the separator dots and the date/stage `.yy-label` `--yy-asof`.

**Binding constraints.**
- There is **no compact variant.** A `<KpiTile>` that receives a dead-money value throws in
  development. Dead money may only render through `<AsOf>`. `[C4]`
- The date is never behind a tooltip, a hover, an `(i)`, or a disclosure. Dead money is the one
  place in this system where the §1.8 disclosure pattern is **prohibited**.
- If the stamp does not fit the container, **the container is wrong**, not the stamp. It never
  truncates and never ellipses.
- A `(team, season)` dead-money key without an `asof_date` is a build-time test failure
  (`SPEC.md` §2.1 rule 1).

### 8.2 The `is_actual` chip

`.yy-micro` in `--yy-verified`, `border: 1px solid currentColor` at 40%, `--yy-radius-chip`.
Text: `VERIFIED ACTUAL`. Rendered beside every ledger row (all 21 rows are `is_actual = TRUE`;
`SPEC.md` §2.7). Its absence is meaningful, so the projected case has its own chip —
`PROJECTED`, in `--yy-provisional` with `border-color: var(--yy-provisional-stroke)`.

### 8.3 The ledger table

Columns: player · team · season · charge (`<AsOf>`) · `is_actual` chip · source link.
Source is a visible `<a>` to `source_url` in `--yy-accent` with an underline, **not** an icon —
per-row citation is the product's strongest asset and it should look like one.

**The Dareus/BUF row** has a deliberately blank `split_by_season`. It renders the total plus
`PER-SEASON SPLIT NOT ESTABLISHED` in `.yy-label` `--yy-fg-3`. **Never an inferred split.**
(`SPEC.md` §2.7.)

### 8.4 The dot plot that refuses to connect its points

`SPEC.md` §2.1 rule 3: dead-money team-season snapshots are **a dot plot, never a line**.

| Element | Spec |
|---|---|
| Mark | `--yy-dot` (10px) circle, `--yy-negative-fill`, `1px` stroke in `--yy-bg-card-flat` |
| Connecting path | **none.** A line-chart component that receives a dead-money series throws in development and renders dots in production. |
| Per-dot label | The dot's own date, `.yy-micro` `--yy-asof`, directly beneath the dot. **Every dot, always** — this is the affordance that makes the rule visible. |
| Blanked seasons (2013, 2016, 2020, 2021) | An **open** `--yy-dot` ring (`fill:none`, `1px` `--yy-absence`, `--yy-dash-absence`) at the axis baseline with a `.yy-micro` `--yy-fg-3` label `5 TEAMS PUBLISHED — NOT A 32-TEAM READING` |
| Y axis | Burden = dead money ÷ `team_adjusted_cap_implied` (`SPEC.md` §2.7). Axis label states the denominator. |

A caption beneath, always: *"Each dot is a separate dated reading, taken at a different point in a
different league year. They are not a trend and are deliberately not connected."*

---

## 9. TEAMMARK (`TeamMark`)

`SPEC.md` §5.1. Containment is assigned to the design track by name. Here it is.

### 9.1 Containment geometry

The source is a **500px square PNG** (`team_logo_espn`), one per club, self-hosted
(`assets/README.md`). Logos vary wildly in aspect within that square.

| Property | Value |
|---|---|
| Box | Always **square**. `aspect-ratio: 1`. |
| Fit | `object-fit: contain`. **Never `cover`** — cropping a club mark is both ugly and a trademark problem. |
| Safe area | The mark is inset by **12.5% of the box on every side** (`padding: 12.5%`), so a 32px TeamMark paints a 24px logo. This is the single number that makes 32 marks of different aspect look like one system. |
| Background | `transparent`. No plate, no circle, no tint. |
| Radius | none on the image; the box may be clipped by its parent |
| `alt` | `""` — the mark is decorative; the team name is always adjacent in text |

### 9.2 Sizing discipline — four sizes, no others

| Name | Box | Where |
|---|---:|---|
| `xs` | 20px | Inside a table row, beside a 11px label |
| `sm` | 32px | Team header, entry card, H2H era card |
| `md` | 48px | Team page hero, division picker item |
| `lg` | 64px | Nothing in v1. Reserved. |

**A TeamMark is never larger than the type it sits beside is tall × 2.** The product is not a
merchandise brand (`[BRAND]`: "not a fantasy league, sportsbook, or team merchandise brand").

### 9.3 The 32-logo loudness problem, and the answer

Thirty-two club marks in one 32-row list is thirty-two competing colour systems, and it is the
fastest way to make an analytics product look like a fan site. The brand's own prohibition —
*"do not append official league or team marks"*, *"do not recolor the lime slash to match an NFL
team"* — and `SPEC.md` §4's *"team colour is used only inside TeamMark, never as a chart series
colour"* both point the same way.

**The ruling — the 32-team palette recommendation `SPEC.md` §4 asks the design track for:**

1. **Team colour is never a chart colour.** Not a series, not a bar, not a dot, not a heat ramp, not
   a legend swatch. This is the mockup's implicit answer, now written down. `[MOCKUP + RULED]`
2. **Team colour appears in exactly one place: the TeamMark fallback chip** (§9.4).
3. **In dense lists (≥8 rows) TeamMark renders at `xs` and at `opacity: .85`,** rising to `1` on
   row hover/focus. Eight-tenths of a point of contrast is enough to keep a logo from shouting over
   an 11px label, and it is reversible per row.
4. **Identity in a list is carried by the abbreviation, not the mark.** The mark is corroboration.
   Any list that would still read correctly with `TEAM_LOGOS_ENABLED = false` is correctly designed;
   any list that would not, is not. That is the test.

### 9.4 The kill-switch fallback chip

`TEAM_LOGOS_ENABLED = false` ⇒ every TeamMark product-wide renders the typographic chip. Data comes
from `public/assets/teammarks/chipdata.json` — which survives the purge by design
(`assets/README.md`).

| Property | Value |
|---|---|
| Box | Same box as the logo it replaces. `--yy-radius-chip` at `xs`/`sm`, `--yy-radius-control` at `md` |
| Fill | `chipdata.teams[].primary` |
| Glyph | `chipdata.teams[].glyph` — **the precomputed black-or-white value.** Never `secondary`: 15 of 36 colour rows have primary/secondary contrast below 3.0 and 6 below 2.0. Computed glyphs give a worst case of **4.66 (LAC)**, all ≥ AA. |
| Type | `--yy-font-display` 400, `--yy-track-display`, sized to **60% of the box** (`xs` 12px, `sm` 19px, `md` 29px), optically centred |
| Text | `chipdata.teams[].abbr` |

**Both states must look deliberate.** The chip is not a broken-image state: it is the same box, the
same size, the same position, filled instead of transparent. Rehearse the flip in preview
(`assets/README.md`) and confirm every route still reads.

---

## 10. PLAYERMARK (`PlayerMark`)

`SPEC.md` §5.2. `DECISIONS.md` 62: **ShareAlike option (a) — CSS-filter-only over an untransformed
source.** `assets/README.md`: the pipeline stores **Commons 500px renditions** byte-untouched; the
treatment happens in CSS at render time. No crop, no composite, no mask, no re-encode is baked into
a file. CSS `object-fit` containment and CSS filters are **render-time presentation** and create no
fixed derivative — that is the whole point of option (a).

### 10.1 The exact filter stack

```css
.yy-playermark img{
  /* option (a): treatment is CSS-only, applied to untouched Commons bytes */
  filter:
    grayscale(1)
    contrast(1.06)
    brightness(0.92)
    sepia(0.42)
    hue-rotate(58deg)
    saturate(1.45);
}
[data-theme="light"] .yy-playermark img{
  filter:
    grayscale(1)
    contrast(1.04)
    brightness(1.04)
    sepia(0.30)
    hue-rotate(58deg)
    saturate(1.15);
}
@media (prefers-contrast: more){
  .yy-playermark img{ filter: grayscale(1) contrast(1.15); }
}
```

**Why these numbers.** `grayscale(1)` first flattens 244 photos shot under 244 lighting conditions
into one tonal population — without it, the tint lands differently on every asset and the roster
looks like a scrapbook. `sepia()` re-introduces a single hue (a warm brown around 35°);
`hue-rotate(58deg)` carries it to ~93°, inside the End Zone / Field Green family;
`saturate()` sets how far the duotone travels from neutral — 1.45 on dark, 1.15 on light, because a
tint that reads as "restrained grading" on `#0B0D0E` reads as "filter" on `#FFFFFF`.
`brightness()` compensates in the direction of the surface. The result is the brand's *"restrained
dark grading with clear white highlights"*, and it is one declaration, reversible to
`filter:none` in one edit if licensing review changes an answer (`DECISIONS.md` 63).

### 10.2 Crop geometry and background

| Property | Value |
|---|---|
| Chip mark | 56 × 56, `--yy-radius-chip` |
| Card mark | 120 × 160 (3:4), `--yy-radius-card-sm` |
| Fit | `object-fit: cover; object-position: 50% 22%` — head-biased. Commons player photos are predominantly full- or half-body; 22% from the top centres the head across the population without per-asset tuning. |
| Background | `--yy-bg-track`, painted **behind** the image, so a transparent PNG (34 of 244 sources are PNG) never shows the card gradient through a subject's edge |
| Bottom fade | `::after` linear gradient from `transparent` to `--yy-bg-card-flat` over the bottom 22% — a render-time composite, not a stored one. Card mark only; the chip is too small. |
| Text over the image | **Not permitted in v1.** If it ever is, `[BRAND]` requires a `--yy-field-green` scrim at 65–85%. |

### 10.3 The visible attribution credit line

**223 of 244 assets (91.4%) legally require it, and a credit behind a hover or an "info" affordance
is a licence violation, not a design preference** (`SPEC.md` §5.2, `assets/README.md`).

| Property | Value |
|---|---|
| Placement | Directly beneath the mark, inside the identity chip's own box. Never overlaid on the photo, never in a footer, never in a tooltip. |
| Type | `.yy-micro` — this is the load-bearing use of the 10px tier and the reason it exists |
| Colour | `--yy-fg-3` (5.38:1 on the card — AA-clearing at 10px) |
| Content | `{author} · {license_short}` with the licence linked to `license_url`. `license_url` is nullable — all 14 public-domain files have none; those render `{author} · PUBLIC DOMAIN` unlinked. |
| Space budget | **2 lines at chip width from the first layout.** Author names run long ("All-Pro Reels", "Jeffrey Beall"). The identity chip reserves 26px for it whether or not the asset needs one. |

`Restrictions = personality` (12 assets) is surfaced to the operator, never to the reader.

### 10.4 The fallback card — 6.4% of the population, and it must not read as an error

Branches when `has_usable_image === false` (2.8%) **or** the asset is below `IMAGE_MIN_WIDTH_PX`
(the remaining 3.6%). `SPEC.md` §5.2: *"Plan the fallback card for trench players, not for retired
stars."* Nine players are skipped by the floor and are named in the manifest.

The fallback is the **same box, same radius, same position** as the photo. Composition, in one
optical block:

```
┌──────────────┐
│      93      │   ← jersey number, --yy-font-display, 44% of box height
│              │
│      DT      │   ← position, .yy-label, --yy-track-label-wide
└──────────────┘
```

| Property | Value |
|---|---|
| Fill | The player's **current team primary colour** from `chipdata.json` |
| Glyph colour | That team's **precomputed `glyph`** — the same luminance rule as TeamMark, so the two fallbacks are visibly one family and inherit the same 4.66 worst case |
| Number | `--yy-font-display` 400, `--yy-track-display`, 44% of box height. Where the jersey number is unknown, the player's **initials** (2 chars) take its place at the same size. |
| Position | `.yy-label` `--yy-track-label-wide`, glyph colour at 75% |
| Border | none. **No dashed rule, no `?`, no silhouette, no broken-image glyph.** |
| Credit line | absent — there is no asset to credit, and the space collapses |

**Why this does not read as an error:** it is a *designed roster card*, not a missing photo. It
carries more identity information than a small photo would (number and position are legible at 56px;
a face is not), it uses the team's own colour where the photo would have used the team's uniform,
and it is the same object as the TeamMark fallback chip. A reader who sees a page of them sees a
style, not a failure.

---

## 11. TABLES (`DataTable`)

### 11.1 Mobile (390) — progressive disclosure, not a squeezed grid

`MOBILE_PATTERNS.md` §4 owns the pattern. In summary: a table with more than **three** columns
becomes a **row-card list** — a primary line (identity), a secondary line (the sorted-by value), and
an expandable detail block carrying the remaining columns as label/value pairs. Never a horizontal
scroller with a frozen first column; that pattern hides data behind a gesture with no affordance.

### 11.2 Desktop — the real table

| Element | Spec |
|---|---|
| Container | `--yy-bg-card-lg`, `--yy-radius-card`, `--yy-space-7` padding, `--yy-line-card` border |
| Header row | `.yy-label-lg` `--yy-fg-3`, `border-bottom: 1px solid var(--yy-line-hairline)`, sticky within the container |
| Row divider | `border-top: 1px solid var(--yy-line-divider)` |
| Row hover | `--yy-bg-hover`, `--yy-dur-fast` |
| Row selected | `--yy-tint-selected` + `--yy-space-0h` left rule in `--yy-accent` |
| Alignment | text left · figures **right**, `.yy-num` · dates left, `.yy-label` |
| Column min-width | `--yy-space-11` (96px) for a figure column; measured at the widest possible value, not the current one |
| Zebra | **none** |
| Empty cell | **does not exist.** Every cell renders `Metric<T>`: `blank` renders its reason in `.yy-label` `--yy-fg-3`; `partial` renders the value plus `⟨n/N⟩` in `--yy-partial`. |

### 11.3 Sortable header

`<button>` inside `<th>`, `aria-sort` on the `<th>`. Caret `.yy-micro` `--yy-accent`. Three states:
unsorted (no caret), ascending, descending. Sorting never removes rows — blanks group at the bottom
under a labelled heading (§2.3).

---

## 12. PICKERS

`DECISIONS.md` 50: **curated pickers only.** No free-form query builder. A PR that adds arbitrary
filtering is rejected on sight.

### 12.1 Division picker (sticky, 8 divisions, AFC East default)

`SPEC.md` §3.1.1. The mockup gives the closed state only.

Mobile: a horizontally scrolling pill row, `--yy-space-2` gap, `--yy-space-4` inline padding,
`scroll-snap-type: x mandatory` with `scroll-snap-align: center` on each pill.
Pills use the toggle recipe (§1.7). **The selected pill scrolls itself into view on mount.**
An edge fade (`mask-image`, 24px) on both ends signals scrollability — the eight pills are 640px
wide against 390px of viewport and the reader must know there are more.

Sticky: `position: sticky; top: 0; z-index: 2; background: var(--yy-bg)`. The scrolled state adds
`border-bottom: 1px solid var(--yy-line-hairline)` at `scrollTop > 0`, over `--yy-dur-fast`.
Desktop: the same eight as a segmented control, `--yy-radius-control`, no scroll.

Keyboard: `role="tablist"`, arrow keys move selection, `Home`/`End` jump.
Below the picker, always: `Current alignment only. The 2002 realignment is not modelled.`
(`DECISIONS.md` 45.)

### 12.2 Team / season pickers (and the two-sided compare picker)

A `<button>` chip carrying the current value plus a caret (`--yy-radius-pill`, `.yy-label`), which
opens a **menu panel** — the one place the system uses elevation.

| Property | Dark | Light |
|---|---|---|
| Surface | `--yy-bg-menu` (`#1E2325`) | `--yy-bg-menu` (`#FFFFFF`) |
| Border | `1px solid var(--yy-line-card)` | same |
| Elevation | `--yy-elevation-menu` = `none` (the raised surface separates it) | `--yy-elevation-menu` = `0 12px 32px rgba(2,9,7,.24)` |
| Radius | `--yy-radius-card-sm` | same |
| Item | `--yy-space-3` block padding, `.yy-label-lg`, `--yy-tap-target` min height | same |
| Item selected | `--yy-tint-selected` + a `✓` in `--yy-accent` | same |
| Motion | `opacity 0→1` + `translateY(-4px)→0` over `--yy-dur-fast`, `--yy-ease-standard`; exit `--yy-dur-instant`, `--yy-ease-exit` | same |

**Team menu:** grouped by conference then division, group headers `.yy-label` `--yy-fg-3`, each item
carrying an `xs` TeamMark + full name + abbr.
**Season menu:** a 2-column grid of years, 1999–2025 descending. **Years without Tier 2 coverage are
not disabled** — they are selectable and the page renders the boundary message. Disabling them would
hide the product's own coverage story behind a greyed-out control.

At 390 the menu is a **bottom sheet**: full width, `--yy-radius-card` on the top corners only,
`max-height: 70vh`, its own scroll, a 36×4 grab handle in `--yy-fg-dim`, and a scrim of
`rgba(7,28,22,.6)`. `MOBILE_PATTERNS.md` §3.

### 12.3 Player search

`SPEC.md` §3.3.1, §8.4. The mockup contains **no text input anywhere**; originated.

Field: `--yy-bg-sunken`, `1px solid var(--yy-line-card)`, `--yy-radius-control`,
`--yy-space-3` padding, `.yy-body` (16px — **never smaller, or iOS zooms the viewport on focus**).
Placeholder `--yy-fg-3`. Leading search glyph `--yy-stroke-icon` `--yy-fg-3`.
Focus: the ring, plus `border-color: var(--yy-accent)`.

Results: the menu panel, each row an `xs` PlayerMark + name + `POS · TEAM`, matched substring in
`--yy-fg-1` and the remainder in `--yy-fg-2` (**not** bold — a weight change reflows a
proportionally-set list).
`role="combobox"` + `aria-activedescendant`; results are debounced 120ms; `aria-live="polite"`
announces the count.

**The population statement is always visible beneath the field**, not only on no-match
(`SPEC.md` §8.4):

> Search covers the 251 players in the v1 population — 2021–2025 top-cap plus marquee dead-money
> names. Every one of them has verified image and licence status.

No-match adds: `No player in the v1 population matches "{q}".`

---

## 13. STAT BLOCKS

### 13.1 `KpiTile`

| Element | Spec |
|---|---|
| Container | `--yy-bg-card`, `--yy-line-card`, `--yy-radius-card-sm`, `--yy-space-3` padding |
| Label | `.yy-label` `--yy-track-label-wide` `--yy-fg-2` |
| Value | `.yy-num` or `.yy-metric` per `TYPE.md` §5, `--yy-size-metric-sm`, `--yy-fg-1` |
| Unit | `.yy-label` `--yy-fg-3`, baseline-aligned beside the value |
| Note | `.yy-caption` `--yy-fg-2` (desktop only) |

**A `KpiTile` that receives a dead-money value throws in development** (§8.1, `[C4]`).

### 13.2 `IndexBadge`

The Cap+ number plus its label, at any of the five scales in `TYPE.md` §7. Props: `value`, `scale`,
`metricName` (`'capplus' | 'teamRating'`), `coverage`. Band colour applies **only** when
`metricName === 'capplus'` (§3).

### 13.3 `BoundaryMessage`

The Tier 2 boundary block. `SPEC.md` §1.2, §3.2.3.

| Element | Spec |
|---|---|
| Container | `--yy-bg-empty`, `1px dashed var(--yy-absence)`, `--yy-radius-card-sm`, `--yy-space-4` padding. **No red, no warning icon, no alert styling.** |
| Eyebrow | `.yy-label` `--yy-track-label-wide` `--yy-fg-3` — `COVERAGE` |
| Body | `.yy-caption` `--yy-fg-2` |
| Copy | *"Player-level economics begin in 2013. For {season} this product has team results, EPA, coaching and draft — but no contract, cap or cash data. Nothing here is estimated to fill the gap."* |
| Link | `Read the coverage statement →` to `/methodology`, `--yy-accent` |

Absence is a fact about the data, not a failure of the team or of the product. It is styled with the
same care as a value.

---

## 14. CSV EXPORT AFFORDANCE (`CsvExport`)

`SPEC.md` §8.1 puts CSV on **every** tabular surface; the mockup has zero. `DECISIONS.md` 55:
generated client-side from the same typed rows the view rendered.

| Property | Value |
|---|---|
| Form | A text `<button>`, never an icon alone: `CSV ↓` |
| Type | `.yy-label` `--yy-fg-3` |
| Hover/focus | `--yy-fg-1`; the ring on focus |
| Placement | **Top-right of the card header, baseline-aligned with the card title.** Same slot on every surface, so a reader learns it once. |
| Never | A floating action button; a footer link; an icon-only control; a menu item |
| `aria-label` | `Download {card title} as CSV` |
| Filename | `yieldyard_{surface}_{params}_{season}.csv` |

The header comment block carries the source mart, the coverage statement, every as-of date in play,
and the page URL — meaning **the export renders the same caveats the card does**. A card whose
caveats are not expressible in the CSV header is a card whose caveats are not fully specified.

---

## 15. NAV & PAGE SHELLS

Both shells are scored **FULL** in `PHASE_A_COVERAGE.md` (rows 52, 53). Adopted from the mockup with
five fixes.

### 15.1 Mobile shell (390 × 844)

```
┌──────────────────────────────┐
│ HEADER  wordmark + eyebrow   │  --yy-bg-chrome, padding 16/16/12
│                    right slot│  border-bottom --yy-line-hairline
├──────────────────────────────┤
│ BODY    padding --yy-space-4 │  --yy-bg
│         card gap --yy-space-3│
├──────────────────────────────┤
│ TABBAR  4 items              │  --yy-bg-tabbar
└──────────────────────────────┘
```

| Element | Spec | Change from mockup |
|---|---|---|
| Wordmark | `--yy-font-display` 400, `--yy-size-wordmark` (24), slash in `--yy-accent` | — |
| Contextual eyebrow | `.yy-label` `--yy-track-label-wide` `--yy-fg-2` | 9px → 11px |
| Right slot | Season chip / avatar / `SORT` | **The `W6` week chip is removed.** `[C1]` |
| Tab item | 24px icon over `.yy-label-lg`, `--yy-space-1` gap | 20px→24px icon `[BRAND]`; 9px→13px label |
| Tab active | `--yy-accent` icon + label | — |
| Tab inactive | `--yy-fg-dim` icon (non-text, 4.11:1 ≥ 3:1 ✓), `--yy-fg-3` **label** (text, 5.38:1 ✓) | **split — the label may not use the dim value** `[RULED AA]` |
| Tabbar padding | `--yy-space-3` top, `--yy-safe-bottom` | hardcoded 22px → `env(safe-area-inset-bottom, 24px)` `[RULED D-safe-area]` |
| Header scrolled | `border-bottom` appears at `scrollTop > 0` over `--yy-dur-fast` | originated |

Four tabs: `LEAGUE` · `TEAMS` · `PLAYERS` · `COMPARE`. (The mockup's `DASH`/`LEADER`/`TEAMS`/`VS`
maps onto the four v1 views.)

### 15.2 Desktop shell (1440)

Dark nav band (`--yy-bg-chrome`, `--yy-space-5` block / `--yy-space-9` inline) over a light or dark
page per theme. Wordmark `--yy-size-wordmark` (32). Nav items `.yy-label-lg` `--yy-track-label`;
active = `--yy-accent` + `--yy-selected-rule` (2px lime underline).
Page padding `--yy-space-9` inline, `--yy-space-8`/`--yy-space-9` block. Content width 1344.
H1 `--yy-size-display-lg` (76) `--yy-lh-display`. Dek `.yy-body-lg`, max `--yy-measure`.
The season chip reads `2025` — **not** `2025 · WEEK 6`. `[C1]`

**Chrome is dark in both themes.** It is the brand's End Zone band and it is what makes the light
theme read as the same product. `[RULED D12/D13]`

### 15.3 Both modes

Every shell, card, chart and control renders in both themes from the semantic layer alone. A
theme toggle sets `data-theme` on `<html>`; absent that attribute, `prefers-color-scheme` decides.
There is no third state and no per-component theme override.

### 15.4 Icons

`[BRAND]`: 2px stroke at 24px, geometric line icons, rounded caps. Core metaphor set — target,
upward yield, play route, contract, roster, field, bar chart, percentile.
The mockup ships placeholders (20px squares with 2px borders). Drawing the eight is a Phase-B
production task; the geometry above is the whole spec. `stroke: currentColor`,
`stroke-width: var(--yy-stroke-icon)`, `stroke-linecap: round`, `fill: none`, `viewBox="0 0 24 24"`.
**Never mix filled sports clip art with the line set.** `[BRAND]`
