"""The ONE team-code normalizer for YIELD/YARD.

`DECISIONS.md` 3: *team codes are normalised to current-franchise (`LA`/`LAC`/`LV`)
in all marts; era codes are preserved in curated sources; one shared normalizer
module.* This is that module. It is **imported everywhere and copied nowhere**
(`BUILD_PLAN.md` Phase 1 item 2). `audit/team_codes.py` stays frozen as the
Phase-0 record; this file is its production successor and carries the base map
unchanged plus the two maps the audit kept local to individual scripts.

--------------------------------------------------------------------------------
FOUR CONVENTIONS EXIST AND EVERY ONE OF THEM IS LIVE
(`ARCHITECTURE.md` §4.2, `DATA_AUDIT.md` §6 trap 4)

| # | Source | Convention | What it emits | Handled by |
|---|--------|------------|---------------|------------|
| 1 | nflverse `play_by_play_{YEAR}.parquet`, `roster_{YEAR}.parquet`, `snap_counts_{YEAR}.parquet` | **retroactive current-franchise** — every season rewritten to the present-day code | `LA`, `LAC`, `LV` *even in 1999*; `STL`/`SD`/`OAK` never appear | `normalize_team` is a **no-op** here (it is idempotent) |
| 2 | nfldata `games.csv`, `teams.csv`; curated `coaching_staff.csv`, `dead_money_*` transcriptions | **era-correct** — the code the franchise actually used that year | `STL` 1999–2015, `SD` 1999–2016, `OAK` 1999–2019 | `TEAM_CODE_MAP` collapses the three relocations |
| 3 | nflverse `draft_picks.parquet` (`.team`) | **PFR boxscore** | `NWE`, `GNB`, `SFO`, `LVR`, `SDG`, `KAN`, `NOR`, `TAM` | `PFR_DRAFT_TEAM_MAP` **in front of** `normalize_team` — use `normalize_draft_team` |
| 4 | nfldata `teams.csv` (`.pfr` column) | **PFR franchise** | `CRD`, `RAV`, `OTI`, `RAM` | `PFR_DRAFT_TEAM_MAP` covers these too |

A fifth shape is not a *convention* but a vocabulary: OverTheCap's nested
`cols.team` emits franchise **nicknames** (`Oilers`, `Redskins`, `Washington`,
`Commanders`), and the curated dead-money transcriptions emit **full names and
city short forms** as each outlet printed them. `NICKNAME_TO_CODE` and
`TEAM_NAME_TO_CODE` handle those; both feed through `normalize_team` afterwards
so there is exactly one place where a code becomes canonical.

--------------------------------------------------------------------------------
CONSEQUENCES, ACCEPTED AND DOCUMENTED

* **`normalize_team` ALONE leaves 8 draft codes wrong** — `GNB`, `KAN`, `LVR`,
  `NOR`, `NWE`, `SDG`, `SFO`, `TAM`. `DECISIONS.md` 4. Draft data must go through
  `normalize_draft_team` / `normalize_draft_series`.
* **The Rams are `LA`, never `LAR`** (`DECISIONS.md` 5) — neither upstream source
  ever emits `LAR`; the alias is defensive only.
* **Franchise continuity is preserved, geography is not.** A query for `LA` in
  1999 returns the *St. Louis* Rams. The route key is franchise-continuous and
  the *rendered identity* is era-correct (`SPEC.md` §6); resolving the era name
  is a rendering concern, not a normalization one.
"""

from __future__ import annotations

