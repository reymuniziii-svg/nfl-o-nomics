#!/usr/bin/env python3
"""Fetch PlayerMark photos from Wikimedia Commons. Resumable, polite, honest.

    python3 assets/fetch_playermarks.py [--force] [--dry-run] [--limit N]

Reads
    data/curated/staging/player_images_sample.csv   251 rows, 244 usable

Writes
    public/assets/playermarks/{otc_id}.jpg          (.png where Commons serves PNG)
    public/assets/playermarks/manifest.json         per-asset licence metadata

Context
    SPEC.md          §5.2   PlayerMark; IMAGE_MIN_WIDTH_PX = 300 (decided 2026-07-25)
    SPEC.md          §7.10  player_images mart -- the field set this manifest mirrors
    ARCHITECTURE.md  §5     politeness contract; "a failed call is never a miss"
    RISKS.md         risk 3 ShareAlike / OPEN DECISION 2 -> option (a)

WHAT IS FETCHED, AND WHY IT IS COMPLIANT WITH OPTION (a)
    Option (a) forbids creating a new *fixed derivative work*: the treatment
    must be CSS at render time over an unmodified source. This pipeline asks
    the Commons thumbnail service for a 600px-wide rendition. A thumbnail is a
    mechanical resize produced and published by Commons itself from the same
    file page under the same licence -- not a crop, not a recomposite, not a
    colour treatment, and no creative choice is exercised. Nothing is baked in;
    the PlayerMark treatment still happens in CSS.

    NOTE FOR THE LICENSING FOLLOW-UP (owner: Rey). RISKS.md risk 2's wording of
    option (a) is stricter than this -- "stores and serves the original file
    exactly as Commons published it". Serving a Commons-generated thumbnail is
    the narrow gap between that wording and this implementation. It is recorded
    per asset as `rendition` so the decision is reversible in one flag:
    RENDITION_WIDTH_PX = None would store originals instead.

    Format is never converted. 34 of the 244 sources are PNG and are written as
    .png; a PNG re-encoded to JPEG would be a lossy transformation this pipeline
    has no licence-side reason to perform. Consumers read `file` from the
    manifest, never guess the extension.

THERE IS NO 600px RENDITION -- see RENDITION_BUCKETS below
    Commons serves a fixed set of thumbnail widths and snaps a request UP to the
    next one. A request for 600 lands on the 960 bucket, or returns the
    unmodified original when the source is narrower than 960. The API's
    `imageinfo.thumbwidth` echoes the width you ASKED for, not the width it
    served, so every width in the manifest is measured off the bytes on disk.
"""

from __future__ import annotations

import argparse
import csv
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import (  # noqa: E402
    PUBLIC_ASSETS, ROOT, STAGING, FetchError, Pacer, ext_for_content_type,
    http_get, human_bytes, image_dims, make_session, mediawiki_api, read_json,
    sha256_bytes, utcnow, write_bytes_atomic, write_json,
)

SOURCE_CSV = STAGING / "player_images_sample.csv"
OUT_DIR = PUBLIC_ASSETS / "playermarks"
MANIFEST = OUT_DIR / "manifest.json"

COMMONS_API = "https://commons.wikimedia.org/w/api.php"
COMMONS_FILE_PAGE = "https://commons.wikimedia.org/wiki/"

# SPEC.md §5.2, DECIDED 2026-07-25. Below this native width the renderer uses
# the designed fallback card, so there is no reason to hold the bytes.
#
# SPEC calls this "a one-line change", which is only true if there is ONE line.
# `etl/config.py` owns the app-side value, so it is read from there when the
# package is importable and the literal below is a standalone fallback -- the
# asset pipeline must still run on a checkout where etl/ is absent or mid-write.
# Drift between the two is therefore impossible when both are present.
IMAGE_MIN_WIDTH_PX = 300
IMAGE_MIN_WIDTH_SOURCE = "assets/fetch_playermarks.py (etl.config unavailable)"
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from etl.config import IMAGE_MIN_WIDTH_PX as _ETL_FLOOR  # type: ignore

    IMAGE_MIN_WIDTH_PX = int(_ETL_FLOOR)
    IMAGE_MIN_WIDTH_SOURCE = "etl/config.py"
except Exception:  # noqa: BLE001 -- any import failure falls back to the literal
    pass

