# SCREENSHOT_VARIANTS.md — the social-legible variant of every key card

**Phase B. Binding.** `SPEC.md` §4: *"Every key card is screenshot-able. Self-contained (no meaning
depends on surrounding page chrome), titled, carrying the caption '100 = league average' wherever
Cap+ leads, carrying a subtle product mark, and legible when dropped into both a light and a dark
social feed. **Screenshot variants are a build target, not an afterthought.**"*

`PHASE_A_COVERAGE.md` row 66 scores this **NONE**: no card in the mockup carries a product mark,
several depend on page context for meaning, and no square composition exists anywhere in the
handoff. Everything here is originated on top of the C5/C6 rig from Study C.

---

## 1. The export scope

One class, applied by the renderer to the card root. It is a **token scope**, not a stylesheet — the
card's own CSS does not change.

```html
<div class="yy-export" data-theme="dark"> … the same component … </div>
```

`tokens.css` §27 redefines five things inside it:

| Token | In product | In export | Why |
|---|---|---|---|
| `--yy-line-card` | `rgba(168,177,173,.22)` | **`rgba(168,177,173,.42)`** | The feed fix. §2. |
| `--yy-bg-card` | `linear-gradient(160deg,#181C1D,#0E1112)` | `#181C1D` | Flat. Gradients band under PNG quantisation and under a feed's own re-compression. |
| `--yy-bg-card-lg` | gradient | `#16191B` | as above |
| every `--yy-dur-*` | 90–320ms | `1ms` | A rasteriser must not catch a card mid-transition. |
| `--yy-stagger` | 20ms | `0ms` | as above |

Light-mode export flips `--yy-line-card` to `rgba(7,28,22,.28)` and the surfaces to `#FFFFFF`.

**`--yy-card-border-export` applies to ALL screenshot variants of ALL cards, regardless of the
Receipt direction.** It is a finding about how a bordered dark card survives a feed, not a property
of one composition.

---

## 2. The feed-survival criteria (the C5/C6 rig)

`SPEC.md` §4 requires legibility in a **light and a dark** feed. Study C built the rig and found the
failure:

| Feed | Background | The `.22` border | Result |
|---|---|---|---|
| Light | `#FFFFFF` | 1.05:1 against the feed | The border vanishes; the card's rounded corners read as **cut off**, as if the screenshot were cropped badly. |
| Dark | `#111416` — **the brand's own Film Room** | 1.4:1 against the feed | The card **nearly merges** with the feed. The dark-on-dark case is the harder of the two, and it is the one the flagship theme guarantees. |

**Both are fixed by one conditional value: `.42`.**

### The criteria, as a checklist a build can assert

A screenshot variant ships only if all eight hold, tested at **both** `#FFFFFF` and `#111416`:

1. **Edge.** The card's border reads as an edge at 100% and at 50% scale. (`--yy-border-export`.)
2. **Self-contained.** Every figure on the card is explained by something else on the card. No
   meaning survives only in the page around it.
3. **Titled.** The card names its own subject: metric, scope, season. `COST PER WIN · CASH · 2025`
   over `AFC EAST` — not `AFC EAST` alone.
4. **Benchmarked in words.** The gold benchmark is named in text, not only drawn.
   `LEAGUE AVG $25.8M / WIN`. And **`100 = LEAGUE AVERAGE` wherever Cap+ leads** (`SPEC.md` §4,
   `CAPPLUS_LOCKUP.md` §3).
5. **Marked.** The product mark is present, at `--yy-size-mark`, at 55%. §5.
6. **Provenance.** Either a `SAMPLE` chip (placeholder data) or nothing. §6.
7. **Caveats visible.** Every disclosure is force-expanded; every as-of stamp, coverage reason and
   lens caveat is rendered. §4.
8. **AA at feed scale.** Every text/background pair on the card clears 4.5:1, and the card as a
   whole clears **3:1 against both feed backgrounds** at its edge.

---

## 3. Geometry — square-first where it applies

| Card | Square (1:1) | Wide (16:9 / OG 1200×630) | Notes |
|---|---|---|---|
| **Cost-per-win hero** | **Native.** 1080 × 1080, rendered from the `square` size prop at 400 × 400 @2.7 | Yes — the `wide` prop | Square-first: this is the card designed to be lifted. |
| **Cap+ leaderboard** | Top 10 only, labelled `TOP 10 OF 32` | Native — the full 32 needs width | Never a silent top-10. `SPEC.md` §3.1.3 is about the *product* view; an export that truncates must say so on the card. |
| **Three-lens summary** | Native | Yes | Three figures, three caveats, all visible. |
| **H2H comparison** | Native | Yes | Both era cards + the cross-era statement + the top 4 metric rows. The statement is not optional in an export. |
| **Allocation bars** | Native (9 rows fit) | Yes | |
| **25-season arc** | **No square variant.** | Native only | A 25-season axis in a square is 43px per season. Squeezing it produces a chart that lies about resolution. **A card with no honest square is not given one.** |
| **Dead-money ledger** | No | Wide only | Rows carry source URLs and as-of stamps; both need width. |
| **Dead-money dot plot** | Native | Yes | Every dot keeps its date label. If they collide, the export renders fewer seasons and says so — it never drops the labels. |

**Standard raster sizes:** square `1080 × 1080`; OG `1200 × 630`; story `1080 × 1920` (the square
composition, vertically centred on `--yy-bg`, with the product mark repeated at the foot).
Rendered at `devicePixelRatio: 2` minimum.

**Padding scales with the crop, type does not scale below the floor.** A 1080 square is the 400px
composition at 2.7×; every token in it is multiplied, so the 11px floor becomes 29.7px of raster —
legible at thumbnail in a feed, which is the actual test.

---

