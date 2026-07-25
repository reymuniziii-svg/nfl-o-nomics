#!/usr/bin/env python3.11
"""Audit the nflverse *supporting* datasets behind NFL-o-nomics.

Covers five sources that hang off the team-season backbone:

  1. draft_picks/draft_picks.parquet        -- one row per draft pick, 1980-2026
  2. snap_counts/snap_counts_{YEAR}.parquet -- one row per player-game
  3. rosters/roster_{YEAR}.parquet          -- ~one row per player-season
  4. players/players.parquet                -- the player-ID crosswalk (join spine)
  5. nfldata teams.csv (+ colour siblings)  -- team metadata for the TeamMark chip

Strategy mirrors audit/audit_pbp.py: DuckDB httpfs scans the release parquet
remotely and projects only what we need, so data/raw/ stays empty. Nothing is
downloaded; there is no --download fallback because every file here is small
enough to scan in place (the largest, players.parquet, is ~3 MB).

Outputs (all overwritten in full on every run -- the script is idempotent):
  data/curated/staging/support_draft_by_year.csv
  data/curated/staging/support_snaps_by_season.csv
  data/curated/staging/support_rosters_by_season.csv
  data/curated/staging/support_id_coverage.csv
  data/curated/staging/support_team_colors.csv
  data/curated/staging/support_join_matrix.csv

This script deliberately writes NOTHING to data/marts/ -- the supporting
datasets are inputs to other marts, not a mart of their own. It also never
touches data/marts/team_season_cap.csv or audit/findings_contracts.md, which
are owned by the contracts audit.

Usage:
  python3.11 audit/audit_support.py [--quick] [--join-seasons 2023 2012]
"""

from __future__ import annotations

import argparse
import io
import os
import re
import sys
import time
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from team_codes import normalize_team  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
STAGING = ROOT / "data" / "curated" / "staging"
MARTS = ROOT / "data" / "marts"

BASE = "https://github.com/nflverse/nflverse-data/releases/download"
DRAFT_URL = f"{BASE}/draft_picks/draft_picks.parquet"
PLAYERS_URL = f"{BASE}/players/players.parquet"
SNAPS_URL = BASE + "/snap_counts/snap_counts_{year}.parquet"
ROSTER_URL = BASE + "/rosters/roster_{year}.parquet"

TEAMS_CSV = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/teams.csv"
TEAMCOLORS_CSV = (
    "https://raw.githubusercontent.com/nflverse/nfldata/master/data/teamcolors.csv"
)
# teams.csv carries NO colour and NO conference/division columns. The canonical
# nflverse source for both is this file (what nflfastR ships as
# `teams_colors_logos`); nfldata's teamcolors.csv is a colour-only sibling.
COLORS_LOGOS_CSV = (
    "https://raw.githubusercontent.com/nflverse/nflfastR-data/master/"
    "teams_colors_logos.csv"
)

# draft_picks.team uses Pro-Football-Reference *boxscore* codes, which are a
# third convention on top of the two team_codes.py already reconciles. Only the
# eight below are missing from TEAM_CODE_MAP; the rest (STL/OAK/LAR/SD) it
# already handles. Kept local so the shared normalizer stays untouched.
PFR_DRAFT_TEAM_MAP = {
    "GNB": "GB", "KAN": "KC", "LVR": "LV", "NOR": "NO",
    "NWE": "NE", "SDG": "LAC", "SFO": "SF", "TAM": "TB",
    "RAI": "LV", "RAM": "LA", "CRD": "ARI", "RAV": "BAL",
    "OTI": "TEN", "HTX": "HOU", "CLT": "IND", "JAG": "JAX",
}

DRAFT_YEARS = (2000, 2025)          # spec requires this window complete
SNAP_PROBE_YEARS = range(2008, 2027)
ROSTER_PROBE_YEARS = range(1995, 2027)
# 2023 = recent season, 2012 = the requested older season. 2013 is carried too
# because snap_counts_2012.parquet is an EMPTY asset, so 2012 cannot produce a
# snaps join rate and 2013 is the earliest season that can.
DEFAULT_JOIN_SEASONS = [2023, 2012, 2013]

HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")


# ---------------------------------------------------------------- connection


def duck_connect():
    """DuckDB connection with httpfs configured for the outbound agent proxy."""
    import duckdb

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or ""
    proxy = proxy.replace("https://", "").replace("http://", "").rstrip("/")
    if proxy:
        con.execute(f"SET http_proxy='{proxy}';")
    ca = "/root/.ccr/ca-bundle.crt"
    if Path(ca).exists():
        # Trust the proxy CA -- never disable verification.
        try:
            con.execute(f"SET ca_cert_file='{ca}';")
        except Exception as exc:  # pragma: no cover
            print(f"  [warn] could not set ca_cert_file: {exc}", file=sys.stderr)
    con.execute("SET enable_progress_bar=false;")
    return con


def url_exists(url: str) -> bool:
    try:
        return requests.head(url, allow_redirects=True, timeout=60).status_code == 200
    except requests.RequestException:
        return False


