# Coaching-staff master dataset — assembly & verification audit

Scope: assembly of `data/curated/coaching_staff.csv` from the 8 division staging files in `data/curated/staging/`, plus structural validation, convention normalization, name canonicalization, and independent verification. Seasons 2000–2025, roles HC/OC/DC, era-correct team codes.

Staging files were **not modified** — they remain the audit trail. Every fix landed in the assembled file.

**Bottom line up front.**

| Question | Verdict |
| --- | --- |
| Structural validation | **PASS, zero violations.** 830/830 team-seasons, every one with HC+OC+DC, no blanks, no bad roles, no duplicate keys. |
| Final row count | **2,612** (2,490 base slots + 122 multi-stint rows) |
| Head-coach verification | **890/890 rows confirmed.** 884 match the Wikipedia franchise HC lists outright; the 6 residuals are formally-designated partial-season interims, each individually confirmed. Zero corrections needed. |
| OC/DC spot-check | **176/176 sampled rows confirmed (100%)** against pro-football-history.com. Zero corrections; 4 groups needed adjudication. |
| Convention normalization | 7 changes (2 merges, 1 title correction, 1 dedupe, 3 note fixes) + 3 row-order fixes |
| Name canonicalization | 15 rows across 5 name decisions — including **2 father/son collisions**, one of which was a latent data error |
| Biggest catch | `CLE 2000 OC "Pete Carmichael"` is **Pete Carmichael Sr.**, not the Saints' Pete Carmichael Jr. Naive name-merging would have fused two different people. |

---

## 1. Final file

`data/curated/coaching_staff.csv` — LF line endings throughout, UTF-8, trailing newline, `csv.QUOTE_MINIMAL` (62 of 2,612 rows quoted, all because a `note` contains a comma). Sorted by `team`, then `season`, then `role` in HC → OC → DC order; within a multi-stint slot, rows are in chronological stint order.

### 1.1 Composition

| Measure | Count |
| --- | ---: |
| Total rows | **2,612** |
| Base team-season-role slots (830 × 3) | 2,490 |
| Extra rows from multi-stint slots | 122 |
| Multi-row slots | 119 (HC 58, OC 39, DC 22) |
| — of which 3-row slots | 3 (NO 2012 HC, DET 2020 HC, CHI 2024 OC) |
| `NONE` rows (title genuinely unfilled) | 60 (OC 38, DC 22, HC 0) |
| Rows by role | HC 890 · OC 870 · DC 852 |
| Distinct people | 435 |
| Team codes | 35 (28 stable + STL/LA, SD/LAC, OAK/LV) |
| Rows carrying a `note` | 473 |

### 1.2 Multi-row slots by cause

| Cause | Slots |
| --- | ---: |
| Firing / resignation mid-season | 99 |
| Medical leave or absence with a formal interim/acting appointment | 9 |
| Co-coordinators (both formally titled) | 5 |
| Demotion / reassignment | 5 |
| Season-long suspension with formal interims | 1 (NO 2012 HC) |
| **Total** | **119** |

---

## 2. Structural validation — PASS

| Check | Result |
| --- | --- |
| Expected team-seasons = 26 × 32 − HOU 2000/2001 = 830 | **830.** Zero missing, zero extra. |
| Era-correct codes (STL→LA 2016, SD→LAC 2017, OAK→LV 2020, HOU from 2002) | All correct; no code appears outside its era window. |
| Every team-season has ≥1 HC, ≥1 OC, ≥1 DC row | **Zero gaps** across all 2,490 slots. |
| Blank `coach_name` | 0 |
| Blank `source_url` | 0 |
| `role` outside {HC, OC, DC} | 0 |
| `HC = NONE` | 0 |
| Duplicate `(season, team, role, coach_name)` | **0** (was 1 in staging — see §3.1 item 4) |

No structural violations were found, so no source-consultation repairs were required on structure.

---

## 3. Task 2a — title-holder convention

Rule applied: **a row is the titled holder of the role, or `NONE` when the title was genuinely unfilled.** A second row survives only when the title itself changed hands (firing, resignation, interim promotion, suspension, medical leave with a formal interim). Play-calling or functional changes with no title change get folded into the titled row's note.

All 121 staging multi-row slots were swept against this rule, not just the flagged cases.

### 3.1 Changes made

