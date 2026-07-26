"""`player_season_production` — SPEC.md §7.13.

The data behind the player view's **position-appropriate production line**
(`SPEC.md` §3.3 point 6): passing for QBs, rushing for RBs, receiving for WR/TE,
defensive counts where available. Until this mart landed the panel rendered a
designed boundary message, because per-player production was genuinely not in
the snapshot — the honest state, not a placeholder.

Population is **exactly the 251 audited players** of `SPEC.md` §8.4 /
`DECISIONS.md` 53 — the same set `player_images` covers, so every player page
has known image status, known licence metadata, and now a known production line.
It is not a filtered sample of a wider table; it is the whole v1 population.

--------------------------------------------------------------------------------
THE BRIDGE

`player_images.player_id` **is** the `otc_id` (`SPEC.md` §7.10). Play-by-play is
keyed on `gsis_id`, the hub of the star schema (`DECISIONS.md` 38). The crosswalk
runs in two steps and **fails loudly rather than silently shipping 249 of 251**:

1. `player_season_cap.csv`, which already carries a resolved `(otc_id, gsis_id)`
   pair per player-season. All 251 resolve here, 1:1, with no `otc_id` mapping to
   two `gsis_id`s.
2. `players.parquet` via `contracts._gsis_crosswalk` — the same mandatory
   crosswalk every other player mart uses — for any `otc_id` step 1 misses.

Step 2 is a genuine fallback, not decoration: it is the documented route and it
runs only when step 1 leaves something unresolved, so the common case does not
pay for a remote scan it does not need.

--------------------------------------------------------------------------------
FOUR RULES THAT ARE LOAD-BEARING

* **REG only** (`DECISIONS.md` 9), 1999–2025 (`config.PERF_WINDOW`), read by
  per-season remote DuckDB scan with a narrow column projection — the
  `build_team_season_epa` pattern. `data/raw/` stays empty (`DECISIONS.md` 7).

* **`two_point_attempt = 0` on every offensive aggregate.** Two-point conversions
  carry a passer, a rusher and a receiver and are *not* official statistics.
  Derrick Henry's 2020 is 380 rushing attempts with them and the official **378**
  without; the yardage is unaffected, so the error hides in the attempt count.

* **Sacks are not pass attempts.** nflverse's `pass_attempt` is 1 on a sack;
  the official attempt count excludes them. Mahomes 2023 is 624 with sacks and
  the official **597** without. The filter is applied to `pass_attempts` only —
  completions, yards, touchdowns and interceptions are already 0 on a sack row.

* **A sack is 1.0 on `sack_player_id` or 0.5 on each of `half_sack_1/2`.** The
  two forms never co-occur on a row (verified: 0 overlapping rows), so summing
  all three is a partition, not a double count.

--------------------------------------------------------------------------------
`tackles_basis` — A DISCLOSURE COLUMN, NOT A DECORATION

Play-by-play tackle attribution **diverges from official gamebook counts** and
the divergence is not small: T.J. Watt's 2021 is **58** tackles by this route
against the **64** combined (48 solo + 16 assist) every box score prints. Play
description parsing misses tackles the gamebook credits, and the gap moves by
season and by player.

The column therefore ships as a constant `'pbp'` on every row so the UI can
label the figure at the point of render, and **no golden test is ever written on
tackles** — the three goldens here are sacks, interceptions and yards, all of
which reproduce their published values exactly. Shipping tackles unlabelled
beside a sack total that *is* exact would be the failure `SPEC.md` §1.2 forbids:
two numbers of different provenance rendered as one.

--------------------------------------------------------------------------------
NULL IS NOT ZERO

Each of the four blocks (passing, rushing, receiving, defence) is populated **as
a unit**, and only for a player-season with at least one credited event in it. A
quarterback's `rec_yards` is `null` — he was never targeted — while a receiver
targeted five times who caught none has `receptions` 0 and `rec_yards` 0, which
are real readings. A row exists only where there is production to report; a
player-season with none is absent, and the view renders §1.2's boundary message
rather than a row of zeroes.
"""

from __future__ import annotations

import time

import pandas as pd

from . import config, contracts, io_utils, sources
from .team_codes import normalize_series

