# Cap+ candidate backtest — findings

Scope: three candidate formulations of **Cap+** (performance per cap-normalized resource, indexed to 100 = league average, 1 SD ≈ 15), backtested on the audited spend-side window **2013–2025** (416 team-seasons), plus a **performance-only fallback** over **1999–2025** (861 team-seasons).

Reproduce with `python3.11 audit/capplus_backtest.py` (idempotent, no network). Outputs `data/marts/capplus_candidates.csv` and this file.

Reads and respects `audit/findings_contracts.md` (cap_used_total excludes dead money and biases in favour of cap-disaster teams; cash_spent_total is the best-behaved spend measure; unaccounted_vs_adjusted is an upper bound on dead money and is **not used anywhere in this backtest**) and `audit/findings_deadmoney_sourcing.md` (dead money exists only as differently-dated press snapshots).

## Bottom line up front

| Question | Verdict |
| --- | --- |
| Candidate A exactly as specified — `100 + 15·z(P / relative_cash)` | **BROKEN.** P is a signed z-score, so the ratio inverts for the 212 of 416 team-seasons with P<0: among those, corr(raw score, cash) = **+0.556** — a below-average team scores *higher* by spending more. |
| Candidate A subtraction form — `100 + 15·(zP − z_cash)` | **Well-defined, wrong weighting.** Imposes unit weight on thrift. Puts 2022 CHI (3-14, record dead money) at **115.1, 8th in the league**. |
| Candidate B — within-season OLS residual | **Best-behaved of the three as specified.** Adds real but modest information (mean abs. rank shift 2.2, corr 0.94 with P). Cash slope is positive in 13/13 seasons but reaches abs(t)>2 in only **6/13**. |
| Candidate C exactly as specified — same ratio, total-cost denominator | **BROKEN the same way, and it does not punish dead money.** 2022 CHI's raw score *improves* from −1.731 (pure performance) to −1.675 because of its record dead money. |
| Does the total-cost denominator punish cap disasters at all? | **Yes — but only once the sign bug is repaired.** In the positive-anchored form, C is 62.0 points harsher than A on 2022 CHI, 44.0 on 2022 ATL, 37.3 on 2023 LA. The denominator is right; the algebra was wrong. |
| Is the cash denominator safe on its own? | **No.** corr(relative_cash, dead money / league cap) = **−0.358**. Cash spend inherits the same rostered-players-only bias as cap_used. The 10 lowest relative-cash team-seasons in the window are a roll-call of cap disasters. |
| Weight sensitivity (1/3-1/3-1/3 vs 0.5/0.25/0.25 vs 0.25/0.25/0.5) | **Immaterial.** corr ≥ 0.996 for every candidate, mean abs. rank shift ≤ 0.74 places, and **no sniff-table verdict changes**. The weight debate is not worth having. |
| Anything that would embarrass the product? | **Four things** — see §12. The worst: candidate A's positive-anchored form ranks the 3-14 2022 Bears **#1 in the league**, and the 'latest snapshot' dead-money rule manufactures roughly half of 2022 CHI/ATL's punishment. |

## 0. Method and conventions

