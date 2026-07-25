#!/usr/bin/env python3.11
"""Build the two curated dead-money assets from transcribed press sources.

Outputs (fully overwritten every run -- the script is idempotent):
  data/curated/dead_money_ledger.csv       marquee individual charges
  data/curated/dead_money_team_season.csv  per-team-season dated snapshots

DESIGN RULES (see audit/findings_deadmoney_sourcing.md):
  * Dead money accrues monotonically through a league year. A (team, season) key
    without an as-of date is a bug. Differently-dated figures for the same
    team-season are kept as SEPARATE ROWS and never merged or averaged.
  * Every row carries its own source_url. Licensing tier is documented in
    Appendix A of the findings file (CSV cannot carry a header comment row).
  * Team codes are normalized through audit/team_codes.py (LA / LAC / LV).
  * Multi-season charges carry BOTH a total and an explicit per-season split.
    A total-level checksum is not sufficient validation -- four of the five
    known projected-vs-actual landmines have correct totals and wrong splits.

Usage:
  python3.11 audit/build_deadmoney_curated.py
"""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from team_codes import normalize_team  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CURATED = ROOT / "data" / "curated"

# Full/short team names as printed by each outlet -> raw code, then normalize_team().
NAME_TO_CODE = {
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

# ---------------------------------------------------------------- source URLs
U_PFR22 = "https://www.profootballrumors.com/2022/07/nfl-teams-with-most-dead-cap"
U_PFR23 = "https://www.profootballrumors.com/2023/07/2023-nfl-dead-money-by-team"
U_PFR24 = "https://www.profootballrumors.com/2024/11/2024-nfl-dead-money-by-team"
U_PFR25 = "https://www.profootballrumors.com/2025/12/2025-nfl-dead-money-by-team"
U_ESPN_LEDGER = ("https://www.espn.com/nfl/story/_/id/39665413/"
                 "what-dead-money-largest-nfl-salary-cap-hits-ever-player-team")
U_ESPN14 = ("https://web.archive.org/web/20140220id_/http://espn.go.com/blog/nflnation/"
            "post/_/id/117248/inside-slant-dead-money-totals")
U_ESPN15 = ("https://www.espn.com/nfl/story/_/id/13957641/"
            "dead-money-how-new-orleans-saints-salary-cap-woes-affect-drew-brees-future")
U_USAT17 = ("https://ftw.usatoday.com/story/sports/nfl/2017/07/05/"
            "nfl-salary-cap-dead-money-leaders-definition-ravens/81897409007/")
U_SCORE18JUL = "https://www.thescore.com/nfl/news/1571301"
U_SCORE18MAR = "https://www.thescore.com/nfl/news/1501210"
U_CBS18OCT = ("https://www.cbssports.com/nfl/news/"
              "agents-take-heres-the-three-nfl-teams-wasting-the-most-salary-cap-resources/")
U_SCORE19 = "https://www.thescore.com/nfl/news/1723008/updated-salary-cap-space-for-all-32-teams"
U_FORBES19 = ("https://www.forbes.com/sites/billhuber/2019/05/16/"
              "dead-cap-money-puts-teams-behind-franchise-building-eight-ball/")
U_NBC20 = ("https://www.nbcsportsboston.com/boston/patriots/"
           "could-patriots-ranking-among-dead-money-leaders-cost-team-2020")
U_NBC21 = ("https://www.nbcsportsphiladelphia.com/nfl/philadelphia-eagles/"
           "how-the-eagles-wound-up-with-50-million-in-dead-money/189838/")
U_CORRY13 = "https://sports.yahoo.com/dead-money-leaders-183000069--nfl.html"
U_COMEBACK16 = ("https://thecomeback.com/nfl/"
                "examining-dead-money-and-injured-reserve-spending-at-nfls-quarter-season-mark.html")
U_CORRY25 = ("https://www.cbssports.com/nfl/news/"
             "agents-take-biggest-individual-dead-money-charges-in-2025-"
             "including-daniel-jones-still-costing-the-giants/")


# ============================================================ TEAM-SEASON DATA
# Each block: (season, asof_date, asof_stage, coverage, source_url, {team: usd})
# Figures are transcribed EXACTLY as published. Where an outlet printed rounded
# millions ("$75.32MM") the value is that rounded figure scaled to USD -- it is
# not spuriously precise, and the asof_date makes the snapshot identifiable.

PFR_2022 = {  # exact dollars as published; PFR credits Spotrac
    "Atlanta Falcons": 63209124, "Chicago Bears": 57643341, "Philadelphia Eagles": 54915221,
    "Houston Texans": 52289341, "Seattle Seahawks": 46022390, "New Orleans Saints": 33347982,
    "Pittsburgh Steelers": 30863174, "Las Vegas Raiders": 29441565, "New York Giants": 29262372,
    "Green Bay Packers": 24628608, "Carolina Panthers": 23507283, "Dallas Cowboys": 22713132,
    "Minnesota Vikings": 22092189, "Jacksonville Jaguars": 21852872, "Detroit Lions": 20324288,
    "Tampa Bay Buccaneers": 19445910, "Cleveland Browns": 18774054, "Buffalo Bills": 16601356,
    "Denver Broncos": 14938136, "Tennessee Titans": 14290108, "Los Angeles Rams": 13522002,
    "Baltimore Ravens": 12292703, "Arizona Cardinals": 10278530, "Cincinnati Bengals": 9592578,
    "New England Patriots": 9158009, "Miami Dolphins": 8483400, "Kansas City Chiefs": 7982236,
    "Indianapolis Colts": 7037428, "San Francisco 49ers": 6495221,
    "Washington Commanders": 6300496, "Los Angeles Chargers": 3661167, "New York Jets": 2092411,
}

PFR_2023 = {  # published in rounded $MM
    "Tampa Bay Buccaneers": 75.32, "Los Angeles Rams": 74.23, "Green Bay Packers": 57.14,
    "Philadelphia Eagles": 54.73, "Carolina Panthers": 51.54, "Arizona Cardinals": 36.96,
    "Tennessee Titans": 36.56, "Minnesota Vikings": 35.54, "Houston Texans": 31.72,
    "Las Vegas Raiders": 29.95, "Indianapolis Colts": 24.89, "New Orleans Saints": 24.58,
    "Chicago Bears": 23.52, "Washington Commanders": 23.01, "New York Giants": 22.74,
    "New England Patriots": 21.82, "Atlanta Falcons": 18.78, "Detroit Lions": 18.69,
    "Seattle Seahawks": 17.91, "San Francisco 49ers": 17.16, "Cleveland Browns": 16.0,
    "Dallas Cowboys": 14.64, "Pittsburgh Steelers": 13.26, "Baltimore Ravens": 10.78,
    "Denver Broncos": 9.72, "Miami Dolphins": 8.43, "New York Jets": 7.95,
    "Kansas City Chiefs": 7.65, "Buffalo Bills": 5.23, "Jacksonville Jaguars": 4.7,
    "Los Angeles Chargers": 2.19, "Cincinnati Bengals": 0.593,
}

PFR_2024 = {
    "Denver Broncos": 85.21, "New York Giants": 79.57, "Minnesota Vikings": 69.83,
    "Buffalo Bills": 68.47, "Carolina Panthers": 68.28, "Green Bay Packers": 65.53,
    "Tennessee Titans": 62.89, "Philadelphia Eagles": 61.95, "Tampa Bay Buccaneers": 60.64,
    "New Orleans Saints": 59.44, "New York Jets": 59.24, "Los Angeles Chargers": 58.62,
    "New England Patriots": 53.37, "Miami Dolphins": 52.28, "Seattle Seahawks": 52.0,
    "Jacksonville Jaguars": 51.2, "Las Vegas Raiders": 49.37, "Washington Commanders": 42.81,
    "Houston Texans": 39.28, "Cleveland Browns": 38.79, "Los Angeles Rams": 34.63,
    "Detroit Lions": 33.71, "Pittsburgh Steelers": 30.18, "Chicago Bears": 29.65,
    "Arizona Cardinals": 29.35, "San Francisco 49ers": 26.91, "Dallas Cowboys": 26.79,
    "Baltimore Ravens": 21.35, "Kansas City Chiefs": 12.65, "Indianapolis Colts": 11.8,
    "Atlanta Falcons": 11.55, "Cincinnati Bengals": 9.11,
}

PFR_2025 = {
    "New Orleans Saints": 107.83, "San Francisco 49ers": 103.77, "New York Jets": 102.1,
    "Las Vegas Raiders": 87.79, "Philadelphia Eagles": 87.27, "Seattle Seahawks": 86.1,
    "Jacksonville Jaguars": 85.49, "Cleveland Browns": 83.22, "Miami Dolphins": 72.45,
    "Houston Texans": 66.44, "Tennessee Titans": 59.42, "Green Bay Packers": 57.98,
    "Los Angeles Rams": 56.23, "New England Patriots": 50.56, "Denver Broncos": 42.78,
    "Dallas Cowboys": 41.34, "Detroit Lions": 40.71, "Tampa Bay Buccaneers": 40.39,
    "Los Angeles Chargers": 38.78, "Baltimore Ravens": 38.38, "Buffalo Bills": 37.58,
    "Carolina Panthers": 36.55, "New York Giants": 33.74, "Pittsburgh Steelers": 33.7,
    "Minnesota Vikings": 30.6, "Washington Commanders": 27.29, "Atlanta Falcons": 27.0,
    "Cincinnati Bengals": 20.99, "Kansas City Chiefs": 20.33, "Indianapolis Colts": 17.37,
    "Arizona Cardinals": 16.51, "Chicago Bears": 8.6,
}

# ESPN Inside Slant (Kevin Seifert), 2014-02-18, via Roster Management System.
# Exact dollars. Sum checksum = $161,159,908 (verified at transcription time).
ESPN_2014 = {
    "Carolina Panthers": 17840241, "Buffalo Bills": 12070113, "Dallas Cowboys": 11809439,
    "New Orleans Saints": 10450051, "Arizona Cardinals": 10087468, "Oakland Raiders": 9311192,
    "San Diego Chargers": 8674983, "New England Patriots": 8533721,
    "Washington Redskins": 7470233, "Cleveland Browns": 7194157, "Atlanta Falcons": 5922507,
    "Jacksonville Jaguars": 5600511, "Miami Dolphins": 4942896, "Pittsburgh Steelers": 4552933,
    "Baltimore Ravens": 4422216, "Detroit Lions": 4069438, "Denver Broncos": 3992330,
    "Kansas City Chiefs": 3505823, "Houston Texans": 3247174, "New York Giants": 2778141,
    "Green Bay Packers": 2677484, "Tennessee Titans": 2449725, "San Francisco 49ers": 1934689,
    "Minnesota Vikings": 1783163, "Chicago Bears": 1476671, "Philadelphia Eagles": 1348343,
    "Cincinnati Bengals": 984283, "Seattle Seahawks": 907367, "Indianapolis Colts": 800734,
    "Tampa Bay Buccaneers": 139119, "St. Louis Rams": 133805, "New York Jets": 48958,
}

# ESPN Stats & Information, 2015-10-28 (through Week 7). Exact dollars.
# Sum checksum = $471,327,913; article states league average $14.7M.
ESPN_2015 = {
    "New Orleans": 32482518, "Miami": 25636044, "Chicago": 25573238, "Tampa Bay": 23601993,
    "Baltimore": 23351218, "San Francisco": 23223258, "Kansas City": 21901376,
    "Detroit": 19363607, "New England": 19294985, "Pittsburgh": 17101608, "Dallas": 16513691,
    "Philadelphia": 16381613, "Oakland": 16310434, "Tennessee": 15499225, "Atlanta": 14571570,
    "Carolina": 14532757, "Seattle": 13986301, "Houston": 13949305, "Arizona": 12792586,
    "N.Y. Giants": 12763133, "Buffalo": 11793665, "Washington": 11333421, "St. Louis": 11113036,
    "San Diego": 10439227, "Indianapolis": 10010298, "Minnesota": 8446161, "Cleveland": 6934915,
    "NY Jets": 5734579, "Jacksonville": 5362098, "Green Bay": 4995375, "Denver": 3935731,
    "Cincinnati": 2398947,
}

# USA TODAY For The Win (Steven Ruiz), 2017-07-05. Published rounded; sum ~$236.0M.
# NOTE: the Giants entry is printed without a dollar sign in the source ("24. Giants: 3.09M").
USAT_2017 = {
    "Chargers": 21.84, "Ravens": 18.87, "Jets": 17.32, "Saints": 16.25, "Cowboys": 16.25,
    "Eagles": 14.0, "49ers": 13.43, "Browns": 11.47, "Redskins": 9.78, "Texans": 9.44,
    "Colts": 8.62, "Chiefs": 8.59, "Dolphins": 8.2, "Bills": 7.92, "Steelers": 6.36,
    "Rams": 5.71, "Titans": 4.83, "Falcons": 4.57, "Vikings": 4.47, "Jaguars": 4.39,
    "Packers": 4.27, "Lions": 3.94, "Bears": 3.8, "Giants": 3.09, "Cardinals": 2.94,
    "Panthers": 1.98, "Patriots": 1.55, "Buccaneers": 0.865, "Seahawks": 0.827,
    "Bengals": 0.333, "Broncos": 0.072, "Raiders": 0.055,
}

# theScore (Jack Browne), 2018-07-14. Credits Over the Cap. Sum ~$348.5M.
SCORE_2018_JUL = {
    "Cleveland Browns": 17.23, "Indianapolis Colts": 1.95, "San Francisco 49ers": 16.16,
    "Tennessee Titans": 3.05, "Houston Texans": 5.05, "Chicago Bears": 11.97,
    "New York Jets": 14.86, "Jacksonville Jaguars": 4.11, "Buffalo Bills": 46.71,
    "Dallas Cowboys": 26.36, "Cincinnati Bengals": 1.30, "Tampa Bay Buccaneers": 0.81551,
    "Minnesota Vikings": 2.99, "Miami Dolphins": 15.00, "Arizona Cardinals": 20.33,
    "Washington Redskins": 5.29, "Green Bay Packers": 8.04, "New England Patriots": 4.02,
    "Seattle Seahawks": 14.42, "Denver Broncos": 2.48, "Baltimore Ravens": 9.12,
    "Detroit Lions": 8.18, "Los Angeles Chargers": 8.84, "Kansas City Chiefs": 16.75,
    "New York Giants": 21.12, "Atlanta Falcons": 5.89, "Philadelphia Eagles": 9.58,
    "Carolina Panthers": 8.79, "Pittsburgh Steelers": 5.82, "New Orleans Saints": 16.08,
    "Oakland Raiders": 3.79, "Los Angeles Rams": 12.37,
}

# theScore, 2018-03. Credits "NFL Players Association and Over The Cap". Sum ~$155.2M.
SCORE_2018_MAR = {
    "Cleveland Browns": 10.3, "New York Jets": 13.9, "Indianapolis Colts": 1.8,
    "Tampa Bay Buccaneers": 0.815, "San Francisco 49ers": 15.1, "Houston Texans": 1.7,
    "Minnesota Vikings": 0.655, "Washington Redskins": 0.503, "Tennessee Titans": 0.551,
    "Chicago Bears": 4.5, "Cincinnati Bengals": 0.623, "New Orleans Saints": 13.0,
    "Jacksonville Jaguars": 3.9, "Los Angeles Rams": 0.432, "Detroit Lions": 6.4,
    "Denver Broncos": 1.4, "New York Giants": 0.478, "Carolina Panthers": 6.4,
    "Buffalo Bills": 18.7, "Los Angeles Chargers": 4.7, "Arizona Cardinals": 7.3,
    "Green Bay Packers": 4.7, "Seattle Seahawks": 4.0, "Oakland Raiders": 2.0,
    "New England Patriots": 1.6, "Atlanta Falcons": 4.9, "Baltimore Ravens": 2.3,
    "Dallas Cowboys": 14.8, "Pittsburgh Steelers": 0.956, "Miami Dolphins": 0.277,
    "Philadelphia Eagles": 0.737, "Kansas City Chiefs": 5.8,
}

# CBS Sports (Joel Corry), 2018-10-10. Three teams only.
CBS_2018_OCT = {"Buffalo Bills": 53.66, "New York Giants": 30.735, "Dallas Cowboys": 28.24}

# theScore, 2019-03-10. Credits Over the Cap. PREDATES THE LEAGUE YEAR.
SCORE_2019 = {
    "Indianapolis Colts": 1.23, "New York Jets": 2.70, "Cleveland Browns": 7.44,
    "Buffalo Bills": 7.56, "Houston Texans": 1.77, "San Francisco 49ers": 11.54,
    "Oakland Raiders": 1.50, "Cincinnati Bengals": 2.17, "Tennessee Titans": 1.15,
    "Arizona Cardinals": 16.39, "Detroit Lions": 4.50, "Denver Broncos": 10.38,
    "Los Angeles Rams": 3.85, "Green Bay Packers": 0.566, "Seattle Seahawks": 2.48,
    "Jacksonville Jaguars": 7.65, "Philadelphia Eagles": 10.86, "New England Patriots": 0.706,
    "New York Giants": 9.66, "Miami Dolphins": 15.99, "Los Angeles Chargers": 3.26,
    "Dallas Cowboys": 4.27, "Baltimore Ravens": 7.72, "Chicago Bears": 0.920,
    "Carolina Panthers": 3.52, "Washington Redskins": 1.94, "Pittsburgh Steelers": 0.251,
    "New Orleans Saints": 9.92, "Kansas City Chiefs": 0.898, "Atlanta Falcons": 4.83,
    "Minnesota Vikings": 0.433, "Tampa Bay Buccaneers": 0.094,
}

# Forbes (Bill Huber), 2019-05-16. Credits OverTheCap.com. Top-8 + bottom-6.
FORBES_2019 = {
    "Miami Dolphins": 37.5, "New York Giants": 33.7, "Arizona Cardinals": 30.2,
    "Pittsburgh Steelers": 26.6, "Jacksonville Jaguars": 24.3, "Baltimore Ravens": 23.7,
    "Denver Broncos": 21.4, "Cleveland Browns": 20.2,
    "Chicago Bears": 0.992092, "Tampa Bay Buccaneers": 1.1, "Indianapolis Colts": 1.4,
    "Houston Texans": 1.8, "Minnesota Vikings": 2.2, "Los Angeles Rams": 3.9,
}

NBC_2020 = {  # top-5, post-June-1
    "Carolina Panthers": 48.0, "Jacksonville Jaguars": 37.0, "Los Angeles Rams": 34.0,
    "New England Patriots": 24.0, "Miami Dolphins": 22.0,
}

NBC_2021_TOP = {  # exact dollars, after final cuts
    "Philadelphia Eagles": 50041688, "Detroit Lions": 48051675, "Carolina Panthers": 45634297,
    "Los Angeles Rams": 39473971, "New Orleans Saints": 35755096,
}
NBC_2021_BOTTOM = {
    "Indianapolis Colts": 596187, "Los Angeles Chargers": 2250012,
    "Tampa Bay Buccaneers": 2380126, "Cleveland Browns": 3240871, "Baltimore Ravens": 4290900,
}

CORRY_2013 = {  # top-5, exact dollars
    "Oakland Raiders": 55465877, "Jacksonville Jaguars": 34104489, "New York Jets": 20348980,
    "Arizona Cardinals": 18652564, "Kansas City Chiefs": 17515375,
}

COMEBACK_2016 = {  # top-4 + bottom-4, exact dollars, quarter-season mark
    "New Orleans Saints": 37885635, "Cleveland Browns": 31114222, "Philadelphia Eagles": 22495981,
    "Atlanta Falcons": 21437553,
    "Cincinnati Bengals": 674415, "Dallas Cowboys": 1171852, "Tampa Bay Buccaneers": 1484360,
    "Green Bay Packers": 1725917,
}

# ESPN via Roster Management System, 2024-03-06: the five largest team-seasons ever.
ESPN_FINALS = [
    (2022, "Chicago Bears", 91_800_000, "Largest single-season team dead money ever as of Mar 2024. Biggest charge: Khalil Mack $24M."),
    (2022, "Atlanta Falcons", 87_600_000, "Biggest charge: Matt Ryan $40.5M."),
    (2022, "Houston Texans", 81_300_000, "Biggest charge: Deshaun Watson $16.2M."),
    (2023, "Los Angeles Rams", 79_600_000, "Biggest charge: Allen Robinson II $21.4M."),
    (2023, "Tampa Bay Buccaneers", 79_600_000, "Biggest charge: Tom Brady $35.1M."),
]


def code(name: str) -> str:
    raw = NAME_TO_CODE.get(name)
    if raw is None:
        raise KeyError(f"unmapped team name: {name!r}")
    return normalize_team(raw)


def block(season, asof, stage, coverage, url, mapping, scale, note):
    """Emit one dated snapshot block. `scale` is 1 for USD, 1e6 for $MM figures."""
    rows = []
    for name, val in mapping.items():
        rows.append({
            "season": season,
            "team": code(name),
            "dead_money_usd": int(round(val * scale)),
            "asof_date": asof,
            "asof_stage": stage,
            "coverage": coverage,
            "source_url": url,
            "note": note,
        })
    return rows


def build_team_season() -> pd.DataFrame:
    r = []
    r += block(2013, "2013-12-06", "late_season", "top5", U_CORRY13, CORRY_2013, 1,
               "Corry/National Football Post top-5, syndicated by Yahoo. Raiders figure is 43.6% of their $127,187,041 adjusted cap.")
    r += block(2014, "2014-02-18", "preseason", "full32", U_ESPN14, ESPN_2014, 1,
               "ESPN Inside Slant (Seifert) via Roster Management System. Pre-league-year: understates the final figure. Table survives only at the Wayback id_ raw capture. Sum checksum $161,159,908 exact.")
    r += block(2015, "2015-10-28", "midseason", "full32", U_ESPN15, ESPN_2015, 1,
               "ESPN Stats & Information, through Week 7. Sum checksum $471,327,913 exact; article states league average $14.7M -- the only citable league-wide figure 2013-2025.")
    r += block(2016, "2016-10-05", "midseason", "partial", U_COMEBACK16, COMEBACK_2016, 1,
               "The Comeback (Hangst), quarter-season mark. Top-4 and bottom-4 only.")
    r += block(2017, "2017-07-05", "preseason", "full32", U_USAT17, USAT_2017, 1e6,
               "USA TODAY For The Win (Ruiz). Published as rounded $MM. CBS mirror of the same day credits Spotrac. Sum ~$236.0M.")
    r += block(2018, "2018-03-01", "preseason", "full32", U_SCORE18MAR, SCORE_2018_MAR, 1e6,
               "theScore, March 2018 snapshot; credits NFLPA and Over The Cap. Sum ~$155.2M. Day-of-month not stated by the source; set to 01 as a month-precision placeholder.")
    r += block(2018, "2018-07-14", "preseason", "full32", U_SCORE18JUL, SCORE_2018_JUL, 1e6,
               "theScore (Browne), datePublished 2018-07-14; credits Over the Cap. Sum ~$348.5M -- 2.2x the March snapshot of the same season.")
    r += block(2018, "2018-10-10", "midseason", "partial", U_CBS18OCT, CBS_2018_OCT, 1e6,
               "CBS Sports (Corry), Week 6. Three teams only. Buffalo reads $18.7M (Mar) -> $46.71M (Jul) -> $53.66M (Oct).")
    r += block(2019, "2019-03-10", "preseason", "full32", U_SCORE19, SCORE_2019, 1e6,
               "theScore; credits Over the Cap. CAVEAT: PREDATES THE LEAGUE YEAR -- severe understatement of the final figure. Compare the 2019-05-16 Forbes rows.")
    r += block(2019, "2019-05-16", "preseason", "partial", U_FORBES19, FORBES_2019, 1e6,
               "Forbes (Huber); credits OverTheCap.com. Top-8 + bottom-6. Better-timed than the March full-32 rows.")
    r += block(2020, "2020-06-02", "preseason", "top5", U_NBC20, NBC_2020, 1e6,
               "NBC Sports Boston, post-June-1. Top-5 only; cites Spotrac.")
    r += block(2021, "2021-09-06", "preseason", "top5", U_NBC21, NBC_2021_TOP, 1,
               "NBC Sports Philadelphia, after final cuts. Top-5.")
    r += block(2021, "2021-09-06", "preseason", "partial", U_NBC21, NBC_2021_BOTTOM, 1,
               "NBC Sports Philadelphia, after final cuts. Bottom-5.")
    r += block(2022, "2022-07-05", "preseason", "full32", U_PFR22, PFR_2022, 1,
               "ProFootballRumors; credits Spotrac. Preseason: CHI reads $57.6M here vs $91.8M final (+59%).")
    r += block(2023, "2023-07-14", "preseason", "full32", U_PFR23, PFR_2023, 1e6,
               "ProFootballRumors, training camp. Published as rounded $MM.")
    r += block(2024, "2024-11-27", "late_season", "full32", U_PFR24, PFR_2024, 1e6,
               "ProFootballRumors; credits OverTheCap. Taken in the final third of the season.")
    r += block(2025, "2025-12-17", "late_season", "full32", U_PFR25, PFR_2025, 1e6,
               "ProFootballRumors; credits OverTheCap. Three weeks left in the regular season.")
    for season, name, usd, note in ESPN_FINALS:
        r.append({
            "season": season, "team": code(name), "dead_money_usd": usd,
            "asof_date": "2024-03-06", "asof_stage": "final", "coverage": "partial",
            "source_url": U_ESPN_LEDGER,
            "note": "ESPN via Roster Management System -- season-final value, five largest team-seasons ever. " + note,
        })
    df = pd.DataFrame(r)
    return df.sort_values(["season", "asof_date", "team"]).reset_index(drop=True)


# ================================================================= LEDGER DATA
# (player, team, seasons, total_usd, split, is_actual, verified_asof, url, notes)
LEDGER = [
    ("Tua Tagovailoa", "MIA", "2026-2027", 99_200_000, "55400000/43800000", "TRUE", "2026-07-25",
     "https://www.nbcsports.com/nfl/profootballtalk/rumor-mill/news/dolphins-officially-release-tua-tagovailoa-with-post-june-1-designation",
     "LANDMINE 1 of 5. Largest dead money charge in NFL history. Released with a post-June-1 designation. Miami EXERCISED the 2026 option bonus before the release, cutting the 2026 charge from the widely-published ~$67.4M to $55.4M, with $43.8M in 2027. The widely-published $67.4M/$31.8M split is WRONG; PFR Jul 2026 carries that initial figure. Total is correct in both versions."),
    ("Russell Wilson", "DEN", "2024-2025", 85_000_000, "53000000/32000000", "TRUE", "2026-07-25",
     U_CORRY25,
     "LANDMINE 2 of 5. Widely-published $35.4M/$49.6M is WRONG -- that is the projection, and ESPN's own RMS table carries it, asterisked '*Wilson's cap charges will become official at the start of the league year'. Denver DECLINED the $22M option bonus, making the actual split $53M/$32M. Corry (CBS, 2025-12-03) lists the settled 2025 figure at $32,000,000. Total is right in both versions."),
    ("Daniel Jones", "NYG", "2024-2025", 69_315_000, "47105000/22210000", "TRUE", "2026-07-25",
     U_CORRY25,
     "Second-highest individual-contract dead money ever. Released at his own request after being benched midseason 2024. Corry (CBS, 2025-12-03) confirms the $22,210,000 2025 charge and the $69.315M two-year total."),
    ("Kyler Murray", "ARI", "2026-2027", 54_700_000, "47500000/7200000", "TRUE", "2026-07-25",
     "https://sports.yahoo.com/articles/kyler-murray-released-arizona-cardinals-170241432.html",
     "LANDMINE 4 of 5 -- FOUND AT BUILD TIME; the sourcing findings recorded this as $54.7M all in 2026. $54.7M was the figure for a STRAIGHT pre-June-1 release. Arizona actually released Murray WITH a post-June-1 designation, splitting the charge $47.5M (2026) / $7.2M (2027). Total correct, single-season assignment wrong."),
    ("Matt Ryan", "ATL", "2022", 40_525_000, "40525000", "TRUE", "2026-07-25", U_ESPN_LEDGER,
     "Traded to the Colts. ESPN/RMS rank 2 ($40.5M rounded). Largest single charge inside ATL's $87.6M 2022 team total."),
    ("Aaron Rodgers", "GB", "2023", 40_300_000, "40300000", "TRUE", "2026-07-25", U_ESPN_LEDGER,
     "Traded to the Jets. ESPN/RMS rank 3."),
    ("Tom Brady", "TB", "2023", 35_104_000, "35104000", "TRUE", "2026-07-25", U_ESPN_LEDGER,
     "LANDMINE 5 of 5 -- FOUND AT BUILD TIME; the sourcing findings recorded a 2023-24 split of ~$10.78M/~$24.32M. That two-year split was a CONDITIONAL scenario contingent on Brady signing a nominal extension. He did not; his second retirement accelerated the ENTIRE charge onto the 2023 cap. ESPN/RMS lists it as a single 2023 charge (rank 5, $35.1M) and the same article's team-season list gives TB 2023 $79.6M with Brady $35.1M as the biggest charge. Total correct, split wrong."),
    ("Deebo Samuel", "SF", "2025", 34_106_705, "34106705", "TRUE", "2026-07-25", U_CORRY25,
     "Exact to the dollar per Corry (CBS, 2025-12-03). Largest single charge inside SF's $103.77M 2025 team total."),
    ("Carson Wentz", "PHI", "2021", 33_820_000, "33820000", "TRUE", "2026-07-25", U_ESPN_LEDGER,
     "Traded to the Colts. ESPN/RMS rank 6 ($33.8M rounded)."),
    ("Marshon Lattimore", "NO", "2025", 31_661_837, "31661837", "TRUE", "2026-07-25", U_CORRY25,
     "Exact to the dollar per Corry (CBS, 2025-12-03)."),
    ("Stefon Diggs", "BUF", "2024", 31_096_000, "31096000", "TRUE", "2026-07-25",
     "https://www.espn.com/nfl/story/_/id/39866669/stefon-diggs-trade-mean-buffalo-bills-houston-texans",
     "Traded to the Texans. Highest-known dead money charge for a wide receiver in any season."),
    ("Leonard Williams", "NYG", "2023", 26_900_000, "26900000", "TRUE", "2026-07-25", U_ESPN_LEDGER,
     "Traded to the Seahawks. ESPN/RMS rank 7."),
    ("Russell Wilson", "SEA", "2022", 26_000_000, "26000000", "TRUE", "2026-07-25", U_ESPN_LEDGER,
     "Traded to the Broncos. ESPN/RMS rank 8. Wilson appears in the ESPN top-20 three times."),
    ("Jared Goff", "LA", "2021", 24_700_000, "24700000", "TRUE", "2026-07-25", U_ESPN_LEDGER,
     "Traded to the Lions. ESPN/RMS rank 9. Team code normalized LAR -> LA per audit/team_codes.py."),
    ("Khalil Mack", "CHI", "2022", 24_000_000, "24000000", "TRUE", "2026-07-25", U_ESPN_LEDGER,
     "Traded to the Chargers. ESPN/RMS rank 10. Largest single charge inside CHI's record $91.8M 2022 team total."),
    ("Marcell Dareus", "BUF", "2017-2018", 23_940_000, "", "TRUE", "2026-07-25",
     "https://www.espn.com/nfl/story/_/id/21187661/marcell-dareus-buffalo-bills-heading-jacksonville-jaguars-trade",
     "REDUCED CONFIDENCE ON SPLIT. Traded to the Jaguars Oct 2017. Total retained from the sourcing findings, but the per-season split could NOT be corroborated and press accounts conflict (one ESPN account: ~$23.5M in 2017 plus ~$14.2M in 2018; another: $10.6M 2017 + $14.2M 2018 = $24.8M). split_by_season deliberately left EMPTY rather than guessed. Pre-2019 era anchor."),
    ("Aaron Donald", "LA", "2024", 23_830_000, "23830000", "TRUE", "2026-07-25",
     "https://www.profootballrumors.com/2024/03/rams-dt-aaron-donald-announces-retirement",
     "REDUCED PRECISION. Retired 2024-03-15, nine days AFTER the ESPN/RMS article published, so he is absent from that table. Press corroboration is approximate ('roughly $24 million in 2024'). Void-year proration leaves an additional ~$9M 2025 tail that this single-season figure excludes."),
    ("Julio Jones", "ATL", "2021-2022", 23_250_000, "7750000/15500000", "TRUE", "2026-07-25",
     "https://www.si.com/nfl/2021/05/31/monday-afternoon-quarterback-june-1-julio-jones",
     "LANDMINE 3 of 5. Widely published as $23.25M all in 2021 -- that is the PRE-June-1 figure. The trade to Tennessee was executed AFTER June 1, splitting the charge $7.75M (2021) / $15.5M (2022). Total is correct, BOTH per-season values in the common version are wrong, and a total-level checksum passes anyway."),
    ("Drew Brees", "NO", "2021-2022", 22_650_000, "11150000/11500000", "TRUE", "2026-07-25",
     "https://www.profootballnetwork.com/drew-brees-contract-details-salary-bonuses/",
     "Retirement processed after June 1 (salary first reduced to the veteran minimum to allow the timing), splitting the charge. Split recovered from press rather than RMS; $11.15M + $11.5M sums exactly to the $22.65M total."),
    ("Ndamukong Suh", "MIA", "2018-2019", 22_200_000, "9100000/13100000", "TRUE", "2026-07-25",
     "https://www.nfl.com/news/miami-dolphins-likely-to-release-dt-ndamukong-suh-0ap3000000920619",
     "Released with a post-June-1 designation, saving $17M of 2018 cap. Split recovered from press rather than RMS; $9.1M + $13.1M sums exactly to the $22.2M total. Pre-2019 era anchor."),
    ("Antonio Brown", "PIT", "2019", 21_120_000, "21120000", "TRUE", "2026-07-25", U_ESPN_LEDGER,
     "ERA ANCHOR. Traded to the Raiders. ESPN/RMS rank 15 ($21.1M rounded). ESPN states all top-20 charges post-date this one -- it is the start of the modern dead-money era."),
]


def build_ledger() -> pd.DataFrame:
    df = pd.DataFrame(LEDGER, columns=[
        "player", "team", "seasons", "total_usd", "split_by_season",
        "is_actual", "verified_asof", "source_url", "notes"])
    df["team"] = df["team"].map(normalize_team)
    return df.sort_values("total_usd", ascending=False).reset_index(drop=True)


def main() -> int:
    CURATED.mkdir(parents=True, exist_ok=True)

    led = build_ledger()
    led.to_csv(CURATED / "dead_money_ledger.csv", index=False)
    print(f"wrote data/curated/dead_money_ledger.csv  ({len(led)} rows)")

    ts = build_team_season()
    ts.to_csv(CURATED / "dead_money_team_season.csv", index=False)
    print(f"wrote data/curated/dead_money_team_season.csv  ({len(ts)} rows)")

    # ------------------------------------------------------------- checks
    print("\n== checks ==")
    bad = sorted(set(ts["team"]) - set(pd.read_csv(ROOT / "data" / "marts" /
                                                   "team_season_results.csv")["team"]))
    print(f"  team codes join to team_season_results : {'PASS' if not bad else 'FAIL ' + str(bad)}")

    dup = ts.duplicated(subset=["season", "team", "asof_date", "source_url"]).sum()
    print(f"  no dup (season,team,asof,source) rows  : {'PASS' if dup == 0 else f'FAIL ({dup})'}")

    full = ts[ts["coverage"] == "full32"].groupby(["season", "asof_date"]).size()
    okfull = (full == 32).all()
    print(f"  every full32 block has exactly 32 teams: {'PASS' if okfull else 'FAIL'}")
    for (s, a), n in full.items():
        print(f"      {s} @ {a}: {n}")

    # Split checksum: split components must sum to total_usd where a split is given.
    prob = []
    for r in led.itertuples():
        if not r.split_by_season:
            continue
        tot = sum(int(x) for x in r.split_by_season.split("/"))
        if tot != r.total_usd:
            prob.append((r.player, tot, r.total_usd))
    print(f"  ledger split sums == total_usd         : {'PASS' if not prob else 'FAIL ' + str(prob)}")

    nsplit = (led["split_by_season"] == "").sum()
    print(f"  ledger rows with no split (flagged)    : {nsplit}")

    stages = sorted(ts["asof_stage"].unique())
    print(f"  asof_stage vocabulary                  : {stages}")
    seasons = sorted(ts['season'].unique())
    print(f"  seasons covered                        : {seasons[0]}-{seasons[-1]} ({len(seasons)} seasons)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
