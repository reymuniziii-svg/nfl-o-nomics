# Estimated Dead Money for the Four Blank Seasons: Findings

2026-10-10. Module: `etl/deadmoney_estimate.py`. Outputs (staging only): `data/curated/staging/dead_money_estimated.csv` (128 rows), `dead_money_estimated_2013_model.csv` (32 rows). New press readings are staged in `dead_money_candidates_blank_seasons.csv`. Reproduce with `python3 -m etl.deadmoney_estimate --report`. The run is deterministic.

## Verdict
**Ship 2016, 2020 and 2021 badged "estimated". Ship 2013 as a measured table.**

The two deciding numbers are the median and p90 absolute Cap+ rank shift. They come from leave-one-season-out validation at λ = 1.0, over all 32 teams, simulating each blank season's real anchors and neighbor seasons.

| Season | Median abs rank (≤ 1.5) | p90 abs rank (≤ 4) | Result |
|---|---:|---:|---|
| 2016 | 1 | 3 | PASS |
| 2020 | 1 | 2 | PASS |
| 2021 | 1 | 3 | PASS |
| 2013 model fallback | 1 | 3 | PASS (not recommended, §6) |

Caveats:
1. **The bar mostly measures the anchors.** Anchors plus a season-median fill also passes in 3 of 4 scenarios; it fails 2016 (median 2). The model earns its place on Cap+ points: p90 absolute change 5.3→3.9 (2013), 5.7→4.1 (2016), 3.7→3.0 (2020), 4.7→3.4 (2021). Without anchors, crude fills fail: dead money set to zero gives median 2, p90 7; a season median with no anchors gives median 2, p90 5.3.
2. **Per-team dollars are rough.** Median APE is 24–41%; median absolute error is $3.4–4.0M (1.5–2.2% of the cap). Never render an estimated dollar figure without its range.
3. **At λ = 1.5,** 2016, 2020 and 2021 pass; the 2013 fallback fails (p90 5).

## 1. Readings resolution
The reference date is the dated list leaving the most usable real readings, ties to the later date. Readings from other dates are used as-is only inside the bounds implied by the reference list's top-k/bottom-k. Anything else stays an alternate reading, per SPEC §7.5.

| Season | Reference | Used as-is | Estimated | Alternates (not used) |
|---|---|---|---:|---|
| 2013 | 2013-03-18 Houston Press, full 32 | 32 | 0 | NFP 12-06 top 5 |
| 2016 | 2016-10-05, top 4 + bottom 4 | 8 | 24 | NO 03-15 |
| 2020 | 2020-06-02, top 5 | 5 + 6 at 03-25 (ATL, BAL, DEN, DET, MIN, PHI) | 21 | NYJ $53.6M season-final (above the $22M bound); other-date CAR/JAX/MIA/NE rows |
| 2021 | 2021-09-06, top 5 + bottom 5 | 10 | 22 | MIA $0.49M 03-10 (below the Sept floor of $4.29M); March IND/LAC/LA |

June beat March for 2020 (11 usable readings vs 10): a March reference would contradict LA's June figure of $34M.

## 2. Method
- **Target:** the 288 same-stage readings, as within-season z of log dead money.
- **Position model:** numpy ridge on within-season z-scores of the features in §3, plus adjacent-season z. One fit per neighbor pattern: 2013 next, 2016 both, 2020 prior, 2021 next. The penalty is chosen by an inner leave-one-season-out loop.
- **Season level (μ, σ):** from the reference list, matched to expected z order statistics from the training seasons. Top plus bottom lists are solved by least squares. With a top list only, σ = 6.71 − 0.33 × mean log top-5.
- **Constraints:** estimates are clipped to the list bounds and to `unaccounted_vs_adjusted` (an upper bound per SPEC §7.3).
- **Interval:** q10–q90 of each scenario's leave-one-season-out log residuals.
- **Validation:** the held-out season is blanked everywhere. 2020's six other-date readings are simulated as true ranks 6–11.
- **Cap+:** `capplus_backtest.recommended_columns`, imported rather than re-derived. At λ = 1.5 it reproduces `capplus_official` to 8e-6 with exact ranks.

