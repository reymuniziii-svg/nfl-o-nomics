# CHART_ANATOMY.md — the chart system

**Phase B. Binding.** `SPEC.md` §4: *"Custom, built on D3 scales with visx primitives, per the
forthcoming chart anatomy spec from the design track. No charting library that owns its own visual
language."* This is that spec.

Every value is a token. §8 maps every item here to a D3/visx primitive so nothing is left to
interpretation at build time.

---

## 1. The five rules that generate everything else

1. **The number is the chart's subject; the geometry is corroboration.** Every chart is directly
   labelled and every chart that involves Cap+ carries a **Cap+ axis** — the field metaphor never
   replaces the number (`SPEC.md` §4).
2. **One lime series per chart, maximum.** `[BRAND]`
3. **Gold is the benchmark and nothing else.** Never a series, never a control, never a heat-ramp
   end. `[BRAND]`
4. **Colour is never the sole carrier of meaning.** Every series has a direct label *and* a
   shape/pattern distinction (`SPEC.md` §8.3).
5. **Absence is drawn, not omitted.** Every chart takes a `coverage` prop; there is no code path
   that interpolates, zero-fills, or silently shortens a domain (`SPEC.md` §1.2).

---

## 2. Axes

| Element | Value | Source |
|---|---|---|
| Axis line | `1px`, `--yy-axis` (30% alpha) | `[MOCKUP]` |
| Which axes get a line | **The domain axis only** (usually x). The value axis is carried by gridlines and tick labels; a second axis line boxes the plot and adds no information. | `[MOCKUP]` — the frontier draws `border-left` + `border-bottom`; we keep the bottom |
| Tick mark | **none.** The gridline is the tick. | `[RULED]` |
| Tick label | `.yy-label` (11px) `--yy-fg-3` | `[RULED D1]` |
| Tick density | Never more labels than `floor(axisLength / 64px)`. On a 25-season axis at 358px that is 5 labels — `'00 '06 '12 '18 '25`, exactly what the mockup does. | `[MOCKUP]` |
| Axis title | `.yy-label` `--yy-track-label-wide` `--yy-fg-3`, centred beneath the domain axis | `[MOCKUP]` (`ACTIVE CAP SPEND`) |
| Value-axis range | Cap+ charts: **76–124** (stream) or **80–125** (bars) — ±24 around 100. Never auto-fitted: a Cap+ axis that rescales per team makes two teams incomparable. | `[MOCKUP]` |
| Zero | A cost/spend axis **always includes zero**. An index axis never does (100 is the reference, not 0). | `[RULED]` |
| Units | Stated once, in the axis title. Never repeated on every tick. | `[RULED]` |

**The Cap+ axis is mandatory on every Cap+ chart, including the two field-literal surfaces** (§7).

---

## 3. Gridlines

| Property | Value |
|---|---|
| Colour | `--yy-gridline` — `rgba(168,177,173,.10)` dark / `rgba(7,28,22,.10)` light |
| Ceiling | `--yy-gridline-max-opacity` = **0.15**. `[BRAND]`: *"Gridlines should remain below 15% opacity."* The token exists so the ceiling is checkable, not so it is used. |
| Direction | **Value axis only.** A gridline perpendicular to the value axis helps a reader estimate a value; one parallel to it does not, and two sets make a grid the reader has to see past. |
| Count | 3–5. The mockup's quartile positions (`12.5 / 37.5 / 62.5 / 87.5%`) are the default. `[MOCKUP]` |
| Weight | `1px`, never dashed. Dashes are reserved for benchmarks and absence. |
| Behind | Gridlines render **beneath** every mark, including translucent ones. |

**The one gridline that is not a gridline:** on any chart with a benchmark, the benchmark's own
position gets **no** gridline. It gets the gold rule (§4), and a grey line underneath it would read
as a second reference.

---

## 4. Benchmark grammar (gold)

Scored **FULL** in `PHASE_A_COVERAGE.md` row 50 — the mockup applies the brand's rule exactly.
Adopted verbatim.

