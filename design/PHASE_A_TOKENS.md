# PHASE A — Token extraction & brand reconciliation

**Status:** extraction only. Divergences are **reported, not resolved**. Every "→ Rey" row is a
decision request, not a recommendation I have acted on.

**Sources parsed (byte-level, no rendering):**

| Source | Role | Path |
|---|---|---|
| The mockup | **visual source of truth** for the views it covers | `design/handoff/project/CAP+ Index.dc.html` |
| Mockup logic | data shaping, colour functions, chart geometry | `design/handoff/project/support.js` (§ the `<script data-dc-script>` block in the mockup; `support.js` itself is the generic dc-runtime and contributes **no product styling**) |
| Brand system | **authority** for identity, colour, type, chart colour logic | `design/handoff/project/uploads/yield-yard-brand-kit/design.md` |
| Brand guideline page | published token set in practice | `design/handoff/project/uploads/yield-yard-brand-kit/index.html` (byte-identical to `uploads/index.html`; `uploads/preview.html` differs only by a trailing newline) |
| Brand assets | logo / monogram / badge / app icon / reference board | `design/handoff/project/uploads/yield-yard-brand-kit/assets/` |
| Engineering contract | component inventory, token contract | `SPEC.md` §3, §4, §5, §6, §8 |
| Reference only | cited as exploration context, **never as authority** | `design/handoff/project/uploads/stitch_nfl_cap_economics_dashboard/` |

---

## 0. Headline counts

The mockup contains **no stylesheet** — every product value is an inline `style` attribute or a
template-interpolated value from the logic block. Extracted totals:

| Family | Distinct values observed |
|---|---:|
| Colour — hex | 33 |
| Colour — static `rgba()` | 60 (from **10** base triples) |
| Colour — dynamic alpha ramps (JS) | 3 |
| Type sizes | 27 |
| Type weights | 4 |
| Line heights | 13 |
| Letter spacings | 14 |
| Border radii | 14 |
| Spacing values (padding/margin/gap, px) | 25 |
| Gradients | 6 |
| Shadows | 1 (dynamic, chart-only) |
| Transitions / animations / durations / easings | **0** |
| **Total distinct raw values** | **200** (197 static + 3 dynamic) |

These collapse to a proposed **82-token** `--yy-*` set (§10) — the **15** published brand tokens
plus **67** new ones. So the mockup implies roughly **5.5×** the token surface the brand currently
publishes — the reconciliation in §11 is where that gap is itemised.

---

## 1. Colour — every value, with usage

### 1.1 Values that match the published brand tokens

| Hex | Brand token | Uses (hex / rgba) | Where in the mockup |
|---|---|---:|---|
| `#A6E22E` | `--yy-yield-lime` | 35 / 18 | Selected series everywhere; slash in the wordmark; active tab + tab label; selected filter pill (lime fill, End Zone text); Cap+ hero number; positive deltas; frontier "CAP+ 105+" dots and their glow; heatmap positive ramp; horizon QB segment; waterfall positive steps; CTA outline |
| `#D4AF37` | `--yy-premium-gold` | 3 / 7 | **Benchmarks only** — the 100-index midline in the division strip, the movers zero line, the frontier's dashed league-average cost-per-win line, the stream chart's 100 baseline, the "PROJECTED CAP CEILING" line + label, PIT's stream colour. Never a control. ✅ complies with brand + brief |
| `#071C16` | `--yy-end-zone` | 19 / 15 | Text on lime fills; light-surface headings (`WHO BUYS WINS CHEAPEST`, KPI values, movers abbreviations); light-surface hairlines as `rgba(7,28,22,α)` |
| `#A8B1AD` | `--yy-muted` | 30 / 41 | **The most-used base in the file.** Secondary labels on dark; every dark-surface hairline `rgba(168,177,173,.12–.35)`; legend text; axis units |
| `#FFFFFF` (`#fff`) | `--yy-chalk-white` | 13 / 4 | Wordmark; desktop white KPI/movers/spend-mix cards; desktop 1c card titles; `rgba(255,255,255,.12)` dark-card border |
| `#F5F6F2` | `--yy-paper` | 3 | Desktop page background and the design-doc canvas |
| `#111416` | `--yy-film-room` | 4 | **Only** the mobile bottom tab bar surface. Not used as the general dark surface |
| `#0B3D2E` | `--yy-field-green` | 1 | `a:hover` in the design-doc chrome. **Zero product uses.** |

### 1.2 Dark surfaces — invented by the mockup, absent from brand

| Value | Role | Uses |
|---|---|---:|
| `#0B0D0E` | Mobile app background (the phone canvas) | 10 |
| `linear-gradient(120deg,#191D1F,#0B0D0E)` | App/nav header surface (mobile + desktop) | 5 |
| `linear-gradient(160deg,#181C1D,#0E1112)` | **Mobile card** surface | 7 |
| `linear-gradient(160deg,#16191B,#0A0C0D)` | **Desktop / concept card** surface (`.dv-card`) | 4 |
| `#39423E` | Neutral bar fill (spend track, IR/PUP segment, neutral waterfall steps) | 6 |
| `#191D1E` | "SPACE" segment fill; heatmap gradient midpoint | 2 |
| `#2A2F31` | Avatar placeholder circle | 2 |

