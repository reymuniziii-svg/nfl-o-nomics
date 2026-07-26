"""`player_images` — licence metadata, one row per player. SPEC.md §7.10.

Assembled from two committed artefacts, both offline:

* `data/curated/staging/player_images_sample.csv` — the 251-player audited
  population (`SPEC.md` §8.4), carrying the Commons resolution result and the
  licence block from `audit/audit_images.py`.
* `public/assets/playermarks/manifest.json` — the asset pipeline's per-file
  record (`ARCHITECTURE.md` §5): what was actually fetched, at what rendition,
  its sha256, and its `last_verified_at`.

**No network call.** A cached asset's licence metadata is only as good as its
last verification, so the mart carries the verification stamp from the fetch
manifest rather than reading a clock at build time — which also keeps the mart
byte-stable.

TWO FIELDS THE AUDIT ONLY IMPLIED AND THAT MUST EXIST (`SPEC.md` §5.2):

* **`share_alike`**, derived from `license_machine`. 48.0% of usable photos are
  CC BY-SA, and a ShareAlike obligation that is not queryable cannot be honoured.
* **`last_verified_at`**. Commons files get renamed, relicensed and deleted; a
  cached asset without a re-verification timestamp silently rots.

**`license_url` must be nullable** — all 14 public-domain files have none, and a
NOT NULL constraint here would force a fabricated URL onto a PD asset.

THE RESOLUTION FLOOR IS A SEPARATE FACT FROM COMMONS COVERAGE.
`SPEC.md` §5.2: the designed card fallback fires "whenever `has_usable_image` is
false **or** the asset is below the resolution floor". So `has_usable_image`
stays the Commons fact (244 of 251 = 97.2%) and `meets_min_width` carries the
`IMAGE_MIN_WIDTH_PX` decision separately. `renders_photo` is the conjunction —
235 of 251 = 93.6%, with the 6.4% designed-card fallback that gate #3 instance 1
signed off. Moving the floor is then a config change plus a re-run, and both
published coverage numbers stay derivable from the mart.

**Attribution is the default, not the exception: 91.4% require it.** A design
that hides credits behind a hover is a licence violation for those assets. The
prerendered `attribution` string ships per row and `/credits` deduplicates by
author — three authors account for ~49% of usable photos.
"""

from __future__ import annotations

import json

import pandas as pd

from . import config, io_utils

STAGING_CSV = config.STAGING / "player_images_sample.csv"
ASSET_MANIFEST = config.REPO / "public" / "assets" / "playermarks" / "manifest.json"

#: SPEC §5.2 / DATA_AUDIT.md §2, asserted so a silent coverage change is caught.
EXPECTED_POPULATION = 251
EXPECTED_USABLE = 244          # 97.2% Commons coverage, any resolution
EXPECTED_RENDERED = 235        # 93.6% at IMAGE_MIN_WIDTH_PX = 300
EXPECTED_SHARE_ALIKE = 116     # of the rendered set
EXPECTED_ATTRIBUTION = 215     # of the rendered set
EXPECTED_RESTRICTIONS = 12     # `personality` — orthogonal to copyright

#: `share_alike` is derived from `license_machine`, never from the display string.
SHARE_ALIKE_MARKER = "-sa-"


def _load_manifest() -> tuple[dict, dict]:
    if not ASSET_MANIFEST.exists():
        raise FileNotFoundError(
            f"{ASSET_MANIFEST} is missing — the PlayerMark asset pipeline "
            "(ARCHITECTURE §5) must run before player_images can be built.")
    m = json.loads(ASSET_MANIFEST.read_text(encoding="utf-8"))
    assets = {str(k): v for k, v in (m.get("assets") or {}).items()}
    return m, assets


def _bool(v) -> bool:
    if isinstance(v, str):
        return v.strip().lower() in ("true", "1", "yes")
    return bool(v)