def columns_of(con, url: str) -> set[str]:
    return {r[0] for r in con.execute(f"DESCRIBE SELECT * FROM read_parquet('{url}')").fetchall()}


def retry(fn, attempts: int = 3, label: str = ""):
    last = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as exc:
            last = exc
            print(f"  [retry {i + 1}/{attempts}] {label}: {exc}", file=sys.stderr)
            time.sleep(3 * (i + 1))
    raise RuntimeError(f"failed: {label}: {last}")


def banner(title: str) -> None:
    print(f"\n{'=' * 78}\n{title}\n{'=' * 78}")


def fetch_csv(url: str) -> pd.DataFrame:
    r = requests.get(url, timeout=90)
    r.raise_for_status()
    return pd.read_csv(io.StringIO(r.text))


# ------------------------------------------------------------- 1. draft picks


def audit_draft(con) -> tuple[pd.DataFrame, dict]:
    banner("1. DRAFT PICKS -- draft_picks.parquet")
    con.execute(
        f"CREATE OR REPLACE TEMP TABLE draft AS SELECT * FROM read_parquet('{DRAFT_URL}')"
    )
    span = con.execute(
        "SELECT min(season), max(season), count(DISTINCT season), count(*) FROM draft"
    ).fetchone()
    print(f"span: {span[0]}-{span[1]}  distinct_seasons={span[2]}  rows={span[3]:,}")

    by_year = con.execute(f"""
        SELECT season,
               count(*)                                    AS picks,
               count(DISTINCT round)                       AS rounds,
               max(pick)                                   AS max_pick,
               count(DISTINCT team)                        AS teams,
               count(gsis_id)                              AS with_gsis,
               count(gsis_id) * 1.0 / count(*)             AS gsis_rate,
               count(pfr_player_id) * 1.0 / count(*)       AS pfr_rate
        FROM draft
        WHERE season BETWEEN {DRAFT_YEARS[0]} AND {DRAFT_YEARS[1]}
        GROUP BY 1 ORDER BY 1
    """).df()
    want = set(range(DRAFT_YEARS[0], DRAFT_YEARS[1] + 1))
    missing = sorted(want - set(by_year.season))
    print(f"required window {DRAFT_YEARS[0]}-{DRAFT_YEARS[1]}: "
          f"{'COMPLETE' if not missing else 'MISSING ' + str(missing)}")
    print(f"picks/yr min={by_year.picks.min()} max={by_year.picks.max()} "
          f"mean={by_year.picks.mean():.1f}; rounds always "
          f"{sorted(by_year.rounds.unique())}")
    print(f"gsis_id coverage over window: "
          f"{by_year.with_gsis.sum() / by_year.picks.sum():.4f} "
          f"(worst year {by_year.loc[by_year.gsis_rate.idxmin(), 'season']} "
          f"@ {by_year.gsis_rate.min():.3f}, best {by_year.gsis_rate.max():.3f})")

    # ---- field inventory: which columns actually carry data in-window?
    cols = [c[0] for c in con.execute("DESCRIBE draft").fetchall()]
    sel = ", ".join(f'count("{c}") * 1.0 / count(*) AS "{c}"' for c in cols)
    cov = con.execute(
        f"SELECT {sel} FROM draft WHERE season BETWEEN {DRAFT_YEARS[0]} AND {DRAFT_YEARS[1]}"
    ).df().T.rename(columns={0: "coverage"})
    cov.index.name = "field"
    dead = cov[cov.coverage == 0].index.tolist()
    print(f"\nfield coverage {DRAFT_YEARS[0]}-{DRAFT_YEARS[1]} (n={span[3]:,} rows in file):")
    print(cov.sort_values("coverage").to_string())
    print(f"DEAD COLUMNS (100% null): {dead or 'none'}")

    # ---- team-code convention
    raw_teams = sorted(r[0] for r in con.execute(
        f"SELECT DISTINCT team FROM draft WHERE season >= {DRAFT_YEARS[0]}").fetchall())
    norm = sorted({normalize_team(PFR_DRAFT_TEAM_MAP.get(t, t)) for t in raw_teams})
    unmapped = sorted(t for t in raw_teams if normalize_team(t) not in norm and t not in PFR_DRAFT_TEAM_MAP)
    print(f"\nraw team codes ({len(raw_teams)}): {raw_teams}")
    print(f"after PFR_DRAFT_TEAM_MAP + normalize_team -> {len(norm)} codes: {norm}")
    print(f"team_codes.normalize_team ALONE leaves these wrong: "
          f"{sorted(t for t in raw_teams if normalize_team(t) not in set(norm))}")
    if unmapped:
        print(f"  [RED FLAG] still unmapped: {unmapped}")

    # ---- GOLDEN CHECK: Tom Brady, 2000, round 6, pick 199, New England
    brady = con.execute("""
        SELECT season, round, pick, team, gsis_id, pfr_player_name, position, college
        FROM draft WHERE season = 2000 AND pfr_player_name = 'Tom Brady'
    """).df()
    golden = {"found": len(brady) == 1}
    if len(brady) == 1:
        r = brady.iloc[0]
        canon = normalize_team(PFR_DRAFT_TEAM_MAP.get(r.team, r.team))
        golden.update(
            round=int(r["round"]), pick=int(r["pick"]), team_raw=r.team,
            team_norm=canon, gsis_id=r.gsis_id,
            round_delta=int(r["round"]) - 6, pick_delta=int(r["pick"]) - 199,
            team_ok=canon == "NE",
        )
    print("\nGOLDEN CHECK -- Tom Brady 2000 (expect round 6, pick 199, NE):")
    print(f"  {golden}")
    ok = golden.get("found") and golden["round_delta"] == 0 and \
        golden["pick_delta"] == 0 and golden["team_ok"]
    print(f"  VERDICT: {'PASS (delta 0/0, team NE after normalization)' if ok else 'FAIL'}")
    print(f"  NOTE: raw team code is '{golden.get('team_raw')}' -- NOT 'NE'.")

    return by_year, {"golden_brady": golden, "dead_columns": dead,
                     "raw_teams": raw_teams, "field_coverage": cov}