Three distinct near-black gradients where the brand offers **none**, and all three are **neutral
grey-black — none carries the green cast** `design.md` §Layout calls for ("dark cards may use a
subtle top-left-to-bottom-right green gradient").

### 1.3 Dark-mode foreground ladder — invented, absent from brand

| Value | Role | Uses |
|---|---|---:|
| `#EAF1EC` | Primary dark-mode ink (card titles, table values, ledger names) | 17 / 8 |
| `#A8B1AD` | Secondary label (= brand `--yy-muted`) | see 1.1 |
| `#6E8078` | **Tertiary/dim** — inactive tabs, axis ticks, sub-lines, captions | **48 — the single most-used hex in the file** |
| `#8FA39A` | Mid-band series ("95–104"), ranks 4+ in the leaderboard | 6 |
| `#B8C3BE` | Concept-card dek copy (1c only) | 4 |

The brand publishes exactly one neutral (`--yy-muted`). The mockup runs a **four-step** dark
foreground ladder. Nothing in the brand covers `#EAF1EC` or `#6E8078`.

### 1.4 Light-surface foreground ladder — invented, absent from brand

| Value | Role | Uses |
|---|---|---:|
| `#46534F` | Light-surface body copy (deks, KPI notes, chart footnotes) | 7 |
| `#71807A` | Light-surface label/unit text | 3 |
| `#4F7413` | **Lime, darkened for light surfaces** — link colour, positive KPI ink, positive movers value | 7 |
| `#B33A26` | **Red, darkened for light surfaces** — negative KPI ink, negative movers/diverge values | 5 |
| `#8A6D14` | **Gold, darkened for light surfaces** — declared in the `INK` map, never rendered | 1 |
| `#5A6B63` | Slate, darkened for light surfaces (`INK` map) | 1 |

The mockup's logic block carries an explicit **light-surface ink map**:

```js
const INK={'#A6E22E':'#4F7413','#D9503C':'#B33A26','#8FA39A':'#5A6B63','#D4AF37':'#8A6D14','#EAF1EC':'#071C16'};
```

This is the most valuable single artifact in the extraction: it is a **complete dark→light colour
pairing table** and it is exactly what the brand's "a true light mode is required, not an inverted
dark theme" (SPEC §4) needs. It is **not in `design.md`**. → §10 proposes it as `--yy-*-ink`.

### 1.5 The negative family — invented, and used inconsistently

| Value | Role | Uses |
|---|---|---:|
| `#D9503C` | The mockup's red (`ORANGE` in the logic). Legend "< 95", frontier low dots, quadrant "ALBATROSS", heatmap negative ramp, waterfall DEAD MONEY, mobile cap-leak DEAD segment | 5 |
| `#E8A08D` | Salmon. Dead-cap KPI value, WEEKLY SWING card border/label, contract-cliff void/dead dashed cells, **and the NE '07 comparison series in the H2H** | 7 |
| `#B33A26` | Light-surface red ink | 5 |
| `#2A0B06` | Text colour on red fills | 2 |

**The brand names no red token at all** — it states only a *rule* ("reserve for genuine negative
status"). The mockup invents three and then breaks the rule with the salmon (§12, divergence D3).

### 1.6 Categorical greens (Obligation Horizon stack)

`#A6E22E` (QB) → `#6FA22B` (WR) → `#A8B1AD` (OL) → `#4A6B58` (DL) → `#2F4A3D` (DB). A 5-step
categorical ramp for position groups, invented here. `#6FA22B` also fills the mobile cap-leak
ACTIVE segment. **This is the only positional-group palette anywhere in the handoff** and it is a
direct input to the Value Stadium (which needs exactly this: position groups by cap share).

### 1.7 Alpha discipline

29 distinct alpha values in use (`0, .05, .06, .07, .09, .1, .12, .13, .14, .15, .16, .18, .2,
.22, .25, .28, .3, .35, .4, .45, .5, .55, .6, .65, .7, .75, .8, .85, .9`). Semantic clusters:

- **Hairlines:** `.10–.15` on light (`rgba(7,28,22,α)`), `.12–.22` on dark (`rgba(168,177,173,α)`)
- **Gridlines:** `rgba(168,177,173,.1)` — ✅ meets the brand's "gridlines below 15% opacity"
- **Card borders:** `.22` (mobile), `rgba(255,255,255,.12)` (desktop), `.3–.4` for lime/salmon accented cards
- **Tinted card fills:** `.05–.09`
- **Benchmark strokes (gold):** `.5–.75`
- **Data-mark fills:** `.7–.75` (H2H bars), dynamic `0.08 + v/max*0.62` (contract-cliff heat), dynamic `0.08 + |z|*0.5…0.55` (league heatmap)

### 1.8 Artifact to flag

`rgba(3,20,39,·)` appears **twice** in the authoritative mockup — as the mobile hero card's gradient
end stop and as the non-cheap scatter dot stroke. `#031427` is the **`surface` colour of the
REFERENCE-ONLY stitch exploration** (`stitch_nfl_cap_economics_dashboard/.../Design MD - REFERENCE
ONLY.md`). A reference-only palette value has leaked into the source of truth. Harmless at `α=0`
(the gradient stop), visible at `α=.6` (the dot stroke). → Rey: confirm this is a leftover before
it is tokenised.

---

## 2. Type — the stack as actually used

### 2.1 Faces requested vs faces used

The mockup's font request:

```html
family=Bebas+Neue & family=Rajdhani:wght@400;500;600;700 & family=Squada+One & family=Inter:wght@400;500;600
```

| Face | Requested by mockup | Used in mockup CSS | In brand token stack | Shipped in handoff |
|---|:--:|---:|:--:|:--:|
| **Bebas Neue** | yes | **23 declarations** (400 ×8, 700 ×15) | `--yy-font-display` | `Bebas_Neue/BebasNeue-Regular.ttf` (OFL) |
| **Rajdhani** | yes (400/500/600/700) | **111 declarations** (400 ×25, 500 ×60, 600 ×23, 700 ×3) | *2nd* in `--yy-font-athletic` | **not shipped** (Google Fonts only) |
| **Inter** | yes (400/500/600) | **16 declarations** (400 ×14, 600 ×1, unweighted ×1) | `--yy-font-body` | **not shipped** (Google Fonts only) |
| **Squada One** | **yes** | **0** | no | `Squada_One/SquadaOne-Regular.ttf` (OFL) |
| **DM Serif Display** | no | **0** | no | `DM_Serif_Display/*.ttf` (OFL, Regular + Italic) |
| **Squadron Black** | no | **0** | *1st* in `--yy-font-athletic` | no (must be licensed) |

Full treatment in §12.

### 2.2 Size ladder as used (27 sizes)

Grouped by the role the mockup assigns them:

| Band | Sizes observed | Face | Role |
|---|---|---|---|
| Micro-label | 8, 8.5, 9, 9.5 px | Rajdhani 400/500 | Axis ticks, legends, tab labels, eyebrows, cell values, column headers. **9px alone accounts for 43 declarations** |
| Label | 10, 10.5, 11, 11.5 px | Rajdhani 400/500/600 | Chips, filter pills, row abbreviations, legends, ledger names |
| Micro-body | 11.5, 12, 12.5, 13.5 px | Inter 400 | Card explanatory copy, narrative cards, footnotes |
| Body | 14 px | Inter 400 | Desktop dek only (single use) |
| Card title | 12, 13, 17, 19, 20 px | Bebas 700 | Section headings inside cards |
| Sub-metric | 13, 18, 21 px | Rajdhani 600 | Table index values, KPI tile values |
| Metric | 30, 34, 40 px | Rajdhani 600 | Team header index, desktop KPI values, H2H era numbers |
| Hero metric | 64 px | Rajdhani 600 (`line-height .85`, `letter-spacing -.05em`) | The mobile Cap+ hero number |
| Display | 21, 22, 24, 32, 40, 76 px | Bebas 400/700 | Wordmark (24 mobile / 32 desktop), screen titles, concept-card titles (40), page H1 (76) |

**Weights:** `400, 500, 600, 700`. Note `700` is applied to Bebas Neue (a single-weight 400 face) in
**15 declarations** → synthetic bold. Rajdhani legitimately uses 400/500/600 in the product; its
three `700` uses are all in the design-doc chrome, never in a product screen.

**Line heights:** `.85, .9, .92, .95, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.55, 1.6, 1.7` — display
`.85–1.1`, label `1–1.4`, prose `1.5–1.7`.

**Letter spacings:** `-.05, -.04, -.03 em` (metrics, tightened) · `.02, .03, .06 em` (display) ·
`.08, .1, .12, .14, .16, .18, .2 em` (athletic caps) · `2px` (SVG-embedded Cap+ caption).

### 2.3 Tabular numerals — the null finding

`font-variant-numeric`, `font-feature-settings`, `tnum`: **zero occurrences in the mockup.** The
only occurrence anywhere in the handoff is the prescription in `design.md`
(`font-feature-settings:"tnum" 1,"ss01" 1`) — written for **Inter**.

The problem: the mockup renders roughly **90% of the product's numbers in Rajdhani**, not Inter —
every index value, KPI, delta, axis tick, ledger cell and heat cell. The brand's numeral policy does
not reach the face that carries the numbers. SPEC §4 and §8.3 both make tabular numerals
non-negotiable *on every numeric column, always*. → §12, and D6 in §13.

---

## 3. Spacing

**Observed px values:** `2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 26, 28, 36,
44, 48, 52, 96`.

**4px-grid audit vs `design.md` ("base spacing unit 4px; preferred increments 8, 12, 16, 24, 32, 48,
64, 96"):**

- **On grid (12 of 25):** 4, 8, 12, 16, 20, 24, 28, 36, 44, 48, 52, 96
- **Off grid (13 of 25):** **2, 3, 5, 6, 7, 9, 10, 11, 13, 14, 18, 22, 26**
- **Brand increments never used:** 32, 64 (96 appears once, as a label-column width)

Off-grid values are not noise — they are load-bearing: `gap:5px` (20 uses) is the tab-icon-to-label
gap on every bottom tab; `padding:12px 13px` (5 uses) is the mobile card padding; `padding:26px 28px`
(6 uses) is the desktop card padding; `gap:6px` (7 uses) is the legend swatch gap; `padding:9px 16px`
(4 uses) is the leaderboard row.

**Reading:** the mockup is built on a **~2px** effective grid, not 4px. Snapping it to 4px is a
visible re-layout of the 390px canvas, not a find-and-replace. → D5.

**Container padding observed:** mobile screen `16px`; mobile header `14px 16px 12px`; mobile card
`12px 13px` / `13px 14px`; desktop page `44px 48px 52px`; desktop nav `20px 48px`; desktop white
card `22px 24px` / `24px 26px`; dark card `26px 28px`.

---

## 4. Radii

| Value | Uses | Applied to |
|---|---:|---|
| `2px` | 15 | **Data marks** — bar fills, heat cells, ledger cells, legend swatches, quadrant frame |
| `3px` | 1 | Heatmap legend gradient rail |
| `4px` | 19 | Tab icons, stacked-segment bars, chips in the doc chrome |
| `5px` | 1 | Doc chrome only |
| `8px` | 3 | **Desktop segmented controls** (= `--yy-radius-control`) ✅ |
| `11px` | 4 | Mobile filter pills |
| `12px` | 1 | Desktop season/week picker chip |
| `14px` | 1 | Desktop picker chip variant |
| `16px` | 13 | **Mobile card** |
| `22px` | 8 | **Desktop / concept card** (= `--yy-radius-card`) ✅ |
| `34px` | 4 | Phone device frame (prototype chrome, not product) |
| `50%` | 7 | Avatars, scatter dots, legend dots |
| `2px 0 0 2px` / `0 2px 2px 0` | 2 | H2H butterfly bar ends (inner corners squared at the axis) |

Brand publishes two radii (22 card, 8 control) and a range ("standard card radius 18–24px"). The
mockup implies a **five-step scale**: `2` (data marks) · `4` (small chrome) · `8` (control) · `11–16`
(mobile card + pills) · `22` (desktop card). The mobile card at **16px sits below the brand's stated
18–24 floor**.

---

## 5. Borders & dividers

| Pattern | Value | Uses |
|---|---|---:|
| Light-surface hairline | `1px solid rgba(7,28,22,.15)` | 5 ✅ **exactly `--yy-border`** |
| Light-surface hairline, control | `1px solid rgba(7,28,22,.16)` | 2 (2 rows below the token — same intent, different value) |
| Light-surface divider | `1px solid rgba(7,28,22,.1)` / `.12)` / `.2)` | 4 |
| Dark card border | `1px solid rgba(168,177,173,.22)` | 7 |
| Dark card border (desktop) | `1px solid rgba(255,255,255,.12)` | 4 |
| Dark chrome border | `1px solid rgba(168,177,173,.18)` / `.3)` | 16 |
| Dark table divider | `1px solid rgba(168,177,173,.12)` / `.13)` / `.15)` | 3 |
| Accent card border (lime) | `1px solid rgba(166,226,46,.3)` / `.35)` / `.4)` | 6 |
| Accent card border (salmon) | `1px solid rgba(232,160,141,.28)` / `.4)` | 2 |
| **Benchmark rule (gold)** | `1px dashed rgba(212,175,55,.65)` over a `.5` solid | 2 ✅ brand's "gold dashed lines for expected value / benchmark" |
| **Absence rule (salmon)** | `1px dashed rgba(232,160,141,.75–.9)` | 3 — **the mockup's only visual grammar for "this does not exist"** (void/dead contract years) |
| Tab icon | `2px solid` (`#A6E22E` active / `#6E8078` inactive) | 16 |
| Active nav underline | `2px solid #A6E22E` | 1 |

The dashed-salmon "void / dead" cell is worth naming as a token: it is the closest thing in the
mockup to a **blank-state** treatment, and SPEC §1.2 needs one product-wide.

---

## 6. Elevation, gradients, glow

- **Box shadows: one, and it is a chart glow** — `0 0 12px rgba(166,226,46,.55)`, applied only to
  frontier scatter dots where `Cap+ ≥ 105`. Every card in the mockup is defined by **border +
  gradient**, never by shadow.
- **`--yy-shadow` (`0 24px 70px rgba(2,9,7,.18)`) is used zero times.**
- **6 gradients:** 3 surface gradients (§1.2), 1 hero-card lime wash
  `linear-gradient(160deg,rgba(166,226,46,.09),rgba(3,20,39,0) 65%)`, 1 quadrant field wash
  `linear-gradient(90deg,rgba(166,226,46,.05),rgba(217,80,60,.05))`, 1 heatmap **legend** rail
  `linear-gradient(90deg,#D9503C,#191D1E,#A6E22E)`.
- ✅ **No gradient appears inside a quantitative bar or line** in the mockup — brand rule honoured.
  (Note: the *brand's own* `index.html` breaks this rule — `.bar{background:linear-gradient(to
  top,#4f7413,var(--lime))}` in the hero value card. → D9.)

---

## 7. Motion — the null finding

**Zero** `transition`, `animation`, `@keyframes`, duration or easing declarations in the mockup.
Three `transform`s, all static layout (`translate(-50%,-50%)` centring ×2, `rotate(-18deg)` on the
frontier line, `translateY(-50%)` on an axis label). No hover, focus, active, pressed, loading or
disabled state is drawn anywhere.

`design.md` specifies no motion either. SPEC §4 requires "principled and restrained: motion
communicates state change and nothing else… everything respects `prefers-reduced-motion`", and §8.3
repeats it. **Motion is unspecified on both sides of the token boundary** — it is a Phase-B
origination task, not an extraction one. → §10 proposes a minimal seed set; it is *proposed*, not
extracted, and marked as such.

---

## 8. Layout, canvases, breakpoints

| Canvas | Width | Notes |
|---|---:|---|
| Mobile | **390 × 844** | 4 screens; matches SPEC §3's mobile-first 390px. Bottom tab bar `padding:10px 0 22px` (22px bottom = home-indicator inset, hardcoded, not `env(safe-area-inset-bottom)`) |
| Desktop | **1440** | Nav `padding:20px 48px`; page `padding:44px 48px 52px` → content width 1344 |
| Concept cards | **1180** | 1c only; a third width with no stated relationship to the other two |

**Zero media queries. Zero fluid units** (no `clamp`, `vw`, `%`-based type). The two canvases are
independent fixed designs — the brief's own note says so ("desktop is not a stretched phone"). There
is **no breakpoint system to extract**; the brand's `index.html` uses `900px` / `560px` for the
guideline page only.

Desktop grid, as observed: a 3-column-equivalent `flex` system with `gap:16px` — KPI row = 4 × `flex:1`;
main row = `flex:1.9` (frontier) + `flex:1` column (movers over spend-mix); bottom row = 2 × `flex:1`.
Chart minimum height `440px`; stream chart SVG `600×180` at `preserveAspectRatio:none`; clock SVG
`320×320`; quadrant `230px`.

---

## 9. Chart geometry constants worth tokenising

Extracted from the logic block — these are design decisions expressed as numbers:

| Constant | Value | Meaning |
|---|---|---|
| Index band thresholds | `≥105` lime · `95–104` slate · `<95` red | `idxColor()` — the product's core colour-encoding rule |
| Scatter dot size | `14px` if `idx ≥ 105 or < 92`, else `10px` | Emphasis by extremity |
| Label opacity | `1` if `idx ≥ 104 or ≤ 93`, else `.45` | Direct-labelling density control ✅ brand "use direct labels" |
| Stream widths | `3px` selected, `1.6px` comparison | Brand asks ≥2px in product UI → **comparison lines are 1.6px, under the floor** (D10) |
| Stream opacity | `1` selected, `.8–.85` comparison | |
| Index axis range | `76 – 124` (stream), `80 – 125` (division bars) | ±24 around 100 |
| Gridline positions | `12.5 / 37.5 / 62.5 / 87.5 %` | Quartile bands |
| Clock spokes | 18 (weeks), radii `52–130` | |
| Waterfall scale | `wfMax = 300` ($M) | |
| Horizon scale | `hzMax = 210` ($M) | |

---

## 10. Proposed `--yy-*` extension set (82 tokens: 15 published + 67 new)

Naming follows SPEC §4's **extend-never-rename** contract: the 15 published tokens keep their names
and values; everything below is **new**. Values are the mockup's observed values unless marked
`[PROPOSED]` (nothing to extract; needs a decision).

```css
:root {
  /* ── Published (unchanged, 15) ─────────────────────────────── */
  --yy-end-zone: #071C16;  --yy-field-green: #0B3D2E;  --yy-film-room: #111416;
  --yy-chalk-white: #FFFFFF; --yy-yield-lime: #A6E22E; --yy-premium-gold: #D4AF37;
  --yy-muted: #A8B1AD;     --yy-paper: #F5F6F2;
  --yy-font-display: "Bebas Neue","Arial Narrow",sans-serif;
  --yy-font-athletic: "Squadron Black","Rajdhani","Arial Narrow",sans-serif;
  --yy-font-body: "Inter",Arial,sans-serif;
  --yy-radius-card: 22px;  --yy-radius-control: 8px;
  --yy-border: 1px solid rgba(7,28,22,.15);
  --yy-shadow: 0 24px 70px rgba(2,9,7,.18);

  /* ── Dark surfaces (7) ─────────────────────────────────────── */
  --yy-surface-app:        #0B0D0E;
  --yy-surface-chrome:     linear-gradient(120deg,#191D1F,#0B0D0E);
  --yy-surface-card:       linear-gradient(160deg,#181C1D,#0E1112);   /* mobile */
  --yy-surface-card-lg:    linear-gradient(160deg,#16191B,#0A0C0D);   /* desktop */
  --yy-surface-tabbar:     #111416;                                    /* = film-room */
  --yy-surface-track:      #39423E;   /* neutral bar/track fill */
  --yy-surface-empty:      #191D1E;   /* unfilled / "space" fill */

  /* ── Foreground ladder, dark (4) ───────────────────────────── */
  --yy-ink-dark-1: #EAF1EC;  --yy-ink-dark-2: #A8B1AD;
  --yy-ink-dark-3: #6E8078;  --yy-ink-dark-mid: #8FA39A;

  /* ── Foreground ladder, light (3) ──────────────────────────── */
  --yy-ink-light-1: #071C16; --yy-ink-light-2: #46534F; --yy-ink-light-3: #71807A;

  /* ── Light-surface ink pairs (from the mockup's INK map) (4) ─ */
  --yy-lime-ink:  #4F7413;  --yy-red-ink:   #B33A26;
  --yy-gold-ink:  #8A6D14;  --yy-slate-ink: #5A6B63;

  /* ── Negative family (4) ───────────────────────────────────── */
  --yy-negative:      #D9503C;   /* genuine negative only */
  --yy-negative-soft: #E8A08D;   /* SEE D3 — currently double-booked */
  --yy-negative-ink:  #B33A26;
  --yy-on-negative:   #2A0B06;

  /* ── Index bands (3) ───────────────────────────────────────── */
  --yy-band-above: var(--yy-yield-lime);   /* Cap+ >= 105 */
  --yy-band-mid:   #8FA39A;                /* 95-104        */
  --yy-band-below: var(--yy-negative);     /* < 95          */

  /* ── Position-group ramp, 5-step (5) ───────────────────────── */
  --yy-pos-1: #A6E22E; --yy-pos-2: #6FA22B; --yy-pos-3: #A8B1AD;
  --yy-pos-4: #4A6B58; --yy-pos-5: #2F4A3D;

  /* ── Lines & rules (5) ─────────────────────────────────────── */
  --yy-hairline-dark:  1px solid rgba(168,177,173,.18);
  --yy-hairline-light: var(--yy-border);
  --yy-card-border-dark: 1px solid rgba(168,177,173,.22);
  --yy-gridline:       rgba(168,177,173,.10);        /* < 15% per brand */
  --yy-benchmark-rule: 1px dashed rgba(212,175,55,.65);

  /* ── Absence / blank grammar (2) ───────────────────────────── */
  --yy-blank-rule: 1px dashed rgba(232,160,141,.75);
  --yy-blank-fill: transparent;

  /* ── Radii (3 new) ─────────────────────────────────────────── */
  --yy-radius-mark: 2px;      /* every data mark */
  --yy-radius-chip: 4px;
  --yy-radius-card-sm: 16px;  /* mobile card — SEE D8 (below brand's 18px floor) */

  /* ── Spacing, as observed (9) ──────────────────────────────── */
  --yy-space-1: 4px;  --yy-space-2: 8px;  --yy-space-3: 12px; --yy-space-4: 16px;
  --yy-space-5: 20px; --yy-space-6: 24px; --yy-space-7: 28px; --yy-space-8: 44px;
  --yy-space-9: 48px;
  /* 13 off-grid values (2,3,5,6,7,9,10,11,13,14,18,22,26) remain unmapped — SEE D5 */

  /* ── Type sizes, product scale (8) ─────────────────────────── */
  --yy-size-micro: 9px;   --yy-size-label: 10px;  --yy-size-chip: 11px;
  --yy-size-body-sm: 12px; --yy-size-body: 14px;  --yy-size-metric-sm: 21px;
  --yy-size-metric: 34px;  --yy-size-metric-hero: 64px;
  /* SEE D1 — this ladder is 30-45% below the brand type scale */

  /* ── Chart line weights (2) ────────────────────────────────── */
  --yy-line-primary: 3px;  --yy-line-compare: 1.6px;   /* SEE D10 */

  /* ── Emphasis glow (1) ─────────────────────────────────────── */
  --yy-glow-lime: 0 0 12px rgba(166,226,46,.55);

  /* ── Motion [PROPOSED — nothing to extract, SEE §7] (7) ────── */
  --yy-dur-instant: 90ms;  --yy-dur-fast: 140ms;  --yy-dur-base: 200ms;
  --yy-dur-slow: 320ms;
  --yy-ease-standard: cubic-bezier(.2,0,0,1);
  --yy-ease-exit: cubic-bezier(.4,0,1,1);
  --yy-motion-reduce-scale: 0;   /* multiplier under prefers-reduced-motion */
}
```

**Count:** 15 published + 67 new = **82**. Of the 67 new, **60 are extracted from the mockup** and
**7 are proposed motion seeds** with no source in either document (§7).

---

## 11. RECONCILIATION TABLE

Status key: **MATCH** = mockup uses the brand value exactly · **DIVERGENT** = both define it,
differently · **MISSING-FROM-BRAND** = mockup needs it, brand does not publish it ·
**MISSING-FROM-MOCKUP** = brand publishes/requires it, mockup does not use it.

| # | Concern | Mockup value | Brand value | Status |
|---:|---|---|---|---|
| 1 | Lime | `#A6E22E` | `--yy-yield-lime #A6E22E` | MATCH |
| 2 | Gold | `#D4AF37` | `--yy-premium-gold #D4AF37` | MATCH |
| 3 | End Zone | `#071C16` | `--yy-end-zone #071C16` | MATCH |
| 4 | Muted | `#A8B1AD` | `--yy-muted #A8B1AD` | MATCH |
| 5 | Chalk White | `#fff` | `--yy-chalk-white #FFFFFF` | MATCH |
| 6 | Paper | `#F5F6F2` | `--yy-paper #F5F6F2` | MATCH |
| 7 | Film Room | `#111416`, tab bar only | `--yy-film-room`, "neutral black, text and interface chrome" | DIVERGENT (scope) |
| 8 | Field Green | 1 use, doc chrome `a:hover` | `--yy-field-green`, "secondary brand surface" | MISSING-FROM-MOCKUP |
| 9 | Dark app background | `#0B0D0E` | — | MISSING-FROM-BRAND |
| 10 | Dark card surface (mobile) | `linear-gradient(160deg,#181C1D,#0E1112)` | "dark cards **may use a subtle green gradient**" | DIVERGENT (neutral vs green) |
| 11 | Dark card surface (desktop) | `linear-gradient(160deg,#16191B,#0A0C0D)` | as above | DIVERGENT |
| 12 | Chrome/header surface | `linear-gradient(120deg,#191D1F,#0B0D0E)` | — | MISSING-FROM-BRAND |
| 13 | Dark-mode primary ink | `#EAF1EC` | — | MISSING-FROM-BRAND |
| 14 | Dark-mode tertiary ink | `#6E8078` (48 uses) | — | MISSING-FROM-BRAND |
| 15 | Mid-band series colour | `#8FA39A` | "white / muted gray comparison series" (no value) | MISSING-FROM-BRAND |
| 16 | Light-surface body ink | `#46534F` | — | MISSING-FROM-BRAND |
| 17 | Light-surface label ink | `#71807A` | — | MISSING-FROM-BRAND |
| 18 | Lime on light surfaces | `#4F7413` | "use End Zone or Film Room text **on** lime" (converse only) | MISSING-FROM-BRAND |
| 19 | Gold on light surfaces | `#8A6D14` (declared, unrendered) | "avoid gold body text on white" (prohibition, no alternative) | MISSING-FROM-BRAND |
| 20 | Red — primary | `#D9503C` | rule only, **no token** | MISSING-FROM-BRAND |
| 21 | Red — soft/salmon | `#E8A08D`, used for negatives **and** as an era-comparison series | "red: genuine negative only; comparisons white/gray/muted green" | **DIVERGENT (rule violation)** |
| 22 | Red — light-surface ink | `#B33A26` | — | MISSING-FROM-BRAND |
| 23 | Position-group ramp | 5 greens `#A6E22E→#2F4A3D` | — | MISSING-FROM-BRAND |
| 24 | Neutral track fill | `#39423E` | — | MISSING-FROM-BRAND |
| 25 | Gridline opacity | `.10` | "< 15%" | MATCH |
| 26 | Gold as control | never | "gold should mark benchmarks, not clickable controls" | MATCH |
| 27 | One lime series per chart | honoured in all 12 charts | "no more than one lime series per chart" | MATCH |
| 28 | Gradients in quantitative bars | none | "do not use gradients inside quantitative bars" | MATCH (mockup) / **DIVERGENT (brand `index.html` breaks its own rule)** |
| 29 | Colour ratio on mobile | ~100% dark, 0% paper, lime well above 6% | "55% white/paper · 25% End Zone · 12% neutral · 6% lime · 2% gold" | DIVERGENT |
| 30 | Stitch palette leak | `rgba(3,20,39,·)` ×2 | — (reference-only source) | ARTIFACT → Rey |
| 31 | Display face | `'Bebas Neue','Arial Narrow',sans-serif` | `--yy-font-display` identical | MATCH |
| 32 | Display weight | `700` on Bebas ×15 | `font-weight: 400` | DIVERGENT (synthetic bold) |
| 33 | Display line-height | `.85 / .9 / .92 / .95 / 1 / 1.1` | `line-height: 0.9` | DIVERGENT (6 values vs 1) |
| 34 | Display letter-spacing | `.02em` (wordmark) + `.06 / .1 / .14 / .18em` | `letter-spacing: 0.02em` | DIVERGENT |
| 35 | Athletic face | `'Rajdhani',sans-serif` — **Squadron Black absent from all 111 stacks** | `"Squadron Black","Rajdhani","Arial Narrow",sans-serif` | **DIVERGENT** |
| 36 | Athletic weight | `400 ×25 / 500 ×60 / 600 ×23` in product; `700` only in doc chrome | `font-weight: 700` | **DIVERGENT** — brand's prescribed weight is the one weight the product never uses |
| 37 | Athletic letter-spacing | 7 values `.08–.2em` | `0.08em` | DIVERGENT |
| 38 | Squada One | requested, **never used** | not named | ARTIFACT → Rey |
| 39 | DM Serif Display | shipped only; not requested, never used; no serif anywhere in the system | not named | ARTIFACT → Rey |
| 40 | Body face | `Inter,sans-serif` / `Inter,system-ui,sans-serif` | `"Inter",Arial,sans-serif` | DIVERGENT (fallback chain) |
| 41 | Tabular numerals | **0 occurrences** | `font-feature-settings:"tnum" 1,"ss01" 1` (Inter only) | **MISSING-FROM-MOCKUP** + gap in brand (silent on Rajdhani) |
| 42 | Hero type size | 76px (desktop H1) | Hero 120–176 / H1 80–104 desktop | DIVERGENT |
| 43 | Section-label size | 8–10.5px | 14–18 desktop / 13–16 mobile | **DIVERGENT (largest gap in the system)** |
| 44 | Body size | 11.5–14px | 16–18 desktop / 16 mobile | DIVERGENT |
| 45 | Data-label size | 8–10.5px | 12–14 / 11–13 | DIVERGENT |
| 46 | Major-metric size | 21–64px | 34–64 / 30–48 | MATCH at the top, DIVERGENT below 34 |
| 47 | Base spacing unit | effective 2px; 13 of 25 values off-grid | 4px | **DIVERGENT** |
| 48 | Preferred increments | 32 and 64 never used | `8,12,16,24,32,48,64,96` | DIVERGENT |
| 49 | Card radius (desktop) | `22px` | `--yy-radius-card: 22px` | MATCH |
| 50 | Card radius (mobile) | `16px` | "standard card radius 18–24px" | DIVERGENT |
| 51 | Control radius | `8px` | `--yy-radius-control: 8px` | MATCH |
| 52 | Data-mark radius | `2px` (15 uses) | — | MISSING-FROM-BRAND |
| 53 | Chip radii | `4 / 11 / 12 / 14px` | — | MISSING-FROM-BRAND |
| 54 | Light border | `1px solid rgba(7,28,22,.15)` | `--yy-border` identical | MATCH |
| 55 | Light border, variant | `rgba(7,28,22,.16)` on controls | single token | DIVERGENT (near-duplicate) |
| 56 | Dark border | `rgba(168,177,173,.22)` / `rgba(255,255,255,.12)` | — | MISSING-FROM-BRAND |
| 57 | Benchmark rule | `1px dashed rgba(212,175,55,.65)` | "gold dashed lines for expected value / median / target / benchmark" | MATCH |
| 58 | Blank/void rule | `1px dashed rgba(232,160,141,.75–.9)` | — (but SPEC §1.2 demands a blank grammar) | MISSING-FROM-BRAND |
| 59 | Elevation | **0 shadows**; cards = border + gradient | `--yy-shadow: 0 24px 70px rgba(2,9,7,.18)` | **MISSING-FROM-MOCKUP** |
| 60 | Emphasis glow | `0 0 12px rgba(166,226,46,.55)` | — ("avoid excessive neon glow") | MISSING-FROM-BRAND / borderline vs imagery guidance |
| 61 | Chart line weight, primary | `3px` | "min 3px marketing, 2px product UI" | MATCH |
| 62 | Chart line weight, comparison | `1.6px` | "2px in product UI" | **DIVERGENT (below floor)** |
| 63 | Motion durations | none | none | MISSING-FROM-BOTH (SPEC §4 requires) |
| 64 | Easings | none | none | MISSING-FROM-BOTH |
| 65 | `prefers-reduced-motion` | none | none | MISSING-FROM-BOTH (SPEC §8.3 requires) |
| 66 | Breakpoints | none — 2 fixed canvases (390 / 1440) + a third (1180) | `900px` / `560px` (guideline page only) | MISSING-FROM-BOTH (product) |
| 67 | Safe-area inset | hardcoded `22px` bottom padding | — | DIVERGENT (should be `env(safe-area-inset-bottom)`) |
| 68 | Light theme for charts | none — every chart is a dark card, even on the paper page | "all core product views need a true light mode" (SPEC §4: "a designed light theme") | **MISSING-FROM-MOCKUP** |
| 69 | Icon system | 20×20 squares, `2px` border, placeholders | "2px stroke at 24px; geometric line icons, rounded caps; 8 named metaphors" | **MISSING-FROM-MOCKUP** |
| 70 | Yard-tick divider motif | none | "use yard ticks as dividers sparingly — a structural motif" | MISSING-FROM-MOCKUP |
| 71 | Imagery / scrim | no imagery at all | photography direction + 65–85% dark green scrim | MISSING-FROM-MOCKUP |
| 72 | Value Stadium | nothing resembling it | "**the signature visualization**" | **MISSING-FROM-MOCKUP** |
| 73 | Logo lockups | text wordmark only (`YIELD/YARD`, Bebas 24/32px) | 6-tier logo hierarchy + clear space + min sizes | MISSING-FROM-MOCKUP |
| 74 | Selected state | lime fill + End Zone text on pills/tabs | "selected states use Yield Lime with End Zone text" | MATCH |
| 75 | Focus / hover / disabled / loading | none | none | MISSING-FROM-BOTH (SPEC §8.3 AA) |
| 76 | Tooltips | none | "tooltips show metric, percentile/rank, sample and source date" | MISSING-FROM-MOCKUP |
| 77 | Direct labelling | yes — scatter, streams, quadrant, legends all directly labelled | "use direct labels where possible" | MATCH |
| 78 | 32-team colour palette rule | team colour never used (mockup: "no team logos; marks are abstract wordmark chips") | brand silent; SPEC §4 defers to the design track | OPEN — design track owes a recommendation |

**Tally — 78 rows:** **MATCH 17** · **DIVERGENT 22** · **MISSING-FROM-BRAND 18** ·
**MISSING-FROM-MOCKUP 10** · **MISSING-FROM-BOTH 5** · **ARTIFACT/OPEN 4** (rows 30, 38, 39, 78) ·
**MIXED 2** (row 28, where the mockup matches and the brand's own guideline page diverges; row 46,
which matches above 34px and diverges below it).

**So: 24 of 78 rows carry a divergence** (22 DIVERGENT + the 2 mixed). Those 24 rows distil to the
**15 named divergences D1–D15** in §13 — several rows describe one underlying disagreement (the six
type-scale rows are all D1; the three athletic-face rows are all D2).

---

## 12. THE FONT QUESTION

### What each source actually says

| Source | Athletic/numeric face named |
|---|---|
| Product brief (as relayed) | **Squadron Black**, with **Rajdhani** as substitute |
| `SPEC.md` §4 | "Squadron Black — athletic/numeric accent. **Rajdhani is the substitute until Squadron is licensed** (approval gate #2, price TBD by the design track). **The substitution is a single token value.**" |
| `design.md` §Typography + CSS tokens | `--yy-font-athletic: "Squadron Black","Rajdhani","Arial Narrow",sans-serif` — "Squadron Black is not bundled in this kit. It must be separately licensed and installed. Until then, use **Rajdhani Bold**" |
| Brand `index.html` | Loads Bebas Neue + Inter(400–800) + **Rajdhani(500,600,700)**. Does not load Squadron, Squada One or DM Serif |
| Brand `assets/reference-board.png` | Typography panel reads **"BEBAS NEUE / SQUADRON BLK"** |
| **The mockup** | Loads Bebas Neue + **Rajdhani(400,500,600,700)** + **Squada One** + Inter(400,500,600). Uses **Rajdhani ×111, Bebas ×23, Inter ×16, Squada One ×0, Squadron Black ×0** |
| **Handoff font folder** | Ships **Squada One** (OFL), **Bebas Neue** (OFL), **DM Serif Display** (OFL, Regular + Italic). Ships **neither Rajdhani nor Inter** |

### The discrepancy set — five separate problems

**F1 — Squadron Black exists in no artefact.** It is named by the brief, the SPEC and the brand token
stack, and pictured on the reference board. It appears in **zero** lines of implemented CSS and is
not in the kit. Nothing has ever been drawn in it.

**F2 — The mockup does not route through the token.** All 111 athletic declarations hardcode
`'Rajdhani',sans-serif`. Squadron Black is not even in the fallback chain. SPEC §4's premise — *"the
substitution is a single token value"* — **is false as the mockup is drawn**. Making it true is a
Phase-B task (route all athletic call sites through `--yy-font-athletic`) and must happen *before*
gate #2 is exercised, or the swap is a 111-site edit.

**F3 — Squada One is requested but unused.** The mockup asks Google Fonts for Squada One on every
load and never sets it on anything. It is the one *athletic-adjacent* face actually shipped in the
handoff, under OFL (i.e. **free**). Either it was tried and abandoned, or it is the intended
Squadron stand-in and the wiring was never done. → **Rey's call.** If Squada One is the answer, gate
#2's font line item goes to **$0**.

**F4 — DM Serif Display is orphaned.** Shipped as two TTFs, requested by nothing, used by nothing,
and **no serif appears anywhere in the brand system or the mockup**. Either it is stray payload from
a Google Fonts multi-download (the folder is literally named
`Bebas_Neue,DM_Serif_Display,Squada_One`) or an unstated editorial direction. → **Rey's call.**

**F5 — The weight ladder is the real constraint, not the metrics.** The mockup's athletic layer uses
**three weights in product** — 400 ×25 (values/prose-ish), 500 ×60 (the workhorse label weight),
600 ×23 (metrics) — plus 700 ×3 confined to the design-doc chrome. Note the brand prescribes
`font-weight: 700` for the athletic face, which is **the one weight the product screens never use**.
Rajdhani ships 400/500/600/700 and is the **only face in the kit that can serve that ladder**. Squada One and Bebas
Neue are **single-weight (400) display faces**. Substituting either one does not just change metrics
— it collapses a three-step hierarchy to one, and every place the mockup distinguishes a label (500)
from a value (600) stops distinguishing. Squadron Black, being a single "Black" weight, has the same
problem unless the full family is licensed.

**Related:** Bebas Neue is likewise single-weight, and the mockup applies `font-weight:700` to it in
14 declarations — synthetic bold. **The brand's own logo SVGs do the same** (`font-weight="700"` on
`'Bebas Neue'` in all four wordmark files) — and those SVGs use **live `<text>`, not outlines**, so
they render in Arial Narrow on any machine without Bebas installed. That is a delivery bug in the
identity assets independent of the font decision.

**Related:** the numeral question (§2.3). ~90% of the product's numbers are set in the athletic face,
and the brand's tabular-numeral instruction covers Inter only. Whichever face wins must be verified
for tabular figures, **or** the numeral policy moves to Inter for all tabular surfaces — which is a
different-looking product than the mockup.

### Implication for BUILD_PLAN gate #2 (noted, not edited)

`BUILD_PLAN.md` gate #2 bundles domain (~$15/yr) + "Squadron Black price TBD by the design track"
against a $200 ceiling, and states the swap "is one token value". Three findings bear on it, and I
am recording them here rather than touching that file:

1. **The price line may be $0.** Squada One (OFL) is already in the kit; if Rey accepts it — or
   accepts Rajdhani permanently — the font item costs nothing and gate #2 reduces to the domain.
2. **The "one token value" premise needs work first.** As drawn, the swap is 111 hardcoded call
   sites. Phase B must tokenise the athletic layer before the gate can be exercised cheaply.
3. **The true cost is re-layout, not licence.** Any single-weight substitute collapses the mockup's
   four-weight athletic hierarchy; budget label-layer re-layout, not just a token change. That cost
   lands whether the licence is $0 or $200.

**Decision requested from Rey (one call, four options):** (a) Rajdhani permanent — $0, zero rework,
abandons Squadron; (b) Squada One — $0, shipped, but single-weight (F5) and currently unused;
(c) licence Squadron Black — price TBD, plus label-layer re-layout; (d) keep the substitute and
defer. Everything else in Phase B is unblocked either way; only the athletic tokenisation task
depends on the answer.

---

## 13. DIVERGENCE INDEX — worst first

Ranked by *where it bites*, not by how many rows it touches.

| ID | Divergence | Mockup | Brand | Where it bites |
|---|---|---|---|---|
| **D1** | **Utility type scale runs 30–45% below brand** | labels/data at **8–10.5px**, body at 11.5–14px | section label **14–18** desktop / 13–16 mobile; body 16–18; data label 12–14 | Every number, axis, legend and chip in the product. It is an **AA legibility** question and a **layout** question at once: the 390px canonical canvas only fits its content because the labels are 9px. Raising the scale to brand re-flows all four mobile screens. This is the single most consequential open value in the system |
| **D2** | **Athletic face hardcoded; Squadron absent from every stack** | `'Rajdhani',sans-serif` ×111 | `"Squadron Black","Rajdhani",…` | Gate #2's "single token value" swap is false as drawn; the athletic layer must be tokenised in Phase B or the gate becomes a 113-site edit. See §12 |
| **D3** | **Red used as a comparison series** | `#E8A08D` salmon carries NE '07 in the H2H — an era comparison, not a negative — while also carrying dead cap, the weekly-swing alert and void contract years | "red: **genuine negative only**"; comparisons white / gray / muted green (brand + the settled brief) | The **compare view** — one of the four v1 views. Every H2H reader is told the older team is "bad" by colour alone. Needs either a neutral comparison colour or an explicit exemption; do not let it ship ambiguous |
| **D4** | **No dark-surface tokens exist in brand** | 4 dark surfaces + 3 neutral gradients invented; **none green-cast** | brand publishes no dark surface and says dark cards "may use a subtle green gradient" | Dark is the flagship theme (SPEC §4). The entire flagship theme is currently un-branded, and the mockup's answer contradicts the one hint the brand gives |
| **D5** | **Effective 2px grid, not 4px** | 13 of 25 spacing values off-grid; 32 and 64 never used | base 4px; increments 8/12/16/24/32/48/64/96 | Any grid enforcement re-lays-out the mobile canvas. Off-grid values are load-bearing (tab gap 5px, card padding 12/13px) |
| **D6** | **Tabular numerals absent, and the policy has a hole** | 0 occurrences; ~90% of numbers set in Rajdhani | prescribed for **Inter only** | SPEC §4 and §8.3 both make tnum non-negotiable "on every numeric column, always". Every leaderboard, ledger and cliff matrix in the mockup will jitter on data change |
| **D7** | **No light rendering of any chart** | every chart is a dark card, even inside the light desktop page | "all core product views need a true light mode"; SPEC §4: "a **designed** light theme, not an inverted dark theme" | Light mode is a stated v1 requirement with **zero** visual precedent in the handoff. Phase B must originate it |
| **D8** | Mobile card radius below brand floor | `16px` | "standard card radius 18–24px" | Cosmetic but system-wide: 13 mobile cards |
| **D9** | **The brand page breaks its own chart rule** | mockup: no gradients in bars ✅ | `design.md`: "do not use gradients inside quantitative bars"; `index.html` `.bar{linear-gradient(to top,#4f7413,var(--lime))}` | The authority contradicts itself. The mockup is on the correct side. Flagging so the guideline page is corrected rather than copied |
| **D10** | Comparison line weight under the product floor | `1.6px` | "minimum … 2px in product UI" | The 25-season stream chart — a v1 team-page surface (SPEC §3.2.2) |
| **D11** | Display face faux-bolded | `font-weight:700` on Bebas ×15 (+ in the brand's own logo SVGs) | `font-weight: 400` | Synthetic bold degrades a display face; the logo SVGs additionally ship as live text, not outlines |
| **D12** | Colour ratios inverted on mobile | ~100% dark, 0% paper, lime well over 6% | 55% paper / 25% End Zone / 6% lime / 2% gold | The mobile surface is the canonical one (SPEC §3). Either the ratios are desktop-only guidance or the mobile design is off-brand — needs a stated answer |
| **D13** | Film Room scoped to one element | tab bar only | "neutral black, text and interface chrome" | Minor, but it means the brand's only dark neutral is doing 1/20th of the work the brand describes |
| **D14** | Motion unspecified on both sides | none | none | SPEC §4 + §8.3 require principled motion and `prefers-reduced-motion`. Origination task, flagged so it is not mistaken for extraction |
| **D15** | Reference-only palette leak | `rgba(3,20,39,·)` ×2 | — | `#031427` is the **stitch** surface colour. Confirm before tokenising |

---

## 14. What Phase B inherits

- **Extracted and safe to build on:** the colour system (§1), the index-band colour rule (§9), the
  light-surface ink map (§1.4), the benchmark grammar (gold dashed), the blank grammar (salmon
  dashed), card construction (border + gradient, no shadow), the position-group ramp, direct
  labelling, and the two fixed canvases.
- **Extracted but contested:** the type scale (D1), the athletic face (D2), spacing grid (D5), the
  red family (D3).
- **Not extractable — must be originated in Phase B:** light theme for charts (D7), motion (D14),
  the icon set, focus/hover/disabled/loading states, tooltips, the blank/partial/coverage state
  system (SPEC §1.2), Value Stadium, both field-literal surfaces, and the 32-team palette rule.