#: The narrow projection. The pbp files carry 372 columns; this reads 36.
NEEDED_PBP_COLS = (
    "season, season_type, week, play_type, posteam, defteam, two_point_attempt, "
    "passer_player_id, rusher_player_id, receiver_player_id, "
    "pass_attempt, complete_pass, passing_yards, pass_touchdown, interception, sack, "
    "rush_attempt, rushing_yards, rush_touchdown, receiving_yards, "
    "sack_player_id, half_sack_1_player_id, half_sack_2_player_id, "
    "interception_player_id, "
    "solo_tackle_1_player_id, solo_tackle_1_team, "
    "solo_tackle_2_player_id, solo_tackle_2_team, "
    "assist_tackle_1_player_id, assist_tackle_1_team, "
    "assist_tackle_2_player_id, assist_tackle_2_team, "
    "assist_tackle_3_player_id, assist_tackle_3_team, "
    "assist_tackle_4_player_id, assist_tackle_4_team"
)

#: SPEC §8.4 — the v1 player population is exactly this many players.
POPULATION_N = 251

#: The constant that travels with every tackle figure (see the module docstring).
TACKLES_BASIS = "pbp"

_REG = "season_type = 'REG'"

#: The four blocks, and the columns that populate together. A block is written as
#: a unit or left null; a partially-filled block would make "no receiving" and
#: "no receiving yards" indistinguishable.
BLOCKS = {
    "passing": ["pass_attempts", "pass_completions", "pass_yards", "pass_td", "pass_int"],
    "rushing": ["rush_attempts", "rush_yards", "rush_td"],
    "receiving": ["rec_targets", "receptions", "rec_yards", "rec_td"],
    "defense": ["def_sacks", "def_interceptions", "def_tackles"],
}

COUNT_COLS = [c for blk, cols in BLOCKS.items() for c in cols if c != "def_sacks"]

#: League-wide attribution floors, measured over all 27 REG seasons and pinned
#: with margin. These are the "dropped play" rates: an event the source records
#: but attributes to nobody, which no join can recover. They are recorded in the
#: manifest every run so the CI structural test can score them without a network
#: call. Falling through a floor means the source changed shape — a finding.
MIN_SACK_ATTRIBUTION = 0.95
MIN_INT_ATTRIBUTION = 0.99
MIN_SCRIMMAGE_ATTRIBUTION = 0.97


