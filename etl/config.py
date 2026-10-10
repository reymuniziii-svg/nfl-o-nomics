"""Runtime configuration for the YIELD/YARD production ETL.

Everything a future operator might need to flip lives here, and nowhere else.
The three flags at the top are the `BUILD_PLAN.md` **GATE #3** defaults; Rey ruled
2026-07-25 to proceed on all three, and `DECISIONS.md` 63 requires each of them to
stay a **one-line reversal** for as long as licensing is open. Do not push any of
these values down into a mart module.

Every constant is read from the environment first so a deploy can override without
a code change (`ARCHITECTURE.md` §8), then falls back to the shipping default.
"""

from __future__ import annotations

import os
from pathlib import Path

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #
REPO = Path(__file__).resolve().parent.parent
DATA = REPO / "data"
MARTS = DATA / "marts"
CURATED = DATA / "curated"
STAGING = CURATED / "staging"
RAW = DATA / "raw"  # asserted EMPTY at the end of every run (DECISIONS 7)
AUDIT = REPO / "audit"  # Phase-0 evidence record. READ-ONLY. Never written to.
MANIFEST = MARTS / "manifest.json"


def _env(name: str, default: str) -> str:
    v = os.environ.get(name)
    return default if v is None or v == "" else v


# --------------------------------------------------------------------------- #
# GATE #3 flags — BUILD_PLAN.md gate #3, DECISIONS 62 / 63
# --------------------------------------------------------------------------- #

#: Dead-money licensing tier. ``'full'`` ships every curated row including the
#: REVIEW tier (Rey's ruling, gate #3 instance 3). ``'safe'`` is the licensing
#: reversal: SAFE-league-official + SAFE-editorial rows only, which collapses
#: full-32 dead-money coverage to **2014 and 2015** and therefore collapses Cap+
#: to those two seasons (`RISKS.md` risk 1, `DATA_AUDIT.md` §5).
#: `SPEC.md` §7.5 names the same switch ``DEAD_MONEY_TIER ∈ {SAFE_ONLY, ALL}``;
#: both spellings are accepted so the seed program and the ETL agree.
DEAD_MONEY_TIER = _env("DEAD_MONEY_TIER", "full").strip().lower()

_TIER_ALIASES = {
    "full": "full", "all": "full", "review": "full",
    "safe": "safe", "safe_only": "safe", "safe-only": "safe",
}
if DEAD_MONEY_TIER not in _TIER_ALIASES:
    raise ValueError(
        f"DEAD_MONEY_TIER={DEAD_MONEY_TIER!r} is not one of {sorted(_TIER_ALIASES)}"
    )
DEAD_MONEY_TIER = _TIER_ALIASES[DEAD_MONEY_TIER]

#: The four `license_tier` values ETL derives from `source_url` (`SPEC.md` §7.5).
LICENSE_TIERS = ("SAFE_LEAGUE", "SAFE_EDITORIAL", "REVIEW_SPOTRAC", "REVIEW_OTC")
#: Which of them survive under each setting of `DEAD_MONEY_TIER`.
LICENSE_TIERS_ALLOWED = {
    "full": set(LICENSE_TIERS),
    "safe": {"SAFE_LEAGUE", "SAFE_EDITORIAL"},
}[DEAD_MONEY_TIER]

#: PlayerMark resolution floor. 300 px = 93.6% coverage / 6.4% designed-card
#: fallback (gate #3 instance 1, `SPEC.md` §5.2 OPEN DECISION 1, DECIDED).
#: The renderer branches on width either way; this is the one line that moves.
IMAGE_MIN_WIDTH_PX = int(_env("IMAGE_MIN_WIDTH_PX", "300"))

#: Global TeamMark kill-switch (`SPEC.md` §5.1). ``False`` = logos render.
#: ``True`` forces every TeamMark instance product-wide to the typographic
#: fallback chip with a luminance-computed glyph colour. The app-side flag is
#: the inverse, ``TEAM_LOGOS_ENABLED``; both are exported so neither side has to
#: remember which way the boolean points.
TEAMMARK_KILLSWITCH = _env("TEAMMARK_KILLSWITCH", "false").strip().lower() in (
    "1", "true", "yes", "on",
)
TEAM_LOGOS_ENABLED = not TEAMMARK_KILLSWITCH

