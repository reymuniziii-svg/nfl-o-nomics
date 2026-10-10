# YIELD/YARD v1 — review of the shipped visuals (2026-10-10)

Produced by an Opus agent with read access to the repo and the live site
(https://nfl-o-nomics.vercel.app), driving every view at desktop and 375px, light and dark.
Screenshot references (`…259207` etc.) point at the reviewing session's capture folder and are
not committed; the observations stand on their own. Companion to
`2026-10-10-blind-proposals.md`. Note: this review ran before `capplus_context` landed, so
its idea E2 ("the QB-contract window") should be read against `CAPPLUS_MEMO.md` §8, which
measures that window at about three index points.

---

## A. Verdict

- **What works:** the data integrity is unusually good. Absence is drawn rather than hidden, every dead-money figure keeps its date, and the mobile receipt card is a clean piece of sports graphics.
- **What's weak:** the product rarely answers its own question. Cost per win is the 6th card on the team page, and Cap+ and $/win point in opposite directions with nothing on the page to reconcile them. No chart responds to a hover or tap. Nothing is actually shareable: no og:image, no share button, and the /share pages are HTML with developer notes on them.
- **Grade: C+.** Integrity A, design-system craft B+, storytelling and shareability C−.

## B. Per view

### Home / Division

**Strong**
- On mobile the hero is the best thing on the site. Big tabular $/win figures, lime/coral reads instantly, the gold strap names the benchmark, and the product mark is on the card.
- The numerator toggle has proper radio semantics with arrow-key support.
- Division pills are real links (`/division/nfc-north`), so the URL tracks state.

**Fails**
1. **The bars can't carry the comparison.** The domain is the max of the four teams shown, from zero (`cost-per-win-card.tsx:126`).
   - In NFC North, DET and GB are "4% below league" and their bars are nearly as long as MIN's red one. Only the colour flip at ±2% tells them apart.
   - The same $32M draws at different lengths in AFC East and NFC North, so screenshots of two divisions can't be compared.
2. **The gold benchmark, the heart of "was it worth it", is the weakest mark on the card.**
   - It's a 1px tick at `#d4af37bf`, roughly 2:1 on white and hidden under the coral fill. That fails WCAG 1.4.11 (3:1 for non-text marks).
   - Its label lives in the strap at the bottom, far from the tick.
3. **The animation breaks your own motion rule.** Switching Cash→Cap recomputes `domainMax` and animates `width` (`receipt.module.css:215`) while the gold tick jumps. That is exactly what CHART_ANATOMY §6.1 forbids (no animating marks under a changed domain).
4. **There is no league rank.** "NE $20.5M, 38% below league" never says "2nd of 32".
5. **The league Field is illegible.**
   - Labels collide: "LV 65|CLE 76|ARI 85|CAR 96" overprint at 375px, and "NE 128" sits on "DEN 120".
   - Ten clubs stack in one column near 105.
   - Both end-zone bands are empty dead space.
   - The division picker doesn't highlight its four teams on the field.
6. **The leaderboard wastes space and mislabels rank.**
   - Δ 5Y is "NOT COVERED" in all 32 rows; the reason string appears 32 times in the DOM.
   - Sorting by $/win keeps the Cap+ rank in the "#" column (ARI shows "28" at the top).
   - $/win has no visual encoding at all.
   - The 96×24 trend sparklines are squiggles.
   - The first click on $/win sorts descending (worst first).
   - Sort state isn't in the URL.
   - Mobile secondary lines truncate with an ellipsis ("NE · $20.5M/WIN · 1…"), which MOBILE_PATTERNS §4 forbids.
7. **The dead-money ledger prints raw integers**: "SPLIT: 55400000/43800000". "Verified" also appears three times per row.

**Fixes:** proposals #2, #5, #8 and #9 in section D.

### Team (`/team/kc/2025`)

**Strong**
- The coaching tenure bands are the best chart on the site: legible, honest, and a real story (the Reid era).
- The 2013 break and the hatched blank seasons on the arc are correctly drawn.
- The "Provisional" chip on 2019 is visible and explained.

**Fails**
1. **The headline question is buried.** Card order is: Season tiles → Arc → Drive → Three Lenses → Spend Mix → **Cost per win (6th)** → Coaching → Dead money → Draft.
   - On mobile the card starts 3,359px down a 7,931px page, more than four screens.
   - The first viewport shows record, point differential, EPA and Cap+, but no dollars.
2. **The two flagship metrics disagree, with no explanation.**
   - KC 2025 is 6–11 with Cap+ **104.7** ("above average"), and the cost-per-win card says **$53.1M per win, 60% above league**.
   - The arc caption makes it worse: "Cap+ scores wins produced per dollar" is wrong per SPEC §2.2/§2.4. Cap+ is a performance composite (win%, point differential, EPA) divided by cap cost.
   - A fan will conclude the site is broken.
3. **The selected season is never marked.** `FranchiseArc` and `TeamDrive` take no season prop (`page.tsx:255–278`), so `/team/kc/2019` and `/2025` draw identical charts. Arc points aren't links.
4. **The Drive repeats the Arc** directly underneath it, and 14 of its 27 seasons are empty field.
   - The field metaphor is vertical, which inverts broadcast convention.
   - There's no ball, no line of scrimmage and no "drive" grammar, so it reads as the same line chart with yard numbers.
5. **Caveat prose outweighs the charts.**
   - The arc carries four paragraphs.
   - The regime section prints ten consecutive "NO LEAGUE-WIDE DEAD-MONEY TABLE PUBLISHED FOR 2002…2013" rows.
   - Dead money appears twice: in Three Lenses and again as "This season" inside the dead-money card.
6. **Spend Mix uses heavy slabs for nine small numbers.** Nine ~40px gray slabs take about 700px. The delta ("+7.3") is large and the actual share ("27.4%") is tiny.
7. **Lime changes meaning between pages.** In the subject-mode hero KC is lime at $53.1M, after the home page has taught that lime means cheap. This is NEEDS-REY #2 in practice, and it reads as a contradiction.
8. **Charts collide with themselves.**
   - Dead-money dots: rotated "NOT A 32-TEAM READING" labels overprint the '17/'19/'21 tick labels.
   - Mobile arc: "130.5" overprints "127.3", and "TEAM RATING" is clipped at the right edge.
9. **Draft card:** "CAPITAL 4982.0" has no unit and no league median, which breaks your own "benchmark always named" rule.
10. **Mobile scrolling.**
    - Arc, Drive and dead-money charts overflow by 15px (332 vs 317), creating accidental horizontal scrollers.
    - The regime timeline is a 900px scroller that opens at 2000, with the current regime off-screen.

### Player (`/player`, `/player/5594`)

**Strong:** the identity chip with a visible photo credit, and a contract card with clean KPI tiles.

**Fails**
- **Landing is an empty search box.** There are no featured players, no "biggest cap hits" or "biggest dead-money names" list.
- **"1 players match"** grammar bug.
- **The combobox is broken for keyboard users.** It has `role="combobox"` but no ArrowDown/Enter handling, and `aria-selected` is hard-coded false (`player-search.tsx:53–81`). Down+Return did nothing.
- **Cap vs Cash is unlabeled.**
  - The bars carry no value labels, and the y-axis ticks are $10M/$30M/$50M with no zero label.
  - The interesting story is unannotated: the 2023 cash spike against the cap number, i.e. restructures.
  - There's no "share of KC's cap" line.
- **The availability table wastes columns.** It shows DEF SNAPS 0 and ST SNAPS 0 for a QB, and the production card is a blank state.

### Compare (`/compare?a=kc-2019&b=kc-2025`)

**Strong:** the cross-era statement is placed well, the URL carries state, and the gold "how this works" rule is a nice touch.

**Fails, and this is the most misleading chart on the site:**
- **The printed numbers and the bars encode different things.** The figures are raw values (0.750 / 0.353). The bars are |delta from own-league average|, normalized per row to the larger delta (`head-to-head.tsx:129–132`), and below-average bars are drawn from the outer edge inward.
- **Every row's leader is full width**, so Team Rating +18.4 looks the same as win% +0.250.
- **There's no "better" direction.** Cash share 93.3% vs 114.2% puts the larger bar on the worse side.
- **No verdict line**, such as "KC '19 better on 8 of 9".

### Share cards (`/share/team/kc/2025`, `/share/receipt/afc-east/2025`)

- **They're HTML pages, not images.** Full site chrome is shown, with developer instructions to the public: "Rasterise [data-export-root] at devicePixelRatio 2…".
- **Nothing links to them.** There's no share button anywhere (checked via the DOM).
- **No page has `og:` or `twitter:` meta** (verified with curl). Every shared link unfurls as bare text.
- **The team square has no verdict.** It shows three dollar figures with no comparison and Cap+ at 11px in the corner.
- **The receipt square is decent,** but it's a bar chart, not a receipt. The brand's own metaphor goes unused.

## C. Cross-cutting

**Motion** (the spec permits it on state change; almost none is built)
- What exists: hero bar width (which breaks the domain rule), pill colour, disclosure height, the header border.
- What's spec'd but missing: FLIP re-sort on the leaderboard (CHART_ANATOMY §6.2), and frontier scatter `cx/cy` on season change.
- Where motion would earn its place, all compliant with §6.1 because the domain stays pinned:
  - (a) leaderboard row reflow on sort;
  - (b) season change on the team page as a client transition, with the "you are here" marker sliding along a stable arc;
  - (c) a League Field season scrubber (50–150 fixed), clubs sliding yard by yard;
  - (d) a user-triggered "Play the drive" that walks the Drive season by season. It's started by the user, so it isn't entry choreography.
- Keep the ban on count-ups. Your reasoning in RESOLUTIONS D14 is correct.

**Interactivity**
- No hover, tooltip, crosshair or linked highlighting anywhere. Only 3 client components exist (`receipt/*`, `leaderboard`). `@visx/tooltip` and `react-spring` are spec'd but not even dependencies (`web/package.json`).
- Field marks and leaderboard rows do link to team pages, which is good.
- URL state covers division and compare, but not sort or numerator.

**Hierarchy**
- After the 44px hero, every section title is 18px Bebas. That's flat.
- 191 visible text nodes are 11px tracked uppercase Rajdhani, and the "Verified actual" chip is 10px, below your own D1 floor.
- Methodology prose sits at body size beside the charts and competes with them.

**Colour**
- Dark mode is strong.
- Light-mode lime becomes olive `#4f7413`, which loses its energy.
- The gold benchmark fails 3:1 in light mode.
- Red is used correctly; allocation bars are neutral per N1, which is right but visually dead.

**Mobile at 375**
- Chrome takes 29% of the viewport: header 71px, sticky picker 99px, tab bar 71px. The picker sticks at `top:62px` under a 71px header, so 9px overlap.
- The "Current alignment only" caption is inside the sticky region.
- The Field is unreadable.

**Accessibility**
- Charts carry `role=img`, `aria-label` and described-by text, with CSV as the table equivalent. That's good.
- Failures: the combobox, gold contrast, and accidental horizontal scrollers.

**Performance**
- Excellent: TTFB about 0.09–0.25s. Home HTML is 285KB because both compositions are rendered, plus 32 repeated reason strings.

## D. Top 10 upgrades, ranked

| # | What | Why a fan cares | Effort | Files |
|---|---|---|---|---|
| 1 | **Verdict strip at the top of every team page:** "6 wins · $318.8M cash · **$53.1M per win** · 29th of 32 · 60% over league". Move cost per win to card 2. Add one line reconciling it with Cap+ ("Cap+ is above 100 because point differential and EPA outran the record"). Fix the "wins produced per dollar" copy. | Answers "was it worth it?" in about 2 seconds and removes the apparent contradiction | M | `app/team/[abbr]/[season]/page.tsx`, `components/team/team-blocks.tsx`, `components/charts/franchise-arc.tsx` (copy) |
| 2 | **Build the frontier scatter** (already spec'd, never built): x = cash spent, y = wins, all 32 clubs, gold isoline at the league $/win plus faint isolines at ±25%. The subject team is lime. Add a season scrubber with a pinned domain. | The single chart that *is* the product. Overpaid and over-performing teams are visible at a glance, and it's very screenshot-friendly | M | new `components/charts/frontier.tsx`, `app/_shared/division-view.tsx`, team page |
| 3 | **Real sharing:** `opengraph-image.tsx` (next/og) for team, division and compare. A Share button (copy link plus download PNG). Strip chrome and developer copy from `/share/*`. Build a literal **receipt** layout: line items, subtotal, "PER WIN", over/under stamp. | Today every shared link unfurls blank. This is the growth loop | M | `app/team/[abbr]/[season]/opengraph-image.tsx`, `app/division/[div]/…`, `app/compare/…`, `app/share/**`, `app/layout.tsx` metadata |
| 4 | **Rebuild H2H as a diverging dot plot:** both sides as dots on a shared per-metric axis, 0 = own-league average. Delta printed large, raw value small. A "better →" arrow per row (cost rows inverted). A tally headline. | Currently it misleads; fixed, it's the most debate-ready page | M | `components/compare/head-to-head.tsx`, `head-to-head.module.css` |
| 5 | **Fix the hero encoding:** a league-wide fixed domain per season, ghost ticks for all 32 clubs on each track, a 2px gold tick labelled on the track, "#2 of 32" beside each value. This also removes the domain-change animation violation. | Makes every division card comparable and puts the benchmark where the eye already is | S–M | `components/receipt/cost-per-win-card.tsx`, `receipt.module.css`, `design/system/tokens.css` (light benchmark tick) |
| 6 | **Time navigation on the team page:** a "you are here" marker on the Arc, clickable and focusable season points, prev/next arrows in the header, a client transition that keeps the arc in place. Fold the Drive into the Arc as a "read as field" toggle, or cut it to 2014–2025. | Season scrubbing is how fans explore a franchise. Today every season page looks identical | M | `components/charts/franchise-arc.tsx`, `components/field/team-drive.tsx`, `components/pickers/team-season-picker.tsx`, team page |
| 7 | **Inspection layer:** a tap/hover tooltip that repeats and enriches (spec'd in CHART_ANATOMY §8). Arc crosshair showing season, Cap+, rating, record, $/win. Leaderboard row hover lights the club on the Field, and the reverse. | Turns static posters into tools, PFR-style | L | `components/charts/chart-kit.ts` (new hook), `franchise-arc.tsx`, `field/league-field.tsx`, `leaderboard/capplus-leaderboard.tsx` |
| 8 | **Fix the league Field:** collision-aware lanes with abbreviation-only labels (value on tap), the four division clubs lit from the picker, and a vertical orientation under 1024px. | The signature metaphor currently fails at phone width | M | `components/field/league-field.tsx`, `field.module.css`, `field-kit.ts` |
| 9 | **Fine-print discipline:** short form visible, full caveat in the existing inline disclosure. Collapse the ten blank regime readings into one line. Replace Δ 5Y with Δ vs last covered season. Remove duplicate dead-money blocks. | Halves page length, so the charts get read | S | `franchise-arc.tsx`, `regime-timeline.tsx`, `capplus-leaderboard.tsx`, team page |
| 10 | **Spec'd motion and URL state:** FLIP re-sort, `?sort=cpw&n=cap` in the URL, cross-fade (or fixed domain) on the numerator toggle, and the rank column following the active sort. | Sorting is the leaderboard's whole job, and it should be linkable | S | `capplus-leaderboard.tsx`, `leaderboard.module.css`, `components/receipt/receipt.tsx` |

**Same-day bug sweep (S):**
- Format "SPLIT: 55400000/…" as dollars.
- "1 players match".
- Combobox arrow-key and Enter handling.
- The 9px header/picker overlap.
- The 15px accidental chart scrollers.
- Mobile ellipsis truncation.
- Regime scroller should open at the current regime.
- 10px chip.
- Three-lime regime chart (breaks one-lime-per-chart).
- Zero-only snap columns for a QB.
- Direct value labels on Cap vs Cash.
- Units and league median on the draft card.

## E. Three missing ideas the marts already support

1. **The Roster Receipt** (`player_season_cap` + `player_season_availability` + `dead_money_team_season` + `team_season_results`).
   - A literal itemized receipt per team-season: top 12 cap hits as line items with games played beside them, dead money as "VOID" lines, subtotal, total ÷ wins.
   - It shows cap and games side by side without dividing them, so it stays clear of the no-player-grade rule.
   - This is the brand's "receipts" promise made literal, and the most shareable object you could ship.
2. **The QB-contract window** (`position_allocation` QB share × `capplus_official`, 2014–2025).
   - A scatter or slope of QB cap share against Cap+, plus a franchise view of how its spend mix shifted, e.g. KC's 2019 rookie-deal window vs 2025.
   - It's the most argued-about idea in NFL economics, and your data can show it. CHART_ANATOMY §9 already specifies the league allocation heatmap, which was never built.
3. **The Regime Bill** (`regime_events` + `team_season_stability` + `draft_class_summary` + `dead_money_team_season`).
   - One row per head-coach regime: seasons, mean Team Rating or Cap+, draft capital spent, `w_av_per_1000_capital` return, and dead money in the two seasons after firing.
   - That gives "what each coach cost and returned" across 25 Tier 1 seasons.
   - A league-wide draft-efficiency leaderboard (1999–2025, no Tier 2 dependency) falls out of the same mart.

**What I didn't cover:**
- No pre-2013 team page (the boundary-message state).
- /methodology and /credits not visually reviewed.
- Light theme tested on desktop home, the dead-money table and mobile compare only.
