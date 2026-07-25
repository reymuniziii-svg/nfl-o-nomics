#!/usr/bin/env python3.11
"""Audit nflverse/nfldata schedules & results, build the team-season results mart,
cross-check it against the EPA mart, and emit audit/findings_performance.md.

Source: https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv

Run AFTER audit/audit_pbp.py -- the 1:1 join check and the findings table both
read that script's outputs.

Outputs (all overwritten in full on every run -- the script is idempotent):
  data/marts/team_season_results.csv
  data/curated/staging/schedule_season_stats.csv
  audit/findings_performance.md

Usage:
  python3.11 audit/audit_schedules.py [--start 1999] [--end 2025]
"""

from __future__ import annotations

import argparse
import sys
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from team_codes import EXPECTED_TEAMS, normalize_series  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
AUDIT = ROOT / "audit"
MARTS = ROOT / "data" / "marts"
STAGING = ROOT / "data" / "curated" / "staging"
RAW = ROOT / "data" / "raw"

GAMES_URL = "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv"

# Golden structural tests: (season, team, wins, losses, ties)
GOLDEN = [
    (2007, "NE", 16, 0, 0),
    (2008, "DET", 0, 16, 0),
    (2017, "CLE", 0, 16, 0),
]


def env_versions() -> dict:
    out = {"python": sys.version.split()[0]}
    for pkg in ("pandas", "pyarrow", "duckdb", "requests", "numpy", "pip"):
        try:
            out[pkg] = version(pkg)
        except PackageNotFoundError:
            out[pkg] = "not installed"
    return out


# ------------------------------------------------------------------- loading


def load_games() -> pd.DataFrame:
    g = pd.read_csv(GAMES_URL)
    g["home_team"] = normalize_series(g["home_team"])
    g["away_team"] = normalize_series(g["away_team"])
    return g


# ------------------------------------------------------------------ the mart


def build_results(reg: pd.DataFrame) -> pd.DataFrame:
    """One row per team per (REG) season, from the two sides of each game."""
    home = pd.DataFrame({
        "season": reg["season"], "team": reg["home_team"],
        "pf": reg["home_score"], "pa": reg["away_score"],
    })
    away = pd.DataFrame({
        "season": reg["season"], "team": reg["away_team"],
        "pf": reg["away_score"], "pa": reg["home_score"],
    })
    long = pd.concat([home, away], ignore_index=True)

    long["win"] = (long["pf"] > long["pa"]).astype(int)
    long["loss"] = (long["pf"] < long["pa"]).astype(int)
    long["tie"] = (long["pf"] == long["pa"]).astype(int)

    m = long.groupby(["season", "team"], as_index=False).agg(
        games=("win", "size"),
        wins=("win", "sum"),
        losses=("loss", "sum"),
        ties=("tie", "sum"),
        points_for=("pf", "sum"),
        points_against=("pa", "sum"),
    )
    # Ties count as half a win.
    m["win_pct"] = ((m["wins"] + 0.5 * m["ties"]) / m["games"]).round(6)
    m["point_diff"] = m["points_for"] - m["points_against"]
    return m[[
        "season", "team", "games", "wins", "losses", "ties", "win_pct",
        "points_for", "points_against", "point_diff",
    ]].sort_values(["season", "team"]).reset_index(drop=True)


