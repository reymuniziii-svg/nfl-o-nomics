#!/usr/bin/env python3
"""Build the /credits page data from the two asset manifests.

    python3 assets/build_credits.py [--check]

Reads
    public/assets/playermarks/manifest.json
    public/assets/teammarks/manifest.json

Writes
    data/marts/credits.json

Context
    SPEC.md  §3     /credits ships in v1 alongside /methodology
    SPEC.md  §5.2   credits carry the full attribution list, DEDUPLICATED BY AUTHOR
    RISKS.md risk 3 attribution is legally load-bearing on 91.4% of assets

BYTE-STABILITY
    This file carries no timestamp and no run-scoped value, and every list is
    sorted on a total order (license, then player name, then otc_id -- otc_id
    breaks the tie two players sharing a name would otherwise leave). Re-running
    on an unchanged pair of manifests produces byte-identical output, so a diff
    on credits.json means the licence surface actually moved. `--check` asserts
    that without writing.

WHY THE FILE CARRIES BOTH SHAPES
    `license_groups[].credits` is the reader-facing list: grouped by licence and
    deduplicated by author, because three authors account for ~49% of the photos
    and rendering 244 near-identical lines would be worse than useless.
    `entries` is the flat per-asset list -- every attribution string, one row per
    served asset -- which is what makes the page auditable against the manifest.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from _common import MARTS, PUBLIC_ASSETS, ROOT, read_json, write_json  # noqa: E402

PLAYER_MANIFEST = PUBLIC_ASSETS / "playermarks" / "manifest.json"
TEAM_MANIFEST = PUBLIC_ASSETS / "teammarks" / "manifest.json"
OUT = MARTS / "credits.json"


def log(msg: str = "") -> None:
    print(msg, flush=True)


def sort_key(otc_id: str):
    return (0, int(otc_id)) if str(otc_id).isdigit() else (1, str(otc_id))


def person_key(name: str) -> tuple:
    """Case-insensitive primary, exact secondary. Stable across locales."""
    n = (name or "")
    return (n.casefold(), n)


def build_credits(player_manifest: dict, team_manifest: dict) -> dict:
    assets = player_manifest.get("assets", {})

    # Only assets that were actually written are owed a credit. Failures are
    # counted so the page's totals reconcile against the manifest instead of
    # quietly disagreeing with it.
    served = [a for a in assets.values() if a.get("status") == "ok" and a.get("file")]
    excluded = [a for a in assets.values() if a.get("status") != "ok"]

    entries = [
        {
            "otc_id": a["otc_id"],
            "player": a.get("player", ""),
            "team": a.get("team"),
            "license": a.get("license", ""),
            "license_machine": a.get("license_machine", ""),
            "license_url": a.get("license_url"),
            "author": a.get("author"),
            "attribution": a.get("attribution", ""),
            "attribution_required": bool(a.get("attribution_required")),
            "share_alike": bool(a.get("share_alike")),
            "restrictions": a.get("restrictions"),
            "file": a["file"],
            "source_file_page_url": a.get("source_file_page_url"),
        }
        for a in served
    ]
    entries.sort(key=lambda e: (e["license"], person_key(e["player"]), sort_key(e["otc_id"])))

    # ---- grouped by licence, deduplicated by author (SPEC §5.2) -----------
    groups: dict[str, dict] = {}
    for e in entries:
        g = groups.setdefault(e["license"], {
            "license": e["license"],
            "license_machine": e["license_machine"],
            "license_url": e["license_url"],
            "share_alike": e["share_alike"],
            "attribution_required": e["attribution_required"],
            "_authors": {},
        })
        # license_url is null for every public-domain file; keep the first
        # non-null so a group is not stripped of a URL it legitimately has.
        if g["license_url"] is None and e["license_url"]:
            g["license_url"] = e["license_url"]
        # attribution_required is per asset; a group is "required" if any is.
        g["attribution_required"] = g["attribution_required"] or e["attribution_required"]

        author = e["author"] or "(uploader unknown)"
        a = g["_authors"].setdefault(author, {
            "author": author,
            "attribution": e["attribution"],
            "players": [],
        })
        a["players"].append({"otc_id": e["otc_id"], "player": e["player"]})

    license_groups = []
    for lic in sorted(groups):
        g = groups.pop(lic)
        credits = []
        for author in sorted(g["_authors"], key=person_key):
            a = g["_authors"][author]
            a["players"].sort(key=lambda p: (person_key(p["player"]), sort_key(p["otc_id"])))
            credits.append({
                "author": a["author"],
                "attribution": a["attribution"],
                "asset_count": len(a["players"]),
                "players": [p["player"] for p in a["players"]],
            })
        license_groups.append({
            "license": g["license"],
            "license_machine": g["license_machine"],
            "license_url": g["license_url"],
            "share_alike": g["share_alike"],
            "attribution_required": g["attribution_required"],
            "asset_count": sum(c["asset_count"] for c in credits),
            "author_count": len(credits),
            "credits": credits,
        })

    distinct_authors = sorted({e["author"] or "(uploader unknown)" for e in entries},
                              key=person_key)
    author_totals: dict[str, int] = {}
    for e in entries:
        k = e["author"] or "(uploader unknown)"
        author_totals[k] = author_totals.get(k, 0) + 1
    top_authors = sorted(author_totals.items(), key=lambda kv: (-kv[1], person_key(kv[0])))[:10]

    # ---- logos -----------------------------------------------------------
    teams = team_manifest.get("teams", {})
    team_ok = [t for t in teams.values() if t.get("status") == "ok"]
    ks = team_manifest.get("killswitch_detail", {})
    logos = {
        "note": (
            "Team logos are the trademarks of their respective NFL clubs and are "
            "reproduced here for editorial identification only. YIELD/YARD is not "
            "affiliated with, endorsed by, or sponsored by the National Football "
            "League or any of its clubs."
        ),
        "source_dataset": team_manifest.get("source_dataset"),
        "source_dataset_url": team_manifest.get("source_dataset_url"),
        "variant": team_manifest.get("primary_variant"),
        "self_hosted": True,
        "hotlinked": bool(team_manifest.get("hotlinked", False)),
        "logo_count": len(team_ok),
        "teams_expected": team_manifest.get("teams_expected"),
        "killswitch": bool(team_manifest.get("killswitch", False)),
        "killswitch_flag": ks.get("app_flag"),
        "killswitch_note": (
            "If the logos are withdrawn, every TeamMark renders the typographic "
            "fallback chip and this note is the only credits-page copy that changes."
        ),
    }

    return {
        "schema": "yy.credits.v1",
        "generated_by": "assets/build_credits.py",
        "sources": {
            "playermarks": PLAYER_MANIFEST.relative_to(ROOT).as_posix(),
            "teammarks": TEAM_MANIFEST.relative_to(ROOT).as_posix(),
        },
        "ordering": "license_groups by license; entries by (license, player, otc_id)",
        "policy": {
            "attribution": (
                "Attribution is the default, not the exception. Every credit below "
                "must render VISIBLY on the page. Hiding a credit behind a hover or "
                "an 'info' affordance is a licence violation for every asset with "
                "attribution_required = true."
            ),
            "sharealike_option": player_manifest.get("sharealike_option"),
            "sharealike": (
                "OPEN DECISION 2 decided 2026-07-25 -> option (a). No fixed derivative "
                "work is created: served assets are the unmodified Commons file or a "
                "Commons-generated mechanical resize of it, and the PlayerMark "
                "treatment is applied in CSS at render time. The ShareAlike obligation "
                "on derivatives is therefore never triggered."
            ),
            "image_min_width_px": player_manifest.get("image_min_width_px"),
            "photo_source": "Wikimedia Commons only. No press photography, no team media.",
        },
        "summary": {
            "photo_assets_credited": len(entries),
            "photo_assets_excluded": len(excluded),
            "license_group_count": len(license_groups),
            "distinct_authors": len(distinct_authors),
            "attribution_required": sum(1 for e in entries if e["attribution_required"]),
            "share_alike": sum(1 for e in entries if e["share_alike"]),
            "public_domain_no_license_url": sum(1 for e in entries if not e["license_url"]),
            "logo_assets": logos["logo_count"],
            "top_authors": [{"author": a, "asset_count": n} for a, n in top_authors],
        },
        "license_groups": license_groups,
        "entries": entries,
        "logos": logos,
        # Operator-facing only. SPEC §5.2: the personality flag is stored and
        # surfaced to the operator, NOT to the reader. Do not render this block.
        "operator_only": {
            "do_not_render": True,
            "personality_restricted": [
                {"otc_id": e["otc_id"], "player": e["player"],
                 "source_file_page_url": e["source_file_page_url"]}
                for e in entries if e["restrictions"] == "personality"
            ],
            "excluded_assets": [
                {"otc_id": a.get("otc_id"), "player": a.get("player"),
                 "status": a.get("status"), "error": a.get("error")}
                for a in sorted(excluded, key=lambda x: sort_key(x.get("otc_id", "")))
            ],
            "note": (
                "personality_restricted is a personality-rights warning, orthogonal "
                "to copyright and relevant because this is a commercial product. "
                "Any excluded_assets entry with status=api_error is a re-run signal, "
                "not a result."
            ),
        },
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true",
                    help="verify the on-disk credits.json is byte-identical; write nothing")
    args = ap.parse_args()

    pm = read_json(PLAYER_MANIFEST)
    tm = read_json(TEAM_MANIFEST)
    missing = [str(p.relative_to(ROOT)) for p, m in
               ((PLAYER_MANIFEST, pm), (TEAM_MANIFEST, tm)) if m is None]
    if missing:
        log(f"  !! missing manifest(s): {missing}")
        log("     run assets/fetch_teammarks.py and assets/fetch_playermarks.py first")
        return 2

    credits = build_credits(pm, tm)

    if args.check:
        import json
        expected = json.dumps(credits, indent=2, ensure_ascii=False) + "\n"
        actual = OUT.read_text(encoding="utf-8") if OUT.exists() else None
        if actual == expected:
            log(f"  byte-stable: PASS ({OUT.relative_to(ROOT)})")
            return 0
        log(f"  byte-stable: FAIL ({OUT.relative_to(ROOT)} differs or is absent)")
        return 1

    write_json(OUT, credits)
    s = credits["summary"]
    log("== credits ==")
    log(f"  wrote {OUT}")
    log(f"  photo assets credited  {s['photo_assets_credited']}")
    log(f"  excluded (not served)  {s['photo_assets_excluded']}")
    log(f"  licence groups         {s['license_group_count']}")
    log(f"  distinct authors       {s['distinct_authors']}  "
        f"(deduplicated from {s['photo_assets_credited']} assets)")
    log(f"  attribution required   {s['attribution_required']}")
    log(f"  share-alike            {s['share_alike']}")
    log(f"  logo assets            {s['logo_assets']}")
    log(f"  personality-restricted {len(credits['operator_only']['personality_restricted'])}"
        f"   (operator-only, not rendered)")
    for g in credits["license_groups"]:
        log(f"    {g['license']:16s} {g['asset_count']:4d} assets  "
            f"{g['author_count']:3d} authors")
    return 0


if __name__ == "__main__":
    sys.exit(main())