# --------------------------------------------------------------------------- #
# 1. population + the otc -> gsis bridge
# --------------------------------------------------------------------------- #
def population(*, download: bool = False, verbose: bool = True) -> tuple[pd.DataFrame, dict]:
    """The 251 audited players, bridged `otc_id` -> `gsis_id`. 251/251 or raise."""
    img = io_utils.read_csv(config.MARTS / "player_images.csv")
    pop = pd.DataFrame({"player_id": img["player_id"].astype("int64")})
    if len(pop) != POPULATION_N or pop["player_id"].duplicated().any():
        raise AssertionError(
            f"player_images must carry exactly {POPULATION_N} distinct player_ids "
            f"(SPEC §8.4); got {len(pop)} rows, "
            f"{pop['player_id'].nunique()} distinct")

    # Step 1 — the resolved pairs player_season_cap already carries.
    psc = io_utils.read_csv(config.MARTS / "player_season_cap.csv")
    pairs = (psc.loc[psc["gsis_id"].notna(), ["otc_id", "gsis_id", "player"]]
                .drop_duplicates(["otc_id", "gsis_id"]))
    pairs["otc_id"] = pairs["otc_id"].astype("int64")
    multi = pairs.groupby("otc_id")["gsis_id"].nunique()
    ambiguous = sorted(int(o) for o in multi[multi > 1].index if o in set(pop["player_id"]))
    if ambiguous:
        raise AssertionError(
            f"otc_id -> gsis_id is not 1:1 for {ambiguous} — the bridge must not "
            "fan a player-season out across two play-by-play identities")
    pairs = pairs.drop_duplicates("otc_id")
    out = pop.merge(pairs.rename(columns={"otc_id": "player_id"}),
                    on="player_id", how="left")

    # Step 2 — players.parquet, the mandatory crosswalk (DECISIONS 38). Only
    # scanned when step 1 left something open, so the common case pays nothing.
    n_fallback = 0
    if out["gsis_id"].isna().any():
        con = sources.duck_connect()
        xw = contracts._gsis_crosswalk(con, download=download)
        xw = xw.rename(columns={"otc_id": "player_id"})
        out = out.merge(xw[["player_id", "gsis_id_xwalk"]], on="player_id", how="left")
        filled = out["gsis_id"].isna() & out["gsis_id_xwalk"].notna()
        n_fallback = int(filled.sum())
        out["gsis_id"] = out["gsis_id"].where(~filled, out["gsis_id_xwalk"])
        # The name travels with the pair. A player resolved on this route has no
        # row on the first one, so `player` would otherwise ship null and break
        # its NOT NULL contract on the very run the fallback earns its keep.
        names = con.execute("""
            SELECT TRY_CAST(otc_id AS INTEGER) AS player_id, display_name
            FROM players WHERE otc_id IS NOT NULL AND display_name IS NOT NULL
        """).df().dropna(subset=["player_id"])
        names["player_id"] = names["player_id"].astype("int64")
        out = out.merge(names.drop_duplicates("player_id"), on="player_id", how="left")
        out["player"] = out["player"].where(out["player"].notna(), out["display_name"])
        out = out.drop(columns=["gsis_id_xwalk", "display_name"])

    unbridged = sorted(int(p) for p in out.loc[out["gsis_id"].isna(), "player_id"])
    if unbridged:
        raise AssertionError(
            f"otc -> gsis bridge resolved {len(out) - len(unbridged)}/{POPULATION_N}; "
            f"{len(unbridged)} player_id(s) have no gsis_id: {unbridged[:20]}. "
            "The production mart covers the whole audited population or it fails — "
            "a partial bridge would ship a player page whose production line is "
            "silently empty for a reason the reader cannot see.")
    if out["gsis_id"].duplicated().any():
        dup = sorted(out.loc[out["gsis_id"].duplicated(keep=False), "gsis_id"])
        raise AssertionError(f"two player_ids share a gsis_id: {dup}")
    nameless = sorted(int(p) for p in out.loc[out["player"].isna(), "player_id"])
    if nameless:
        raise AssertionError(
            f"{len(nameless)} bridged player_id(s) carry no name: {nameless[:10]}. "
            "`player` is NOT NULL in SPEC §7.13 — the player view labels the "
            "production table with it.")

    stats = {
        "population": len(out),
        "bridged": int(out["gsis_id"].notna().sum()),
        "bridged_via_player_season_cap": len(out) - n_fallback,
        "bridged_via_players_parquet_fallback": n_fallback,
    }
    if verbose:
        print(f"  bridge {stats['bridged']}/{POPULATION_N} otc_id -> gsis_id "
              f"({stats['bridged_via_player_season_cap']} from player_season_cap, "
              f"{n_fallback} from the players.parquet fallback)")
    return out.sort_values("player_id").reset_index(drop=True), stats


# --------------------------------------------------------------------------- #
# 2. per-season aggregation
# --------------------------------------------------------------------------- #
def _league_counters(con) -> dict:
    """League-wide attribution counters, taken BEFORE the population filter.

    The denominator has to be every REG play, not the 251 players' plays, or the
    rate would describe the sample rather than the source.
    """
    r = con.execute(f"""
        SELECT
          coalesce(sum(sack), 0)                       AS sack_events,
          count(*) FILTER (WHERE sack = 1
                           AND sack_player_id IS NULL
                           AND half_sack_1_player_id IS NULL)  AS sack_unattributed,
          coalesce(sum(interception), 0)               AS int_events,
          count(*) FILTER (WHERE interception = 1
                           AND interception_player_id IS NULL) AS int_unattributed,
          count(*) FILTER (WHERE play_type IN ('pass', 'run')) AS scrimmage_plays,
          count(*) FILTER (WHERE play_type IN ('pass', 'run')
                           AND passer_player_id IS NULL
                           AND rusher_player_id IS NULL
                           AND receiver_player_id IS NULL)     AS scrimmage_unattributed,
          count(*)                                     AS reg_rows
        FROM pbp WHERE {_REG}
    """).df()
    return {k: int(v) for k, v in r.iloc[0].items()}