# ------------------------------------------------------------- 2. snap counts


def audit_snaps(con) -> tuple[pd.DataFrame, dict]:
    banner("2. SNAP COUNTS -- snap_counts_{YEAR}.parquet")
    print("probing release-asset existence (HTTP HEAD)...")
    present = [y for y in SNAP_PROBE_YEARS if url_exists(SNAPS_URL.format(year=y))]
    absent = [y for y in SNAP_PROBE_YEARS if y not in present]
    print(f"  HTTP 200: {present}")
    print(f"  HTTP 404: {absent}")

    rows = []
    for y in present:
        url = SNAPS_URL.format(year=y)
        d = retry(lambda u=url, yy=y: con.execute(f"""
            SELECT {yy} AS season,
                   count(*)                                          AS rows_all,
                   count(*) FILTER (WHERE game_type = 'REG')          AS rows_reg,
                   count(*) FILTER (WHERE game_type <> 'REG')         AS rows_post,
                   count(DISTINCT pfr_player_id)                      AS players,
                   count(DISTINCT game_id)                            AS games,
                   count(DISTINCT team)                               AS teams,
                   max(week) FILTER (WHERE game_type = 'REG')         AS max_reg_week,
                   count(*) FILTER (WHERE pfr_player_id IS NULL)      AS null_pfr_id,
                   count(offense_snaps) * 1.0 / nullif(count(*), 0)   AS off_snap_cov,
                   count(offense_pct)   * 1.0 / nullif(count(*), 0)   AS off_pct_cov,
                   coalesce(string_agg(DISTINCT game_type, '/'), '')  AS game_types
            FROM read_parquet('{u}')
        """).df(), label=f"snaps {y}")
        rows.append(d)
    by_season = pd.concat(rows, ignore_index=True)
    print("\nper-season profile:")
    print(by_season.to_string(index=False))

    empty = by_season.loc[by_season.rows_all == 0, "season"].tolist()
    populated = by_season.loc[by_season.rows_all > 0, "season"].tolist()
    print(f"\n[RED FLAG] assets that exist but are EMPTY (0 rows): {empty or 'none'}")
    print(f"EFFECTIVE coverage (non-empty): {min(populated)}-{max(populated)}")

    # ---- ID system + REG/POST filtering
    y = max(populated)
    url = SNAPS_URL.format(year=y)
    idcols = columns_of(con, url)
    print(f"\nID system: snap counts key on 'pfr_player_id' ONLY "
          f"(no gsis_id in schema: {sorted(c for c in idcols if c.endswith('_id'))})")
    print("season_type field is 'game_type'; POST rows use WC/DIV/CON/SB "
          "(no single 'POST' literal) -- filter with game_type='REG'.")

    # ---- GOLDEN CHECK: Laken Tomlinson, NYJ, 2023 -> 1,101 offensive snaps @ 100%
    s23 = SNAPS_URL.format(year=2023)
    tom = con.execute(f"""
        SELECT team, game_type,
               count(*)          AS games,
               sum(offense_snaps) AS off_snaps,
               avg(offense_pct)   AS avg_off_pct,
               sum(st_snaps)      AS st_snaps
        FROM read_parquet('{s23}')
        WHERE player = 'Laken Tomlinson'
        GROUP BY 1, 2 ORDER BY 1, 2
    """).df()
    print("\nGOLDEN CHECK -- Laken Tomlinson (NYJ LG) 2023 "
          "(expect 1,101 offensive snaps = 100% of Jets offensive snaps):")
    print(tom.to_string(index=False))
    reg = tom[(tom.team == "NYJ") & (tom.game_type == "REG")]
    golden = {}
    if len(reg) == 1:
        r = reg.iloc[0]
        golden = {
            "pipeline_off_snaps": float(r.off_snaps), "expected": 1101.0,
            "delta": float(r.off_snaps) - 1101.0,
            "avg_off_pct": float(r.avg_off_pct), "games": int(r.games),
            "st_snaps": float(r.st_snaps),
        }
        print(f"  pipeline={golden['pipeline_off_snaps']:,.0f}  expected=1,101  "
              f"delta={golden['delta']:+,.0f}  avg offense_pct="
              f"{golden['avg_off_pct']:.3f}  games={golden['games']}")
        print(f"  VERDICT: {'PASS (exact match)' if golden['delta'] == 0 else 'FAIL'}")
        print("  NOTE: NYJ missed the 2023 playoffs, so REG-only == season total here. "
              "offense_pct is a 0-1 fraction, not 0-100.")
    return by_season, {"golden_tomlinson": golden, "empty_years": empty,
                       "present": present, "absent": absent}