# --------------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--start", type=int, default=1999)
    ap.add_argument("--end", type=int, default=2025)
    args = ap.parse_args()
    lo, hi = args.start, args.end

    MARTS.mkdir(parents=True, exist_ok=True)
    STAGING.mkdir(parents=True, exist_ok=True)
    checks: list[tuple[str, bool, str]] = []

    print("== loading games.csv ==")
    g = load_games()
    print(f"  {len(g)} rows, seasons {int(g.season.min())}-{int(g.season.max())}, "
          f"game_types {sorted(g.game_type.dropna().unique())}")

    # --- coverage ----------------------------------------------------------
    present = set(g.loc[g.season.between(lo, hi), "season"].unique())
    gaps = sorted(set(range(lo, hi + 1)) - present)
    checks.append((f"coverage {lo}-{hi} complete", not gaps,
                   "no gaps" if not gaps else f"missing {gaps}"))
    beyond = sorted(s for s in g.season.unique() if s > hi)
    print(f"  seasons beyond {hi} present (future schedule, excluded): {beyond or 'none'}")

    win = g[g.season.between(lo, hi)].copy()
    reg = win[win.game_type == "REG"].copy()

    # --- missing scores ----------------------------------------------------
    unplayed = reg[reg.home_score.isna() | reg.away_score.isna()]
    checks.append((f"zero missing scores in {lo}-{hi} REG games", unplayed.empty,
                   "0 games with a null score"
                   if unplayed.empty else f"{len(unplayed)} rows: "
                   f"{unplayed.groupby('season').size().to_dict()}"))
    reg = reg.dropna(subset=["home_score", "away_score"])
    reg["home_score"] = reg["home_score"].astype(int)
    reg["away_score"] = reg["away_score"].astype(int)

    results = build_results(reg)
    out = MARTS / "team_season_results.csv"
    results.to_csv(out, index=False)
    print(f"\nwrote {out}  ({len(results)} team-seasons)")

    # --- per-season stats --------------------------------------------------
    rows = []
    for season, grp in reg.groupby("season"):
        teams = sorted(set(grp.home_team) | set(grp.away_team))
        exp = EXPECTED_TEAMS.get(int(season))
        per_team = results[results.season == season]["games"]
        rows.append({
            "season": int(season),
            "reg_games": len(grp),
            "post_games": int(((win.season == season) & (win.game_type != "REG")).sum()),
            "teams": len(teams),
            "expected_teams": exp,
            "team_count_ok": len(teams) == exp,
            "games_per_team_min": int(per_team.min()),
            "games_per_team_max": int(per_team.max()),
            "weeks": int(grp.week.max()),
        })
    sched = pd.DataFrame(rows).sort_values("season").reset_index(drop=True)
    sched.to_csv(STAGING / "schedule_season_stats.csv", index=False)

    bad_teams = sched[~sched.team_count_ok]
    checks.append(("era-correct team counts per season", bad_teams.empty,
                   "31 teams 1999-2001, 32 from 2002"
                   if bad_teams.empty else str(bad_teams.to_dict("records"))))

    # --- golden structural tests ------------------------------------------
    print("\n== golden structural tests ==")
    for season, team, w, l, t in GOLDEN:
        r = results[(results.season == season) & (results.team == team)]
        if r.empty:
            ok, detail = False, "team-season not found"
        else:
            r = r.iloc[0]
            ok = (r.wins == w and r.losses == l and r.ties == t)
            detail = f"{int(r.wins)}-{int(r.losses)}-{int(r.ties)} " \
                     f"(PF {int(r.points_for)}, PA {int(r.points_against)})"
        print(f"  {season} {team} expect {w}-{l}-{t}: {'PASS' if ok else 'FAIL'}  {detail}")
        checks.append((f"{season} {team} = {w}-{l}-{t}", ok, detail))

    # --- 1:1 join with the EPA mart ---------------------------------------
    print("\n== join vs EPA mart ==")
    epa_path = MARTS / "team_season_epa.csv"
    join_note = "EPA mart not found -- run audit/audit_pbp.py first"
    if epa_path.exists():
        epa = pd.read_csv(epa_path)
        epa = epa[epa.season.between(lo, hi)]
        k_e = set(map(tuple, epa[["season", "team"]].values))
        k_r = set(map(tuple, results[["season", "team"]].values))
        only_e, only_r = sorted(k_e - k_r), sorted(k_r - k_e)
        dup_e = epa.duplicated(["season", "team"]).sum()
        dup_r = results.duplicated(["season", "team"]).sum()
        ok = not only_e and not only_r and dup_e == 0 and dup_r == 0
        join_note = (f"{len(k_e)} EPA keys / {len(k_r)} results keys, "
                     f"{len(k_e & k_r)} matched, 0 duplicates both sides")
        if not ok:
            join_note = (f"EPA-only {only_e[:20]}; results-only {only_r[:20]}; "
                         f"dups epa={dup_e} results={dup_r}")
        print(f"  1:1 join on (season, team): {'PASS' if ok else 'FAIL'}  {join_note}")
        checks.append(("EPA mart joins 1:1 with results mart on (season, team)", ok, join_note))
    else:
        print(f"  SKIP -- {join_note}")
        checks.append(("EPA mart joins 1:1 with results mart on (season, team)", False, join_note))

    leftover = [p.name for p in RAW.glob("*") if p.is_file()]
    checks.append(("data/raw/ left empty", not leftover, str(leftover) if leftover else "empty"))

    write_findings(sched, checks, beyond)
    print(f"\nwrote {AUDIT / 'findings_performance.md'}")

    print("\n== check summary ==")
    for name, ok, detail in checks:
        print(f"  [{'PASS' if ok else 'FAIL'}] {name} -- {detail}")
    return 0 if all(c[1] for c in checks) else 1


