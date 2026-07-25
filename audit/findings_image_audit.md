# Player image audit — Wikimedia Commons coverage for `PlayerMark`

**Question:** what fraction of the players we actually render will have a
free-culture photo, and what license metadata must the product carry per asset?

**Headline:** **97.2% usable (244/251). Expected `PlayerMark` fallback rate =
2.8% (7 of 251).** Every one of the 244 accepted images passed an independent
identity re-check. The real risk in this pipeline is not coverage — it is that
**48% of usable photos are ShareAlike**, which the "treated photo" treatment
turns into a licensing decision rather than a formatting one (see Red flags).

Re-runnable: `python3.11 audit/audit_images.py`
Row-level output: `data/curated/staging/player_images_sample.csv` (251 rows)
Collision log: `data/curated/staging/player_images_collisions.csv` (51 rows)

---

## 1. Population

Built from the same source and the same dedup discipline as the contracts
audit — `historical_contracts.parquet` scanned remotely with DuckDB httpfs,
nested `cols` unnested and **deduped on `(otc_id, year)`** with `'Total'` and
junk-year rows dropped. `audit_images.py` imports those helpers from
`audit_contracts.py` rather than reimplementing them, so the ranking cannot
drift from the mart.

| | |
|---|---|
| Window | seasons 2021–2025 |
| Rule (a) | top 250 players by **max single-season `cap_number`** in the window, deduped to unique players, each kept at his max-cap season and that season's team |
| Rule (b) | 12 marquee dead-money names force-included if absent |
| **Result** | **251 unique players** (250 top-cap + 1 marquee add) |
| Cap range | $7.75M (Trey Lance, 2022) – $50.5M (Dak Prescott, 2025) |
| Position mix | OL 56, DL 65, WR 36, DB 36, QB 29, LB 15, TE 9, RB 5 |
| Season mix | 2021: 35, 2022: 36, 2023: 37, 2024: 47, 2025: 96 |

11 of the 12 marquee names were *already* inside the top 250 — they are
expensive quarterbacks, not marginal ones. Only **Trey Lance** ($7.75M, 2022)
needed forcing, which is why the population lands at 251 rather than the ~262 a
naive estimate would predict. All 12 marquee names resolved to a usable image
(12/12).

**Caveat carried from the contracts audit:** this source has no dead-money
rows. A released player's charge stays attached to his *new* team's row, so
"max-cap season and team" is the team he was rostered on, not the team eating
his dead money. Wilson resolves to SEA 2021, Ryan to ATL 2021, Rodgers to
GB 2022 — correct for identity lookup, wrong if ever read as a cap-hell fact.

---

## 2. Hit rate — the fallback number

| Cohort | Usable | n | Rate |
|---|---:|---:|---:|
| **All** | **244** | **251** | **97.2%** |
| QB | 29 | 29 | **100.0%** |
| non-QB | 215 | 222 | 96.8% |

### By position group

| Group | Usable | n | Rate |
|---|---:|---:|---:|
| QB / RB / TE / WR | 79 | 79 | **100.0%** |
| DB | 35 | 36 | 97.2% |
| DL | 63 | 65 | 96.9% |
| OL | 53 | 56 | 94.6% |
| LB | 14 | 15 | 93.3% |

### By era (career start, from full contract history)

| Cohort | Usable | n | Rate |
|---|---:|---:|---:|
| Entered ≤ 2016 (older names) | 105 | 105 | **100.0%** |
| Entered ≥ 2017 (recent) | 139 | 146 | 95.2% |

The intuition that older players are the coverage risk is **backwards**.
Coverage is a function of how long a player has been photographed by the
volunteer sports-photography community, so every pre-2017 entrant is covered
and *all seven misses are recent, non-skill-position players*. Skill positions
and quarterbacks are photographed to saturation; interior offensive linemen and
off-ball linebackers who entered the league after 2017 are the gap.

**Plan the fallback card for trench players, not for retired stars.**

### The 7 misses (genuine, hand-verified)

| Player | Team | Pos | Why |
|---|---|---|---|
| Jonathan Greenard | MIN | ED | article exists, no P18, no free lead image, no Commons photo |
| Alijah Vera-Tucker | NYJ | RG | same |
| Grover Stewart | IND | IDL | same |
| Jalen Thompson | ARI | S | same |
| Frank Ragnow | DET | C | Commons returned teammates (Stenberg, Jackson) — rejected as unverified |
| Jerome Baker | MIA | LB | Commons returned a soccer player and a 1920s photographer — rejected |
| Robert Hunt | CAR | RG | Commons has only the 17th-c. Jamestown chaplain and a painter |