- **Grain**: team-season, regular season only (both performance marts are REG-only).
- **Team codes**: `audit/team_codes.py` `normalize_team` on every input. Rams = `LA`, Chargers = `LAC`, Raiders = `LV` in all seasons, so *2013 OAK is keyed `(2013, LV)`* and *2021 LAR is keyed `(2021, LA)`*.
- **All SDs are sample SDs (ddof=1)**, including the within-season z-scores. Treating the 32-team league as a population instead would rescale everything by √(32/31) = 1.6% and change no ranking.
- **Calibration** (§4): every candidate is demeaned *within season* (so each season's mean is exactly 100.000) and then divided by one single **pooled within-season SD** computed across the whole window, `√(Σ(x−season mean)²/(N−S))`, so the pooled SD is exactly 15.000 and individual seasons are free to be tighter or wider. Per-season SDs are reported.
- **No per-case tuning.** Every formula is applied identically to all 416 team-seasons. No team, season or case is special-cased anywhere in `audit/capplus_backtest.py`.

## 1. Performance composite P

`P_raw = w1·z(win_pct) + w2·z(point_diff/game) + w3·z(epa_margin_per_play)`, each z taken **within season**; `P = z(P_raw)` within season, so P is a clean within-season z with mean 0 and SD 1 in every season. The pure-performance index used throughout as the baseline is `perf_index = 100 + 15·P`.

### 1.1 Correlation matrix of the three inputs

2013–2025 (n=416), pooled over within-season z-scores:

|  | z_win_pct | z_point_diff_pg | z_epa_margin |
| --- | ---: | ---: | ---: |
| z_win_pct | 1.000 | 0.911 | 0.880 |
| z_point_diff_pg | 0.911 | 1.000 | 0.969 |
| z_epa_margin | 0.880 | 0.969 | 1.000 |

1999–2025 (n=861):

|  | z_win_pct | z_point_diff_pg | z_epa_margin |
| --- | ---: | ---: | ---: |
| z_win_pct | 1.000 | 0.914 | 0.875 |
| z_point_diff_pg | 0.914 | 1.000 | 0.956 |
| z_epa_margin | 0.875 | 0.956 | 1.000 |

Per-season range: `win_pct↔point_diff` 0.870–0.947; `win_pct↔EPA` 0.794–0.932; `point_diff↔EPA` 0.832–0.986. The three inputs are near-collinear, which is why weighting barely matters (§10). The unstandardized blend has SD 0.954–0.982 across seasons — that season-to-season wobble is exactly what re-standardizing P removes.

Full per-season table:

| season | r_wpct_pdiff | r_wpct_epa | r_pdiff_epa | sd_P_raw |
| ---: | ---: | ---: | ---: | ---: |
| 1999 | 0.893 | 0.809 | 0.946 | 0.9601 |
| 2000 | 0.933 | 0.897 | 0.952 | 0.9755 |
| 2001 | 0.929 | 0.839 | 0.832 | 0.9545 |
| 2002 | 0.916 | 0.874 | 0.840 | 0.9581 |
| 2003 | 0.904 | 0.854 | 0.973 | 0.9697 |
| 2004 | 0.881 | 0.867 | 0.971 | 0.9683 |
| 2005 | 0.947 | 0.887 | 0.963 | 0.9772 |
| 2006 | 0.902 | 0.849 | 0.939 | 0.9650 |
| 2007 | 0.940 | 0.900 | 0.970 | 0.9787 |
| 2008 | 0.911 | 0.879 | 0.959 | 0.9717 |
| 2009 | 0.928 | 0.898 | 0.976 | 0.9777 |
| 2010 | 0.906 | 0.841 | 0.966 | 0.9676 |
| 2011 | 0.921 | 0.897 | 0.970 | 0.9761 |
| 2012 | 0.917 | 0.888 | 0.959 | 0.9734 |
| 2013 | 0.944 | 0.872 | 0.956 | 0.9743 |
| 2014 | 0.946 | 0.932 | 0.965 | 0.9824 |
| 2015 | 0.938 | 0.917 | 0.978 | 0.9812 |
| 2016 | 0.870 | 0.794 | 0.953 | 0.9564 |
| 2017 | 0.909 | 0.834 | 0.956 | 0.9660 |
| 2018 | 0.940 | 0.924 | 0.978 | 0.9822 |
| 2019 | 0.877 | 0.869 | 0.983 | 0.9694 |
| 2020 | 0.916 | 0.884 | 0.969 | 0.9741 |
| 2021 | 0.873 | 0.877 | 0.977 | 0.9691 |
| 2022 | 0.915 | 0.901 | 0.958 | 0.9746 |
| 2023 | 0.895 | 0.884 | 0.986 | 0.9735 |
| 2024 | 0.907 | 0.865 | 0.975 | 0.9715 |
| 2025 | 0.919 | 0.887 | 0.967 | 0.9745 |

## 2. Resource measures R

| Measure | Definition | Availability |
| --- | --- | --- |
| `cash_share` | `cash_spent_total / Σ league cash that season` | 416/416 |
| `relative_cash` | `cash_spent_total / league-average team cash` = `32 × cash_share` | 416/416 |
| `cap_consumed` | `(cap_used_total + dead_money) / league_cap` | 316/416 observed |
| `relative_cap_consumed` | `cap_consumed / league-average cap_consumed` | 288/416 calibrated |
| `cap_used_only` | `cap_used_total / league_cap` (reference only, never a denominator) | 416/416 |

`z(cash_share)` and `z(relative_cash)` are identical — one is 32× the other — so the subtraction form is unaffected by which is used.

### 2.1 Dispersion of each denominator, per season (coefficient of variation)

| season | cv_relative_cash | cv_cap_used_only | cv_cap_consumed |
| ---: | ---: | ---: | ---: |
| 2013 | 0.1635 | 0.1157 | -- |
| 2014 | 0.1077 | 0.0652 | 0.0610 |
| 2015 | 0.1045 | 0.0810 | 0.0394 |
| 2016 | 0.1094 | 0.0923 | -- |
| 2017 | 0.1062 | 0.1008 | 0.0782 |
| 2018 | 0.1396 | 0.0966 | 0.0607 |
| 2019 | 0.1026 | 0.0953 | 0.0721 |
| 2020 | 0.1254 | 0.1082 | -- |
| 2021 | 0.1227 | 0.0982 | -- |
| 2022 | 0.1616 | 0.1296 | 0.0566 |
| 2023 | 0.1306 | 0.1072 | 0.0648 |
| 2024 | 0.1322 | 0.1083 | 0.0353 |
| 2025 | 0.1095 | 0.1215 | 0.0438 |

**This table decides how much any rate candidate can move.** Cash disperses 2–3× as widely as total cap consumed (CV ≈ 0.11–0.16 vs 0.035–0.078), because adding dead money back to cap_used pushes teams *toward* each other: the teams with the least active cap are exactly the teams with the most dead money. A denominator with CV 0.04 cannot rerank much.

### 2.2 The total-cost denominator reconstructs cap utilization — a validation

| season | median_cap_used_only | median_cap_consumed | median_dead_money_M | min_cap_consumed | max_cap_consumed |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 2014 | 0.880 | 0.923 | 4.0 | 0.747 | 1.030 |
| 2015 | 0.874 | 0.979 | 14.3 | 0.887 | 1.050 |
| 2017 | 0.908 | 0.944 | 5.3 | 0.718 | 1.021 |
| 2018 | 0.890 | 0.955 | 8.8 | 0.759 | 1.054 |
| 2019 | 0.888 | 0.911 | 3.7 | 0.787 | 1.084 |
| 2022 | 0.867 | 0.951 | 19.1 | 0.817 | 1.061 |
| 2023 | 0.850 | 0.939 | 20.3 | 0.815 | 1.146 |
| 2024 | 0.770 | 0.979 | 50.3 | 0.870 | 1.008 |
| 2025 | 0.821 | 1.000 | 41.0 | 0.928 | 1.152 |

The contracts audit measured a structural 15–22% shortfall in `cap_used_total`. Adding the press-sourced dead money closes most of it: median utilization rises from 0.77–0.91 to 0.91–1.00. This is the single strongest argument for candidate C's denominator — it is the only one of the three that behaves like actual cap utilization.

### 2.3 The cash denominator is itself biased toward cap-disaster teams

Pooled over the 288 team-seasons with full dead-money coverage: `corr(relative_cash, dead money share)` = **-0.358**, `corr(cap_used_only, dead money share)` = **-0.774**, `corr(cap_consumed, dead money share)` = **+0.327**.

| season | r_relcash_dm | r_capused_dm | r_capconsumed_dm |
| ---: | ---: | ---: | ---: |
| 2014 | -0.242 | -0.323 | +0.246 |
| 2015 | -0.391 | -0.851 | -0.255 |
| 2017 | -0.495 | -0.618 | -0.260 |
| 2018 | -0.325 | -0.738 | -0.048 |
| 2019 | -0.342 | -0.608 | +0.133 |
| 2022 | -0.584 | -0.882 | +0.332 |
| 2023 | -0.550 | -0.770 | +0.373 |
| 2024 | -0.349 | -0.917 | +0.082 |
| 2025 | -0.524 | -0.904 | +0.263 |

The contracts audit warned that `cap_used_total` biases in favour of cap-disaster teams (−0.77 here, as low as −0.92 in 2024). **Cash is better but not clean: −0.36.** Money paid to a player who has been released is not in `cash_spent_total` either, so a team that ate a roster looks thrifty in cash exactly when it is in cap hell. Only `cap_consumed` reverses the sign (+0.33).

The ten lowest `relative_cash` team-seasons in the window, with what each candidate does with them:

| season | team | W-L | relative_cash | dead_money_M | perf_index | capplus_A | capplus_A_sub | capplus_A_pos | capplus_B |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2022 | CHI | 3-14 | 0.527 | 91.8 | 74.0 | 54.3 | 115.1 | 133.5 | 81.5 |
| 2022 | ATL | 7-10 | 0.665 | 87.6 | 92.3 | 89.9 | 119.8 | 132.1 | 97.8 |
| 2016 | CLE | 1-15 | 0.675 | 31.1 | 65.2 | 51.9 | 108.2 | 96.4 | 75.3 |
| 2020 | NYJ | 2-14 | 0.689 | -- | 70.7 | 60.6 | 106.7 | 101.4 | 79.7 |
| 2019 | MIA | 5-11 | 0.704 | 37.5 | 77.5 | 70.4 | 117.4 | 108.4 | 94.2 |
| 2013 | LV | 4-12 | 0.721 | 55.5 | 80.7 | 75.7 | 105.3 | 109.0 | 89.4 |
| 2013 | JAX | 4-12 | 0.722 | 34.1 | 72.3 | 64.7 | 98.2 | 98.7 | 80.4 |
| 2020 | JAX | 1-15 | 0.722 | 37.0 | 71.6 | 63.6 | 104.1 | 98.3 | 79.6 |
| 2023 | LA | 10-7 | 0.728 | 79.6 | 106.2 | 109.0 | 131.5 | 139.7 | 126.3 |
| 2025 | NO | 6-11 | 0.734 | 107.8 | 91.5 | 89.6 | 123.5 | 121.1 | 105.1 |

Under the subtraction and positive-anchored cash forms, **every one of these teams is rated at or above league average**, three of them above 130. A metric whose ten thriftiest team-seasons are the ten most notorious teardowns has the sign of its own thesis backwards.

## 3. Dead-money resolution and its coverage

Resolution rule used (per the brief): **latest `asof_date` per team-season**. Every stage actually used is recorded in `dm_asof_date` / `dm_asof_stage` / `dm_coverage` in the candidates CSV. Composition:

| season | dm_asof_stage | dm_asof_date | teams | season_dm_coverage |
| ---: | --- | --- | ---: | --- |
| 2013 | late_season | 2013-12-06 | 5 | partial |
| 2014 | preseason | 2014-02-18 | 32 | full32 |
| 2015 | midseason | 2015-10-28 | 32 | full32 |
| 2016 | midseason | 2016-10-05 | 8 | partial |
| 2017 | preseason | 2017-07-05 | 32 | full32 |
| 2018 | midseason | 2018-10-10 | 3 | full32 |
| 2018 | preseason | 2018-07-14 | 29 | full32 |
| 2019 | preseason | 2019-03-10 | 18 | full32 |
| 2019 | preseason | 2019-05-16 | 14 | full32 |
| 2020 | preseason | 2020-06-02 | 5 | partial |
| 2021 | preseason | 2021-09-06 | 10 | partial |
| 2022 | final | 2024-03-06 | 3 | full32 |
| 2022 | preseason | 2022-07-05 | 29 | full32 |
| 2023 | final | 2024-03-06 | 2 | full32 |
| 2023 | preseason | 2023-07-14 | 30 | full32 |
| 2024 | late_season | 2024-11-27 | 32 | full32 |
| 2025 | late_season | 2025-12-17 | 32 | full32 |

**Candidate C is calibrated only on the 288 team-seasons in the 9 full-32 seasons (2014, 2015, 2017, 2018, 2019, 2022, 2023, 2024, 2025).** Standardizing within a season where only the five worst offenders are observed would place those five around the mean of themselves — 2013 Oakland would come out *average*. The four partial seasons (2013, 2016, 2020, 2021) are handled as scenario brackets in §9 instead.

### 3.1 The 'latest snapshot' rule is not neutral — it manufactures punishment

Dead money accrues monotonically through a league year, and in four seasons the *latest* snapshot is a **leaders-only** article. Applying 'latest per team-season' then reads the worst offenders at a late date and everyone else at an early one — which is not a measurement, it is a selection effect:

| season | team | dm_latest_M | asof_latest | dm_same_stage_M | asof_same | C_pos_latest | C_pos_same_stage | swing |
| ---: | --- | ---: | --- | ---: | --- | ---: | ---: | ---: |
| 2018 | BUF | 53.7 | 2018-10-10 | 46.7 | 2018-07-14 | 89.5 | 93.0 | -3.5 |
| 2018 | NYG | 30.7 | 2018-10-10 | 21.1 | 2018-07-14 | 95.3 | 101.1 | -5.8 |
| 2019 | MIA | 37.5 | 2019-05-16 | 16.0 | 2019-03-10 | 90.3 | 103.0 | -12.7 |
| 2019 | NYG | 33.7 | 2019-05-16 | 9.7 | 2019-03-10 | 83.6 | 94.6 | -11.0 |
| 2019 | PIT | 26.6 | 2019-05-16 | 0.3 | 2019-03-10 | 86.2 | 97.0 | -10.8 |
| 2019 | BAL | 23.7 | 2019-05-16 | 7.7 | 2019-03-10 | 128.1 | 137.6 | -9.5 |
| 2022 | CHI | 91.8 | 2024-03-06 | 57.6 | 2022-07-05 | 71.5 | 84.6 | -13.1 |
| 2022 | ATL | 87.6 | 2024-03-06 | 63.2 | 2022-07-05 | 88.1 | 98.8 | -10.7 |
| 2022 | HOU | 81.3 | 2024-03-06 | 52.3 | 2022-07-05 | 67.5 | 76.7 | -9.2 |
| 2023 | LA | 79.6 | 2024-03-06 | 74.2 | 2023-07-14 | 102.3 | 104.9 | -2.6 |
| 2023 | TB | 79.6 | 2024-03-06 | 75.3 | 2023-07-14 | 83.2 | 84.2 | -1.0 |

| season | mean_abs_shift | max_abs_shift |
| ---: | ---: | ---: |
| 2014 | 0.24 | 0.69 |
| 2015 | 0.22 | 0.54 |
| 2017 | 0.24 | 0.58 |
| 2018 | 0.66 | 5.82 |
| 2019 | 3.88 | 12.69 |
| 2022 | 2.07 | 13.15 |
| 2023 | 0.33 | 2.56 |
| 2024 | 0.25 | 0.77 |
| 2025 | 0.25 | 0.65 |

**2022 CHI loses 13.2 points and 2022 ATL 10.7 points purely to the resolution rule**, and the whole 2019 season shifts by a mean 3.9 points. Under a same-date reading of 2022, Atlanta lands at 98.8 — *league average* — and the brief's requirement that it 'rate poorly' fails. Both readings are shipped: `capplus_C_stagecons` / `capplus_C_pos_stagecons` in the CSV.

## 4. The candidates, and calibration

| Candidate | Raw score before calibration |
| --- | --- |
| **A** Cash Rate Index (as specified) | `P / relative_cash` |
| **A-sub** subtraction form | `zP − z(cash_share)` |
| **A-pos** positive-anchored repair | `(100 + 15·P) / relative_cash` |
| **B** Efficiency Over Expected | residual of within-season OLS `P ~ relative_cash`, standardized within season |
| **C** Total-Cost Rate (as specified) | `P / relative_cap_consumed` |
| **C-sub** | `zP − z(cap_consumed)` |
| **C-pos** positive-anchored repair | `(100 + 15·P) / relative_cap_consumed` |

The positive-anchored forms are **not a fourth candidate**. They are the minimal general repair to A and C: replacing the signed numerator `P` with the strictly positive `100 + 15·P` (the same index the product already publishes) makes the ratio monotone decreasing in the resource at every level of performance, which is what a rate metric has to be. Nothing else changes.

### 4.1 Calibration: mean and SD achieved, per season

| season | capplus_A | capplus_A_sub | capplus_A_pos | capplus_B | capplus_C | capplus_C_sub | capplus_C_pos |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2013 | 15.56 | 14.17 | 15.25 | 15.00 | -- | -- | -- |
| 2014 | 14.74 | 17.07 | 16.64 | 15.00 | 15.27 | 14.64 | 15.16 |
| 2015 | 14.14 | 14.02 | 12.67 | 15.00 | 14.73 | 11.79 | 13.26 |
| 2016 | 15.98 | 15.56 | 14.38 | 15.00 | -- | -- | -- |
| 2017 | 14.47 | 14.70 | 13.43 | 15.00 | 15.33 | 12.98 | 13.80 |
| 2018 | 14.78 | 17.59 | 18.71 | 15.00 | 15.06 | 16.39 | 16.30 |
| 2019 | 14.73 | 13.88 | 12.59 | 15.00 | 14.88 | 14.72 | 15.12 |
| 2020 | 15.66 | 15.38 | 14.80 | 15.00 | -- | -- | -- |
| 2021 | 14.42 | 12.02 | 11.71 | 15.00 | -- | -- | -- |
| 2022 | 16.18 | 16.23 | 18.89 | 15.00 | 14.64 | 15.79 | 15.13 |
| 2023 | 14.32 | 12.39 | 13.28 | 15.00 | 15.14 | 14.84 | 15.13 |
| 2024 | 14.40 | 16.58 | 16.25 | 15.00 | 15.02 | 16.12 | 15.25 |
| 2025 | 15.43 | 14.26 | 14.35 | 15.00 | 14.91 | 16.98 | 15.63 |

Season means are exactly 100 by construction (max deviation across all season × candidate cells: 1.42e-14). Pooled within-season SD is exactly 15.000 for all seven. Per-season SDs range 11.71–18.89, widest for the cash-subtraction and positive-anchored forms (2018 and 2022, the two highest-cash-dispersion seasons).

**Candidate B is the exception and it is a design flaw**: its residuals are standardized *within* each season before pooling, so every season's SD is exactly 15.000. B therefore cannot express the statement 'efficiency was unusually tightly bunched in 2019' — that information is destroyed. A/C keep it.

### 4.2 Candidate B's within-season regression, n=32 every year

| season | n | slope_b | se_b | t_b | r2 | resid_sd |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2013 | 32 | 2.275 | 1.037 | 2.19 | 0.138 | 0.928 |
| 2014 | 32 | 0.822 | 1.689 | 0.49 | 0.008 | 0.996 |
| 2015 | 32 | 3.683 | 1.613 | 2.28 | 0.148 | 0.923 |
| 2016 | 32 | 2.221 | 1.619 | 1.37 | 0.059 | 0.970 |
| 2017 | 32 | 3.052 | 1.626 | 1.88 | 0.105 | 0.946 |
| 2018 | 32 | 0.231 | 1.307 | 0.18 | 0.001 | 1.000 |
| 2019 | 32 | 3.878 | 1.633 | 2.37 | 0.158 | 0.917 |
| 2020 | 32 | 2.077 | 1.406 | 1.48 | 0.068 | 0.966 |
| 2021 | 32 | 4.465 | 1.244 | 3.59 | 0.300 | 0.836 |
| 2022 | 32 | 1.090 | 1.112 | 0.98 | 0.031 | 0.984 |
| 2023 | 32 | 3.982 | 1.195 | 3.33 | 0.270 | 0.854 |
| 2024 | 32 | 1.059 | 1.367 | 0.77 | 0.020 | 0.990 |
| 2025 | 32 | 3.322 | 1.554 | 2.14 | 0.132 | 0.931 |

The cash slope is **positive in all 13 seasons** — spending more is associated with performing better — but reaches |t| > 2 in only **6 of 13**, with R² from 0.001 (2018) to 0.300 (2021). With n=32 and one regressor the slope's standard error is 1.1–1.7 in P-units per unit of relative cash, so the fitted 'expectation' B subtracts is itself noisy, and it is re-estimated from scratch every season. Two consequences: (i) B's spend adjustment is weak *by construction* — it shrinks toward zero exactly when the season's data is uninformative, which is the statistically honest behaviour and the reason B never produces an absurd sniff result; (ii) the year-to-year jumps in the slope (0.23 in 2018 to 4.47 in 2021) mean the same spend profile is priced very differently in adjacent seasons. A pooled or shrunk slope would fix (ii) at the cost of the within-season-mean-100 guarantee holding only approximately.

## 5. Diagnostics

| candidate | n | corr_win_pct | corr_P | mean_abs_rank_shift | max_rank_shift | pct_shift_ge5 | mean_abs_pt_shift | n_moved_ge_15pts | yoy_autocorr | skew | exc_kurt | min | max | n_outside_55_145 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A ratio (as specified) | 416 | 0.942 | 0.988 | 0.60 | 5 | 0.2 | 1.44 | 1 | 0.430 | -0.315 | -0.207 | 51.9 | 133.5 | 2 |
| A subtraction | 416 | 0.587 | 0.593 | 6.53 | 26 | 53.4 | 10.45 | 103 | 0.116 | 0.094 | -0.456 | 64.2 | 137.2 | 0 |
| A positive-anchored (repair) | 416 | 0.662 | 0.675 | 5.58 | 30 | 46.6 | 9.16 | 77 | 0.161 | 0.426 | -0.235 | 69.4 | 145.4 | 1 |
| B efficiency over expected | 416 | 0.906 | 0.942 | 2.25 | 13 | 15.1 | 3.58 | 6 | 0.337 | 0.096 | -0.706 | 65.0 | 138.5 | 0 |
| C ratio (as specified) | 288 | 0.954 | 0.998 | 0.30 | 3 | 0.0 | 0.59 | 0 | 0.399 | 0.008 | -0.685 | 62.7 | 132.5 | 0 |
| C subtraction | 288 | 0.590 | 0.628 | 5.70 | 24 | 46.5 | 9.57 | 57 | 0.125 | 0.079 | 0.742 | 57.6 | 149.6 | 3 |
| C positive-anchored (repair) | 288 | 0.876 | 0.921 | 2.37 | 16 | 16.3 | 4.09 | 9 | 0.319 | 0.277 | -0.218 | 65.7 | 145.9 | 1 |

| candidate | n | corr_win_pct | corr_P | mean_abs_rank_shift | max_rank_shift | pct_shift_ge5 | mean_abs_pt_shift | n_moved_ge_15pts | yoy_autocorr | skew | exc_kurt | min | max | n_outside_55_145 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| perf_index (baseline) | 416 | 0.953 | 1.000 | 0.00 | 0 | 0.0 | 0.00 | 0 | 0.423 | -0.020 | -0.726 | 65.2 | 134.1 | 0 |

Reading this table:

- **Does Cap+ add information beyond performance?** `mean_abs_rank_shift` is the mean absolute change in within-season rank versus ranking teams purely by P. **A moves teams 0.60 places on average and C moves them 0.30** — with a maximum of 5 and 3 places respectively, and *zero* team-seasons in which C moves a team 5+ places. As specified, A and C are the performance index with rounding noise (mean absolute index move 1.44 and 0.59 points; 1 of 416 and 0 of 288 move a full SD). The subtraction forms move teams 5.7–6.5 places and rerank ~50% of the league by 5+ spots. B sits in between at 2.2 places.
- **Year-over-year autocorrelation.** Pure performance persists at 0.42. A (0.43) and C (0.40) simply inherit that — more evidence they are performance in disguise. B persists at 0.34. The subtraction forms drop to **0.12–0.13**: cap efficiency measured that way is almost memoryless. That is a genuine finding about football, not a bug, but it is a product problem — a team-page metric that a franchise cannot repeat is hard to build a narrative on, and it invites the reading that the metric is mostly noise.
- **Distribution shape.** All seven are near-symmetric (|skew| ≤ 0.43) and platykurtic (excess kurtosis −0.7 to +0.7), i.e. no fat tails. The 55–145 band (±3 SD) holds for all but 7 team-seasons across all candidates; the worst offender is C-sub with 3.

### 5.1 Biggest movers versus the pure-performance ranking

**A ratio (as specified)** — six biggest gains, six biggest losses (`rank_gain` = performance rank minus candidate rank; positive = the spend adjustment helped):

| season | team | W-L | perf_index | rank_perf | capplus | rank_capplus | rank_gain | rel_cash |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2015 | IND | 8-8 | 91.7 | 23 | 93.2 | 19 | 4 | 1.053 |
| 2024 | CLE | 3-14 | 76.6 | 32 | 80.8 | 28 | 4 | 1.132 |
| 2014 | NE | 12-4 | 119.8 | 4 | 122.5 | 1 | 3 | 0.836 |
| 2017 | NO | 11-5 | 118.2 | 7 | 119.0 | 4 | 3 | 0.929 |
| 2014 | CLE | 7-9 | 95.3 | 22 | 96.2 | 20 | 2 | 1.128 |
| 2014 | DAL | 12-4 | 117.9 | 5 | 120.2 | 3 | 2 | 0.840 |
| 2018 | BUF | 6-10 | 88.6 | 24 | 85.6 | 29 | -5 | 0.744 |
| 2020 | NO | 12-4 | 120.6 | 2 | 117.0 | 6 | -4 | 1.189 |
| 2015 | DET | 7-9 | 93.5 | 17 | 92.8 | 20 | -3 | 0.791 |
| 2015 | LA | 7-9 | 92.0 | 19 | 92.0 | 22 | -3 | 0.878 |
| 2024 | LV | 4-13 | 81.8 | 28 | 77.8 | 31 | -3 | 0.763 |
| 2014 | BAL | 10-6 | 112.6 | 6 | 110.6 | 8 | -2 | 1.134 |

**A positive-anchored** — six biggest gains, six biggest losses (`rank_gain` = performance rank minus candidate rank; positive = the spend adjustment helped):

| season | team | W-L | perf_index | rank_perf | capplus | rank_capplus | rank_gain | rel_cash |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2022 | CHI | 3-14 | 74.0 | 31 | 133.5 | 1 | 30 | 0.527 |
| 2019 | MIA | 5-11 | 77.5 | 30 | 108.4 | 8 | 22 | 0.704 |
| 2022 | ATL | 7-10 | 92.3 | 24 | 132.1 | 3 | 21 | 0.665 |
| 2013 | LV | 4-12 | 80.7 | 29 | 109.0 | 9 | 20 | 0.721 |
| 2025 | NO | 6-11 | 91.5 | 23 | 121.1 | 3 | 20 | 0.734 |
| 2020 | NYJ | 2-14 | 70.7 | 32 | 101.4 | 14 | 18 | 0.689 |
| 2021 | TB | 13-4 | 123.8 | 1 | 95.5 | 24 | -23 | 1.299 |
| 2021 | DAL | 12-5 | 121.5 | 3 | 96.3 | 23 | -20 | 1.261 |
| 2023 | CLE | 11-6 | 108.4 | 9 | 88.1 | 28 | -19 | 1.242 |
| 2013 | KC | 11-5 | 115.0 | 7 | 90.5 | 25 | -18 | 1.266 |
| 2013 | DET | 7-9 | 100.2 | 14 | 76.2 | 31 | -17 | 1.344 |
| 2013 | GB | 8-7 | 99.7 | 16 | 74.7 | 32 | -16 | 1.369 |

**B efficiency over expected** — six biggest gains, six biggest losses (`rank_gain` = performance rank minus candidate rank; positive = the spend adjustment helped):

| season | team | W-L | perf_index | rank_perf | capplus | rank_capplus | rank_gain | rel_cash |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2021 | DEN | 7-10 | 98.1 | 20 | 105.7 | 10 | 10 | 0.900 |
| 2025 | NO | 6-11 | 91.5 | 23 | 105.1 | 13 | 10 | 0.734 |
| 2015 | SF | 5-11 | 80.4 | 30 | 92.0 | 21 | 9 | 0.780 |
| 2019 | MIA | 5-11 | 77.5 | 30 | 94.2 | 21 | 9 | 0.704 |
| 2021 | PIT | 9-7 | 95.7 | 23 | 103.3 | 14 | 9 | 0.896 |
| 2023 | LA | 10-7 | 106.2 | 10 | 126.3 | 1 | 9 | 0.728 |
| 2023 | CLE | 11-6 | 108.4 | 9 | 92.9 | 22 | -13 | 1.242 |
| 2013 | DET | 7-9 | 100.2 | 14 | 87.6 | 26 | -12 | 1.344 |
| 2013 | GB | 8-7 | 99.7 | 16 | 86.1 | 28 | -12 | 1.369 |
| 2021 | TB | 13-4 | 123.8 | 1 | 104.5 | 13 | -12 | 1.299 |
| 2019 | ATL | 7-9 | 95.8 | 19 | 81.1 | 30 | -11 | 1.227 |
| 2015 | BUF | 8-8 | 101.8 | 14 | 90.1 | 24 | -10 | 1.197 |

**C positive-anchored** — six biggest gains, six biggest losses (`rank_gain` = performance rank minus candidate rank; positive = the spend adjustment helped):

| season | team | W-L | perf_index | rank_perf | capplus | rank_capplus | rank_gain | rel_cash |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2017 | SF | 6-10 | 91.5 | 21 | 117.6 | 5 | 16 | 0.900 |
| 2014 | NYJ | 4-12 | 82.2 | 27 | 100.3 | 14 | 13 | 0.803 |
| 2022 | CAR | 7-10 | 93.9 | 23 | 106.8 | 10 | 13 | 0.946 |
| 2022 | CLE | 7-10 | 96.2 | 20 | 111.4 | 7 | 13 | 1.175 |
| 2022 | LV | 6-11 | 91.1 | 25 | 100.3 | 15 | 10 | 1.002 |
| 2017 | CLE | 0-16 | 69.9 | 32 | 88.7 | 23 | 9 | 0.963 |
| 2023 | TB | 9-8 | 102.4 | 14 | 83.2 | 29 | -15 | 0.876 |
| 2022 | JAX | 9-8 | 107.6 | 7 | 95.9 | 20 | -13 | 1.130 |
| 2025 | SF | 12-5 | 109.1 | 9 | 94.7 | 22 | -13 | 1.061 |
| 2017 | WAS | 7-9 | 94.4 | 18 | 85.2 | 28 | -10 | 1.079 |
| 2019 | PIT | 8-8 | 97.9 | 16 | 86.2 | 26 | -10 | 1.110 |
| 2019 | SF | 13-3 | 124.5 | 2 | 105.2 | 11 | -9 | 1.111 |

The A-positive-anchored block is the exhibit to remember: **2022 CHI gains 30 rank places, from 31st to 1st.**

## 6. The central defect: the ratio forms invert for below-average teams

`P` is a z-score, so it is negative for roughly half the league every season. Dividing a negative number by a larger denominator makes it *less* negative. The specified formula therefore says: **a below-average team improves its Cap+ by spending more, and is punished for spending less.**

| form | n_P_positive | corr_score_resource_P_pos | n_P_negative | corr_score_resource_P_neg |
| --- | ---: | ---: | ---: | ---: |
| A — relative_cash | 204 | -0.087 | 212 | +0.556 |
| C — relative_cap_consumed | 140 | -0.151 | 148 | +0.286 |

Above-average teams behave correctly (negative correlation: more resource, lower score). Below-average teams behave backwards, strongly.

### 6.1 Verifying the brief's requirement on candidate C directly

The brief asks for empirical confirmation that a team with huge dead money gets a larger denominator and therefore a *lower* Cap+. The denominator half is true. The Cap+ half is **false** for exactly the teams in question:

| season | team | P | dead_money_M | rel_cap_consumed | raw_C_ratio | cost_vs_league | effect | direction |
| ---: | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| 2022 | CHI | -1.731 | 91.8 | 1.033 | -1.675 | above avg | score improved | **INVERTED** |
| 2022 | ATL | -0.511 | 87.6 | 1.046 | -0.489 | above avg | score improved | **INVERTED** |
| 2022 | HOU | -1.747 | 81.3 | 1.091 | -1.601 | above avg | score improved | **INVERTED** |
| 2024 | DEN | 0.832 | 85.2 | 1.010 | 0.824 | above avg | score reduced | correct |
| 2023 | TB | 0.159 | 79.6 | 1.228 | 0.130 | above avg | score reduced | correct |
| 2023 | SF | 1.834 | 17.2 | 0.873 | 2.102 | below avg | score improved | correct |

`direction` = *correct* when an above-average total cost lowers the raw score (or a below-average cost raises it), *INVERTED* otherwise.

Chicago's record $91.8M dead charge moves its raw score from −1.731 to −1.675 — it makes the 3-14 Bears look **better**. Atlanta and Houston likewise. The only teams the denominator correctly punishes are the ones that were already good. **Candidate C as literally specified does not do the job the brief assigns it.** It still *ranks* the Bears 32nd, but only because performance dominates the formula — the dead-money term is pushing the wrong way underneath.

The positive-anchored repair fixes this completely and generally: with a strictly positive numerator, ∂score/∂R < 0 everywhere. Under C-pos, Chicago 2022 falls from a 74.0 performance index to **71.5**, and Houston from 73.8 to **67.5**.

## 7. Sniff table (product-brief hard requirement)

Index value and league rank (rank 1 = best in that season). `rel_cash` = team cash ÷ league-average team cash; `dead_money_M` is the resolved snapshot in $M.

| case | WL | rel_cash | dead_money_M | perf | A | A_sub | A_pos | B | C | C_sub | C_pos |
| --- | --- | ---: | ---: | --- | --- | --- | --- | --- | --- | --- | --- |
| 2013 SEA -- champs, rookie-deal QB | 13-3 | 1.070 | -- | 128.4 (#2) | 126.0 (#1) | 118.5 (#2) | 116.2 (#5) | 128.0 (#2) | -- | -- | -- |
| 2014 NE -- efficient champion | 12-4 | 0.836 | 8.5 | 119.8 (#4) | 122.5 (#1) | 135.9 (#1) | 137.2 (#1) | 121.9 (#2) | 119.6 (#4) | 113.9 (#7) | 118.5 (#5) |
| 2016 NE -- efficient champion | 14-2 | 0.932 | -- | 130.7 (#1) | 131.6 (#1) | 133.7 (#1) | 134.8 (#1) | 134.0 (#1) | -- | -- | -- |
| 2018 NE -- efficient champion | 11-5 | 0.952 | 4.0 | 116.5 (#6) | 116.4 (#5) | 118.2 (#9) | 118.0 (#9) | 116.7 (#6) | 116.3 (#6) | 112.4 (#9) | 115.7 (#7) |
| 2017 PHI -- champs, injured starter QB | 13-3 | 1.068 | 14.0 | 125.2 (#1) | 122.8 (#1) | 113.1 (#9) | 114.7 (#7) | 123.4 (#1) | 123.3 (#2) | 105.6 (#11) | 114.2 (#7) |
| 2023 SF -- cheap QB, NFC champs | 12-5 | 1.119 | 17.2 | 127.5 (#2) | 124.1 (#1) | 111.7 (#5) | 111.6 (#5) | 123.9 (#3) | 131.3 (#1) | 145.4 (#1) | 145.9 (#1) |
| 2019 KC -- SB win, rookie-deal Mahomes | 12-4 | 0.956 | 0.9 | 118.4 (#5) | 118.8 (#4) | 121.0 (#3) | 120.7 (#3) | 122.9 (#3) | 121.3 (#3) | 137.6 (#1) | 137.2 (#1) |
| 2020 KC -- SB loss, mega-deal signed | 14-2 | 0.918 | -- | 120.2 (#4) | 121.4 (#2) | 125.3 (#1) | 126.3 (#2) | 123.6 (#1) | -- | -- | -- |
| 2021 KC -- mega-deal era | 12-5 | 1.007 | -- | 116.3 (#5) | 116.2 (#5) | 113.0 (#5) | 113.2 (#4) | 118.9 (#3) | -- | -- | -- |
| 2022 KC -- SB win, mega-deal era | 14-3 | 0.968 | 8.0 | 127.3 (#3) | 127.4 (#2) | 125.5 (#4) | 125.6 (#6) | 128.3 (#2) | 127.0 (#3) | 121.4 (#4) | 126.9 (#3) |
| 2023 KC -- SB win, mega-deal era | 11-6 | 1.009 | 7.7 | 113.2 (#7) | 113.3 (#7) | 110.3 (#8) | 110.1 (#8) | 114.9 (#6) | 113.1 (#7) | 107.1 (#8) | 111.0 (#7) |
| 2021 LAR -- all-in veteran roster, won SB | 12-5 | 0.927 | 39.5 | 114.3 (#7) | 115.5 (#6) | 119.6 (#1) | 120.1 (#1) | 123.0 (#2) | -- | -- | -- |
| 2013 OAK -- record 43.6% of adj cap dead | 4-12 | 0.721 | 55.5 | 80.7 (#29) | 75.7 (#30) | 105.3 (#12) | 109.0 (#9) | 89.4 (#23) | -- | -- | -- |
| 2022 CHI -- record dead money, bad team | 3-14 | 0.527 | 91.8 | 74.0 (#31) | 54.3 (#32) | 115.1 (#8) | 133.5 (#1) | 81.5 (#28) | 75.3 (#32) | 72.2 (#31) | 71.5 (#31) |
| 2022 ATL -- record dead money, bad team | 7-10 | 0.665 | 87.6 | 92.3 (#24) | 89.9 (#26) | 119.8 (#6) | 132.1 (#3) | 97.8 (#17) | 92.9 (#24) | 84.3 (#28) | 88.1 (#28) |
| 2024 DEN -- record individual dead money, 10-7 | 10-7 | 0.886 | 85.2 | 112.5 (#9) | 113.6 (#7) | 121.4 (#3) | 122.5 (#3) | 114.4 (#6) | 112.2 (#9) | 106.5 (#11) | 111.3 (#10) |
| 2017 CLE -- 0-16 | 0-16 | 0.963 | 11.5 | 69.9 (#32) | 71.0 (#32) | 79.0 (#31) | 75.3 (#32) | 70.0 (#32) | 62.7 (#32) | 108.6 (#8) | 88.7 (#23) |
| 2016 CLE -- 1-15 | 1-15 | 0.675 | 31.1 | 65.2 (#32) | 51.9 (#32) | 108.2 (#10) | 96.4 (#22) | 75.3 (#30) | -- | -- | -- |
| 2021 NO -- post-Brees cap hell | 9-8 | 1.020 | 35.8 | 103.6 (#15) | 104.3 (#15) | 101.0 (#16) | 101.0 (#15) | 102.7 (#15) | -- | -- | -- |
| 2022 NO -- post-Brees cap hell | 7-10 | 1.210 | 33.3 | 97.5 (#18) | 98.8 (#17) | 81.4 (#30) | 80.7 (#29) | 94.0 (#20) | 97.6 (#18) | 99.9 (#14) | 98.2 (#18) |

### 7.1 Pass / fail against the brief's stated expectation

Bands used: *elite* = top 5, *high* = top 10, *poor* = 24th or worse, *bottom* = 29th or worse, *report* = the brief asks for an honest reading, not a threshold.

| case | expectation | A | A_sub | A_pos | B | C | C_sub | C_pos |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2013 SEA -- champs, rookie-deal QB | elite | PASS | PASS | PASS | PASS | n/a | n/a | n/a |
| 2014 NE -- efficient champion | high | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 2016 NE -- efficient champion | high | PASS | PASS | PASS | PASS | n/a | n/a | n/a |
| 2018 NE -- efficient champion | high | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 2017 PHI -- champs, injured starter QB | high | PASS | PASS | PASS | PASS | PASS | **FAIL** | PASS |
| 2023 SF -- cheap QB, NFC champs | elite | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| 2019 KC -- SB win, rookie-deal Mahomes | report | — | — | — | — | — | — | — |
| 2020 KC -- SB loss, mega-deal signed | report | — | — | — | — | n/a | n/a | n/a |
| 2021 KC -- mega-deal era | report | — | — | — | — | n/a | n/a | n/a |
| 2022 KC -- SB win, mega-deal era | report | — | — | — | — | — | — | — |
| 2023 KC -- SB win, mega-deal era | report | — | — | — | — | — | — | — |
| 2021 LAR -- all-in veteran roster, won SB | report | — | — | — | — | n/a | n/a | n/a |
| 2013 OAK -- record 43.6% of adj cap dead | poor | PASS | **FAIL** | **FAIL** | **FAIL** | n/a | n/a | n/a |
| 2022 CHI -- record dead money, bad team | poor | PASS | **FAIL** | **FAIL** | PASS | PASS | PASS | PASS |
| 2022 ATL -- record dead money, bad team | poor | PASS | **FAIL** | **FAIL** | **FAIL** | PASS | PASS | PASS |
| 2024 DEN -- record individual dead money, 10-7 | report | — | — | — | — | — | — | — |
| 2017 CLE -- 0-16 | bottom | PASS | PASS | PASS | PASS | PASS | **FAIL** | **FAIL** |
| 2016 CLE -- 1-15 | bottom | PASS | **FAIL** | **FAIL** | PASS | n/a | n/a | n/a |
| 2021 NO -- post-Brees cap hell | report | — | — | — | — | n/a | n/a | n/a |
| 2022 NO -- post-Brees cap hell | report | — | — | — | — | — | — | — |

Failure counts across the 11 cases with an asserted band: **A_sub: 4**, **A_pos: 4**, **C_sub: 2**, **B: 2**, **C_pos: 1**; candidates not listed had zero failures on the cases they could score.

Three caveats on reading that count. **(i)** Two of the failures are marginal: B puts 2013 OAK 23rd against a 24th-or-worse band, and C-sub puts 2017 PHI 11th against a top-10 band. **(ii)** `n/a` is not a pass. Candidate C cannot score **7 of the 20 cases at all** — 2013 SEA, 2016 NE, 2020 KC, 2021 KC, 2021 LAR, 2016 CLE, 2021 NO — because their seasons have no full-league dead-money table. A candidate that cannot score the brief's own flagship case is not automatically the winner of a failure count. **(iii)** A and the ratio form of C pass almost everything, but they pass by being the performance index (§5): a sniff table cannot distinguish a working spend adjustment from no spend adjustment, which is why §5's rank-shift diagnostics carry more weight here than the pass/fail column.

### 7.2 Case readings

- **2013 SEA** — elite everywhere it can be scored (A #1, B #2). No dead-money coverage in 2013 beyond the top five, so **candidate C cannot score the single most important sniff case at all**. Seven of the twenty cases are unscoreable by C.
- **2014 / 2016 / 2018 NE** — all top-10 on every candidate; 2014 NE is #1 on A, A-sub and A-pos (they spent 16% below league-average cash).
- **2017 PHI** — #1 on A and B, but only 9th on A-sub and 7th on C-pos: Philadelphia spent *above* average (rel_cash 1.068), so any candidate that weights thrift heavily demotes a champion. This is the cleanest illustration that the subtraction form's implicit unit weight is a choice, not a neutral default.
- **2023 SF** — the best case for candidate C: #1 under both C forms at 145.4 / 145.9, the highest C-pos value in the entire window, on a genuinely cheap roster (cap_consumed 0.815, the third-lowest of any full-coverage season). A rates them #1 as well. Unambiguous pass.
- **2019–2023 KC** — under A: 118.8, 121.4, 116.2, 127.4, 113.3. Under B: 122.9, 123.6, 118.9, 128.3, 114.9. **The arc is flat-elite, not declining.** The metric's answer is that Kansas City never became a big spender: relative cash was 0.956, 0.918, 1.007, 0.968, 1.009 across those five years. That is a true fact about the Chiefs and a defensible story, but anyone expecting Cap+ to show the rookie-deal era outshining the mega-deal era will not find it here — cap efficiency at the team level did not move when Mahomes' cap number did.
- **2021 LAR** — the instructive case, and it is instructive in an uncomfortable direction. The 'all-in' Rams show up in this data as **cheap**: relative cash 0.927 (below average) and cap_used_only 0.755 (second-lowest in the league). They land at 115.5 on A and **123.0, second in the league, on B**. 'All-in' in the NFL means mortgaging *future* cap through bonus proration and traded picks, and none of that is visible in a single-season spend measure. Any Cap+ built on one season of spend will systematically flatter the borrow-from-tomorrow strategy.
- **2013 OAK** — 75.7 (#30) on A, 89.4 (#23) on B. The record 43.6%-of-cap dead year cannot be scored by candidate C directly (2013 is a top-5-only season); the scenario bracket in §9 puts C-pos at **71.6–82.5**, comfortably poor. But note A gets the *right answer for the wrong reason*: Oakland scores badly on A because it spent little cash, and it spent little cash *because* of the dead money.
- **2022 CHI / 2022 ATL** — the pivotal cases. C (both repaired forms) rates them 31st and 28th: pass. **A-sub rates Chicago 8th and Atlanta 6th; A-pos rates Chicago 1st and Atlanta 3rd.** And per §3.1, roughly 13 and 11 points of C's punishment is an artifact of reading these two teams at a later date than the other 29 teams.
- **2024 DEN** — the honest answer is *nothing happened*. Denver's record $85.2M charge sat on top of the league's lowest active cap (0.645), and `cap_consumed` came out at **0.979 — exactly the 2024 league median**. Every candidate returns roughly the performance index (perf 112.5 #9; A 113.6 #7; B 114.4 #6; C 112.2 #9; C-pos 111.3 #10). The reason is context: 2024 was the record dead-money season league-wide, with a **median team charge of $50.3M**, so $85.2M was only 1.7× median. This is the best story in the backtest — the metric correctly refuses to punish a team for a charge that was ordinary by the standards of its own season — but it will disappoint anyone who expects the famous number to produce a famous score.
- **2017 CLE (0-16)** — 32nd on A, B and C-ratio: pass. But **C-sub rates them 8th (108.6) and C-pos 23rd (88.7)**. The 0-16 Browns consumed 0.726 of the cap, the second-lowest figure in the whole window. A pure rate metric gives credit for resources not consumed, and a team that neither spends nor wins is, arithmetically, efficient. This is the deepest unresolved design question in the metric — see §12.
- **2016 CLE (1-15)** — 32nd on A, 30th on B: pass. The C bracket (§9) is 58.2–62.2 on the ratio form but **71.7–79.8 on C-pos, above their 65.2 performance index** — again, credit for a low denominator.
- **2021 NO / 2022 NO** — post-Brees New Orleans lands mid-pack: 2021 at 104.3 (#15) on A and 102.7 (#15) on B; 2022 at 98.8 (#17) and 94.0 (#20). Their cap hell was a *future*-cap problem executed through restructures, and restructuring converts cap into cash paid earlier — 2022 NO actually has the window's 5th-highest relative cash (1.210), which drags them down on the thrift-weighted forms (A-sub 81.4, #30) and props them up on nothing. Mid-pack is the honest answer and it is not an embarrassing one, but it is not the story a reader expects from the phrase 'cap hell'.

## 8. A versus C on the 288 team-seasons where both exist

| form | corr_A_C | mean_abs_diff | p90_abs_diff | max_abs_diff |
| --- | ---: | ---: | ---: | ---: |
| ratio (as specified) | 0.989 | 1.29 | 2.90 | 21.05 |
| subtraction | 0.517 | 11.05 | 24.24 | 54.09 |
| positive-anchored | 0.691 | 8.61 | 18.52 | 62.03 |

As specified, A and C are the same metric (corr 0.989, mean gap 1.29 points) because both are ~pure performance. **The two candidates only become different once the sign bug is repaired** — and then the difference is exactly where the product needs it.

**Where C is harsher than A** (the total-cost denominator withdrawing the false credit that low cash hands a teardown):

| season | team | W-L | relative_cash | dead_money_M | cap_consumed | capplus_A_pos | capplus_C_pos | delta_C_minus_A |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2022 | CHI | 3-14 | 0.527 | 91.8 | 0.980 | 133.5 | 71.5 | -62.0 |
| 2022 | ATL | 7-10 | 0.665 | 87.6 | 0.992 | 132.1 | 88.1 | -44.0 |
| 2023 | LA | 10-7 | 0.728 | 79.6 | 0.967 | 139.7 | 102.3 | -37.3 |
| 2023 | TB | 9-8 | 0.876 | 79.6 | 1.146 | 114.2 | 83.2 | -30.9 |
| 2025 | NO | 6-11 | 0.734 | 107.8 | 0.976 | 121.1 | 93.8 | -27.3 |
| 2018 | BUF | 6-10 | 0.744 | 53.7 | 0.936 | 115.2 | 89.5 | -25.7 |
| 2014 | DET | 11-5 | 0.825 | 4.1 | 0.942 | 130.1 | 108.0 | -22.1 |
| 2015 | DET | 7-9 | 0.791 | 19.4 | 0.969 | 115.6 | 93.9 | -21.7 |
| 2024 | SEA | 10-7 | 0.802 | 52.0 | 0.977 | 122.4 | 100.8 | -21.6 |
| 2024 | LA | 10-7 | 0.813 | 34.6 | 0.990 | 119.0 | 97.8 | -21.2 |

**Where C is kinder than A** (teams that spent real cash on players who were actually there):

| season | team | W-L | relative_cash | dead_money_M | cap_consumed | capplus_A_pos | capplus_C_pos | delta_C_minus_A |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2023 | SF | 12-5 | 1.119 | 17.2 | 0.815 | 111.6 | 145.9 | +34.3 |
| 2024 | DET | 15-2 | 1.172 | 33.7 | 0.895 | 106.8 | 138.4 | +31.5 |
| 2022 | CLE | 7-10 | 1.175 | 18.8 | 0.817 | 81.9 | 111.4 | +29.6 |
| 2022 | BUF | 13-3 | 1.217 | 16.6 | 0.949 | 102.7 | 128.1 | +25.4 |
| 2014 | SEA | 12-4 | 1.094 | 0.9 | 0.838 | 110.5 | 134.4 | +23.9 |
| 2014 | BAL | 10-6 | 1.134 | 4.4 | 0.842 | 98.5 | 121.9 | +23.4 |
| 2024 | SF | 6-11 | 1.334 | 26.9 | 0.951 | 73.7 | 97.1 | +23.4 |
| 2024 | PHI | 14-3 | 1.223 | 62.0 | 0.975 | 99.2 | 122.1 | +22.8 |
| 2018 | CHI | 12-4 | 1.315 | 12.0 | 1.005 | 91.6 | 114.4 | +22.8 |
| 2018 | LA | 13-3 | 1.239 | 12.4 | 0.971 | 97.7 | 119.8 | +22.2 |

This is the strongest single argument in the backtest. The A-vs-C gap is not noise: it is −62.0 on 2022 CHI, −44.0 on 2022 ATL, −37.3 on 2023 LA, −30.9 on 2023 TB, −27.3 on 2025 NO — the five biggest gaps are five of the most notorious dead-money team-seasons on record — and +34.3 on 2023 SF, +31.5 on 2024 DET, +25.4 on 2022 BUF. **Including dead money in the denominator is doing precisely the work the product brief wants done.** The problem was never the denominator; it was the algebra wrapped around it.

## 9. Where candidate C can and cannot be computed

| season | teams_with_dead_money | coverage | C_calibrated |
| ---: | ---: | --- | --- |
| 2013 | 5 | partial | no — bracket only |
| 2014 | 32 | full32 | yes (32 teams) |
| 2015 | 32 | full32 | yes (32 teams) |
| 2016 | 8 | partial | no — bracket only |
| 2017 | 32 | full32 | yes (32 teams) |
| 2018 | 32 | full32 | yes (32 teams) |
| 2019 | 32 | full32 | yes (32 teams) |
| 2020 | 5 | partial | no — bracket only |
| 2021 | 10 | partial | no — bracket only |
| 2022 | 32 | full32 | yes (32 teams) |
| 2023 | 32 | full32 | yes (32 teams) |
| 2024 | 32 | full32 | yes (32 teams) |
| 2025 | 32 | full32 | yes (32 teams) |

**C is calibrated for 288 of 416 team-seasons (69.2%)**: all 32 teams in 2014, 2015, 2017, 2018, 2019, 2022, 2023, 2024, 2025. It is *not* available for any team in 2013, 2016, 2020 or 2021 — 128 team-seasons, including 2013 SEA, 2016 NE, 2020 KC, 2021 KC, 2021 LAR, 2016 CLE and 2021 NO from the sniff list.

### 9.1 Scenario bracket for the four partial seasons

For a season where the source published only a leaders list, the unlisted teams' dead money is bounded: at or below the smallest listed leader, and at or above the largest of any published low set. Filling every unlisted team at the low bound is maximally unfavourable to the listed teams; filling at the high bound is maximally favourable. The pair brackets each listed team's C. **These are scenarios, not measurements, and must never ship as Cap+ values.**

| season | known_teams | lo_fill_M | hi_fill_M |
| ---: | ---: | ---: | ---: |
| 2013 | 5 | 0.00 | 17.52 |
| 2016 | 8 | 1.73 | 21.44 |
| 2020 | 5 | 0.00 | 22.00 |
| 2021 | 10 | 4.29 | 35.76 |

| season | team | W-L | dead_money_M | perf_index | C_ratio_lo | C_ratio_hi | C_pos_lo | C_pos_hi |
| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2013 | ARI | 10-6 | 18.7 | 108.9 | 108.7 | 110.0 | 106.3 | 121.6 |
| 2013 | JAX | 4-12 | 34.1 | 72.3 | 74.8 | 71.6 | 65.1 | 75.1 |
| 2013 | KC | 11-5 | 17.5 | 115.0 | 112.4 | 114.1 | 94.7 | 108.5 |
| 2013 | LV | 4-12 | 55.5 | 80.7 | 82.9 | 80.7 | 71.6 | 82.5 |
| 2013 | NYJ | 8-8 | 20.3 | 90.9 | 91.9 | 91.0 | 83.0 | 95.3 |
| 2016 | ATL | 11-5 | 21.4 | 120.4 | 119.0 | 120.9 | 112.9 | 125.0 |
| 2016 | CIN | 6-9 | 0.7 | 99.9 | 100.3 | 100.2 | 91.2 | 101.3 |
| 2016 | CLE | 1-15 | 31.1 | 65.2 | 62.2 | 58.2 | 71.7 | 79.8 |
| 2016 | DAL | 13-3 | 1.2 | 122.3 | 120.7 | 122.7 | 114.3 | 126.6 |
| 2016 | GB | 10-6 | 1.7 | 109.1 | 108.7 | 109.4 | 101.3 | 112.3 |
| 2016 | NO | 7-9 | 37.9 | 101.0 | 101.4 | 101.4 | 100.0 | 110.9 |
| 2016 | PHI | 7-9 | 22.5 | 102.1 | 102.3 | 102.5 | 94.3 | 104.6 |
| 2016 | TB | 9-7 | 1.5 | 100.5 | 100.8 | 100.8 | 93.6 | 103.9 |
| 2020 | CAR | 5-11 | 48.0 | 89.8 | 91.7 | 90.7 | 80.7 | 89.6 |
| 2020 | JAX | 1-15 | 37.0 | 71.6 | 70.7 | 67.7 | 76.2 | 84.7 |
| 2020 | LA | 10-6 | 34.0 | 113.5 | 113.1 | 114.3 | 106.3 | 117.8 |
| 2020 | MIA | 10-6 | 22.0 | 108.2 | 108.5 | 109.3 | 104.6 | 115.9 |
| 2020 | NE | 7-9 | 24.0 | 93.9 | 94.8 | 94.2 | 93.3 | 103.4 |
| 2021 | BAL | 8-9 | 4.3 | 96.4 | 96.7 | 96.1 | 97.9 | 110.4 |
| 2021 | CAR | 5-12 | 45.6 | 85.5 | 86.5 | 84.6 | 82.7 | 93.4 |
| 2021 | CLE | 8-9 | 3.2 | 98.6 | 99.0 | 98.7 | 94.5 | 106.7 |
| 2021 | DET | 3-13 | 48.1 | 78.2 | 79.9 | 77.1 | 74.0 | 83.7 |
| 2021 | IND | 9-8 | 0.6 | 106.6 | 106.4 | 107.1 | 100.0 | 112.9 |
| 2021 | LA | 12-5 | 39.5 | 114.3 | 113.9 | 115.4 | 110.8 | 124.9 |
| 2021 | LAC | 9-8 | 2.3 | 104.0 | 104.1 | 104.4 | 98.5 | 111.2 |
| 2021 | NO | 9-8 | 35.8 | 103.6 | 103.8 | 104.1 | 102.1 | 115.2 |
| 2021 | PHI | 9-8 | 50.0 | 105.9 | 105.9 | 106.5 | 101.9 | 115.0 |
| 2021 | TB | 13-4 | 2.4 | 123.8 | 123.5 | 126.2 | 123.7 | 139.5 |

Two readings worth pulling out. **2013 OAK: C-pos 71.6–82.5** against a 80.7 performance index — poor under either scenario, and the bracket is wide enough that the brief's 'should rate poorly' is satisfied without needing to pick a scenario. Note that Oakland's *ratio* bracket runs 82.9 → 80.7, i.e. **backwards** — the scenario that is supposed to be harshest on Oakland scores it higher — which is the §6 sign inversion showing up again in an otherwise clean piece of arithmetic. **2016 CLE: C-pos 71.7–79.8** against a 65.2 performance index: the 1-15 Browns come out *better* than their performance under both scenarios, because their cap consumption was low.

## 10. Weight sensitivity

Correlation with the default 1/3-1/3-1/3 build, over 2013–2025:

| weights | corr_perf_index | corr_A | corr_A_sub | corr_A_pos | corr_B | corr_C | corr_C_sub | corr_C_pos |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| W_wins = (0.5, 0.25, 0.25) | 0.9972 | 0.9974 | 0.9980 | 0.9978 | 0.9968 | 0.9974 | 0.9983 | 0.9973 |
| W_epa = (0.25, 0.25, 0.5) | 0.9981 | 0.9986 | 0.9989 | 0.9987 | 0.9983 | 0.9986 | 0.9991 | 0.9986 |

Mean absolute within-season rank shift versus the default weights:

| weights | shift_perf_index | shift_A | shift_A_sub | shift_A_pos | shift_B | shift_C | shift_C_sub | shift_C_pos |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| W_wins | 0.59 | 0.65 | 0.61 | 0.74 | 0.70 | 0.52 | 0.57 | 0.63 |
| W_epa | 0.47 | 0.51 | 0.43 | 0.46 | 0.58 | 0.52 | 0.41 | 0.51 |

Sniff table under the alternate weights (index and rank, perf / A / B / C-pos):

| case | W_default | W_wins | W_epa |
| --- | --- | --- | --- |
| 2013 SEA -- champs, rookie-deal QB | 128(#2) / 126(#1) / 128(#2) / -- | 128(#2) / 125(#1) / 127(#2) / -- | 130(#2) / 127(#1) / 129(#1) / -- |
| 2014 NE -- efficient champion | 120(#4) / 122(#1) / 122(#2) / 119(#5) | 120(#4) / 122(#1) / 122(#1) / 118(#5) | 119(#4) / 121(#2) / 121(#4) / 118(#5) |
| 2016 NE -- efficient champion | 131(#1) / 132(#1) / 134(#1) / -- | 130(#1) / 131(#1) / 133(#1) / -- | 130(#1) / 131(#1) / 133(#1) / -- |
| 2018 NE -- efficient champion | 116(#6) / 116(#5) / 117(#6) / 116(#7) | 116(#6) / 116(#5) / 116(#6) / 116(#7) | 116(#6) / 116(#5) / 117(#6) / 116(#6) |
| 2017 PHI -- champs, injured starter QB | 125(#1) / 123(#1) / 123(#1) / 114(#7) | 125(#1) / 123(#1) / 123(#1) / 114(#7) | 125(#1) / 123(#1) / 124(#1) / 114(#8) |
| 2023 SF -- cheap QB, NFC champs | 128(#2) / 124(#1) / 124(#3) / 146(#1) | 126(#2) / 123(#1) / 122(#3) / 144(#1) | 129(#1) / 125(#1) / 125(#2) / 147(#1) |
| 2019 KC -- SB win, rookie-deal Mahomes | 118(#5) / 119(#4) / 123(#3) / 137(#1) | 119(#5) / 119(#5) / 123(#3) / 138(#1) | 118(#5) / 118(#4) / 122(#3) / 136(#1) |
| 2020 KC -- SB loss, mega-deal signed | 120(#4) / 121(#2) / 124(#1) / -- | 122(#2) / 123(#1) / 125(#1) / -- | 119(#4) / 121(#2) / 123(#2) / -- |
| 2021 KC -- mega-deal era | 116(#5) / 116(#5) / 119(#3) / -- | 117(#5) / 117(#4) / 119(#3) / -- | 116(#5) / 116(#5) / 118(#4) / -- |
| 2022 KC -- SB win, mega-deal era | 127(#3) / 127(#2) / 128(#2) / 127(#3) | 127(#2) / 127(#1) / 128(#1) / 127(#3) | 128(#2) / 128(#2) / 129(#2) / 128(#2) |
| 2023 KC -- SB win, mega-deal era | 113(#7) / 113(#7) / 115(#6) / 111(#7) | 113(#7) / 114(#7) / 115(#6) / 111(#7) | 113(#7) / 113(#7) / 115(#6) / 111(#7) |
| 2021 LAR -- all-in veteran roster, won SB | 114(#7) / 115(#6) / 123(#2) / -- | 115(#6) / 117(#5) / 124(#2) / -- | 114(#7) / 115(#6) / 123(#2) / -- |
| 2013 OAK -- record 43.6% of adj cap dead | 81(#29) / 76(#30) / 89(#23) / -- | 81(#29) / 76(#30) / 89(#23) / -- | 81(#30) / 76(#30) / 89(#24) / -- |
| 2022 CHI -- record dead money, bad team | 74(#31) / 54(#32) / 81(#28) / 71(#31) | 74(#32) / 54(#32) / 81(#28) / 71(#31) | 74(#31) / 55(#32) / 82(#28) / 72(#31) |
| 2022 ATL -- record dead money, bad team | 92(#24) / 90(#26) / 98(#17) / 88(#28) | 92(#24) / 90(#26) / 97(#18) / 88(#27) | 91(#24) / 89(#28) / 97(#18) / 87(#28) |
| 2024 DEN -- record individual dead money, 10-7 | 112(#9) / 114(#7) / 114(#6) / 111(#10) | 111(#10) / 112(#10) / 113(#10) / 110(#10) | 113(#8) / 114(#5) / 115(#5) / 112(#9) |
| 2017 CLE -- 0-16 | 70(#32) / 71(#32) / 70(#32) / 89(#23) | 68(#32) / 69(#32) / 68(#32) / 86(#27) | 71(#32) / 73(#31) / 72(#32) / 91(#22) |
| 2016 CLE -- 1-15 | 65(#32) / 52(#32) / 75(#30) / -- | 65(#32) / 52(#32) / 75(#30) / -- | 65(#32) / 52(#32) / 76(#30) / -- |
| 2021 NO -- post-Brees cap hell | 104(#15) / 104(#15) / 103(#15) / -- | 103(#15) / 104(#15) / 102(#16) / -- | 104(#15) / 104(#15) / 103(#15) / -- |
| 2022 NO -- post-Brees cap hell | 97(#18) / 99(#17) / 94(#20) / 98(#18) | 96(#19) / 98(#19) / 93(#22) / 97(#18) | 99(#16) / 100(#16) / 95(#19) / 100(#16) |

**No sniff-table verdict changes under any weighting.** Correlations are ≥ 0.9968 and the mean rank shift never exceeds 0.74 places. With the three inputs correlated 0.87–0.97, the composite is effectively weight-invariant. Recommendation: adopt 1/3-1/3-1/3, document that the alternatives were tested and are indistinguishable, and spend no further product time on the weights. The consequential choices are the denominator and the algebraic form, not the blend.

## 11. All-time top 15 and bottom 15, 2013–2025, per candidate

**A ratio (as specified)**

- Top 15: 2019 BAL 14-2 **133.5** · 2016 NE 14-2 **131.6** · 2022 SF 13-4 **128.6** · 2015 ARI 13-3 **127.9** · 2022 KC 14-3 **127.4** · 2015 CAR 15-1 **126.7** · 2025 SEA 14-3 **126.1** · 2013 SEA 13-3 **126.0** · 2013 DEN 13-3 **125.7** · 2022 PHI 14-3 **125.3** · 2025 LA 12-5 **125.1** · 2013 CAR 12-4 **124.4** · 2023 SF 12-5 **124.1** · 2019 NE 12-4 **123.8** · 2025 NE 14-3 **123.3**

- Bottom 15: 2016 CLE 1-15 **51.9** · 2022 CHI 3-14 **54.3** · 2020 NYJ 2-14 **60.6** · 2020 JAX 1-15 **63.6** · 2018 ARI 3-13 **64.5** · 2013 JAX 4-12 **64.7** · 2025 NYJ 3-14 **64.8** · 2016 SF 2-14 **69.3** · 2016 LA 4-12 **69.5** · 2025 LV 3-14 **70.1** · 2019 MIA 5-11 **70.4** · 2023 WAS 4-13 **70.5** · 2023 CAR 2-15 **70.5** · 2021 HOU 4-13 **70.9** · 2025 TEN 3-14 **70.9**

**A subtraction**

- Top 15: 2025 LA 12-5 **137.2** · 2014 NE 12-4 **135.9** · 2025 SEA 14-3 **135.0** · 2014 DAL 12-4 **133.9** · 2016 NE 14-2 **133.7** · 2013 CAR 12-4 **133.4** · 2023 LA 10-7 **131.5** · 2019 BAL 14-2 **131.4** · 2014 DET 11-5 **130.3** · 2015 ARI 13-3 **129.6** · 2018 IND 10-6 **129.5** · 2014 IND 11-5 **129.4** · 2016 ATL 11-5 **129.0** · 2022 CIN 12-4 **128.0** · 2024 BUF 13-4 **127.9**

- Bottom 15: 2024 SF 6-11 **64.2** · 2016 PHI 7-9 **65.8** · 2022 LA 5-12 **67.7** · 2024 CLE 3-14 **67.7** · 2014 ATL 6-10 **67.9** · 2019 ATL 7-9 **68.5** · 2020 PHI 4-11 **69.4** · 2020 HOU 4-12 **70.9** · 2013 GB 8-7 **71.2** · 2018 JAX 5-11 **72.6** · 2024 JAX 4-13 **72.7** · 2015 DAL 4-12 **72.8** · 2017 DET 9-7 **73.2** · 2016 NYJ 5-11 **73.5** · 2013 DET 7-9 **73.6**

**A positive-anchored (repair)**

- Top 15: 2013 CAR 12-4 **145.4** · 2023 LA 10-7 **139.7** · 2025 LA 12-5 **139.6** · 2014 NE 12-4 **137.2** · 2025 SEA 14-3 **136.7** · 2018 IND 10-6 **135.6** · 2016 NE 14-2 **134.8** · 2014 DAL 12-4 **134.7** · 2022 CHI 3-14 **133.5** · 2022 CIN 12-4 **133.2** · 2019 BAL 14-2 **132.3** · 2022 ATL 7-10 **132.1** · 2022 DAL 12-5 **132.0** · 2018 BAL 10-6 **130.4** · 2014 DET 11-5 **130.1**

- Bottom 15: 2022 LA 5-12 **69.4** · 2024 CLE 3-14 **70.4** · 2021 JAX 3-14 **73.7** · 2024 SF 6-11 **73.7** · 2013 GB 8-7 **74.7** · 2020 PHI 4-11 **74.8** · 2024 JAX 4-13 **75.0** · 2014 TEN 2-14 **75.1** · 2018 JAX 5-11 **75.2** · 2017 CLE 0-16 **75.3** · 2020 HOU 4-12 **76.0** · 2013 DET 7-9 **76.2** · 2013 ATL 4-12 **76.2** · 2016 NYJ 5-11 **76.4** · 2023 CAR 2-15 **77.0**

**B efficiency over expected**

- Top 15: 2019 BAL 14-2 **138.5** · 2016 NE 14-2 **134.0** · 2015 ARI 13-3 **132.9** · 2025 SEA 14-3 **132.2** · 2025 LA 12-5 **132.1** · 2022 SF 13-4 **129.7** · 2013 CAR 12-4 **128.9** · 2022 KC 14-3 **128.3** · 2013 SEA 13-3 **128.0** · 2019 NE 12-4 **127.5** · 2013 DEN 13-3 **127.2** · 2022 PHI 14-3 **126.4** · 2023 LA 10-7 **126.3** · 2015 CAR 15-1 **126.2** · 2024 DET 15-2 **125.4**

- Bottom 15: 2021 JAX 3-14 **65.0** · 2018 ARI 3-13 **69.1** · 2023 CAR 2-15 **69.2** · 2017 CLE 0-16 **70.0** · 2021 NYG 4-13 **71.3** · 2016 LA 4-12 **71.3** · 2021 NYJ 4-13 **71.8** · 2014 TEN 2-14 **72.6** · 2014 LV 3-13 **72.8** · 2016 SF 2-14 **73.1** · 2019 CIN 2-14 **73.3** · 2015 CLE 3-13 **74.2** · 2024 CLE 3-14 **74.3** · 2015 DAL 4-12 **74.3** · 2018 LV 4-12 **74.9**

**C ratio (as specified)**

- Top 15: 2019 BAL 14-2 **132.5** · 2023 SF 12-5 **131.3** · 2015 CAR 15-1 **130.1** · 2024 DET 15-2 **129.9** · 2022 SF 13-4 **129.5** · 2022 BUF 13-3 **128.1** · 2023 BAL 13-4 **127.1** · 2022 KC 14-3 **127.0** · 2015 ARI 13-3 **126.1** · 2014 SEA 12-4 **125.6** · 2023 DAL 12-5 **125.0** · 2025 NE 14-3 **124.9** · 2022 PHI 14-3 **124.4** · 2019 NE 12-4 **124.3** · 2017 MIN 13-3 **124.3**

- Bottom 15: 2017 CLE 0-16 **62.7** · 2018 ARI 3-13 **65.9** · 2025 NYJ 3-14 **69.3** · 2014 LV 3-13 **71.3** · 2023 CAR 2-15 **72.2** · 2014 TEN 2-14 **72.2** · 2023 WAS 4-13 **72.3** · 2025 TEN 3-14 **72.5** · 2018 LV 4-12 **73.1** · 2014 JAX 3-13 **74.1** · 2019 MIA 5-11 **74.3** · 2019 WAS 3-13 **75.0** · 2022 CHI 3-14 **75.3** · 2025 LV 3-14 **75.4** · 2017 IND 4-12 **75.4**

**C subtraction**

- Top 15: 2018 IND 10-6 **149.6** · 2024 DET 15-2 **148.0** · 2023 SF 12-5 **145.4** · 2019 KC 12-4 **137.6** · 2014 SEA 12-4 **134.8** · 2022 SF 13-4 **129.9** · 2025 SEA 14-3 **129.1** · 2017 SF 6-10 **127.3** · 2014 DAL 12-4 **126.7** · 2025 NE 14-3 **126.7** · 2025 LA 12-5 **126.3** · 2022 CLE 7-10 **126.2** · 2017 MIN 13-3 **125.6** · 2014 BAL 10-6 **125.2** · 2024 WAS 12-5 **123.3**

- Bottom 15: 2025 LV 3-14 **57.6** · 2022 HOU 3-13 **59.9** · 2023 TB 9-8 **59.9** · 2019 CLE 6-10 **64.6** · 2023 CAR 2-15 **64.7** · 2025 CLE 5-12 **65.8** · 2025 SF 12-5 **66.4** · 2018 SF 4-12 **67.9** · 2024 NYG 3-14 **71.1** · 2024 CAR 5-12 **71.8** · 2022 CHI 3-14 **72.2** · 2018 JAX 5-11 **73.1** · 2015 PHI 7-9 **73.4** · 2014 MIA 8-8 **75.6** · 2019 PIT 8-8 **76.4**

**C positive-anchored (repair)**

- Top 15: 2023 SF 12-5 **145.9** · 2018 IND 10-6 **140.6** · 2024 DET 15-2 **138.4** · 2019 KC 12-4 **137.2** · 2014 SEA 12-4 **134.4** · 2022 SF 13-4 **132.9** · 2017 MIN 13-3 **128.9** · 2025 SEA 14-3 **128.1** · 2019 BAL 14-2 **128.1** · 2022 BUF 13-3 **128.1** · 2025 NE 14-3 **127.7** · 2015 CAR 15-1 **127.0** · 2022 KC 14-3 **126.9** · 2014 DAL 12-4 **125.7** · 2025 LA 12-5 **125.7**

- Bottom 15: 2023 CAR 2-15 **65.7** · 2022 HOU 3-13 **67.5** · 2025 LV 3-14 **67.8** · 2022 CHI 3-14 **71.5** · 2025 TEN 3-14 **72.1** · 2018 ARI 3-13 **75.0** · 2019 CIN 2-14 **75.2** · 2014 LV 3-13 **75.3** · 2014 TEN 2-14 **75.3** · 2015 CLE 3-13 **75.7** · 2024 CAR 5-12 **75.8** · 2019 WAS 3-13 **75.9** · 2018 SF 4-12 **76.0** · 2017 NYG 3-13 **76.2** · 2014 TB 2-14 **76.3**

Read these lists as the product's front page, because that is what they will become:

- **A ratio / C ratio / B**: all three produce credible lists — good teams on top, bad teams on the bottom. A and C achieve this by being performance in disguise; B earns it.
- **A-sub**: the bottom 15 contains **no famous cap disaster at all** — it is 6-10 and 7-9 teams that happened to spend heavily — while the top 15 includes 2023 LA (10-7, $79.6M dead). The metric has stopped measuring what it claims to.
- **A-pos**: the all-time top 15 contains **2022 CHI (3-14) at 9th and 2022 ATL (7-10) at 12th**. Publishing that list would end the metric's credibility in one screenshot.
- **C-sub**: the all-time bottom 15 contains **2025 SF (12-5)** and **2023 TB (9-8)**, and the top 15 contains **2017 SF (6-10)** and **2022 CLE (7-10)**. Too much weight on the denominator in both directions.
- **C-pos**: the most credible list in the backtest. Top: 2023 SF, 2018 IND, 2024 DET, 2019 KC, 2014 SEA, 2022 SF, 2017 MIN, 2025 SEA, 2019 BAL, 2022 BUF. Bottom: 2023 CAR, 2022 HOU, 2025 LV, 2022 CHI, 2025 TEN, 2018 ARI, 2019 CIN, 2014 LV, 2014 TEN, 2015 CLE. Every entry survives a look.

## 12. Results that would embarrass the product

1. **A-pos ranks the 2022 Bears #1 in the NFL** (133.5), and A-sub ranks them 8th. A 3-14 team carrying the largest dead-money charge in league history, at the top of a metric invented to catch exactly that. Cause: `cash_spent_total` is cash to *rostered* players, so gutting a roster reads as thrift. corr(relative_cash, dead-money share) = −0.36.
2. **Candidate C, as literally specified, rewards dead money.** For any team with P < 0 — half the league — a bigger total-cost denominator *raises* the score. Chicago 2022's raw score improves from −1.731 to −1.675. The brief's own mechanism does not work as written, and the ranks only look right because performance drowns it out.
3. **Roughly half of 2022 CHI/ATL's punishment is a measurement-date artifact.** They are read at a 2024 season-final date while the other 29 teams are read the previous July. Reading all 32 teams at the same date moves Atlanta from 88.1 to **98.8 — dead league average** — and the brief's requirement fails. Any published Cap+ must state the as-of date of the dead-money snapshot next to the value, exactly as the sourcing findings require for the raw figures.
4. **The 0-16 Browns are efficient.** 2017 CLE consumed 0.726 of the cap and scores 108.6 (8th) on C-sub and 88.7 (23rd) on C-pos. Any pure rate metric gives credit for cap not consumed. Unless the product decides that unspent cap is *not* a saving, some floor or shrinkage on denominator credit is required.

Two further things a careful reader will notice and ask about, which are honest rather than embarrassing but need an answer ready: the **2021 Rams rate 2nd in the league on B** despite being the canonical 'all-in' team (single-season spend cannot see mortgaged future cap), and the **2019–2023 Chiefs arc is flat** rather than declining (Kansas City's cash spend never rose above league average).

## 13. Performance-only fallback, 1999–2025 — **this is not Cap+**

`perf_index = 100 + 15·P`, the same composite with no resource term at all, computed for all 861 team-seasons 1999–2025. Because P is standardized within season, the index has mean exactly 100 and SD exactly 15.000 in **every** season, and the pooled SD is 15.000; there are no outliers outside the ±3 SD band in 27 seasons (range 62.6–139.5, skew -0.050, excess kurtosis -0.651).

- Top 15 all-time (1999–2025): 2007 NE 16-0 **139.5** · 1999 LA 13-3 **137.3** · 2001 LA 14-2 **134.9** · 2019 BAL 14-2 **134.1** · 2015 CAR 15-1 **131.2** · 2010 NE 14-2 **130.9** · 2006 LAC 14-2 **130.9** · 2016 NE 14-2 **130.7** · 2004 NE 14-2 **129.3** · 2013 DEN 13-3 **129.1** · 2022 SF 13-4 **128.8** · 2013 SEA 13-3 **128.4** · 2011 GB 15-1 **128.4** · 2022 BUF 13-3 **128.4** · 2005 IND 14-2 **128.3**

- Bottom 15 all-time (1999–2025): 2008 DET 0-16 **62.6** · 2016 CLE 1-15 **65.2** · 2009 LA 1-15 **67.6** · 2004 SF 2-14 **68.2** · 2018 ARI 3-13 **68.5** · 1999 CLE 2-14 **68.6** · 2010 CAR 2-14 **69.1** · 2016 LA 4-12 **69.6** · 2012 KC 2-14 **69.8** · 2008 LA 2-14 **69.8** · 2017 CLE 0-16 **69.9** · 2023 CAR 2-15 **69.9** · 2003 ARI 4-12 **69.9** · 2000 CLE 3-13 **70.3** · 2016 SF 2-14 **70.4**

2007 NE (16-0) tops it at 139.5 and 2008 DET (0-16) floors it at 62.6, which is the right shape for a performance index.

### 13.1 How the two would sit side by side honestly

They cannot share a name, a column, or an axis. The 2013–2025 metric answers *how much performance did this team get per dollar of cap-normalized resource*; the 1999–2012 fallback answers *how good was this team*, full stop, and its denominator is not missing — it does not exist, because the spend data before 2013 is a sample of notable contracts rather than a roster (contracts audit §3: 43 players per team in 2012 against a 53-man roster, and a cap ratio of 0.72 that decays to under 0.15 by 2004). A single continuous 1999–2025 line labelled Cap+ would be a fabrication for its first fourteen seasons, and the two series are not even on the same scale of meaning: the fallback is 0.95-correlated with win percentage by construction, while a working Cap+ should not be. The defensible presentation is a pre-2013 team page that renders **Team Rating (performance only)** in visibly different styling, with the Cap+ slot showing an explicit *'not available before 2013 — league-wide contract coverage begins in 2013'* rather than a blank or a dash, and a hard visual break in any franchise time series at the 2013 boundary. The one honest bridge is that both indices are built from the identical P composite, so a franchise's *performance* line is continuous from 1999; only the resource adjustment starts in 2013. Say that in one sentence on the page and the seam becomes a feature rather than a gap.

## 14. Recommendation

**None of the three candidates is shippable as specified.** A and C are algebraically broken in a way that inverts the metric's thesis for half the league, and both are — after that bug partially cancels itself out — indistinguishable from the performance index they are supposed to improve on (mean absolute move of 1.44 and 0.59 index points). B is sound but timid, and being cash-only it is blind to dead money: it rates 2023 LA (10-7, $79.6M dead) 1st in the league among its biggest movers.

The path with the most evidence behind it is **the total-cost denominator with a positive numerator** — `100 + 15·P` over `(cap_used + dead_money)/league_cap`, relative to the league average — computed only for the nine seasons with full dead-money coverage, resolved at a **single measurement date per season**, and shipped with that date visible. It produces the most credible top and bottom fifteen in the backtest, it separates cleanly from the cash-only candidate exactly on the cap-disaster teams (§8), and it is the only construction in which the brief's dead-money mechanism actually works.

Three decisions the memo has to make before that is shippable:

1. **Does unspent cap count as a saving?** If yes, 2017 CLE at 88.7 is correct and the product must be willing to defend it. If no, the denominator needs a floor (e.g. credit no denominator below the league's 25th percentile) or shrinkage toward 1.0 — a general rule, applied to every team, decided on principle rather than tuned until Cleveland looks right.
2. **Nine seasons or thirteen?** C covers 2014, 2015, 2017–2019, 2022–2025 only. Shipping C means four seasons of the flagship metric are blank — including 2013 SEA, the case the brief leads with. Shipping B everywhere means the flagship metric cannot see dead money at all. A hybrid (C where covered, B elsewhere) creates two metrics under one name and should be rejected.
3. **How much spend weight?** The three forms embed radically different implicit weights: the ratio form ~0, the subtraction form exactly 1, the positive-anchored form SD(log R)/0.15 ≈ 0.39 for total cost and ≈ 0.85 for cash. That weight is the whole product. It should be chosen and stated, not inherited from an algebraic accident.

## 15. Recommended build — Cap+ (Total-Cost), λ = 1.5

This is the formula approved in `CAPPLUS_MEMO.md` §7. Everything below is produced by `audit/capplus_backtest.py`; nothing in this section is computed by hand.

```
Cap+ = (100 + 15 × P) ÷ R
R    = team cost ÷ league-average cost, floored at the season's 25th percentile
cost = (cap charged to rostered players + 1.5 × dead money) ÷ league cap
```

All 32 teams read from one snapshot per season (§15.1); season mean exactly 100; one pooled within-season SD across the window so 1 SD = 15.000 points; **288 team-seasons** over nine seasons — 2014, 2015, 2017, 2018, 2019, 2022, 2023, 2024, 2025. 2013, 2016, 2020 and 2021 are not computed and render an explicit "not available".

### 15.1 Same-stage snapshot resolution

One dated table per season, covering all 32 teams. 2018 is the only season with two full-league tables; the later one is used (see `resolve_dead_money_same_stage`).

| season | asof_date | asof_stage | teams | median_dead_money_M | total_dead_money_M | badge |
| ---: | --- | --- | ---: | ---: | ---: | --- |
| 2014 | 2014-02-18 | preseason | 32 | 4.03 | 161.2 | provisional |
| 2015 | 2015-10-28 | midseason | 32 | 14.26 | 471.3 | in-season |
| 2017 | 2017-07-05 | preseason | 32 | 5.27 | 236.0 | preseason |
| 2018 | 2018-07-14 | preseason | 32 | 8.81 | 348.5 | preseason |
| 2019 | 2019-03-10 | preseason | 32 | 3.39 | 158.1 | provisional |
| 2022 | 2022-07-05 | preseason | 32 | 19.11 | 713.1 | preseason |
| 2023 | 2023-07-14 | preseason | 32 | 20.30 | 797.9 | preseason |
| 2024 | 2024-11-27 | late_season | 32 | 50.28 | 1456.5 | in-season |
| 2025 | 2025-12-17 | late_season | 32 | 41.02 | 1659.3 | in-season |

**2014 and 2019 ship badged _provisional_**: their tables were published before the league year opened, so the median team charge is $4.0M and $3.4M against $50.3M in 2024. That is a date effect, not a league that got more disciplined.

### 15.2 The floor

| season | floored_teams | cost_floor | min_cost | median_cost | max_cost | R_min | R_max |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2014 | 8 | 0.8963 | 0.7473 | 0.9420 | 1.0491 | 0.9507 | 1.1127 |
| 2015 | 8 | 1.0051 | 0.9365 | 1.0228 | 1.0940 | 0.9741 | 1.0602 |
| 2017 | 8 | 0.9262 | 0.7579 | 0.9580 | 1.0529 | 0.9602 | 1.0915 |
| 2018 | 8 | 0.9454 | 0.7643 | 0.9857 | 1.0874 | 0.9554 | 1.0989 |
| 2019 | 8 | 0.8911 | 0.7149 | 0.9069 | 1.1151 | 0.9646 | 1.2071 |
| 2022 | 8 | 0.9431 | 0.8621 | 0.9854 | 1.1352 | 0.9484 | 1.1417 |
| 2023 | 8 | 0.9460 | 0.8528 | 0.9813 | 1.2946 | 0.9483 | 1.2977 |
| 2024 | 8 | 1.0143 | 0.9611 | 1.0605 | 1.1606 | 0.9525 | 1.0898 |
| 2025 | 8 | 1.0414 | 1.0164 | 1.0700 | 1.3380 | 0.9475 | 1.2173 |

Eight of 32 teams are floored every season, by construction. The floor is what stops a team being paid for cap it never spent: **2017 CLE (0-16) consumed the second-lowest weighted cost in the window and lands at 72.9, 32nd**; without the floor the same rate metric rates them mid-pack. Note the floor is applied to the *cost* measure and the league average is taken after it, so mean(R) is exactly 1.000 every season and R = 1.00 still reads as "league-average cost".

### 15.3 Sniff table — recommended build

| case | expected | perf | C_pos | capplus_rec | dead_money_M | cost | R |
| --- | --- | --- | --- | --- | ---: | ---: | ---: |
| 2013 SEA -- champs, rookie-deal QB | elite | 128.4 (#2) | -- | -- | -- | -- | -- |
| 2014 NE -- efficient champion | high | 119.8 (#4) | 118.5 (#5) | 118.4 (#3) | 8.5 | 0.953 | 1.011 |
| 2016 NE -- efficient champion | high | 130.7 (#1) | -- | -- | -- | -- | -- |
| 2018 NE -- efficient champion | high | 116.5 (#6) | 115.7 (#7) | 119.4 (#4) | 4.0 | 0.964 | 0.974 |
| 2017 PHI -- champs, injured starter QB | high | 125.2 (#1) | 114.2 (#7) | 114.7 (#7) | 14.0 | 1.053 | 1.092 |
| 2023 SF -- cheap QB, NFC champs | elite | 127.5 (#2) | 145.9 (#1) | 133.9 (#1) | 17.2 | 0.853 | 0.948 |
| 2019 KC -- SB win, rookie-deal Mahomes | report | 118.4 (#5) | 137.2 (#1) | 122.6 (#3) | 0.9 | 0.794 | 0.965 |
| 2020 KC -- SB loss, mega-deal signed | report | 120.2 (#4) | -- | -- | -- | -- | -- |
| 2021 KC -- mega-deal era | report | 116.3 (#5) | -- | -- | -- | -- | -- |
| 2022 KC -- SB win, mega-deal era | report | 127.3 (#3) | 126.9 (#3) | 130.5 (#2) | 8.0 | 0.969 | 0.974 |
| 2023 KC -- SB win, mega-deal era | report | 113.2 (#7) | 111.0 (#7) | 116.3 (#6) | 7.7 | 0.968 | 0.970 |
| 2021 LAR -- all-in veteran roster, won SB | report | 114.3 (#7) | -- | -- | -- | -- | -- |
| 2013 OAK -- record 43.6% of adj cap dead | poor | 80.7 (#29) | -- | -- | -- | -- | -- |
| 2022 CHI -- record dead money, bad team | poor | 74.0 (#31) | 71.5 (#31) | 77.2 (#31) | 57.6 | 0.954 | 0.960 |
| 2022 ATL -- record dead money, bad team | poor | 92.3 (#24) | 88.1 (#28) | 89.5 (#27) | 63.2 | 1.026 | 1.032 |
| 2024 DEN -- record individual dead money, 10-7 | report | 112.5 (#9) | 111.3 (#10) | 104.4 (#13) | 85.2 | 1.146 | 1.076 |
| 2017 CLE -- 0-16 | bottom | 69.9 (#32) | 88.7 (#23) | 72.9 (#32) | 11.5 | 0.761 | 0.960 |
| 2016 CLE -- 1-15 | bottom | 65.2 (#32) | -- | -- | -- | -- | -- |
| 2021 NO -- post-Brees cap hell | report | 103.6 (#15) | -- | -- | -- | -- | -- |
| 2022 NO -- post-Brees cap hell | report | 97.5 (#18) | 98.2 (#18) | 95.0 (#21) | 33.3 | 1.020 | 1.026 |

`C_pos` is the λ=1, latest-date, unfloored build of §7 — the column the recommended build replaces. `cost` is the weighted cost index; `R` is that cost after the floor, relative to the league average.

### 15.4 Headline diagnostics

| build | n | corr_P | corr_win_pct | mean_abs_rank_shift | pct_shift_ge5 | max_rank_shift | yoy_autocorr | adj_persistence |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| performance only (baseline) | 288 | 1.000 | 0.956 | 0.00 | 0.0 | 0 | 0.402 | -- |
| Cap+ (Total-Cost), λ = 1.0 | 288 | 0.966 | 0.923 | 1.74 | 10.4 | 13 | 0.386 | +0.125 |
| **Cap+ (Total-Cost), λ = 1.5 — recommended** | 288 | 0.950 | 0.906 | 2.23 | 14.6 | 15 | 0.386 | +0.158 |
| Cap+ (Total-Cost), λ = 2.0 | 288 | 0.915 | 0.871 | 2.82 | 20.5 | 17 | 0.389 | +0.187 |

The recommended build moves teams **2.23 rank places** on average versus ranking on performance alone, with **14.6% moving 5+ spots** and a biggest single move of **15 places**. Correlation with performance falls from 0.998 (candidate C as written) to **0.950**, and with win percentage to **0.906**. It persists year to year at **0.386** against 0.402 for performance — but the *cap adjustment alone* (Cap+ minus performance) persists at only **+0.158**. Cap+ is single-season resource accounting, not a front-office quality score, and the metric should say so itself.

### 15.5 What the dead-dollar weight λ does

Effect on the three biggest dead-money charges in each season (27 team-seasons), versus those same teams' own performance rating. Negative = the metric punished them.

| λ | top-3 dead-money teams | 2022 ATL | 2025 NO | 2023 LA | 2024 DEN | 2023 SF |
| --- | --- | --- | --- | --- | --- | --- |
| 1.0 | -0.63 places / -1.1 points | 96 (#19) | 94 (#23) | 106 (#11) | 113 (#10) | 134 (#1) |
| **1.5 (recommended)** | -3.22 places / -5.5 points | 89 (#27) | 86 (#27) | 95 (#20) | 104 (#13) | 134 (#1) |
| 2.0 | -5.33 places / -9.2 points | 83 (#30) | 80 (#28) | 87 (#27) | 99 (#20) | 135 (#1) |

At λ=1 the page would say "dead money included" and dead money would do essentially nothing (-0.63 places, -1.1 points, and 2022 Atlanta lands 19th — better than its 24th-place performance rank, so the brief's "famous cap disasters rate poorly" requirement fails). At λ=2 the metric starts punishing charges that were ordinary for their season: 2024 Denver drops to 20th on a charge that consumed exactly the 2024 median share of the cap. **λ=1.5 is a published economic claim, and the brief's Atlanta requirement passes only because of it.**

### 15.6 Kansas City, 2014–2025

| season | perf_index | rk_perf_index | capplus_rec | rk_capplus_rec | cost_rec | dead_money_M |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2014 | 107.9 | 12 | 106.7 | 12 | 0.953 | 3.5 |
| 2015 | 117.7 | 6 | 114.5 | 8 | 1.061 | 21.9 |
| 2017 | 110.9 | 9 | 108.6 | 8 | 0.986 | 8.6 |
| 2018 | 122.9 | 2 | 120.0 | 3 | 1.012 | 16.8 |
| 2019 | 118.4 | 5 | 122.6 | 3 | 0.794 | 0.9 |
| 2022 | 127.3 | 3 | 130.5 | 2 | 0.969 | 8.0 |
| 2023 | 113.2 | 7 | 116.3 | 6 | 0.968 | 7.7 |
| 2024 | 113.9 | 8 | 119.4 | 3 | 0.997 | 12.7 |
| 2025 | 100.2 | 18 | 104.7 | 16 | 1.047 | 20.3 |

The arc a fan believes and the cash-based candidates could not produce: **#3 in 2019**, **#2 in 2022**, **#6 in 2023**, **#16 in 2025**.

### 15.7 All-time top 15 and bottom 15 (288 team-seasons)

- Top 15: 2019 BAL 14-2 **138.1** · 2022 SF 13-4 **135.6** · 2024 DET 15-2 **134.0** · 2023 SF 12-5 **133.9** · 2022 KC 14-3 **130.5** · 2014 SEA 12-4 **129.9** · 2022 BUF 13-3 **129.0** · 2023 BAL 13-4 **128.8** · 2015 CAR 15-1 **128.1** · 2017 MIN 13-3 **127.9** · 2025 NE 14-3 **127.9** · 2024 BAL 12-5 **127.1** · 2019 NE 12-4 **126.2** · 2023 DAL 12-5 **125.2** · 2025 LA 12-5 **124.6**

- Bottom 15: 2023 CAR 2-15 **62.9** · 2025 LV 3-14 **64.7** · 2025 NYJ 3-14 **70.1** · 2025 TEN 3-14 **71.4** · 2018 ARI 3-13 **71.7** · 2022 HOU 3-13 **71.9** · 2024 NYG 3-14 **72.8** · 2017 CLE 0-16 **72.9** · 2024 CAR 5-12 **73.4** · 2014 LV 3-13 **75.0** · 2019 CIN 2-14 **75.4** · 2019 WAS 3-13 **76.1** · 2018 SF 4-12 **76.2** · 2025 CLE 5-12 **76.4** · 2014 TEN 2-14 **76.5**

### 15.8 The cost index is not a percentage of cap (memo condition 4)

At λ=1.5, **44.1% of team-seasons have a weighted cost above 1.00** (127 of 288), against 14.2% on the plain cap-consumed figure. The weighted number is a **cost index** and must never be labelled "% of cap used"; both are in the mart (`cost_rec` and `cap_consumed_rec`) and the memo requires them published side by side.

---

Files written: `data/marts/capplus_candidates.csv` (861 rows × 69 columns; candidates null before 2013, C null outside full-coverage seasons, scenario brackets populated only for team-seasons with an observed dead-money figure, recommended build populated for the nine same-stage seasons), `audit/findings_capplus_backtest.md` (this file).
