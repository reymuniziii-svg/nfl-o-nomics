# Cap+ — formula approval memo (gate #1)

**For:** Rey (product owner) · **2026-07-25** · **Decision:** approve one formula, or send it back.

**APPROVED — gate #1 cleared by Rey, 2026-07-25.** The recommended build in §7 (Total-Cost, λ=1.5, floored, one snapshot per season, nine seasons) is the shipping formula.

**AMENDED 2026-10-10 — see §9.** λ = 1.0, opponent-adjusted EPA in P, the obligation candidate retired, all thirteen seasons (2013 measured and provisional; 2016, 2020, 2021 estimated). §§1–8 are the July record and are left as written.

Sources: `audit/findings_capplus_backtest.md` (**BT §n**), `audit/findings_contracts.md`, `audit/findings_deadmoney_sourcing.md`, `data/marts/capplus_candidates.csv`. Numbers marked **[new]** were recomputed 2026-07-25 from the candidates mart plus `data/curated/dead_money_team_season.csv`; they are now **reproduced by `audit/capplus_backtest.py`**, which ships the recommended build and re-derives every [new] figure below (see condition 5, and BT §15). Reconciliation moved every sniff value by less than 0.05 index points and changed no rank; it corrected exactly one [new] figure, the λ=1.0 cell in §3.2, which is flagged there.

---

## 1. What you are approving

**Cap+ (Total-Cost)** = `(100 + 15 × performance) ÷ (team cost ÷ league-average cost)`, where *cost* = `(cap charged to players on the roster + 1.5 × dead money) ÷ league cap`, with all 32 teams read from **one dated snapshot per season** and a floor so a team earns no credit for cap it simply never spent. It ships for **nine seasons — 2014, 2015, 2017, 2018, 2019, 2022, 2023, 2024, 2025** (288 of 416 team-seasons); 2013, 2016, 2020 and 2021 render an explicit "not available," and 1999–2012 shows a differently-named performance-only rating.

## 2. The three candidates

| | Plain English | The math | Rewards / punishes |
|---|---|---|---|
| **A — Cash Rate** | Performance per dollar of **cash actually paid to players on the roster**. | `P ÷ (team cash ÷ league-avg cash)` | Rewards winning cheap; punishes high cash. Cannot see dead money. |
| **B — Efficiency Over Expected** | Fit a line each season predicting wins from spending; Cap+ is **how far above the line** you finished. | residual of `P ~ cash`, restandardized | Rewards beating your spending level. Also cannot see dead money. |
| **C — Total-Cost Rate** | Performance per dollar of **cap actually consumed, dead money included**. | `P ÷ (cap consumed ÷ league-avg cap consumed)` | Rewards a small total bill; punishes a big one — live money *and* dead money. |

**All three are broken exactly as written** (BT §6). `P` is a plus-or-minus score, so dividing it by a bigger denominator makes a below-average team score *higher*: across the 212 of 416 team-seasons with P below zero, corr(score, spending) is **+0.556** for A and **+0.286** for C. The 2022 Bears' raw C score *improves* from −1.731 to −1.675 **because of** their record $91.8M dead charge (BT §6.1). The one-line fix used throughout below is a positive numerator (`100 + 15·P` instead of `P`), which makes the score fall whenever the bill rises, at every level of performance.

## 3. Backtest summary

### 3.1 Sniff table — index value (100 = league average) and rank in that season