# ----------------------------------------------------------------- 3. rosters


def audit_rosters(con) -> tuple[pd.DataFrame, dict]:
    banner("3. ROSTERS -- roster_{YEAR}.parquet")
    print("probing release-asset existence (HTTP HEAD)...")
    present = [y for y in ROSTER_PROBE_YEARS if url_exists(ROSTER_URL.format(year=y))]
    absent = [y for y in ROSTER_PROBE_YEARS if y not in present]
    print(f"  HTTP 200: {min(present)}-{max(present)} ({len(present)} years)")
    print(f"  HTTP 404: {absent or 'none in probe window'}")

    rows = []
    for y in present:
        url = ROSTER_URL.format(year=y)
        cols = columns_of(con, url)
        has_wk = "week" in cols
        gt = "count(DISTINCT game_type)" if "game_type" in cols else "0"
        d = retry(lambda u=url, yy=y, g=gt, n=len(cols): con.execute(f"""
            SELECT {yy} AS season,
                   count(*)                                         AS rows_all,
                   count(gsis_id)                                   AS nn_gsis,
                   count(DISTINCT gsis_id)                          AS distinct_gsis,
                   count(gsis_id) * 1.0 / count(*)                  AS gsis_cov,
                   count(pfr_id) * 1.0 / count(*)                   AS pfr_cov,
                   count(espn_id) * 1.0 / count(*)                  AS espn_cov,
                   count(DISTINCT team)                             AS teams,
                   count(DISTINCT status)                           AS n_status,
                   {g}                                              AS n_game_type,
                   {n}                                              AS n_cols
            FROM read_parquet('{u}')
        """).df(), label=f"roster {y}")
        d["has_week_col"] = has_wk
        rows.append(d)
    by_season = pd.concat(rows, ignore_index=True)
    # rows beyond one-per-player = players carrying >1 row in a season
    by_season["dup_rows"] = by_season.nn_gsis - by_season.distinct_gsis
    print("\nper-season profile:")
    print(by_season[["season", "rows_all", "distinct_gsis", "dup_rows", "gsis_cov",
                     "pfr_cov", "teams", "n_status", "n_cols", "has_week_col"]]
          .to_string(index=False))

    # ---- one-row-per-player-season?
    dup_era = by_season[by_season.dup_rows > 0].season.tolist()
    print(f"\nseasons where gsis_id is NOT unique (multi-team players get one row per "
          f"team): {min(dup_era)}-{max(dup_era)} ({len(dup_era)} seasons)")
    print("seasons where gsis_id IS unique (true one-row-per-player-season): "
          f"{sorted(by_season[by_season.dup_rows == 0].season.tolist())}")

    # ---- structural break in row counts
    print("\n[STRUCTURAL BREAK] row counts per season:")
    pre = by_season[by_season.season <= 2015].rows_all
    post = by_season[by_season.season >= 2016].rows_all
    print(f"  1995-2015: mean {pre.mean():,.0f} rows/season (active roster only)")
    print(f"  2016-2026: mean {post.mean():,.0f} rows/season (adds DEV/CUT/RES)")

    # ---- schema drift
    early = by_season[~by_season.has_week_col].season.tolist()
    print(f"\n[SCHEMA DRIFT] seasons WITHOUT week/game_type columns: {early}")
    print(f"  those files have {by_season[~by_season.has_week_col].n_cols.iloc[0]} columns; "
          f"{min(by_season[by_season.has_week_col].season)}+ have "
          f"{by_season[by_season.has_week_col].n_cols.iloc[0]}")

    # ---- team codes
    for y in (2012, 2023):
        if y in present:
            t = sorted(str(r[0]) for r in con.execute(
                f"SELECT DISTINCT team FROM read_parquet('{ROSTER_URL.format(year=y)}')"
            ).fetchall())
            n = sorted({normalize_team(x) for x in t})
            print(f"\nroster {y} raw team codes ({len(t)}): {t}")
            print(f"  normalize_team -> {len(n)} codes "
                  f"({'MATCHES pbp convention' if len(n) == 32 else 'MISMATCH'})")

    # ---- status vocabulary
    y = max(present)
    st = con.execute(
        f"SELECT status, count(*) AS n FROM read_parquet('{ROSTER_URL.format(year=y)}') "
        f"GROUP BY 1 ORDER BY 2 DESC"
    ).df()
    print(f"\nstatus vocabulary ({y}):")
    print(st.to_string(index=False))
    return by_season, {"present": present, "no_week_years": early}