Each was checked by hand: the English Wikipedia article exists in all seven
cases, but carries no free image, and Commons genuinely holds no photo of the
person. These are true fallbacks, not pipeline failures.

---

## 3. Verification-method distribution

| Method | n | % of population | Strength |
|---|---:|---:|---|
| `wikidata_p18_team` | 240 | 95.6% | **strongest** — P18 on an entity verified as an American football player *and* team-confirmed |
| `wikipedia_lead_image` | 4 | 1.6% | strong — free lead image of the verified article |
| `none` (no usable image) | 7 | 2.8% | — |

Two designed routes never had to fire: `commons_usage_on_page` and
`commons_category`, the fallbacks that trust a raw Commons full-text search
after independent verification. **Zero accepted images came from a Commons
search.** That is the reassuring result — the structured route (Wikipedia →
Wikidata → P18 → Commons `imageinfo`) resolved 100% of hits, and the unreliable
route contributed nothing we had to lean on.

`wikidata_p18_sport` (P18 accepted without team confirmation) also never fired:
**every** P18 hit was independently team-confirmed.

### Independent QA of the 244 accepted images

Re-checked after the fact, outside the pipeline that chose them: each accepted
file had to *either* name the player in its own Commons description/categories
*or* actually be embedded on that player's English Wikipedia article.

* **244/244 passed. 0 failures.**
* **0 duplicate `file_url`s** across players — no two players share a photo.

---

## 4. License distribution

All 244 usable images are free-culture. Nothing was rejected for a
non-commercial or no-derivatives term — Commons policy already excludes them —
but the filter is retained because the product's guarantee depends on it.

| Family | n | % of usable |
|---|---:|---:|
| **CC BY-SA (ShareAlike)** | **117** | **48.0%** |
| CC BY (Attribution) | 106 | 43.4% |
| Public domain | 14 | 5.7% |
| CC0 | 7 | 2.9% |

By exact tag:

| License | n | % |
|---|---:|---:|
| CC BY-SA 2.0 | 85 | 34.8% |
| CC BY 3.0 | 43 | 17.6% |
| CC BY 2.0 | 38 | 15.6% |
| CC BY 4.0 | 25 | 10.2% |
| CC BY-SA 4.0 | 22 | 9.0% |
| Public domain | 14 | 5.7% |
| CC BY-SA 3.0 | 10 | 4.1% |
| CC0 | 7 | 2.9% |

* **223 of 244 (91.4%)** carry `AttributionRequired = true`. Attribution is the
  default case, not the exception — it cannot be an afterthought in the UI.
* **14 of 244** (all Public domain) have **no `LicenseUrl` at all**. The schema
  must allow a null license URL without failing validation.
* **12 of 244** carry `Restrictions = personality` — a personality-rights
  warning, which is orthogonal to copyright and matters specifically because
  this is a commercial product.

Authorship is highly concentrated: **All-Pro Reels** (67 across two author
strings), **Jeffrey Beall** (36) and **Erik Drost** (16) account for ~49% of
all usable photos, with a few team accounts (Falcons, Titans) supplying much of
the rest. Attribution strings will repeat heavily — worth deduplicating in the
credits UI rather than rendering 244 near-identical lines.

---

## 5. Name collisions

Collisions are the known failure mode and they are **common**: 51 collision
records across **42 of 251 players (16.7%)**. Every one was resolved
deterministically, none by guessing.

| Kind | n | What it is |
|---|---:|---|
| `wrong_person` | 29 | an article with the player's exact name describes a non-football human |
| `same_name_players` | 20 | two or more *American football players* share the name |
| `name_variant` | 2 | cap data's name matches no article title |

### How they were resolved

**The resolution rule that does the work is the English Wikipedia team
category** (`Category:<Team> players`). It is dramatically better than the
Wikidata `P54` "member of sports team" claim, which is badly stale — Justin
Herbert's P54 lists only *Oregon Ducks football*, Kirk Cousins' omits Atlanta,
Geno Smith's omits the Raiders. The category is maintained by article editors
and is current.

Selection priority, in order:
1. exact name + team category confirmed
2. loose name + team category confirmed (catches legal-name changes)
3. sole namesake who is a player and not a coach
4. otherwise → **ambiguous → no image** (never guess)

**`wrong_person` (29).** Non-football humans holding the exact name — resolved
by requiring Wikidata `P106`/`P641` to say American football, or the article to
carry an NFL team category. Examples:

* **Chris Jones** (KC) — 9 exact-name non-football humans: two 1980s/90s
  outfielders, a musician, two politicians, a British singer, two basketball
  players, a software developer. → `Chris Jones (defensive tackle, born 1994)`.
* **Matt Ryan** (ATL) — an actor, a basketball player, an ice hockey player, a
  rower, a rugby league and a rugby union player. → `Matt Ryan (American football)`.
* **Carl Lawson** (NYJ) — the bare title is a **sprinter**. → the football article.
* **Ben Powers** (DEN) — the bare title is an **actor**. → `Ben Powers (American football)`.

**`same_name_players` (20).** Two-plus NFL players sharing a name. Resolved by
team category in 19 of 20:

* **Mike Williams** (LAC) — *four* NFL Mike Williamses (a QB, two WRs, an OL).
  → `Mike Williams (wide receiver, born 1994)` via *Los Angeles Chargers players*.
* **Lamar Jackson** (BAL) — the MVP quarterback vs. a cornerback of the same name.
* **Marcus Williams** (BAL) — safety vs. tight end. **Brandon Williams** (BAL) —
  defensive tackle vs. linebacker. **Jonah Williams** (ARI) — OL vs. DL.
  **Eddie Jackson** (CHI) — safety vs. a *Food Network chef*.
* **D.J. Jones** (DEN) — the only case needing disambiguation-page expansion:
  `D. J. Jones` is a disambiguation page, and neither the bare title nor
  football-weighted search ever reaches `D. J. Jones (defensive lineman)`.
* **Robert Hunt** (CAR) — the one **unresolved by team category**: his article
  still lists only *Miami Dolphins players* a season after his move to
  Carolina. Fell through to rule 3 (sole non-coach namesake, vs. an American
  football *coach* of the same name) and resolved correctly — but he has no
  photo anyway, so he is a miss for an unrelated reason.

**`name_variant` (2).** Cap data uses the everyday name, Wikipedia the formal
one: **Matt Stafford → Matthew Stafford**, **Matt Judon → Matthew Judon**. Both
accepted only because the team category independently confirmed them.

### Collision bugs caught and fixed during the audit

Worth recording, because each would have shipped a wrong face:

1. **`Josh Allen` (JAX) resolved to the Bills quarterback.** OTC's Jaguars
   entry is Wikipedia's *Josh Hines-Allen*. An exact-name-first rule picked the
   wrong human with high confidence. **Fix: team confirmation always outranks
   an exact name match.** This is the single most important rule in the script.
2. **`is_photo()` rejected Baker Mayfield** — a naive substring blocklist
   matched **"field"** inside *"May-field"*. Fixed with word-boundary matching,
   and the blocklist is now applied *only* to uncurated Commons search hits,
   never to a curated P18 or lead image.
3. **Initial-styling mismatches** — `D.K. Metcalf` vs `DK Metcalf`, `C.J. Mosley`
   vs `C. J. Mosley`. Fixed with a letters-only "tight" name comparison.

---

## 6. Recommended per-asset license-metadata schema

Drawn from what was actually captured, with nullability set by what was
actually observed in these 244 records.

| Field | Type | Null? | Source | Why |
|---|---|---|---|---|
| `player_id` | string | no | `otc_id` | join key to the cap marts |
| `has_usable_image` | bool | no | derived | drives the `PlayerMark` fallback branch directly |
| `file_title` | string | yes | Commons page title | stable identifier; **the** key for re-fetch and takedown |
| `file_url` | string | yes | `imageinfo.url` | direct asset URL — treat as a *fetch* source, not a hotlink |
| `width`, `height` | int | yes | `imageinfo` | 3.7% are <300px wide; the renderer must branch on this |
| `author` | string | no* | `extmetadata.Artist` → `Credit` → uploader | 0/244 blank once the fallback chain is applied |
| `license` | string | no | `LicenseShortName` | human-facing ("CC BY-SA 2.0") |
| `license_machine` | string | no | `extmetadata.License` | machine tag (`cc-by-sa-2.0`) — **filter on this, not the display string** |
| `license_url` | string | **yes** | `LicenseUrl` | **null for all 14 PD files** — must not be `NOT NULL` |
| `attribution` | string | no | composed | prerendered credit line |
| `attribution_required` | bool | no | `AttributionRequired` | true for 91.4%; lets the renderer skip the credit only when genuinely allowed |
| `share_alike` | bool | no | derived from `license_machine` | **48% true** — see Red flags; not currently a column, add it |
| `restrictions` | string | yes | `extmetadata.Restrictions` | `personality` on 12 files; non-copyright but commercially relevant |
| `verification_method` | enum | no | derived | provenance of the identity claim — audit trail for "is this the right person" |
| `wikidata_qid` | string | yes | `pageprops.wikibase_item` | stable identity anchor; re-verification key |
| `wikipedia_article` | string | yes | resolved title | human-checkable identity evidence |
| `notes` | string | yes | derived | why an asset was rejected; keeps a null row explainable |

