#!/usr/bin/env python3.11
"""Audit the nflverse/OTC historical contracts dataset and build the team-season cap mart.

Source: https://github.com/nflverse/nflverse-data/releases/download/contracts/
        historical_contracts.parquet   (~6.7 MB, OTC-derived, redistributed by nflverse)

Strategy: DuckDB httpfs scans the release parquet remotely ONCE into an in-memory
table; every subsequent question is answered against that table. data/raw/ stays
empty. A --download fallback exists for environments where httpfs cannot reach
GitHub's signed release-asset redirects; it deletes the file immediately after load.

THE CENTRAL STRUCTURAL FACT (see findings_contracts.md Q1):
  The nested `cols` column is NOT contract-specific. It is the player's *entire
  career cap table*, replicated byte-identically onto every contract row that
  player has. Summing `cols` across contract rows multiplies a player's cap hit
  by his number of contracts. Player-seasons MUST be deduplicated on
  (otc_id, year) before any aggregation.

Outputs (all overwritten in full on every run -- the script is idempotent):
  data/marts/team_season_cap.csv
  data/curated/staging/contracts_schema.csv
  data/curated/staging/contracts_season_coverage.csv
  data/curated/staging/contracts_golden_checks.csv
  data/curated/staging/contracts_position_alloc.csv
  data/curated/staging/contracts_deadmoney_probe.csv

Usage:
  python3.11 audit/audit_contracts.py [--start 1994] [--end 2025] [--download]
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from team_codes import normalize_team  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MARTS = ROOT / "data" / "marts"
CURATED = ROOT / "data" / "curated"
STAGING = CURATED / "staging"
RAW = ROOT / "data" / "raw"

CONTRACTS_URL = (
    "https://github.com/nflverse/nflverse-data/releases/download/contracts/"
    "historical_contracts.parquet"
)

# Tier 2 window. 2013 is the first season whose player-season coverage is a
# roster rather than a sample of notable deals (see season_coverage()).
TIER2_START = 2013
TIER2_END = 2025

# Plausibility band for team cap total / league cap, per the audit spec.
BAND = (0.85, 1.15)

# --------------------------------------------------------------------------
# OTC's nested `cols.team` uses franchise NICKNAMES, not the abbreviations used
# everywhere else in this project. This map is local to the contracts audit:
# team_codes.py is left untouched (its existing entries are the pbp/games
# convention). Output is fed through normalize_team() so the mart joins 1:1 on
# (season, team) with team_season_results.csv / team_season_epa.csv.
#
# NOTE the era aliases OTC introduces that team_codes.py does not know about:
#   "Oilers"    -> TEN  (Houston Oilers, pre-1997; same franchise as the Titans)
#   "Redskins"  -> WAS  (pre-2020)
#   "Washington"-> WAS  (2020-2021 "Washington Football Team")
#   "Commanders"-> WAS  (2022+)
# OTC's *top-level* `team` column additionally emits "LAR" for the Rams and
# slash-joined multi-team strings ("SEA/DEN"); team_codes.py already maps
# LAR -> LA, and the nested nickname is what the mart actually uses.
NICKNAME_TO_CODE = {
    "49ers": "SF", "Bears": "CHI", "Bengals": "CIN", "Bills": "BUF",
    "Broncos": "DEN", "Browns": "CLE", "Buccaneers": "TB", "Cardinals": "ARI",
    "Chargers": "LAC", "Chiefs": "KC", "Colts": "IND", "Commanders": "WAS",
    "Cowboys": "DAL", "Dolphins": "MIA", "Eagles": "PHI", "Falcons": "ATL",
    "Giants": "NYG", "Jaguars": "JAX", "Jets": "NYJ", "Lions": "DET",
    "Oilers": "TEN", "Packers": "GB", "Panthers": "CAR", "Patriots": "NE",
    "Raiders": "LV", "Rams": "LA", "Ravens": "BAL", "Redskins": "WAS",
    "Saints": "NO", "Seahawks": "SEA", "Steelers": "PIT", "Texans": "HOU",
    "Titans": "TEN", "Vikings": "MIN", "Washington": "WAS",
}

POSITION_GROUP = {
    "QB": "QB",
    "RB": "RB", "FB": "RB",
    "WR": "WR",
    "TE": "TE",
    "LT": "OL", "LG": "OL", "C": "OL", "RG": "OL", "RT": "OL",
    "IDL": "DL", "ED": "DL",
    "LB": "LB",
    "CB": "DB", "S": "DB",
    "K": "ST", "P": "ST", "LS": "ST",
}

# Golden checks: (label, expected_usd, note). None expected == "expect absent".
GOLDEN_MAHOMES_2023 = 37_133_824      # press-settled final 2023 figure
GOLDEN_MAHOMES_SNAPSHOTS = {
    "scheduled (pre-March)": 49_293_000,
    "March 2023 restructure": 39_700_000,
    "September 2023 rework": 37_133_824,
}
GOLDEN_WILSON_SEA_2013 = 681_085
GOLDEN_WILSON_DEN_DEAD = {2024: 53_000_000, 2025: 32_000_000}


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


def load_contracts(con, download: bool, attempts: int = 3) -> None:
    """Materialize the contracts parquet into table `c` (one row per contract)."""
    last = None
    for i in range(attempts):
        try:
            if download:
                RAW.mkdir(parents=True, exist_ok=True)
                path = RAW / "historical_contracts.parquet"
                try:
                    import requests

                    with requests.get(CONTRACTS_URL, stream=True, timeout=600) as r:
                        r.raise_for_status()
                        with open(path, "wb") as fh:
                            for chunk in r.iter_content(chunk_size=1 << 20):
                                fh.write(chunk)
                    src = f"'{path.as_posix()}'"
                    con.execute(f"CREATE OR REPLACE TABLE c AS SELECT * FROM read_parquet({src})")
                finally:
                    # Fixed disk allowance: the raw file never outlives the load.
                    if path.exists():
                        path.unlink()
            else:
                con.execute(
                    f"CREATE OR REPLACE TABLE c AS "
                    f"SELECT * FROM read_parquet('{CONTRACTS_URL}')"
                )
            return
        except Exception as exc:
            last = exc
            print(f"  [retry {i + 1}/{attempts}] {exc}", file=sys.stderr)
            time.sleep(3 * (i + 1))
    raise RuntimeError(f"failed to load contracts parquet: {last}")


# --------------------------------------------------------------- Q1: schema


def schema_report(con) -> pd.DataFrame:
    top = con.execute("DESCRIBE SELECT * FROM c").df()
    nested = con.execute(
        "SELECT unnest(cols) AS u FROM c WHERE cols IS NOT NULL LIMIT 1"
    )
    nested_cols = con.execute(
        "DESCRIBE SELECT u.* FROM (SELECT unnest(cols) AS u FROM c "
        "WHERE cols IS NOT NULL LIMIT 1)"
    ).df()
    del nested

    rows = []
    n = con.execute("SELECT count(*) FROM c").fetchone()[0]
    for r in top.itertuples():
        if r.column_name == "cols":
            nonnull = con.execute(
                "SELECT count(*) FROM c WHERE cols IS NOT NULL"
            ).fetchone()[0]
        else:
            nonnull = con.execute(
                f'SELECT count("{r.column_name}") FROM c'
            ).fetchone()[0]
        rows.append({
            "level": "top",
            "column": r.column_name,
            "dtype": r.column_type if r.column_name != "cols" else "LIST(STRUCT(...))",
            "n_rows": n,
            "n_nonnull": nonnull,
            "pct_nonnull": round(nonnull / n, 4),
        })

    # Nested coverage is measured on the deduped player-season table `ps`, where
    # `cols.year` / `cols.team` were renamed to season / nickname on unnest.
    rename = {"year": "season", "team": "nickname"}
    nps = con.execute("SELECT count(*) FROM ps").fetchone()[0]
    for r in nested_cols.itertuples():
        col = rename.get(r.column_name, r.column_name)
        nonnull = con.execute(f'SELECT count("{col}") FROM ps').fetchone()[0]
        rows.append({
            "level": "nested(cols)",
            "column": r.column_name,
            "dtype": r.column_type,
            "n_rows": nps,
            "n_nonnull": nonnull,
            "pct_nonnull": round(nonnull / nps, 4) if nps else None,
        })
    return pd.DataFrame(rows)


def build_player_seasons(con) -> None:
    """Unnest `cols` -> `psu`, then dedupe to one row per (otc_id, season) -> `ps`.

    Dedup is mandatory: `cols` is a player-level career table replicated onto
    every contract row. `rid` is a stable per-contract row id.
    """
    con.execute("CREATE OR REPLACE TABLE cr AS SELECT row_number() OVER () AS rid, * FROM c")
    con.execute("""
        CREATE OR REPLACE TABLE psu AS
        SELECT cr.rid, cr.player, cr.position, cr.team AS contract_team, cr.is_active,
               cr.year_signed, cr.years, cr.value, cr.apy, cr.otc_id, cr.gsis_id,
               u.year AS yr_raw, u.team AS nickname,
               u.base_salary, u.prorated_bonus, u.roster_bonus, u.guaranteed_salary,
               u.cap_number, u.cap_percent, u.cash_paid, u.workout_bonus,
               u.other_bonus, u.per_game_roster_bonus, u.option_bonus
        FROM cr, UNNEST(cr.cols) AS t(u)
    """)
    # Drop the per-contract 'Total' footer row and non-year junk ('0', '201').
    con.execute("""
        CREATE OR REPLACE TABLE ps AS
        SELECT DISTINCT ON (otc_id, yr_raw)
               otc_id, gsis_id, player, TRY_CAST(yr_raw AS INTEGER) AS season,
               nickname, base_salary, prorated_bonus, roster_bonus, guaranteed_salary,
               cap_number, cap_percent, cash_paid, workout_bonus, other_bonus,
               per_game_roster_bonus, option_bonus
        FROM psu
        WHERE nickname <> 'Total' AND yr_raw <> 'Total'
          AND TRY_CAST(yr_raw AS INTEGER) BETWEEN 1980 AND 2050
        ORDER BY otc_id, yr_raw, rid
    """)


def cols_is_player_level(con) -> dict:
    """Evidence that `cols` is player-level, not contract-level."""
    row = con.execute("""
        SELECT count(*) AS players_multi_contract,
               count(*) FILTER (WHERE k = 1) AS identical_cols_payload
        FROM (SELECT otc_id, count(DISTINCT CAST(cols AS VARCHAR)) AS k
              FROM c WHERE cols IS NOT NULL
              GROUP BY 1 HAVING count(*) > 1)
    """).fetchone()
    dup = con.execute("""
        SELECT count(*) FROM (
          SELECT otc_id, yr_raw FROM psu WHERE nickname <> 'Total'
          GROUP BY 1, 2 HAVING count(DISTINCT nickname) > 1
                            OR count(DISTINCT cap_number) > 1)
    """).fetchone()[0]
    return {
        "players_with_multiple_contracts": row[0],
        "of_which_identical_cols_payload": row[1],
        "player_years_with_conflicting_team_or_cap": dup,
        "raw_unnested_rows": con.execute("SELECT count(*) FROM psu").fetchone()[0],
        "deduped_player_season_rows": con.execute("SELECT count(*) FROM ps").fetchone()[0],
    }


# --------------------------------------- Q2/Q4: coverage + trustworthiness


def league_cap_map() -> dict:
    cap = pd.read_csv(CURATED / "league_cap.csv")
    return {int(r.year): (None if pd.isna(r.cap_usd) else float(r.cap_usd))
            for r in cap.itertuples()}


def player_seasons_df(con) -> pd.DataFrame:
    df = con.execute("""
        SELECT otc_id, gsis_id, player, season, nickname,
               cap_number, cap_percent, cash_paid, base_salary, prorated_bonus
        FROM ps WHERE season IS NOT NULL
    """).df()
    df["team"] = df["nickname"].map(NICKNAME_TO_CODE).map(normalize_team)
    # Source is in $ MILLIONS; the rest of this project works in USD.
    for c in ("cap_number", "cash_paid", "base_salary", "prorated_bonus"):
        df[c + "_usd"] = df[c] * 1e6
    return df


def team_season_frame(df: pd.DataFrame, capmap: dict) -> pd.DataFrame:
    ts = (df.dropna(subset=["team"])
            .groupby(["season", "team"], as_index=False)
            .agg(n_players=("cap_number_usd", "size"),
                 n_cap=("cap_number_usd", "count"),
                 n_cash=("cash_paid_usd", "count"),
                 cap_used_total=("cap_number_usd", "sum"),
                 cash_spent_total=("cash_paid_usd", "sum")))
    ts["league_cap"] = ts["season"].map(capmap)
    ts["cap_pct_of_league"] = ts["cap_used_total"] / ts["league_cap"]
    ts["cash_pct_of_league"] = ts["cash_spent_total"] / ts["league_cap"]
    return ts


def implied_adjusted_cap(df: pd.DataFrame) -> pd.DataFrame:
    """Back out each team's *adjusted* cap from OTC's own cap_percent field.

    cap_percent = cap_number / (that team's adjusted cap that year), so
    cap_number / cap_percent recovers the denominator. Restricted to
    cap_percent > 0.02 because the field is rounded to 3 decimals and small
    percentages are too coarse to invert. Median across players is used.
    """
    d = df.dropna(subset=["team", "cap_percent"]).copy()
    d = d[d["cap_percent"] > 0.02]
    d["implied"] = d["cap_number_usd"] / d["cap_percent"]
    g = (d.groupby(["season", "team"], as_index=False)
           .agg(team_adjusted_cap_implied=("implied", "median"),
                adj_cap_n_players=("implied", "size"),
                adj_cap_rel_sd=("implied", lambda s: s.std() / s.median())))
    return g


def season_coverage(ts: pd.DataFrame, df: pd.DataFrame, start: int, end: int) -> pd.DataFrame:
    rows = []
    for yr in range(start, end + 1):
        sub = ts[ts["season"] == yr]
        allp = df[df["season"] == yr]
        if sub.empty:
            rows.append({"season": yr, "player_seasons": 0, "teams": 0})
            continue
        r = sub["cap_pct_of_league"]
        cr = sub["cash_pct_of_league"]
        rows.append({
            "season": yr,
            "player_seasons": int(allp.shape[0]),
            "player_seasons_cap_notnull": int(allp["cap_number_usd"].notna().sum()),
            "player_seasons_cash_notnull": int(allp["cash_paid_usd"].notna().sum()),
            "teams": int(sub["team"].nunique()),
            "players_per_team_median": float(sub["n_players"].median()),
            "players_per_team_min": int(sub["n_players"].min()),
            "cap_ratio_median": None if r.isna().all() else float(r.median()),
            "cap_ratio_min": None if r.isna().all() else float(r.min()),
            "cap_ratio_max": None if r.isna().all() else float(r.max()),
            "cap_ratio_q25": None if r.isna().all() else float(r.quantile(0.25)),
            "cap_ratio_q75": None if r.isna().all() else float(r.quantile(0.75)),
            "teams_in_band": None if r.isna().all()
                             else int(((r >= BAND[0]) & (r <= BAND[1])).sum()),
            "cash_ratio_median": None if cr.isna().all() else float(cr.median()),
            "cash_ratio_min": None if cr.isna().all() else float(cr.min()),
            "cash_ratio_max": None if cr.isna().all() else float(cr.max()),
        })
    out = pd.DataFrame(rows)
    out["pct_teams_in_band"] = out["teams_in_band"] / out["teams"]
    return out


# ------------------------------------------------------- Q3: dead money


def deadmoney_probe(con, df: pd.DataFrame) -> pd.DataFrame:
    """Test every inference route for dead money. All are expected to fail.

    Route A: a second row for the same player-season on the team he left.
    Route B: cap charges on a team in years after the player's row moved away.
    Route C: an explicit dead-money / termination flag in the schema.
    """
    probes = []

    # Route A -- is there ever more than one team row for a player-season?
    multi = con.execute("""
        SELECT count(*) FROM (
          SELECT otc_id, yr_raw FROM psu WHERE nickname <> 'Total'
          GROUP BY 1, 2 HAVING count(DISTINCT nickname) > 1)
    """).fetchone()[0]
    probes.append({
        "route": "A: 2nd row for same player-season on the departed team",
        "result_count": multi,
        "verdict": "FAIL (no such rows exist)" if multi == 0 else "possible",
    })

    # Route B -- Denver charges for Russell Wilson in 2024/2025.
    rw = df[(df["player"] == "Russell Wilson") & (df["season"].between(2022, 2025))]
    den = rw[rw["team"] == "DEN"]["season"].tolist()
    probes.append({
        "route": "B: Wilson rows on DEN in 2024/2025",
        "result_count": int(((rw["team"] == "DEN") & (rw["season"] >= 2024)).sum()),
        "verdict": f"FAIL (Wilson DEN rows only for {den}; 2024=PIT, 2025=NYG)",
    })

    # Route C -- any schema field naming dead money / termination.
    cols = con.execute("DESCRIBE SELECT * FROM c").df()["column_name"].tolist()
    nested = con.execute(
        "DESCRIBE SELECT u.* FROM (SELECT unnest(cols) AS u FROM c "
        "WHERE cols IS NOT NULL LIMIT 1)"
    ).df()["column_name"].tolist()
    hits = [c for c in cols + nested
            if any(k in c.lower() for k in ("dead", "termin", "cut", "release", "void"))]
    probes.append({
        "route": "C: explicit dead-money / termination field in schema",
        "result_count": len(hits),
        "verdict": "FAIL (no such field)" if not hits else f"found {hits}",
    })

    # Route D -- do any 2024 rows on DEN plausibly carry Wilson's charge?
    den24 = df[(df["season"] == 2024) & (df["team"] == "DEN")]
    probes.append({
        "route": "D: any DEN 2024 row >= $40M (would be Wilson's dead charge)",
        "result_count": int((den24["cap_number_usd"] >= 40e6).sum()),
        "verdict": "FAIL (largest DEN 2024 charge is "
                   f"${den24['cap_number_usd'].max():,.0f})",
    })

    # Cross-check on 8 more high-profile separations.
    for name, yr, left, joined in [
        ("Matt Ryan", 2022, "ATL", "IND"),
        ("Carson Wentz", 2021, "PHI", "IND"),
        ("Trey Lance", 2023, "SF", "DAL"),
        ("Jimmy Garoppolo", 2023, "SF", "LV"),
        ("Baker Mayfield", 2022, "CLE", "LA"),
        ("Kirk Cousins", 2024, "MIN", "ATL"),
        ("Brock Osweiler", 2017, "HOU", "DEN"),
        ("Aaron Rodgers", 2025, "NYJ", "PIT"),
    ]:
        sub = df[(df["player"] == name) & (df["season"] == yr)]
        teams = sorted(set(sub["team"].dropna()))
        probes.append({
            "route": f"E: {name} {yr} ({left} dead money expected)",
            "result_count": int((sub["team"] == left).sum()),
            "verdict": f"FAIL (rows only on {teams or 'none'}, not {left})",
        })
    return pd.DataFrame(probes)


# ------------------------------------------------------ Q6: golden checks


def golden_checks(df: pd.DataFrame) -> pd.DataFrame:
    out = []

    def one(m):
        return None if m.empty else float(m["cap_number_usd"].iloc[0])

    mah = df[(df["player"] == "Patrick Mahomes") & (df["season"] == 2023)]
    v = one(mah)
    match = min(GOLDEN_MAHOMES_SNAPSHOTS,
                key=lambda k: abs(GOLDEN_MAHOMES_SNAPSHOTS[k] - v)) if v else None
    out.append({
        "check": "Mahomes KC 2023 cap number",
        "expected_usd": GOLDEN_MAHOMES_2023,
        "pipeline_usd": v,
        "delta_usd": None if v is None else v - GOLDEN_MAHOMES_2023,
        "team_in_data": None if mah.empty else mah["team"].iloc[0],
        "note": f"matches snapshot: {match}",
    })

    rw13 = df[(df["player"] == "Russell Wilson") & (df["season"] == 2013)]
    v = one(rw13)
    out.append({
        "check": "Russell Wilson SEA 2013 cap hit",
        "expected_usd": GOLDEN_WILSON_SEA_2013,
        "pipeline_usd": v,
        "delta_usd": None if v is None else v - GOLDEN_WILSON_SEA_2013,
        "team_in_data": None if rw13.empty else rw13["team"].iloc[0],
        "note": "exact",
    })

    for yr, exp in GOLDEN_WILSON_DEN_DEAD.items():
        sub = df[(df["player"] == "Russell Wilson") & (df["season"] == yr)]
        den = sub[sub["team"] == "DEN"]
        actual_team = None if sub.empty else sub["team"].iloc[0]
        actual_val = None if sub.empty else float(sub["cap_number_usd"].iloc[0])
        out.append({
            "check": f"Russell Wilson DEN {yr} dead money",
            "expected_usd": exp,
            "pipeline_usd": 0.0 if den.empty else float(den["cap_number_usd"].iloc[0]),
            "delta_usd": -exp if den.empty else float(den["cap_number_usd"].iloc[0]) - exp,
            "team_in_data": actual_team,
            "note": f"NOT DERIVABLE -- only row is {actual_team} "
                    f"${actual_val:,.0f}" if actual_val is not None else "absent",
        })
    return pd.DataFrame(out)


# -------------------------------------------------- Q5: positional allocation


def position_by_player_season(con) -> pd.DataFrame:
    """Position for a player-season = position on his most recent signing at or
    before that season (falling back to his earliest signing). OTC records
    position *at signing*, so this is 'position as of the deal then in force'.

    Ties (a player with two same-year contracts listing different positions,
    e.g. Mark Glowinski 'RB@2024' / 'RG@2024') are broken by the position that
    appears most often across that player's whole contract history, then
    alphabetically -- both deterministic, so the output is byte-stable.
    """
    return con.execute("""
        WITH sig AS (
          SELECT otc_id, year_signed, position, count(*) AS freq FROM c
          WHERE position IS NOT NULL AND year_signed BETWEEN 1980 AND 2050
          GROUP BY 1, 2, 3
        ),
        pfreq AS (
          SELECT otc_id, position, count(*) AS player_freq FROM c
          WHERE position IS NOT NULL GROUP BY 1, 2
        ),
        j AS (
          SELECT p.otc_id, p.season, s.position, s.year_signed,
                 row_number() OVER (
                   PARTITION BY p.otc_id, p.season
                   ORDER BY (s.year_signed <= p.season) DESC,
                            CASE WHEN s.year_signed <= p.season
                                 THEN p.season - s.year_signed
                                 ELSE s.year_signed - p.season END,
                            s.year_signed DESC,
                            f.player_freq DESC,
                            s.position
                 ) AS rn
          FROM ps p
          JOIN sig s USING (otc_id)
          JOIN pfreq f ON f.otc_id = s.otc_id AND f.position = s.position
          WHERE p.season IS NOT NULL
        )
        SELECT otc_id, season, position FROM j WHERE rn = 1
    """).df()


def position_stability(con) -> dict:
    row = con.execute("""
        SELECT count(*) AS players,
               count(*) FILTER (WHERE k > 1) AS players_multi_position
        FROM (SELECT otc_id, count(DISTINCT position) AS k FROM c GROUP BY 1)
    """).fetchone()
    return {"players": row[0], "players_with_position_drift": row[1],
            "drift_rate": round(row[1] / row[0], 4)}


def positional_allocation(df: pd.DataFrame, pos: pd.DataFrame,
                          start: int, end: int) -> pd.DataFrame:
    d = df[(df["season"].between(start, end)) & df["team"].notna()].merge(
        pos, on=["otc_id", "season"], how="left")
    d["pos_group"] = d["position"].map(POSITION_GROUP).fillna("UNK")
    g = (d.groupby(["season", "team", "pos_group"], as_index=False)
           .agg(cap_total=("cap_number_usd", "sum"), n_players=("cap_number_usd", "size")))
    tot = g.groupby(["season", "team"], as_index=False)["cap_total"].sum()
    tot = tot.rename(columns={"cap_total": "team_cap_total"})
    g = g.merge(tot, on=["season", "team"])
    g["cap_share_of_team"] = g["cap_total"] / g["team_cap_total"]
    return g.sort_values(["season", "team", "pos_group"]).reset_index(drop=True)


# --------------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, default=1994)
    ap.add_argument("--end", type=int, default=2025)
    ap.add_argument("--download", action="store_true",
                    help="Fallback: download the parquet, load it, delete it.")
    args = ap.parse_args()

    MARTS.mkdir(parents=True, exist_ok=True)
    STAGING.mkdir(parents=True, exist_ok=True)

    print("== loading contracts parquet ==")
    t0 = time.time()
    con = duck_connect()
    load_contracts(con, args.download)
    build_player_seasons(con)
    print(f"  contracts rows: {con.execute('SELECT count(*) FROM c').fetchone()[0]}  "
          f"({time.time() - t0:.1f}s)")

    # ---------------------------------------------------------- Q1 schema
    print("\n== Q1 schema ==")
    sch = schema_report(con)
    sch.to_csv(STAGING / "contracts_schema.csv", index=False)
    ids = con.execute("""
        SELECT count(*) AS contracts,
               count(otc_id) AS otc_id_nonnull,
               count(gsis_id) AS gsis_id_nonnull,
               count(DISTINCT otc_id) AS distinct_players,
               count(DISTINCT otc_id) FILTER (WHERE gsis_id IS NOT NULL)
                 AS distinct_players_with_gsis
        FROM c
    """).df().iloc[0]
    print(f"  otc_id  present on {ids.otc_id_nonnull}/{ids.contracts} "
          f"({ids.otc_id_nonnull / ids.contracts:.1%}) contracts")
    print(f"  gsis_id present on {ids.gsis_id_nonnull}/{ids.contracts} "
          f"({ids.gsis_id_nonnull / ids.contracts:.1%}) contracts, "
          f"{ids.distinct_players_with_gsis}/{ids.distinct_players} "
          f"({ids.distinct_players_with_gsis / ids.distinct_players:.1%}) players")
    ev = cols_is_player_level(con)
    print(f"  cols is PLAYER-level: {ev['of_which_identical_cols_payload']}/"
          f"{ev['players_with_multiple_contracts']} multi-contract players have a "
          f"byte-identical cols payload")
    print(f"  unnested rows {ev['raw_unnested_rows']} -> deduped player-seasons "
          f"{ev['deduped_player_season_rows']}")

    # ------------------------------------------------- Q2/Q4 coverage curve
    print("\n== Q2/Q4 player-season cap + cash coverage ==")
    capmap = league_cap_map()
    df = player_seasons_df(con)
    unmapped = sorted(set(df.loc[df["team"].isna(), "nickname"].dropna()))
    if unmapped:
        print(f"  [warn] unmapped nicknames: {unmapped}")
    ts_all = team_season_frame(df, capmap)
    cov = season_coverage(ts_all, df, args.start, args.end)
    cov.to_csv(STAGING / "contracts_season_coverage.csv", index=False)
    for r in cov.itertuples():
        med = "  n/a" if r.cap_ratio_median is None else f"{r.cap_ratio_median:.3f}"
        mn = "  n/a" if r.cap_ratio_min is None else f"{r.cap_ratio_min:.3f}"
        mx = "  n/a" if r.cap_ratio_max is None else f"{r.cap_ratio_max:.3f}"
        band = "n/a" if r.teams_in_band is None else f"{r.teams_in_band:>2}/{r.teams}"
        mark = " <-- TIER 2 BOUNDARY" if r.season == TIER2_START else ""
        print(f"  {r.season}: players={r.player_seasons:>5}  teams={r.teams:>2}  "
              f"cap/league med={med} [{mn}..{mx}]  in-band={band}{mark}")

    # ------------------------------------------------------ Q3 dead money
    print("\n== Q3 dead money ==")
    dm = deadmoney_probe(con, df)
    dm.to_csv(STAGING / "contracts_deadmoney_probe.csv", index=False)
    for r in dm.itertuples():
        print(f"  {r.route}: {r.verdict}")
    derivable = bool((dm["result_count"] > 0).any())
    print(f"  DEAD MONEY DERIVABLE: {'YES' if derivable else 'NO'}")

    # --------------------------------------------------- Q6 golden checks
    print("\n== Q6 golden checks ==")
    gc = golden_checks(df)
    gc.to_csv(STAGING / "contracts_golden_checks.csv", index=False)
    for r in gc.itertuples():
        pv = "n/a" if r.pipeline_usd is None else f"${r.pipeline_usd:,.0f}"
        dl = "n/a" if r.delta_usd is None else f"{r.delta_usd:+,.0f}"
        print(f"  {r.check}: expected ${r.expected_usd:,.0f}  got {pv}  "
              f"delta {dl}  [{r.note}]")

    # ---------------------------------------------- Q5 positional allocation
    print("\n== Q5 positional allocation ==")
    stab = position_stability(con)
    print(f"  position drift across a player's contracts: "
          f"{stab['players_with_position_drift']}/{stab['players']} "
          f"({stab['drift_rate']:.1%}) players")
    pos = position_by_player_season(con)
    alloc = positional_allocation(df, pos, TIER2_START, TIER2_END)
    alloc.to_csv(STAGING / "contracts_position_alloc.csv", index=False)
    unk = alloc[alloc["pos_group"] == "UNK"]["cap_total"].sum() / alloc["cap_total"].sum()
    print(f"  wrote {STAGING / 'contracts_position_alloc.csv'} "
          f"({len(alloc)} season-team-group rows, UNK cap share {unk:.4%})")
    qb = alloc[alloc["pos_group"] == "QB"].groupby("season")["cap_share_of_team"].median()
    print("  median team QB cap share by season: "
          + ", ".join(f"{int(y)}={v:.3f}" for y, v in qb.items()))

    # ------------------------------------------------------------ Q7 mart
    print("\n== Q7 team-season cap mart ==")
    adj = implied_adjusted_cap(df)
    mart = ts_all[ts_all["season"].between(TIER2_START, TIER2_END)].merge(
        adj, on=["season", "team"], how="left")
    mart["cap_pct_of_adjusted"] = mart["cap_used_total"] / mart["team_adjusted_cap_implied"]
    # Dead money is structurally absent from this source (Q3). The columns are
    # emitted so downstream schema is stable, but they are always null.
    mart["dead_money_total"] = pd.NA
    mart["dead_money_pct"] = pd.NA
    # The honest residual: adjusted cap not accounted for by rostered players.
    # It is dead money + unlisted minimum/practice-squad charges, NOT dead money alone.
    mart["unaccounted_vs_adjusted"] = (
        mart["team_adjusted_cap_implied"] - mart["cap_used_total"])
    mart["unaccounted_pct"] = mart["unaccounted_vs_adjusted"] / mart["team_adjusted_cap_implied"]

    mart = mart[[
        "season", "team", "n_players",
        "cap_used_total", "league_cap", "cap_pct_of_league",
        "team_adjusted_cap_implied", "cap_pct_of_adjusted",
        "dead_money_total", "dead_money_pct",
        "cash_spent_total", "cash_pct_of_league",
        "unaccounted_vs_adjusted", "unaccounted_pct",
    ]].sort_values(["season", "team"]).reset_index(drop=True)

    for c in ("cap_used_total", "cash_spent_total", "team_adjusted_cap_implied",
              "unaccounted_vs_adjusted"):
        mart[c] = mart[c].round(0)
    for c in ("cap_pct_of_league", "cash_pct_of_league", "cap_pct_of_adjusted",
              "unaccounted_pct"):
        mart[c] = mart[c].round(6)

    out = MARTS / "team_season_cap.csv"
    mart.to_csv(out, index=False)
    print(f"  wrote {out}  ({len(mart)} team-seasons, {TIER2_START}-{TIER2_END})")

    # ------------------------------------------------------------- checks
    print("\n== consistency checks ==")
    exp_rows = (TIER2_END - TIER2_START + 1) * 32
    print(f"  mart is 32 teams x {TIER2_END - TIER2_START + 1} seasons : "
          f"{'PASS' if len(mart) == exp_rows else f'FAIL ({len(mart)} vs {exp_rows})'}")
    bad = sorted(set(mart["team"]) - set(
        pd.read_csv(MARTS / "team_season_results.csv")["team"]))
    print(f"  team codes join to team_season_results  : "
          f"{'PASS' if not bad else 'FAIL -> ' + str(bad)}")
    res = pd.read_csv(MARTS / "team_season_results.csv")
    res = res[res["season"].between(TIER2_START, TIER2_END)]
    j = mart.merge(res[["season", "team"]], on=["season", "team"], how="inner")
    print(f"  1:1 join vs team_season_results rows    : "
          f"{'PASS' if len(j) == len(mart) == len(res) else f'FAIL ({len(j)}/{len(mart)}/{len(res)})'}")
    print(f"  no null cap_used_total                  : "
          f"{'PASS' if mart['cap_used_total'].notna().all() else 'FAIL'}")
    print(f"  adjusted-cap back-out stable (rel sd)   : "
          f"max {adj['adj_cap_rel_sd'].max():.4f}")
    g0 = gc[gc["check"].str.contains("Mahomes|2013")]
    print(f"  golden exact matches (Mahomes, RW 2013) : "
          f"{'PASS' if (g0['delta_usd'].abs() < 1).all() else 'FAIL'}")
    leftover = [p.name for p in RAW.glob("*") if p.is_file()] if RAW.exists() else []
    print(f"  data/raw/ left empty                    : "
          f"{'PASS' if not leftover else 'FAIL -> ' + str(leftover)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
