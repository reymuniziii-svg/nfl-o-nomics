# PHASE A — Studies: the division cost-per-win hero card

**Surface:** rank **1** on the uncovered list in `PHASE_A_COVERAGE.md` §11 — the **division
cost-per-win hero card** (`SPEC.md` §3.1.2, §4).

**Why this one.** The brief's presumption was that if the mockup does not fully specify the hero, it
is #1. It does not, and the gap is wider than "not fully". The mockup contains two things in the
neighbourhood and neither is the unit:

- the mobile `DIVISION` module — four rows of **Cap+** against a gold 100 midline. Right teams,
  right shape, **wrong metric**, and it is a strip inside a dashboard, not a hero;
- a `COST / WIN — $19.4M` KPI tile — right metric, **one team**, no ranking, no benchmark, no
  numerator toggle, tile scale.

Nothing in the handoff renders four teams ranked by what a win costs; nothing renders the card at
three sizes; nothing renders the numerator toggle, the zero-win rule, or a product mark. `SPEC.md`
§3.1.2 calls it "the product's hero unit" and §4 calls it "the hero", built at
**mobile (390 full-bleed) / thumbnail (square, feed-OG) / desktop (wide)** from **one component with
a size prop**. So: three studies, each rendered at all three sizes, so the size claim is tested
rather than asserted.

**Files**

| Study | File |
|---|---|
| A — The Receipt | `design/studies/hero-cpw-A-receipt.html` |
| B — The Gap | `design/studies/hero-cpw-B-gap.html` |
| C — The Block | `design/studies/hero-cpw-C-block.html` |

**These extend the mockup's extracted system; they do not propose a new aesthetic.** Every colour,
radius, border, type recipe and bar geometry is lifted from `PHASE_A_TOKENS.md` §10, which is lifted
from the mockup. The only thing added that the mockup does not contain is
`font-variant-numeric: tabular-nums` — required by `SPEC.md` §4 and §8.3, absent from the mockup
(divergence D6), and load-bearing on a card whose numbers change with every division and season.