# --------------------------------------------------------------------------- #
# Base map — carried unchanged from audit/team_codes.py
# --------------------------------------------------------------------------- #
TEAM_CODE_MAP = {
    # Relocations (the three that actually differ between our two sources)
    "STL": "LA",    # St. Louis Rams      -> Los Angeles Rams (2016)
    "SD": "LAC",    # San Diego Chargers  -> Los Angeles Chargers (2017)
    "OAK": "LV",    # Oakland Raiders     -> Las Vegas Raiders (2020)
    # Defensive aliases: not observed in either source as of the Phase-0 audit,
    # but cheap insurance against upstream convention drift.
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

# --------------------------------------------------------------------------- #
# Convention 3/4 — PFR boxscore + PFR franchise codes.
# Promoted verbatim from audit/audit_support.py, where it was deliberately kept
# local so the shared normalizer stayed untouched during the audit. It is shared
# now: DECISIONS 4 makes it part of the one normalizer.
# --------------------------------------------------------------------------- #
PFR_DRAFT_TEAM_MAP = {
    # PFR boxscore codes (draft_picks.team) — the 8 that normalize_team misses
    "GNB": "GB", "KAN": "KC", "LVR": "LV", "NOR": "NO",
    "NWE": "NE", "SDG": "LAC", "SFO": "SF", "TAM": "TB",
    # PFR franchise codes (teams.csv.pfr) + older boxscore spellings
    "RAI": "LV", "RAM": "LA", "CRD": "ARI", "RAV": "BAL",
    "OTI": "TEN", "HTX": "HOU", "CLT": "IND", "JAG": "JAX",
}

# --------------------------------------------------------------------------- #
# OverTheCap nested `cols.team` — franchise nicknames.
# Promoted verbatim from audit/audit_contracts.py. Note the era aliases OTC
# introduces that the code maps do not know about:
#   "Oilers" -> TEN (Houston Oilers, pre-1997; same franchise as the Titans)
#   "Redskins" / "Washington" (2020-21 WFT) / "Commanders" -> WAS
# --------------------------------------------------------------------------- #
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

# --------------------------------------------------------------------------- #
# Full names and city short forms, exactly as each press outlet printed them.
# Promoted verbatim from audit/build_deadmoney_curated.py. Era-correct entries
# ("Oakland Raiders" -> OAK, "St. Louis Rams" -> STL) resolve to the era code
# and are then collapsed by normalize_team, so the two steps stay separable.
# --------------------------------------------------------------------------- #
TEAM_NAME_TO_CODE = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LA", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
    "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Oakland Raiders": "OAK", "Philadelphia Eagles": "PHI",
    "Pittsburgh Steelers": "PIT", "San Diego Chargers": "SD", "San Francisco 49ers": "SF",
    "Seattle Seahawks": "SEA", "St. Louis Rams": "STL", "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN", "Washington Commanders": "WAS", "Washington Redskins": "WAS",
    # Nickname-only and short forms used by ESPN 2015 / USA TODAY 2017 / Forbes.
    "Cardinals": "ARI", "Falcons": "ATL", "Ravens": "BAL", "Bills": "BUF",
    "Panthers": "CAR", "Bears": "CHI", "Bengals": "CIN", "Browns": "CLE",
    "Cowboys": "DAL", "Broncos": "DEN", "Lions": "DET", "Packers": "GB",
    "Texans": "HOU", "Colts": "IND", "Jaguars": "JAX", "Chiefs": "KC",
    "Raiders": "OAK", "Chargers": "SD", "Rams": "STL", "Dolphins": "MIA",
    "Vikings": "MIN", "Patriots": "NE", "Saints": "NO", "Giants": "NYG",
    "Jets": "NYJ", "Eagles": "PHI", "Steelers": "PIT", "49ers": "SF",
    "Seahawks": "SEA", "Buccaneers": "TB", "Titans": "TEN", "Redskins": "WAS",
    "New Orleans": "NO", "Miami": "MIA", "Chicago": "CHI", "Tampa Bay": "TB",
    "Baltimore": "BAL", "San Francisco": "SF", "Kansas City": "KC", "Detroit": "DET",
    "New England": "NE", "Pittsburgh": "PIT", "Dallas": "DAL", "Philadelphia": "PHI",
    "Oakland": "OAK", "Tennessee": "TEN", "Atlanta": "ATL", "Carolina": "CAR",
    "Seattle": "SEA", "Houston": "HOU", "Arizona": "ARI", "N.Y. Giants": "NYG",
    "Buffalo": "BUF", "Washington": "WAS", "St. Louis": "STL", "San Diego": "SD",
    "Indianapolis": "IND", "Minnesota": "MIN", "Cleveland": "CLE", "NY Jets": "NYJ",
    "Jacksonville": "JAX", "Green Bay": "GB", "Denver": "DEN", "Cincinnati": "CIN",
}

# --------------------------------------------------------------------------- #
# The canonical 32. `SPEC.md` §6: `{abbr}` is always the current-franchise code.
# --------------------------------------------------------------------------- #
CURRENT_TEAMS = (
    "ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN",
    "DET", "GB", "HOU", "IND", "JAX", "KC", "LA", "LAC", "LV", "MIA",
    "MIN", "NE", "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB",
    "TEN", "WAS",
)
CURRENT_TEAM_SET = frozenset(CURRENT_TEAMS)