| Form | Spec | Where |
|---|---|---|
| **Reference line** | `--yy-stroke-benchmark` (1px) solid in `--yy-benchmark-line-under` (.50) with a `1px` dashed overlay in `--yy-benchmark-line` (.65), `stroke-dasharray: var(--yy-dash-benchmark)` (`3 4`) | The 100 baseline; league-average cost-per-win; the projected cap ceiling |
| **Tick** | `1px`, `--yy-benchmark-tick` (.75), extending 4px beyond the mark on both sides | On a bar, per row — the hero card, the division strip |
| **Ring** | `1px`, `--yy-benchmark-line`, dashed | The Value Stadium's league-average ring |
| **Label** | `.yy-label` `--yy-track-label-wide`, `--yy-benchmark` | Always named in words: `LEAGUE AVG $25.8M / WIN`, `100 = LEAGUE AVERAGE`, `PROJECTED CAP CEILING` |

**A benchmark is always named in words on the same surface.** A gold line with no label is a
decoration. **A benchmark never moves under motion** (§6).

If the benchmark's own `Metric` is not `state:'value'`, **no gold appears anywhere on the chart** and
the blank reason renders in the legend slot. A benchmark that is not known is not drawn.

---

## 5. THE COVERAGE-STATE SYSTEM

`PHASE_A_COVERAGE.md` rank 2. The mockup carries exactly one grammar — the contract-cliff void cell
(transparent fill, `1px dashed rgba(232,160,141,.75)`, a `▼` marker, a legend entry). That grammar
is extended, and one semantic error in it is corrected.

### 5.1 The correction: absence is not a negative

The mockup's dashed **salmon** means two different things at once: *"this contract year is void/dead"*
(a genuine negative — it becomes dead money) and, by extension, *"this does not exist"* (not a
negative at all). A blanked 2013 Cap+ season is not a criticism of the team, and rendering it in the
red family says it is.

**Two dashed rules, each with its own legend entry:**

| Meaning | Token | Value | Legend |
|---|---|---|---|
| **Does not exist** — blanked season, uncovered tier, suppressed ratio | `--yy-absence` | `rgba(168,177,173,.55)` dark / `rgba(7,28,22,.32)` light | `⊟ NOT COVERED` |
| **Void / dead** — a contract year that lapses into dead money | `--yy-void-rule` | `rgba(232,160,141,.75)` `[MOCKUP verbatim]` | `⊟ VOID / DEAD` |

### 5.2 The five states, and how each is drawn

`Metric<T>` has three states (`SPEC.md` §1.2); the chart layer adds two presentation states that are
not data states (`provisional` rides on `value`; `suppressed` is a `value` the product refuses to
divide).

| State | Mark | Label | Legend | Notes |
|---|---|---|---|---|
| **`value`** | Normal | Direct | — | |
| **`blank`** | `fill: var(--yy-absence-fill)` (transparent), `1px dashed var(--yy-absence)`, **same box, same position, same size as a live mark** | The `reason` string, `.yy-micro` `--yy-fg-3`, in or beside the mark. Rotated 90° where the span is one unit wide. | `⊟ NOT COVERED` | The reason is **rendered, never swallowed**. A blank with no visible reason is a bug. |
| **`partial`** | Normal fill at full opacity **plus** a 45° 2px hatch in `--yy-partial` overlaying the whole mark | The value, then `⟨n/N⟩` in `--yy-partial`'s ink, e.g. `$85.2M ⟨18/32⟩` | `▨ PARTIAL — n of N` | The hatch is over the mark, not instead of it: a partial value is still a value. |
| **`provisional`** | Normal fill, plus a `1px` `--yy-provisional-stroke` outline | A `PROVISIONAL` chip (§5.3) beside the figure | `◇ PROVISIONAL` | 2014 and 2019 Cap+ (`DECISIONS.md` 16) |
| **`suppressed`** | `--yy-absence-fill` + `1px dashed var(--yy-absence)`, **no benchmark tick** | The substitute statement (`$151.1M spent · 0 wins`) in `--yy-suppressed` | `⊟ RATIO SUPPRESSED` | Zero-win rule, `SPEC.md` §2.5 |

### 5.3 Chips

| Chip | Text | Colour | Border | Type |
|---|---|---|---|---|
| Provisional | `PROVISIONAL` | `--yy-provisional` | `1px solid var(--yy-provisional-stroke)` | `.yy-micro` |
| Verified actual | `VERIFIED ACTUAL` | `--yy-verified` | `1px solid currentColor` @40% | `.yy-micro` |
| Projected | `PROJECTED` | `--yy-provisional` | `1px solid var(--yy-provisional-stroke)` | `.yy-micro` |
| Sample | `SAMPLE` | `--yy-negative-text` | `1px solid currentColor` @40% | `.yy-micro` |