## 3. Features
Pooled over three anchor shapes, natural neighbors.

| Set | log RMSE | WAPE | mean Cap+ pts | p90 pts | mean rank shift |
|---|---:|---:|---:|---:|---:|
| anchors + median fill | 0.751 | 0.362 | 2.153 | 4.788 | 1.366 |
| full candidate set | 0.714 | 0.270 | 1.561 | 3.584 | 1.049 |
| − z_unacc | 0.719 | 0.272 | 1.545 | 3.766 | 1.095 |
| − z_capsh | 0.729 | 0.289 | 1.657 | 3.769 | 1.016 |
| − z_sep | 0.713 | 0.268 | 1.553 | 3.576 | 1.058 |
| − z_sep_any | 0.711 | 0.265 | 1.519 | 3.449 | 1.028 |
| − z_nleft | 0.713 | 0.269 | 1.553 | 3.633 | 1.072 |
| − nb | 0.730 | 0.284 | 1.613 | 3.489 | 1.065 |
| **SHIPPED: unacc + capsh + sep + nb** | **0.712** | **0.266** | **1.534** | **3.568** | **1.037** |

**Kept:**
- **Unaccounted cap and cap-used share.** This is the accounting identity: adjusted cap = rostered cap + dead money + cap space. Within-season correlation is 0.84–0.92 in late-season tables and 0.25–0.46 preseason.
- **Adjacent-season z.** Dropping it costs the most RMSE of any single feature.
- **Separation proxy.** Marginal: it changes RMSE by about 0.002. Its coefficient is stable and positive (+0.09 to +0.16), and dropping it would be defensible.

**Dropped:**
- **`z_sep_any` and `z_nleft`:** dominated by `z_sep`.
- **Derived M1/M3 from the Appendix D prototype:** no gain in exploration, and using them would add a dependency on the prototype's staging output.
- **Route R:** zero valid reads in the blank seasons. The 2020 NE/NYG hits (Cannon, Chung, Solder) are hypothesized COVID opt-outs.
- **League cap growth:** constant within a season, so it cannot move a team's position; the published list pins the level directly.

## 4. Leave-one-season-out errors (estimated teams only)

| Scenario | Seasons | Teams | MAPE med | MAPE mean | WAPE | Med abs err | % cap | log RMSE | Fill MAPE/WAPE |
|---|---:|---:|---|---|---|---|---|---|---|
| 2013 fallback (next nb, top 5) | 6 | 162 | 41% | 259% | 39% | $4.0M | 2.2% | 0.98 | 48%/46% |
| 2016 (both nb, top 4 + bottom 4) | 3 | 72 | 24% | 28% | 24% | $3.6M | 1.8% | 0.37 | 35%/35% |
| 2020 (prior nb, top 5 + 6) | 6 | 126 | 36% | 91% | 32% | $3.4M | 1.5% | 0.76 | 41%/37% |
| 2021 (next nb, top 5 + bottom 5) | 6 | 132 | 30% | 39% | 28% | $3.5M | 2.0% | 0.60 | 39%/35% |

Mean APE is inflated by sub-$1M preseason teams; WAPE is the dollar-weighted figure to trust.

Per held-out season (median/p90/max rank shift; ✗ marks a failure):
- **2013 fallback:** 2014 1/1.9/4, 2017 1/2/5, 2018 1/2/6, 2022 1/4/10, 2023 1/3/4, 2024 1/3.9/6.
- **2016:** 2018 1/2/6, 2023 0.5/2.9/4, 2024 1/3/5.
- **2020:** 2015 1/2.9/6, 2018 1/2/6, 2019 0/1/3, 2023 0.5/2/3, 2024 1/2/5, 2025 1/1.9/2.
- **2021:** 2014 1/1.9/4, 2017 1/2/4, 2018 1/2/6, **2022 1/5.9/10 ✗**, 2023 1/2.9/6, 2024 1/3/5.

## 5. Cap+ sensitivity
Median/p90/max rank shift, then p90 Cap+ points.

