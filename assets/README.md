# `assets/` — the identity-asset pipeline

Builds the two identity-asset sets YIELD/YARD serves from its own origin:
**TeamMark** (32 club logos, `SPEC.md` §5.1) and **PlayerMark** (Wikimedia Commons
player photos, `SPEC.md` §5.2), plus the `/credits` page data.

Offline, idempotent, resumable, and safe to interrupt. **Nothing is ever hotlinked.**

---

## Pipeline order

Run in this order. Step 3 reads the manifests the first two write, so it cannot
go first; steps 1 and 2 are independent of each other.

```
1.  python3 assets/fetch_teammarks.py     # 32 logos + manifest + chipdata
2.  python3 assets/fetch_playermarks.py   # 235 photos + licence manifest
3.  python3 assets/build_credits.py       # data/marts/credits.json
```

| # | Script | Reads | Writes |
|---|---|---|---|
| 1 | `fetch_teammarks.py` | `data/curated/staging/teams_colors_logos.csv` (re-fetched from nflverse if absent), `data/curated/staging/support_team_colors.csv` | `public/assets/teammarks/{ABBR}.png`, `manifest.json`, `chipdata.json` |
| 2 | `fetch_playermarks.py` | `data/curated/staging/player_images_sample.csv` | `public/assets/playermarks/{otc_id}.jpg` (`.png` where Commons serves PNG), `manifest.json` |
| 3 | `build_credits.py` | both manifests | `data/marts/credits.json` |

`_common.py` holds the shared HTTP client. It owns the politeness contract and
nothing else — every threshold that encodes a product decision (the resolution
floor, the rendition width, the retry budget) is a named constant at the top of
the script that implements it.

**Requirements:** Python 3.11, `requests`. No image library is used, and none is
wanted — see *ShareAlike* below.

---

## The decisions this pipeline implements

| Decision | Value | Where it lives |
|---|---|---|
| `IMAGE_MIN_WIDTH_PX` | **300** (decided 2026-07-25) | `etl/config.py`, read by `fetch_playermarks.py` |
| ShareAlike (OPEN DECISION 2) | **option (a)**, CSS-filter-only (decided 2026-07-25) | `fetch_playermarks.py` (`etl.config.IMAGE_TREATMENT_MODE` mirrors it) |
| `TEAM_LOGOS_ENABLED` | app flag, **not owned here** | `etl/config.py` |

`SPEC.md` calls the resolution floor "a one-line change", which is only true if
there is one line. `etl/config.py` owns it; `fetch_playermarks.py` imports it and
keeps a standalone literal only as a fallback for a checkout where `etl/` is
absent. The run log states which source won, and the manifest records it as
`image_min_width_source` — so a silent divergence between the two is not possible.

**Resolution floor.** Nine of the 244 usable rows are below 300px native width and
are not downloaded at all — the renderer would branch to the designed fallback
card anyway. They are listed by name under `skipped_by_floor` in the playermark
manifest, so the 6.4% effective fallback rate is auditable rather than inferred.
The floor is one constant; changing it changes the run and nothing else.

**ShareAlike / option (a).** 48% of usable photos are CC BY-SA, and a cropped,
recomposited or colour-treated photo is a **derivative work** that ShareAlike
would oblige us to relicense. Option (a) avoids that entirely: **this pipeline
never creates a fixed derivative.** It asks the Commons thumbnail service for a
600px-wide rendition — a mechanical resize that Commons itself generates and
publishes from the same file page under the same licence — and stores those bytes
untouched. The PlayerMark treatment happens in **CSS at render time**. No crop,
no composite, no mask, no re-encode, no format conversion.

> **Open item for the licensing follow-up (owner: Rey).** `RISKS.md` risk 3 words
> option (a) slightly more strictly than this — "stores and serves the original
> file exactly as Commons published it". Serving a Commons-generated thumbnail is
> the narrow gap between that wording and this implementation. It is recorded per
> asset as `rendition` (`commons_thumb_600px` or `commons_original`), so reverting
> to originals-only is one constant: `RENDITION_WIDTH_PX = None`.

### There is no 600px rendition — read this before changing `RENDITION_WIDTH_PX`

Commons no longer renders arbitrary widths. It serves a **fixed bucket list** and
snaps a request **up** to the next entry:

```
RENDITION_BUCKETS = (250, 330, 500, 960, 1280, 2560)
```

So a request for 600 lands on the **960** bucket, or returns the **unmodified
original** when the source is narrower than 960 — recorded as
`rendition: "commons_original"`, which is the more conservative outcome under
option (a), not the less.