All `--yy-radius-chip`, padding `--yy-space-1` / `--yy-space-2`.
**Gold carries "provisional" because the mockup already assigns gold to a projected value** (the
`PROJECTED CAP CEILING` line and label). Provisionality is a statement *about* a number's standing,
which is the same register as a benchmark.

### 5.4 Two specific vocabularies the SPEC names

**The tier boundary (1999–2012 / 2013–2025).** On any chart spanning it: a full-height break rule at
`x(2013)` — `1px`, `--yy-fg-dim`, `--yy-dash-absence` — carrying a rotated `.yy-micro` label
`TIER 2 BEGINS 2013`. **No series path crosses it.** The domain is *not* clipped to the covered
range: shortening the axis would let a reader infer the data starts in 2013 by choice rather than by
limit. See `COMPONENTS.md` §4.1.

**The four blank Cap+ seasons (2013, 2016, 2020, 2021).** Each is a `blank` span with the reason
`NO FULL-32 TABLE`. The path breaks into separate `<path>` elements — never one path with a jump,
because a jump is one continuous shape and a reader's eye completes it. A legend entry names them
once. `DECISIONS.md` 16: *"Partial seasons are blanked entirely, not partially."*

### 5.5 What a chart may never do

- Interpolate across a blank.
- Render a blank as zero, as a dash, as an empty cell, or as nothing.
- Shorten an axis so a gap disappears.
- Put a coverage reason behind a tooltip.
- Connect dead-money snapshots (`SPEC.md` §2.1 rule 3 — the component throws in development).
- Render an aggregate without its own `n`.

A unit test asserts no chart series contains a synthesized point (`SPEC.md` §1.2).

---

## 6. Motion, per chart type

Origination — motion is unspecified on both sides of the token boundary (D14).
`SPEC.md` §4: *"motion communicates state change and nothing else. No decorative animation, no
chart-entry choreography."*

### 6.1 The domain rule — the one rule that prevents lying with motion

> **If the scale domain changes, nothing animates: the chart cross-fades over `--yy-dur-fast`.
> If the domain is stable, marks animate over `--yy-dur-chart`.**

Animating marks under a changing axis flies every mark through positions that were never true of
either dataset. Cross-fading says "this is a different chart", which it is.

### 6.2 Per chart type

| Chart | Animates | Duration / easing | Never animates |
|---|---|---|---|
| Ranked bars (hero card, division strip) | Bar `width`; row `transform` on re-sort (FLIP) | `--yy-dur-chart` / `--yy-ease-standard`; re-sort `--yy-dur-base` / `--yy-ease-standard` | The gold tick. The value text (no count-up). |
| Diverging bars (allocation) | Bar `width` and `left` | `--yy-dur-chart` / `--yy-ease-standard` | The gold zero axis. |
| Line / stream (25-season) | `stroke-dashoffset` **only on series toggle**, never on load | `--yy-dur-slow` / `--yy-ease-standard` | Path shape on data change — the domain changes, so §6.1 applies: cross-fade. |
| Scatter (frontier) | `cx`/`cy` on season change **when the domain is pinned**; `opacity` on filter | `--yy-dur-chart` / `--yy-ease-standard`, staggered `--yy-stagger` capped at `--yy-stagger-max` | Dot radius (radius encodes extremity — an animating radius reads as a value change). |
| Dot plot (dead money) | `opacity` only | `--yy-dur-fast` | Position. Each dot is a separate dated reading; moving one implies it is the same reading over time. |
| Matrix / heat | Cell `background-color` on metric change | `--yy-dur-chart` / `--yy-ease-standard`, no stagger | Cell size. |
| Sparkline | nothing | — | everything |

### 6.3 What never animates, anywhere

- **Chart entry on first paint.** `SPEC.md` §4, verbatim.
- **Number count-ups.** They break tabular alignment mid-flight and display intermediate values that
  were never measured.
- **The gold benchmark.** A benchmark that moves is a benchmark that lies.
- **Any coverage state.** A blank that fades in reads as loading. Blanks are painted, not revealed.
- **The product mark, the SAMPLE chip, the as-of stamp.**
- **Anything at all inside `.yy-export`** — the export scope collapses every duration to 1ms
  (`tokens.css` §27).

### 6.4 Reduced motion

`@media (prefers-reduced-motion: reduce)` redefines every duration token to `1ms` and `--yy-stagger`
to `0ms` in `tokens.css` §26. **No component writes the query.** Transitions still fire, so state
changes still commit — they simply do not travel. That is the correct reading of the preference: it
asks for no motion, not for no feedback.