| Scenario | Model λ=1.0 | Est. teams only | λ=1.5 | Anchors + median fill |
|---|---|---|---|---|
| 2013 fb | 1/3/10; 3.90 | 1/3/10; 4.31 | 1/5/10; 5.06 ✗ | 1/4/12; 5.28 |
| 2016 | 1/3/6; 4.11 | 1/3/6; 4.33 | 1/4/8; 5.62 | 2/4/7; 5.74 ✗ |
| 2020 | 1/2/6; 3.02 | 1/2.5/6; 3.27 | 1/4/7; 3.95 | 1/2/6; 3.68 |
| 2021 | 1/3/10; 3.39 | 1/3.9/10; 3.92 | 1/3.9/8; 4.90 | 1/3/10; 4.72 |

Adding the estimated seasons to the pooled-SD calibration would move the 288 published values by up to 0.46 points (median 0.12). Calibrate the blanks with the nine measured seasons' spread instead.

## 6. 2013: option (a) vs (b)
Rank shifts against (a): (b1) NFP top 5 + Houston as-is gives median 1, p90 2, max 6; (b2) the model as of 12-06 gives 1/3.9/5.

The 2018 comparison (March vs July full tables) measures the stage cost:
- Early table in place of the later one: 1.5/4/5. Log correlation 0.53; the median team's charge rose 2.29×.
- Later top 5 + early rest: 1/3/4.
- Model: 1/2/6.

**Recommendation: (a).** It is measured, satisfies the same-stage rule, matches the 2014/2019 precedent, and needs no "estimated" badge. The 2018 data suggests (b) would track a later stage better, but all options sit within the bar of each other.

- **Badge text:** "published one week into the league year; understates the final figure." The current provisional text is false for 03-18, and the date rule would label it `preseason`.
- **Licensing:** Spotrac-credited (review tier). Under safe-only, fall back to (b2); the whole estimate also withdraws, because it trains on full-tier data.

## 7. Top 10 per season ($M; "pub" = published)
- **2016:** NO 37.89 pub, CLE 31.11 pub, PHI 22.50 pub, ATL 21.44 pub, DET 18.56 (13.54–21.44), SF 17.46, BAL 14.89, WAS 13.11, TEN 11.83, CHI 11.28.
- **2020:** CAR 48.00 pub, JAX 37.00 pub, LA 34.00 pub, NE 24.00 pub, NYJ 22.00 (10.30–22.00), MIA 22.00 pub, DET 20.40 pub 03-25, MIN 20.40 pub 03-25, WAS 18.19, BAL 16.80 pub 03-25.
- **2021:** PHI 50.04 pub, DET 48.05 pub, CAR 45.63 pub, LA 39.47 pub, NO 35.76 pub, HOU 34.33 (20.94–35.76), JAX 21.27, PIT 20.10, ATL 19.66 (12.00–29.58), LV 18.67.
- **2013 (a):** LV 26.60, JAX 24.01, KC 13.33, ARI 12.41, ATL 11.51, …
- **2013 (b2):** NFP five, then CAR 17.52, BUF 16.46, CLE 14.63, MIA 11.11, DAL 10.15.

**Ledger check (2021):**
- Wentz $33.82M ≤ PHI $50.04M; Goff $24.70M ≤ LA $39.47M; Brees $11.15M ≤ NO $35.76M.
- Julio Jones's 2021 portion is $7.75M; ATL's estimate is $19.66M and its whole range (from $12.00M) clears it.
- The ledger has no charges in 2013, 2016 or 2020. No published figure exceeds its unaccounted-cap bound.
- NYJ 2020 sits at the $22M ceiling against a $53.6M season-final, consistent with large moves after June (hypothesis).

## 8. Known limits
- 2016 is validated on 3 seasons in its exact pattern; the all-nine variant also passes (1/3).
- 2020's March-dated figures likely understate June slightly: teams with both dates moved about 1.1× (median).
- Estimates are on the median scale with no smearing.
- Interval coverage is 80% by construction and not independently checked.
- Candidate URLs need license-tier mapping before shipping.