def _season_frames(con) -> dict[str, pd.DataFrame]:
    """One frame per block, restricted to the population, for the loaded season."""
    passing = con.execute(f"""
        SELECT passer_player_id AS gsis_id,
               sum(CASE WHEN sack = 0 THEN pass_attempt ELSE 0 END) AS pass_attempts,
               coalesce(sum(complete_pass), 0)   AS pass_completions,
               coalesce(sum(passing_yards), 0)   AS pass_yards,
               coalesce(sum(pass_touchdown), 0)  AS pass_td,
               coalesce(sum(interception), 0)    AS pass_int
        FROM pbp
        WHERE {_REG} AND two_point_attempt = 0
          AND passer_player_id IN (SELECT gsis_id FROM pop)
        GROUP BY 1
    """).df()

    rushing = con.execute(f"""
        SELECT rusher_player_id AS gsis_id,
               coalesce(sum(rush_attempt), 0)    AS rush_attempts,
               coalesce(sum(rushing_yards), 0)   AS rush_yards,
               coalesce(sum(rush_touchdown), 0)  AS rush_td
        FROM pbp
        WHERE {_REG} AND two_point_attempt = 0
          AND rusher_player_id IN (SELECT gsis_id FROM pop)
        GROUP BY 1
    """).df()

    receiving = con.execute(f"""
        SELECT receiver_player_id AS gsis_id,
               coalesce(sum(pass_attempt), 0)    AS rec_targets,
               coalesce(sum(complete_pass), 0)   AS receptions,
               coalesce(sum(receiving_yards), 0) AS rec_yards,
               coalesce(sum(pass_touchdown), 0)  AS rec_td
        FROM pbp
        WHERE {_REG} AND two_point_attempt = 0
          AND receiver_player_id IN (SELECT gsis_id FROM pop)
        GROUP BY 1
    """).df()

    # A full sack credits sack_player_id; a split sack credits half_sack_1 and
    # half_sack_2 at 0.5 each. The two forms never appear on the same row.
    defense = con.execute(f"""
        WITH sacks AS (
            SELECT sack_player_id AS gsis_id, 1.0 AS v FROM pbp
             WHERE {_REG} AND sack_player_id IS NOT NULL
            UNION ALL
            SELECT half_sack_1_player_id, 0.5 FROM pbp
             WHERE {_REG} AND half_sack_1_player_id IS NOT NULL
            UNION ALL
            SELECT half_sack_2_player_id, 0.5 FROM pbp
             WHERE {_REG} AND half_sack_2_player_id IS NOT NULL
        ),
        tackles AS (
            SELECT solo_tackle_1_player_id    AS gsis_id FROM pbp WHERE {_REG}
            UNION ALL SELECT solo_tackle_2_player_id     FROM pbp WHERE {_REG}
            UNION ALL SELECT assist_tackle_1_player_id   FROM pbp WHERE {_REG}
            UNION ALL SELECT assist_tackle_2_player_id   FROM pbp WHERE {_REG}
            UNION ALL SELECT assist_tackle_3_player_id   FROM pbp WHERE {_REG}
            UNION ALL SELECT assist_tackle_4_player_id   FROM pbp WHERE {_REG}
        ),
        s AS (SELECT gsis_id, sum(v)::DOUBLE AS def_sacks FROM sacks GROUP BY 1),
        i AS (SELECT interception_player_id AS gsis_id, count(*) AS def_interceptions
                FROM pbp WHERE {_REG} AND interception_player_id IS NOT NULL GROUP BY 1),
        t AS (SELECT gsis_id, count(*) AS def_tackles FROM tackles
               WHERE gsis_id IS NOT NULL GROUP BY 1)
        SELECT p.gsis_id,
               coalesce(s.def_sacks, 0)         AS def_sacks,
               coalesce(i.def_interceptions, 0) AS def_interceptions,
               coalesce(t.def_tackles, 0)       AS def_tackles
        FROM pop p
        LEFT JOIN s USING (gsis_id)
        LEFT JOIN i USING (gsis_id)
        LEFT JOIN t USING (gsis_id)
        WHERE s.gsis_id IS NOT NULL OR i.gsis_id IS NOT NULL OR t.gsis_id IS NOT NULL
    """).df()

    # Team per credited player, with the week of first credit so a mid-season
    # mover's codes concatenate in the order he actually played for them.
    teams = con.execute(f"""
        WITH credits AS (
            SELECT passer_player_id   AS gsis_id, posteam AS team, week FROM pbp
             WHERE {_REG} AND two_point_attempt = 0 AND passer_player_id IS NOT NULL
            UNION ALL
            SELECT rusher_player_id, posteam, week FROM pbp
             WHERE {_REG} AND two_point_attempt = 0 AND rusher_player_id IS NOT NULL
            UNION ALL
            SELECT receiver_player_id, posteam, week FROM pbp
             WHERE {_REG} AND two_point_attempt = 0 AND receiver_player_id IS NOT NULL
            UNION ALL
            SELECT sack_player_id, defteam, week FROM pbp
             WHERE {_REG} AND sack_player_id IS NOT NULL
            UNION ALL
            SELECT half_sack_1_player_id, defteam, week FROM pbp
             WHERE {_REG} AND half_sack_1_player_id IS NOT NULL
            UNION ALL
            SELECT half_sack_2_player_id, defteam, week FROM pbp
             WHERE {_REG} AND half_sack_2_player_id IS NOT NULL
            UNION ALL
            SELECT interception_player_id, defteam, week FROM pbp
             WHERE {_REG} AND interception_player_id IS NOT NULL
            -- A TACKLER IS NOT ALWAYS ON THE DEFENCE OF THE PLAY. Roughly 1,000
            -- to 1,400 tackles a season are made by a player whose team is not
            -- `defteam` — the quarterback who drags down the man who just
            -- intercepted him, the returner's blocker, punt and kick coverage.
            -- Using `defteam` here put the OPPONENT'S code on the player's
            -- season (Mahomes 2023 read `KC/BUF`). The per-tackler `*_team`
            -- columns are the correct source and are 100% populated wherever a
            -- tackler id is.
            UNION ALL
            SELECT solo_tackle_1_player_id, solo_tackle_1_team, week FROM pbp WHERE {_REG}
            UNION ALL SELECT solo_tackle_2_player_id, solo_tackle_2_team, week FROM pbp WHERE {_REG}
            UNION ALL SELECT assist_tackle_1_player_id, assist_tackle_1_team, week FROM pbp WHERE {_REG}
            UNION ALL SELECT assist_tackle_2_player_id, assist_tackle_2_team, week FROM pbp WHERE {_REG}
            UNION ALL SELECT assist_tackle_3_player_id, assist_tackle_3_team, week FROM pbp WHERE {_REG}
            UNION ALL SELECT assist_tackle_4_player_id, assist_tackle_4_team, week FROM pbp WHERE {_REG}
        )
        SELECT gsis_id, team, min(week) AS first_week, count(*) AS credits
        FROM credits
        WHERE gsis_id IN (SELECT gsis_id FROM pop)
          AND team IS NOT NULL AND team <> ''
        GROUP BY 1, 2
    """).df()

    return {"passing": passing, "rushing": rushing, "receiving": receiving,
            "defense": defense, "teams": teams}


