# Contracts / salary-cap data audit — nflverse `historical_contracts`

Scope: `nflverse-data/releases/download/contracts/historical_contracts.parquet` (OTC-derived, openly licensed, redistributed by nflverse). Feeds `DATA_AUDIT.md` and the Cap+ memo.

Reproduce with `python3.11 audit/audit_contracts.py` (idempotent; leaves `data/raw/` empty). Asset is ~6.7 MB and is scanned remotely via DuckDB `httpfs` once into memory; `--download` is a delete-after-load fallback.

**Bottom line up front.**

| Question | Verdict |
| --- | --- |
| Tier 2 boundary | **2013.** 1994–2012 is a sample of notable contracts, not a roster. |
| Per-player cap number accuracy | **Exact.** Both golden checks match to the dollar (delta $0). |
| Dead money | **NOT derivable. Not present in the data in any form.** |
| Cash spending | **Derivable**, same 2013+ window, same caveats as cap. |
| Positional allocation | **Derivable** for 2013+; position is *at signing*, 7.4% drift. |
| Team-season cap mart | 416 rows (32 teams × 2013–2025) written. |

The single most important caveat for Cap+: `cap_used_total` is **cap held by players on the roster**, not **cap used**. It sits a structural 15–22% below each team's cap because dead money is absent. It is not a cap-utilization figure and must never be presented as one.

---

## 1. Environment

python 3.11.15 · pandas 3.0.5 · pyarrow 25.0.0 · duckdb 1.5.5 · requests 2.33.1. DuckDB `httpfs` pointed at `HTTPS_PROXY` and `/root/.ccr/ca-bundle.crt`; TLS verification enabled throughout.

---

## 2. Q1 — Schema

**51,734 rows, one per contract signed. 12,857 distinct players (`otc_id`).**

### 2.1 The structural fact that governs everything else

> The nested `cols` column is **not contract-specific**. It is the player's **entire career cap table**, replicated byte-identically onto *every* contract row that player has.

Evidence: of 6,788 players holding more than one contract row, **6,788 (100%)** have an identical `cols` payload across all their rows. Russell Wilson has 6 contract rows (2012, 2015, 2019, 2022, 2024, 2025); all six carry the same 14-year table spanning 2012–2025. Patrick Mahomes has 3 contract rows; all three carry the same 2017–2035 table.

Consequence: naively unnesting gives **304,313** rows and multiplies each player's cap hit by his contract count. After dropping the per-contract `Total` footer row and deduplicating on `(otc_id, year)`: **41,976** true player-season rows. Any pipeline that skips this dedup overstates team cap totals by roughly 3–7×.

### 2.2 Top-level columns (n = 51,734)

| Column | Type | % non-null | Notes |
| --- | --- | ---: | --- |
| `player` | VARCHAR | 100.0% | |
| `position` | VARCHAR | 100.0% | 18 values; *at signing* (see §6) |
| `team` | VARCHAR | 100.0% | Nickname for single-team deals (`Chiefs`), else slash-joined abbrevs (`SEA/DEN`, `ATL/CIN/SF/LV`) |
| `is_active` | BOOLEAN | 100.0% | Only 2,924 true; `true` only for `year_signed` 2020+. Means "contract currently in force", not "player active" |
| `year_signed` | INTEGER | 100.0% | Range 0–2026; **`0` is a junk sentinel** |
| `years` | INTEGER | 99.95% | |
| `value`, `apy`, `guaranteed`, `apy_cap_pct` | DOUBLE | 100.0% | `value`/`apy`/`guaranteed` in **$ millions** |
| `inflated_value`, `inflated_apy`, `inflated_guaranteed` | DOUBLE | 100.0% | Cap-inflation-adjusted restatements |
| `player_page` | VARCHAR | 100.0% | OTC URL |
| `otc_id` | INTEGER | **100.0%** | Primary join key |
| `gsis_id` | VARCHAR | **91.9%** | 10,424 / 12,857 players (81.1%) |
| `date_of_birth` | VARCHAR | 72.9% | |
| `height` / `weight` / `college` | VARCHAR | 96.4% / 96.3% / 97.5% | |
| `draft_year` / `draft_round` / `draft_overall` / `draft_team` | — | 98.3% / **42.8%** / **42.7%** / 96.8% | round/overall null for undrafted |
| `cols` | LIST(STRUCT) | 88.6% | 5,901 rows have no year detail (749 are 2026 rookie projections) |

