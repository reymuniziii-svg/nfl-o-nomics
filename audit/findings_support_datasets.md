
==============================================================================
1. DRAFT PICKS -- draft_picks.parquet
==============================================================================
span: 1980-2026  distinct_seasons=47  rows=12,927
required window 2000-2025: COMPLETE
picks/yr min=246 max=262 mean=255.5; rounds always [np.int64(7)]
gsis_id coverage over window: 0.9571 (worst year 2005 @ 0.859, best 1.000)

field coverage 2000-2025 (n=12,927 rows in file):
                  coverage
field                     
car_av            0.000000
def_ints          0.210867
def_sacks         0.287628
def_solo_tackles  0.636665
cfb_player_id     0.841210
dr_av             0.850542
pass_ints         0.911800
rush_atts         0.911951
w_av              0.911951
pass_yards        0.911951
pass_attempts     0.911951
pass_completions  0.911951
games             0.911951
to                0.911951
rec_yards         0.911951
receptions        0.911951
rec_tds           0.911951
pass_tds          0.911951
rush_tds          0.911951
rush_yards        0.911951
gsis_id           0.957104
age               0.960265
pfr_player_id     0.961469
side              0.999699
season            1.000000
team              1.000000
position          1.000000
category          1.000000
allpro            1.000000
college           1.000000
round             1.000000
pfr_player_name   1.000000
probowls          1.000000
seasons_started   1.000000
pick              1.000000
hof               1.000000
DEAD COLUMNS (100% null): ['car_av']

raw team codes (35): ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GNB', 'HOU', 'IND', 'JAX', 'KAN', 'LAC', 'LAR', 'LVR', 'MIA', 'MIN', 'NOR', 'NWE', 'NYG', 'NYJ', 'OAK', 'PHI', 'PIT', 'SDG', 'SEA', 'SFO', 'STL', 'TAM', 'TEN', 'WAS']
after PFR_DRAFT_TEAM_MAP + normalize_team -> 32 codes: ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LA', 'LAC', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS']
team_codes.normalize_team ALONE leaves these wrong: ['GNB', 'KAN', 'LVR', 'NOR', 'NWE', 'SDG', 'SFO', 'TAM']

GOLDEN CHECK -- Tom Brady 2000 (expect round 6, pick 199, NE):
  {'found': True, 'round': 6, 'pick': 199, 'team_raw': 'NWE', 'team_norm': 'NE', 'gsis_id': '00-0019596', 'round_delta': 0, 'pick_delta': 0, 'team_ok': True}
  VERDICT: PASS (delta 0/0, team NE after normalization)
  NOTE: raw team code is 'NWE' -- NOT 'NE'.

==============================================================================
2. SNAP COUNTS -- snap_counts_{YEAR}.parquet
==============================================================================
probing release-asset existence (HTTP HEAD)...
  HTTP 200: [2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025]
  HTTP 404: [2008, 2009, 2010, 2011, 2026]

per-season profile:
 season  rows_all  rows_reg  rows_post  players  games  teams  max_reg_week  null_pfr_id  off_snap_cov  off_pct_cov        game_types
   2012         0         0          0        0      0      0          <NA>            0           NaN          NaN                  
   2013     23799     22821        978     1928    267     32            17            0           1.0          1.0 REG/WC/DIV/CON/SB
   2014     23864     22880        984     1968    267     32            17            0           1.0          1.0 REG/WC/DIV/CON/SB
   2015     23842     22864        978     1975    267     32            17            0           1.0          1.0 REG/WC/DIV/CON/SB
   2016     23890     22904        986     1996    267     32            17            0           1.0          1.0 REG/WC/DIV/CON/SB
   2017     23862     22876        986     2010    267     32            17            0           1.0          1.0 REG/WC/DIV/CON/SB
   2018     23877     22895        982     2023    267     32            17            0           1.0          1.0 REG/WC/DIV/CON/SB
   2019     23862     22884        978     2028    267     32            17            0           1.0          1.0 REG/WC/DIV/CON/SB
   2020     24999     23790       1209     2201    269     32            17            0           1.0          1.0 REG/WC/DIV/CON/SB
   2021     26468     25271       1197     2301    285     32            18            0           1.0          1.0 REG/WC/DIV/CON/SB
   2022     26381     25168       1213     2196    284     32            18            0           1.0          1.0 REG/WC/DIV/CON/SB
   2023     26540     25329       1211     2145    285     32            18            0           1.0          1.0 REG/WC/DIV/CON/SB
   2024     26615     25398       1217     2192    285     32            18            0           1.0          1.0 REG/WC/DIV/CON/SB
   2025     26612     25395       1217     2189    285     32            18            0           1.0          1.0 REG/WC/DIV/CON/SB