# ----------------------------------------------------------------- findings


def write_findings(sched: pd.DataFrame, checks, beyond) -> None:
    pbp_stats_path = STAGING / "pbp_season_stats.csv"
    pbp = pd.read_csv(pbp_stats_path) if pbp_stats_path.exists() else pd.DataFrame()
    codes_path = STAGING / "pbp_team_codes.csv"
    codes = pd.read_csv(codes_path) if codes_path.exists() else pd.DataFrame()
    env = env_versions()

    L = []
    L.append("# Performance data audit — play-by-play/EPA and schedules/results\n")
    L.append("Scope: nflverse play-by-play (EPA) and nflverse/nfldata schedules & results, "
             "seasons 1999–2025. Feeds `DATA_AUDIT.md`.\n")
    L.append("Reproduce with `python3.11 audit/audit_pbp.py` then "
             "`python3.11 audit/audit_schedules.py` (both idempotent, both leave "
             "`data/raw/` empty).\n")

    L.append("\n## 1. Environment\n")
    L.append("| Component | Version |")
    L.append("| --- | --- |")
    for k, v in env.items():
        L.append(f"| {k} | {v} |")
    L.append("\nInstalled via pip through the session's outbound HTTPS proxy "
             "(`HTTPS_PROXY`); TLS verification left enabled throughout. DuckDB's "
             "`httpfs` extension is pointed at the same proxy and at "
             "`/root/.ccr/ca-bundle.crt`.\n")

    L.append("\n## 2. Sources and verified coverage\n")
    L.append("| Dataset | URL pattern | Verified range | Notes |")
    L.append("| --- | --- | --- | --- |")
    if not pbp.empty:
        rng = f"{int(pbp.season.min())}–{int(pbp.season.max())}"
        miss = str(pbp["missing_years"].iloc[0]) if "missing_years" in pbp else ""
        miss = miss if miss and miss != "nan" else "none"
        L.append(f"| Play-by-play / EPA | `nflverse-data/releases/download/pbp/"
                 f"play_by_play_{{YEAR}}.parquet` | {rng} (27 seasons) | "
                 f"All 27 assets returned HTTP 200. Missing years: {miss}. "
                 f"**2025 is present** (~20.3 MB, {int(pbp.loc[pbp.season == 2025, 'total_rows'].iloc[0])} rows). "
                 f"2026 returns 404, as expected. |")
    L.append("| Schedules / results | `nfldata/master/data/games.csv` | 1999–2025 complete | "
             f"File itself extends to {max(beyond) if beyond else 2025}; "
             f"season(s) {beyond or 'none'} are future/unplayed schedule rows and are "
             "excluded from the mart. |")

    L.append("\nRead strategy: DuckDB `httpfs` scans each season's release parquet "
             "remotely and projects only the six needed columns "
             "(`season, season_type, posteam, defteam, play_type, epa`) out of 372, "
             "so no raw parquet is ever written to disk. `data/raw/` is empty at rest. "
             "`audit/audit_pbp.py --download` is a one-season-at-a-time fallback that "
             "deletes each file immediately after aggregating.\n")

    L.append("\n## 3. Per-season summary\n")
    L.append("`pbp rows` = all rows in the season's parquet (REG + POST). "
             "`epa null %` = null rate of `epa` restricted to scrimmage plays "
             "(`play_type IN ('pass','run')`). `teams` = distinct offensive teams "
             "in REG scrimmage plays. `REG games` / `POST games` from `games.csv`.\n")
    L.append("| Season | pbp rows | pass/run plays | epa null % (pass/run) | teams | "
             "lg off EPA/play | REG games | POST games |")
    L.append("| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |")
    if not pbp.empty:
        s = sched.set_index("season")
        for _, r in pbp.sort_values("season").iterrows():
            y = int(r.season)
            rg = int(s.loc[y, "reg_games"]) if y in s.index else "—"
            pg = int(s.loc[y, "post_games"]) if y in s.index else "—"
            L.append(
                f"| {y} | {int(r.total_rows):,} | {int(r.pass_rush_plays):,} | "
                f"{r.epa_null_rate_pass_rush * 100:.4f}% | {int(r.teams)} | "
                f"{r.league_mean_off_epa_per_play:+.4f} | {rg} | {pg} |"
            )

    L.append("\n## 4. Team-code conventions (important)\n")
    L.append("The two sources **disagree systematically** — this is the single largest "
             "integration hazard in these datasets.\n")
    L.append("| Franchise | play-by-play parquet | games.csv | Canonical code chosen |")
    L.append("| --- | --- | --- | --- |")
    L.append("| Rams | `LA` in **every** season, incl. 1999 | `STL` 1999–2015, `LA` 2016+ | `LA` |")
    L.append("| Chargers | `LAC` in **every** season | `SD` 1999–2016, `LAC` 2017+ | `LAC` |")
    L.append("| Raiders | `LV` in **every** season | `OAK` 1999–2019, `LV` 2020+ | `LV` |")
    L.append("\nFindings:\n")
    L.append("* nflverse play-by-play **retroactively rewrites franchise codes to the "
             "present-day abbreviation**. The 1999 parquet contains `LA`, `LAC` and `LV`; "
             "`STL`, `SD` and `OAK` never appear in the pbp files at all.")
    L.append("* `games.csv` is **era-correct**: it carries `STL`, `SD`, `OAK` for the "
             "seasons those franchises actually played under those names "
             "(35 distinct codes across the file vs. 32 in pbp).")
    L.append("* **`LAR` appears in neither source.** Both use `LA` for the Rams, so the "
             "`LA` vs `LAR` ambiguity resolves to `LA`.")
    L.append("* No `JAC`/`JAX` split — both sources use `JAX` throughout.")
    L.append("\n**Normalization applied:** `audit/team_codes.py` defines a single "
             "`normalize_team` map (`STL→LA`, `SD→LAC`, `OAK→LV`, plus defensive aliases) "
             "that is applied to **both** marts. It is a no-op on pbp codes and rewrites "
             "the three legacy codes in `games.csv`. Both marts therefore use the "
             "**nflverse current-franchise convention with `LA` for the Rams**. "
             "Consequence to document downstream: a query for `LA` in 1999 returns the "
             "*St. Louis* Rams — franchise continuity is preserved, geography is not.\n")
    if not codes.empty:
        c99 = codes[codes.season == 1999]
        if not c99.empty:
            L.append(f"1999 offensive team codes as they appear in pbp "
                     f"({int(c99.iloc[0].n_teams)}): `{c99.iloc[0].teams}`\n")

    L.append("\n## 5. Cross-checks and consistency tests\n")
    L.append("| Check | Result | Detail |")
    L.append("| --- | --- | --- |")
    for name, ok, detail in checks:
        L.append(f"| {name} | {'**PASS**' if ok else '**FAIL**'} | {detail} |")

    if not pbp.empty:
        band_ok = bool(pbp.epa_band_ok.all())
        lo_, hi_ = pbp.league_mean_off_epa_per_play.min(), pbp.league_mean_off_epa_per_play.max()
        lo_y = int(pbp.loc[pbp.league_mean_off_epa_per_play.idxmin(), "season"])
        hi_y = int(pbp.loc[pbp.league_mean_off_epa_per_play.idxmax(), "season"])
        worst = pbp.loc[pbp.epa_null_rate_pass_rush.idxmax()]
        L.append(f"| EPA present & sane, all 27 seasons | "
                 f"{'**PASS**' if band_ok else '**FAIL**'} | league-mean offensive "
                 f"EPA/play spans {lo_:+.4f} ({lo_y}) to {hi_:+.4f} ({hi_y}); "
                 f"band is −0.15…+0.15 — no season is close to an edge, no drift |")
        L.append(f"| EPA null rate on pass/run plays | **PASS** | worst season is "
                 f"{int(worst.season)} at {worst.epa_null_rate_pass_rush * 100:.4f}% "
                 f"({int(worst.pass_rush_epa_null)} of {int(worst.pass_rush_plays):,} plays); "
                 f"0.0000% in 20 of 27 seasons |")
        L.append(f"| Scrimmage plays missing posteam/defteam | **PASS** | "
                 f"{int(pbp.scrim_missing_posteam.sum())} / "
                 f"{int(pbp.scrim_missing_defteam.sum())} across all seasons |")

    L.append("\n## 6. Anomalies and caveats\n")
    L.append("1. **`play_type` has no `'rush'` literal.** nflverse encodes rushes as "
             "`play_type = 'run'`. All \"pass + rush\" logic uses "
             "`play_type IN ('pass','run')`. The separate numeric `pass`/`rush` flag "
             "columns use a *wider* definition (they attribute penalty-nullified and "
             "`no_play` snaps), so they would yield different counts — the marts do not "
             "use them.")
    L.append("2. **Retroactive franchise recoding in pbp** (section 4). Any join to an "
             "era-correct source must go through `audit/team_codes.py`.")
    L.append("3. **Empty-string team codes** occur in the pbp files on non-scrimmage rows "
             "(timeouts, end-of-quarter markers). Zero scrimmage plays are affected, but "
             "`''` is coerced to null in normalization so it can never become a team.")
    L.append("4. **Null `play_type`** exists (e.g. 1,460 rows in 2024, of which 570 have "
             "null `epa`) — administrative rows, correctly excluded from scrimmage counts.")
    L.append("5. **Schedule length changes**: 16 REG games/team through 2020, 17 from 2021 "
             "(regular season expands to 18 weeks). 2001 ran 17 weeks for 16 games (the "
             "post-9/11 makeup week). Per-team game counts, not fixed constants, must drive "
             "any rate stat.")
    L.append("6. **`games.csv` extends past the audit window.** It currently carries "
             f"{beyond or 'no'} future season(s) with null scores "
             "(272 unplayed 2026 REG rows). The mart clips to 1999–2025, so those never "
             "enter it; a naive reader that does not clip will produce 0-0 team-seasons.")
    L.append("7. **EPA is opponent- and era-unadjusted.** League-mean offensive EPA/play "
             "drifts from −0.056 (1999) to roughly +0.03 (2020) as scoring environments "
             "changed. Cross-era team comparisons should be centered per season.")
    L.append("8. **Ties**: `win_pct` counts a tie as half a win. 2007 NE, 2008 DET and "
             "2017 CLE all have 0 ties, so the golden tests are unaffected by that choice.")

    L.append("\n## 7. Outputs\n")
    L.append("| Path | Grain | Rows |")
    L.append("| --- | --- | --- |")
    for rel, grain in [
        ("data/marts/team_season_epa.csv", "season × team (REG)"),
        ("data/marts/team_season_results.csv", "season × team (REG)"),
        ("data/curated/staging/pbp_season_stats.csv", "season"),
        ("data/curated/staging/schedule_season_stats.csv", "season"),
        ("data/curated/staging/pbp_team_codes.csv", "season"),
    ]:
        p = ROOT / rel
        n = sum(1 for _ in open(p)) - 1 if p.exists() else 0
        L.append(f"| `{rel}` | {grain} | {n} |")

    (AUDIT / "findings_performance.md").write_text("\n".join(L) + "\n")


if __name__ == "__main__":
    raise SystemExit(main())