def _str_key(df: pd.DataFrame) -> pd.DataFrame:
    """Force `gsis_id` to object dtype.

    An empty result set comes back from DuckDB with a float64 `gsis_id` — 1999
    has no population passer, for instance — and merging float64 against object
    raises. Coercing every frame's key makes the sparse early seasons behave
    exactly like the dense recent ones.
    """
    out = df.copy()
    out["gsis_id"] = out["gsis_id"].astype(object)
    return out


def _teams_string(teams: pd.DataFrame) -> pd.DataFrame:
    """`teams` for one season: current-franchise codes, first-credit order.

    A mid-season mover carries every team he was credited on, in the order he
    played for them — `'CLE/DEN'`, never one team silently chosen over another.
    Ties break on `credits` then code, so the string is byte-stable.
    """
    t = _str_key(teams)
    t["team"] = normalize_series(t["team"])
    t = t.dropna(subset=["team"])
    t = t.groupby(["gsis_id", "team"], as_index=False).agg(
        first_week=("first_week", "min"), credits=("credits", "sum"))
    t = t.sort_values(["gsis_id", "first_week", "credits", "team"],
                      ascending=[True, True, False, True], kind="stable")
    return (t.groupby("gsis_id", as_index=False)["team"]
             .agg(lambda s: "/".join(s))
             .rename(columns={"team": "teams"}))


