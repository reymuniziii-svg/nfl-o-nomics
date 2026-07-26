# MOBILE_PATTERNS.md — mobile-first patterns and the desktop scale-up

**Phase B. Binding.** `SPEC.md` §3: *"Mobile-first at 390px; every layout is specified at that width
first, then relaxes."* The mockup's brief says the other half: *"desktop is not a stretched phone."*
Both are true and this document is where they are reconciled.

The canonical canvas is **390 × 844**. Every measurement here is at that width.

---

## 1. The 390 budget

| Region | Height | Notes |
|---|---:|---|
| Status bar (OS) | 47 | Not ours |
| App header | 62 | `--yy-space-4` / `--yy-space-4` / `--yy-space-3` padding |
| **Content viewport** | **~591** | This is the real number |
| Tab bar | 68 + `--yy-safe-bottom` | |

**Content width is 358px** (390 − 2 × `--yy-space-4`). Every fixed column in `COMPONENTS.md` is
measured against 358.

**Consequence, stated so it is not rediscovered:** roughly **one and a half cards** are visible at a
time. Card order is therefore an information-priority decision, not a layout one, and the first card
on every view must be self-sufficient — a reader who never scrolls has still been told something
true.

---

## 2. Scroll & card stacking

| Rule | Spec |
|---|---|
| Page scroll | One vertical scroll per view. **No nested vertical scrollers**, ever. Two vertical scrollers on a touch surface is a coin flip about which one moves. |
| Card gap | `--yy-space-3` (12px) |
| Card padding | `--yy-space-3` block / `--yy-space-3` inline (the mockup's `12px 13px`, snapped to grid `[RULED D5]`) |
| Card radius | `--yy-radius-card-sm` (18px) |
| Full-bleed | The hero card only. It sits inside the `--yy-space-4` page padding like every other card — "full-bleed" in `SPEC.md` §3.1.2 means *full content width*, not edge-to-edge. An edge-to-edge card loses its border, and the border is how a card is a card in this system. |
| Horizontal scrollers | Permitted for **pill rows and small-multiple strips only**, never for tabular data. Always `scroll-snap`, always with a 24px `mask-image` edge fade on both ends. |
| Scroll restoration | Preserved per route. Returning from a team page to the leaderboard returns to the row you left. |
| Overscroll | `overscroll-behavior: contain` on any horizontal scroller so a sideways flick never chains into the page. |

---

## 3. Disclosure

Three affordances, in increasing weight. **Nothing else is used.**

### 3.1 Inline expand — the default

An `aria-expanded` button that grows its own container in flow, pushing what follows down.
`grid-template-rows: 0fr → 1fr` over `--yy-dur-base` / `--yy-ease-standard`.
Used for: the lens caveat (`COMPONENTS.md` §1.8), table row detail (§4), the methodology note on a
chart.

**It is never a tooltip, never a hover, never a modal, and it never leaves the card.**

### 3.2 Bottom sheet — for choosing

Any menu with more than 6 items at 390px. Full width, `--yy-radius-card` on the top corners only,
`max-height: 70vh`, its own scroll, a 36 × 4 grab handle in `--yy-fg-dim`, scrim
`rgba(7,28,22,.6)`. Dismiss on scrim tap, on `Escape`, and on a downward drag past 25% of its
height. Focus is trapped while open and returns to the trigger on close.
Used for: team, season, division-overflow and compare pickers.

### 3.3 Navigation — for reading more

A route change. Used where the disclosed content is a surface in its own right (a ledger, a
methodology section, `/credits`).

### 3.4 THE DISCLOSURE PROHIBITION

> **No required text may live only inside a disclosure.**

Required text = anything `SPEC.md` obliges the product to render: a coverage reason, a lens caveat's
operative content, a dead-money as-of date, an image attribution credit, a tier-boundary message.

The rule has two halves and both are load-bearing:

1. **A short, complete form is always visible** outside the disclosure. The disclosure adds
   precision, never meaning. (`CASH · ROSTER ONLY` is visible; the full sentence is disclosed.)
2. **Every export force-expands every disclosure** (`SCREENSHOT_VARIANTS.md` §4). A screenshot
   cannot be tapped, so a screenshot never hides a caveat.

**Dead money is exempt from disclosure entirely.** `SPEC.md` §2.1: *"There is no compact variant
that drops the date. There is no tooltip-only date."* Value, date and stage render together, on one
line, always.

---

## 4. Progressive disclosure instead of dense tables

**A table with more than three columns does not render as a table at 390px.** It renders as a
row-card list.

```
┌────────────────────────────────────────────┐
│ 1   BUFFALO BILLS                    111 ▸ │   ← primary line
│     BUF · $18.3M/WIN · 13W                 │   ← secondary line (the sort key)
└────────────────────────────────────────────┘
        ▼ expanded
┌────────────────────────────────────────────┐
│ 1   BUFFALO BILLS                    111 ▾ │
│     BUF · $18.3M/WIN · 13W                 │
│  ─────────────────────────────────────────  │
│  CASH SPENT              $238.0M           │
│  CAP HIT (SEASON-FINAL)  $231.4M           │
│  DEAD MONEY              $12.1M · as of …  │
│  Δ 5Y                    +6                │
└────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| Primary line | Identity. Bebas 400 `--yy-size-display-xs` `--yy-fg-1`, plus the primary figure right-aligned |
| Secondary line | **The column currently sorted by, always** — so the reader can see why the list is in this order. `.yy-label` `--yy-fg-3` |
| Chevron | `--yy-stroke-icon`, `--yy-fg-3`, rotates 90° on expand over `--yy-dur-fast` |
| Detail | Label/value pairs, `.yy-label` `--yy-fg-3` left / `.yy-num` `--yy-fg-1` right, `--yy-space-2` row gap |
| Hit area | The whole row, `--yy-tap-target` minimum |
| Multiple open | Permitted. Accordions that close each other lose comparisons, which is the reason the reader opened two. |

**Never at 390:** a horizontal table scroller with a frozen first column; a column that truncates
with an ellipsis; a font size below the utility floor to make columns fit; a "rotate your device"
message.

**Charts do not become tables at 390.** They keep their geometry and shed *labels* — tick density
drops per `CHART_ANATOMY.md` §2, and the CSV export (`COMPONENTS.md` §14) carries the full precision
for anyone who wants it.

---

## 5. Sticky elements

Exactly three things may stick. Anything else scrolls.

| Element | Behaviour |
|---|---|
| **App header** | `position: sticky; top: 0; z-index: 3`. Gains `border-bottom: 1px solid var(--yy-line-hairline)` at `scrollTop > 0`, over `--yy-dur-fast`. Never collapses, never hides on scroll-down — a header that hides costs a reader the wordmark and the season, and both are context a screenshot needs. |
| **Division picker** | `position: sticky; top: 62px; z-index: 2`, `background: var(--yy-bg)`. `SPEC.md` §3.1.1 requires it. |
| **Table header group** | The metric pills + column headers stick **together** inside their card, `top: 0` relative to the card's scroll container. |

**The tab bar is fixed, not sticky**, with `padding-bottom: var(--yy-safe-bottom)`
(`env(safe-area-inset-bottom, 24px)` — the mockup hardcodes 22px, which is a device-specific number
that is wrong on most devices).

Stacking order: header 3 · sticky picker 2 · table header 1 · bottom sheet 10 · scrim 9.
**No z-index above 10 exists in the system.**

---

## 6. The desktop scale-up

**Desktop is a re-composition, not a scale.** Three things change and nothing else.

### 6.1 Type scales, structure does not

`@media (min-width: 1024px)` moves 13 size tokens (`tokens.css` §25). **The utility floor does not
move** — an 11px label is 11px on a 27" monitor, because reading distance grows with the screen.
Only display and metric type grows.

### 6.2 Cards gain a second dimension

| At 390 | At 1440 |
|---|---|
| Vertical stack, one column | A 3-column-equivalent flex grid, `--yy-space-4` (16) gap `[MOCKUP]` |
| Row-card list with disclosure | The real table, all columns visible (`COMPONENTS.md` §11.2) |
| One chart per card, full width | `flex: 1.9` primary chart beside a `flex: 1` column of two secondary cards `[MOCKUP]` |
| Card padding `--yy-space-3` | `--yy-space-6` block / `--yy-space-7` inline (the mockup's `26px 28px`, snapped `[RULED D5]`) |
| Card radius `--yy-radius-card-sm` (18) | `--yy-radius-card` (22) |
| Card surface `--yy-bg-card` | `--yy-bg-card-lg` |
| Bottom tab bar | Horizontal nav in the chrome band |
| Bottom sheet | Dropdown menu panel |

Content width 1344 (1440 − 2 × `--yy-space-9`). Chart minimum height 440px. `[MOCKUP]`

### 6.3 The single breakpoint

**`--yy-bp-desktop` = 1024px. One breakpoint. There is no tablet layout.**

The mockup has zero media queries and two independent fixed canvases (390 and 1440); there is no
breakpoint system to extract, so this is originated. One breakpoint is the honest amount of
responsive design for a product with two designed canvases: below 1024 the mobile composition runs
fluid to a `max-width: 560px` centred column; at and above 1024 the desktop composition runs fluid to
`max-width: 1344px`. **A third designed canvas is a Phase-C decision, not a media query.**

### 6.4 What must survive the trip in both directions

A component that reads correctly at 390 and at 1440 but loses one of these in between is broken:

- every coverage reason still rendered;
- every as-of stamp still on one line with its figure;
- every caveat's short form still visible;
- the product mark still present on any screenshot-able card;
- the benchmark still named in words;
- no figure below the 11px utility floor;
- the CSV affordance still in the card header.

---

## 7. Touch, input and hover

| Concern | Rule |
|---|---|
| Target | `--yy-tap-target` (44px) minimum on every interactive element, regardless of painted size. A 24px chevron gets 10px of transparent padding. |
| Spacing | 8px minimum between adjacent targets. |
| Hover | **Never load-bearing.** Every hover reveal has a tap equivalent and a keyboard equivalent. `@media (hover: hover)` guards hover-only styling. |
| Text input | `--yy-size-body` (16px) minimum, always. Below 16px iOS zooms the viewport on focus and does not zoom back. |
| Drag | Bottom-sheet dismissal only. No drag-to-reorder, no swipe-to-delete, no pull-to-refresh (`DECISIONS.md` 57: the data is a static preseason snapshot; there is nothing to refresh). |
| Long-press | Reserved for the OS. |
| Keyboard | Full parity. Tab order follows DOM order, which follows visual order. A visible focus ring in both themes (`COMPONENTS.md` universal rule 5). |
| Screen reader | Charts are `role="img"` with `<title>`/`<desc>`; the CSV export is the tabular equivalent (`CHART_ANATOMY.md` §8). |
