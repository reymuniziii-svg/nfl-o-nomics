# YIELD/YARD — blind visualization proposals (2026-10-10)

Produced by an Opus agent briefed only on the product concept and the data available. It did
not see the repo or the live site. Specific figures it cites (contract terms, dead-money
amounts, verdict cutoffs) are its assumptions and must be checked against the marts before
anything ships. Companion to `2026-10-10-existing-review.md`, which reviews the shipped v1.

---

**Summary:** the visual the product should be known for is **The Field**. Cap+ is shown as a yard line, and midfield is league average. The second visual is **The Receipt**, a printed cost breakdown that closes with a verdict stamp. Every other surface reuses one of these two shapes, so a fan learns how to read the product once.

---

## 1. The visual the product is known for: THE FIELD

**The encoding: Cap+ is a yard line.**
- Midfield (the 50) = Cap+ 100 = league average for that season.
- 1 Cap+ point = 1 yard. A score of 128 sits on the opponent's 22; a score of 81 sits on your own 31. Fans can do this conversion in their heads.
- The field covers Cap+ 50–150. A team above 150 lands in the end zone with a "TD" label and its exact score; below 50 gets a "SAFETY" label.
- **Check this first:** if more than 5% of team-seasons fall outside 50–150, change the scale to 1 yard = 1.5 points.
- The end zones are labelled **WORTH IT** (forward) and **MONEY PIT** (behind).

**Width of the field: 8 division lanes.** AFC takes 4 lanes and NFC takes 4, split by a center hash. Each team is a ball marker: a 22px circle with a 3-letter abbreviation in Rajdhani Bold. When you pick a division on Home, its lane lights up, so the field and the division picker are the same control.

**Dead money is a penalty.** Each ball has a hollow ghost ring where it would sit with zero dead money. A dashed yellow line runs from the ghost back to the real ball, and a flag glyph sits on that line. The length of the line is the cost of dead money in yards: "FLAG: DEAD MONEY, −9 YDS (RYAN $40.5M)". Penalty-flag yellow is used for dead money and nothing else, anywhere in the product.

**Layout at 390px (portrait):**
- Field is 358 × ~620px. WORTH IT is at the top. Each yard is about 5.6px; each lane is 44px wide.
- Chalk yard lines every 10 yards on a near-black field. Avoid green turf: it's a cliché and it clashes with team colors.
- A broadcast-style caption bar is pinned at the bottom: `BUF 2024 · CAP+ 128 · OPP 22 · $19.8M/WIN`.

**Layout at desktop:**
- The field turns landscape, about 1200 × 520px. Play moves left to right, with WORTH IT on the right.
- The 8 lanes become horizontal rows.
- A season scrubber (1999–2025) runs under the field. Seasons 1999–2012 show a diagonal-hatch overlay labelled "RATING · NO RECEIPTS". Those balls are placed by Team Rating, and the hatch stops anyone mistaking it for Cap+.

**What moves, and why:**
- **Kickoff:** every ball starts at midfield and travels to its yard line. That says "everyone starts at average; the money moved them."
- **Drive march:** when you scrub to another season, balls slide to their new yard lines and leave a fading trail.
- **Flag on the play:** a flag drops and the ball is marked back. You see the dead-money penalty happen.

**What a fan does with it:**
- Find their team's ball and scrub through the seasons.
- Tap a ball to open a small receipt card.
- Flip "Review" to re-place every ball on QB-neutral Cap+ (section 3).

**The screenshot:** 31 dimmed balls plus one lit team, a yellow flag behind it, and the caption bar. It explains itself because every NFL fan already knows midfield means "even."

**Why it reads in under three seconds:**
- Field position is the most practised spatial reading in football.
- "Which side of the 50, and how far?" is the question "was it worth it?" turned into a place on the field. No legend needed.

---

## 2. Per view

### Home / Division
- **Hero (first frame):** the Field for the latest season with the chosen division lit. On a first visit, pick the division from locale or default to the most-visited one. Directly under it, a **Price Board**: 4 rows showing team, cost per win in split-flap digits ("$21.4M / WIN"), a 60px bar with a league-average tick, and rank of 32.
- **Supporting: Cap+ Leaderboard (all 32).**
  - Columns: rank, team, record, Cap+, a **mini-field strip** (100px, a midfield tick and a ball dot), cost per win, dead money as % of cap, and an "R" chip when the starting QB is on a rookie deal.
  - Sortable on every column. Rows re-order with an animated slide (the **Re-rank** transition).
  - Default sort is Cap+. A segmented control switches between Raw, QB-neutral and By stratum.