### 2.3 Nested `cols` struct fields (n = 41,976 deduped player-seasons)

| Field | Type | % non-null | Notes |
| --- | --- | ---: | --- |
| `year` | **VARCHAR** | 100.0% | Contains `'Total'` (footer), `'0'`, `'201'`; must be `TRY_CAST` + range-filtered |
| `team` | VARCHAR | 100.0% | **Nickname**, not abbreviation. Includes `'Total'` on footer rows |
| `base_salary` | DOUBLE | 100.0% | $ millions |
| `prorated_bonus` | DOUBLE | 81.2% | |
| `roster_bonus` | DOUBLE | 37.3% | |
| `guaranteed_salary` | DOUBLE | 59.3% | |
| `cap_number` | DOUBLE | **100.0%** | $ millions — the load-bearing field |
| `cap_percent` | DOUBLE | 96.6% | **Denominator is the team's *adjusted* cap, not the league cap** (see §4.3) |
| `cash_paid` | DOUBLE | **100.0%** | $ millions, **annual not cumulative** |
| `workout_bonus` | DOUBLE | 38.0% | |
| `other_bonus` | DOUBLE | 15.3% | |
| `per_game_roster_bonus` | DOUBLE | 36.7% | |
| `option_bonus` | DOUBLE | 4.9% | |