[RED FLAG] assets that exist but are EMPTY (0 rows): [2012]
EFFECTIVE coverage (non-empty): 2013-2025

ID system: snap counts key on 'pfr_player_id' ONLY (no gsis_id in schema: ['game_id', 'pfr_game_id', 'pfr_player_id'])
season_type field is 'game_type'; POST rows use WC/DIV/CON/SB (no single 'POST' literal) -- filter with game_type='REG'.

GOLDEN CHECK -- Laken Tomlinson (NYJ LG) 2023 (expect 1,101 offensive snaps = 100% of Jets offensive snaps):
team game_type  games  off_snaps  avg_off_pct  st_snaps
 NYJ       REG     17     1101.0          1.0      56.0
  pipeline=1,101  expected=1,101  delta=+0  avg offense_pct=1.000  games=17
  VERDICT: PASS (exact match)
  NOTE: NYJ missed the 2023 playoffs, so REG-only == season total here. offense_pct is a 0-1 fraction, not 0-100.

==============================================================================
3. ROSTERS -- roster_{YEAR}.parquet
==============================================================================
probing release-asset existence (HTTP HEAD)...
  HTTP 200: 1995-2026 (32 years)
  HTTP 404: none in probe window

per-season profile:
 season  rows_all  distinct_gsis  dup_rows  gsis_cov  pfr_cov  teams  n_status  n_cols  has_week_col
   1995      1918           1831        52  0.981752 0.000000     30         9      30         False
   1996      1911           1837        46  0.985348 0.000000     30         9      30         False
   1997      1923           1847        60  0.991680 0.000520     30        10      30         False
   1998      1964           1892        62  0.994908 0.002546     30        10      30         False
   1999      2039           1974        59  0.997057 0.004414     31        10      30         False
   2000      2046           1988        58  1.000000 0.007820     31         8      30         False
   2001      2045           1988        57  1.000000 0.011736     31         8      30         False
   2002      2031           1963        68  1.000000 0.017233     32         5      36          True
   2003      2034           1976        58  1.000000 0.025074     32         4      36          True
   2004      2063           1993        70  1.000000 0.031508     32         3      36          True
   2005      2048           1996        52  1.000000 0.043945     32         3      36          True
   2006      2061           1991        70  1.000000 0.061621     32         7      36          True
   2007      2076           2000        76  1.000000 0.081888     32         7      36          True
   2008      2077           2003        74  1.000000 0.111218     32         6      36          True
   2009      2104           2013        91  1.000000 0.136407     32         8      36          True
   2010      2152           2036       114  0.999071 0.170539     32         7      36          True
   2011      2099           2022        76  0.999524 0.214864     32         6      36          True
   2012      2120           2031        88  0.999528 0.260377     32         7      36          True
   2013      2137           2032       104  0.999532 0.299485     32         8      36          True
   2014      2153           2053        99  0.999536 0.340455     32         8      36          True
   2015      2190           2064       125  0.999543 0.395434     32         8      36          True
   2016      3061           3061         0  1.000000 0.346292     32         8      36          True
   2017      3082           3082         0  1.000000 0.396496     32         8      36          True
   2018      3142           3141         0  0.999682 0.439211     32         9      36          True
   2019      3114           3112         1  0.999679 0.464355     32         9      36          True
   2020      3068           3067         0  0.999674 0.505215     32        13      36          True
   2021      2961           2960         0  0.999662 0.511314     32        10      36          True
   2022      3134           3133         0  0.999681 0.421187     32         9      36          True
   2023      3090           3089         0  0.999676 0.582848     32        11      36          True
   2024      3216           3215         0  0.999689 0.550684     32         8      36          True
   2025      3137           3134         0  0.999044 0.700032     32         8      36          True
   2026      2930           2918         0  0.995904 0.580546     32         5      36          True