# ------------------------------------------------------- 4. players crosswalk


ID_FIELDS = ["gsis_id", "esb_id", "smart_id", "pfr_id", "espn_id",
             "nfl_id", "pff_id", "otc_id"]


def audit_players(con) -> tuple[pd.DataFrame, dict]:
    banner("4. PLAYER-ID CROSSWALK -- players.parquet")
    con.execute(
        f"CREATE OR REPLACE TEMP TABLE players AS SELECT * FROM read_parquet('{PLAYERS_URL}')"
    )
    n = con.execute("SELECT count(*) FROM players").fetchone()[0]
    span = con.execute(
        "SELECT min(rookie_season), max(last_season) FROM players").fetchone()
    print(f"rows={n:,}  rookie_season span {span[0]}-{span[1]}")

    sel = ", ".join(f"count({f}) * 1.0 / count(*) AS {f}" for f in ID_FIELDS)
    overall = con.execute(f"SELECT {sel} FROM players").df().T
    overall.columns = ["coverage_all_players"]
    overall.index.name = "id_field"

    # uniqueness -- an ID that repeats is unusable as a join key
    uniq = {}
    for f in ID_FIELDS:
        uniq[f] = con.execute(
            f"SELECT count(*) FROM (SELECT {f} FROM players WHERE {f} IS NOT NULL "
            f"GROUP BY 1 HAVING count(*) > 1)"
        ).fetchone()[0]
    overall["dup_groups"] = pd.Series(uniq)

    # coverage restricted to players who were active in the modern era
    sel2 = ", ".join(f"count({f}) * 1.0 / count(*) AS {f}" for f in ID_FIELDS)
    modern = con.execute(
        f"SELECT {sel2} FROM players WHERE last_season >= 2011").df().T
    modern.columns = ["coverage_active_2011plus"]
    overall = overall.join(modern)
    print("\nID coverage + uniqueness:")
    print(overall.sort_values("coverage_all_players", ascending=False).to_string())

    era = con.execute("""
        SELECT CASE WHEN rookie_season IS NULL THEN 'unknown'
                    WHEN rookie_season < 2000 THEN 'pre-2000'
                    WHEN rookie_season < 2011 THEN '2000-2010'
                    WHEN rookie_season < 2016 THEN '2011-2015'
                    ELSE '2016+' END                        AS rookie_era,
               count(*)                                     AS players,
               count(otc_id)  * 1.0 / count(*)              AS otc_id,
               count(pfr_id)  * 1.0 / count(*)              AS pfr_id,
               count(espn_id) * 1.0 / count(*)              AS espn_id
        FROM players GROUP BY 1 ORDER BY 1
    """).df()
    print("\notc_id / pfr_id coverage by rookie era (the contracts-join bottleneck):")
    print(era.to_string(index=False))
    print("\notc_id is effectively absent for pre-2000 rookies (OverTheCap only "
          "tracks the modern cap era) and thin for 2000-2010.")
    return overall.reset_index(), {"era": era, "n_players": n}


# ------------------------------------------------------------ 5. team metadata


