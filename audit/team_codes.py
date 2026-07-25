"""Shared team-code normalization for NFL-o-nomics performance marts.

CONVENTION CHOSEN: nflverse play-by-play convention -- *current franchise code,
applied retroactively to every season*.

Why: the two upstream sources disagree systematically.

  * nflverse-data play_by_play_{YEAR}.parquet already normalizes every season to
    the franchise's present-day code. The 1999 file contains LA / LAC / LV, not
    STL / SD / OAK.
  * nflverse/nfldata games.csv uses *era-correct* codes: STL (1999-2015),
    SD (1999-2016), OAK (1999-2019), switching to LA (2016+), LAC (2017+),
    LV (2020+).

Note that NEITHER source ever emits "LAR" -- the Rams are "LA" in both. The
canonical code for the Rams in these marts is therefore **LA**.

Applying `normalize_team` to both marts makes them join 1:1 on (season, team).
The function is idempotent: it is a no-op on already-normalized pbp codes.
"""

# Legacy / alternate code -> canonical current-franchise code.
TEAM_CODE_MAP = {
    # Relocations (the three that actually differ between our two sources)
    "STL": "LA",    # St. Louis Rams      -> Los Angeles Rams (2016)
    "SD": "LAC",    # San Diego Chargers  -> Los Angeles Chargers (2017)
    "OAK": "LV",    # Oakland Raiders     -> Las Vegas Raiders (2020)
    # Defensive aliases: not observed in either source as of this audit, but
    # cheap insurance against upstream convention drift.
    "LAR": "LA",
    "SL": "LA",
    "JAC": "JAX",
    "ARZ": "ARI",
    "BLT": "BAL",
    "CLV": "CLE",
    "HST": "HOU",
    "WSH": "WAS",
    "WFT": "WAS",
}

# Franchise count expected in each era (used by the structural checks).
EXPECTED_TEAMS = {y: (31 if y <= 2001 else 32) for y in range(1999, 2027)}


def normalize_team(code):
    """Map one team code to the canonical convention. Idempotent."""
    if code is None:
        return None
    code = str(code).strip().upper()
    if not code or code in {"NA", "NAN", "NONE"}:
        return None
    return TEAM_CODE_MAP.get(code, code)


def normalize_series(series):
    """Vectorized `normalize_team` for a pandas Series."""
    out = series.astype("string").str.strip().str.upper()
    out = out.replace({"": None, "NA": None, "NAN": None, "NONE": None})
    return out.replace(TEAM_CODE_MAP)