seasons where gsis_id is NOT unique (multi-team players get one row per team): 1995-2019 (22 seasons)
seasons where gsis_id IS unique (true one-row-per-player-season): [2016, 2017, 2018, 2020, 2021, 2022, 2023, 2024, 2025, 2026]

[STRUCTURAL BREAK] row counts per season:
  1995-2015: mean 2,057 rows/season (active roster only)
  2016-2026: mean 3,085 rows/season (adds DEV/CUT/RES)

[SCHEMA DRIFT] seasons WITHOUT week/game_type columns: [1995, 1996, 1997, 1998, 1999, 2000, 2001]
  those files have 30 columns; 2002+ have 36

roster 2012 raw team codes (32): ['ARZ', 'ATL', 'BLT', 'BUF', 'CAR', 'CHI', 'CIN', 'CLV', 'DAL', 'DEN', 'DET', 'GB', 'HST', 'IND', 'JAX', 'KC', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'OAK', 'PHI', 'PIT', 'SD', 'SEA', 'SF', 'SL', 'TB', 'TEN', 'WAS']
  normalize_team -> 32 codes (MATCHES pbp convention)

roster 2023 raw team codes (32): ['ARI', 'ATL', 'BAL', 'BUF', 'CAR', 'CHI', 'CIN', 'CLE', 'DAL', 'DEN', 'DET', 'GB', 'HOU', 'IND', 'JAX', 'KC', 'LA', 'LAC', 'LV', 'MIA', 'MIN', 'NE', 'NO', 'NYG', 'NYJ', 'PHI', 'PIT', 'SEA', 'SF', 'TB', 'TEN', 'WAS']
  normalize_team -> 32 codes (MATCHES pbp convention)

status vocabulary (2026):
status    n
   ACT 2852
   RES   36
   E14   28
   RET   11
   CUT    3

==============================================================================
4. PLAYER-ID CROSSWALK -- players.parquet
==============================================================================
rows=25,035  rookie_season span 1974-2026

ID coverage + uniqueness:
          coverage_all_players  dup_groups  coverage_active_2011plus
id_field                                                            
gsis_id               1.000000           0                  1.000000
esb_id                1.000000           1                  1.000000
smart_id              1.000000           1                  1.000000
pfr_id                0.900859           0                  0.941213
espn_id               0.669742           0                  0.990053
nfl_id                0.482724           0                  0.886997
pff_id                0.449171           0                  0.899185
otc_id                0.372998           0                  0.835828

otc_id / pfr_id coverage by rookie era (the contracts-join bottleneck):
rookie_era  players   otc_id   pfr_id  espn_id
 2000-2010     5351 0.304616 0.795739 0.767707
 2011-2015     2904 0.897383 0.940083 0.980716
     2016+     6344 0.797289 0.926387 0.996217
  pre-2000    10436 0.004216 0.928325 0.334515

otc_id is effectively absent for pre-2000 rookies (OverTheCap only tracks the modern cap era) and thin for 2000-2010.

==============================================================================
5. TEAM METADATA -- nfldata teams.csv + colour sources
==============================================================================
teams.csv: 800 rows x 18 cols, seasons 2002-2026
columns: ['season', 'team', 'nfl', 'nfl_team_id', 'espn', 'pfr', 'pff', 'pfflabel', 'fo', 'full', 'location', 'short_location', 'nickname', 'hyphenated', 'sbr', 'sbr_wins', 'sbr_name', 'draft_kings']

[RED FLAG] teams.csv column audit against TeamMark requirements:
  full name         : OK -> ['full']
  abbreviation      : OK -> ['team']
  conference        : MISSING from teams.csv
  division          : MISSING from teams.csv
  primary colour    : MISSING from teams.csv
  secondary colour  : MISSING from teams.csv

current-season slice (2026): 32 teams (OK)
null columns in 2026 slice: {'sbr_wins': 32}

historical (relocated) franchise rows in teams.csv -- era-correct codes:
       min   max  count
