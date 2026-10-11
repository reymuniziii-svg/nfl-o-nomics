"""Regenerate the synthetic live-layer fixtures: `python3 tests/fixtures/live/make_fixtures.py`.

SYNTHETIC DATA, not a real season. 32 real club codes on an invented 2026
schedule (18 weeks, 17 games each, byes in weeks 5-12), with invented scores and
plays from a seeded generator. It exists so `closed_week()` and the live build
run offline in CI. The shape it encodes:

* weeks 1-5 final in games.csv and fully loaded in pbp (asof_week = 5);
* week 5 has four clubs on bye;
* week 6's Thursday game is already final and in pbp (the N+1 retry case);
* every other week-6+ game is unplayed (null scores, no plays);
* one tie (week 2's first game, 20-20).

The tests mutate copies of these frames in memory for the half-loaded week,
postponed game, pbp-lag and score-mismatch cases.
"""

from __future__ import annotations

import datetime as dt
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
TEAMS = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN", "DET",
         "GB", "HOU", "IND", "JAX", "KC", "LA", "LAC", "LV", "MIA", "MIN", "NE", "NO",
         "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WAS"]
SEASON, WEEKS, BYE_WEEKS = 2026, 18, range(5, 13)
PLAYED_THROUGH = 5          # weeks fully final
THURSDAY_OPENER = date0 = dt.date(2026, 9, 10)


def rounds() -> list[list[tuple[str, str]]]:
    """Circle-method round robin: 31 rounds of 16 pairings."""
    t = TEAMS[:]
    out = []
    for r in range(len(t) - 1):
        pairs = [(t[i], t[-1 - i]) for i in range(len(t) // 2)]
        out.append([(a, b) if (r + i) % 2 else (b, a) for i, (a, b) in enumerate(pairs)])
        t = [t[0]] + [t[-1]] + t[1:-1]
    return out


def with_byes(week: int, games: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Week 5-12: four clubs sit out (TEAMS in blocks of four, so each club has
    exactly one bye). Their games come off the slate and any opponents left
    without a game are re-paired with each other."""
    if week not in BYE_WEEKS:
        return games
    k = week - BYE_WEEKS[0]
    off = set(TEAMS[4 * k: 4 * k + 4])
    keep = [g for g in games if not set(g) & off]
    orphans = sorted({t for g in games if set(g) & off for t in g} - off)
    keep += [(orphans[i], orphans[i + 1]) for i in range(0, len(orphans), 2)]
    return keep


def main() -> None:
    rng = np.random.default_rng(2026)
    strength = dict(zip(TEAMS, rng.normal(0, 0.12, len(TEAMS))))
    wk_pairs = [with_byes(w, g) for w, g in enumerate(rounds()[:WEEKS], start=1)]

    rows = []
    for w in range(1, WEEKS + 1):
        games = wk_pairs[w - 1]
        thu = date0 + dt.timedelta(days=7 * (w - 1))
        for i, (away, home) in enumerate(games):
            day = thu if i == 0 else (thu + dt.timedelta(days=4) if i == len(games) - 1
                                      else thu + dt.timedelta(days=3))
            final = w <= PLAYED_THROUGH or (w == PLAYED_THROUGH + 1 and i == 0)
            hs = as_ = None
            if final:
                edge = 40 * (strength[home] - strength[away])
                hs = max(0, int(round(22 + edge / 2 + rng.normal(0, 8))))
                as_ = max(0, int(round(20 - edge / 2 + rng.normal(0, 8))))
                if w == 2 and i == 0:
                    hs = as_ = 20
            rows.append({"game_id": f"{SEASON}_{w:02d}_{away}_{home}", "season": SEASON,
                         "game_type": "REG", "week": w, "gameday": day.isoformat(),
                         "away_team": away, "away_score": as_, "home_team": home,
                         "home_score": hs, "location": "Home"})
    sched = pd.DataFrame(rows)
    sched["away_score"] = sched["away_score"].astype("Int64")
    sched["home_score"] = sched["home_score"].astype("Int64")
    assert len(sched) == 272
    sched.to_csv(HERE / "games.csv", index=False, lineterminator="\n")

    plays = []
    for g in sched[sched["home_score"].notna()].itertuples(index=False):
        pid = 1
        for off, dfn in ((g.away_team, g.home_team), (g.home_team, g.away_team)):
            for _ in range(int(rng.integers(55, 66))):
                plays.append((g.week, g.game_id, float(pid), off, dfn,
                              "pass" if rng.random() < 0.6 else "run",
                              float(rng.normal(0.6 * (strength[off] - strength[dfn]), 1.0)),
                              g.home_team, g.away_team, int(g.home_score), int(g.away_score)))
                pid += 1
            for pt in ("punt", "field_goal", "no_play"):
                plays.append((g.week, g.game_id, float(pid), off, dfn, pt,
                              float(rng.normal(0, 0.5)), g.home_team, g.away_team,
                              int(g.home_score), int(g.away_score)))
                pid += 1
        plays.append((g.week, g.game_id, float(pid), None, None, None, None,
                      g.home_team, g.away_team, int(g.home_score), int(g.away_score)))
    pbp = pd.DataFrame(plays, columns=["week", "game_id", "play_id", "posteam", "defteam",
                                       "play_type", "epa", "home_team", "away_team",
                                       "home_score", "away_score"])
    pbp.insert(0, "season_type", "REG")
    pbp.insert(0, "season", SEASON)
    pbp["week"] = pbp["week"].astype("int32")
    pbp.to_parquet(HERE / "pbp.parquet", index=False)
    print(f"games.csv {len(sched)} rows; pbp.parquet {len(pbp)} rows")


if __name__ == "__main__":
    main()