def build(*, verbose: bool = True) -> tuple[pd.DataFrame, dict]:
    src = io_utils.read_csv(STAGING_CSV)
    if len(src) != EXPECTED_POPULATION:
        raise AssertionError(
            f"the v1 player population is the {EXPECTED_POPULATION} audited players "
            f"(SPEC §8.4, DECISIONS 53) — found {len(src)}")
    manifest, assets = _load_manifest()

    # An api_error is a RE-RUN SIGNAL, NOT A RESULT — a failed call is never
    # recorded as a miss, because an empty result is indistinguishable from
    # "this player has no photo" (SPEC §7.10).
    api_errors = int(manifest.get("counts", {}).get("api_error", 0))
    if api_errors:
        raise AssertionError(
            f"the asset manifest records {api_errors} api_error(s). That is a "
            "re-run signal, not a result — re-run the asset pipeline before "
            "building player_images.")

    # No wall clock: the fallback stamp is the manifest's own committed value.
    default_verified = str(manifest.get("generated_at", ""))[:10]

    rows = []
    for r in src.itertuples():
        pid = str(int(r.otc_id))
        a = assets.get(pid)
        usable = _bool(r.has_usable_image)
        lic_machine = "" if pd.isna(r.license_machine) else str(r.license_machine)

        if a is not None:
            width = a.get("native_width")
            height = a.get("native_height")
            lic_machine = a.get("license_machine") or lic_machine
            rows.append({
                "player_id": pid,
                "has_usable_image": usable,
                "file_title": a.get("source_file_title"),
                "file_url": a.get("source_file_url"),
                "width": width, "height": height,
                "author": a.get("author"),
                "license": a.get("license"),
                "license_machine": lic_machine,
                "license_url": a.get("license_url"),
                "attribution": a.get("attribution"),
                "attribution_required": _bool(a.get("attribution_required")),
                "share_alike": SHARE_ALIKE_MARKER in (lic_machine or ""),
                "restrictions": a.get("restrictions"),
                "verification_method": a.get("verification_method"),
                "wikidata_qid": a.get("wikidata_qid"),
                "wikipedia_article": a.get("wikipedia_article"),
                "notes": None if pd.isna(r.notes) else str(r.notes),
                "last_verified_at": str(a.get("last_verified_at", ""))[:10]
                                    or default_verified,
                # --- rendition block: what is actually served from our origin ---
                "meets_min_width": True,
                "renders_photo": True,
                "asset_file": a.get("file"),
                "rendition": a.get("rendition"),
                "rendition_width": a.get("width_fetched"),
                "rendition_height": a.get("height_fetched"),
                "rendition_sha256": a.get("sha256"),
                "rendition_bytes": a.get("bytes"),
            })
            continue

        # No asset on disk: either Commons had nothing usable, or the source is
        # below IMAGE_MIN_WIDTH_PX. Both render the designed card; they are
        # DIFFERENT FACTS and are recorded separately.
        native_w = None if pd.isna(r.width) else int(r.width)
        below_floor = bool(usable and native_w is not None
                           and native_w < config.IMAGE_MIN_WIDTH_PX)
        rows.append({
            "player_id": pid,
            "has_usable_image": usable,
            "file_title": None if pd.isna(r.file_title) else str(r.file_title),
            "file_url": None if pd.isna(r.file_url) else str(r.file_url),
            "width": native_w,
            "height": None if pd.isna(r.height) else int(r.height),
            "author": None if pd.isna(r.author) else str(r.author),
            "license": None if pd.isna(r.license) else str(r.license),
            "license_machine": lic_machine or None,
            "license_url": None if pd.isna(r.license_url) else str(r.license_url),
            "attribution": None if pd.isna(r.attribution) else str(r.attribution),
            "attribution_required": _bool(r.attribution_required)
                                    if not pd.isna(r.attribution_required) else False,
            "share_alike": SHARE_ALIKE_MARKER in (lic_machine or ""),
            "restrictions": None if pd.isna(r.restrictions) else str(r.restrictions),
            "verification_method": (None if pd.isna(r.verification_method)
                                    else str(r.verification_method)),
            "wikidata_qid": None if pd.isna(r.wikidata_qid) else str(r.wikidata_qid),
            "wikipedia_article": (None if pd.isna(r.wikipedia_article)
                                  else str(r.wikipedia_article)),
            "notes": None if pd.isna(r.notes) else str(r.notes),
            "last_verified_at": default_verified,
            "meets_min_width": not below_floor if usable else False,
            "renders_photo": False,
            "asset_file": None, "rendition": None,
            "rendition_width": None, "rendition_height": None,
            "rendition_sha256": None, "rendition_bytes": None,
        })

    out = pd.DataFrame(rows).sort_values("player_id", key=lambda s: s.astype(int))
    out = out.reset_index(drop=True)
    out = io_utils.as_int64(out, ["width", "height", "rendition_width",
                                  "rendition_height", "rendition_bytes"])
    for c in ("has_usable_image", "attribution_required", "share_alike",
              "meets_min_width", "renders_photo"):
        out[c] = out[c].astype(bool)

    _check(out, manifest)

    rendered = out[out["renders_photo"]]
    stats = {
        "population": len(out),
        "has_usable_image": int(out["has_usable_image"].sum()),
        "commons_coverage": round(float(out["has_usable_image"].mean()), 4),
        "renders_photo": int(len(rendered)),
        "render_coverage": round(float(out["renders_photo"].mean()), 4),
        "designed_card_fallback": round(1 - float(out["renders_photo"].mean()), 4),
        "image_min_width_px": config.IMAGE_MIN_WIDTH_PX,
        "below_floor": int((out["has_usable_image"] & ~out["meets_min_width"]).sum()),
        "no_usable_image": int((~out["has_usable_image"]).sum()),
        "attribution_required": int(rendered["attribution_required"].sum()),
        "share_alike": int(rendered["share_alike"].sum()),
        "restrictions_personality": int((out["restrictions"] == "personality").sum()),
        "license_url_null": int(out["license_url"].isna().sum()),
        "distinct_authors": int(rendered["author"].nunique()),
        "treatment_mode": config.IMAGE_TREATMENT_MODE,
    }
    return out, stats