| # | Slot | Change | Basis |
| --- | --- | --- | --- |
| 1 | **JAX 2021 OC** | Dropped the Brian Schottenheimer row; detail folded into the Darrell Bevell note. | Bevell was named OC in Feb 2021 and held the title all season. Schottenheimer was titled passing game coordinator/QBs and only took over play-calling from Week 15. Function change, no title change. |
| 2 | **IND 2005 HC** | Dropped the Jim Caldwell row; folded into the Tony Dungy note. | Dungy missed only the Week 16 game at Seattle after his son's death. Caldwell ran the team **as assistant head coach/QBs** — no interim or acting HC title was conferred, and the Wikipedia *List of Indianapolis Colts head coaches* does not list him. Contrast with the 9 medical/absence cases below, all of which carry a formal designation. |
| 3 | **BAL 2006 OC** | `coach_name` "Brian Billick" → **`NONE`**, note rewritten. | The 2006 Ravens staff listing carries Jim Fassel as the only OC; after the Oct 17 firing Billick *assumed the duties* and play-calling without taking the title. Cross-division convention fix — brings BAL in line with the `NONE` treatment used for CHI 2023 DC, TB 2009 DC, CLE 2011/2016/2017 OC, DAL 2011 OC, ATL 2019 DC, HOU 2022 DC and 30+ others. |
| 4 | **HOU 2013 HC** | Collapsed two Wade Phillips rows into one; both stints preserved in the note. | Same person, same title, same season — two separate interim stints (Week 9–10 during Kubiak's TIA recovery; Weeks 15–17 after the firing). This was the file's **only** duplicate `(season, team, role, coach_name)` key. The Wikipedia 2013 Texans infobox likewise carries Phillips once with both stints described. |
| 5 | **WAS 2007 DC** | Note extended to name Greg Blache's formal title, matching 2004–2006. | Blache held "Defensive Coordinator–Defensive Line" 2004 **through 2007**; the 2007 row's note previously stopped at Williams' own title. |
| 6 | **CHI 2021 HC** | Filled the empty note on the Matt Nagy row. | Documents the Week 8 COVID absence so the titled row explains why a second row exists. |
| 7 | **STL 2012 DC** | Note expanded to record a three-way source conflict; `NONE` retained. | See §6.2. |

### 3.2 Row-order fixes (chronological stint order)

Three slots listed the successor before the original title holder: **IND 2012 HC** (Arians before Pagano), **JAX 2016 HC** (Marrone before Bradley), **JAX 2021 HC** (Bevell before Meyer). All three reordered.

### 3.3 Flagged cases reviewed and **kept unchanged** (verified correct)

| Slot | Finding |
| --- | --- |
| **NYJ 2024 DC** | *Keep both rows.* Marquand Manuel **did** formally hold the title — the 2024 Jets staff listing reads "Interim defensive coordinator/defensive backs/safeties – Marquand Manuel". (General reporting is thin on this; the staff listing is the decisive evidence.) |
| **NE 2025 DC** | Single row + note is correct. Terrell Williams kept the title; Zak Kuhr called plays. |
| **NYJ 2024 OC** | Single row + note is correct. Hackett kept the title; play-calling went to Todd Downing. |
| **WAS 2004–07 DC** | Gregg Williams retained; note carries Blache's formal title. See §6.1. |
| **TB 2009 DC** | Two rows (Jim Bates → `NONE`) correct — title vacated on his Nov 24 demotion. |
| **CIN 2018 DC** | Two rows (Teryl Austin → Marvin Lewis) correct. Unlike Billick at BAL 2006, Lewis **did** take the title: the 2018 Bengals staff reads "Head coach/defensive coordinator – Marvin Lewis". |
| **WAS 2023 DC** | Two rows (Jack Del Rio → Ron Rivera) correct. Staff listing reads "Defensive coordinator – Ron Rivera (interim)". |
| **CLE 2018 DC** | Two rows correct. Staff listing reads "Interim defensive coordinator/linebackers – Blake Williams". |
| **OAK 2006 OC** | Two rows correct. AP: "Raiders replace coordinator Walsh with Shoop" (Nov 28, 2006) — a genuine title handoff, not a duties change. |
| **STL 2012 DC** | `NONE` correct. See §6.2. |
| 9 medical/absence HC slots | All carry a **formal** interim or acting designation in the season infobox and are kept: DEN 2013 (Del Rio, interim, Wks 10–13) · DEN 2016 (DeCamillis, interim, Wk 6) · MIN 2016 (Priefer, interim, game 13) · CLE 2020 (Priefer, acting, postseason) · CHI 2021 (Tabor, acting, Wk 8) · IND 2012 (Arians, interim, Wks 5–16) · DET 2020 (Bevell then Prince) · HOU 2013 (Phillips) · STL 2005 (Vitt, Martz medical leave). |
| 5 co-coordinator slots | Both holders formally titled; kept: KC 2016 OC (Childress/Nagy) · MIA 2021 OC (Godsey/Studesville) · MIN 2020 & 2021 DC (Patterson/Zimmer) · NO 2022 DC (Nielsen/Richard). |

---

## 4. Task 2b — name canonicalization

15 rows changed across 5 decisions. **Two of the five are collisions — different people who happened to look like spelling variants.** Merging them would have corrupted the dataset.

| Decision | Rows | From → To | Basis |
| --- | ---: | --- | --- |
| **COLLISION — father** | 2 | `Jim Mora` → **`Jim E. Mora`** (IND 2000, IND 2001 HC) | Jim E. Mora, Colts HC 1998–2001. |
| **COLLISION — son** | 5 | `Jim Mora` → **`Jim L. Mora`** (SF 2000–2003 DC, SEA 2009 HC) | Jim L. Mora — same person as the existing ATL 2004–2006 `Jim L. Mora` rows. NFC divisions had normalized the two Moras inconsistently; team-season assignment resolves it cleanly. |
| **COLLISION — father** | 1 | `Pete Carmichael` → **`Pete Carmichael Sr.`** (CLE 2000 OC) | **Latent data error caught.** The brief listed "Pete Carmichael Jr. (3 variants)" as a merge candidate. It is not a variant: Pete Carmichael **Sr.** was the 2000 Browns OC (NFL: JAX 1995–99, CLE 2000, CHI 2001–03). Pete Carmichael **Jr.** was the Browns' *tight ends coach/offensive assistant* in 2000 and is the NO 2009–2023 OC. Disambiguated, not merged. Only 2 spellings existed in staging, not 3. |
| True variant | 5 | `Herman Edwards` → **`Herm Edwards`** (NYJ 2001–2005 HC) | Same person as the existing KC 2006–2008 `Herm Edwards` rows; "Herm Edwards" is the canonical form on both franchise HC lists. |
| True variant | 2 | `Jimmy Raye` → **`Jimmy Raye II`** (SF 2009, 2010 OC) | Same person as the KC 2000 / WAS 2001 / OAK 2004–05 `Jimmy Raye II` rows. The `II` suffix is load-bearing: his son **Jimmy Raye III** is a personnel executive appearing in Chargers front-office listings of this era. |

### 4.1 Verified-distinct near-duplicates — deliberately **not** merged

`Klay Kubiak` (SF 2025 OC) ≠ `Klint Kubiak` (MIN 2021, NO 2024, SEA 2025 OC) ≠ `Gary Kubiak` · `Bob Babich` ≠ `Bobby Babich` · `Bob Slowik` ≠ `Bobby Slowik` · `Norv Turner` ≠ `Scott Turner` (both hold CAR 2019 OC rows — a legitimate father-to-son mid-season handoff) ≠ `Ron Turner` · `Rob Chudzinski` (single spelling, 9 rows, no variants) · `Billy Davis` (already single-form; a 2014 PHI note records that the season page spells it "Bill Davis").

### 4.2 Full-file variant sweep

All 437 staging names were swept by normalized-surname grouping and by fuzzy full-name similarity (Ratcliff–Obershelp ≥ 0.82 on suffix-stripped, punctuation-stripped keys), then every hit was adjudicated by team-season lineage. Beyond the five decisions above, no further cross-division variants of the same person were found.

---

## 5. Verification

### 5.1 Head coaches — 100% coverage

Every HC row was cross-checked against the Wikipedia **"List of *[Team]* head coaches"** franchise page — a source not cited on any row in the file (890 of 890 HC rows cite per-season pages or ESPN). All 32 pages were fetched as rendered HTML and parsed programmatically to `(name, first_year, last_year)`; no hand transcription. pro-football-reference.com was not used (blocked, 403).

| Result | Count |
| --- | ---: |
| HC rows checked | **890 / 890 (100%)** |
| Team-seasons covered | 830 |
| Rows matching the franchise HC list | 884 |
| Rows on the franchise list but **absent** from the dataset | **0** |
| Rows requiring correction | **0** |
| Residual rows needing individual adjudication | 6 |

The 6 residuals are all formally-designated interim/acting head coaches for partial-season absences that the franchise list pages do not enumerate as separate head coaches. Each was individually confirmed against its season-page infobox and **kept**:

| Row | Infobox designation |
| --- | --- |
| IND 2012 Bruce Arians | "Bruce Arians (interim; weeks 5–16)" |
| DEN 2013 Jack Del Rio | "Jack Del Rio (interim, weeks 10–13)" |
| DEN 2016 Joe DeCamillis | "Joe DeCamillis (interim, Week 6)" |
| MIN 2016 Mike Priefer | "Mike Priefer (interim, game 13)" |
| CLE 2020 Mike Priefer | "Mike Priefer (acting head coach during postseason due to COVID-19 exposure)" |
| CHI 2021 Chris Tabor | "Chris Tabor (Acting HC for Week 8 after Nagy tested positive for COVID-19)" |

Wikipedia's franchise lists are internally inconsistent here — they *do* list DET 2020 Robert Prince, HOU 2013 Wade Phillips, and NO 2012 Kromer/Vitt, which are the same class of appointment. That inconsistency, not a dataset error, produces all 6 residuals. A seventh row of this class, **IND 2005 Jim Caldwell**, was the one that failed adjudication (no formal title) and was merged out — see §3.1 item 2.

### 5.2 OC/DC spot-check — 10.2% random sample

Sample: 87 team-seasons drawn uniformly at random (seed 20260725), taking all OC/DC rows within them → **176 rows / 174 team-season-role groups = 10.2%** of the 1,723 OC/DC rows. Sample spans 33 of 35 team codes and all 26 seasons.

Independent source: **pro-football-history.com** season staff pages — a non-Wikipedia site that lists each season's staff *by exact title* (it distinguishes "Defensive Coordinator" from "Interim Defensive Coordinator", "Co-Offensive Coordinator", "Assistant Offensive Coordinator", and run/pass game coordinators). This is independent of the Wikipedia season pages cited on 2,553 of 2,612 rows.

| Result | Count |
| --- | ---: |
| Groups compared | 174 |
| Rows covered | 176 |
| Exact agreement | 170 groups |
| Needed adjudication | 4 groups |
| **Rows confirmed correct** | **176 / 176 (100%)** |
| **Corrections required** | **0** |

The 4 adjudicated groups:

| Group | Ours | pro-football-history | Resolution |
| --- | --- | --- | --- |
| MIA 2021 OC | Godsey + Studesville (co-OCs) | Studesville only | **Ours is correct and more complete.** ESPN and NFL.com both report the Dolphins promoted Studesville *and* Godsey to co-OC in Feb 2021. Aggregator is incomplete. |
| WAS 2005 DC | Gregg Williams | *no DC listed* | Corroborates the known conflict — pfh titles Williams "Assistant Head Coach-Defense", exactly as our note says. See §6.1. |
| STL 2012 DC | `NONE` | Blake Williams | See §6.2 — `NONE` retained. |
| SD 2001 DC | Joe Pascale | Pascale (DC) + Mark Banker (Interim DC) | Titled holder **agrees**. Whether a second interim stint should exist is unresolved — see §6.3. |

### 5.3 Bonus audit — all 60 `NONE` rows

`NONE` is the highest-risk assertion in the file (claiming a title was *unfilled*), so all of them were checked against pro-football-history staff listings rather than just the sampled ones.

| Result | Count |
| --- | ---: |
| `NONE` rows audited | 59 (pre-assembly; the BAL 2006 OC fix adds a 60th) |
| Corroborated — no such coordinator titled | 56 |
| Apparent contradictions | 3 |

All 3 apparent contradictions resolve in the dataset's favour: **CHI 2023 DC** and **TB 2009 DC** are season-level listings of the coach who held the title for part of the year (Alan Williams, Jim Bates) — our two-row treatment is strictly more granular and both first rows already name them. **STL 2012 DC** is §6.2. A fourth flag, LA 2019 OC, was a false positive from substring-matching "Assistant Offensive Coordinator" (Jedd Fisch), which our note already names.

### 5.4 Sanity sweeps

| Check | Result |
| --- | --- |
| Belichick NE HC | 2000–2023, unbroken (24 seasons) ✓ |
| Andy Reid | PHI 2000–2012, KC 2013–2025, no gap, no overlap ✓ |
| Mike Tomlin PIT HC | 2007–2025, unbroken (19 seasons) ✓ |
| Sean Payton NO HC | 2006–2021 present; 2012 renders as 3 rows (Payton suspended + Kromer Wks 1–6 + Vitt Wks 7–16) ✓ |
| Pete Carroll SEA HC | 2010–2023, unbroken; also LV 2025 ✓ |
| Any `HC = NONE` | **0** ✓ |
| In-season HC changes per season | mean 2.3, range 0–5 |
| **Offseason HC turnover** (franchise's HC set fully replaced vs prior year) | **mean 6.4, range 3–10** — squarely in the expected 5–10 band. |

Turnover outliers were checked rather than assumed: the lows are **2005 (3)** and **2010 (3)**, the highs **2006 (10)** and **2022 (10)**. All four are genuine — 2005 is the well-known light cycle (only CLE, MIA, SF hired), and 2010 saw just BUF, SEA, WAS. No flag warranted.

---

## 6. Known documented ambiguities

Carried forward deliberately. Each is a genuine disagreement between reputable sources, resolved in the file with the reasoning recorded in the row's `note`.

### 6.1 WAS 2004–2007 DC — Gregg Williams vs Greg Blache

The file records **Gregg Williams** as DC for all four seasons. His formal title was *Assistant Head Coach–Defense*; **Greg Blache** held the title *Defensive Coordinator/Defensive Line* (2004 through 2007, per Blache's own record), then became the outright DC in 2008–09. Williams built and ran the defense.

Two independent sources corroborate the conflict rather than resolve it: the Wikipedia season pages give Williams the asst-HC-defense title, and pro-football-history.com lists **no defensive coordinator at all** for WAS 2005, only "Assistant Head Coach-Defense – Gregg Williams". Williams is retained as the analytically meaningful DC; all four notes now name Blache's formal title. **Downstream consumers doing title-exact joins on WAS 2004–07 DC should expect Blache in some sources.**

### 6.2 STL 2012 DC — a three-way source conflict

| Source | Says |
| --- | --- |
| This dataset | `NONE` |
| Wikipedia 2012 Rams staff table | "Defensive coordinator – Gregg Williams†" († = suspended for the season) |
| pro-football-history.com | "Defensive Coordinator – Blake Williams" (also lists him as Linebackers Coach) |

Resolved to **`NONE`** on primary reporting: Gregg Williams was hired in Jan 2012, suspended indefinitely in March over the Saints bounty scandal, and never coached a game; Jeff Fisher stated publicly he **would not hire a replacement** and would run the defense by committee with himself, asst HC Dave McGinnis and DB coach Chuck Cecil. Blake Williams was titled linebackers coach and was the de-facto play-caller. The title was genuinely unfilled.

This is deliberately treated differently from **NO 2012 HC**, where Sean Payton *is* kept as a row despite coaching no games — Payton remained the titled head coach through his suspension and returned in 2013, and the Saints named formal interim HCs beneath him. The Rams vacated the position outright.

### 6.3 SD 2001 DC — possible unrecorded interim stint

The file records a single DC, **Joe Pascale**, and every source agrees he was the titled DC. But pro-football-history.com additionally lists **Mark Banker** as "Interim Defensive Coordinator" for 2001, and its Chargers franchise page calls him the first interim DC in club history. Against that: the Wikipedia 2001 Chargers staff table lists a single DC (Pascale) with Banker as "Defensive corners", and other accounts name linebackers coach Jim Vechiarella rather than Banker as the fill-in during Pascale's back surgeries.

**No row was added.** The evidence for a formal second title-holder is single-sourced and internally contradictory, and injecting a row on that basis is worse than leaving a documented gap. Flagged for a future pass against 2001 Chargers media-guide or contemporaneous beat reporting.

### 6.4 Convention note — HC-as-coordinator

33 rows have an HC's name in an OC/DC row for the same team-season. All were reviewed. The overwhelming majority are coordinators promoted to interim HC who kept the coordinator title (e.g. Mel Tucker JAX 2011, Leslie Frazier MIN 2010, Jeff Ulbrich NYJ 2024). Genuine full-season dual titles: **Wade Phillips DAL 2009 & 2010 DC** and **Romeo Crennel KC 2012 DC**. Genuine mid-season assumption of the coordinator title by a sitting HC: **Marvin Lewis CIN 2018 DC** and **Ron Rivera WAS 2023 DC**. The one case that failed this test — Billick BAL 2006 — was converted to `NONE` (§3.1 item 3).

---

## 7. Collision-risk list for downstream name joins

`coach_name` is **not** a safe join key on its own. There are 435 distinct people and the surname space is dense with relatives. Join on `(coach_name, season, team, role)` or introduce a surrogate `coach_id`; never fuzzy-match on name alone.

### 7.1 Resolved collisions — do not re-merge

| Pair | Distinguisher |
| --- | --- |
| **Jim E. Mora** / **Jim L. Mora** | Father: IND HC 2000–01. Son: SF DC 2000–03, ATL HC 2004–06, SEA HC 2009. **Both appear in 2000–2001** — the highest-risk pair in the dataset. |
| **Pete Carmichael Sr.** / **Pete Carmichael Jr.** | Father: CLE 2000 OC. Son: NO 2009–2023 OC. Both were on the 2000 Browns staff simultaneously. |
| **Jimmy Raye II** / Jimmy Raye III | Raye II is the coach (KC/WAS/OAK/SF OC). Raye III is a personnel executive appearing in front-office listings of the same era — not in this file, but a hazard when joining to external staff tables. |

### 7.2 Distinct people sharing a surname — verified, keep separate

**Father/son or sibling pairs (highest risk):**
Gary / **Klint** / **Klay Kubiak** (father, two sons; Klint and Klay are both 2025 OCs on different teams) · Bob / Bobby **Babich** · Bob / Bobby **Slowik** · Mike / Kyle **Shanahan** · Norv / Scott **Turner** (*both hold CAR 2019 OC rows*) · Wade / Wes **Phillips** · Mike / Adam **Zimmer** (*both on MIN staffs*) · Jim / John **Fassel** · Monte / Lane **Kiffin** · Bill / Brian **Callahan** · Al / Mike **Groh** · Paul / Nathaniel **Hackett** · Marty / Brian / Kurt **Schottenheimer** · Matt / Mike **LaFleur** · Jim / John **Harbaugh** · Rex / Rob **Ryan** · Jay / Jon **Gruden** · Chuck / John **Pagano** · Gregg / Blake **Williams** (*both on the 2012 Rams and 2018 Browns staffs*) · Mike / Chris **Shula**.

**Unrelated same-surname pairs:**
Billy / Butch Davis · Herm Edwards / George Edwards · Jim / Jeremy Bates · Jim / Mike Caldwell · Joe / Mick Lombardi · Greg / Rich Olson · Anthony / Johnnie Lynn · Joe / Marcus Brady · Marvin / Sherman / Tim Lewis · Ben / Brian / Jim / Mike Johnson · Kellen / Tom Moore · Chip / Tim Kelly · Kelvin / Mike Sheppard · Zac / Press Taylor · Leslie / Parks Frazier · Gary / Joe Gibbs · Hue / Bobby Jackson · Jerry / Mike Sullivan · Greg / Willy / Zac Robinson · Alan / Terrell Williams · Arthur / Carl / Frank / Giff / Lovie / Mike / Richard / Sherman Smith.

### 7.3 Other join hazards

- **`NONE` is a sentinel**, not a person. 60 rows. Filter it before any coach-level aggregation.
- **Same person, same season, two teams**: e.g. Mike McCoy (LV 2025 OC, TEN 2025 HC), Romeo Crennel, Wade Phillips. A `(coach_name, season)` key is not unique.
- **Same person, same team-season, two roles**: 33 rows (§6.4). A `(coach_name, season, team)` key is not unique either — include `role`.
- **Name spelled differently in external sources**: `Billy Davis` (some sources: "Bill Davis"), `Frank Cignetti Jr.` (some sources: "Frank Cignetti, Jr."), `Herm Edwards` ("Herman Edwards"), `Mike Macdonald` (lowercase `d`), `Ken Norton Jr.`, `Joe Whitt Jr.`

---

## 8. Reproduction

Assembly script and all verification artefacts live in the session scratchpad (`.../scratchpad/work/`): `assemble.py` (reads staging, applies the §3 and §4 change list, writes the master file), `changelog.json`, 32 franchise HC pages (`wiki_html/`), 120 pro-football-history season staff pages (`pfh_seasons/`), the parsed HC table (`wiki_hc_parsed.json`), and the sample definition (`sample_ts.json`, seed 20260725).

Staging CSVs were opened read-only and are byte-identical to their delivered state.
