"""Live-layer configuration — the 2026 in-season tier (`DECISIONS.md` 116).

Everything the weekly job might need to flip lives here. Nothing in this
package reads or writes the frozen 1999–2025 marts: the live marts sit in
`data/marts/live/` with their own registry, manifest and pin file.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

from .. import config as base

# --------------------------------------------------------------------------- #
# The season and its gates (owner rulings, DECISIONS 116)
# --------------------------------------------------------------------------- #
#: The one season this layer covers. The web half mirrors it; the mart also
#: carries it (`live_status.season`), so a reader never has to assume it.
LIVE_SEASON = 2026
WEEKS_IN_SEASON = 18
GAMES_PER_TEAM = 17
#: Live Team Rating publishes from the first closed week >= 4. Before it the
#: opponent adjustment is not stable (week-3 backtest: max side shift 0.40
#: EPA/play, corr 0.60 in 2022) and the whole season is blank.
LIVE_PERF_MIN_WEEK = 4
#: Live Cap+ is gated to week >= 9 AND a dated 2026 dead-money basis. Neither a
#: money snapshot nor a dead-money table is pinned in this pass, so it is blank.
LIVE_CAPPLUS_MIN_WEEK = 9

# --------------------------------------------------------------------------- #
# Closed-week rule (plan §1.1)
# --------------------------------------------------------------------------- #
#: A game counts as loaded only with at least this many pass + run plays.
LIVE_MIN_SCRIM_PLAYS = 80
#: Games that will never be played (the 2022 BUF-CIN case): game_id -> the
#: public source that says so. They leave the closed-week rule, the results and
#: the EPA, and the affected teams' games_scheduled falls by one. Empty in 2026.
LIVE_CANCELLED_GAMES: dict[str, str] = {}

# --------------------------------------------------------------------------- #
# Opponent adjustment on a partial season
# --------------------------------------------------------------------------- #
#: The historical guards (0.08 / 0.9) fail at weeks 4-6 by design. These bound a
#: BROKEN fit, not a noisy one. Backtest, 2021-2025 truncated at each week
#: (etl.performance with max_week): worst max side shift 0.213 at week 4,
#: 0.167 at week 5, 0.147 at week 6, under 0.10 from week 9; worst corr(adj,
#: raw margin) 0.834 at week 4, 0.846 at week 5, above 0.91 from week 8.
LIVE_ADJ_MAX_SHIFT = 0.30
LIVE_ADJ_MIN_CORR = 0.75

# --------------------------------------------------------------------------- #
# Paths — the live layer writes here and nowhere else
# --------------------------------------------------------------------------- #
LIVE_MARTS_DIR = base.MARTS / "live"
LIVE_MANIFEST = LIVE_MARTS_DIR / "manifest.json"
LIVE_PINS = Path(__file__).resolve().parent / "live_pins.toml"
#: Content-addressed download cache, OUTSIDE the repo: `data/raw/` stays empty
#: at rest (DECISIONS 7). resolve fills it; build re-reads the same bytes.
CACHE_DIR = Path(os.environ.get("YY_LIVE_CACHE") or
                 Path(tempfile.gettempdir()) / "yieldyard-live")

#: Row counts. `live_team_perf` is 32 once perf_state = 'value', else 0;
#: `live_capplus` is 0 while capplus_state = 'blank'.
EXPECTED_ROWS_LIVE = {"live_status": 1, "live_team_perf": 32, "live_capplus": 0}

# --------------------------------------------------------------------------- #
# Sources — pinned by content hash and commit SHA, never by a moving URL
# --------------------------------------------------------------------------- #
GITHUB_API = "https://api.github.com"
PBP_RELEASE_TAG = "pbp"
PBP_REPO = "nflverse/nflverse-data"
PBP_ASSET = f"play_by_play_{LIVE_SEASON}.parquet"
PBP_URL = f"{base.NFLVERSE_RELEASE}/{PBP_RELEASE_TAG}/{PBP_ASSET}"
PBP_RELEASE_API = f"{GITHUB_API}/repos/{PBP_REPO}/releases/tags/{PBP_RELEASE_TAG}"
GAMES_REPO = "nflverse/nfldata"
GAMES_PATH = "data/games.csv"
GAMES_COMMITS_API = (f"{GITHUB_API}/repos/{GAMES_REPO}/commits"
                     f"?path={GAMES_PATH}&per_page=1")
GAMES_RAW_AT = "https://raw.githubusercontent.com/{repo}/{sha}/{path}"

#: The pbp columns the live layer reads (of 372). A renamed or dropped column
#: fails the scan.
LIVE_PBP_COLS = ("season", "season_type", "week", "game_id", "play_id",
                 "posteam", "defteam", "play_type", "epa",
                 "home_team", "away_team", "home_score", "away_score")
#: The schedule columns the live layer reads.
LIVE_GAMES_COLS = ("game_id", "season", "game_type", "week", "gameday",
                   "home_team", "away_team", "home_score", "away_score")

# --------------------------------------------------------------------------- #
# Staleness — workflow only, never written into a mart
# --------------------------------------------------------------------------- #
#: A week is overdue when its last scheduled game day is this many days past
#: and it is still open: Monday night + 48 hours lands on the Thursday retry.
STALE_AFTER_DAYS = 3

# --------------------------------------------------------------------------- #
# Copy — rendered verbatim
# --------------------------------------------------------------------------- #
BADGE_LIVE = "in_season_live"
PERF_BLANK_REASON_EARLY = (
    "Live Team Rating publishes from week 4, once every club has played enough "
    "games for the opponent adjustment to hold."
)
CAPPLUS_BLANK_REASON = (
    "Live Cap+ publishes from week 9 with a dated 2026 dead-money table."
)
#: `{week}`, `{date}`, `{gp}`, `{total}`; `{bye}` is "" or " (bye week N)".
BADGE_REASON_TEMPLATE = (
    "Live: through week {week} ({date}), {gp} of {total} games played{bye}. "
    "Performance only; it moves every week until the season is final."
)
#: The dead-money basis while no 2026 table is pinned.
DM_BASIS_NONE = "none"
DM_BASES = ("full32", "estimated", "none")