**Sample data, stated on the card.** Figures are shaped from the mockup's own placeholder league
(`support.js` → `RAW`) for AFC East 2025, divided into wins: BUF $18.3M · MIA $30.5M · NYJ $34.1M ·
NE $38.0M, against a league average of $25.8M (the mockup's own KPI). Plausible, not real. The
feed-facing crops carry a `SAMPLE` chip.

**Fonts.** Bebas Neue loads from the handoff kit via relative `@font-face`. **Rajdhani and Inter are
not shipped in the handoff** (Google Fonts only — `PHASE_A_TOKENS.md` §12), so the athletic and body
stacks resolve through the brand token order to system fallbacks when opened offline. That is a
deliberate demonstration of finding F2/F3, not an oversight.

---

## What all three carry (the shared contract)

Whatever direction wins, the accepted card must carry all of this — the studies agree on it, so it is
not a differentiator:

1. **Title + division + season**, inside the card (screenshot self-containment, §4).
2. **The benchmark, named in words and in gold** — `LEAGUE AVG $25.8M / WIN`. Gold is used for
   nothing else on the card, per the brand.
3. **The numerator toggle** (`CASH` ⇄ `CAP`, default cash per §2.5), built from the mockup's
   selected-pill recipe: lime fill, End Zone text, `11px` radius.
4. **The lens caveat travelling with the selection** — the cash caveat ("cash to players on the
   roster; cash paid to players released in-year is not included") renders in the footer at wide size
   where there is room, and is the first thing the mobile card must find space for.
5. **A subtle product mark** — `YIELD/YARD` in Bebas at `13px`, `rgba(234,241,236,.55)`, lime slash.
   No card in the mockup carries one; every screenshot-able card must (§4).
6. **Tabular numerals** on every figure.
7. **The `SAMPLE` chip** on feed crops, so a placeholder figure can never be mistaken for a real one.

---

## Study A — THE RECEIPT

> **POV: the hero is a price list — rank the division by what a win actually costs, and let the
> ledger do the arguing.**

Four rows, ranked, each with a shared-scale bar and the gold league-average tick sitting on every
bar. The number is the hero; the bar is corroboration. It is the most literal reading of "cost per
win" and the least interpreted: the card states four prices and an average, and stops.

**What it trades away.** The payroll. You read the *ratio* and never learn that Buffalo and Miami
spend within $6M of each other — total spend is off the card entirely, which is a real omission for a
product whose whole argument is about money. And a rank list flattens distance: 1st-to-2nd reads the
same as 3rd-to-4th even when the gap is four times larger. The bar length is the only place the true
spread survives, and at 390px that bar is 8px tall.

**What it is for.** It is the variant that survives a reader who does not yet know what Cap+ is. No
index, no normalisation, no "distance from average" literacy required — dollars, ranked.

**Tokens exercised.** `--yy-surface-card` (mobile gradient) and `--yy-surface-card-lg` (wide);
`--yy-card-border-dark`; `--yy-radius-card-sm` 16px at mobile/square and `--yy-radius-card` 22px at
wide, which is exactly the mockup's own split; `--yy-radius-mark` 2px on every bar; the gold tick at
`rgba(212,175,55,.75)` — lifted verbatim from the mockup's division strip, the closest existing
relative of this card; the dark ink ladder `#EAF1EC / #A8B1AD / #6E8078`; the lime / `#8FA39A` /
`#D9503C` value colours; the mockup's leaderboard row anatomy (rank column, abbreviation, bar,
right-aligned value) at hero scale.

**It also renders the zero-win rule as a live state.** `SPEC.md` §2.5 forbids `∞`, `N/A`, a blank or
a divide error, and requires `"$151.1M spent · 0 wins"` with the ratio suppressed and the team
excluded from ratio-ranked orderings. Study A shows that row (2017 CLE) using the mockup's **dashed
salmon absence grammar** from the contract-cliffs matrix rather than an empty bar — which is the
only absence vocabulary the handoff contains, and the seed for the wider coverage-state system
(coverage rank 2).

---

## Study B — THE GAP

> **POV: a cost-per-win number means nothing on its own — make the league average the axis and draw
> each team as a distance from it.**

The gold benchmark becomes the spine of the card. Each team is a bar growing left (cheaper, lime) or
right (dearer, red) from it, and the headline value is the **signed difference**, with the absolute
figure demoted underneath. It is the mockup's own `SPEND MIX vs LEAGUE` diverging geometry, promoted
from a side card to the hero.

**What it trades away.** Absolute magnitude. You read *position* first and the dollar figure second,
so "$18.3M per win" stops being the headline — which is a real cost on a card whose job is partly to
be quoted. The benchmark has to be named twice (once on the axis, once in the footer) or the card is
unreadable the moment it leaves the page. And it has a failure mode the ranked list does not: a
division where all four teams sit near average produces a card with almost no ink on it. The chart is
only as interesting as the spread, and some divisions have none.

**What it is for.** It is the variant that teaches the product's central idea — everything here is
measured against the league — on the first screen, before the reader ever meets Cap+. It is also the
only one of the three whose geometry transfers directly to the Cap+ surfaces later.

**Tokens exercised.** The diverging-bar geometry from `SPEND MIX vs LEAGUE`: centred axis, bar offset
left/right by sign, signed value right-aligned, position label in the left column. The gold rule as
`1px dashed rgba(212,175,55,.65)` over a `.6` solid — the mockup's exact efficiency-frontier
recipe. `--yy-gridline` at 10% opacity for the ±$6.4M guides, under the brand's 15% ceiling.
`--yy-radius-mark` on every bar; `--yy-negative` / `--yy-negative-soft` for above-average cost;
`--yy-band-mid` `#8FA39A` for at-average. The wide variant adds a **Cap+ column** carrying the
mandated `100 = LEAGUE AVERAGE` caption (§4) — shown sharing the footer with the dollar benchmark,
because that is the only place both can live without a second caption row.

**Alignment note.** The gold rule is centred on the **track**, not on the card — in the studies it is
a pseudo-element on the bar track at every size. Centring on the card would misalign the benchmark
from the bars by the width difference between the label and value columns. Small, and exactly the
kind of thing that makes a benchmark card lie.

---

## Study C — THE BLOCK

> **POV: the hero's real job is surviving as a screenshot, so design the square first and let the
> phone and the desktop be crops of the same logic.**

One enormous number — the division's cheapest win — with the other three demoted to a compact stack
of 4px bars beneath it. Square is the native size; the 390 and 1040 renderings are the same
composition given more room, with a single layout change at wide (stack beside the number rather than
beneath it).

**What it trades away.** Comparison precision. Three of the four teams become footnotes, so the
division stops being a comparison and becomes a headline with supporting evidence. It also stakes the
whole card on one number — fine on `/division/afc-east`, wrong the moment a Jets fan opens it,
because the card is about Buffalo.

**The subject-led variant (C4) fixes that and immediately breaks something else.** When the viewer
follows the Jets, the leading number becomes `$34.1M` and the card's most prominent element is
salmon, not lime. That is the honest consequence, and it forces the colour question below into the
open rather than leaving it to be discovered in build.

**What it is for.** It is the variant that is *designed to be stolen* — lifted into a feed, a group
chat, a slide — which `SPEC.md` §4 makes a build target rather than a nicety.

**Tokens exercised.** The mockup's hero-metric recipe verbatim — `600 64px/.85`,
`letter-spacing:-.05em`, lime — scaled to 72 / 88 / 120px across the three sizes; the mobile card
gradient and `--yy-card-border-dark`; the gold tick reused at 4px bar height; the dark ink ladder;
`--yy-radius-mark`; the negative family for above-average cost.

**It also carries the feed-legibility rig (C5, C6).** §4 requires the card to be "legible when
dropped into both a light and a dark social feed", and the studies render it into both. The finding:
the in-product border `rgba(168,177,173,.22)` **disappears on white** (the card's corners read as cut
off) and **nearly merges with `#111416`** — the brand's own Film Room — on a dark feed. Both are
fixed by one conditional value, proposed as `--yy-card-border-export` at `.42`. The dark-on-dark case
is the harder of the two, and it is the one the flagship theme guarantees.

---

## Open questions these studies surfaced

Recorded for Rey; not decided here.

1. **What does lime mean on this card?** The settled rule is "lime = selected team, one series per
   chart". A division card has no selected team, so Studies A and B use lime for *cheaper than the
   benchmark* — which `design.md` independently authorises ("Yield Lime: positive trajectory"). On
   `/team/{abbr}` the same component *does* have a subject, and the two meanings collide (C4 shows the
   collision). One rule must win, and the answer changes the component's API.
2. **Is "dearer than average" a genuine negative?** All three studies use red for above-average cost,
   following the mockup's own precedent (`movers`, `diverge`, and the `<95` index band all use red for
   the unfavourable side). If red is strictly "genuine negative", paying more per win probably
   qualifies. If it does not, the studies need a third neutral and the cards lose most of their
   contrast. This is the same question as divergence **D3**, arriving from the other direction.
