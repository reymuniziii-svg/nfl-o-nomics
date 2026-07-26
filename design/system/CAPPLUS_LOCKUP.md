# CAPPLUS_LOCKUP.md — the Cap+ lockup

**Phase B. Binding.** Cap+ is the product's flagship metric (`SPEC.md` §2.2, gate #1 cleared
2026-07-25). It is the one piece of proprietary vocabulary the product owns, and it appears at five
scales across four views. This document makes it one thing at every size.

`PHASE_A_COVERAGE.md` row 47 scores the *number* **FULL** — five coherent scales, all Rajdhani 600,
all band-coloured, each paired with a `.16–.18em` `CAP+` label. What the mockup never settles is the
**name**: it writes `CAP+`, `CAP+ INDEX`, `Cap+` and `CAP+ · ECONOMICS` interchangeably, and never
in the display face.

---

## 1. The mark

```
CAP+
```

Four characters. Three letters and a glyph that is doing more work than the letters.

| Property | Value |
|---|---|
| Case | **Always all-caps.** `Cap+` never appears in the UI. It may appear in running prose on `/methodology` and in `DECISIONS.md`; it does not appear in a component. |
| Face | `--yy-font-athletic` at label scales; `--yy-font-display` at hero and card-title scale |
| Weight | `--yy-weight-label` (500) at label scales; `--yy-weight-display` (400) in Bebas |
| Tracking | `--yy-track-label-wide` (`.16em`) at label scales. **The tracking is not optional** — `CAP+` set tight reads as a truncated word; set wide it reads as a mark. `[MOCKUP]` |
| Colour | `--yy-fg-3` when it labels a number; `--yy-fg-1` when it *is* the subject (a card title, a nav item) |
| Space | **No space before the `+`.** `CAP +` is wrong everywhere. |
| Never | Superscripted. Italicised. Coloured differently from the letters (see §2). Given a registered/trademark glyph. Hyphenated (`Cap-Plus`). Pluralised. |

**Spoken and written form:** "Cap plus". In prose the first mention on a page is expanded —
*"Cap+ — wins produced per dollar of cap spent, indexed so 100 is league average."*

---

## 2. THE `+` AS A BRANDABLE GLYPH

The `+` is the family mark. Everything that follows depends on it staying one shape.

**The ruling: the `+` is never coloured differently from the letters it follows.**

This is the one place the system deliberately declines an obvious move. The brand already owns a
**coloured glyph** — the lime slash in `YIELD/YARD`, which `[BRAND]` calls *"the central visual
device."* A second lime glyph, four characters long, competing in the same header, halves the
slash's distinctiveness and puts lime on a label rather than on data. The brand's colour budget for
lime is 6% and it is spent on the subject series, not on a stat's punctuation.

So the `+` is brandable **by geometry, not by colour**:

| Property | Value |
|---|---|
| Colour | Identical to the letters, always |
| Optical size | In Bebas at `--yy-size-display-sm` and above, the `+` is set at **0.82em** and raised `0.06em` — Bebas's `+` is drawn to full cap height and reads as a fifth letter otherwise |
| Tracking before it | The `--yy-track-label-wide` space is what separates it; no extra kerning |
| In the monogram | Never. `YY` is the monogram (`[BRAND]` logo hierarchy tier 4). There is no `C+` mark. |

**What the `+` means, and why it can carry a family:** it reads as *"and what it cost"* — a plain
metric with an economic dimension added. `CAP` is a number every football reader knows; `CAP+` is
that number with the product's argument attached. That is a sentence a family can be built from, and
it is why §4 works.

---

## 3. The stat name at every scale

Five scales. `TYPE.md` §7 owns the number; this owns the name beside it.

### 3.1 Hero — the number leads, the name identifies it

```
114
CAP+          ← .yy-label, --yy-track-label-wide, --yy-fg-3
100 = LEAGUE AVERAGE   ← .yy-label, --yy-fg-3
```

| | Value |
|---|---|
| Number | `--yy-size-metric-hero` (64/76), `--yy-lh-metric`, `--yy-track-metric-hero`, band-coloured |
| Name | `--yy-size-label` (11), `--yy-track-label-wide`, `--yy-fg-3` |
| Position | Beneath the number, or baseline-aligned to its right on a padded block `[MOCKUP]` |
| **Caption** | **Mandatory.** `100 = LEAGUE AVERAGE` (`SPEC.md` §4). §3.5. |

### 3.2 Card corner — the name leads, the number follows

The team-header badge and the leaderboard column head. The name is the label of a column of numbers.

| | Value |
|---|---|
| Name | `--yy-size-micro` (10) at header scale / `--yy-size-label` (11) as a column head, `--yy-track-label-wide`, `--yy-fg-3` |
| Number | `--yy-size-metric` (30/34) or `--yy-size-metric-xs` (18/20) |
| Order | **Number above, name below** in a header badge `[MOCKUP]`; **name above, numbers below** in a column |

### 3.3 Card title — the name is the subject

```
CAP+ INDEX
```