---

## 7. The two field-literal surfaces

`DECISIONS.md` 43 and `SPEC.md` §4: `yards_to_opponent_goal = 150 − Cap+`, clamped 0–100, on
**exactly two** surfaces — the **league Field** (the leaderboard on `/` and `/division/{div}`) and
the **team Drive** (the 25-season history). Nowhere else.

Both are rank-3 and rank-5 uncovered surfaces with **zero visual existence in the handoff**. The
anatomy below is what the chart system contributes; the full compositions are a Phase-B production
task.

| Element | Spec |
|---|---|
| Field ground | `--yy-bg-card-flat`. **No green turf fill, no stadium texture, no crowd.** The field is a coordinate system, not an illustration. |
| Yard lines | Every 10 yards: `1px`, `--yy-gridline`. These *are* the gridlines; they obey the 15% ceiling like any other. |
| Hash marks | Every 5 yards: 4px ticks, `--yy-gridline`. Omitted below 320px of field length. |
| Yard numbers | `.yy-label` `--yy-fg-3`. `[BRAND]`: *"Yard numbers and hash marks may reinforce an axis but must not replace conventional labels."* |
| **The Cap+ axis** | **Mandatory, and rendered as a conventional axis alongside the field**, with its own tick labels in index units. The field is the second encoding, never the only one. |
| Red zone | The 0–20 band gets `--yy-accent` at 6% fill and a `.yy-micro` label `RED ZONE — CAP+ 130+`. |
| Safety | The own-goal-line band gets `--yy-negative-fill` at 6% and `.yy-micro` `SAFETY — CAP+ BELOW 50`. |
| Mark | The team's position is a TeamMark at `xs` (or its fallback chip) on a 1px `--yy-fg-2` stem to the field line. |
| Coverage | A team with `blank` Cap+ is **off the field**, in a labelled group beneath it headed `NOT COVERED — {reason}`. It is never placed at the goal line, which would read as Cap+ 150 or 50. |

**The Value Stadium** (`DECISIONS.md` 44 — money allocation; sections are position groups by cap
share, gold ring is the league average, dead money is unlit seats) is **not a v1 row**. Its semantics
are settled and one anatomy note belongs here so it is not designed wrongly later:
**stadium sections are not colour-coded by position group.** Nine categories cannot be separated in
one hue family (§9). Sections take `--yy-bg-track` with a single `--yy-accent` highlight on the
selected group; the gold ring, the unlit seats and the direct labels carry the rest.

---

## 8. D3 / visx implementation notes

Every spec item above, mapped to a primitive. Scales come from `d3-scale`; rendering from `visx`
components; **no chart library that owns its own visual language** (`SPEC.md` §4). Token values are
read from `tokens.json`, never re-typed in TS.

