"""`etl/pins.toml` — the release-asset pin file. `DECISIONS.md` 8, `ARCHITECTURE.md` §4.4.

*"nflverse assets pinned to a named release tag with row counts and checksums;
never `latest`."*

**Derived, not hand-maintained.** Every field here comes from the same
`data_version` scheme the manifest uses: the release tag is parsed out of the URL
the ETL actually read, the projected column list is the one the scan requested,
and the row count is what that scan returned — recorded by `Context.note_source`
during the build. Nothing is typed in twice, so the pin file cannot drift from
the pipeline that produced it.

## The checksum gap, stated rather than papered over

`DECISIONS.md` 8 asks for a **checksum** per asset, and this file does not carry
one. That is a deliberate, documented consequence of `DECISIONS.md` 7: the ETL
reads every release asset by **remote DuckDB `httpfs` scan** and `data/raw/` is
empty at rest. A file checksum requires materialising the file — 27 pbp parquets
at ~20 MB each on every run — which is exactly what the remote-scan design
exists to avoid.

What is pinned instead is strictly stronger for the failure this guards against
(`RISKS.md` risk 6, schema drift):

* the **named release tag**, never `latest`;
* the **exact projected column set** — a renamed or dropped column fails the scan
  immediately rather than silently producing nulls;
* the **observed row count actually consumed** from the scan itself; and
* the **18 golden tests**, which score real values out of these assets at exact
  and ±1% tolerances and fail on a one-dollar drift.

A file checksum would additionally catch a byte-level republish that changed
nothing we read. That is the only case not covered, and it is the least harmful
one. Closing it properly needs a `--download` verification pass; it is recorded
here as the open item rather than faked.
"""

from __future__ import annotations

from pathlib import Path

from . import config

#: Upstream assets, keyed by the `asset` tag the mart modules pass to
#: `Context.note_source`. `tag` is the nflverse release tag parsed from the URL.
ASSETS = {
    "pbp": {
        "url": config.PBP_URL,
        "projected": "season, season_type, posteam, defteam, play_type, epa",
        "note": "372 columns in the file; we read six. One file per season.",
    },
    "contracts": {
        "url": config.CONTRACTS_URL,
        "projected": "* (the nested `cols` list is unnested and deduped in DuckDB)",
        "note": "OTC-derived. `cols` is a PLAYER-level career table replicated onto "
                "every contract row — dedupe on (otc_id, year) or team totals "
                "inflate 3-7x (DATA_AUDIT §6 trap 1).",
    },
    "draft_picks": {
        "url": config.DRAFT_URL,
        "projected": "season, round, pick, team, gsis_id, pfr_player_id, "
                     "pfr_player_name, position, side, college, hof, allpro, "
                     "probowls, seasons_started, w_av, games",
        "note": "`car_av` is 100% null and deliberately NOT projected "
                "(DECISIONS 40). Team codes are PFR boxscore codes.",
    },
    "players": {
        "url": config.PLAYERS_URL,
        "projected": "otc_id, gsis_id, pfr_id, display_name",
        "note": "The crosswalk hub. The ONLY file carrying otc_id, and the only "
                "bridge from gsis_id to snap counts' pfr_id (DECISIONS 38).",
    },
    "snap_counts": {
        "url": config.SNAPS_URL,
        "projected": "season, game_type, game_id, player, pfr_player_id, team, "
                     "offense_snaps, offense_pct, defense_snaps, st_snaps",
        "note": "One file per season. The 2012 asset returns HTTP 200 and ZERO "
                "rows — the pipeline asserts it is still empty rather than "
                "trusting the 2013 boundary constant (DECISIONS 37).",
    },
    "games": {
        "url": config.GAMES_URL,
        "projected": "season, game_type, week, home_team, away_team, "
                     "home_score, away_score",
        "note": "NOT A RELEASE ASSET — nfldata serves games.csv from the master "
                "branch, so there is no tag to pin and `branch = master` is the "
                "honest record. Carries 272 unplayed 2026 rows; every mart clips.",
    },
}


def _tag(url: str) -> str:
    """The nflverse release tag, parsed from the URL the ETL actually read."""
    marker = "/releases/download/"
    if marker in url:
        return url.split(marker, 1)[1].split("/", 1)[0]
    return "master"  # a raw branch path, not a release


def _observed(manifest: dict) -> dict:
    """Row counts and windows, collected from the build's own source notes."""
    seen: dict[str, dict] = {}
    for name, m in sorted(manifest.get("marts", {}).items()):
        for src in m.get("source_data", []):
            asset = src.get("asset")
            if asset is None:
                continue
            rec = seen.setdefault(asset, {"consumed_by": [], "rows": None,
                                          "window": None})
            if name not in rec["consumed_by"]:
                rec["consumed_by"].append(name)
            n = src.get("asset_rows", src.get("rows"))
            if n is not None and rec["rows"] is None:
                rec["rows"] = int(n)
            if src.get("window") and rec["window"] is None:
                rec["window"] = src["window"]
    return seen


def _esc(s: str) -> str:
    return str(s).replace("\\", "\\\\").replace('"', '\\"')


def render(manifest: dict) -> str:
    obs = _observed(manifest)
    dv = manifest.get("data_version", {})
    out = [
        "# etl/pins.toml — GENERATED by `python -m etl.pipeline`. Do not hand-edit.",
        "#",
        "# DECISIONS 8: nflverse assets are pinned to a NAMED RELEASE TAG, never",
        "# `latest`. Bumping a pin is an explicit commit that re-runs the golden",
        "# tests (ARCHITECTURE §4.4). See etl/pins.py for the documented checksum",
        "# gap and why the remote-scan design (DECISIONS 7) leaves it open.",
        "",
        "[meta]",
        'generated_by = "python -m etl.pipeline"',
        'checksum_status = "not recorded — see etl/pins.py; assets are scanned '
        'remotely and data/raw/ stays empty, so no file ever lands to hash"',
        'drift_detection = "named tag + exact projected column set + observed '
        'row count + the 18 golden tests"',
        "",
        "[data_version]",
    ]
    for k in sorted(dv):
        v = dv[k]
        if isinstance(v, (list, dict)):
            continue
        out.append(f'{k} = "{_esc(v)}"' if isinstance(v, str) else f"{k} = {v}")
    out.append("")

    for asset in sorted(ASSETS):
        spec = ASSETS[asset]
        o = obs.get(asset, {})
        out.append(f"[assets.{asset}]")
        out.append(f'tag = "{_tag(spec["url"])}"')
        out.append(f'url = "{_esc(spec["url"])}"')
        out.append(f'projected_columns = "{_esc(spec["projected"])}"')
        if o.get("rows") is not None:
            out.append(f"observed_rows_consumed = {o['rows']}")
        if o.get("window"):
            out.append(f'window = "{_esc(o["window"])}"')
        if o.get("consumed_by"):
            joined = ", ".join(f'"{c}"' for c in o["consumed_by"])
            out.append(f"consumed_by = [{joined}]")
        out.append(f'note = "{_esc(spec["note"])}"')
        out.append("")
    return "\n".join(out).rstrip("\n") + "\n"


def write(manifest: dict) -> Path:
    path = Path(__file__).resolve().parent / "pins.toml"
    path.write_text(render(manifest), encoding="utf-8")
    return path
