# Performance data audit — play-by-play/EPA and schedules/results

Scope: nflverse play-by-play (EPA) and nflverse/nfldata schedules & results, seasons 1999–2025. Feeds `DATA_AUDIT.md`.

Reproduce with `python3.11 audit/audit_pbp.py` then `python3.11 audit/audit_schedules.py` (both idempotent, both leave `data/raw/` empty).


## 1. Environment

| Component | Version |
| --- | --- |
| python | 3.11.15 |
| pandas | 3.0.5 |
| pyarrow | 25.0.0 |
| duckdb | 1.5.5 |
| requests | 2.33.1 |
| numpy | 2.4.6 |
| pip | 24.0 |

Installed via pip through the session's outbound HTTPS proxy (`HTTPS_PROXY`); TLS verification left enabled throughout. DuckDB's `httpfs` extension is pointed at the same proxy and at `/root/.ccr/ca-bundle.crt`.


## 2. Sources and verified coverage

| Dataset | URL pattern | Verified range | Notes |
| --- | --- | --- | --- |
| Play-by-play / EPA | `nflverse-data/releases/download/pbp/play_by_play_{YEAR}.parquet` | 1999–2025 (27 seasons) | All 27 assets returned HTTP 200. Missing years: none. **2025 is present** (~20.3 MB, 48771 rows). 2026 returns 404, as expected. |
| Schedules / results | `nfldata/master/data/games.csv` | 1999–2025 complete | File itself extends to 2026; season(s) [np.int64(2026)] are future/unplayed schedule rows and are excluded from the mart. |

Read strategy: DuckDB `httpfs` scans each season's release parquet remotely and projects only the six needed columns (`season, season_type, posteam, defteam, play_type, epa`) out of 372, so no raw parquet is ever written to disk. `data/raw/` is empty at rest. `audit/audit_pbp.py --download` is a one-season-at-a-time fallback that deletes each file immediately after aggregating.


## 3. Per-season summary

`pbp rows` = all rows in the season's parquet (REG + POST). `epa null %` = null rate of `epa` restricted to scrimmage plays (`play_type IN ('pass','run')`). `teams` = distinct offensive teams in REG scrimmage plays. `REG games` / `POST games` from `games.csv`.

| Season | pbp rows | pass/run plays | epa null % (pass/run) | teams | lg off EPA/play | REG games | POST games |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1999 | 46,136 | 32,134 | 0.0031% | 31 | -0.0561 | 248 | 11 |
| 2000 | 45,491 | 31,965 | 0.0156% | 31 | -0.0376 | 248 | 11 |
| 2001 | 44,969 | 32,457 | 0.0123% | 31 | -0.0494 | 248 | 11 |
| 2002 | 47,355 | 33,874 | 0.0000% | 32 | -0.0277 | 256 | 11 |
| 2003 | 46,811 | 33,202 | 0.0000% | 32 | -0.0395 | 256 | 11 |
| 2004 | 46,705 | 32,995 | 0.0000% | 32 | -0.0183 | 256 | 11 |
| 2005 | 46,823 | 32,967 | 0.0000% | 32 | -0.0284 | 256 | 11 |
| 2006 | 46,299 | 32,986 | 0.0000% | 32 | -0.0400 | 256 | 11 |
| 2007 | 46,266 | 33,074 | 0.0030% | 32 | -0.0309 | 256 | 11 |
| 2008 | 45,917 | 32,636 | 0.0000% | 32 | -0.0100 | 256 | 11 |
| 2009 | 46,519 | 33,177 | 0.0000% | 32 | -0.0198 | 256 | 11 |
| 2010 | 46,892 | 33,307 | 0.0030% | 32 | -0.0179 | 256 | 11 |
| 2011 | 47,448 | 33,650 | 0.0000% | 32 | -0.0095 | 256 | 11 |
| 2012 | 47,834 | 33,958 | 0.0000% | 32 | +0.0005 | 256 | 11 |
| 2013 | 48,158 | 34,298 | 0.0029% | 32 | -0.0047 | 256 | 11 |
| 2014 | 47,629 | 33,764 | 0.0000% | 32 | -0.0147 | 256 | 11 |
| 2015 | 48,122 | 34,014 | 0.0000% | 32 | -0.0098 | 256 | 11 |
| 2016 | 47,651 | 33,790 | 0.0000% | 32 | +0.0042 | 256 | 11 |
| 2017 | 47,245 | 33,506 | 0.0000% | 32 | -0.0351 | 256 | 11 |
| 2018 | 47,109 | 33,292 | 0.0000% | 32 | +0.0097 | 256 | 11 |
| 2019 | 47,260 | 33,513 | 0.0030% | 32 | -0.0065 | 256 | 11 |
| 2020 | 47,705 | 34,238 | 0.0000% | 32 | +0.0314 | 256 | 13 |
| 2021 | 49,922 | 35,766 | 0.0000% | 32 | +0.0053 | 272 | 13 |
| 2022 | 49,434 | 35,430 | 0.0000% | 32 | -0.0082 | 271 | 13 |
| 2023 | 49,665 | 35,600 | 0.0000% | 32 | -0.0319 | 272 | 13 |
| 2024 | 49,492 | 35,050 | 0.0000% | 32 | +0.0088 | 272 | 13 |
| 2025 | 48,771 | 34,628 | 0.0000% | 32 | +0.0071 | 272 | 13 |

## 4. Team-code conventions (important)

The two sources **disagree systematically** — this is the single largest integration hazard in these datasets.