There is **no** `cash_pct` field (the spec's guess); `cash_paid` share must be computed. Field is named `cap_percent`, not `cap_pct`.

### 2.4 Join keys

| Key | Coverage | Uniqueness |
| --- | --- | --- |
| `otc_id` | 51,734 / 51,734 contracts (100%) | 1 `otc_id` → 1 `gsis_id` always. **Use as the internal key.** |
| `gsis_id` | 47,540 / 51,734 contracts (91.9%); 10,424 / 12,857 players (81.1%) | **32 `gsis_id`s map to >1 `otc_id`** — duplicate OTC player records. De-dup on join to nflverse player data. |

The 18.9% of players lacking `gsis_id` are overwhelmingly pre-2010 and marginal-roster; for the 2013+ mart the practical loss is small, but any **player-level** Cap+ join to pbp/roster data will silently drop them.

### 2.5 Team-code aliases OTC introduces

`cols.team` uses **nicknames**. Handled locally in `audit_contracts.py` via `NICKNAME_TO_CODE`; **`team_codes.py` was not edited**. Aliases not known to `team_codes.py`:

| OTC value | Maps to | Note |
| --- | --- | --- |
| `Oilers` | `TEN` | Houston Oilers pre-1997, same franchise as Titans |
| `Redskins` | `WAS` | pre-2020 |
| `Washington` | `WAS` | 2020–2021 "Washington Football Team" |
| `Commanders` | `WAS` | 2022+ |
| `Rams` | `LA` | via `normalize_team` |
| `Chargers` / `Raiders` | `LAC` / `LV` | current-franchise convention |

OTC's **top-level** `team` also emits `LAR` (already mapped `LAR → LA` in `team_codes.py`) and slash-joined multi-team strings. All 35 nicknames map cleanly; **0 unmapped**. Mart team codes join 1:1 with `team_season_results.csv`.

---

## 3. Q2 — Player-season cap coverage and the Tier 2 boundary

Ratio = `sum(cap_number)` for a team-season ÷ that season's league cap. 2010 is uncapped (no ratio).

| Season | player-seasons | teams | players/team (med) | ratio med | ratio min | ratio max | q25 | q75 | teams in 0.85–1.15 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1994 | 23 | 15 | 1 | 0.059 | 0.008 | 0.237 | 0.022 | 0.097 | 0/15 |
| 1995 | 30 | 17 | 2 | 0.075 | 0.011 | 0.231 | 0.033 | 0.121 | 0/17 |
| 1996 | 33 | 17 | 2 | 0.077 | 0.013 | 0.259 | 0.055 | 0.130 | 0/17 |
| 1997 | 39 | 20 | 2 | 0.081 | 0.011 | 0.251 | 0.051 | 0.117 | 0/20 |
| 1998 | 45 | 23 | 2 | 0.082 | 0.021 | 0.308 | 0.054 | 0.116 | 0/23 |
| 1999 | 46 | 24 | 2 | 0.093 | 0.021 | 0.273 | 0.069 | 0.144 | 0/24 |
| 2000 | 50 | 23 | 2 | 0.097 | 0.022 | 0.218 | 0.071 | 0.149 | 0/23 |
| 2001 | 56 | 24 | 2 | 0.107 | 0.028 | 0.249 | 0.065 | 0.146 | 0/24 |
| 2002 | 69 | 27 | 2 | 0.115 | 0.006 | 0.256 | 0.060 | 0.144 | 0/27 |
| 2003 | 91 | 29 | 3 | 0.106 | 0.005 | 0.344 | 0.062 | 0.151 | 0/29 |
| 2004 | 123 | 30 | 4 | 0.131 | 0.006 | 0.263 | 0.059 | 0.153 | 0/30 |
| 2005 | 170 | 32 | 5 | 0.139 | 0.007 | 0.316 | 0.048 | 0.199 | 0/32 |
| 2006 | 233 | 32 | 7 | 0.176 | 0.011 | 0.370 | 0.079 | 0.223 | 0/32 |
| 2007 | 297 | 32 | 9 | 0.173 | 0.028 | 0.332 | 0.104 | 0.253 | 0/32 |
| 2008 | 388 | 32 | 12 | 0.237 | 0.053 | 0.477 | 0.189 | 0.281 | 0/32 |
| 2009 | 496 | 32 | 15 | 0.332 | 0.117 | 0.526 | 0.248 | 0.390 | 0/32 |
| 2010 | 648 | 32 | 20 | — uncapped — | | | | | — |
| 2011 | 986 | 32 | 31 | 0.522 | 0.336 | 0.724 | 0.473 | 0.599 | 0/32 |
| 2012 | 1,354 | 32 | 43 | 0.720 | 0.518 | 0.980 | 0.619 | 0.764 | 2/32 |
| **2013** | **2,018** | **32** | **63** | **0.884** | 0.533 | 1.013 | 0.805 | 0.934 | **18/32** |
| 2014 | 2,306 | 32 | 71 | 0.880 | 0.747 | 0.993 | 0.848 | 0.915 | 24/32 |
| 2015 | 2,372 | 32 | 74 | 0.874 | 0.754 | 1.010 | 0.808 | 0.920 | 19/32 |
| 2016 | 2,426 | 32 | 76 | 0.881 | 0.610 | 0.985 | 0.838 | 0.921 | 23/32 |
| 2017 | 2,451 | 32 | 77 | 0.908 | 0.637 | 0.974 | 0.833 | 0.946 | 23/32 |
| 2018 | 2,429 | 32 | 76 | 0.890 | 0.633 | 1.037 | 0.858 | 0.938 | 27/32 |
| 2019 | 2,454 | 32 | 76 | 0.888 | 0.587 | 1.023 | 0.833 | 0.906 | 21/32 |
| 2020 | 2,617 | 32 | 81 | 0.901 | 0.661 | 1.086 | 0.844 | 0.940 | 23/32 |
| 2021 | 2,620 | 32 | 82 | 0.903 | 0.700 | 0.995 | 0.828 | 0.943 | 21/32 |
| 2022 | 2,583 | 32 | 81 | 0.867 | 0.539 | 0.966 | 0.757 | 0.900 | 19/32 |
| 2023 | 2,566 | 32 | 80 | 0.850 | 0.613 | 0.963 | 0.751 | 0.890 | 16/32 |
| 2024 | 2,604 | 32 | 82 | 0.770 | 0.645 | 0.965 | 0.724 | 0.855 | 9/32 |
| 2025 | 2,659 | 32 | 84 | 0.821 | 0.563 | 0.970 | 0.767 | 0.883 | 12/32 |

### 3.1 Boundary: **2013**

Three independent step changes land on the same season:

| Metric | 2012 | 2013 | change |
| --- | ---: | ---: | ---: |
| Player-seasons | 1,354 | 2,018 | **+49%** |
| Players per team (median) | 43 | 63 | **+47%** |
| Team cap ratio (median) | 0.720 | 0.884 | **+0.164** |
| Teams in 0.85–1.15 | 2 | 18 | **+16** |

After 2013 the curve **plateaus**: median ratio stays in 0.77–0.91 for all thirteen seasons 2013–2025 with no further regime change. Before 2013 it decays monotonically to 0.72 (2012), 0.52 (2011), 0.33 (2009), and <0.15 by 2004 — i.e. pre-2013 rows are a *sample of notable contracts*, not a roster. 43 players/team in 2012 cannot represent a 53-man roster; 63 in 2013 and 71–84 thereafter can.

Conservative alternative: **2014**, which is materially tighter (min ratio 0.747 vs 0.533; q25–q75 spread 0.067 vs 0.129; 24/32 in band vs 18/32). 2013's low tail is genuinely explainable — the 0.533 outlier is 2013 Oakland, a record dead-money team — so 2013 is retained, and 2014 is the fallback if a downstream consumer needs a tighter guarantee.

### 3.2 Why the median never reaches 1.0 — and why that is *not* noise

**The ratio never plausibly reaches 1.0 in any season, because dead money is structurally absent from this dataset (§4).** The ~10–20% shortfall is not sampling error; it is a specific, named omission. Proof: the fifteen lowest team-seasons in the trusted window are a roll-call of record dead-money teams.

| Season | Team | ratio | The dead money that is missing |
| ---: | --- | ---: | --- |
| 2013 | LV | 0.533 | Raiders' record post-Palmer/Seymour dead cap |
| 2022 | CHI | 0.539 | Khalil Mack + Robert Quinn trade acceleration |
| 2025 | NYJ | 0.563 | Aaron Rodgers separation |
| 2022 | ATL | 0.571 | Matt Ryan trade (~$40.5M) |
| 2019 | MIA | 0.587 | Tannehill / Tunsil teardown |
| 2025 | NO | 0.589 | post-Carr restructure fallout |
| 2016 | CLE | 0.610 | Browns teardown |
| 2023 | LA | 0.613 | Rams post-Ramsey/Allen acceleration |
| 2018 | BUF | 0.633 | Tyrod Taylor et al. |
| 2017 | SF | 0.637 | Kaepernick / roster purge |
| 2022 | HOU | 0.644 | Deshaun Watson trade |
| **2024** | **DEN** | **0.645** | **Russell Wilson ($53M) — the exact golden-check case** |
| 2025 | SEA | 0.655 | Geno Smith / DK Metcalf departures |
| 2017 | CLE | 0.658 | Browns teardown |
| 2023 | ARI | 0.660 | Hopkins / Murray restructures |

The 2024 dip (median 0.770, only 9/32 in band) is the league-record dead-money year, not a data-quality regression. **The shortfall is a signal, not a defect — but it is a signal we cannot quantify from this source alone**, because it also mixes in practice-squad and minimum-salary players OTC does not list.

---

## 4. Q3 — Dead money: **NOT DERIVABLE**

### 4.1 How the year-by-year detail actually works

`cols` is a **player-following career table: exactly one row per player per year, attributed to the team the player was on that year.** Verified: **zero** player-years anywhere in the dataset have more than one team row or more than one cap number. When a player is released or traded, the table simply **switches teams** — the charge left behind on the old team is never written.

Russell Wilson's table (identical on all 6 of his contract rows):

| Year | Team in data | cap_number |
| ---: | --- | ---: |
| 2021 | Seahawks | $32,000,000 |
| 2022 | Broncos | $17,000,000 |
| 2023 | Broncos | $22,000,000 |
| **2024** | **Steelers** | **$1,210,000** |
| **2025** | **Giants** | **$11,029,412** |

Denver's $53.0M (2024) and $32.0M (2025) dead charges — the largest in NFL history — **do not appear anywhere in the file.** Wilson's career total in the data is $206.6M; the $85M Denver ate is simply not represented.

### 4.2 Every inference route tested, all fail

| Route | Test | Result |
| --- | --- | --- |
| A | A second row for the same player-season on the team he left | **0 such rows exist in the entire dataset** |
| B | Wilson rows on DEN in 2024/2025 | 0 — DEN rows exist only for 2022–2023 |
| C | An explicit dead-money / termination / release / void field | **No such field** at either level |
| D | Any DEN 2024 charge ≥ $40M that could be Wilson's | 0 — largest DEN 2024 charge is $20,800,000 |
| E | 8 more high-profile separations | **8/8 fail** — see below |

| Player | Season | Team that ate dead money | Rows found on |
| --- | ---: | --- | --- |
| Matt Ryan | 2022 | ATL | IND only |
| Carson Wentz | 2021 | PHI | IND only |
| Trey Lance | 2023 | SF | DAL only |
| Jimmy Garoppolo | 2023 | SF | LV only |
| Baker Mayfield | 2022 | CLE | LA only |
| Kirk Cousins | 2024 | MIN | ATL only |
| Brock Osweiler | 2017 | HOU | DEN only |
| Aaron Rodgers | 2025 | NYJ | PIT only |

**Verdict: dead money is not present, not flagged, and not inferable from this dataset. There is no method — precise or approximate — that recovers it.** `dead_money_total` and `dead_money_pct` are emitted in the mart as always-null columns purely so downstream schema is stable.

### 4.3 The one honest proxy — and its limits

`cap_percent` is **not** `cap_number ÷ league cap`; its denominator is the **team's adjusted cap** (league cap + carryover). Only 88.3% of player-seasons agree with the league-cap denominator to within 0.001, and the disagreements are systematic: 2018 SF implies $237.3M vs a $177.2M league cap (+$60M carryover); 2020 IND implies $239.3M vs $198.2M.

Inverting it (`cap_number ÷ cap_percent`, median over players with `cap_percent > 0.02`) recovers each team's adjusted cap with **relative SD ≤ 1.8% within a team-season** — that dispersion is just the field's 3-decimal rounding. This is a genuine bonus field, shipped as `team_adjusted_cap_implied`.

The residual `team_adjusted_cap_implied − cap_used_total` is shipped as `unaccounted_vs_adjusted`. It is an **upper bound** on dead money, not dead money:

| Season | unaccounted_pct median | Season | unaccounted_pct median |
| ---: | ---: | ---: | ---: |
| 2013 | 0.152 | 2020 | 0.142 |
| 2014 | 0.138 | 2021 | 0.141 |
| 2015 | 0.158 | 2022 | 0.145 |
| 2016 | 0.141 | 2023 | 0.170 |
| 2017 | 0.119 | 2024 | **0.246** |
| 2018 | 0.145 | 2025 | 0.203 |
| 2019 | 0.168 | | |

It conflates dead money with practice-squad, minimum-salary and injury-settlement charges OTC omits. **Do not label it dead money.** It rises exactly where dead money is known to have risen (2024), which is suggestive but not sufficient for a published metric.

---

## 5. Q4 — Cash spending: derivable

`cash_paid` is **annual, not cumulative** (per-year values sum to the contract's `Total` footer row in 95.5% of contracts; the residual is rounding and void years). 100% non-null wherever `cap_number` is non-null, so cash coverage is identical to cap coverage season-for-season — the same 2013 boundary applies.

| Season | cash/league cap: median | min | max |
| ---: | ---: | ---: | ---: |
| 2013 | 0.964 | 0.685 | 1.300 |
| 2014 | 0.930 | 0.741 | 1.121 |
| 2015 | 0.980 | 0.749 | 1.150 |
| 2016 | 0.958 | 0.649 | 1.262 |
| 2017 | 0.959 | 0.743 | 1.178 |
| 2018 | 0.972 | 0.727 | 1.286 |
| 2019 | 0.955 | 0.687 | 1.197 |
| 2020 | 1.029 | 0.696 | 1.201 |
| 2021 | 1.073 | 0.821 | 1.401 |
| 2022 | 1.055 | 0.555 | 1.308 |
| 2023 | 1.026 | 0.748 | 1.275 |
| 2024 | 1.004 | 0.769 | 1.345 |
| 2025 | 1.031 | 0.740 | 1.189 |

Cash ratios sit **near or above 1.0** and are far better behaved than the cap ratios — expected, since cash spending genuinely can exceed the cap (signing bonuses are paid up front, prorated later) and cash is not distorted by the dead-money omission the way cap is. Caveat: dollars a team paid to a *released* player are still missing, so this is "cash to players on the roster."

**`cash_spent_total` is the more trustworthy of the two aggregate columns and is the better denominator for a first-cut Cap+ if a defensible normalization is needed before the dead-money gap is closed.**

---

## 6. Q5 — Positional allocation: derivable, with a definition to state

`position` is a **top-level (per-contract) field recorded at signing**, not per player-season. It drifts across a player's own contracts for **949 / 12,857 players (7.4%)** — mostly RB↔FB, TE↔FB, and occasional data-entry slips (`Mark Glowinski RG@2022, RB@2024, RG@2024`).

Resolution used: for each player-season, take the position from that player's **most recent signing at or before that season**, falling back to his earliest signing. Documented as "position as of the deal then in force." 18 raw positions collapse to 9 groups (QB / RB+FB / WR / TE / OL / DL=IDL+ED / LB / DB=CB+S / ST=K+P+LS). Unmapped cap share: **0.375%**.

Face validity, league-wide 2023 cap share by group:

| Group | share | Group | share |
| --- | ---: | --- | ---: |
| DL | 22.0% | LB | 6.8% |
| OL | 20.1% | TE | 5.2% |
| DB | 16.2% | RB | 5.0% |
| WR | 12.3% | ST | 2.9% |
| QB | 9.6% | | |

Median team QB cap share by season: 2013 = 0.093, 2016 = 0.127, 2018 = 0.135, 2021 = 0.080, 2023 = 0.071, 2025 = 0.104. All plausible.

**Verdict: cap % by position group per team-season is computable and credible for 2013–2025** — but as a share of *rostered* cap, since the denominator inherits the dead-money omission. Written to `data/curated/staging/contracts_position_alloc.csv` (3,819 season-team-group rows).

---

## 7. Q6 — Golden checks

| Check | Expected | Pipeline | Delta | Verdict |
| --- | ---: | ---: | ---: | --- |
| Mahomes KC 2023 cap number | $37,133,824 | **$37,133,824** | **$0** | **EXACT** |
| Russell Wilson SEA 2013 cap hit | $681,085 | **$681,085** | **$0** | **EXACT** |
| Russell Wilson DEN 2024 dead money | $53,000,000 | $0 (absent) | −$53,000,000 | **NOT DERIVABLE** |
| Russell Wilson DEN 2025 dead money | $32,000,000 | $0 (absent) | −$32,000,000 | **NOT DERIVABLE** |

**Mahomes 2023 snapshot identification:** the data carries $37,133,824, which matches the **September 2023 rework** — the final settled figure — not the $49.293M scheduled number or the ~$39.7M March restructure. The dataset therefore stores the **end-of-league-year settled cap number**, not an in-season snapshot. This matters for any "as of week N" framing of Cap+: none is possible; every figure is a season-final restatement.

**Wilson dead-money rows:** the only 2024 row for Wilson is Pittsburgh at $1,210,000 and the only 2025 row is the Giants at $11,029,412. No Denver row exists in either season.

---

## 8. Q7 — `data/marts/team_season_cap.csv`

**416 rows = 32 teams × 13 seasons (2013–2025).** All values in **USD** (source is $ millions; converted). Team codes normalized through `normalize_team`; joins 1:1 with `team_season_results.csv` over the same window (verified in-script).

| Column | Meaning |
| --- | --- |
| `season`, `team` | key |
| `n_players` | player-seasons contributing |
| `cap_used_total` | Σ `cap_number` — **cap held by rostered players, NOT cap used** |
| `league_cap` | from `data/curated/league_cap.csv` |
| `cap_pct_of_league` | `cap_used_total / league_cap` (null when league cap is null, i.e. 2010 — outside this window) |
| `team_adjusted_cap_implied` | back-derived from `cap_percent` (§4.3) |
| `cap_pct_of_adjusted` | `cap_used_total / team_adjusted_cap_implied` |
| `dead_money_total`, `dead_money_pct` | **always null** — not derivable (§4) |
| `cash_spent_total`, `cash_pct_of_league` | annual cash to rostered players |
| `unaccounted_vs_adjusted`, `unaccounted_pct` | residual = dead money + unlisted minimum/PS charges. **Upper bound on dead money; do not label as dead money** |

**Exclusions and why:**

| Excluded | Reason |
| --- | --- |
| 1994–2012 | Coverage is a sample of notable contracts, not a roster (§3). 2012 at 43 players/team and ratio 0.720 is the closest near-miss and still not defensible. |
| 2010 | Uncapped year — no denominator exists. Also inside the excluded range. |
| 2026+ | Future/projected contract years; 749 rows are 2026 rookie projections with no `cols` at all. |
| `dead_money_*` | Structurally absent from source. |

Consistency checks, all PASS: 32×13 row count; team codes join to `team_season_results`; 1:1 join over 2013–2025; no null `cap_used_total`; adjusted-cap back-out relative SD ≤ 0.0177; both exact golden checks; `data/raw/` empty.

---

## 9. Q8 — Pre-2013 options

### 9.1 What CAN be honestly reconstructed from this data before 2013

The **top-level contract columns are complete back to 1994** (`value`, `apy`, `guaranteed`, `apy_cap_pct`, `years`, `position`, `year_signed` all ≥99.9% non-null for every year). The pre-2013 sample is biased toward *large* deals — median APY was $1.3–2.0M in 1994–2003 when the league minimum was a few hundred thousand — which makes it useless for team totals but well suited to top-of-market questions.

| Aggregate | Usable pre-2013? | Notes |
| --- | --- | --- |
| Individual star contract terms (value / APY / guarantee / APY as % of cap) | **Yes, 1994+** | 12–65 contracts/yr 1994–2003, 123–815/yr 2004–2012 |
| Positional **market price** index — median/top-decile APY-as-%-of-cap by position by signing year | **Yes, cautiously, ~2004+** | Needs ≥17 positions represented; first satisfied in 2004 (125 contracts, 17 positions) |
| Franchise-level "did this team sign a top-of-market deal" event counts | **Yes, ~2006+** | All 32 teams first appear as a single-team signer in 2006; only 7 teams in 1994 |
| Team-season **cap allocation / utilization** | **No** | Ratio <0.35 before 2010 |
| Team-season **cash spend** | **No** | Same sample bias |
| Team-season **positional cap mix** | **No** | Denominator is a biased sample |
| Dead money, any era | **No** | Not in the data at all |

Concretely: a pre-2013 Cap+ cannot be built, but a **"top-of-market APY as % of cap, by position, by year"** series back to roughly 2004 can — and that is a legitimate Tier 1 offering that reframes the gap as a different product rather than a missing one.

### 9.2 External public-record sources that could fill the gap (described, not scraped)

| Source | Fills | Access notes |
| --- | --- | --- |
| **NFLPA public salary-cap reports** | Team-by-team cap room, adjusted cap, and **dead money** — the exact missing quantity. Union-published, authoritative. | Public-facing NFLPA reporting; would need a licensing/ToS review before ingestion. |
| **Over The Cap team-level cap-space and dead-money tables** | Dead money and adjusted cap per team-season, 2011+. Same upstream as this dataset, but the *team* pages rather than the *player* pages nflverse mirrors. | OTC's team tables are **not** in the nflverse release. Requires a direct data agreement — explicitly out of scope here (no scraping). |
| **Spotrac team cap pages** | Parallel dead-money and cap-space series. | Commercial; licensing required. Out of scope here. |
| **NFL Management Council / league year-end cap accountings** | Definitive settled figures. | Not publicly distributed; reaches the public only through reporting. |
| **Contemporaneous press reporting** (AP/ESPN/NFL.com cap-day stories, e.g. the sources already cited in `league_cap.csv`) | League cap ceilings 1994+ (**already captured**), plus scattered per-team dead-money figures for notable cases. | Free and citable, but per-team coverage is anecdotal — fine for golden checks, not for a complete mart. |
| **Pro-Football-Reference** | Roster/AV/salary fragments for older seasons. | Salary coverage is thin and inconsistent pre-2011; would not close the gap. |

**Recommendation:** the NFLPA cap reports are the single highest-value addition — they supply dead money and adjusted cap directly, which would convert `cap_used_total` from "cap held by rostered players" into true cap utilization and unlock a defensible Cap+ denominator. Everything else is either redundant with what we have or commercially gated.

---

## 10. Red flags for downstream consumers

1. **The `cols` replication trap.** Unnesting without deduplicating on `(otc_id, year)` inflates every team total by 3–7×. This is the highest-severity failure mode in the dataset and it fails *silently* — the numbers still look like plausible dollars.
2. **`cap_used_total` is not cap utilization.** It runs 15–22% below each team's actual cap because dead money is absent. Publishing it as "cap used" would be wrong, and the error is *largest exactly for the most interesting teams* — the ones in cap hell. This biases Cap+ **in favor of badly-run teams**, the opposite of the metric's intent. Cap+ must either use `cash_spent_total`, use `cap_pct_of_adjusted` with an explicit caveat, or wait for an external dead-money source.
3. **`cap_percent`'s denominator is the adjusted cap, not the league cap.** Anyone assuming otherwise gets errors up to 0.053 (2018 Garoppolo: 0.156 reported vs 0.209 against league cap).
4. **`year` is VARCHAR** and contains `'Total'`, `'0'`, `'201'`. `'Total'` rows carry real-looking dollar sums (45,833 of them) and will corrupt any aggregate that does not filter them.
5. **All money is in $ millions** in the source. The mart converts to USD; nothing else does.
6. **Figures are season-final restatements, not in-season snapshots.** Mahomes 2023 resolves to the September rework, not the March or scheduled figure. No "as of week N" cap view is possible.
7. **32 `gsis_id`s map to multiple `otc_id`s**, and 18.9% of players have no `gsis_id` at all — player-level joins to pbp/roster data will silently drop rows unless `otc_id` is the internal key.
8. **`is_active` is misleading**: it means "contract currently in force" (true only for 2020+ signings), not "player is active."
9. **2013 is the boundary, but 2013 is the weakest year inside it** (63 players/team vs 71–84 later; min ratio 0.533). If a consumer needs a tight guarantee, start at 2014.
10. **2024's low coverage (median 0.770) is real, not a bug** — it is the record dead-money season. Do not "fix" it.