3. **Which figure leads — the division's best, or the viewer's team?** C vs C4. It is a product
   question (who is `/` for) before it is a design one.
4. **Where does the cash-lens caveat live at 390px?** It fits comfortably at 1040 and awkwardly at
   390. The three studies all defer it to the footer; none has solved it on the phone, and §2.1
   forbids dropping it.
5. **The type-scale question lands here first.** These cards are drawn at the mockup's scale — labels
   at 8.5–9px. At the brand's stated 13–16px mobile section-label size, none of the three
   compositions fits at 390 without losing a row or a column. **D1 is not an abstract divergence; it
   is a layout decision on the product's hero unit**, and it should be settled on this card before it
   is settled anywhere else.

## What these studies deliberately do not do

- **No field metaphor.** Cost per win is not Cap+, and field literalism is reserved for exactly two
  surfaces (league Field, team Drive). A field-styled hero would have been the easy crowd-pleaser and
  would have broken the settled thesis on the product's most visible card.
- **No team colour and no logos.** The 32-team palette rule is still open (§4) and the mockup's
  implicit answer — team colour is never a chart colour — is followed here.
- **No motion.** Motion is unspecified on both sides of the token boundary (D14); inventing it inside
  a Phase A study would smuggle origination into an extraction deliverable.
- **No new aesthetic.** Every value traces to `PHASE_A_TOKENS.md` §10. If a study looks like the
  mockup, that is the requirement being met, not a lack of ambition.