- **Supporting: Largest dead-money charges.** Horizontal bars styled as torn receipt stubs.
  - **Use % of that season's cap, not raw dollars.** The cap was $123M in 2013 and $279M in 2025, so raw dollars make every recent charge look like the worst ever.
  - The dollar figure is the secondary label. Estimated charges get a dotted outline and an "EST" tag. Each row links to its source.
- **Interactions:**
  - Tapping a ball, a leaderboard row or a price-board row highlights that team in all three.
  - Keyboard: ←/→ change season, keys 1–8 pick a division, Tab moves between balls in Cap+ rank order.
  - URL: `/?season=2024&div=afc-east&sort=capplus&view=raw`.
- **Mobile order:** Field → Price Board → Leaderboard (first 10, then "show all 32") → Dead money → entry cards.

### Team-season
- **Hero: The Receipt.** Off-white paper (#EDE8DC) on the dark page, in a monospaced Rajdhani setting.
  - Header: team, season, coach regime, and the data snapshot date.
  - One line per position group, for example `QB ........ $48.2M  ▮▮▮▮▮|  +6.1% vs LG`. Each line has a small bar with a bracket marking league-average share.
  - Dead money lines appear with strikethrough and "VOID", weighted at 1.5×.
  - `UNSPENT CAP $11.3M (NO CREDIT)`, then the subtotal.
  - **YOU GOT:** W–L, point differential, offensive and defensive EPA per play.
  - **TOTAL:** Cap+ 128 and cost per win against the league figure.
  - **Verdict stamp:** STEAL / WORTH IT / FAIR PRICE / OVERPAID / MONEY PIT. Set the cutoffs from the actual distribution (quintiles or ±SD), not round numbers.
  - **The barcode** at the bottom is the franchise's history: one bar per season since 1999, height = Cap+ minus 100, current season lit. Tapping a bar changes the season.
- **Supporting visuals:**
  1. **Allocation vs league:** a diverging lollipop with 8 position rows; the dot is the team's share minus the league share. Offense and defense groups get their EPA per play beside them, so spend sits next to result.
  2. **Cap stack:** top 25 contracts as sorted bars. Marquee players get a photo chip and the rest get a number chip. Snap share is shown as a filled ring, so expensive players who barely played are visible.
  3. **Regime ribbon:** a 1999–2025 Cap+ line (dashed for the Team Rating era). Behind it run bands for head-coach tenure, with OC/DC changes as thin bands and in-season firings as red ticks. The stability index is a small number on each band.
  4. **Future-cap mortgage:** forward bars (section 3).
- **Motion:** Receipt print and Stamp play on first load only. When the season changes afterwards, numbers roll to the new values; don't re-print the receipt every time someone scrubs.
- **Interactions:**
  - Tap a receipt line to highlight those players in the cap stack. Tap a player to go to their page.
  - URL: `/team/buf/2024?pos=qb&view=qb-neutral`.
- **Mobile:** receipt full width, then allocation, cap stack, regime ribbon, mortgage.

### Player
- **Hero: Contract arc.** One stacked column per season showing base, prorated bonus and other.
  - A cash-paid tick on each column, so cap and cash read separately.
  - Hatched yellow columns below the baseline for dead money left behind after release or trade.
  - Cap % of league printed above each column.
  - A dashed line for the league median at his position.
  - Duotone photo in team color, or a jersey-number placeholder for players without a licensed photo.
- **Supporting:** an availability strip (17 pips for games, a snap-share bar) and guaranteed vs non-guaranteed money as a split bar.
- **Be honest about what the data can't show.** There are no player-level production stats, so **don't build a player Cap+**. Show cost per snap against his position median, and his team's Cap+ in each of his seasons, labelled "team context".
- **Motion:** columns fill season by season (Cap fill, staggered 60ms).
- **Interactions:** scrub through seasons; tapping a column opens its receipt lines.
- **URL:** `/player/{id}?season=2023`.

### Compare
- **Hero:** a field strip with just the two balls kicking off at the same moment, plus the gap annotated: `BUF 2024 +14 YDS OVER KC 2023`.
- **Supporting visuals:**
  1. **Butterfly allocation chart:** position labels down a center spine, team A extending left, team B right, league-average ticks on both.
  2. **Twin drive-summary waterfalls** (the surplus decomposition, section 3), on a shared scale.
  3. **Twin receipts:** side by side on desktop; a swipeable carousel on mobile with a "diff" toggle that highlights lines differing by more than 2% of cap.
- **URL:** `/compare/buf-2024/kc-2023`. The share card is built from the same address.

### Share card
See section 6.

---

## 3. The new metrics: making the rookie-QB effect obvious

**Use one rule:** only one adjustment ghost on screen at a time. A single **Review** control switches between Raw, QB-neutral and Mortgage-adjusted. Showing several ghosts at once is where these charts usually turn unreadable.

| Metric | Chart form (pick) | Why |
|---|---|---|
| **QB-neutral vs raw Cap+** | **Replay review on the Field**: balls slide from raw to QB-neutral and leave raw ghost rings behind. In the leaderboard, a **dumbbell** (raw ghost to QB-neutral solid), sorted by QB-neutral. | Watching rookie-QB teams slide back and big-QB-contract teams slide forward makes the point in one motion. The dumbbell is the static, sortable version of the same thing. |
| **Rookie-window stratum** | **Split leaderboard**: two side-by-side lists (one stacked above the other on mobile), "QB on rookie deal" and "Veteran QB deal", each ranked within its group, with that group's average shown as a midfield line. On the Field, rookie-window balls carry a ring with an "R" notch. | Comparing teams only within their group is the honest framing, and two lists say so without a footnote. Re-centering the whole Field on each group's average was rejected: two midfields on one field confuses people. |
| **Surplus decomposition** | **Drive-summary waterfall along the yard axis**: start at the 50 → QB contract timing +18 yds → rest of roster +6 → dead money −4 → end at opp 30. On the Receipt, the same items appear as signed lines under "WHERE THE VALUE CAME FROM". | It is a broadcast drive summary, it uses the same yard units as the Field, and it adds up visibly. |
| **Future-cap mortgage** | (a) Receipt footer: `CHARGED TO FUTURE SEASONS: $87.4M`. (b) Forward bars of outstanding proration by future year as % of projected cap, hatched to read as "not yet paid". (c) On Home, a 2×2 scatter: Cap+ (x) by mortgage as % of next year's cap (y), quadrants **Paid in Full / Living on Credit**. | The scatter is the one chart that stops all-in teams looking better than they are, and the quadrant names are ready-made share captions. |

**Must fix before shipping the waterfall:** the decomposition has to add up exactly in Cap+ points. Ratio-based metrics don't split cleanly, and the result changes with the order of the steps. Use a log-additive split or Shapley values, precomputed. Otherwise the bars won't sum and analytics Twitter will find it within an hour.

> Editor's note (post-build): `capplus_context` publishes a two-term split that is exact by
> construction, `qb_timing_pts + roster_pts = capplus − 100`. The measured QB-timing term
> averages +2.8 points for rookie-window teams, so the waterfall's "+18 yds" example above is
> an assumption that the data does not support; the honest waterfall is short.

---

## 4. Motion system

All motion is CSS transforms or the Web Animations API. None of it plays on share cards.

| Name | What moves | Duration / easing | What it means |
|---|---|---|---|
| **Kickoff** | Balls travel from midfield to their Cap+ yard lines, staggered 12ms by lane | 700ms, `cubic-bezier(.2,.8,.2,1)` | Everyone starts at average; the money moved them |
| **Drive march** | Balls slide to the new season's yard lines; a ghost trail fades over 600ms | 450ms ease-in-out | Change from last season |
| **Flag on the play** | Yellow flag drops (200ms, small bounce), then the ball slides back along the dashed line (300ms ease-in) | 500ms total | Cost of dead money |
| **Replay review** | 150ms "UNDER REVIEW" tint, then balls re-place; ghost rings stay | 500ms ease-in-out | What would happen under different terms |
| **Receipt print** | Lines appear top to bottom with a 1px paper-feed jitter; totals roll up | 35ms per line, 800ms max | Itemized cost |
| **Stamp** | Verdict scales 1.4→1.0 with a 2° rotation; once per page load | 160ms with overshoot | The verdict |
| **Price flip** | Split-flap digits on cost per win | 25ms per flip, 600ms max | Price |
| **Cap fill** | Bars and columns fill from zero; dead money fills last, hatched | 400ms ease-out | Cap used |

**When the opening animation plays:**
- Server-render the **final state**. That keeps load speed, no-JS visitors and previews intact.
- Kickoff plays only for fields that scroll into view below the fold, or when someone presses "Replay".
- A field that is above the fold gets a 300ms settle from ±10 yards instead, so the page doesn't flash the final positions and then reset them.

**Reduced motion:**
- Every transition becomes an instant change, or a 120ms opacity crossfade with no movement.
- The receipt arrives fully printed and the stamp is static.
- Ghost rings, flags and dashed penalty lines **stay** as static marks, because they carry data.

---

## 5. Scroll stories

**A. "The Mahomes Discount" (2017–2025).** Contract figures need checking against the data.
1. **2017 trade-up and rookie deal.** Contract-arc column dwarfed by the league QB median line.
2. **2018–19.** The Field: KC deep in opponent territory.
3. **Replay review.** QB-neutral re-placement; KC slides back N yards. "This is what the contract was worth."
4. **July 2020, 10 years / $450M.** The receipt prints, and the mortgage bars appear.
5. **2021–23.** Drive-summary waterfalls per season: does the QB-timing share shrink while the roster share grows? This is a hypothesis; let the data decide.
6. **Restructures.** Mortgage bars grow forward.
7. **Drive march across 2017–2025, then a dumbbell against the other mega-deal QBs.** Reader picks their own team at the end.

**B. "The Dead-Money Cliff" (Falcons, with the ledger's other entries)**
1. **2016 Super Bowl season.** A clean receipt.
2. **2018 Ryan extension.** Proration schedule drawn as forward bars.
3. **2020–21.** Mortgage grows while Cap+ slides back on the Field.
4. **March 2022 trade.** A Flag on the play: the $40.5M charge drawn as a long penalty.
5. **2022 receipt.** The VOID line takes up an X% block of the cap in a 10×10 waffle.
6. **Hall of shame.** Unit chart (1 square = 1% of cap) for the Falcons 2022, Rams 2023 and Saints 2025.
7. **Did it cost wins?** Slope chart of Cap+ the year before vs the cliff year for every ledger entry.

**C. "The Rookie Window"**
1. **All ~416 team-seasons, 2013–2025,** as dots on the Field, drawn on canvas.
2. **Rookie-window seasons light up** and cluster forward.
3. **Each group's average drawn as its own midfield line,** with the gap measured in yards.
4. **Replay review.** The rookie cluster slides back to QB-neutral.
5. **The window closes.** Slope from the last rookie-deal year to the first extension year, one line per team.
6. **Who beat it.** Veteran-QB teams with high QB-neutral Cap+, named as the real roster builders.
7. **Your team.** Picker shows its rank within its group.

> Editor's note (post-build): story C's premise is inverted by the data. Rookie-window
> team-seasons average Cap+ 98 against 101 for veteran-QB teams; they cluster *behind*
> midfield. The honest version of the story is "the window is smaller than you think."

---

## 6. Share cards

Prebuild every team-season (~864 per format) at build time with Satori/@vercel/og.
- Load the fonts as TTF buffers, and use flex only: Satori doesn't support CSS grid.
- The card URL mirrors the page URL, so `?view=qb-neutral` produces a QB-neutral card.
- Generate alt text automatically.

**1200×630 (X and link previews):**
- **Left 40%:** team-color band, `BUF 2024` in 120px Bebas, record, verdict stamp.
- **Center:** a horizontal field strip with the ball at its yard line, midfield labelled **LEAGUE AVG**, and the flag ghost if there is dead money. Big readout: `CAP+ 128 · OPP 22`.
- **Right:** four receipt lines: cap spent, dead money (yellow), cost per win vs the league figure, "QB ON ROOKIE DEAL: 3rd OF 9" when it applies.
- **Footer:** `Cap+ 100 = league-average results per dollar · dead money ×1.5 · yieldyard.com`, plus the snapshot date.
- **No number smaller than 28px.** X shrinks the card to about 500px wide.

**1080×1350 (portrait feeds):**
- The full receipt: header, 8 position lines with league brackets, VOID lines, unspent cap, YOU GOT, the WHERE THE VALUE CAME FROM waterfall lines, verdict stamp.
- The barcode as the franchise's history.
- A field strip as the "TOTAL" line.
- The one-line method note.

Other variants: Player, Compare (two balls with the gap), Dead-money (torn stub).

---

## 7. Top 10 by impact per effort

1. **Mini-field strip** (yard-line component), reused in leaderboard rows, cards and share cards. **S**
2. **Team-season Receipt** with league brackets, VOID lines and verdict stamp. **M**
3. **Prebuilt share cards** in both sizes, wired to page URLs. **M**
4. **The Field on Home** with division lanes, Kickoff and Drive march. **M**
5. **Flag on the play** for dead money (ghost ring, flag, dashed line). **S** once #4 exists
6. **Split leaderboard** by rookie-window group, plus the "R" chip. **S**
7. **Replay review** QB-neutral toggle with a dumbbell column. **S**, data is precomputed
8. **Dead-money list as % of cap** with EST flags; fixes the 25-season comparison problem. **S**
9. **Drive-summary waterfall** for the surplus split. **M**, needs the decomposition to add up
10. **Rookie Window scroll story.** **L**; the Mahomes and Falcons stories are also **L**, ship them after it

**Other risks:**
- Don't rely on team colors or red/green to carry meaning. Use cyan/amber for the verdict, yellow only for dead money, and abbreviations on every ball.
- No team logos (trademark); use colors and abbreviations.
- Cap+ swings wildly when a team's performance is near zero. Clamp it and show the clamp.
- Accessibility: every ball needs a label like "Buffalo 2024, Cap+ 128, opponent 22, 3rd of 32", and the Field needs a hidden table equivalent.