| Spec item | Primitive | Notes |
|---|---|---|
| Value axis, index charts | `scaleLinear().domain([76,124]).nice(false)` | **`.nice()` is off.** It would move the domain away from the ±24 window and make two seasons incomparable. |
| Value axis, dollars | `scaleLinear().domain([0, ceil(max*1.05/5e6)*5e6])` | Always includes zero. |
| Domain axis, seasons | `scalePoint().domain(seasons).padding(0.5)` | `scalePoint`, not `scaleTime` — seasons are ordinal labels, not instants, and `scaleTime` will happily interpolate across a blank. |
| Domain axis, teams | `scaleBand().padding(0.18)` | |
| Axis render | `<AxisBottom>` with `hideTicks`, `hideAxisLine={false}`; `<AxisLeft>` with `hideAxisLine`, `hideTicks` | Matches §2: domain axis line only, no tick marks. |
| Tick labels | `tickLabelProps` → `{fontFamily: tokens['--yy-font-body'], fontSize: 11, fill: tokens['--yy-fg-3']}` | 11px, the D1 floor. |
| Tick count | `numTicks={Math.floor(axisLength/64)}` | §2. |
| Gridlines | `<GridRows>` only. **Never `<GridColumns>` with `<GridRows>`.** | `stroke={tokens['--yy-gridline']}`, `strokeWidth={1}` |
| Benchmark line | `<Line>` ×2 — one solid at `--yy-benchmark-line-under`, one `strokeDasharray="3 4"` at `--yy-benchmark-line` | Two elements, exactly as the mockup composites it. |
| Benchmark label | `<Text>` with `verticalAnchor="end"`, `dy={-6}` | Never a `<Tooltip>`. |
| Bars | `<Bar rx={2}>` | `rx` = `--yy-radius-mark`. |
| Butterfly inner corners | Custom `<path>` — visx has no per-corner radius | `2px 0 0 2px` / `0 2px 2px 0` `[MOCKUP]` |
| Lines | `<LinePath curve={curveLinear}>` | **`curveLinear`, never `curveMonotoneX` or `curveBasis`.** A smoothed curve invents values between measured seasons. |
| Blank spans | **Split the data into runs and render one `<LinePath>` per run.** Never `defined()` on a single path. | `defined()` produces one `<path>` with a gap, and browsers still treat it as one shape for `stroke-dasharray`, `pathLength` and hit-testing. Separate elements are separate facts. |
| Blank overlay | `<PatternLines id="yy-partial" height={6} width={6} stroke={tokens['--yy-partial']} strokeWidth={2} orientation={['diagonal']}/>` + a `<Bar fill="url(#yy-partial)">` | One shared `<PatternLines>` per chart, referenced by id. |
| Scatter | `<Circle>` with `r` from the extremity rule (`--yy-dot-lg` when `idx ≥ 105 ∥ < 92`, else `--yy-dot`) | `[MOCKUP]` |
| Direct labels | `<Text>` with `opacity` from the mockup's density rule: `1` when `idx ≥ 104 ∥ ≤ 93`, else `.45` | `[MOCKUP]` — this is the mockup's answer to label collision and it is a good one. |
| Label collision | The opacity rule first; `<Annotation>` connectors only where two labels still overlap after it | Never rotate a data label. |
| Tooltip | `visx/tooltip` `useTooltip` + `TooltipWithBounds`. Content: **metric · value · percentile/rank · sample n · source date** `[BRAND]` | A tooltip may only *repeat and enrich* what is already on the surface. It may never be the only place a caveat, a date or a coverage reason lives. |
| Responsive | `<ParentSize>` | The mobile and desktop compositions are different components, not one component at two widths (`MOBILE_PATTERNS.md` §5). |
| Tabular figures | `font-variant-numeric: tabular-nums` on the `<svg>` root | SVG `<text>` inherits it; setting it per-element is 40 redundant attributes. |
| Motion | `@visx/react-spring` `useTransition`/`useSpring`, config `{duration: tokens['--yy-dur-chart'], easing}` | Duration read from the token so reduced-motion collapses it. Under reduced motion `immediate: true`. |
| Accessibility | `role="img"` + `<title>`/`<desc>` on the `<svg>`, plus the CSV export (`COMPONENTS.md` §14) as the tabular equivalent | The CSV *is* the accessible data table; that is why §8.1 puts it on every chart backed by a table. |
| Theming | Read tokens from `tokens.json` at build; re-read on `data-theme` change via CSS custom properties on the `<svg>` where possible (`fill="var(--yy-accent)"` works in SVG) | Prefer `var()` in SVG attributes over JS colour values; then a theme flip needs no re-render. |

---

## 9. The categorical-colour finding

**A nine-step categorical ramp is not achievable inside this brand and the system does not ship one.**

Measured: the best nine-colour set constructible in the lime → field-green → slate family gives an
all-pairs minimum ΔL\* of **~2** and four adjacent pairs below the 10 ΔL\* separation threshold. The
constraints that make it impossible are all load-bearing: team colour is never a chart colour
(`SPEC.md` §4), red is reserved for genuine negatives, gold is benchmarks only, and lime is capped at
one series per chart. There is no ninth hue available, and there should not be.

**Therefore:**

1. `--yy-pos-1` … `--yy-pos-5` ship verbatim from the mockup, with a **hard cap of five simultaneous
   categories**, used where ≤5 groups appear at once (the cap-leak bar's four roster states; the
   obligation horizon's five groups).
2. **Where all nine position groups appear at once** — allocation bars, the Value Stadium, the league
   heatmap — the encoding is **position + direct label + magnitude**, never hue. See
   `COMPONENTS.md` §7.2 for the allocation ruling, §7 above for the Stadium.
3. Where a diverging quantity genuinely needs a ramp (the league heatmap), it runs
   `--yy-negative-fill` → `--yy-bg-empty` → `--yy-accent` on **alpha**, not on hue, with the value
   printed in every cell in `.yy-micro`. **Check this one against "one lime series per chart"** —
   a diverging ramp using lime as an end is the one place the mockup arguably strains the rule, and
   it passes only because the cell values are printed and the ramp is a scale, not a series.