| Franchise | play-by-play parquet | games.csv | Canonical code chosen |
| --- | --- | --- | --- |
| Rams | `LA` in **every** season, incl. 1999 | `STL` 1999–2015, `LA` 2016+ | `LA` |
| Chargers | `LAC` in **every** season | `SD` 1999–2016, `LAC` 2017+ | `LAC` |
| Raiders | `LV` in **every** season | `OAK` 1999–2019, `LV` 2020+ | `LV` |

Findings:

* nflverse play-by-play **retroactively rewrites franchise codes to the present-day abbreviation**. The 1999 parquet contains `LA`, `LAC` and `LV`; `STL`, `SD` and `OAK` never appear in the pbp files at all.
* `games.csv` is **era-correct**: it carries `STL`, `SD`, `OAK` for the seasons those franchises actually played under those names (35 distinct codes across the file vs. 32 in pbp).
* **`LAR` appears in neither source.** Both use `LA` for the Rams, so the `LA` vs `LAR` ambiguity resolves to `LA`.
* No `JAC`/`JAX` split — both sources use `JAX` throughout.

**Normalization applied:** `audit/team_codes.py` defines a single `normalize_team` map (`STL→LA`, `SD→LAC`, `OAK→LV`, plus defensive aliases) that is applied to **both** marts. It is a no-op on pbp codes and rewrites the three legacy codes in `games.csv`. Both marts therefore use the **nflverse current-franchise convention with `LA` for the Rams**. Consequence to document downstream: a query for `LA` in 1999 returns the *St. Louis* Rams — franchise continuity is preserved, geography is not.

1999 offensive team codes as they appear in pbp (31): `ARI,ATL,BAL,BUF,CAR,CHI,CIN,CLE,DAL,DEN,DET,GB,IND,JAX,KC,LA,LAC,LV,MIA,MIN,NE,NO,NYG,NYJ,PHI,PIT,SEA,SF,TB,TEN,WAS`


## 5. Cross-checks and consistency tests

| Check | Result | Detail |
| --- | --- | --- |
| coverage 1999-2025 complete | **PASS** | no gaps |
| zero missing scores in 1999-2025 REG games | **PASS** | 0 games with a null score |
| era-correct team counts per season | **PASS** | 31 teams 1999-2001, 32 from 2002 |
| 2007 NE = 16-0-0 | **PASS** | 16-0-0 (PF 589, PA 274) |
| 2008 DET = 0-16-0 | **PASS** | 0-16-0 (PF 268, PA 517) |
| 2017 CLE = 0-16-0 | **PASS** | 0-16-0 (PF 234, PA 410) |
| EPA mart joins 1:1 with results mart on (season, team) | **PASS** | 861 EPA keys / 861 results keys, 861 matched, 0 duplicates both sides |
| data/raw/ left empty | **PASS** | empty |
| EPA present & sane, all 27 seasons | **PASS** | league-mean offensive EPA/play spans -0.0561 (1999) to +0.0314 (2020); band is −0.15…+0.15 — no season is close to an edge, no drift |
| EPA null rate on pass/run plays | **PASS** | worst season is 2000 at 0.0156% (5 of 31,965 plays); 0.0000% in 20 of 27 seasons |
| Scrimmage plays missing posteam/defteam | **PASS** | 0 / 0 across all seasons |

## 6. Anomalies and caveats

1. **`play_type` has no `'rush'` literal.** nflverse encodes rushes as `play_type = 'run'`. All "pass + rush" logic uses `play_type IN ('pass','run')`. The separate numeric `pass`/`rush` flag columns use a *wider* definition (they attribute penalty-nullified and `no_play` snaps), so they would yield different counts — the marts do not use them.
2. **Retroactive franchise recoding in pbp** (section 4). Any join to an era-correct source must go through `audit/team_codes.py`.
3. **Empty-string team codes** occur in the pbp files on non-scrimmage rows (timeouts, end-of-quarter markers). Zero scrimmage plays are affected, but `''` is coerced to null in normalization so it can never become a team.
4. **Null `play_type`** exists (e.g. 1,460 rows in 2024, of which 570 have null `epa`) — administrative rows, correctly excluded from scrimmage counts.
5. **Schedule length changes**: 16 REG games/team through 2020, 17 from 2021 (regular season expands to 18 weeks). 2001 ran 17 weeks for 16 games (the post-9/11 makeup week). Per-team game counts, not fixed constants, must drive any rate stat.
6. **`games.csv` extends past the audit window.** It currently carries [np.int64(2026)] future season(s) with null scores (272 unplayed 2026 REG rows). The mart clips to 1999–2025, so those never enter it; a naive reader that does not clip will produce 0-0 team-seasons.
7. **EPA is opponent- and era-unadjusted.** League-mean offensive EPA/play drifts from −0.056 (1999) to roughly +0.03 (2020) as scoring environments changed. Cross-era team comparisons should be centered per season.
8. **Ties**: `win_pct` counts a tie as half a win. 2007 NE, 2008 DET and 2017 CLE all have 0 ties, so the golden tests are unaffected by that choice.

## 7. Outputs

| Path | Grain | Rows |
| --- | --- | --- |
| `data/marts/team_season_epa.csv` | season × team (REG) | 861 |
| `data/marts/team_season_results.csv` | season × team (REG) | 861 |
| `data/curated/staging/pbp_season_stats.csv` | season | 27 |
| `data/curated/staging/schedule_season_stats.csv` | season | 27 |
| `data/curated/staging/pbp_team_codes.csv` | season | 27 |