team                   
LA    2016  2026     11
LAC   2017  2026     10
LV    2020  2026      7
OAK   2002  2019     18
SD    2002  2016     15
STL   2002  2015     14
 season team nfl espn pfr               full  location nickname
   2002  OAK OAK  OAK RAI    Oakland Raiders   Oakland  Raiders
   2002   SD  SD   SD SDG San Diego Chargers San Diego Chargers
   2002  STL STL  STL RAM      St Louis Rams  St Louis     Rams
  -> teams.csv is era-correct (like nfldata games.csv), NOT current-franchise like pbp. normalize_team() collapses STL/SD/OAK to LA/LAC/LV.
  -> note two different PFR conventions in play: teams.csv 'pfr' column uses franchise codes (CRD/RAV/OTI/RAM), draft_picks.team uses boxscore codes (NWE/GNB/SFO).

teamcolors.csv: (40, 5) cols=['team', 'color', 'color2', 'color3', 'color4']
teams_colors_logos.csv: (36, 16) cols=['team_abbr', 'team_name', 'team_id', 'team_nick', 'team_conf', 'team_division', 'team_color', 'team_color2', 'team_color3', 'team_color4', 'team_logo_wikipedia', 'team_logo_espn', 'team_wordmark', 'team_conference_logo', 'team_league_logo', 'team_logo_squared']

all 32 current abbrs present in teamcolors.csv: YES
all 32 current abbrs present in teams_colors_logos.csv: YES
conference/division nulls in teams_colors_logos: {'team_conf': 0, 'team_division': 0}

teamcolors.csv: malformed/missing across all 4 colours -> [('NYJ', 'color3', nan), ('NYJ', 'color4', nan)]
teamcolors.csv: malformed/missing in PRIMARY+SECONDARY only -> NONE
teamcolors.csv: primary == secondary -> NONE

teams_colors_logos.csv: malformed/missing across all 4 colours -> [('NYJ', 'team_color3', nan), ('NYJ', 'team_color4', nan), ('TEN', 'team_color3', nan), ('TEN', 'team_color4', nan)]
teams_colors_logos.csv: malformed/missing in PRIMARY+SECONDARY only -> NONE
teams_colors_logos.csv: primary == secondary -> NONE

TeamMark chip -- WCAG contrast of the primary/secondary colour PAIR:
team primary secondary  pair_contrast best_glyph_on_primary  glyph_contrast
 MIA #008E97   #F58220           1.52               #000000            5.32
 TEN #4495D2   #D50A0A           1.67               #000000            6.48
 NYJ #003F2D   #000000           1.75               #ffffff           12.01
  TB #A71930   #322F2B           1.79               #ffffff            7.43
 BUF #00338D   #C60C30           1.88               #ffffff           11.30
 NYG #0B2265   #A71930           1.97               #ffffff           14.68
 HOU #03202F   #A71930           2.26               #ffffff           16.78
 DET #0076B6   #B0B7BC           2.42               #ffffff            4.92
 ARI #97233F   #000000           2.63               #ffffff            7.99
  NE #002244   #C60C30           2.66               #ffffff           16.00
  KC #E31837   #FFB612           2.68               #ffffff            4.72
 LAC #007BC7   #ffc20e           2.79               #000000            4.66

[RED FLAG] 15 of 36 rows have primary/secondary contrast < 3.0 (WCAG large-text floor): ['ARI', 'ATL', 'BUF', 'DET', 'HOU', 'KC', 'LAC', 'MIA', 'NE', 'NYG', 'NYJ', 'SF', 'TB', 'TEN']
  6 rows are below 2.0 -- a secondary-colour glyph on the primary background is illegible for those teams.
  MITIGATION: the 'best_glyph_on_primary' column picks black/white by relative luminance; worst-case glyph contrast that way is 4.66 (all >= 4.5 = WCAG AA).