# Requested rendition width.
#
# READ THIS BEFORE CHANGING IT. Commons no longer renders arbitrary widths. It
# snaps every request UP to the next entry in a fixed bucket list and refuses
# anything that is not a meaningful reduction of the source:
#
#     RENDITION_BUCKETS = (250, 330, 500, 960, 1280, 2560)
#
# There is no 600px rendition. Asking for 600 yields the 960 bucket, or the
# unmodified original when the source is narrower than 960. Worse, the API's
# `imageinfo.thumbwidth` field echoes the width you ASKED for, not the width it
# served -- so every recorded width in this manifest is measured off the bytes
# on disk instead (see _common.image_dims).
#
# DECIDED 2026-07-25 -- the 500 bucket. 600 was the original ask; because there
# is no 600 bucket it resolved to 960 and cost 75 MB. 500 costs ~25 MB, and
# PlayerMark renders at card scale (<=250px display width, so 500px covers 2x
# retina exactly). Repo clone weight and deploy paths win over headroom nobody
# renders. 960 remains available by changing this one line and re-running with
# --force; see assets/README.md.
RENDITION_WIDTH_PX = 500
RENDITION_BUCKETS = (250, 330, 500, 960, 1280, 2560)

# Commons imageinfo accepts up to 50 titles; the audit batched 20 and that is
# what the politeness budget was measured against.
API_BATCH = 20

# Three retries after the first attempt -> fetch_failed. The pipeline's rule.
DOWNLOAD_MAX_ATTEMPTS = 4
# API calls get the audit's 7-attempt backoff ladder before becoming api_error.
API_MAX_ATTEMPTS = 7

# Hard ceiling. Measured projection for 235 assets is ~59 MB; abort well before
# anything pathological lands in the repo.
DISK_ABORT_BYTES = 100 * 1024 * 1024


def log(msg: str = "") -> None:
    print(msg, flush=True)


def sort_key(otc_id: str):
    return (0, int(otc_id)) if otc_id.isdigit() else (1, otc_id)


def file_page_url(file_title: str) -> str:
    return COMMONS_FILE_PAGE + urllib.parse.quote(file_title.replace(" ", "_"), safe=":/")


_BUCKET_RE = re.compile(r"/(\d+)px-")


def served_bucket_px(url: str) -> int | None:
    """The bucket Commons actually served, read off the thumbnail URL.

    None means the URL is not a /thumb/ path, i.e. the original was served.
    """
    if "/thumb/" not in url:
        return None
    m = _BUCKET_RE.search(url)
    return int(m.group(1)) if m else None


def as_int(value: str):
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def nz(value: str):
    """Empty string -> None. license_url is null for all 14 PD files."""
    v = (value or "").strip()
    return v or None


def licence_block(row: dict) -> dict:
    """The SPEC §7.10 / audit §6 licence metadata for one row.

    `share_alike` is derived here because the audit only implied it and SPEC
    §5.2 requires it to exist as a stored field.
    """
    machine = (row.get("license_machine") or "").strip()
    return {
        "author": (row.get("author") or "").strip() or None,
        "license": (row.get("license") or "").strip(),
        "license_machine": machine,
        "license_url": nz(row.get("license_url")),
        "attribution": (row.get("attribution") or "").strip(),
        "attribution_required": (row.get("attribution_required") or "").strip().lower() == "true",
        "share_alike": machine.startswith("cc-by-sa"),
        "restrictions": nz(row.get("restrictions")),
    }


def partition(rows: list[dict]) -> tuple[list[dict], list[dict], list[dict]]:
    """usable+above-floor, skipped-by-floor, no-usable-image."""
    in_scope, by_floor, no_image = [], [], []
    for r in rows:
        if (r.get("has_usable_image") or "").strip().lower() != "true":
            no_image.append(r)
            continue
        w = as_int(r.get("width"))
        if w is None or w < IMAGE_MIN_WIDTH_PX:
            by_floor.append(r)
        else:
            in_scope.append(r)
    return in_scope, by_floor, no_image