def _assemble_season(frames: dict[str, pd.DataFrame], year: int) -> pd.DataFrame:
    """Outer-join the four blocks; a block is filled as a unit or left null."""
    frames = {k: _str_key(v) for k, v in frames.items()}
    members = {b: set(frames[b]["gsis_id"]) for b in BLOCKS}
    keys = sorted(set().union(*members.values()))
    out = pd.DataFrame({"gsis_id": pd.Series(keys, dtype=object)})
    for block in BLOCKS:
        out = out.merge(frames[block], on="gsis_id", how="left")
    # NULL means "no event of this kind"; 0 means "events, zero outcome".
    for block, cols in BLOCKS.items():
        mask = out["gsis_id"].isin(members[block])
        for c in cols:
            out.loc[mask, c] = out.loc[mask, c].fillna(0)
    out = out.merge(_teams_string(frames["teams"]), on="gsis_id", how="left")
    out.insert(0, "season", year)
    return out


# --------------------------------------------------------------------------- #
# 3. build
# --------------------------------------------------------------------------- #
def build(*, download: bool = False, verbose: bool = True) -> tuple[pd.DataFrame, dict]:
    lo, hi = config.PERF_WINDOW
    pop, bridge_stats = population(download=download, verbose=verbose)

    con = sources.duck_connect()
    # The population lives in a real table, not a registered view: `pbp` is
    # replaced 27 times and the semi-join must not depend on a pandas frame
    # staying alive across those rebuilds.
    con.register("pop_df", pop[["gsis_id"]])
    con.execute("CREATE OR REPLACE TABLE pop AS SELECT gsis_id FROM pop_df")

    parts: list[pd.DataFrame] = []
    counters: dict[str, int] = {}
    for year in range(lo, hi + 1):
        t0 = time.time()
        sources.scan_parquet_temp(
            con, config.PBP_URL.format(year=year), "pbp", NEEDED_PBP_COLS,
            download=download,
        )
        for k, v in _league_counters(con).items():
            counters[k] = counters.get(k, 0) + v
        d = _assemble_season(_season_frames(con), year)
        parts.append(d)
        if verbose:
            print(f"  pbp {year}: {len(d):>3} player-seasons of production "
                  f"({time.time() - t0:.1f}s)")

    mart = pd.concat(parts, ignore_index=True)
    mart = mart.merge(pop, on="gsis_id", how="left")
    mart["tackles_basis"] = TACKLES_BASIS

    out = mart[[
        "player_id", "gsis_id", "season", "player", "teams",
        "pass_attempts", "pass_completions", "pass_yards", "pass_td", "pass_int",
        "rush_attempts", "rush_yards", "rush_td",
        "rec_targets", "receptions", "rec_yards", "rec_td",
        "def_sacks", "def_interceptions", "def_tackles",
        "tackles_basis",
    ]].sort_values(["season", "gsis_id"], kind="stable").reset_index(drop=True)

    out = io_utils.round_cols(out, {"def_sacks": config.ROUND_SACKS})
    out = io_utils.as_int64(out, ["player_id", *COUNT_COLS])

    stats = _check(out, pop, counters, bridge_stats, lo, hi, verbose=verbose)
    return out, stats


def _rate(part: int, whole: int) -> float:
    return 1.0 if whole == 0 else round(1 - part / whole, 6)