**The Commons API misreports this.** `imageinfo.thumbwidth` echoes the width you
*asked for*, not the width it served — it returns `600` for a file that is
actually 960px wide. Every `width_fetched` in the manifest is therefore
**measured off the bytes on disk** (`_common.image_dims`), never copied from the
API. Carry-forward re-measures too, so a manifest written by an older run
self-heals on the next run without re-downloading anything.

**The bucket choice is a real disk trade-off**, measured on this population:

| Requested | Bucket served | Total disk |
|---|---|---:|
| **500** (current) | 500, or original | **~25 MB** |
| 600 | 960, or original | ~75 MB |

> **DECIDED 2026-07-25 — the 500 bucket.** Rationale: repo clone weight and deploy
> paths (25 MB vs 75 MB), and card-scale sufficiency — PlayerMark renders at
> ≤250px display width, so 500px covers 2× retina exactly. 500 still clears the
> 300px floor by 200px. **960 remains available by config**: set
> `RENDITION_WIDTH_PX = 600` and re-run with `--force`.

**The floor is enforced twice.** Once on native width at partition time, and again
on the width actually *served*, measured from the bytes — a smaller requested
bucket could in principle hand back a rendition below 300px, and the renderer
branches on the width it is given, not the width Commons holds. An asset failing
the second check is deleted from disk and recorded in `skipped_by_floor` with
`screen: "served"`, so the fallback rate stays auditable either way.

**Attribution.** 223 of 244 assets legally require it. Every credit in
`credits.json` must render **visibly**. Putting a credit behind a hover or an
"info" affordance is a licence violation, not a design preference.

---

## Re-run behaviour

**Both fetchers are resumable and skip work that is already done.** A re-run after
an interrupted run costs only the assets that are actually missing.

* An asset is **carried forward** — no API call, no download, original
  `fetched_at` preserved — when all of these hold: the previous manifest recorded
  it `status: "ok"`, the file is still on disk, and the source it came from is
  unchanged (`source_url` for logos, `file_title` for photos). Anything else is
  re-fetched.
* `--force` re-downloads everything and rewrites every `fetched_at`.
* `--dry-run` resolves and reports without writing a byte.
* `--limit N` (playermarks) caps the run for a smoke test.
* Writes are atomic (temp file + rename), so an interrupt can never leave a torn
  asset or a half-written manifest.

**Failures are recorded, never silently absent.** A download gets three retries and
is then written into the manifest as `status: "fetch_failed"` with the error.
A Commons API call gets the audit's seven-attempt backoff ladder and is then
written as `status: "api_error"`.

> **`api_error` is a re-run signal, not a result** (`audit/findings_image_audit.md`
> §8). A transport failure that returns an empty result is indistinguishable from
> "this player has no photo", and it silently deflated the hit rate by one during
> the audit. Any non-zero `api_error` count means run it again — do not publish
> the coverage number from that run.

**Politeness** (`ARCHITECTURE.md` §5): descriptive User-Agent with a contact
address, `maxlag=5` on every API call, **250 ms** minimum spacing between
requests, exponential backoff with jitter honouring `Retry-After`, and Commons
`imageinfo` batched 20 titles per call. A cold full playermark run is ~12 API
calls plus 235 downloads.

> Spacing was widened from 100 ms to 250 ms on 2026-07-25. The first full run at
> 100 ms drew **19 HTTP 429s** from `upload.wikimedia.org` — all recovered on the
> first retry, but a rate limit we provoke on every run is one bad day away from
> exhausting. The extra cost is about a minute on a cold run.

**`credits.json` is byte-stable.** It carries no timestamp and every list is sorted
on a total order (licence, then player name, then `otc_id`). Re-running it on
unchanged manifests produces byte-identical output, so a diff means the licence
surface actually moved. `python3 assets/build_credits.py --check` asserts this
without writing.

**Freshness.** Commons files get renamed, relicensed and deleted, and team
categories change every March in free agency. Re-run before each release and
**diff the manifests** rather than treating them as static reference data. Every
photo asset carries `last_verified_at` for exactly this reason.

**Disk.** Both fetchers abort at a hard **100 MB** ceiling for their asset set and
report the overage rather than filling the repo.

---

## Purge procedure — the logo kill-switch

Transcribed from `RISKS.md` risk 2, *Team logo IP — takedown response plan*.
**The response is mechanical, not improvised.** No redesign is required and no
page breaks: the fallback chip is built and tested in Phase 2, not written in
response to a notice.