def resolve_renditions(session, pacer, rows: list[dict]) -> tuple[dict, list[str]]:
    """Batch imageinfo -> {file_title: info}. Raises nothing; reports errors.

    Returns (resolved, api_error_titles). An exhausted batch is recorded as an
    api_error for every title in it -- never as "this player has no photo".
    """
    resolved: dict[str, dict] = {}
    api_errors: list[str] = []
    titles = [r["file_title"].strip() for r in rows]

    for i in range(0, len(titles), API_BATCH):
        batch = titles[i:i + API_BATCH]
        params = {
            "action": "query",
            "prop": "imageinfo",
            "iiprop": "url|size|mime|extmetadata",
            "iiextmetadatafilter": "LicenseShortName|License|LicenseUrl|Artist|Credit|Restrictions",
            "iiurlwidth": str(RENDITION_WIDTH_PX),
            "titles": "|".join(batch),
            "redirects": "1",
        }
        try:
            data = mediawiki_api(session, COMMONS_API, params, pacer=pacer,
                                 max_attempts=API_MAX_ATTEMPTS, log=log)
        except FetchError as exc:
            log(f"    API batch {i // API_BATCH + 1} FAILED: {exc}")
            api_errors.extend(batch)
            continue

        query = data.get("query", {})
        # Map requested title -> title the API answered under.
        alias: dict[str, str] = {}
        for key in ("normalized", "redirects"):
            for m in query.get(key, []) or []:
                alias[m.get("from", "")] = m.get("to", "")

        pages = {p.get("title"): p for p in query.get("pages", []) or []}
        for requested in batch:
            title = requested
            seen = 0
            while title in alias and seen < 5:
                title = alias[title]
                seen += 1
            page = pages.get(title)
            if page is None:
                resolved[requested] = {"error": "no page returned for title"}
                continue
            if page.get("missing"):
                resolved[requested] = {
                    "error": "commons_file_missing",
                    "resolved_title": title,
                }
                continue
            ii = (page.get("imageinfo") or [{}])[0]
            if not ii.get("thumburl") and not ii.get("url"):
                resolved[requested] = {"error": "no url in imageinfo",
                                       "resolved_title": title}
                continue
            resolved[requested] = {
                "resolved_title": title,
                "thumburl": ii.get("thumburl") or ii.get("url"),
                "thumbwidth": ii.get("thumbwidth") or ii.get("width"),
                "thumbheight": ii.get("thumbheight") or ii.get("height"),
                "native_width": ii.get("width"),
                "native_height": ii.get("height"),
                "mime": ii.get("mime"),
                "descriptionurl": ii.get("descriptionurl"),
            }
        log(f"    API batch {i // API_BATCH + 1}/"
            f"{(len(titles) + API_BATCH - 1) // API_BATCH}: {len(batch)} titles")
    return resolved, api_errors