#: ShareAlike treatment posture (gate #3 instance 2, DECIDED option (a)).
#: ``'css_filter_only'`` stores the unmodified Commons original and applies the
#: treatment as CSS at render time, so no fixed derivative work is created.
#: ``'baked'`` is option (c) and stamps ShareAlike obligations onto the served
#: asset. `ARCHITECTURE.md` §5 writes the pipeline as this branch, not a rewrite.
IMAGE_TREATMENT_MODE = _env("IMAGE_TREATMENT_MODE", "css_filter_only")

# --------------------------------------------------------------------------- #
# Season windows — DECISIONS 46
# --------------------------------------------------------------------------- #
PERF_WINDOW = (1999, 2025)        # results + EPA; 861 team-seasons
TIER2_WINDOW = (2013, 2025)       # player-level economics; 416 team-seasons
COACHING_WINDOW = (2000, 2025)    # 830 team-seasons (HOU enters 2002)
DRAFT_WINDOW = (2000, 2025)       # 6,644 picks
LEAGUE_CAP_WINDOW = (1994, 2025)  # 2010 is NULL — uncapped year
SNAP_START = 2013                 # the 2012 asset exists and is EMPTY (trap 6)
DOLLAR_FRAMING_START = 2013       # DECISIONS 41 — draft dollars are Tier 2 only
EXCLUDED_SEASON = 2026            # games.csv carries 272 unplayed 2026 rows

# --------------------------------------------------------------------------- #
# Cap+ — CAPPLUS_MEMO.md §7, approved gate #1 2026-07-25 (DECISIONS 12, 61)
# --------------------------------------------------------------------------- #
LAMBDA_DEAD = 1.5     # published economic claim, NOT a tuning knob (DECISIONS 13)
LAMBDA_COMPARISON = (1.0, 2.0)  # published beside it in the methodology only
COST_FLOOR_Q = 0.25   # season 25th percentile, applied to COST (DECISIONS 14)
INDEX_MEAN = 100.0    # season mean exactly 100
INDEX_SD = 15.0       # ONE pooled within-season SD across the whole window
FLOORED_TEAMS_PER_SEASON = 8    # 8 of 32 every season, by construction
#: Gate #1 reopened 2026-10-10 (DECISIONS 100-103). α is a CANDIDATE weight on
#: prorated bonus still owed to future caps; published, not approved.
MORTGAGE_ALPHA = 0.5
#: A drafted QB is in his rookie window through the 4th season after the draft
#: (admits the fifth-year option) while still on the contract signed that year.
ROOKIE_WINDOW_MAX_YEARS = 4

#: The nine covered seasons. 288 of 416 team-seasons (69.2%).
CAPPLUS_SEASONS = (2014, 2015, 2017, 2018, 2019, 2022, 2023, 2024, 2025)
#: Whole-season blanks. Blanking is whole-season, never per-team (DECISIONS 16).
CAPPLUS_BLANK_SEASONS = (2013, 2016, 2020, 2021)
#: Tables published before the league year opened — badged `provisional`.
CAPPLUS_PROVISIONAL_SEASONS = (2014, 2019)
#: The league year opens mid-March; a table dated before it cannot see that
#: season's cuts and restructures at all, so its level is a floor.
LEAGUE_YEAR_OPENS_MMDD = "-03-15"

# --------------------------------------------------------------------------- #
# Stability Index — SPEC.md §2.8, DECISIONS 35
# --------------------------------------------------------------------------- #
CHURN_HC_BOUNDARY = 3.0
CHURN_HC_IN_SEASON = 4.5    # 1.5x its boundary equivalent — a firing is a signal
CHURN_COORD_BOUNDARY = 1.0
CHURN_COORD_IN_SEASON = 1.5
CHURN_NONE_MULTIPLIER = 0.5  # either side of the transition is a NONE@ sentinel
W_DECAY = (1.0, 0.6, 0.3)   # W(t) = churn(t) + 0.6*churn(t-1) + 0.3*churn(t-2)
SI_SLOPE = 5.0              # SI = clamp(0, 100, 100 - 5*W)
SI_MIN, SI_MAX = 0.0, 100.0
NONE_SENTINEL = "NONE"      # 60 rows: OC 38, DC 22, HC 0