| Case | Expected | Perf. only | A as written | A-pos | B | C-pos (BT) | **Cap+ (rec.)** |
|---|---|---|---|---|---|---|---|
| 2013 SEA — champs, rookie QB | elite | 128.4 (#2) | 126.0 (#1) | 116.2 (#5) | 128.0 (#2) | — | **—** |
| 2014 NE — efficient champ | top 10 | 119.8 (#4) | 122.5 (#1) | 137.2 (#1) | 121.9 (#2) | 118.5 (#5) | **118.4 (#3)** |
| 2017 PHI — champs, backup QB | top 10 | 125.2 (#1) | 122.8 (#1) | 114.7 (#7) | 123.4 (#1) | 114.2 (#7) | **114.7 (#7)** |
| 2023 SF — cheap QB, NFC champs | elite | 127.5 (#2) | 124.1 (#1) | 111.6 (#5) | 123.9 (#3) | 145.9 (#1) | **133.9 (#1)** |
| 2019 KC — SB, rookie-deal Mahomes | report | 118.4 (#5) | 118.8 (#4) | 120.7 (#3) | 122.9 (#3) | 137.2 (#1) | **122.6 (#3)** |
| 2021 LAR — all-in, won SB | report | 114.3 (#7) | 115.5 (#6) | 120.1 (#1) | 123.0 (#2) | — | **—** |
| 2013 OAK — 43.6% of cap dead | poor | 80.7 (#29) | 75.7 (#30) | 109.0 (#9) | 89.4 (#23) | — | **—** |
| 2022 CHI — record dead money, 3-14 | poor | 74.0 (#31) | 54.3 (#32) | **133.5 (#1)** | 81.5 (#28) | 71.5 (#31) | **77.2 (#31)** |
| 2022 ATL — record dead money, 7-10 | poor | 92.3 (#24) | 89.9 (#26) | **132.1 (#3)** | 97.8 (#17) | 88.1 (#28) | **89.5 (#27)** |
| 2023 LA — $79.6M dead, 10-7 | — | 106.2 (#10) | 109.0 | 139.7 | **126.3 (#1)** | 102.3 (#14) | **95.2 (#20)** |
| 2025 NO — $107.8M, largest in file | — | 91.5 (#23) | 89.6 | 121.1 (#3) | 105.1 (#13) | 93.8 | **85.7 (#27)** |
| 2024 DEN — record individual charge | report | 112.5 (#9) | 113.6 (#7) | 122.5 (#3) | 114.4 (#6) | 111.3 (#10) | **104.4 (#13)** |
| 2017 CLE — 0-16 | bottom | 69.9 (#32) | 71.0 (#32) | 75.3 (#32) | 70.0 (#32) | 88.7 (#23) | **72.9 (#32)** |

BT §2.3/§7/§8 for all columns except **Cap+ [new]**. Failures against the brief's bands (BT §7.1): A-sub 4, A-pos 4, B 2, C-sub 2, C-pos 1, A-as-written 0. **The recommended build fails none of the banded cases it can score — but read the honesty note in §7 before you take that as a win.**

Three things the pass/fail column hides, all of which matter more than it does:

1. **A-pos ranks the 3-14, record-dead-money 2022 Bears #1 in the NFL** (133.5) and 9th all-time; A-sub ranks them 8th and 2022 ATL 6th (BT §5.1, §11, §12). Cash paid to *rostered* players reads a gutted roster as thrift — corr(cash, dead-money share) = **−0.358** (BT §2.3). No algebra repairs that. **A is dead.**
2. **B's most cap-efficient team in football in 2023 is the Rams**, who carried $79.6M in dead money (126.3, #1 — BT §5.1). B is cash-only and structurally blind to dead money.
3. **A and C as literally written pass by being the performance index in a costume** — correlation with pure performance 0.988 and 0.998, mean rank move 0.60 and 0.30 places, and *zero* team-seasons where C moves a team 5+ spots (BT §5). A sniff table cannot distinguish a working cap adjustment from no cap adjustment.

### 3.2 Headline diagnostics

**Does it add anything beyond win-loss?** Mean change in a team's rank versus ranking on performance alone: A **0.60**, C-as-written **0.30**, B **2.25**, C-pos **2.37** (BT §5); recommended build **2.23 places, 14.6% of teams moving 5+ spots, biggest single move 15 places** [new]. Correlation with performance falls from 0.998 to **0.950**, with win percentage from 0.953 to **0.906** [new]. That is the zone where the number visibly moves teams and the movement is arguable.

**Does it repeat year to year?** Performance persists at 0.42 season-to-season; the recommended build at **0.386**. But the *cap adjustment alone* — Cap+ minus performance — persists at only **+0.158** [new] (panel-computed: +0.060 for C-pos, −0.001 for B). **Cap+ is single-season resource accounting, not a front-office quality score.** Dead money genuinely is a one-year event; we say that ourselves, in the methodology, before someone else computes it.

**Does the dead-money weight do any work?** This is the real product decision. Teams with the most dead money have the least live cap — corr **−0.774** (BT §2.3) — so a dead dollar nearly cancels a live one and total cost barely disperses (CV 0.035–0.078 vs 0.11–0.16 for cash, BT §2.1). Effect on the top-3 dead-money teams in each season, versus their own performance rating [new]:

| Dead-dollar weight λ | Top-3 dead-money teams | 2022 ATL | 2025 NO | 2023 LA | 2024 DEN | 2023 SF |
|---|---|---|---|---|---|---|
| 1.0 ("a dollar is a dollar") | **−0.63 places / −1.1 points — no punishment worth the name** [corrected] | 96 (#19) | 94 (#23) | 106 (#11) | 113 (#10) | 134 (#1) |
| **1.5 (recommended)** | **−3.22 places / −5.5 points** | 89 (#27) | 86 (#27) | 95 (#20) | 104 (#13) | 134 (#1) |
| 2.0 | −5.33 places / −9.2 points | 83 (#30) | 80 (#28) | 87 (#27) | **99 (#20)** | 135 (#1) |

*[corrected]*: the panel's original λ=1.0 entry read "+0.26 places — no punishment at all". That figure came from a λ=1 build **without the floor**, while the five team cells on the same row came from the floored build. Under the recommended build's own rules — the floor applied at every λ — the λ=1 effect is **−0.63 places / −1.1 points**. The argument is unchanged: at λ=1 the punishment is a fifth of what λ=1.5 delivers and Atlanta still lands 19th, better than its 24th-place performance rank.

At λ=1 the page says "dead money included" and dead money does nothing. At λ=2 we start punishing charges that were ordinary for their season — 2024 Denver drops 11 places despite consuming exactly the 2024 median share of the cap. λ=1.5 puts the famous disasters where they belong and leaves Denver near where it belongs.

### 3.3 The honest statement of the window

Spend data starts in **2013**; before that the contracts file is a sample of notable contracts, not a roster (43 players per team in 2012 against a 53-man roster — contracts audit §3.1). Dead money exists only as **dated press snapshots**, with full-league tables for **nine seasons** (BT §9). Cap+ therefore covers **288 of 416 team-seasons (69.2%)**, and **eight of the twenty marquee sniff cases cannot be scored at all** — 2013 SEA, 2013 OAK, 2016 NE, 2016 CLE, 2020 KC, 2021 KC, 2021 LAR, 2021 NO. (BT §7.1 says "seven"; its own table marks 2013 OAK unscoreable too.) **The flagship case in the brief, 2013 Seattle, is one of the blanks.** Inside the nine, the 2014 and 2019 tables were published *before the league year opened* — median charge $4.0M and $3.4M against $50.3M in 2024 [new] — so those two ship badged **provisional**.

## 4. The 25-season question — 1999–2012 team pages

Nothing labelled Cap+. The Cap+ slot renders the literal sentence **"Not available — league-wide contract coverage begins in 2013"** — never a dash, never a blank, never a zero. Beside it the page shows **"Team Rating (performance only)"** in visibly different styling, with a hard visual break at 2013 in any franchise time series (BT §13.1). The four uncovered seasons inside the Cap+ era get the same treatment: **"Not available — no league-wide dead-money table was published for this season."** The scenario brackets in BT §9.1 are scenarios, not measurements, and **never ship as values**. We also reject the C-where-covered/B-elsewhere hybrid — it puts two metrics under one name, and they disagree violently (2023 LA: #14 on C-pos, **#1 on B**). Two rules that are easy to skip and expensive to skip: never call the fallback "Cap+ (performance only)" — to a reader that is still Cap+; and on the 2014–2025 overlap plot **both** lines, so the gap between Team Rating and Cap+ is visible before the Cap+ line stops. The honest bridge: *both are built from the identical performance composite; only the cap adjustment starts in 2013.*

## 5. Dead-money dependency

**Only the recommended candidate needs the curated dead-money data** — A and B are cash-only, which is exactly why they rate teardowns well. The input is `data/curated/dead_money_team_season.csv`: 370 dated snapshots transcribed from press compilations with per-row citations. Appendix A of the sourcing audit tiers them, and the tiering is the risk: **only 2014 and 2015 reach full-32 coverage from SAFE-tier rows alone** (ESPN/Roster Management System, the league's own system — SAFE rows also exist in eight other seasons, 2013, 2016, 2018, 2019, 2020, 2021, 2022 and 2023, none of which reach full-32 on SAFE rows alone, per `DATA_AUDIT.md` §5); **the other seven covered seasons are REVIEW** — 2017 and 2022 Spotrac-derived, 2018/2019/2023/2024/2025 OverTheCap-derived — because reproducing a full 32-row table approaches reproducing a compiler's arrangement. **If counsel withholds REVIEW tier, Cap+ ships on two seasons, one of them (2014) near content-free.** Where coverage is partial (2013, 2016, 2020, 2021) the whole season is blank, not just the unlisted teams: standardizing a season in which only the five worst offenders are observed would rate 2013 Oakland as average (BT §3). And an in-house derivation is not an escape hatch — the sourcing audit tested it and concluded "do not ship derived dead money" (overwritten contract schedules, invisible restructures, no transaction dates). Our only options are dated press snapshots with citations, or a paid OTC/Spotrac license.

## 6. Judge panel

- **Face validity (A=2, B=4, C=5).** C's denominator is the only honest one in the set; C's algebra as written is unshippable. B does not merely ignore dead money — it *rewards* it in 9 seasons of 9 (within-season correlation between dead-money share and B's bonus over performance runs +0.245 to +0.571). Recommends the total-cost denominator, positive numerator, **and a dead-dollar multiplier λ≈1.5–2.0**.
- **Fan interpretability (A=2, B=5, C=8).** Only C passes the one-sentence-on-air test, and its denominator is the only one a reader can check from outside. Requires the positive numerator, one snapshot date per season printed beside every value, a denominator floor so unspent cap earns no credit, and explicit blanks rather than bridges.
- **Statistical robustness (A=2, B=6, C=3).** Scores C low *as specified*, rates the repaired form ~6.5 as "the acceptable fallback," and prefers a regression form with a pooled published coefficient. Blocks on: one date per season, bounded leverage (2016 CLE and 2022 CHI each carry ~30% of the leverage in B's own fit), and publishing the adjustment's near-zero persistence.

**All three converge on four things:** total-cost denominator, repaired algebra, one measurement date per season, nine seasons with honest blanks. They diverge on the algebraic form and on how hard to hit dead money.

## 7. RECOMMENDATION

**Ship the panel's converged hybrid — Cap+ (Total-Cost), dead dollars counted at 1.5×.**

```
Cap+ = (100 + 15 × P) ÷ R
R    = team cost ÷ league-average cost, floored at the season's 25th percentile
cost = (cap charged to rostered players + 1.5 × dead money) ÷ league cap
```

All 32 teams read from one snapshot date per season; season mean exactly 100; one pooled divisor so 1 SD ≈ 15 across the window. Nine seasons only.

**Why.** It is the only construction in the evidence where the brief's mechanism actually works: the total-cost denominator is 62.0 points harsher than cash on 2022 CHI, 44.0 on 2022 ATL, 37.3 on 2023 LA, and 34.3 points kinder to 2023 SF (BT §8) — the gap lands precisely where the product needs it. It produces the most credible all-time top and bottom fifteen in the backtest (BT §11), it moves teams 2.23 rank places on average [new] rather than 0.30, and it tells the Chiefs story a fan believes: **#3 in 2019, #2 in 2022, #6 in 2023, #16 by 2025** [new], where cash-based A and B stay flat-elite throughout (BT §7.2).

**What you are signing.** (1) The formula above. (2) **λ = 1.5 as a published economic claim** — "a dollar of dead cap costs us half again what a live dollar does, because it buys no player and blocks a roster spot" — not a tuning knob. (3) **The floor rule**: no credit for cap you never spent, at the season's 25th percentile, applied to all 32 teams every season (this is what puts the 0-16 Browns 32nd; the unfloored rate metric had them 23rd — BT §7). (4) **Nine seasons, four explicit blanks, 2014 and 2019 badged provisional.** (5) The 1999–2012 labeling in §4.

**The honest failure behind the clean sniff column.** The brief's requirement that 2022 Atlanta "rate poorly" **passes only because we chose λ=1.5**. Read at one honest date with λ=1, Atlanta lands 19th — better than its 24th-place performance rank — and the requirement fails [new]. Two of three judges said the right response is to drop the requirement; one said to own the multiplier. I recommend owning it, publishing that one sentence, and printing the λ=1 numbers beside it in the methodology. If we will not defend λ in public, the honest alternative is λ=1 and formally striking "famous cap disasters rate poorly" from the brief. What we must not do is leave λ unstated and let the algebra pick it. Two related disclosures ship on day one: **2024 Denver is a non-event and that is correct** ($85.2M against a $50.3M league median, cap consumption exactly the 2024 median — publish the median next to the number), and **Cap+ cannot see mortgaged future cap**, so all-in teams are flattered: "Cap+ measures the cap you consumed this year, not the cap you borrowed against."

**Conditions — none optional:**

1. **Legal sign-off on the REVIEW-tier tables** (2017, 2018, 2019, 2022, 2023, 2024, 2025). Without it Cap+ covers 2014–2015 only. Existential; resolve first.
2. **A committed recurring source** for next year's table, or an explicit page statement that figures are transcribed from dated press compilations with per-row citations.
3. **Every value carries its snapshot date and stage**, and no dead-money or cap-consumed level is ever plotted as a connected series across seasons — the same 32 teams read $155.2M in March 2018 and $348.5M in July 2018, a 2.2× swing from date alone.
4. **Publish the weighted cost and the plain cap-consumed percentage side by side.** At λ=1.5, 44.1% of team-seasons exceed 1.00 [new], so the weighted figure is a cost index and must never be labelled "% of cap used."
5. **The recommended build now ships in the repo — RESOLVED 2026-07-25.** Raised because `audit/capplus_backtest.py` shipped only C-pos at λ=1 with no floor. λ=1.5, the 25th-percentile floor and the same-stage snapshot rule are now implemented in that script and the backtest has been re-run: see BT §15 for the reproducible tables, and `capplus_rec` / `capplus_rec_lam10` / `capplus_rec_lam20` plus the R components (`cost_rec`, `cost_floor`, `R_rec`, `dm_rec_asof_date`) in `data/marts/capplus_candidates.csv`. Every [new] figure above reproduces from the script — all ten sniff values within 0.05 index points, every rank exact, all §3.2 diagnostics to the printed precision — with the single λ=1.0 correction recorded there.
6. **Frame Cap+ as single-season resource accounting**, never "well-run front office," and publish the adjustment's +0.158 year-over-year persistence ourselves.


---

## 8. REOPENED — 2026-10-10

**For:** Rey · **Trigger:** your question whether teams with a high-performing QB on a rookie
contract "basically always have an edge" in Cap+. **Decision asked of you:** §8.5.
Reproduces from `python -m etl.pipeline --mart capplus_context`; every figure below is in the
build's printed stats and `data/marts/manifest.json` → `checks.capplus_context`.

### 8.1 The hypothesis, measured

Starting QB = most offensive snaps (416 of 416 team-seasons resolve by snaps). Rookie window =
drafted, still on the draft-year contract, ≤ 4 seasons after the draft. 100 of the 288 Cap+
team-seasons are rookie-window.

| | n | mean Cap+ | mean Team Rating | mean QB-timing points |
|---|---:|---:|---:|---:|
| Rookie-window QB | 100 | 98.0 | 97.4 | **+2.8** |
| Veteran-deal QB | 188 | 101.1 | 101.4 | −1.5 |

Rookie-window teams are *below* average on Cap+ because they are below average on the field.
Replacing the starter's cap number with the season's median starter moves them +2.8 points —
a fifth of one SD. The 2019 Chiefs move **−2.4** (they were floored: cost below the 25th
percentile earns no further credit, so a cheap QB bought them nothing Cap+ could see). Within a
season, corr(Cap+, QB cap share) is **positive** every year (+0.12 to +0.45): expensive QBs are
expensive because they are good, and the good outweighs the expensive at the team-total level.

**Verdict on the hypothesis: not supported.** The sniff table did use rookie-QB champions as
targets (§3.1), but the formula does not reward them for being cheap; it rewards them for
winning.

### 8.2 What the measurement exposed instead

| | value |
|---|---:|
| corr(Cap+, Team Rating), 288 team-seasons | **0.950** |
| mean \|Cap+ rank − performance rank\| | 2.23 places |
| within-season SD of `R_rec` (the denominator) | 0.048 |
| within-season SD of `perf_index ÷ 100` (the numerator) | 0.148 |

Every team spends roughly the cap; the floor removes the bottom quartile's variance; dead money
at λ = 1.5 is the only term that moves the denominator. **Cap+ is Team Rating with a small
cost adjustment.** That is a legitimate descriptive number — "what this season's wins cost" —
but the product's framing ("was it worth it?") reads as a judgment of front-office skill, and
the formula cannot support that reading.

Where the money *does* vary between teams, within a season:

| measure | SD (share of league cap) | corr with Team Rating |
|---|---:|---:|
| cap consumed (what Cap+ sees) | 0.055 | +0.27 |
| cash paid | 0.120 | +0.27 |
| **prorated bonus charged to future caps** | **0.158** | +0.28 |

The mortgage also carries a faint "pay later" signal: corr(mortgage share, next-season change
in Team Rating) = −0.12. §7 already conceded that "Cap+ cannot see mortgaged future cap, so
all-in teams are flattered." The mortgage is now measured.

### 8.3 The candidate: Cap+ (obligation)

`cost = (cap charged to rostered players + 1.5 × dead money + α × future mortgage) ÷ league cap`,
floored at the 25th percentile and calibrated exactly like Cap+.

| α | SD(R) | corr with Team Rating | mean rank shift vs performance | corr with mortgage |
|---:|---:|---:|---:|---:|
| 0 (= Cap+) | 0.048 | 0.950 | 2.23 | +0.26 |
| 0.25 | 0.056 | 0.934 | 2.72 | +0.07 |
| **0.5** | **0.073** | **0.889** | **3.60** | **−0.09** |
| 1.0 | 0.104 | 0.794 | 5.01 | −0.30 |

2025, α = 0.5: LA #2 → **#1** (Stafford, 20% of a cap mortgaged), HOU #7 → #4, LAC #8 → #5;
**BUF #3 → #16** (92% of a cap already charged to future seasons), KC #16 → #22, SF #23 → #27,
DAL #20 → #25. The Chiefs' arc becomes #3 (2022) → #7 → #11 → #22 — the bill arriving.

Caveats that ship with it: flat-proration estimate; blind to void years and to restructures not
yet signed; 504 of 32,105 player-season rows have no `contract_years` and contribute zero
(counted per team-season in `mortgage_rows_unknown`).

### 8.4 What ships now, unconditionally

`capplus_context` (SPEC §7.13): starting QB, rookie window, QB-neutral Cap+, the two-term
decomposition, stratum rank, cash share, the mortgage in dollars and as a share of cap, and
`capplus_obligation` at α = 0.5 **as a candidate column**. `capplus_official` is byte-identical.
`METHODOLOGY.md` states the 0.95 correlation and what Cap+ is and is not.

### 8.5 Decision

1. **Approve α = 0.5 and promote `capplus_obligation` to the flagship** (recommended), keeping
   Cap+ as the "this season only" companion the way `cap_consumed_rec` sits beside `cost_rec`; or
2. keep Cap+ as the flagship and render the obligation index as a labelled second column; or
3. send α back.

Not rendering a 0.95-correlated performance ranking as an economics verdict is the one thing
this memo asks you not to choose.

---

## 9. Second reopen — 2026-10-10 rulings

**Ruled by Rey, 2026-10-10** (`DECISIONS.md` 109–114). §7's formula stands with one constant
changed and one input swapped; §8.5's question is answered by retiring the candidate. Reproduces
from `python -m etl.pipeline --mart capplus_official --mart capplus_context`; every figure below
is in the build's printed stats and `data/marts/manifest.json` → `checks.capplus`.

```
Cap+ = (100 + 15 × P) ÷ R
R    = team cost ÷ league-average cost, floored at the season's 25th percentile
cost = (cap charged to rostered players + dead money) ÷ league cap
P    = equal-weight within-season z of win %, point diff/game, opponent-adjusted EPA margin/play
```

### 9.1 The four rulings

1. **λ = 1.0.** Dead money counts once. At λ > 1 a dead dollar is charged twice: once in cost
   and again through the weaker roster it bought. 1.5 was chosen to make "2022 Atlanta rates
   poorly" pass (§7); **that requirement is struck.** Atlanta is now 20th, against 24th on the
   field. With λ = 1 the cost index *is* cap consumed: `cost_rec == cap_consumed_rec`, asserted.
   λ = 1.5 and 2.0 publish beside it in the methodology.
2. **P reads opponent-adjusted EPA** (`epa_margin_per_play_adj`). Team Rating moves for all 861
   team-seasons: corr 0.997 with the raw build, mean shift 1.0 point, 0.66 rank places.
3. **Cap+ (obligation) is retired.** Cap is accrual, cash is cash, and the mortgage is the
   reconciling item between them: cash paid ahead of the cap it will be charged to. Folding it into
   a cap-based cost mixed bases. The two honest lenses are cap per win and cash per win; the
   mortgage publishes beside them as the bridge.
4. **The four blank seasons are filled.** 2013 ships as a measured full-32 table (Houston Press,
   2013-03-18, Spotrac-derived), badged `provisional` with its own sentence: *"published one week
   into the league year; understates the final figure."* 2016, 2020 and 2021 ship from the
   validated estimate (`audit/findings_deadmoney_estimate.md`), badged `estimated`: 8, 11 and 10
   published teams, the rest modeled with an 80% range. **Calibration uses the ten measured
   seasons only**; the estimated seasons are divided by the same pooled SD (their own pooled SD
   comes out 14.7).

The July evidence record, `capplus_candidates.csv`, is frozen and no longer reproduced
(DECISIONS 114). Coverage is now **416 of 416 Tier 2 team-seasons**.

### 9.2 Sniff table — old vs new

Index value and rank in season. "Old" is the July build (§3.1: λ = 1.5, raw EPA, nine seasons).
"New" was frozen as the regression guard (`etl/capplus.SNIFF`, tolerance 0.05 points, exact rank)
and was re-frozen on 2026-10-11 after the upstream contracts refresh; §9.5 has those values.

| Case | Old | New | Field rank | Dead money |
|---|---:|---:|---:|---:|
| 2023 SF | 133.9 (#1) | **135.4 (#1)** | #2 | $17.2M |
| 2022 CHI | 77.2 (#31) | **77.3 (#30)** | #31 | $57.6M |
| 2024 DEN | 104.4 (#13) | **111.8 (#10)** | #9 | $85.2M |
| 2014 NE | 118.4 (#3) | **121.6 (#3)** | #4 | $8.5M |
| 2017 PHI | 114.7 (#7) | **117.7 (#5)** | #1 | $14.0M |
| 2017 CLE | 72.9 (#32) | **71.6 (#32)** | #32 | $11.5M |
| 2022 ATL | 89.5 (#27) | **96.2 (#20)** | #24 | $63.2M |
| 2019 KC | 122.6 (#3) | **125.5 (#2)** | #5 | $0.9M |
| 2025 NO | 85.7 (#27) | **93.1 (#23)** | #23 | $107.8M |
| 2023 LA | 95.2 (#20) | **107.5 (#10)** | #9 | $74.2M |
| 2016 NO | blank | **104.1 (#13)** · estimated | #17 | $37.9M published |
| 2020 CAR | blank | **87.5 (#24)** · estimated | #23 | $48.0M published |
| 2021 PHI | blank | **105.7 (#13)** · estimated | #13 | $50.0M published |

The big dead-money teams move most, as they should when the double charge comes off: Atlanta,
New Orleans 2025, the 2023 Rams and the 2024 Broncos now sit within a place or two of their
field rank. The Browns stay 32nd (the floor, not λ, puts them there).

### 9.3 Diagnostics

| | July build (288) | 2026-10-10 build (416) |
|---|---:|---:|
| corr(Cap+, Team Rating) | 0.950 | **0.965** (0.961 on the ten measured seasons) |
| mean \|Cap+ rank − field rank\| | 2.23 | **1.87** (1.92 measured) |
| team-seasons with cost > 1.00 | 44.1% | **12.5%** (cost = cap consumed) |
| year-over-year persistence of the cost adjustment | +0.158 | **+0.071** |
| pooled within-season SD, estimated seasons | — | 14.7 (measured fixed at 15.0) |

Against the July build, on the 288 shared team-seasons, Cap+ correlates 0.981 and moves teams
1.5 rank places on average (max 10). Most of that is λ: with raw EPA and λ = 1 the move is 1.3
places; with adjusted EPA and λ = 1.5 it is 0.7.

The honest consequence: **Cap+ is now even closer to Team Rating.** λ = 1.5 was the term that
pulled them apart, and it pulled them apart by charging dead money twice. §8.2's reading stands
and is stronger: Cap+ is "what this season's wins cost," a descriptive number, not a
front-office grade.

**Arcs** (rank in season, 2013 → 2025; 2016, 2020, 2021 estimated):

| Team | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23 | 24 | 25 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| KC | 14 | 11 | 6 | 4 | 10 | 2 | 2 | 8 | 2 | 3 | 7 | 7 | 18 |
| SF | 3 | 17 | 29 | 30 | 18 | 31 | 11 | 19 | 10 | 1 | 1 | 18 | 19 |
| BUF | 16 | 16 | 12 | 14 | 16 | 24 | 7 | 9 | 3 | 2 | 6 | 4 | 4 |
| PHI | 11 | 12 | 28 | 19 | 5 | 13 | 9 | 26 | 13 | 4 | 18 | 2 | 8 |

The Chiefs' §7 story survives — #2 in 2019, #3 in 2022, falling to #18 by 2025.

**All-time top 10:** 2019 BAL 140.2, 2023 SF 135.4, 2014 SEA 132.9, 2022 SF 132.4, 2016 NE 132.4
(estimated), 2024 DET 132.3, 2022 BUF 130.0, 2013 CAR 130.0 (provisional), 2017 MIN 129.8,
2025 SEA 129.4.

**All-time bottom 10:** 2023 CAR 65.7, 2016 CLE 67.5 (estimated), 2025 LV 68.0, 2016 LA 70.2
(estimated), 2018 ARI 70.9, 2016 SF 71.2 (estimated), 2021 JAX 71.2 (estimated), 2025 NYJ 71.4,
2017 CLE 71.6, 2020 JAX 72.6 (estimated).

Estimated seasons hold 1 of the top 10 and 5 of the bottom 10. The estimate does not put them
there: all five bottom entries are 30th–32nd on the field (2016 CLE 1-15, LA 4-12, SF 2-14; 2020
JAX 1-15; 2021 JAX 3-14), and four of the five sit on the cost floor, where dead money cannot
move them. Cleveland 2016 and Jacksonville 2020 are published figures, not modeled.

### 9.4 The rookie-QB finding at the new build (`capplus_context`)

Now over 416 team-seasons: 146 rookie-window, 270 veteran. Rookie-window teams average 97.8 on
Cap+ and 97.4 on Team Rating; QB-timing points average **+3.2** (veterans −1.7). Still about a
fifth of one SD. The 2019 Chiefs score −1.4 (floored, as before). Within each season,
corr(Cap+, QB cap share) runs +0.10 to +0.42. §8.1's verdict stands.

### 9.5 Upstream contracts refresh 2026-10-11

The nflverse contracts release changed after the July read (`DECISIONS.md` 115): `cols` became
`season_history`, 167 player-seasons were backfilled (+$94.9M, mostly 2013–2015), and Tom Brady's
TB 2023 $35.104M Route-R charge was withdrawn. That charge was also inside TB 2023's $75.32M
dead-money reading, so the July read counted it twice; TB 2023 moves 85.1 → 98.8 (#27 → #19).
League rostered cap moves +0.09% over 13 seasons; 2013 most (+1.2%), 2023 −0.6% (Brady).
11 of 13 sniff cases moved past the 0.05 tolerance; **every rank held**. Re-frozen:

| Case | 2026-10-10 | 2026-10-11 |
|---|---:|---:|
| 2023 SF | 135.4 (#1) | **135.0 (#1)** |
| 2022 CHI | 77.3 (#30) | **77.2 (#30)** |
| 2024 DEN | 111.8 (#10) | **111.9 (#10)** |
| 2014 NE | 121.6 (#3) | **122.0 (#3)** |
| 2017 PHI | 117.7 (#5) | **117.9 (#5)** |
| 2017 CLE | 71.6 (#32) | **71.5 (#32)** |
| 2022 ATL | 96.2 (#20) | 96.2 (#20) |
| 2019 KC | 125.5 (#2) | **125.6 (#2)** |
| 2025 NO | 93.1 (#23) | **93.0 (#23)** |
| 2023 LA | 107.5 (#10) | **107.0 (#10)** |
| 2016 NO | 104.1 (#13) | **104.3 (#13)** |
| 2020 CAR | 87.5 (#24) | **87.4 (#24)** |
| 2021 PHI | 105.7 (#13) | 105.7 (#13) |

Across all 416 team-seasons: 36 values move more than 0.5 points (19 of them in 2013), 7 more than
2, 46 ranks change (max 8 places); corr with the 10-10 build 0.998. §9.3 diagnostics at the
refresh: corr(Cap+, Team Rating) 0.966 (0.963 measured), mean |rank shift| 1.87 (1.91 measured),
cost > 1.00 still 12.5%, estimated-season pooled SD 14.8. §9.4: rookie-window 97.8 Cap+ / 97.4
Team Rating, QB-timing +3.2 (veterans −1.8). All-time top 10 and bottom 10 keep their members; only
adjacent pairs swap (2014 SEA/2022 SF, 2016 NE/2024 DET, 2013 CAR/2022 BUF, 2016 SF/2021 JAX).