def _width_stats(entries: dict[str, dict]) -> dict:
    """Real served-width distribution, so the resolution claim is auditable."""
    widths = [e["width_fetched"] for e in entries.values()
              if e.get("status") == "ok" and e.get("width_fetched")]
    if not widths:
        return {"n": 0}
    buckets: dict[str, int] = {}
    for e in entries.values():
        if e.get("status") != "ok":
            continue
        key = str(e.get("served_bucket_px") or "original")
        buckets[key] = buckets.get(key, 0) + 1
    widths.sort()
    return {
        "n": len(widths),
        "min": widths[0],
        "median": widths[len(widths) // 2],
        "max": widths[-1],
        "below_image_min_width_px": sum(1 for w in widths if w < IMAGE_MIN_WIDTH_PX),
        "served_bucket_counts": {k: buckets[k] for k in sorted(buckets)},
    }


def build() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true", help="re-download everything")
    ap.add_argument("--dry-run", action="store_true", help="resolve only, download nothing")
    ap.add_argument("--limit", type=int, default=0, help="cap in-scope rows (smoke test)")
    args = ap.parse_args()

    session = make_session()
    pacer = Pacer()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    rows = list(csv.DictReader(SOURCE_CSV.open(encoding="utf-8")))
    in_scope, by_floor, no_image = partition(rows)
    log("== PlayerMark fetch ==")
    log(f"  source            {SOURCE_CSV.relative_to(ROOT)}")
    log(f"  rows              {len(rows)}")
    log(f"  no usable image   {len(no_image)}   (designed fallback card)")
    log(f"  skipped by floor  {len(by_floor)}   (< {IMAGE_MIN_WIDTH_PX}px native "
        f"width, from {IMAGE_MIN_WIDTH_SOURCE})")
    log(f"  in scope          {len(in_scope)}")

    if args.limit:
        in_scope = in_scope[:args.limit]
        log(f"  --limit           {len(in_scope)}")

    prev = read_json(MANIFEST) or {}
    prev_assets = prev.get("assets", {})

    entries: dict[str, dict] = {}
    todo: list[dict] = []
    carried = healed = 0
    total_bytes = 0

    for r in in_scope:
        otc = r["otc_id"].strip()
        c = prev_assets.get(otc)
        if (not args.force and c and c.get("status") == "ok" and c.get("file")
                and (OUT_DIR / c["file"]).exists()
                and c.get("source_file_title") == r["file_title"].strip()):
            # Self-healing carry-forward: re-measure the file rather than trust
            # a width an older run may have copied out of imageinfo.thumbwidth.
            real_w, real_h = image_dims(OUT_DIR / c["file"])
            if real_w and (c.get("width_fetched") != real_w
                           or c.get("height_fetched") != real_h):
                c = dict(c)
                c["width_fetched"], c["height_fetched"] = real_w, real_h
                c["requested_width_px"] = RENDITION_WIDTH_PX
                bucket = served_bucket_px(c.get("rendition_url") or "")
                c["served_bucket_px"] = bucket
                c["rendition"] = (f"commons_thumb_{bucket}px" if bucket
                                  else "commons_original")
                healed += 1
            entries[otc] = c
            total_bytes += c.get("bytes", 0)
            carried += 1
        else:
            todo.append(r)

    log(f"  resumable carry   {carried}   (already on disk; --force to redo)")
    if healed:
        log(f"  width re-measured {healed}   (stale manifest widths corrected from disk)")
    log(f"  to fetch          {len(todo)}")

    if not todo:
        log("  nothing to fetch")

    resolved, api_error_titles = ({}, [])
    if todo:
        log(f"\n  resolving {RENDITION_WIDTH_PX}px renditions via Commons imageinfo")
        resolved, api_error_titles = resolve_renditions(session, pacer, todo)

    if args.dry_run:
        real = sum(1 for v in resolved.values() if "/thumb/" in (v.get("thumburl") or ""))
        log(f"\n  dry run -- resolved {len(resolved)}, "
            f"{real} true {RENDITION_WIDTH_PX}px thumbs, "
            f"{len(resolved) - real} served as original, "
            f"{len(api_error_titles)} api_error")
        return 0

    log(f"\n  downloading -> {OUT_DIR}")
    ok = failed = 0
    aborted = False
    served_floor: list[dict] = []
    for n, r in enumerate(todo, 1):
        otc = r["otc_id"].strip()
        title = r["file_title"].strip()
        base = {
            "otc_id": otc,
            "player": (r.get("player") or "").strip(),
            "team": (r.get("team") or "").strip() or None,
            "position": (r.get("position") or "").strip() or None,
            "source_file_title": title,
            "source_file_page_url": file_page_url(title),
            "source_file_url": nz(r.get("file_url")),
            "native_width": as_int(r.get("width")),
            "native_height": as_int(r.get("height")),
            **licence_block(r),
            "verification_method": (r.get("verification_method") or "").strip(),
            "wikidata_qid": nz(r.get("wikidata_qid")),
            "wikipedia_article": nz(r.get("wikipedia_article")),
        }

        info = resolved.get(title)
        if info is None or info.get("error"):
            reason = ("api_error" if title in api_error_titles
                      else (info or {}).get("error", "unresolved"))
            status = "api_error" if reason == "api_error" else "fetch_failed"
            entries[otc] = {
                **base, "file": None, "width_fetched": None, "rendition": None,
                "status": status, "error": reason,
                "note": ("Recorded, never silently absent. An api_error is a RE-RUN "
                         "SIGNAL, not a result (audit §8)."),
                "last_verified_at": utcnow(),
            }
            failed += 1
            log(f"    [{n}/{len(todo)}] {otc:>6s} FAIL {status}: {reason}")
            continue

        url = info["thumburl"]
        is_thumb = "/thumb/" in url
        try:
            resp = http_get(session, url, pacer=pacer,
                            max_attempts=DOWNLOAD_MAX_ATTEMPTS, log=log)
        except FetchError as exc:
            entries[otc] = {
                **base, "file": None, "width_fetched": None,
                "rendition": "thumb" if is_thumb else "original",
                "status": "fetch_failed", "error": str(exc)[:300],
                "note": "Download exhausted 3 retries. Recorded, never silently absent.",
                "last_verified_at": utcnow(),
            }
            failed += 1
            log(f"    [{n}/{len(todo)}] {otc:>6s} FAIL {exc}")
            continue

        data = resp.content
        ext = ext_for_content_type(resp.headers.get("Content-Type", ""), fallback=".jpg")
        filename = f"{otc}{ext}"
        write_bytes_atomic(OUT_DIR / filename, data)

        # Measured off the bytes, never off imageinfo.thumbwidth -- that field
        # echoes the requested width and would record 500 for a 960px file.
        real_w, real_h = image_dims(OUT_DIR / filename)
        bucket = served_bucket_px(url)

        # SECOND floor check, against what was actually SERVED. The partition
        # floor screens native width; a smaller requested bucket could in
        # principle hand back a rendition below the floor, and the renderer
        # branches on the width it is given, not the width Commons holds. An
        # asset that fails here is dropped from disk and recorded alongside the
        # native-floor skips so the fallback rate stays auditable.
        if real_w is not None and real_w < IMAGE_MIN_WIDTH_PX:
            (OUT_DIR / filename).unlink(missing_ok=True)
            served_floor.append({
                "otc_id": otc,
                "player": base["player"],
                "native_width": base["native_width"],
                "native_height": base["native_height"],
                "served_width": real_w,
                "file_title": title,
                "rendition_url": url,
                "reason": (f"served rendition width {real_w} < IMAGE_MIN_WIDTH_PX "
                           f"({IMAGE_MIN_WIDTH_PX}) despite native width "
                           f"{base['native_width']}"),
            })
            log(f"    [{n}/{len(todo)}] {otc:>6s} FLOOR served {real_w}px "
                f"< {IMAGE_MIN_WIDTH_PX}px -- dropped")
            continue

        total_bytes += len(data)
        ok += 1

        entries[otc] = {
            **base,
            "file": filename,
            "rendition_url": url,
            "rendition": f"commons_thumb_{bucket}px" if is_thumb else "commons_original",
            "requested_width_px": RENDITION_WIDTH_PX,
            "served_bucket_px": bucket,
            "width_fetched": real_w,
            "height_fetched": real_h,
            "content_type": (resp.headers.get("Content-Type") or "").split(";")[0],
            "bytes": len(data),
            "sha256": sha256_bytes(data),
            "status": "ok",
            "fetched_at": utcnow(),
            "last_verified_at": utcnow(),
        }
        if n % 25 == 0 or n == len(todo):
            log(f"    [{n}/{len(todo)}] {otc:>6s} ok  {len(data) / 1024:6.1f} KB  "
                f"running total {human_bytes(total_bytes)}")

        if total_bytes > DISK_ABORT_BYTES:
            log(f"\n  !! ABORT: {human_bytes(total_bytes)} exceeds the "
                f"{human_bytes(DISK_ABORT_BYTES)} ceiling after {n} downloads.")
            aborted = True
            break

    manifest = {
        "asset_set": "playermarks",
        "generated_by": "assets/fetch_playermarks.py",
        "generated_at": utcnow(),
        "source_csv": SOURCE_CSV.relative_to(ROOT).as_posix(),
        "image_min_width_px": IMAGE_MIN_WIDTH_PX,
        "image_min_width_source": IMAGE_MIN_WIDTH_SOURCE,
        "requested_width_px": RENDITION_WIDTH_PX,
        "rendition_buckets": list(RENDITION_BUCKETS),
        "rendition_note": (
            "Commons serves only the fixed bucket widths listed above and snaps a "
            "request UP to the next one; there is no 600px rendition. A request for "
            "600 therefore lands on the 960 bucket, or returns the unmodified "
            "original when the source is narrower than 960. Every width_fetched "
            "below is MEASURED FROM THE BYTES ON DISK -- the Commons API's "
            "imageinfo.thumbwidth echoes the requested width and cannot be trusted."
        ),
        "sharealike_option": "a",
        "sharealike_note": (
            "OPEN DECISION 2 decided 2026-07-25 -> option (a): no fixed derivative "
            "work is created. Assets are Commons-generated mechanical resizes of the "
            "unmodified source at the same licence; the PlayerMark treatment is CSS "
            "at render time. Where Commons declined to generate a thumbnail "
            "(sources narrower than the 960 bucket) the unmodified original is "
            "stored, recorded as rendition=commons_original."
        ),
        "attribution_note": (
            "Attribution is the default, not the exception. Credits must render "
            "VISIBLY -- hiding them behind a hover or an info affordance is a "
            "licence violation for every asset with attribution_required=true."
        ),
        "counts": {
            "csv_rows": len(rows),
            "no_usable_image": len(no_image),
            "skipped_by_floor": len(by_floor) + len(served_floor),
            "skipped_by_floor_native": len(by_floor),
            "skipped_by_floor_served": len(served_floor),
            "in_scope": len(in_scope),
            "ok": sum(1 for e in entries.values() if e.get("status") == "ok"),
            "carried_forward": carried,
            "fetched_this_run": ok,
            "fetch_failed": sum(1 for e in entries.values() if e.get("status") == "fetch_failed"),
            "api_error": sum(1 for e in entries.values() if e.get("status") == "api_error"),
            "rendition_thumb": sum(
                1 for e in entries.values()
                if str(e.get("rendition", "")).startswith("commons_thumb")),
            "rendition_original": sum(
                1 for e in entries.values() if e.get("rendition") == "commons_original"),
            "attribution_required": sum(
                1 for e in entries.values()
                if e.get("status") == "ok" and e.get("attribution_required")),
            "share_alike": sum(
                1 for e in entries.values()
                if e.get("status") == "ok" and e.get("share_alike")),
            "restrictions_personality": sum(
                1 for e in entries.values()
                if e.get("status") == "ok" and e.get("restrictions") == "personality"),
        },
        "width_fetched_stats": _width_stats(entries),
        "total_bytes": total_bytes,
        "aborted_on_disk_budget": aborted,
        "killswitch": False,
        "killswitch_detail": {
            "scope": (
                "PlayerMark assets are NOT covered by TEAM_LOGOS_ENABLED. A Commons "
                "takedown or relicence is a per-asset action: drop the file, set the "
                "row's status, and the renderer falls back to the designed card via "
                "has_usable_image / the width branch."
            ),
            "purge_targets": ["public/assets/playermarks/*.jpg",
                              "public/assets/playermarks/*.png"],
            "cdn_invalidate_paths": ["/assets/playermarks/*"],
        },
        # Recorded so the fallback rate is auditable, not inferred. Two kinds:
        # screened on native width before any download, and dropped after
        # download because the SERVED rendition came back below the floor.
        "skipped_by_floor": sorted(
            [
                {"otc_id": r["otc_id"].strip(),
                 "player": (r.get("player") or "").strip(),
                 "native_width": as_int(r.get("width")),
                 "native_height": as_int(r.get("height")),
                 "served_width": None,
                 "file_title": r["file_title"].strip(),
                 "screen": "native",
                 "reason": f"native width < IMAGE_MIN_WIDTH_PX ({IMAGE_MIN_WIDTH_PX})"}
                for r in by_floor
            ] + [dict(s, screen="served") for s in served_floor],
            key=lambda x: sort_key(x["otc_id"]),
        ),
        "no_usable_image": [
            {"otc_id": r["otc_id"].strip(), "player": (r.get("player") or "").strip(),
             "verification_method": (r.get("verification_method") or "").strip(),
             "notes": nz(r.get("notes"))}
            for r in sorted(no_image, key=lambda x: sort_key(x["otc_id"].strip()))
        ],
        "assets": {k: entries[k] for k in sorted(entries, key=sort_key)},
    }
    write_json(MANIFEST, manifest)

    c = manifest["counts"]
    log(f"\n  wrote {MANIFEST}")
    log("\n== summary ==")
    log(f"  playermarks       {c['ok']}/{c['in_scope']}")
    log(f"  fetched this run  {c['fetched_this_run']}  (carried {c['carried_forward']})")
    log(f"  skipped by floor  {c['skipped_by_floor']}   "
        f"({c['skipped_by_floor_native']} native + {c['skipped_by_floor_served']} served)")
    log(f"  fetch_failed      {c['fetch_failed']}")
    log(f"  api_error         {c['api_error']}   <- non-zero is a RE-RUN SIGNAL")
    log(f"  renditions        {c['rendition_thumb']} thumb / "
        f"{c['rendition_original']} original")
    w = manifest["width_fetched_stats"]
    if w.get("n"):
        log(f"  served width      min {w['min']} / median {w['median']} / max {w['max']}"
            f"  (requested {RENDITION_WIDTH_PX}, buckets {w['served_bucket_counts']})")
    log(f"  disk              {human_bytes(total_bytes)}")
    if aborted:
        log("  !! ABORTED on disk budget")
        return 2
    return 1 if (c["fetch_failed"] or c["api_error"]) else 0


if __name__ == "__main__":
    sys.exit(build())