# --------------------------------------------------------------------------- #
# Positional allocation — SPEC.md §2.6, DECISIONS 27/28
# --------------------------------------------------------------------------- #
POSITION_GROUPS = ("QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "ST")
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
#: Unmapped cap share is 0.375% and is DROPPED, not bucketed into "other".
POSITION_UNMAPPED = "UNK"

# --------------------------------------------------------------------------- #
# Launch copy — BUILD_PLAN.md "Launch-copy requirements". Approved text, not
# placeholders. These strings render verbatim; they are data, not UI detail.
# --------------------------------------------------------------------------- #
BLANK_REASON_NO_DM_TABLE = (
    "Not available — no league-wide dead-money table was published for this season."
)
BLANK_REASON_PRE_TIER2 = (
    "Not available — league-wide contract coverage begins in 2013."
)
BLANK_REASON_NO_DM_TABLE_FOR = "no league-wide dead-money table published for {season}"
PROVISIONAL_BADGE_COPY = (
    "published before the league year opened; understates the final figure."
)
TEAM_RATING_NAME = "Team Rating (performance only)"

# --------------------------------------------------------------------------- #
# Source URLs — every remote input, in one place. Pinned per DECISIONS 8 via
# etl/pins.toml; the URLs themselves are release-tag paths, never `latest`.
# --------------------------------------------------------------------------- #
NFLVERSE_RELEASE = "https://github.com/nflverse/nflverse-data/releases/download"
NFLDATA_RAW = "https://raw.githubusercontent.com/nflverse/nfldata/master/data"
NFLFASTR_RAW = "https://raw.githubusercontent.com/nflverse/nflfastR-data/master"

PBP_URL = NFLVERSE_RELEASE + "/pbp/play_by_play_{year}.parquet"
CONTRACTS_URL = NFLVERSE_RELEASE + "/contracts/historical_contracts.parquet"
DRAFT_URL = NFLVERSE_RELEASE + "/draft_picks/draft_picks.parquet"
PLAYERS_URL = NFLVERSE_RELEASE + "/players/players.parquet"
SNAPS_URL = NFLVERSE_RELEASE + "/snap_counts/snap_counts_{year}.parquet"
ROSTER_URL = NFLVERSE_RELEASE + "/rosters/roster_{year}.parquet"
GAMES_URL = NFLDATA_RAW + "/games.csv"
TEAMS_URL = NFLDATA_RAW + "/teams.csv"
#: Conference, division and colour are ABSENT from teams.csv (SPEC.md §5.1).
COLORS_LOGOS_URL = NFLFASTR_RAW + "/teams_colors_logos.csv"

#: Fitzgerald–Spielberger NFL Draft Trade Value Chart (DECISIONS 39, SPEC §2.9).
#: Cited on the methodology page and in the chart footer.
FS_CHART_URL = "https://overthecap.com/draft-trade-value-chart"
FS_CHART_BOOK = "The Drafting Stage, Brad Spielberger & Jason Fitzgerald"
#: The published chart runs picks 1–256. Drafts in the window reach pick 262
#: (2003, 2022), so picks beyond 256 carry the pick-256 value under an explicit,
#: labelled extension rule — never silently interpolated.
FS_CHART_PUBLISHED_MAX_PICK = 256
FS_CHART_MAX_PICK = 262

# --------------------------------------------------------------------------- #
# Networking — DECISIONS 7. TLS verification stays ON, always.
# --------------------------------------------------------------------------- #
CA_BUNDLE = "/root/.ccr/ca-bundle.crt"
HTTP_RETRIES = 3
HTTP_TIMEOUT_S = 600

# --------------------------------------------------------------------------- #
# Output formatting — ARCHITECTURE.md §4.3, byte-stable re-runs
# --------------------------------------------------------------------------- #
CSV_LINE_TERMINATOR = "\n"
CSV_ENCODING = "utf-8"
#: Rounding applied before write so float repr can never drift between runs.
ROUND_USD = 0        # dollars are whole dollars
ROUND_RATIO = 6      # shares, percentages, per-play rates
ROUND_INDEX = 6      # index values and z-scores
ROUND_EPA_TOTAL = 4

#: Expected row counts. A mart that misses its count fails the build
#: (`ARCHITECTURE.md` §7 post-seed assertions, restated here at source).
EXPECTED_ROWS = {
    "team_season_results": 861,
    "team_season_epa": 861,
    "team_season_cap": 416,
    "capplus_candidates": 861,
    "capplus_official": 288,
    "capplus_context": 416,
    "team_rating": 861,
    "team_season_stability": 830,
    "dead_money_team_season": 370,
    "dead_money_ledger": 21,
    "dead_money_display": 316,   # 288 full32 + 28 published leaders
    "coaching_staff": 2612,
    "league_cap": 32,
    "draft_pick": 6644,
    "position_allocation": 3744,
}