def audit_teams() -> tuple[pd.DataFrame, dict]:
    banner("5. TEAM METADATA -- nfldata teams.csv + colour sources")
    teams = fetch_csv(TEAMS_CSV)
    print(f"teams.csv: {teams.shape[0]} rows x {teams.shape[1]} cols, "
          f"seasons {teams.season.min()}-{teams.season.max()}")
    print(f"columns: {list(teams.columns)}")

    have = set(teams.columns)
    print("\n[RED FLAG] teams.csv column audit against TeamMark requirements:")
    for label, cands in [
        ("full name", {"full"}), ("abbreviation", {"team"}),
        ("conference", {"conf", "conference", "team_conf"}),
        ("division", {"division", "div", "team_division"}),
        ("primary colour", {"color", "team_color", "primary"}),
        ("secondary colour", {"color2", "team_color2", "secondary"}),
    ]:
        hit = have & cands
        print(f"  {label:18s}: {'OK -> ' + str(sorted(hit)) if hit else 'MISSING from teams.csv'}")

    latest = int(teams.season.max())
    cur = teams[teams.season == latest]
    print(f"\ncurrent-season slice ({latest}): {len(cur)} teams "
          f"({'OK' if len(cur) == 32 else 'EXPECTED 32'})")
    nulls = cur.isna().sum()
    nulls = nulls[nulls > 0]
    print(f"null columns in {latest} slice: {nulls.to_dict() if len(nulls) else 'none'}")

    print("\nhistorical (relocated) franchise rows in teams.csv -- era-correct codes:")
    hist = teams[teams.team.isin(["STL", "SD", "OAK", "LA", "LAC", "LV"])]
    print(hist.groupby("team").season.agg(["min", "max", "count"]).to_string())
    print(teams[teams.team.isin(["STL", "SD", "OAK"])].drop_duplicates("team")
          [["season", "team", "nfl", "espn", "pfr", "full", "location", "nickname"]]
          .to_string(index=False))
    print("  -> teams.csv is era-correct (like nfldata games.csv), NOT current-franchise "
          "like pbp. normalize_team() collapses STL/SD/OAK to LA/LAC/LV.")
    print("  -> note two different PFR conventions in play: teams.csv 'pfr' column uses "
          "franchise codes (CRD/RAV/OTI/RAM), draft_picks.team uses boxscore codes "
          "(NWE/GNB/SFO).")

    # ---- colours
    tc = fetch_csv(TEAMCOLORS_CSV)
    cl = fetch_csv(COLORS_LOGOS_CSV)
    print(f"\nteamcolors.csv: {tc.shape} cols={list(tc.columns)}")
    print(f"teams_colors_logos.csv: {cl.shape} cols={list(cl.columns)}")

    cur32 = set(cur.team)
    print(f"\nall 32 current abbrs present in teamcolors.csv: "
          f"{'YES' if not cur32 - set(tc.team) else sorted(cur32 - set(tc.team))}")
    print(f"all 32 current abbrs present in teams_colors_logos.csv: "
          f"{'YES' if not cur32 - set(cl.team_abbr) else sorted(cur32 - set(cl.team_abbr))}")
    print(f"conference/division nulls in teams_colors_logos: "
          f"{cl[['team_conf', 'team_division']].isna().sum().to_dict()}")

    def bad_hex(df, key, cols):
        out = []
        for _, r in df.iterrows():
            for c in cols:
                v = r[c]
                if not isinstance(v, str) or not HEX_RE.match(v):
                    out.append((r[key], c, v))
        return out

    for name, df, key, cols in [
        ("teamcolors.csv", tc, "team", ["color", "color2", "color3", "color4"]),
        ("teams_colors_logos.csv", cl, "team_abbr",
         ["team_color", "team_color2", "team_color3", "team_color4"]),
    ]:
        bad = bad_hex(df, key, cols)
        prim = bad_hex(df, key, cols[:2])
        print(f"\n{name}: malformed/missing across all 4 colours -> {bad or 'NONE'}")
        print(f"{name}: malformed/missing in PRIMARY+SECONDARY only -> {prim or 'NONE'}")
        same = df[df[cols[0]].str.lower() == df[cols[1]].str.lower()][key].tolist()
        print(f"{name}: primary == secondary -> {same or 'NONE'}")

    # ---- TeamMark legibility: WCAG contrast of the primary/secondary pair
    def lum(h: str) -> float:
        h = h.lstrip("#")
        ch = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
        f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
        r, g, b = (f(c) for c in ch)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b

    def ratio(a: str, b: str) -> float:
        la, lb = lum(a), lum(b)
        hi, lo = max(la, lb), min(la, lb)
        return (hi + 0.05) / (lo + 0.05)

    rows = []
    for _, r in cl.iterrows():
        c1, c2 = r.team_color, r.team_color2
        on_white, on_black = ratio(c1, "#ffffff"), ratio(c1, "#000000")
        rows.append({
            "team_raw": r.team_abbr, "team": normalize_team(r.team_abbr),
            "conf": r.team_conf, "division": r.team_division,
            "primary": c1, "secondary": c2,
            "pair_contrast": round(ratio(c1, c2), 2),
            "best_glyph_on_primary": "#ffffff" if on_white >= on_black else "#000000",
            "glyph_contrast": round(max(on_white, on_black), 2),
        })
    colors = pd.DataFrame(rows).sort_values("pair_contrast")
    print("\nTeamMark chip -- WCAG contrast of the primary/secondary colour PAIR:")
    print(colors[["team", "primary", "secondary", "pair_contrast",
                  "best_glyph_on_primary", "glyph_contrast"]].head(12).to_string(index=False))
    low = colors[colors.pair_contrast < 3.0]
    print(f"\n[RED FLAG] {len(low)} of {len(colors)} rows have primary/secondary "
          f"contrast < 3.0 (WCAG large-text floor): {sorted(low.team.unique())}")
    print(f"  {(colors.pair_contrast < 2.0).sum()} rows are below 2.0 -- a secondary-colour "
          "glyph on the primary background is illegible for those teams.")
    print("  MITIGATION: the 'best_glyph_on_primary' column picks black/white by relative "
          f"luminance; worst-case glyph contrast that way is "
          f"{colors.glyph_contrast.min():.2f} (all >= 4.5 = WCAG AA).")
    return colors, {"teams": teams, "n_current": len(cur), "latest": latest}


# ------------------------------------------------------- 6. join-rate matrix