`*` `author` is non-null only because of the three-step fallback
(`Artist` → `Credit` → uploader). Do not model it as non-null off `Artist` alone.

**Two fields the product must add that this audit only implies:**
`share_alike` (derived, above) and `last_verified_at` — Commons files get
renamed, relicensed and deleted, so a cached asset without a re-verification
timestamp will silently rot.

---

## 7. Red flags

1. **48% of usable photos are ShareAlike, and `PlayerMark` "treats" the photo.**
   This is the most consequential finding in the audit and it is a legal
   question, not a design one. A color-treated, cropped, recomposited photo is a
   **derivative work**; CC BY-SA obliges the derivative to be released under the
   same license. If the treatment is baked into a served asset, that asset
   arguably has to be offered CC BY-SA. Three options, in decreasing risk:
   restrict the treatment to CSS filters over an unmodified source (no new fixed
   derivative); prefer the CC BY / PD / CC0 half (106 + 21 = 127 photos, still
   only **50.6%** of the population — coverage would drop from 97.2% to ~50%,
   likely unacceptable); or accept and honor CC BY-SA on treated assets.
   **Get this decided before build, not after.** Note that the ShareAlike share
   was invisible until this audit — the naive read is "it's all Creative
   Commons, we're fine."

2. **Attribution is the default (91.4%), and it is legally load-bearing.**
   A design that hides credits behind a hover or an "info" affordance is a
   license violation for 223 of 244 assets. Budget visible credit space in
   `PlayerMark` from the first mockup.

3. **Resolution is not product-grade for a fifth of the set.** 9 images (3.7%)
   are under 300px wide — Dak Prescott, the single highest-cap player in the
   entire population, is **138×239**. 50 (20.5%) are under 600px. Median is
   1165×1496, so the distribution is bimodal: mostly fine, with a long thin tail
   of unusable thumbnails. **The renderer needs a minimum-resolution threshold
   that falls back to the designed card**, which will push the effective
   fallback rate above 2.8% — at a 300px floor it becomes ~6.4%, at a 600px
   floor ~22.7%. Choose the threshold deliberately; the headline 2.8% assumes
   any resolution is acceptable.

4. **Wikidata `P54` is too stale to be a verification signal.** It missed the
   current team for Herbert, Cousins and Geno Smith. The pipeline relies on the
   Wikipedia team **category** instead. Anyone reusing this code should not
   "simplify" it back to P54.

5. **Commons full-text search is unsafe on its own and must stay gated.** It
   returned a soccer player for Jerome Baker, a 17th-century chaplain for Robert
   Hunt, and *teammates* (Logan Stenberg, Jonah Jackson) for Frank Ragnow. All
   were correctly rejected. Zero accepted images came from this route — but if
   the verification gate is ever loosened, this is where wrong faces enter.

6. **16.7% of players hit a name collision.** This is not an edge case, and it
   will recur on every population refresh as rookies arrive. The collision log
   is written to CSV on every run specifically so it can be diffed.

7. **Freshness.** Every field here is a live mirror of Commons/Wikidata. Files
   get relicensed, renamed and deleted; team categories change each March in
   free agency. Re-run before each release and diff, rather than treating this
   CSV as static reference data.

---

## 8. Method notes

* **Politeness:** `maxlag=5` on every call, ~60ms spacing, exponential backoff
  on 429/503 and on `maxlag` rejections, descriptive `User-Agent` with contact.
  A cold full run is ~1,400 calls / ~6.5 min and drew 19 retries, 0 failures.
  Requests are batched wherever the API allows (up to 50 Wikidata entities and
  20 Commons files per call), which is what keeps the count that low.
* **Optional response cache:** `--cache PATH` memoizes raw API responses.
  Deliberately defaults to *off* and is documented to live **outside the repo** —
  `data/raw/` stays empty (verified `PASS` at the end of every run).
* **Idempotent:** every output is overwritten in full on each run.
* **`data/raw/` is empty.** The contracts parquet is scanned remotely via DuckDB
  httpfs and never lands on disk.