def _check(out: pd.DataFrame, pop: pd.DataFrame, counters: dict,
           bridge_stats: dict, lo: int, hi: int, *, verbose: bool) -> dict:
    io_utils.assert_rows(out, "player_season_production")
    io_utils.assert_unique(out, ["gsis_id", "season"], "player_season_production")

    stray = sorted(set(out["gsis_id"]) - set(pop["gsis_id"]))
    if stray:
        raise AssertionError(
            f"{len(stray)} gsis_id(s) outside the {POPULATION_N}-player population: "
            f"{stray[:10]}")
    for col in ("player_id", "gsis_id", "player", "teams", "tackles_basis"):
        if out[col].isna().any():
            raise AssertionError(f"player_season_production: {col} is NOT NULL")
    if int(out["season"].min()) < lo or int(out["season"].max()) > hi:
        raise AssertionError("player_season_production escaped its window")

    empty = out[[c for cols in BLOCKS.values() for c in cols]].isna().all(axis=1)
    if empty.any():
        raise AssertionError(
            f"{int(empty.sum())} row(s) carry no production at all — a player-season "
            "with nothing credited must be ABSENT, not a row of nulls")

    rates = {
        "sack_attribution_rate": _rate(counters["sack_unattributed"],
                                       counters["sack_events"]),
        "interception_attribution_rate": _rate(counters["int_unattributed"],
                                               counters["int_events"]),
        "scrimmage_attribution_rate": _rate(counters["scrimmage_unattributed"],
                                            counters["scrimmage_plays"]),
    }
    floors = {
        "sack_attribution_rate": MIN_SACK_ATTRIBUTION,
        "interception_attribution_rate": MIN_INT_ATTRIBUTION,
        "scrimmage_attribution_rate": MIN_SCRIMMAGE_ATTRIBUTION,
    }
    for name, floor in floors.items():
        if rates[name] < floor:
            raise AssertionError(
                f"{name} {rates[name]:.4%} fell below the pinned floor {floor:.2%}. "
                "An event the source records but attributes to nobody cannot be "
                "recovered by any join — this is a finding about the source, not a "
                "threshold to lower.")

    stats = {
        "rows": len(out),
        "window": f"{lo}-{hi}",
        **bridge_stats,
        "players_with_production": int(out["gsis_id"].nunique()),
        "players_without_any_production": POPULATION_N - int(out["gsis_id"].nunique()),
        "multi_team_seasons": int(out["teams"].str.contains("/").sum()),
        "reg_rows_consumed": counters["reg_rows"],
        "tackles_basis": TACKLES_BASIS,
        "attribution": rates,
        "attribution_floors": floors,
        "dropped_events": {
            "sack_unattributed": counters["sack_unattributed"],
            "sack_events": counters["sack_events"],
            "interception_unattributed": counters["int_unattributed"],
            "interception_events": counters["int_events"],
            "scrimmage_unattributed": counters["scrimmage_unattributed"],
            "scrimmage_plays": counters["scrimmage_plays"],
        },
        "golden": _goldens(out),
    }
    if verbose:
        print(f"  {stats['rows']} player-seasons over "
              f"{stats['players_with_production']}/{POPULATION_N} players "
              f"({stats['players_without_any_production']} never recorded a credited "
              f"event); {stats['multi_team_seasons']} multi-team seasons")
        print("  attribution: " + " · ".join(
            f"{k.replace('_attribution_rate', '')} {v:.4%}" for k, v in rates.items()))
        for g in stats["golden"]:
            print(f"  golden {g['check']}: {g['got']} (expected {g['expected']}, "
                  f"delta {g['delta']:+g})")
    return stats


#: The three externally verified season lines, re-scored from the mart on every
#: build. Sacks, interceptions and yards only — NEVER tackles (see the docstring).
#: Sources are pinned in tests/test_golden.py.
GOLDENS = (
    ("Mahomes 2023 REG passing yards", "00-0033873", 2023, "pass_yards", 4183),
    ("T.J. Watt 2021 REG sacks", "00-0033886", 2021, "def_sacks", 22.5),
    ("Justin Jefferson 2022 REG receiving yards", "00-0036322", 2022, "rec_yards", 1809),
)


def _goldens(out: pd.DataFrame) -> list[dict]:
    res = []
    for label, gsis, season, col, expected in GOLDENS:
        sel = out[(out["gsis_id"] == gsis) & (out["season"] == season)]
        if len(sel) != 1:
            raise AssertionError(f"golden {label}: expected 1 row, got {len(sel)}")
        got = float(sel.iloc[0][col])
        if abs(got - expected) > 1e-9:
            raise AssertionError(
                f"golden {label}: mart={got} external={expected} "
                f"delta={got - expected:+g} — tolerance is EXACT")
        res.append({"check": label, "expected": expected, "got": got,
                    "delta": got - expected})
    return res


# --------------------------------------------------------------------------- #
# mart entry point
# --------------------------------------------------------------------------- #
def mart_player_season_production(ctx) -> pd.DataFrame:
    out, stats = build(download=ctx.download, verbose=ctx.verbose)
    ctx.stats["player_season_production"] = stats
    ctx.note_source(
        "nflverse play_by_play_{year}.parquet (30-column projection)",
        asset="pbp_production", rows=len(out),
        asset_rows=stats["reg_rows_consumed"],
        window=f"{config.PERF_WINDOW[0]}-{config.PERF_WINDOW[1]} REG",
    )
    ctx.note_source("data/marts/player_images.csv + player_season_cap.csv "
                    "(otc_id -> gsis_id bridge)", rows=POPULATION_N)
    return out