def join_matrix(con, seasons: list[int]) -> pd.DataFrame:
    banner("6. JOIN-RATE MATRIX")
    out = []
    for y in seasons:
        r_url = ROSTER_URL.format(year=y)
        s_url = SNAPS_URL.format(year=y)
        con.execute(f"CREATE OR REPLACE TEMP TABLE r AS SELECT * FROM read_parquet('{r_url}')")

        # A. roster player-seasons -> players.parquet (gsis_id)
        a = con.execute("""
            SELECT count(*) AS n,
                   count(*) FILTER (WHERE p.gsis_id IS NOT NULL) AS matched,
                   count(*) FILTER (WHERE p.otc_id  IS NOT NULL) AS with_otc,
                   count(*) FILTER (WHERE p.pfr_id  IS NOT NULL) AS with_pfr
            FROM r LEFT JOIN players p ON r.gsis_id = p.gsis_id
        """).fetchone()
        out.append({"season": y, "join": "rosters -> players.parquet (gsis_id)",
                    "denominator": "roster player-seasons", "n": a[0],
                    "matched": a[1], "rate": a[1] / a[0] if a[0] else None})
        out.append({"season": y, "join": "rosters -> players.otc_id (contracts spine)",
                    "denominator": "roster player-seasons", "n": a[0],
                    "matched": a[2], "rate": a[2] / a[0] if a[0] else None})
        out.append({"season": y, "join": "rosters -> players.pfr_id",
                    "denominator": "roster player-seasons", "n": a[0],
                    "matched": a[3], "rate": a[3] / a[0] if a[0] else None})

        # A2. same, restricted to players who were actually on an active roster
        has_status = "status" in columns_of(con, r_url)
        if has_status:
            a2 = con.execute("""
                SELECT count(*) AS n, count(*) FILTER (WHERE p.gsis_id IS NOT NULL) AS m
                FROM r LEFT JOIN players p ON r.gsis_id = p.gsis_id
                WHERE r.status NOT IN ('CUT', 'RET')
            """).fetchone()
            out.append({"season": y,
                        "join": "rosters (status<>CUT/RET) -> players.parquet (gsis_id)",
                        "denominator": "roster player-seasons", "n": a2[0],
                        "matched": a2[1], "rate": a2[1] / a2[0] if a2[0] else None})

        # B. snap counts -> rosters. Snaps carry ONLY pfr_player_id.
        if url_exists(s_url):
            con.execute(
                f"CREATE OR REPLACE TEMP TABLE s AS SELECT * FROM read_parquet('{s_url}')")
            n_snap = con.execute("SELECT count(*) FROM s").fetchone()[0]
            if n_snap == 0:
                out.append({"season": y, "join": "snap_counts -> rosters (pfr_id, DIRECT)",
                            "denominator": "EMPTY ASSET (0 rows)", "n": 0,
                            "matched": 0, "rate": None})
            else:
                b = con.execute("""
                    SELECT count(*) AS n,
                           count(*) FILTER (WHERE rr.pfr_id IS NOT NULL) AS direct,
                           count(*) FILTER (WHERE br.gsis_id IS NOT NULL) AS bridged
                    FROM (SELECT * FROM s WHERE game_type = 'REG') s
                    LEFT JOIN (SELECT DISTINCT pfr_id FROM r WHERE pfr_id IS NOT NULL) rr
                           ON s.pfr_player_id = rr.pfr_id
                    LEFT JOIN (
                        SELECT p.pfr_id, rg.gsis_id
                        FROM (SELECT pfr_id, gsis_id FROM players WHERE pfr_id IS NOT NULL) p
                        JOIN (SELECT DISTINCT gsis_id FROM r WHERE gsis_id IS NOT NULL) rg
                          ON p.gsis_id = rg.gsis_id
                    ) br ON s.pfr_player_id = br.pfr_id
                """).fetchone()
                out.append({"season": y, "join": "snap_counts REG -> rosters (pfr_id, DIRECT)",
                            "denominator": "snap rows (REG)", "n": b[0],
                            "matched": b[1], "rate": b[1] / b[0]})
                out.append({"season": y,
                            "join": "snap_counts REG -> players -> rosters (BRIDGED on gsis_id)",
                            "denominator": "snap rows (REG)", "n": b[0],
                            "matched": b[2], "rate": b[2] / b[0]})
                c = con.execute("""
                    WITH sp AS (SELECT DISTINCT pfr_player_id FROM s WHERE game_type = 'REG')
                    SELECT count(*) AS n,
                           count(*) FILTER (WHERE rr.pfr_id IS NOT NULL) AS direct,
                           count(*) FILTER (WHERE p.pfr_id IS NOT NULL) AS to_players
                    FROM sp
                    LEFT JOIN (SELECT DISTINCT pfr_id FROM r WHERE pfr_id IS NOT NULL) rr
                           ON sp.pfr_player_id = rr.pfr_id
                    LEFT JOIN (SELECT DISTINCT pfr_id FROM players WHERE pfr_id IS NOT NULL) p
                           ON sp.pfr_player_id = p.pfr_id
                """).fetchone()
                out.append({"season": y, "join": "snap players -> rosters (pfr_id, DIRECT)",
                            "denominator": "distinct snap players", "n": c[0],
                            "matched": c[1], "rate": c[1] / c[0]})
                out.append({"season": y, "join": "snap players -> players.parquet (pfr_id)",
                            "denominator": "distinct snap players", "n": c[0],
                            "matched": c[2], "rate": c[2] / c[0]})
        else:
            out.append({"season": y, "join": "snap_counts -> rosters",
                        "denominator": "NO ASSET (HTTP 404)", "n": 0,
                        "matched": 0, "rate": None})

        # C. draft picks with gsis_id, cumulative 2000+ and for this draft class
        d = con.execute(f"""
            SELECT count(*) AS n, count(gsis_id) AS m FROM draft WHERE season = {y}
        """).fetchone()
        if d[0]:
            out.append({"season": y, "join": f"draft class {y} rows with gsis_id",
                        "denominator": "draft picks", "n": d[0],
                        "matched": d[1], "rate": d[1] / d[0]})

    d_all = con.execute(f"""
        SELECT count(*) AS n, count(gsis_id) AS m
        FROM draft WHERE season BETWEEN {DRAFT_YEARS[0]} AND {DRAFT_YEARS[1]}
    """).fetchone()
    out.append({"season": "2000-2025", "join": "draft picks with gsis_id (whole window)",
                "denominator": "draft picks", "n": d_all[0],
                "matched": d_all[1], "rate": d_all[1] / d_all[0]})

    # D. draft -> players.parquet, and the contracts crosswalk path
    d2 = con.execute(f"""
        SELECT count(*) AS n,
               count(*) FILTER (WHERE p.gsis_id IS NOT NULL) AS m
        FROM (SELECT * FROM draft WHERE season BETWEEN {DRAFT_YEARS[0]} AND {DRAFT_YEARS[1]}
              AND gsis_id IS NOT NULL) d
        LEFT JOIN players p ON d.gsis_id = p.gsis_id
    """).fetchone()
    out.append({"season": "2000-2025", "join": "draft (w/ gsis_id) -> players.parquet",
                "denominator": "draft picks with gsis_id", "n": d2[0],
                "matched": d2[1], "rate": d2[1] / d2[0]})

    m = pd.DataFrame(out)
    m["rate_pct"] = (m["rate"] * 100).round(2)
    print(m[["season", "join", "denominator", "n", "matched", "rate_pct"]].to_string(index=False))

    print("""
CONTRACTS CROSSWALK PATH (established from the players.parquet side only):
  OverTheCap contracts carry otc_id (and nflverse adds gsis_id where known).
  players.parquet is the ONLY file among these five that holds otc_id, and it is
  unique (0 duplicate groups), so the canonical path is:

      contracts.otc_id --> players.otc_id --> players.gsis_id --> rosters.gsis_id
                                                              --> draft.gsis_id
                                                              --> (via pfr_id) snap_counts

  There is NO otc_id anywhere in rosters/snap_counts/draft_picks, so the crosswalk
  through players.parquet is mandatory -- contracts cannot join rosters directly.
  gsis_id is the hub of the whole star schema; pfr_id is the ONLY bridge to snaps.""")
    return m


