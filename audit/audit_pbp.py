#!/usr/bin/env python3.11
"""Audit nflverse play-by-play / EPA data and build the team-season EPA mart.

Source: https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_{YEAR}.parquet

Strategy: DuckDB httpfs scans the release parquet remotely and projects only the
six columns we need, so we never materialize a ~20 MB file per season on disk.
data/raw/ stays empty. A --download fallback exists for environments where
httpfs cannot reach GitHub's signed release-asset redirects; it processes one
season at a time and deletes the file immediately after aggregating.

Outputs (both overwritten in full on every run -- the script is idempotent):
  data/marts/team_season_epa.csv
  data/curated/staging/pbp_season_stats.csv

Usage:
  python3.11 audit/audit_pbp.py [--start 1999] [--end 2025] [--download]
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from team_codes import EXPECTED_TEAMS, normalize_series  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MARTS = ROOT / "data" / "marts"
STAGING = ROOT / "data" / "curated" / "staging"
RAW = ROOT / "data" / "raw"

PBP_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/pbp/"
    "play_by_play_{year}.parquet"
)

# nflverse encodes rushes as play_type='run' (there is no 'rush' literal); the
# separate `rush`/`pass` numeric flag columns are a different, wider definition.
SCRIMMAGE_TYPES = ("pass", "run")

NEEDED_COLS = ["season", "season_type", "posteam", "defteam", "play_type", "epa"]

# League-mean offensive EPA/play sanity band (spec: roughly -0.15..+0.15).
EPA_BAND = (-0.15, 0.15)


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


def year_exists(year: int) -> bool:
    url = PBP_URL.format(year=year)
    try:
        r = requests.head(url, allow_redirects=True, timeout=60)
        return r.status_code == 200
    except requests.RequestException:
        return False


# ------------------------------------------------------------ season loading


def load_season_remote(con, year: int):
    """Project the needed columns straight off the remote parquet into a temp table."""
    url = PBP_URL.format(year=year)
    cols = ", ".join(NEEDED_COLS)
    con.execute(
        f"CREATE OR REPLACE TEMP TABLE pbp AS "
        f"SELECT {cols} FROM read_parquet('{url}')"
    )


def load_season_download(con, year: int):
    """Fallback: fetch one season to data/raw/, load, then DELETE it."""
    RAW.mkdir(parents=True, exist_ok=True)
    path = RAW / f"play_by_play_{year}.parquet"
    url = PBP_URL.format(year=year)
    try:
        with requests.get(url, stream=True, timeout=600) as r:
            r.raise_for_status()
            with open(path, "wb") as fh:
                for chunk in r.iter_content(chunk_size=1 << 20):
                    fh.write(chunk)
        cols = ", ".join(NEEDED_COLS)
        con.execute(
            f"CREATE OR REPLACE TEMP TABLE pbp AS "
            f"SELECT {cols} FROM read_parquet('{path.as_posix()}')"
        )
    finally:
        # Fixed disk allowance: the raw file never survives the season it feeds.
        if path.exists():
            path.unlink()


def load_season(con, year: int, download: bool, attempts: int = 3):
    last = None
    for i in range(attempts):
        try:
            if download:
                load_season_download(con, year)
            else:
                load_season_remote(con, year)
            return
        except Exception as exc:
            last = exc
            print(f"  [retry {i + 1}/{attempts}] {year}: {exc}", file=sys.stderr)
            time.sleep(3 * (i + 1))
    raise RuntimeError(f"failed to load season {year}: {last}")


# ---------------------------------------------------------------- aggregation

_SCRIM = "play_type IN ('pass','run')"
# Empty-string posteam/defteam appear in some older seasons; treat as missing.
_HASPOS = "posteam IS NOT NULL AND posteam <> ''"
_HASDEF = "defteam IS NOT NULL AND defteam <> ''"


def season_stats(con, year: int) -> dict:
    row = con.execute(f"""
        SELECT
          count(*)                                                        AS total_rows,
          count(*) FILTER (WHERE epa IS NOT NULL)                         AS epa_notnull_rows,
          count(*) FILTER (WHERE {_SCRIM})                                AS pass_rush_plays,
          count(*) FILTER (WHERE {_SCRIM} AND epa IS NULL)                AS pass_rush_epa_null,
          count(*) FILTER (WHERE season_type='REG')                       AS reg_rows,
          count(*) FILTER (WHERE season_type='REG' AND {_SCRIM})          AS reg_pass_rush_plays,
          count(*) FILTER (WHERE season_type='REG' AND {_SCRIM}
                           AND epa IS NULL)                               AS reg_pass_rush_epa_null,
          count(*) FILTER (WHERE {_SCRIM} AND NOT ({_HASPOS}))            AS scrim_missing_posteam,
          count(*) FILTER (WHERE {_SCRIM} AND NOT ({_HASDEF}))            AS scrim_missing_defteam,
          count(DISTINCT season)                                          AS distinct_seasons,
          min(season) AS min_season, max(season) AS max_season
        FROM pbp
    """).fetchone()
    keys = [
        "total_rows", "epa_notnull_rows", "pass_rush_plays", "pass_rush_epa_null",
        "reg_rows", "reg_pass_rush_plays", "reg_pass_rush_epa_null",
        "scrim_missing_posteam", "scrim_missing_defteam",
        "distinct_seasons", "min_season", "max_season",
    ]
    d = dict(zip(keys, row))
    d["season"] = year
    d["epa_null_rate_all"] = (
        1 - d["epa_notnull_rows"] / d["total_rows"] if d["total_rows"] else float("nan")
    )
    d["epa_null_rate_pass_rush"] = (
        d["pass_rush_epa_null"] / d["pass_rush_plays"] if d["pass_rush_plays"] else float("nan")
    )
    d["reg_epa_null_rate_pass_rush"] = (
        d["reg_pass_rush_epa_null"] / d["reg_pass_rush_plays"]
        if d["reg_pass_rush_plays"] else float("nan")
    )
    return d


def team_season(con, year: int) -> pd.DataFrame:
    """REG-only offensive/defensive EPA aggregates for one season."""
    off = con.execute(f"""
        SELECT posteam AS team,
               count(*)  AS off_plays,
               sum(epa)  AS off_epa_total
        FROM pbp
        WHERE season_type='REG' AND {_SCRIM} AND epa IS NOT NULL AND {_HASPOS}
        GROUP BY 1
    """).df()
    dfn = con.execute(f"""
        SELECT defteam AS team,
               count(*)  AS def_plays,
               sum(epa)  AS def_epa_total
        FROM pbp
        WHERE season_type='REG' AND {_SCRIM} AND epa IS NOT NULL AND {_HASDEF}
        GROUP BY 1
    """).df()

    off["team"] = normalize_series(off["team"])
    dfn["team"] = normalize_series(dfn["team"])
    off = off.dropna(subset=["team"]).groupby("team", as_index=False).sum()
    dfn = dfn.dropna(subset=["team"]).groupby("team", as_index=False).sum()

    m = off.merge(dfn, on="team", how="outer")
    m.insert(0, "season", year)
    m["off_epa_per_play"] = m["off_epa_total"] / m["off_plays"]
    m["def_epa_per_play"] = m["def_epa_total"] / m["def_plays"]
    m["epa_margin_per_play"] = m["off_epa_per_play"] - m["def_epa_per_play"]
    return m


# --------------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, default=1999)
    ap.add_argument("--end", type=int, default=2025)
    ap.add_argument("--download", action="store_true",
                    help="Fallback: download one season at a time, delete after use.")
    args = ap.parse_args()

    MARTS.mkdir(parents=True, exist_ok=True)
    STAGING.mkdir(parents=True, exist_ok=True)

    years = list(range(args.start, args.end + 1))
    print(f"== probing availability {years[0]}-{years[-1]} ==")
    available, missing = [], []
    for y in years:
        (available if year_exists(y) else missing).append(y)
    print(f"  available: {len(available)}  missing: {missing or 'none'}")

    con = duck_connect()
    stats_rows, mart_parts, code_rows = [], [], []

    for y in available:
        t0 = time.time()
        load_season(con, y, args.download)
        st = season_stats(con, y)
        ts = team_season(con, y)

        teams = sorted(ts["team"].dropna().unique())
        st["teams"] = len(teams)
        st["expected_teams"] = EXPECTED_TEAMS.get(y)
        st["team_count_ok"] = st["teams"] == st["expected_teams"]
        st["league_mean_off_epa_per_play"] = (
            ts["off_epa_total"].sum() / ts["off_plays"].sum()
        )
        st["epa_band_ok"] = EPA_BAND[0] <= st["league_mean_off_epa_per_play"] <= EPA_BAND[1]
        st["elapsed_s"] = round(time.time() - t0, 1)

        stats_rows.append(st)
        mart_parts.append(ts)
        code_rows.append({"season": y, "n_teams": len(teams), "teams": ",".join(teams)})

        flag = "" if (st["team_count_ok"] and st["epa_band_ok"]) else "  <-- FLAG"
        print(
            f"  {y}: rows={st['total_rows']:>6}  pass/run={st['pass_rush_plays']:>6}  "
            f"epa_null_pr={st['epa_null_rate_pass_rush']:.4%}  teams={st['teams']}  "
            f"lg_off_epa/play={st['league_mean_off_epa_per_play']:+.4f}  "
            f"({st['elapsed_s']}s){flag}"
        )

    mart = pd.concat(mart_parts, ignore_index=True)
    mart = mart[[
        "season", "team", "off_plays", "def_plays",
        "off_epa_per_play", "def_epa_per_play", "epa_margin_per_play",
        "off_epa_total", "def_epa_total",
    ]].sort_values(["season", "team"]).reset_index(drop=True)

    for c in ("off_epa_per_play", "def_epa_per_play", "epa_margin_per_play"):
        mart[c] = mart[c].round(6)
    for c in ("off_epa_total", "def_epa_total"):
        mart[c] = mart[c].round(4)

    out = MARTS / "team_season_epa.csv"
    mart.to_csv(out, index=False)
    print(f"\nwrote {out}  ({len(mart)} team-seasons)")

    stats = pd.DataFrame(stats_rows)
    stats["missing_years"] = ",".join(str(m) for m in missing)
    stats.to_csv(STAGING / "pbp_season_stats.csv", index=False)
    pd.DataFrame(code_rows).to_csv(STAGING / "pbp_team_codes.csv", index=False)
    print(f"wrote {STAGING / 'pbp_season_stats.csv'}")

    # ------------------------------------------------------------- checks
    print("\n== consistency checks ==")
    bad_band = stats.loc[~stats["epa_band_ok"], ["season", "league_mean_off_epa_per_play"]]
    print(f"  EPA present all seasons        : "
          f"{'PASS' if (stats['pass_rush_plays'] > 0).all() and (stats['epa_notnull_rows'] > 0).all() else 'FAIL'}")
    print(f"  league off EPA/play in band    : "
          f"{'PASS' if bad_band.empty else 'FAIL -> ' + bad_band.to_dict('records').__str__()}")
    bad_teams = stats.loc[~stats["team_count_ok"], ["season", "teams", "expected_teams"]]
    print(f"  era-correct team counts        : "
          f"{'PASS' if bad_teams.empty else 'FAIL -> ' + bad_teams.to_dict('records').__str__()}")
    worst = stats.loc[stats["epa_null_rate_pass_rush"].idxmax()]
    print(f"  max pass/run EPA null rate     : {worst['epa_null_rate_pass_rush']:.4%} "
          f"(season {int(worst['season'])})")
    drift = stats["league_mean_off_epa_per_play"]
    print(f"  league off EPA/play range      : {drift.min():+.4f} .. {drift.max():+.4f}")
    miss_pos = int(stats["scrim_missing_posteam"].sum())
    miss_def = int(stats["scrim_missing_defteam"].sum())
    print(f"  pass/run rows w/o posteam      : {miss_pos}")
    print(f"  pass/run rows w/o defteam      : {miss_def}")

    leftover = [p.name for p in RAW.glob("*") if p.is_file()]
    print(f"  data/raw/ left empty           : {'PASS' if not leftover else 'FAIL -> ' + str(leftover)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