#: The 35 era-correct codes a curated source may legitimately carry
#: (`coaching_staff.csv` keeps exactly these). A structural test asserts each
#: mart is exactly `CURRENT_TEAMS` and each curated source is a subset of this.
ERA_TEAMS = tuple(sorted(set(CURRENT_TEAMS) | {"STL", "SD", "OAK"}))

#: Franchise count expected in each era (used by the structural checks).
#: CLE returns 1999, HOU enters 2002.
EXPECTED_TEAMS = {y: (31 if y <= 2001 else 32) for y in range(1999, 2027)}

#: Legacy route codes that 301-redirect to the canonical route (`SPEC.md` §6).
LEGACY_ROUTE_REDIRECTS = {
    "OAK": "LV", "STL": "LA", "SD": "LAC", "LAR": "LA", "SL": "LA",
    "JAC": "JAX", "ARZ": "ARI", "BLT": "BAL", "CLV": "CLE", "HST": "HOU",
    "WSH": "WAS", "WFT": "WAS",
}

_NULLISH = {"", "NA", "NAN", "NONE", "NULL"}


# --------------------------------------------------------------------------- #
# Scalar API
# --------------------------------------------------------------------------- #
def normalize_team(code):
    """Map one team code to the canonical current-franchise convention.

    Idempotent: a no-op on codes that are already canonical (convention 1).
    Returns ``None`` for null-ish input rather than raising, because upstream
    files legitimately carry empty `posteam`/`defteam` on some 1999-2001 rows.
    """
    if code is None:
        return None
    code = str(code).strip().upper()
    if code in _NULLISH:
        return None
    return TEAM_CODE_MAP.get(code, code)


def normalize_draft_team(code):
    """Convention 3/4: PFR codes. `PFR_DRAFT_TEAM_MAP` runs **in front of**
    `normalize_team` — `normalize_team` alone leaves 8 draft codes wrong
    (`DECISIONS.md` 4)."""
    if code is None:
        return None
    raw = str(code).strip().upper()
    if raw in _NULLISH:
        return None
    return normalize_team(PFR_DRAFT_TEAM_MAP.get(raw, raw))


def nickname_to_code(name):
    """OTC nested `cols.team` nicknames -> canonical code."""
    if name is None:
        return None
    return normalize_team(NICKNAME_TO_CODE.get(str(name).strip()))


def team_name_to_code(name):
    """Press-printed full names / city short forms -> canonical code.

    Raises on an unmapped name: a curated transcription that introduces a new
    spelling must be noticed, not silently dropped.
    """
    if name is None:
        return None
    key = str(name).strip()
    if key not in TEAM_NAME_TO_CODE:
        raise KeyError(f"unmapped team name: {key!r}")
    return normalize_team(TEAM_NAME_TO_CODE[key])


# --------------------------------------------------------------------------- #
# Vectorized API (pandas)
# --------------------------------------------------------------------------- #
def normalize_series(series):
    """Vectorized `normalize_team` for a pandas Series."""
    out = series.astype("string").str.strip().str.upper()
    out = out.replace({v: None for v in _NULLISH})
    return out.replace(TEAM_CODE_MAP)


def normalize_draft_series(series):
    """Vectorized `normalize_draft_team` — PFR map first, then the base map."""
    out = series.astype("string").str.strip().str.upper()
    out = out.replace({v: None for v in _NULLISH})
    return out.replace(PFR_DRAFT_TEAM_MAP).replace(TEAM_CODE_MAP)


# --------------------------------------------------------------------------- #
# Structural assertions — imported by the pipeline, not decorative
# --------------------------------------------------------------------------- #
def assert_canonical(series, label: str) -> None:
    """Every mart's team-code set must be exactly the 32 current-franchise codes."""
    got = set(series.dropna().unique())
    extra = sorted(got - CURRENT_TEAM_SET)
    if extra:
        raise AssertionError(f"{label}: non-canonical team codes {extra}")


def assert_full_32(series, label: str) -> None:
    """...and, where the mart is league-complete, all 32 must be present."""
    assert_canonical(series, label)
    missing = sorted(CURRENT_TEAM_SET - set(series.dropna().unique()))
    if missing:
        raise AssertionError(f"{label}: missing team codes {missing}")
