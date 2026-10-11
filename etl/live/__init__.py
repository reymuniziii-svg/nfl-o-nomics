"""The 2026 in-season live layer (`DECISIONS.md` 116, `design/plans/2026-in-season.md`).

A parallel set of marts in `data/marts/live/`, pinned by `etl/live/live_pins.toml`
and refreshed weekly by `.github/workflows/live-refresh.yml`. It never joins,
reads into or rewrites the frozen 1999–2025 marts.

    python -m etl.live resolve   # pin pbp (sha256) + games.csv (commit SHA); find asof_week
    python -m etl.live build     # build the live marts from the pins [--check-stable]
    python -m etl.live status    # what is pinned and what is built
"""