## 4. THE FORCE-EXPAND RULE

> **Any affordance that hides required text is EXPANDED in export, never removed.**

| In product | In export |
|---|---|
| Lens caveat disclosure, collapsed | **Expanded.** Full sentence rendered, no `(i)`, no button. |
| Row-card list, collapsed detail | Expanded, or the row is not in the export. |
| Truncated coverage reason | Full text. The card grows. |
| Tooltip content | Never exportable. If a fact is only in a tooltip, the card is not screenshot-able and must be fixed, not exported. |
| `aria-expanded` controls | Rendered as static text; the control disappears, the content stays. |

This is what makes a disclosure affordance acceptable at 390px at all
(`COMPONENTS.md` §1.8, `MOBILE_PATTERNS.md` §3.4). Without it, the disclosure would be a way of
dropping a caveat from the artifact most likely to be seen by the most people.

**Controls that are not disclosures are removed, not expanded:** the CASH/CAP toggle, the CSV
button, the sort headers, the chevrons. A control that cannot be operated is noise. The toggle's
*state* moves into the eyebrow (`COST PER WIN · CASH · 2025`), because the state is information and
the control is not.

---

## 5. Product mark discipline

| Rule | Value |
|---|---|
| Form | `YIELD/YARD`, `--yy-font-display` 400, `--yy-track-display`, slash in `--yy-accent` |
| Size | `--yy-size-mark` — 13px at mobile/square, 15px at wide. Scaled with the crop, never independently. |
| Opacity | 55%. On every card, in every variant, in both themes. |
| Position | Bottom-right of the strap, baseline-aligned with the benchmark text. **The same corner on every card**, so it reads as a signature and not as a watermark someone remembered. |
| Never | Larger than `--yy-size-mark`. At full opacity. Centred. Repeated. Given clear space at the cost of a data row. Rendered as the logo SVG. |
| Not a logo lockup | The brand's 140px minimum-width rule, its clear-space rule and its six-tier hierarchy govern **the logo**. This is a type signature set in the display face, which is exactly what the brand sanctions as *"wordmark approximations in prototypes"* — and what the mockup itself uses in every header. It is not the horizontal wordmark asset and must not be swapped for it. `[RULED]` |
| Story variant only | A second mark at the foot of a 1080 × 1920 crop, same size, same opacity. |

---

## 6. SAMPLE → real-data chip rules

| Condition | Chip |
|---|---|
| **Any** figure on the card is placeholder | `SAMPLE`, `.yy-micro`, `--yy-negative-text`, `1px` border at 40%, `--yy-radius-chip`, top-right of the head |
| All figures are real | **No chip.** Absence of the chip is the "real" state; there is no `LIVE` or `VERIFIED DATA` badge. |
| Some real, some placeholder | `SAMPLE`. **There is no partial state** — one placeholder figure makes the whole card a sample. |
| Provisional real data (2014, 2019 Cap+) | Not `SAMPLE`. The per-figure `PROVISIONAL` chip (`CHART_ANATOMY.md` §5.3) — a different claim entirely. |

**The chip is driven by the data layer, not by a prop.** `sample` is derived from the rows the card
received, so a developer cannot forget it and a card cannot ship a plausible-looking invented figure
into a feed unmarked. That is the whole reason the chip exists
(`PHASE_A_STUDIES.md`: *"so a placeholder figure can never be mistaken for a real one"*).

**The chip never appears in the product**, only in export — in-product placeholder data is a bug,
not a state.

---

## 7. The render path

```
1. Mount the component with size="square" | "wide", export={true}, theme fixed
2. Wrap in .yy-export with an explicit data-theme (never inherited)
3. Wait for document.fonts.ready          ← or Bebas rasterises as Arial Narrow
4. Force-expand every disclosure (§4)
5. Rasterise at devicePixelRatio >= 2
6. Assert the eight criteria (§2) programmatically where possible:
     - contrast of card edge vs #FFFFFF and #111416  >= 3:1
     - every text/bg pair on the card                >= 4.5:1
     - no element with aria-expanded="false"
     - product mark present
     - if any Metric is placeholder, SAMPLE chip present
7. Emit PNG (feeds re-compress; PNG survives a re-encode better than JPEG on
   flat fills and small type)
```

**Step 3 is not optional.** The brand's own logo SVGs already demonstrate the failure mode: they
ship as live `<text>` in Bebas Neue and render in Arial Narrow on any machine without the font
(`TYPE.md` §8).

**Step 6 is the build target.** `SPEC.md` §4 calls screenshot variants a build target rather than an
afterthought; a criterion that is asserted in CI is a build target, and one that is eyeballed is an
afterthought.

---

## 8. Light + dark parity

Every variant renders in both themes and both must pass §2 against both feed backgrounds — four
combinations per card:

| | Light feed `#FFFFFF` | Dark feed `#111416` |
|---|---|---|
| **Dark card** | Border `.42` provides the edge. High contrast; the easy case. | **The hard case.** The `.42` border is the only separation. Verified in the C6 rig. |
| **Light card** | The hard case for light. Border flips to `rgba(7,28,22,.28)`. | High contrast; easy. |

**Which theme does the product export by default?** The reader's current theme. Dark is the flagship
and will be most exports; the light path is not a fallback and gets the same eight checks.

**The one thing that does not flip:** the gold benchmark. `--yy-benchmark` becomes `--yy-gold-ink`
(`#8A6D14`, 4.52:1 on paper) in light mode, because `#D4AF37` measures **2.10:1 on white** and the
brand says so directly — *"avoid gold body text on white"*. The benchmark *line* keeps the gold hue
in both themes (it is a stroke, not text, and needs 3:1, which it clears); only the benchmark
**label** takes the ink value. `[BRAND + RULED]`
