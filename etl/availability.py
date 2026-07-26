"""`player_season_availability` — SPEC.md §7.9, second interface.

Games and snap counts per player-season. Promoted from the snap-count section of
`audit/audit_support.py`.

TWO TRAPS RIDE ON THIS MART, both from `DATA_AUDIT.md` §6:

* **Trap 6 — the 2012 snaps file is empty.** It returns HTTP 200 and contains
  **zero rows**. An existence probe reports coverage that is not there. The
  window therefore starts at 2013 (`DECISIONS.md` 37), which is also where Tier 2
  starts, so there is no Tier 2 season without snaps and no roster-based
  fallback is needed — the two boundaries coincide exactly. This module asserts
  the 2012 file is still empty rather than trusting the constant.
* **Trap 5 — snaps join through the `players.parquet` bridge only.** Snap counts
  carry `pfr_player_id` and no `gsis_id`; a direct `pfr_id` join to rosters
  matches 34.5% in 2013 and 71.3% in 2023, while bridging through
  `players.parquet` on `gsis_id` matches 99.99% / 99.95% (`DECISIONS.md` 38).
  `gsis_id` is the hub; `pfr_id` is the only bridge to snaps.

Two more rules that are easy to get wrong:

* Snap rows filter `game_type = 'REG'`. **The postseason uses `WC`/`DIV`/`CON`/
  `SB` and there is no `POST` literal** — a `game_type <> 'POST'` filter silently
  keeps every playoff game.
* **`off_pct` is a 0-1 FRACTION, not a 0-100 percentage.** Golden test 18
  depends on it: Laken Tomlinson's 100% of the 2023 Jets' offensive snaps is
  stored as `1.000`.
"""

from __future__ import annotations

import time

import pandas as pd

from . import config, io_utils, sources
from .team_codes import assert_full_32, normalize_series

#: Golden check 18 — DATA_AUDIT.md §3. NYJ missed the 2023 playoffs, so REG-only
#: equals the season total here.
GOLDEN_TOMLINSON = {
    "season": 2023, "team": "NYJ", "player": "Laken Tomlinson",
    "off_snaps": 1101, "games": 17, "off_pct": 1.0,
}

SNAP_COLS = (
    "season, game_type, game_id, player, pfr_player_id, team, "
    "offense_snaps, offense_pct, defense_snaps, st_snaps"
)


def _season_frame(con, year: int) -> pd.DataFrame:
    """One row per (pfr_player_id, team) for one season, REG games only."""
    return con.execute("""
        SELECT pfr_player_id,
               team,
               any_value(player)          AS player,
               count(DISTINCT game_id)    AS games,
               sum(offense_snaps)         AS off_snaps,
               sum(defense_snaps)         AS def_snaps,
               sum(st_snaps)              AS st_snaps,
               avg(offense_pct)           AS off_pct
        FROM snaps
        WHERE game_type = 'REG' AND pfr_player_id IS NOT NULL
        GROUP BY 1, 2
    """).df().assign(season=year)