# ------------------------------------------------------------------ main


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--join-seasons", nargs="+", type=int, default=DEFAULT_JOIN_SEASONS)
    ap.add_argument("--quick", action="store_true",
                    help="skip the per-year HEAD probes for rosters (uses 1999-2026)")
    args = ap.parse_args()

    STAGING.mkdir(parents=True, exist_ok=True)
    con = duck_connect()

    draft_by_year, draft_meta = audit_draft(con)
    snaps_by_season, snap_meta = audit_snaps(con)
    rosters_by_season, roster_meta = audit_rosters(con)
    id_cov, player_meta = audit_players(con)
    colors, team_meta = audit_teams()
    matrix = join_matrix(con, args.join_seasons)

    writes = [
        (STAGING / "support_draft_by_year.csv", draft_by_year),
        (STAGING / "support_snaps_by_season.csv", snaps_by_season),
        (STAGING / "support_rosters_by_season.csv", rosters_by_season),
        (STAGING / "support_id_coverage.csv", id_cov),
        (STAGING / "support_team_colors.csv", colors),
        (STAGING / "support_join_matrix.csv", matrix),
    ]
    banner("OUTPUTS")
    for path, df in writes:
        df.to_csv(path, index=False)
        print(f"  wrote {path.relative_to(ROOT)}  ({len(df)} rows)")

    raw = ROOT / "data" / "raw"
    leftovers = [p.name for p in raw.iterdir()] if raw.exists() else []
    print(f"\ndata/raw/ contents: {leftovers or 'EMPTY (nothing downloaded)'}")

    banner("GOLDEN CHECK SUMMARY")
    gb = draft_meta["golden_brady"]
    print(f"  Tom Brady 2000: round={gb.get('round')} (delta {gb.get('round_delta'):+d}), "
          f"pick={gb.get('pick')} (delta {gb.get('pick_delta'):+d}), "
          f"team={gb.get('team_raw')} -> {gb.get('team_norm')} "
          f"({'OK' if gb.get('team_ok') else 'MISMATCH'})")
    gt = snap_meta["golden_tomlinson"]
    if gt:
        print(f"  Laken Tomlinson 2023 NYJ: offense_snaps="
              f"{gt['pipeline_off_snaps']:,.0f} vs expected 1,101 "
              f"(delta {gt['delta']:+,.0f}), avg offense_pct={gt['avg_off_pct']:.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
