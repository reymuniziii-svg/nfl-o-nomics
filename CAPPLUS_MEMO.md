# Cap+ — formula approval memo (gate #1)

**For:** Rey (product owner) · **2026-07-25** · **Decision:** approve one formula, or send it back.

Sources: `audit/findings_capplus_backtest.md` (**BT §n**), `audit/findings_contracts.md`, `audit/findings_deadmoney_sourcing.md`, `data/marts/capplus_candidates.csv`. Numbers marked **[new]** were recomputed 2026-07-25 from the candidates mart plus `data/curated/dead_money_team_season.csv`; they are **not yet in the backtest script** (see condition 5).

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
| 1.0 ("a dollar is a dollar") | **+0.26 places — no punishment at all** | 96 (#19) | 94 (#23) | 106 (#11) | 113 (#10) | 134 (#1) |
| **1.5 (recommended)** | **−3.22 places / −5.5 points** | 89 (#27) | 86 (#27) | 95 (#20) | 104 (#13) | 134 (#1) |
| 2.0 | −5.33 places / −9.2 points | 83 (#30) | 80 (#28) | 87 (#27) | **99 (#20)** | 135 (#1) |

At λ=1 the page says "dead money included" and dead money does nothing. At λ=2 we start punishing charges that were ordinary for their season — 2024 Denver drops 11 places despite consuming exactly the 2024 median share of the cap. λ=1.5 puts the famous disasters where they belong and leaves Denver near where it belongs.

### 3.3 The honest statement of the window

Spend data starts in **2013**; before that the contracts file is a sample of notable contracts, not a roster (43 players per team in 2012 against a 53-man roster — contracts audit §3.1). Dead money exists only as **dated press snapshots**, with full-league tables for **nine seasons** (BT §9). Cap+ therefore covers **288 of 416 team-seasons (69.2%)**, and **eight of the twenty marquee sniff cases cannot be scored at all** — 2013 SEA, 2013 OAK, 2016 NE, 2016 CLE, 2020 KC, 2021 KC, 2021 LAR, 2021 NO. (BT §7.1 says "seven"; its own table marks 2013 OAK unscoreable too.) **The flagship case in the brief, 2013 Seattle, is one of the blanks.** Inside the nine, the 2014 and 2019 tables were published *before the league year opened* — median charge $4.0M and $3.4M against $50.3M in 2024 [new] — so those two ship badged **provisional**.

## 4. The 25-season question — 1999–2012 team pages

Nothing labelled Cap+. The Cap+ slot renders the literal sentence **"Not available — league-wide contract coverage begins in 2013"** — never a dash, never a blank, never a zero. Beside it the page shows **"Team Rating (performance only)"** in visibly different styling, with a hard visual break at 2013 in any franchise time series (BT §13.1). The four uncovered seasons inside the Cap+ era get the same treatment: **"Not available — no league-wide dead-money table was published for this season."** The scenario brackets in BT §9.1 are scenarios, not measurements, and **never ship as values**. We also reject the C-where-covered/B-elsewhere hybrid — it puts two metrics under one name, and they disagree violently (2023 LA: #14 on C-pos, **#1 on B**). Two rules that are easy to skip and expensive to skip: never call the fallback "Cap+ (performance only)" — to a reader that is still Cap+; and on the 2014–2025 overlap plot **both** lines, so the gap between Team Rating and Cap+ is visible before the Cap+ line stops. The honest bridge: *both are built from the identical performance composite; only the cap adjustment starts in 2013.*

## 5. Dead-money dependency

**Only the recommended candidate needs the curated dead-money data** — A and B are cash-only, which is exactly why they rate teardowns well. The input is `data/curated/dead_money_team_season.csv`: 370 dated snapshots transcribed from press compilations with per-row citations. Appendix A of the sourcing audit tiers them, and the tiering is the risk: **only 2014 and 2015 are SAFE** (ESPN/Roster Management System, the league's own system); **the other seven covered seasons are REVIEW** — 2017 and 2022 Spotrac-derived, 2018/2019/2023/2024/2025 OverTheCap-derived — because reproducing a full 32-row table approaches reproducing a compiler's arrangement. **If counsel withholds REVIEW tier, Cap+ ships on two seasons, one of them (2014) near content-free.** Where coverage is partial (2013, 2016, 2020, 2021) the whole season is blank, not just the unlisted teams: standardizing a season in which only the five worst offenders are observed would rate 2013 Oakland as average (BT §3). And an in-house derivation is not an escape hatch — the sourcing audit tested it and concluded "do not ship derived dead money" (overwritten contract schedules, invisible restructures, no transaction dates). Our only options are dated press snapshots with citations, or a paid OTC/Spotrac license.

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
5. **The recommended build is not in the repo yet.** `audit/capplus_backtest.py` ships C-pos at λ=1 with no floor; λ, the floor and the same-stage date rule must be added, the backtest re-run, and the numbers re-reviewed before anything renders.
6. **Frame Cap+ as single-season resource accounting**, never "well-run front office," and publish the adjustment's +0.158 year-over-year persistence ourselves.
