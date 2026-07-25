# PHASE A — Coverage & gap map

**Question this document answers:** for every v1 surface and component `SPEC.md` names, what does
the mockup (`design/handoff/project/CAP+ Index.dc.html`) actually specify, and what remains to be
designed?

**Scoring key**

| Score | Meaning |
|---|---|
| **FULL** | The mockup gives a complete visual answer. Phase B implements it; it does not redesign it. |
| **PART** | The mockup answers the *form* of an analogous element but leaves stated v1 requirements unanswered. Extension work, not origination. |
| **NONE** | Nothing in the mockup addresses it. Origination work. |
| **CONFLICT** | The mockup specifies something that contradicts a binding rule in `SPEC.md`. Needs a decision before it is built. |

Coverage is judged against the mockup **only**. The brand system is the authority for identity, not
a coverage source; the `stitch_*` files are reference only and are cited, never counted.

---

## 1. Home / Division — `/` and `/division/{div}` (SPEC §3.1)

| # | Surface / component | Score | What the mockup answers exactly | What remains |
|---:|---|:--:|---|---|
| 1 | Division picker, sticky, 8 divisions, AFC East default (§3.1.1) | **PART** | Three control vocabularies exist: mobile metric pills (`11px` radius, lime fill + End Zone text when selected, `1px rgba(168,177,173,.3)` outline when not); desktop segmented buttons (`8px` radius); a dropdown *affordance* (`2025 · WEEK 6 ▾`, `SORT ▾` — chip with caret) | The picker itself: 8 divisions at 390px, sticky behaviour and its scrolled state, the open/expanded state of any dropdown (**no open menu is drawn anywhere**), keyboard/focus, default-selection indication |
| 2 | **HERO: division cost-per-win card — mobile 390 full-bleed (canonical)** (§3.1.2, §4) | **NONE** | Two adjacent parts only: (a) the mobile `DIVISION` module — 4 rows of `abbr / bar / index` against a gold 100 midline, caption "100 = LG AVG" — which is **Cap+, not cost-per-win**, and a strip, not a hero; (b) a `COST / WIN — $19.4M` KPI tile for one team | The entire unit: cost-per-win as the ranked quantity, four teams, hero scale, screenshot framing, product mark, caption |
| 3 | **HERO: thumbnail / square (feed, OG)** (§4) | **NONE** | — | Everything. No square composition exists anywhere in the handoff |
| 4 | **HERO: desktop wide** (§4) | **NONE** | The desktop KPI card container (`#fff`, `22px` radius, `rgba(7,28,22,.15)` border, `22px 24px` padding) is a usable shell | The wide composition, and the proof that one component with a size prop yields all three |
| 5 | Cost-per-win numerator toggle (cash ⇄ cap, default cash) + travelling lens caveat (§2.5, §2.1) | **NONE** | Pill/segmented vocabulary from row 1 is the right control | The toggle's placement in the card, its two labels, and how the §2.1 caveat text travels with the selection |
| 6 | Zero-win rule — "$151.1M spent · 0 wins", ratio suppressed, team excluded from ratio ordering (§2.5) | **NONE** | — | A designed state. This is a *rendering* rule with a visual consequence in the hero card (2017 CLE) and it has no precedent |
| 7 | League Cap+ leaderboard — **all 32**, sortable, CSV (§3.1.3) | **PART** | A complete mobile row anatomy: rank (`26px` col, lime for top 3, `#8FA39A` below), team name (Bebas 700 `14px`), sub-line (`CIN · $19.4M/WIN · 12W`, Rajdhani `9.5px` `#6E8078`), a **dual spend/win mini-bar stack** (two `5px` tracks, spend `#39423E`, wins band-coloured), index value (Rajdhani 600 `18px`, band-coloured), focus-row tint `rgba(166,226,46,.06)`, column header row, metric pills | Mockup shows **12 rows; SPEC requires the full 32** — density, scroll and header behaviour at 32 rows are unanswered. Sort *states* (only a `SORT ▾` chip exists). A desktop leaderboard table — the desktop view substitutes a scatter plot. CSV. Tabular numerals |
| 8 | **League "Field" — the field-literal leaderboard** (§4: `yards_to_opponent_goal = 150 − Cap+`) | **NONE** | — | Everything. There is **no yard line, hash mark, end zone or field graphic anywhere in the handoff**. One of the two surfaces where the creative thesis is allowed to be literal has no visual existence |
| 9 | "100 = league average" caption wherever Cap+ leads (§4) | **PART** | Two instances: `100 = LG AVG` (Rajdhani 500 `9px` `#A8B1AD`, right-aligned in the module header) and the desktop dek sentence | A single standardised caption treatment applied to *every* Cap+-leading card, including the screenshot variants |
| 10 | Team Rating fallback leaderboard under its own name (§3.1.3, gate #1) | **NONE** | — | Likely **moot**: `SPEC.md` §2.2 now carries "APPROVED (gate #1, 2026-07-25)". → confirm the fallback is out of scope before designing it |
| 11 | Largest dead-money charges + `is_actual` chips + as-of dates (§3.1.4) | **NONE** | Dead money appears three times as a *number* (`DEAD CAP $18.2M` tile; `DEAD $18.2M` cap-leak segment; `LEAGUE DEAD CAP $1.42B` KPI) | The list surface, the `is_actual` chip, and the as-of date — **and every one of those three instances violates §2.1's as-of discipline** (see C4) |
| 12 | Three entry cards routing to team / player / compare, each seeded with a concrete example (§3.1.5) | **NONE** | Closest analogue: the `VIEW FULL LEDGER` CTA (lime `1px rgba(166,226,46,.4)` outline, `16px` radius, centred Rajdhani 600 `11px` `.14em`) | The three cards, their seeded content, and the "never an empty state" requirement |
| 13 | CSV export affordance (§3.1, §8.1) | **NONE** | — | Every export affordance in the product. Zero exist in the mockup |

---

## 2. Team — `/team/{abbr}/{season}` (SPEC §3.2)

| # | Surface / component | Score | What the mockup answers exactly | What remains |
|---:|---|:--:|---|---|
| 14 | Team header — TeamMark + era-correct name + record + index badge (§3.2.1) | **PART** | A complete header composition: back chevron, team name (Bebas 700 `19px` `#fff`), identity line (`CIN · AFC NORTH · 2ND OVR`, Rajdhani 500 `9px` `.18em` `#6E8078`), right-aligned index (Rajdhani 600 `30px` `-.04em` lime) over a `CAP+` label (`8px` `.16em`) | The TeamMark slot (mockup states "no team logos"); the era-correct identity line (`Oakland Raiders · 2003`); the record; and the **dual naming** — Cap+ vs Team Rating "each under its own name and styling" |
| 15 | 25-season history, hard break at 2013, **both** lines on the 2014–25 overlap, gaps as labelled blanks, bridge sentence (§3.2.2) | **PART** | The chart *form*: multi-series stream on a `600×180` SVG, gold dashed baseline at 100, y-axis `124 / 100 / 76`, x-axis `'00 '06 '12 '18 '25`, `3px` selected line + `1.6px` comparison lines at `.8–.85` opacity, swatch legend | Everything that makes it correct: it is a **division** chart in the mockup, not a franchise arc; the 2013 hard visual break; two *different metrics* co-plotted on the overlap; **gaps rendered as labelled blanks with reason text**; the bridge sentence. Also `1.6px` is below the brand's 2px product floor (D10) |
| 16 | **Team "Drive" — the second field-literal surface** (§4) | **NONE** | — | Everything (see row 8) |
| 17 | Three-lens summary — cap hit / cash / dead money as a labelled trio, each with its own caveat (§3.2.3, §2.1) | **NONE** | Adjacent form: the mobile `CAP LEAK` stacked bar (`34px` tall, `4px` radius, four segments with in-bar % labels + a swatch legend) — but that decomposes **one** lens by roster state, not three lenses | The trio itself, the three caveat lines, the "never says spending without saying which lens" discipline. And the CAP LEAK labelling conflicts with §2.1 (see C5) |
| 18 | Tier 2 boundary message replacing the economics block pre-2013 (§3.2.3, §1.2) | **NONE** | — | A designed message block. See row 61 |
| 19 | Allocation diverging bars — 9 groups vs league average, zero-centred (§3.2.4, §2.6) | **PART** | The strongest single answer in the mockup. `SPEND MIX vs LEAGUE`: row = label (`34px` col, Rajdhani 500 `10px` `#71807A`) + `16px` track `rgba(7,28,22,.06)` with a centre rule + a `10px` bar offset left/right by sign, lime/red, and a right-aligned signed value; closes with an interpreting sentence | **7 groups drawn, 9 required** (RB and TE missing). The `% of cap held by players on the roster` denominator caveat (§2.6) is absent. Mobile rendering at 390px is not drawn. The centre rule uses a light-on-light value (`rgba(234,241,236,.28)` on a `rgba(7,28,22,.06)` track) — near-invisible; check |
| 20 | Cost-per-win card, screenshot-able, zero-win rule live (§3.2.5) | **NONE** | The 2-up KPI tile pattern (mobile) and 4-up KPI card pattern (desktop) are usable containers | The card. Same gap as rows 2–6, at team scale |
| 21 | Coaching stability track + regime timeline, markers, dated `s+1`/`s+2` dead-money chips (§3.2.6, §2.8) | **NONE** | Structural analogue only: the `CONTRACT CLIFFS` matrix (label column + N year cells per row) is the same skeleton a tenure track needs | A horizontal band across a 2000–2025 axis, HC/OC/DC lanes, regime-change markers, marker selection, and the two dated chips |
| 22 | Dead-money ledger — this franchise's rows (§3.2.7) | **NONE** | Adjacent: `CONTRACT CLIFFS` (8 player rows × 6 years, lime-alpha heat cells `0.08 + v/61·0.62`, dashed-salmon void cells, `▼` markers, `HIGH HIT / VOID-DEAD` legend) | A ledger *table* with source URLs, `is_actual` and dates |
| 23 | Dead-money team-season snapshots as a **dot plot, never a line**, each dot dated (§3.2.7, §2.1) | **NONE** | — | The dot plot, the per-dot date label, and the "no connecting path" affordance that makes the rule visible rather than merely obeyed |
| 24 | Draft ROI summary — capital spent vs realised return by class (§3.2.8, §2.9) | **NONE** | — | Everything |
| 25 | CSV export (§3.2.9) | **NONE** | — | See row 13 |

---

## 3. Player — `/player/{id}` (SPEC §3.3)

| # | Surface / component | Score | What the mockup answers exactly | What remains |
|---:|---|:--:|---|---|
| 26 | Name search with typeahead, no filters (§3.3.1) | **NONE** | — | **No text input exists anywhere in the mockup.** Field, focus state, results list, empty/no-match state, and the "returns only the 251-player set and says so" (§8.4) message |
| 27 | Identity chip — PlayerMark + name + position + team + **visible attribution credit line** (§3.3.2, §5.2) | **NONE** | Ledger rows give a name/position pairing (`Burrow` Rajdhani 400 `10.5px` `#EAF1EC` + `QB` `8.5px` `#6E8078`) | The chip, the image slot, and the credit line — which is a **licence requirement for 223 of 244 assets**, must be visible (not hover), and needs budgeted space from the first layout |
| 28 | PlayerMark fallback card — designed, "plan it for trench players" (§5.2) | **NONE** | — | The fallback composition, and the resolution-floor branch (`IMAGE_MIN_WIDTH_PX`) |
| 29 | Contract card — value, APY, guaranteed, APY % of cap, years, year signed (§3.3.3) | **NONE** | The KPI tile pattern is a usable container for 6 figures | The card |
| 30 | Cap vs cash by year, two series, with dead-money markers carrying the charge-owning team (§3.3.4) | **NONE** | Adjacent: one `CONTRACT CLIFFS` row is a per-year cap-hit series for one player | Two series, the marker, and the "the team that ate the charge is not the team on the player's row" disclosure |
| 31 | Availability — games, snaps 2013+, boundary stated (§3.3.5) | **NONE** | — | Everything, including the stated boundary |
| 32 | Production line, position-appropriate, sparse coverage labelled (§3.3.6) | **NONE** | — | Everything |
| 33 | **NO VALUE GRADE. EVER.** (§3.3.7) | **CONFLICT** | The desktop `PLAYER VALUE QUADRANT` plots 12 named players on cap hit × production, colours each good / neutral / bad, and labels the corners **`BARGAIN`** and **`ALBATROSS`** | This is a per-player worth-it verdict rendered graphically — the exact thing §3.3.7 forbids and commits to publicly in `METHODOLOGY.md`. See C2 |
| 34 | CSV export (§3.3.8) | **NONE** | — | See row 13 |

---

## 4. Head-to-head — `/compare` (SPEC §3.4)

| # | Surface / component | Score | What the mockup answers exactly | What remains |
|---:|---|:--:|---|---|
| 35 | Two team-season pickers, curated (§3.4.1) | **NONE** | The *result* of a selection is drawn beautifully — two era cards (`NE '07` / `KC '24`), each with a tinted panel, `40px` index, cap, record and $/win | The pickers themselves: team × season on both sides, at 390px |
| 36 | Cross-era legitimacy statement rendered in the UI, not buried (§3.4.2) | **PART** | Two gestures toward it: the chart title `POSITIONAL SPEND, INFLATION-ADJUSTED` and `THE TAKE` narrative card (lime `.16em` eyebrow + Inter `12px/1.6` body with inline emphasis) | The statement as a **first-class, always-present element** — the mockup's version is editorial commentary that a writer supplies, not a standing UI guarantee |
| 37 | Stacked benchmark comparison — each metric as a paired bar **against its own season's league average** (§3.4.3) | **PART** | An excellent paired form: the butterfly/tornado — 6 position rows, `38px` value columns either side, mirrored bars meeting a `1px` centre divider, inner corners squared (`2px 0 0 2px` / `0 2px 2px 0`), centred position label beneath | The **benchmark dimension**. The mockup compares A directly against B; SPEC requires each side compared to *its own season's* league average so the reader compares two distances-from-average. That is a structural change, not a restyle. Also: the comparison series is salmon-red (C3) |
| 38 | One-side Tier 2 boundary rendering — boundary message on the pre-2013 side only, Tier 1 rows compare normally (§3.4.3) | **NONE** | — | A per-row split state. Nothing in the mockup renders one side of a comparison as unavailable |
| 39 | CSV export (§3.4.4) | **NONE** | — | See row 13 |

---

## 5. Identity assets (SPEC §5)

| # | Surface / component | Score | What the mockup answers exactly | What remains |
|---:|---|:--:|---|---|
| 40 | **TeamMark** — containment (crop, padding, aspect, safe area) for self-hosted logos (§5.1) | **NONE** | The mockup explicitly declines: *"No team logos (marks are abstract wordmark chips)."* | The containment spec the SPEC assigns to the design track by name |
| 41 | TeamMark **typographic fallback chip** — abbr on team primary colour, glyph computed by relative luminance (§5.1) | **PART** | The typographic treatment of a team abbreviation is established at four scales: `34px` column (division strip, Rajdhani 600 `11px`), `26px` rank column, `38px` movers column (Bebas 700 `13px` `.06em`), `41px` heatmap column | The chip itself — the coloured background, the luminance rule made visual, the worst-case (LAC, 4.66) proof, and the `TEAM_LOGOS_ENABLED` kill-switch parity (both states must look deliberate) |
| 42 | **PlayerMark** — image treatment, licence-driven (§5.2) | **NONE** | — | See rows 27–28. The ShareAlike decision (OPEN DECISION 2) changes the treatment, so the design must be drawn as a **configuration branch**, not a fixed look |
| 43 | Credits page `/credits` — full attribution, **deduplicated by author** (§5.2, §6) | **NONE** | — | The whole page. Three authors are ~49% of assets, so the dedup grouping is the design problem, not the list |

---

## 6. Concepts named in the design contract (SPEC §4)

| # | Concept | Score | What the mockup answers exactly | What remains |
|---:|---|:--:|---|---|
| 44 | **FieldPosition** (league Field) | **NONE** | — | See row 8 |
| 45 | **Drive** (team, 25-season) | **NONE** | — | See row 16 |
| 46 | **Value Stadium** — position groups as sections sized by cap share, gold ring = league average, dead money = unlit seats | **NONE** | Three direct *inputs* exist: the 5-step position-group ramp (`#A6E22E → #6FA22B → #A8B1AD → #4A6B58 → #2F4A3D`), the cap-leak stacked bar (a linear version of the same decomposition), and the Obligation Horizon's stacked-by-position columns | The stadium itself. `design.md` calls it "**the signature visualization**"; the handoff contains no drawing of it |
| 47 | Cap+ index number as a display element | **FULL** | Four scales, all coherent: `64px/.85/-.05em` hero, `40px/.9/-.05em` era card, `30px/-.04em` team header, `21px/-.03em` KPI tile, `18px/-.03em` table row — all Rajdhani 600, all band-coloured, each paired with a `.16–.18em` `CAP+` label | Nothing visual. Only tabular numerals (D6) |
| 48 | Index band colour rule | **FULL** | `≥105` lime · `95–104` `#8FA39A` · `<95` `#D9503C`, applied consistently across bars, dots, values, ranks and legends — with a matching light-surface ink map | Nothing. Adopt as-is |
| 49 | Delta / movement treatment | **FULL** | `▲ 3 pts vs W5` (lime, Rajdhani `10px`); signed values with lime/red ink on both themes; the movers bar (zero line gold, bar offset left/right by sign) | Nothing visual — but the *weekly* framing it expresses is un-buildable (C1) |
| 50 | Benchmark grammar (gold) | **FULL** | Gold used only for: the 100 midline, the movers zero line, the frontier's dashed league-average line, the stream baseline, the projected cap ceiling + its label. `1px dashed rgba(212,175,55,.65)` over a `.5` solid | Nothing. This is exactly the brand's rule, correctly applied. Reuse for the Stadium's gold ring |
| 51 | 32-team palette usage rule (§4 — "awaits the design track's recommendation") | **PART** | The mockup's implicit answer is **"team colour is never a chart colour"** — no team colour appears anywhere; identity is carried by abbreviation and by the index band colour | The recommendation, written down and reasoned, plus the one place team colour *is* allowed (the TeamMark fallback chip, §5.1) |

---

## 7. Shared components & shells

| # | Component | Score | What the mockup answers exactly | What remains |
|---:|---|:--:|---|---|
| 52 | **Page shell — desktop (1440)** | **FULL** | Dark nav bar (`linear-gradient(120deg,#191D1F,#0B0D0E)`, `20px 48px`), wordmark `32px` Bebas + `.2em` eyebrow, five nav items (Rajdhani 500 `11px` `.12em`, active = lime + `2px` lime underline), season chip, `34px` avatar; paper page `44px 48px 52px`; H1 Bebas `76px/.92`; Inter `14px/1.6` dek capped at `680px`; segmented filter right-aligned | Only the responsive story between 1440 and 390 (there is none — see row 66) |
| 53 | **Page shell — mobile (390×844)** | **FULL** | Header (`14px 16px 12px`, wordmark `24px` + contextual `.2em` eyebrow, right slot for chip/avatar/SORT); body `16px` padding, `13–14px` card gaps; 4-item bottom tab bar (`#111416`, `10px 0 22px`, `20px` icon over Rajdhani 500 `9px` `.1em`, active lime / inactive `#6E8078`) | Real icons (placeholders are `20px` squares with `2px` borders); `env(safe-area-inset-bottom)` instead of the hardcoded `22px`; scrolled/sticky header state |
| 54 | Card system | **FULL** | Two card recipes, used consistently: **dark** = gradient + `1px rgba(168,177,173,.22)` (mobile, `16px` radius, `12px 13px`) or `1px rgba(255,255,255,.12)` (desktop, `22px` radius, `26px 28px`); **light** = `#fff` + `--yy-border` + `22px` radius. Header row = Bebas title left / Rajdhani meta right, baseline-aligned. No shadows anywhere | Accented variants are drawn ad hoc (lime `.3/.35/.4`, salmon `.28/.4`) — needs one rule |
| 55 | Leaderboard | **PART** | See row 7 | See row 7 |
| 56 | Sparkline / era-history | **PART** | See row 15. Note the mockup has **no small-multiple sparkline** — the only time-series is a full-width chart | A compact inline form for use inside rows/cards |
| 57 | Three-lens summary | **NONE** | See row 17 | |
| 58 | Allocation bars | **PART** | See row 19 | |
| 59 | Cost-per-win card | **NONE** | KPI tile/card containers only | Rows 2–6, 20 |
| 60 | Regime timeline | **NONE** | See row 21 | |
| 61 | Dead-money ledger | **NONE** | See rows 22–23 | |
| 62 | H2H stack | **PART** | See row 37 | |
| 63 | Pickers (division / team / season / player search / compare) | **PART** | Closed-state vocabulary for pills, segmented controls and dropdown chips | Open states, menus, search field, two-sided compare picker, focus and keyboard |
| 64 | Tables | **PART** | Row anatomy, column header row (Rajdhani 500 `9px` `.14em` `#6E8078` with fixed column widths), top-border row dividers `rgba(168,177,173,.12)`, focus-row tint, two matrix layouts (cliffs, heatmap) | Sortable header states, 32-row density, tabular numerals (D6), hover/selected rows, a desktop table (none exists), responsive column collapse, CSV |
| 65 | **Export affordance** | **NONE** | — | Every instance. §8.1 puts CSV on *every* tabular surface; the mockup has zero |
| 66 | **Screenshot card variants** — self-contained, titled, captioned, product mark, legible dropped into light **and** dark feeds (§4) | **NONE** | — | All of it. **No card in the mockup carries a product mark**, several depend on page context for meaning, and no square/OG composition exists. §4 calls these "a build target, not an afterthought" |
| 67 | Coverage / blank / partial / as-of state system (§1.2, §2.1) | **PART** | Exactly one grammar: the contract-cliff **void/dead cell** — transparent fill, `1px dashed rgba(232,160,141,.75)`, a `▼` marker where a contract lapses, and a legend entry naming it | A system: the `Metric<T>` union has three states (`value` / `blank` / `partial`) and every chart takes a `coverage` prop. Needed: the blank-with-reason treatment, the partial-with-coverage treatment, the as-of stamp (`$85.2M · as of 2024-11-27 · late season`), the `is_actual` chip, the Tier 2 boundary block, and the labelled-gap treatment in time series |
| 68 | Motion system | **NONE** | Zero transitions, animations, durations or easings | The whole system, plus `prefers-reduced-motion` (§4, §8.3) |
| 69 | **Light theme for charts** | **NONE** | The desktop *page* is light and its KPI/movers/spend-mix cards are light — but **every chart in the handoff is a dark card**, including the three embedded in the light page | A designed light rendering of every chart. The mockup's `INK` map (tokens §1.4) is the seed and it is a good one |
| 70 | Focus / hover / disabled / loading / error states | **NONE** | — | All of them. AA focus visibility across both themes (§8.3) |
| 71 | Tooltips — metric, percentile/rank, sample, source date (`design.md`) | **NONE** | — | Everything, and it interacts with the as-of rule (row 67) |
| 72 | Icon set — 2px stroke at 24px, geometric, rounded caps, 8 named metaphors (`design.md`) | **NONE** | Placeholders only: `20px` squares with `2px` borders in the tab bar; text glyphs `‹ ▾ ▲ ▼ ◄ ►` used as icons | The set |
| 73 | `/methodology` page (§6) | **NONE** | — | Everything |

---

## 8. Coverage statistics

**73 v1 rows scored:**

| Score | Count | Share |
|---|---:|---:|
| **FULL** | **7** | 10% |
| **PART** | **17** | 23% |
| **NONE** | **48** | 66% |
| **CONFLICT** | **1** | 1% |

**FULL (7)** — rows 47, 48, 49, 50, 52, 53, 54: Cap+ index number as a display element · index band
colour rule · delta/movement treatment · benchmark (gold) grammar · desktop page shell · mobile page
shell · card system. *(The surplus surfaces in §10 are also fully specified but are not v1 rows, so
they are not counted here.)*

**PART (17)** — rows 1, 7, 9, 14, 15, 19, 36, 37, 41, 51, 55, 56, 58, 62, 63, 64, 67: division
picker · leaderboard · "100 = league average" caption · team header · 25-season history · allocation
bars · cross-era statement · H2H paired bars · TeamMark fallback chip · 32-team palette rule ·
leaderboard *(as a component)* · sparkline/era-history · allocation bars *(as a component)* · H2H
stack *(as a component)* · pickers · tables · coverage/blank grammar. Rows 55, 58 and 62 are the
component-level entries for the same work scored in rows 7, 19 and 37; deduplicated, **14 distinct
things are partially covered**.

**Read the numbers correctly.** 10% FULL is not a criticism of the mockup — the mockup was drawn
against a *dashboard* framing, and it answers that framing convincingly. What it does not contain is
most of the v1 surface area `SPEC.md` defines, and **none** of the three concepts the creative thesis
rests on (Field, Drive, Value Stadium). The system it establishes — colour, card construction,
benchmark grammar, index display, band colours — is strong enough to extend from. That is the Phase B
job.

---

## 9. CONFLICTS — mockup vs binding SPEC rules

These are not gaps. They are places where the mockup specifies something the spec forbids, and they
need a decision before anything is built on them.

**Why six conflicts but one CONFLICT row.** Only row 33 is *scored* CONFLICT, because only there is
the conflicted element the row's own subject. The other five sit on top of rows scored elsewhere —
C1 on the mobile/desktop shells and the surplus modules in §10, C4 on row 11, C5 on row 17 — or on
copy rather than composition. All six need the same thing: a decision before build.

**C1 — Weekly / in-season framing is un-buildable on v1 data. (SPEC §2.1)**
`SPEC.md` §2.1 is explicit: *"Season-final snapshot semantics… **No 'as of week N' cap view is
possible and none may be built**."* The mockup is framed weekly throughout:

| Module | Weekly element |
|---|---|
| Mobile header | `W6` chip |
| Mobile hero | `▲ 3 pts vs W5` |
| Desktop nav | `2025 · WEEK 6 ▾` picker |
| Desktop | `MOVERS · WEEK 6` — an entire card |
| Mobile | `WEEKLY SWING` — an entire card |
| Concept 1c | `COST-PER-WIN CLOCK` — 18 spokes, one per **week** |

**Five modules and two navigation elements** rest on a cadence the data cannot support. → Rey: either
the weekly framing goes (and Movers / Weekly Swing / the Clock are re-based on season-over-season
deltas, which the data does support), or the cadence question reopens upstream. This is the largest
single scope consequence in the coverage pass.

**C2 — `PLAYER VALUE QUADRANT` is a per-player value grade. (SPEC §3.3.7)**
§3.3.7: *"NO VALUE GRADE. EVER. … never renders a composite player rating, a letter grade, a 'worth
it / not worth it' verdict, a star count, or any invented per-player score. This is a product
commitment, published in `METHODOLOGY.md`, and it is enforced in review."* The quadrant plots named
players on cap hit × production, colours them good/neutral/bad, and labels the corners `BARGAIN` and
`ALBATROSS`. It is a worth-it verdict delivered by position and colour instead of by number. → Rey:
the chart is well drawn and cannot ship as-is on a player surface. Options: drop it; or restrict it
to team-level position groups (no named players); or retain named players but remove the verdict
encoding (no good/bad colour, no corner labels) — which removes most of its point.

**C3 — Red is used as a comparison series. (settled colour rule; brand "Red: genuine negative only")**
In the H2H, `NE '07` is carried entirely in salmon `#E8A08D` — border, label, index, bars — against
`KC '24` in lime. The older team is not a negative; it is the comparison. Comparison series are
specified as white / gray / muted green. → affects the compare view, one of the four v1 views. See
`PHASE_A_TOKENS.md` D3.

**C4 — Every dead-money figure renders without its date. (SPEC §2.1)**
§2.1 rule 2: *"**Value, date and stage always render together.** `$85.2M · as of 2024-11-27 · late
season`. There is no compact variant that drops the date. There is no tooltip-only date."* The
mockup renders dead money three times (`DEAD CAP $18.2M`, the `DEAD $18.2M` cap-leak segment,
`LEAGUE DEAD CAP $1.42B`) and dates none of them. The KPI tile is exactly the "compact variant" the
rule forbids. → the tile pattern needs a date-bearing variant designed, or dead money never uses it.

**C5 — Cap labelling conflicts with the lens rules. (SPEC §2.1, §2.6)**
§2.1: `cap_used_total` *"is never labelled 'cap used', 'cap utilization', or '% of cap'."* §2.6: the
allocation denominator is *"% of cap held by players on the roster", never "% of cap"*. The mockup
labels the cap-leak bar `WHERE $233M GOES` with segments summing to a total (a utilization view), and
labels the spend-mix card "share of cap by position group". → copy-level fixes, but they are
non-negotiable copy and the card layouts must leave room for the longer, correct labels.

**C6 — Leaderboard shows 12; SPEC requires 32.** §3.1.3: *"Not a top-10. The full table."* Noted in
row 7 rather than escalated, but the 390px density question is real design work.

---

## 10. Surplus — what the mockup specifies that v1 does not ask for

Fully drawn, high quality, outside the v1 inventory. Recorded so the work is not lost and so nothing
here is mistaken for a v1 requirement.

| Surface | Where | Note |
|---|---|---|
| **Efficiency frontier scatter** (32 teams, spend × wins, gold dashed league-average cost-per-win line, size/glow by extremity, direct labels with opacity-graded density) | 1b desktop | The best chart in the handoff. It is a *league* view and could carry `/` on desktop — but it is not the Field, and it is not in §3.1 |
| **Cap waterfall** (7 steps: ceiling → carryover → signed → dead → IR/PUP → draft pool → usable space) | 1c | Strong candidate for a team-page economics module if scope allows; answers "why can't they sign anyone?" |
| **Obligation horizon** (5-year stacked commitments by position group vs projected cap ceiling) | 1c | Its position-group ramp is a direct input to the Value Stadium |
| **League heatmap** (12 teams × 7 position groups, diverging red↔lime) | 1c | Diverging scale uses lime as a ramp end — check against "one lime series per chart" before reuse |
| **Cost-per-win clock** (radial, 18 weekly spokes) | 1c | Blocked by C1 as drawn |
| **Contract cliffs matrix** | 1a screen 3 | Not a v1 row, but its **void/dead dashed cell is the mockup's only absence grammar** and is load-bearing for row 67 |
| **Era-matchup cards + "THE TAKE"** | 1a screen 4 | Editorial voice module; no v1 slot, but a good screenshot candidate |

---

## 11. RANKED — uncovered surfaces by product value

Ranked by consequence if it does not exist, not by effort.

| Rank | Surface | Why it ranks here |
|---:|---|---|
| **1** | **Division cost-per-win HERO card — all three sizes, numerator toggle, zero-win rule, screenshot framing** | `SPEC.md` §3.1.2 calls it "the product's hero unit" and §4 names it "the hero", built at three sizes from one component. It is the first thing on `/`, it is the unit most likely to be screenshotted and shared, and the mockup specifies **none of it** — only a Cap+ strip that answers a different question and a single-team KPI tile. **Presumptive #1 confirmed.** → studies run here |
| **2** | **Coverage / blank / partial / as-of state system** | §1.2 is the product's integrity promise and it is enforced in the type system (`Metric<T>`); §2.1's as-of discipline is called "the hardest rule in the product". The mockup has one per-cell grammar and violates the as-of rule three times (C4). Every other surface inherits this — designing it late means retrofitting every card |
| **3** | **League Field (field-literal leaderboard)** | The creative thesis is settled and this is one of only two surfaces allowed to express it. It currently has **zero** visual existence anywhere in the handoff. Without it, "Cap+ renders as field position" is a memo, not a product |
| **4** | **Value Stadium** | `design.md` calls it "the signature visualization"; the design contract settles its semantics (money allocation, gold ring = league average, dead money = unlit seats). Zero precedent, and it is the brand's own headline claim |
| **5** | **Team Drive** | The second field-literal surface; also the team page's most-viewed module (the 25-season arc). The mockup's stream chart is the closest thing to a starting point |
| **6** | **TeamMark + PlayerMark systems** (containment, fallback chip, luminance rule, visible attribution) | Identity is on every row of every view. The attribution line is a **licence obligation** for 223 of 244 assets, not a design preference — and the mockup budgets no space for it |
| **7** | **Screenshot card variants** | §4 makes them a build target. Screenshot-ability is a stated product requirement, and no card in the mockup carries a product mark or survives being lifted out of its page |
| **8** | **Three-lens summary with travelling caveats** | The product's stated discipline ("never says spending without saying which lens"). Three numbers and three caveat lines is a small surface with an outsized credibility role |
| **9** | **Player view as a whole** (search, identity chip, contract card, cap-vs-cash, availability, production) | Eight uncovered components — the largest single block of unbuilt surface — but each is individually conventional, and the view is the least visited of the four |
| **10** | **Dead-money ledger + dated dot plot + `is_actual` chips** | Highest-risk data in the product (gate #3, instance 3) and a rule that must be *visible*: a dot plot that visibly refuses to connect its points |
| **11** | **Coaching stability track + regime timeline** | Distinctive, and structurally unlike anything in the mockup |
| **12** | **Pickers + table sort states** | Every view depends on them; the mockup gives closed states only. Low creative risk, unavoidable work |
| **13** | **Export affordance** | §8.1 puts it on every tabular surface. Small, systematic, currently zero |
| **14** | **Light theme for charts** | Stated v1 requirement, zero precedent. The `INK` map makes it tractable |
| **15** | **Motion system + `prefers-reduced-motion`** | Required by §4 and §8.3; nothing to extract from either source |
| **16** | **`/credits` page** (dedup by author) | Licence-required, and the dedup grouping is a real information-design problem |
| **17** | **Draft ROI summary** | Genuine content, no precedent, but the last module on the team page |
| **18** | **32-team palette recommendation** | The design track owes it by name (§4). The mockup's implicit answer ("never a chart colour") is defensible and mostly needs writing down |
| **19** | **Tooltips** | Brand specifies the content; interacts with the as-of rule |
| **20** | **`/methodology` page** | Content-led; the least design-dependent surface in v1 |

Studies for **rank 1** are in `design/studies/` and documented in `design/PHASE_A_STUDIES.md`.