def build(*, download: bool = False, verbose: bool = True) -> tuple[pd.DataFrame, dict]:
    lo, hi = config.SNAP_START, config.TIER2_WINDOW[1]
    con = sources.duck_connect()

    # Trap 6, asserted rather than assumed: check the row count, not the status
    # code. If 2012 ever gains rows that is a finding, not a silent extension.
    empty_url = config.SNAPS_URL.format(year=config.SNAP_START - 1)
    n2012 = con.execute(
        f"SELECT count(*) FROM read_parquet('{empty_url}')").fetchone()[0]
    if n2012 != 0:
        raise AssertionError(
            f"snap_counts_{config.SNAP_START - 1}.parquet now has {n2012} rows — the "
            "2013 snap boundary (DECISIONS 37) was set because this asset returns "
            "HTTP 200 and zero rows. Verify before extending the window.")

    parts, asset_rows = [], 0
    for year in range(lo, hi + 1):
        t0 = time.time()
        sources.scan_parquet(con, config.SNAPS_URL.format(year=year), "snaps",
                             SNAP_COLS, download=download)
        n = con.execute("SELECT count(*) FROM snaps").fetchone()[0]
        if n == 0:
            raise AssertionError(f"snap_counts_{year}.parquet is empty")
        asset_rows += int(con.execute(
            "SELECT count(*) FROM snaps WHERE game_type = 'REG'").fetchone()[0])
        d = _season_frame(con, year)
        parts.append(d)
        if verbose:
            print(f"  snaps {year}: {n:>6} rows -> {len(d):>5} player-team-seasons "
                  f"({time.time() - t0:.1f}s)")

    d = pd.concat(parts, ignore_index=True)

    # THE BRIDGE. pfr_id is unique in players.parquet (0 duplicate groups), so
    # this is a genuine 1:1 lookup, not a fan-out.
    sources.scan_parquet(con, config.PLAYERS_URL, "players", "gsis_id, pfr_id",
                         download=download)
    bridge = con.execute("""
        SELECT pfr_id AS pfr_player_id, gsis_id
        FROM players WHERE pfr_id IS NOT NULL AND gsis_id IS NOT NULL
    """).df()
    if bridge["pfr_player_id"].duplicated().any():
        raise AssertionError("players.parquet pfr_id is not unique — the bridge "
                             "would fan out snap rows")
    before = len(d)
    d = d.merge(bridge, on="pfr_player_id", how="left")
    unbridged = int(d["gsis_id"].isna().sum())
    d = d.dropna(subset=["gsis_id"])

    d["team"] = normalize_series(d["team"]).astype("object")

    out = d[[
        "gsis_id", "season", "team", "player", "pfr_player_id",
        "games", "off_snaps", "def_snaps", "st_snaps", "off_pct",
    ]].sort_values(["season", "team", "gsis_id"]).reset_index(drop=True)

    out = io_utils.round_cols(out, {"off_pct": 6})
    out = io_utils.as_int64(out, ["games", "off_snaps", "def_snaps", "st_snaps"])

    assert_full_32(out["team"], "player_season_availability")
    io_utils.assert_unique(out, ["gsis_id", "season", "team"],
                           "player_season_availability")
    if out["off_pct"].max() > 1.0 or out["off_pct"].min() < 0.0:
        raise AssertionError(
            "off_pct must be a 0-1 fraction, not a 0-100 percentage "
            f"(range {out['off_pct'].min()}..{out['off_pct'].max()})")
    if int(out["season"].min()) < lo or int(out["season"].max()) > hi:
        raise AssertionError("player_season_availability escaped its window")

    g = out[(out["season"] == GOLDEN_TOMLINSON["season"])
            & (out["team"] == GOLDEN_TOMLINSON["team"])
            & (out["player"] == GOLDEN_TOMLINSON["player"])]
    if len(g) != 1:
        raise AssertionError(
            f"golden 18: expected 1 Tomlinson 2023 NYJ row, got {len(g)}")
    gr = g.iloc[0]
    if int(gr["off_snaps"]) != GOLDEN_TOMLINSON["off_snaps"]:
        raise AssertionError(
            f"golden 18: Tomlinson REG offensive snaps {int(gr['off_snaps'])} "
            f"!= {GOLDEN_TOMLINSON['off_snaps']}")
    if int(gr["games"]) != GOLDEN_TOMLINSON["games"]:
        raise AssertionError(f"golden 18: Tomlinson games {int(gr['games'])} != 17")
    if round(float(gr["off_pct"]), 3) != GOLDEN_TOMLINSON["off_pct"]:
        raise AssertionError(
            f"golden 18: Tomlinson off_pct {gr['off_pct']} != 1.000 "
            "(offense_pct is a 0-1 fraction)")

    stats = {
        "rows": len(out),
        "window": f"{lo}-{hi}",
        "player_team_seasons_before_bridge": before,
        "unbridged_dropped": unbridged,
        "bridge_rate": round(1 - unbridged / before, 6),
        "distinct_players": int(out["gsis_id"].nunique()),
        "reg_snap_rows_consumed": asset_rows,
        "golden_tomlinson": {
            "off_snaps": int(gr["off_snaps"]), "games": int(gr["games"]),
            "off_pct": round(float(gr["off_pct"]), 3), "delta": 0,
        },
    }
    return out, stats


def mart_player_season_availability(ctx) -> pd.DataFrame:
    out, stats = build(download=ctx.download, verbose=ctx.verbose)
    ctx.stats["player_season_availability"] = stats
    ctx.note_source("nflverse snap_counts_{year}.parquet + players.parquet bridge",
                    asset="snap_counts",
                    rows=stats["player_team_seasons_before_bridge"],
                    asset_rows=stats["reg_snap_rows_consumed"],
                    window=f"{stats['window']} REG")
    if ctx.verbose:
        print(f"  {stats['rows']} player-team-seasons, "
              f"{stats['distinct_players']} distinct gsis_ids; bridge rate "
              f"{stats['bridge_rate']:.4%} ({stats['unbridged_dropped']} rows had no "
              f"gsis_id and are excluded)")
        print(f"  golden 18 Tomlinson 2023 NYJ: {stats['golden_tomlinson']['off_snaps']} "
              f"REG off snaps over {stats['golden_tomlinson']['games']} games, "
              f"off_pct {stats['golden_tomlinson']['off_pct']}  PASS")
    return out