### On receipt of a takedown notice, in this order, same day

> **1. Flip the `TEAM_LOGOS_ENABLED` kill-switch flag to false.**
> **2. Purge the self-hosted assets from the origin.**
> **3. Invalidate the CDN cache.**
> **4. Fallback chips render product-wide** — team abbreviation on the team's
> primary colour, glyph colour computed black-or-white by relative luminance.

### Step 1 — flip the flag

`TEAM_LOGOS_ENABLED = False` in `etl/config.py`. It is a build-time **and**
runtime flag. **This pipeline does not own it** — the `killswitch: false` field in
`public/assets/teammarks/manifest.json` records only that the asset set is live,
so that step 2 has an exact inventory to act on. Flipping the manifest field
changes no rendering.

### Step 2 — what to delete

Delete the logo binaries. **Keep both JSON files.**

```
DELETE   public/assets/teammarks/*.png
DELETE   public/assets/teammarks/*.svg

KEEP     public/assets/teammarks/chipdata.json   <- the fallback chips render FROM this
KEEP     public/assets/teammarks/manifest.json   <- the record of what was served, and from where
```

`chipdata.json` is the reason no page breaks: it carries the complete fallback
data for all 32 clubs — `abbr`, `primary`, `secondary`, and the computed `glyph` —
and it contains no logo and no club IP. Deleting it would break every route the
purge was meant to keep alive.

Keeping `manifest.json` preserves the `source_url` and `sha256` of every asset
that was served, which is what a response to counsel needs.

**Do not touch `public/assets/playermarks/`.** PlayerMark is Wikimedia Commons
material under free-culture licences and is not covered by `TEAM_LOGOS_ENABLED`.
A Commons takedown or relicence is a separate, per-asset action: drop that one
file, set its manifest row, re-run `build_credits.py`, and the renderer falls back
to the designed card through the existing `has_usable_image` / width branch.

### Step 3 — what to invalidate

```
CDN purge   /assets/teammarks/*
```

Redeploy so the build-time flag takes effect. Confirm the origin 404s on a known
path (`/assets/teammarks/KC.png`) **and** that the CDN no longer serves it — a
purge that only cleared the origin leaves the logos live at the edge, which is
the failure mode this step exists to prevent.

### Step 4 — verify the fallback

Every TeamMark renders the typographic chip: the team abbreviation on the team's
primary colour, glyph colour computed black-or-white by **relative luminance**.

The glyph colour is **computed, not taken from the secondary colour**, and this
must not be "simplified" by a future maintainer: **15 of 36 colour rows have
primary/secondary contrast below 3.0 and 6 are below 2.0**, so a secondary-colour
glyph is illegible for those clubs. Computing it gives a worst case of **4.66
(LAC)** — all 32 at or above WCAG AA. `chipdata.json` carries `pair_contrast`
alongside `glyph_contrast` purely as the evidence for that rule.

### Rehearsal

> Rehearse it once in Phase 3: flip the flag in preview, confirm every route still
> renders, flip it back.

---

## Scope notes

* **Logo variants.** `SPEC.md` §5.1 names three (`team_logo_espn`,
  `team_logo_squared`, `team_wordmark`). This pipeline fetches **one primary per
  club** — `team_logo_espn`, a 500px square PNG — and records the other variants'
  source URLs per club under `variants_available` in the manifest. A follow-up pass
  can fetch them without re-deriving anything. Note that `team_logo_wikipedia`
  points at a 179px Wikimedia thumbnail URL that no longer resolves; Wikimedia now
  serves only a fixed set of thumbnail widths.
* **`github.com/<o>/<r>/raw/…` URLs are rewritten to `raw.githubusercontent.com`.**
  The redirect form 403s through the outbound proxy; the direct host serves
  identical bytes. Mechanical rewrite, no content change.
* **The canonical 32** come from the `team` column of `support_team_colors.csv`,
  which is already normalised to current-franchise codes (`STL`/`LAR` → `LA`,
  `OAK` → `LV`, `SD` → `LAC`; the Rams are **`LA`**, never `LAR`). The four legacy
  rows in `teams_colors_logos.csv` are dropped. Colours are cross-checked between
  the two staged sources on every run and a mismatch is reported and recorded.
* **Photo file extensions follow what Commons served.** 34 of the 244 sources are
  PNG and are written `.png`. Re-encoding them to JPEG would be a lossy transform
  this pipeline has no licence-side reason to perform. **Read `file` out of the
  manifest — never guess the extension from the `otc_id`.**