`--yy-font-display` 400 at `--yy-size-display-xs`, `--yy-track-display-wide`, `--yy-fg-1`.
The `+` at 0.82em, raised 0.06em (§2).
**`CAP+ INDEX`, not `CAP+`,** when the mark is a heading — a two-word title reads as a subject where
a four-character one reads as a label that lost its number.

### 3.4 Inline — in running prose

`Cap+` in `--yy-font-body`, in the sentence's own weight and colour. **No small-caps, no tracking, no
colour, no `<code>` treatment.** Inter's `+` needs no optical correction. This is the only place the
mixed-case form is used, and only in prose — never in a component label.

### 3.5 The `100 = league average` caption — one treatment, everywhere

`SPEC.md` §4 requires it *"wherever Cap+ leads"*. `PHASE_A_COVERAGE.md` row 9 scores it PART: the
mockup renders it two different ways (`100 = LG AVG` in a module header, and a full sentence in the
desktop dek).

**One standardised treatment. It is not a caption per card; it is part of the lockup.**

| Property | Value |
|---|---|
| Text | `100 = LEAGUE AVERAGE` — **spelled out.** `LG AVG` is jargon and it is the one line that has to work for a reader who has never seen this product. |
| Type | `.yy-label` (11px) |
| Colour | `--yy-fg-3` |
| Position | Right-aligned in the card's header row, baseline-aligned with the card title |
| At square/export | Moves to the strap, beside the gold benchmark, so it survives the crop |
| When | **Every surface where Cap+ leads**: the leaderboard, the team header, the index badge at hero scale, the H2H era cards, every Cap+ chart's axis area, and every export of any of them |
| Short form | There is none. If it does not fit, the container is wrong. |

Where a Cap+ chart also carries a **dollar** benchmark (the hero card at wide), the two share one
strap line and the Cap+ caption comes second:
`▮ LEAGUE AVG $25.8M / WIN · 100 = LEAGUE AVERAGE`. `[STUDY B]`

---

## 4. Family grammar

The `+` is a suffix that turns a resource into a resource-efficiency measure. Two members exist and
the grammar is fixed so a third does not arrive by improvisation.

| Member | Status | Definition | Where |
|---|---|---|---|
| **Cap+** | Ships v1 | Wins produced per dollar of cap spent, indexed so 100 = league average | `SPEC.md` §2.2 |
| **Draft+** | Named, v1 scope is the summary only | Draft capital spent versus realised return by class | `SPEC.md` §2.9, §3.2.8 |

### 4.1 The rules a new member must satisfy

A name may take the `+` **only** if all four hold. This is the gate, and it is deliberately narrow —
a suffix that attaches to anything means nothing.

1. **It is indexed to 100 = league average**, within season. Not a raw quantity, not a rank, not a
   percentile.
2. **It has an economic denominator.** The `+` means *"and what it cost"*. A performance-only
   measure may never take it — which is exactly why the 1999–2012 fallback is
   **"Team Rating (performance only)"** and never "Cap+ (performance only)". `DECISIONS.md` 18:
   *"to a reader that is still Cap+."*
3. **It is published with its formula** on `/methodology`.
4. **It is not a per-player score.** `SPEC.md` §3.3.7 and `DECISIONS.md` 51: no composite player
   rating, letter grade, star count or worth-it verdict, ever. **There is no Player+ and there
   never will be.** This is the most important rule in this section.

### 4.2 Typographic grammar for every member

| Property | Value |
|---|---|
| Form | `{RESOURCE}+` — one word, all-caps in UI, no space, no hyphen |
| Length | The resource word is **3–6 characters**. `CAP+`, `DRAFT+`. Longer and the tracking makes it a phrase. |
| Rendering | Identical to §3 at every scale. A family member that needs its own type treatment is not a family member. |
| Band colours | **Only members with the same 100-centred scale may use the index bands** (`≥105` lime / `95–104` slate / `<95` red). A member on a different scale gets neutral ink and its own stated thresholds. |
| Caption | Every member carries `100 = LEAGUE AVERAGE` on every surface where it leads. |
| Colour | Never coloured as a name. Only the number is band-coloured. |

### 4.3 Naming a view after a member

`CAP+ INDEX` is the leaderboard's title. The pattern is `{MEMBER} INDEX` for a ranked table of that
member, and the member alone for a single value. `DRAFT+ INDEX` would be correct;
`THE CAP+ LEADERBOARD` is not — it is two words of chrome around one word of meaning.

---

## 5. Prohibited

- `Cap+™`, `CAP+®`, or any legal glyph. The product does not own a registration and the mark is not
  presented as one. (`[BRAND]` legal note: *"do not imply endorsement by or affiliation with the
  NFL."* A trademark glyph on a stat name reads as an institutional claim.)
- A lime `+`. §2.
- `CAP+` as a favicon, app icon or avatar. `[BRAND]` assigns those to the `YY` monogram and the
  premium app icon.
- `CAP+` set in the body face inside a component.
- `CAP+` beside a Team Rating figure, in any arrangement. The two indexes never share a badge, a
  colour or a label. `DECISIONS.md` 18.
- A `+` on any metric that fails §4.1.