def _check(out: pd.DataFrame, manifest: dict) -> None:
    io_utils.assert_unique(out, ["player_id"], "player_images")
    if out["player_id"].isna().any():
        raise AssertionError("player_images: player_id is the key and is 100%")
    n_usable = int(out["has_usable_image"].sum())
    if n_usable != EXPECTED_USABLE:
        raise AssertionError(
            f"Commons coverage changed: {n_usable} usable, expected {EXPECTED_USABLE} "
            "(97.2% of the 251-player population)")
    n_render = int(out["renders_photo"].sum())
    if n_render != EXPECTED_RENDERED:
        raise AssertionError(
            f"render coverage changed: {n_render}, expected {EXPECTED_RENDERED} at "
            f"IMAGE_MIN_WIDTH_PX={config.IMAGE_MIN_WIDTH_PX}")
    rendered = out[out["renders_photo"]]
    if int(rendered["attribution_required"].sum()) != EXPECTED_ATTRIBUTION:
        raise AssertionError("attribution_required count changed")
    if int(rendered["share_alike"].sum()) != EXPECTED_SHARE_ALIKE:
        raise AssertionError("share_alike count changed")
    if int((out["restrictions"] == "personality").sum()) != EXPECTED_RESTRICTIONS:
        raise AssertionError("`personality` restriction count changed")
    # license_url is NULLABLE and must stay so — public-domain files have none.
    pd_rows = out[out["license_machine"].fillna("").str.startswith(("pd", "cc0"))]
    if len(pd_rows) and pd_rows["license_url"].notna().all():
        raise AssertionError(
            "every public-domain row carries a license_url — license_url must be "
            "nullable (SPEC §7.10); a fabricated URL on a PD asset is a defect")
    # Every rendered asset must actually exist on disk under our own origin.
    missing = [r.asset_file for r in rendered.itertuples()
               if not (ASSET_MANIFEST.parent / str(r.asset_file)).exists()]
    if missing:
        raise AssertionError(
            f"{len(missing)} rendered asset(s) are recorded but absent from "
            f"public/assets/playermarks/: {missing[:3]}")
    # Nothing is ever hotlinked: file_url is a FETCH source, asset_file is served.
    if rendered["asset_file"].isna().any():
        raise AssertionError("a rendered row has no self-hosted asset_file")


def mart_player_images(ctx) -> pd.DataFrame:
    out, stats = build(verbose=ctx.verbose)
    ctx.stats["player_images"] = stats
    ctx.note_source(
        "curated staging player_images_sample.csv + playermarks asset manifest",
        rows=stats["population"], window="251-player v1 population (SPEC §8.4)")
    if ctx.verbose:
        print(f"  {stats['population']} players; Commons coverage "
              f"{stats['commons_coverage']:.1%} ({stats['has_usable_image']}), "
              f"renders {stats['render_coverage']:.1%} ({stats['renders_photo']}) at "
              f"IMAGE_MIN_WIDTH_PX={stats['image_min_width_px']}")
        print(f"  designed-card fallback {stats['designed_card_fallback']:.1%} = "
              f"{stats['no_usable_image']} no image + {stats['below_floor']} below floor")
        print(f"  attribution required {stats['attribution_required']}, share-alike "
              f"{stats['share_alike']}, personality {stats['restrictions_personality']}, "
              f"license_url null {stats['license_url_null']}; "
              f"{stats['distinct_authors']} distinct authors for /credits")
    return out