==============================================================================
6. JOIN-RATE MATRIX
==============================================================================
   season                                                       join              denominator     n  matched  rate_pct
     2023                       rosters -> players.parquet (gsis_id)    roster player-seasons  3090     2928     94.76
     2023                rosters -> players.otc_id (contracts spine)    roster player-seasons  3090     2808     90.87
     2023                                  rosters -> players.pfr_id    roster player-seasons  3090     2904     93.98
     2023     rosters (status<>CUT/RET) -> players.parquet (gsis_id)    roster player-seasons  2635     2626     99.66
     2023                snap_counts REG -> rosters (pfr_id, DIRECT)          snap rows (REG) 25329    18061     71.31
     2023 snap_counts REG -> players -> rosters (BRIDGED on gsis_id)          snap rows (REG) 25329    25316     99.95
     2023                   snap players -> rosters (pfr_id, DIRECT)    distinct snap players  2142     1484     69.28
     2023                   snap players -> players.parquet (pfr_id)    distinct snap players  2142     2141     99.95
     2023                         draft class 2023 rows with gsis_id              draft picks   259      258     99.61
     2012                       rosters -> players.parquet (gsis_id)    roster player-seasons  2120     2119     99.95
     2012                rosters -> players.otc_id (contracts spine)    roster player-seasons  2120     2067     97.50
     2012                                  rosters -> players.pfr_id    roster player-seasons  2120     2111     99.58
     2012     rosters (status<>CUT/RET) -> players.parquet (gsis_id)    roster player-seasons  2038     2038    100.00
     2012                    snap_counts -> rosters (pfr_id, DIRECT)     EMPTY ASSET (0 rows)     0        0       NaN
     2012                         draft class 2012 rows with gsis_id              draft picks   253      252     99.60
     2013                       rosters -> players.parquet (gsis_id)    roster player-seasons  2137     2136     99.95
     2013                rosters -> players.otc_id (contracts spine)    roster player-seasons  2137     2123     99.34
     2013                                  rosters -> players.pfr_id    roster player-seasons  2137     2132     99.77
     2013     rosters (status<>CUT/RET) -> players.parquet (gsis_id)    roster player-seasons  2052     2052    100.00
     2013                snap_counts REG -> rosters (pfr_id, DIRECT)          snap rows (REG) 22821     7864     34.46
     2013 snap_counts REG -> players -> rosters (BRIDGED on gsis_id)          snap rows (REG) 22821    22818     99.99
     2013                   snap players -> rosters (pfr_id, DIRECT)    distinct snap players  1928      605     31.38
     2013                   snap players -> players.parquet (pfr_id)    distinct snap players  1928     1926     99.90
     2013                         draft class 2013 rows with gsis_id              draft picks   254      251     98.82
2000-2025                    draft picks with gsis_id (whole window)              draft picks  6644     6359     95.71
2000-2025                      draft (w/ gsis_id) -> players.parquet draft picks with gsis_id  6359     6359    100.00

CONTRACTS CROSSWALK PATH (established from the players.parquet side only):
  OverTheCap contracts carry otc_id (and nflverse adds gsis_id where known).
  players.parquet is the ONLY file among these five that holds otc_id, and it is
  unique (0 duplicate groups), so the canonical path is:

      contracts.otc_id --> players.otc_id --> players.gsis_id --> rosters.gsis_id
                                                              --> draft.gsis_id
                                                              --> (via pfr_id) snap_counts

  There is NO otc_id anywhere in rosters/snap_counts/draft_picks, so the crosswalk
  through players.parquet is mandatory -- contracts cannot join rosters directly.
  gsis_id is the hub of the whole star schema; pfr_id is the ONLY bridge to snaps.

==============================================================================
OUTPUTS
==============================================================================
  wrote data/curated/staging/support_draft_by_year.csv  (26 rows)
  wrote data/curated/staging/support_snaps_by_season.csv  (14 rows)
  wrote data/curated/staging/support_rosters_by_season.csv  (32 rows)
  wrote data/curated/staging/support_id_coverage.csv  (8 rows)
  wrote data/curated/staging/support_team_colors.csv  (36 rows)
  wrote data/curated/staging/support_join_matrix.csv  (26 rows)

data/raw/ contents: EMPTY (nothing downloaded)

==============================================================================
GOLDEN CHECK SUMMARY
==============================================================================
  Tom Brady 2000: round=6 (delta +0), pick=199 (delta +0), team=NWE -> NE (OK)
  Laken Tomlinson 2023 NYJ: offense_snaps=1,101 vs expected 1,101 (delta +0), avg offense_pct=1.000
