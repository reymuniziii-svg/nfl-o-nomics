"""Contracts marts — `team_season_cap`, `player_season_cap`, `position_allocation`.

Promoted from `audit/audit_contracts.py` (`ARCHITECTURE.md` §4). The SQL that
produces the deduplicated player-season table and the position-at-signing rule is
**copied verbatim** from the audit, deliberately and with attribution, because
`team_season_cap.csv` is final and must re-emit byte-identically.

THE CENTRAL STRUCTURAL FACT (`DATA_AUDIT.md` §6 trap 1):
  The nested `cols` column is NOT contract-specific. It is the player's *entire
  career cap table*, replicated byte-identically onto every contract row that
  player has (100% of the 6,788 multi-contract players). Unnesting without
  deduplicating on `(otc_id, year)` yields 304,313 rows instead of 41,976 and
  inflates every team total 3-7x, silently, in plausible-looking dollars.
  `build_player_seasons` does the dedup. Nothing here aggregates `psu`.

Trap 2 rides along: `cols.year` is a **string** containing `'Total'`, `'0'` and
`'201'`, and the 45,833 `'Total'` footer rows carry real-looking dollar sums.
`TRY_CAST` + a range filter run before anything is summed.

Two more rules that are settled and must not be "simplified":

* `cap_used_total` is **cap held by rostered players, not cap used**, and
  `dead_money_total`/`dead_money_pct` are typed `null` in this mart so misuse is
  a compile error downstream (`DECISIONS.md` 24, `SPEC.md` §7.3).
* Position for a player-season is **the position on his most recent signing at or
  before that season**, falling back to his earliest (`DECISIONS.md` 27). The
  field is recorded at signing and drifts for 7.4% of players.
"""

from __future__ import annotations

import pandas as pd

from . import config, io_utils, sources
from .team_codes import assert_full_32, nickname_to_code

TIER2_START, TIER2_END = config.TIER2_WINDOW

# Golden checks carried into the build (DATA_AUDIT.md §3 tests 12, 13).
GOLDEN_MAHOMES_2023 = 37_133_824      # the September rework, not the $49.293M
GOLDEN_WILSON_SEA_2013 = 681_085      # scheduled number (trap 12)


# --------------------------------------------------------------------------- #
# 1. load + dedup  (verbatim from audit/audit_contracts.py)
# --------------------------------------------------------------------------- #
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


def load(con, *, download: bool = False) -> None:
    sources.scan_parquet(con, config.CONTRACTS_URL, "c", download=download)
    build_player_seasons(con)


def player_seasons_df(con) -> pd.DataFrame:
    df = con.execute("""
        SELECT otc_id, gsis_id, player, season, nickname,
               cap_number, cap_percent, cash_paid, base_salary, prorated_bonus,
               roster_bonus, guaranteed_salary
        FROM ps WHERE season IS NOT NULL
    """).df()
    df["team"] = df["nickname"].map(nickname_to_code)
    # Source is in $ MILLIONS; the rest of this project works in USD.
    for c in ("cap_number", "cash_paid", "base_salary", "prorated_bonus",
              "roster_bonus", "guaranteed_salary"):
        df[c + "_usd"] = df[c] * 1e6
    unmapped = sorted(set(df.loc[df["team"].isna(), "nickname"].dropna()))
    if unmapped:
        raise AssertionError(f"unmapped OTC nicknames: {unmapped}")
    return df


# --------------------------------------------------------------------------- #
# 2. team_season_cap  (verbatim aggregation from the audit)
# --------------------------------------------------------------------------- #
def league_cap_map() -> dict:
    cap = io_utils.read_csv(config.CURATED / "league_cap.csv")
    return {int(r.year): (None if pd.isna(r.cap_usd) else float(r.cap_usd))
            for r in cap.itertuples()}


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
    """Back out each team's *adjusted* cap from OTC's own `cap_percent`.

    `cap_percent = cap_number / (that team's adjusted cap that year)`, so
    `cap_number / cap_percent` recovers the denominator. Restricted to
    `cap_percent > 0.02` because the field is rounded to 3 decimals and small
    percentages are too coarse to invert. Median across players is used.

    This is the burden denominator: `DECISIONS.md` 25 makes dead-money burden
    divide by the *implied adjusted cap*, because that is the cap the team
    actually operated against.
    """
    d = df.dropna(subset=["team", "cap_percent"]).copy()
    d = d[d["cap_percent"] > 0.02]
    d["implied"] = d["cap_number_usd"] / d["cap_percent"]
    return (d.groupby(["season", "team"], as_index=False)
              .agg(team_adjusted_cap_implied=("implied", "median"),
                   adj_cap_n_players=("implied", "size"),
                   adj_cap_rel_sd=("implied", lambda s: s.std() / s.median())))


def build_team_season_cap(df: pd.DataFrame, capmap: dict) -> pd.DataFrame:
    ts_all = team_season_frame(df, capmap)
    adj = implied_adjusted_cap(df)
    mart = ts_all[ts_all["season"].between(TIER2_START, TIER2_END)].merge(
        adj, on=["season", "team"], how="left")
    mart["cap_pct_of_adjusted"] = mart["cap_used_total"] / mart["team_adjusted_cap_implied"]
    # Dead money is structurally absent from this source. The columns are emitted
    # so downstream schema is stable, but they are ALWAYS null (SPEC.md §7.3).
    mart["dead_money_total"] = pd.NA
    mart["dead_money_pct"] = pd.NA
    # The honest residual: adjusted cap not accounted for by rostered players.
    # It is dead money + unlisted minimum/practice-squad charges, NOT dead money
    # alone, and is never labelled as dead money.
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

    io_utils.assert_rows(mart, "team_season_cap")
    assert_full_32(mart["team"], "team_season_cap")
    if mart["dead_money_total"].notna().any() or mart["dead_money_pct"].notna().any():
        raise AssertionError("team_season_cap: dead-money columns must be all-null")
    return mart


# --------------------------------------------------------------------------- #
# 3. position at signing  (verbatim from the audit)
# --------------------------------------------------------------------------- #
def position_by_player_season(con) -> pd.DataFrame:
    """Position for a player-season = position on his most recent signing at or
    before that season (falling back to his earliest signing). OTC records
    position *at signing*, so this is 'position as of the deal then in force.'

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
        SELECT otc_id, season, position, year_signed FROM j WHERE rn = 1
    """).df()


def contract_in_force(con) -> pd.DataFrame:
    """The contract row behind each (otc_id, season)'s position-at-signing pick.

    `position_by_player_season` settles *which signing* is in force; this picks
    the contract row for that exact `(otc_id, year_signed, position)` so the
    top-level terms (value, APY, years, guaranteed) travel with the same deal the
    position came from. `rid` breaks any remaining tie deterministically.
    """
    return con.execute("""
        SELECT DISTINCT ON (otc_id, year_signed, position)
               otc_id, year_signed, position,
               years  AS contract_years,
               value  AS contract_value_musd,
               apy    AS contract_apy_musd,
               guaranteed AS contract_guaranteed_musd,
               apy_cap_pct AS contract_apy_cap_pct,
               is_active AS contract_is_active
        FROM cr
        WHERE position IS NOT NULL AND year_signed BETWEEN 1980 AND 2050
        ORDER BY otc_id, year_signed, position, rid
    """).df()


# --------------------------------------------------------------------------- #
# 4. player_season_cap  — SPEC.md §7.9
# --------------------------------------------------------------------------- #
def _gsis_crosswalk(con, *, download: bool = False) -> pd.DataFrame:
    """`players.parquet` is the ONLY file that holds `otc_id`, and it is unique
    (0 duplicate groups). `gsis_id` is the hub of the star schema; this is the
    mandatory crosswalk (`DECISIONS.md` 38, `DATA_AUDIT.md` §6 trap 5)."""
    sources.scan_parquet(
        con, config.PLAYERS_URL, "players", "otc_id, gsis_id, pfr_id, display_name",
        download=download,
    )
    # players.parquet stores otc_id as VARCHAR; the contracts file stores it as
    # INTEGER. Cast on the players side so the join key has one type.
    xw = con.execute("""
        SELECT TRY_CAST(otc_id AS INTEGER) AS otc_id,
               gsis_id AS gsis_id_xwalk, pfr_id AS pfr_id_xwalk
        FROM players WHERE otc_id IS NOT NULL
    """).df()
    xw = xw.dropna(subset=["otc_id"])
    xw["otc_id"] = xw["otc_id"].astype("int64")
    if xw["otc_id"].duplicated().any():
        raise AssertionError("players.parquet otc_id must be unique (0 dup groups)")
    return xw


def _ledger_markers(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """Resolve the 21 marquee dead-money charges onto `otc_id` player-seasons.

    The ledger follows the **charge**, not the player: the team that ate it is
    not the team on the player's row for that year (`SPEC.md` §3.4). The marker
    therefore carries `dm_ledger_team` explicitly and never overwrites `team`.

    The Dareus/BUF row has a deliberately blank `split_by_season` — sources
    conflict and it was not guessed (`SPEC.md` §2.7). Its marker rows carry
    `dm_ledger_split_established = False` and no per-season value; the UI renders
    the total with "per-season split not established".
    """
    led = io_utils.read_csv(config.CURATED / "dead_money_ledger.csv")
    notes: list[str] = []

    # player name -> otc_id, disambiguated by a player-season on the charging
    # team in or before the first charge season. Never fuzzy-matched.
    rows = []
    for r in led.itertuples():
        seasons = [int(s) for s in str(r.seasons).split("-")]
        first = seasons[0]
        span = list(range(seasons[0], seasons[-1] + 1))
        cand = df[df["player"] == r.player]
        ids = sorted(cand["otc_id"].dropna().unique())
        if len(ids) > 1:
            corr = cand[(cand["team"] == r.team) & (cand["season"] <= first)]
            ids2 = sorted(corr["otc_id"].dropna().unique())
            if len(ids2) == 1:
                ids = ids2
            else:
                by_cap = (cand.groupby("otc_id")["cap_number_usd"].sum()
                              .sort_values(ascending=False))
                ids = [int(by_cap.index[0])]
                notes.append(
                    f"{r.player}: {len(cand['otc_id'].unique())} otc_ids collided; "
                    f"resolved to {ids[0]} by career cap")
        if not ids:
            notes.append(f"{r.player}: no otc_id in the contracts file")
            continue
        otc = int(ids[0])
        split = ("" if pd.isna(r.split_by_season) else str(r.split_by_season)).strip()
        parts = [int(x) for x in split.split("/")] if split else []
        established = bool(parts)
        for i, season in enumerate(span):
            rows.append({
                "otc_id": otc,
                "season": season,
                "dm_ledger_charge": True,
                "dm_ledger_player": r.player,
                "dm_ledger_team": r.team,
                "dm_ledger_usd": parts[i] if established and i < len(parts) else pd.NA,
                "dm_ledger_total_usd": int(r.total_usd),
                "dm_ledger_seasons": str(r.seasons),
                "dm_ledger_split_established": established,
                "dm_ledger_is_actual": True,
                "dm_ledger_source_url": r.source_url,
            })
    return pd.DataFrame(rows), notes


def build_player_season_cap(con, df: pd.DataFrame, pos: pd.DataFrame, *,
                            download: bool = False) -> tuple[pd.DataFrame, dict]:
    d = df[df["season"].between(TIER2_START, TIER2_END) & df["team"].notna()].copy()
    d = d.merge(pos, on=["otc_id", "season"], how="left")
    d["position_group"] = d["position"].map(config.POSITION_GROUP).fillna(
        config.POSITION_UNMAPPED)

    terms = contract_in_force(con)
    d = d.merge(terms, on=["otc_id", "year_signed", "position"], how="left")

    xw = _gsis_crosswalk(con, download=download)
    d["otc_id"] = pd.to_numeric(d["otc_id"], errors="coerce").astype("int64")
    d = d.merge(xw, on="otc_id", how="left")
    # contracts.gsis_id is 91.9% populated; players.parquet fills the rest.
    d["gsis_id"] = d["gsis_id"].where(d["gsis_id"].notna(), d["gsis_id_xwalk"])

    markers, notes = _ledger_markers(df)
    d = d.merge(markers, on=["otc_id", "season"], how="left")
    d["dm_ledger_charge"] = d["dm_ledger_charge"].fillna(False).astype(bool)
    d["dm_ledger_split_established"] = d["dm_ledger_split_established"].fillna(
        False).astype(bool)
    d["dm_ledger_is_actual"] = d["dm_ledger_is_actual"].fillna(False).astype(bool)

    # Source is $ millions on the top-level contract columns too.
    for src, dst in (("contract_value_musd", "contract_value"),
                     ("contract_apy_musd", "contract_apy"),
                     ("contract_guaranteed_musd", "contract_guaranteed")):
        d[dst] = pd.to_numeric(d[src], errors="coerce") * 1e6

    # The raw $-millions columns share names with the USD ones we are about to
    # rename into; drop them first so the frame never carries duplicate labels.
    d = d.drop(columns=["cap_number", "cash_paid", "base_salary", "prorated_bonus",
                        "roster_bonus", "guaranteed_salary", "nickname",
                        "contract_value_musd", "contract_apy_musd",
                        "contract_guaranteed_musd", "gsis_id_xwalk", "pfr_id_xwalk"],
                errors="ignore")

    out = d.rename(columns={
        "cap_number_usd": "cap_number",
        "cash_paid_usd": "cash_paid",
        "base_salary_usd": "base_salary",
        "prorated_bonus_usd": "prorated_bonus",
        "roster_bonus_usd": "roster_bonus",
        "guaranteed_salary_usd": "guaranteed_salary",
        "position": "position_at_signing",
        "year_signed": "contract_year_signed",
    })[[
        "season", "team", "player", "otc_id", "gsis_id",
        "position_at_signing", "position_group",
        "cap_number", "cap_percent", "cash_paid",
        "base_salary", "prorated_bonus", "roster_bonus", "guaranteed_salary",
        "contract_year_signed", "contract_years", "contract_value",
        "contract_apy", "contract_guaranteed", "contract_apy_cap_pct",
        "dm_ledger_charge", "dm_ledger_player", "dm_ledger_team",
        "dm_ledger_usd", "dm_ledger_total_usd", "dm_ledger_seasons",
        "dm_ledger_split_established", "dm_ledger_is_actual", "dm_ledger_source_url",
    ]].sort_values(["season", "team", "otc_id"]).reset_index(drop=True)

    out = io_utils.round_cols(out, {
        "cap_number": 0, "cash_paid": 0, "base_salary": 0, "prorated_bonus": 0,
        "roster_bonus": 0, "guaranteed_salary": 0, "contract_value": 0,
        "contract_apy": 0, "contract_guaranteed": 0,
        "cap_percent": 6, "contract_apy_cap_pct": 6,
    })
    out = io_utils.as_int64(out, [
        "otc_id", "cap_number", "cash_paid", "base_salary", "prorated_bonus",
        "roster_bonus", "guaranteed_salary", "contract_year_signed",
        "contract_years", "contract_value", "contract_apy", "contract_guaranteed",
        "dm_ledger_usd", "dm_ledger_total_usd",
    ])

    assert_full_32(out["team"], "player_season_cap")
    if out["otc_id"].isna().any():
        raise AssertionError("player_season_cap: otc_id is the internal key and is 100%")
    io_utils.assert_unique(out, ["otc_id", "season"], "player_season_cap")

    stats = {
        "player_seasons": len(out),
        "team_seasons": out.groupby(["season", "team"]).ngroups,
        "gsis_coverage": round(float(out["gsis_id"].notna().mean()), 4),
        "cap_pct_coverage": round(float(out["cap_percent"].notna().mean()), 4),
        "ledger_marked_rows": int(out["dm_ledger_charge"].sum()),
        "ledger_players_in_window": int(
            out.loc[out["dm_ledger_charge"], "dm_ledger_player"].nunique()),
        "collision_notes": notes,
    }
    return out, stats


# --------------------------------------------------------------------------- #
# 5. position_allocation  — SPEC.md §7.12 / §2.6
# --------------------------------------------------------------------------- #
def build_position_allocation(psc: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """Cap share by position group per team-season versus the league average.

    The denominator is the team's **mapped rostered cap**. Unmapped cap share is
    0.375% and is dropped, not bucketed into "other" (`SPEC.md` §2.6), so the
    nine group shares sum to 1.000 and the diverging bars close.

    This is a share of *rostered* cap and therefore inherits the dead-money
    omission — it is "% of cap held by players on the roster", never "% of cap"
    (`DECISIONS.md` 28). The column is named `share_of_rostered_cap` so the
    caveat travels in the schema itself.
    """
    d = psc[psc["position_group"] != config.POSITION_UNMAPPED].copy()
    d["cap_number"] = pd.to_numeric(d["cap_number"], errors="coerce")
    unk = psc.loc[psc["position_group"] == config.POSITION_UNMAPPED, "cap_number"]
    unk_share = float(pd.to_numeric(unk, errors="coerce").sum()
                      / pd.to_numeric(psc["cap_number"], errors="coerce").sum())

    g = (d.groupby(["season", "team", "position_group"], as_index=False)
           .agg(cap_usd=("cap_number", "sum"), n_players=("cap_number", "size")))

    # Complete the grid: a team with no cap at a group has a genuine 0.0 share,
    # not a missing reading, and the chart needs all nine bars.
    idx = pd.MultiIndex.from_product(
        [sorted(d["season"].unique()), sorted(d["team"].unique()),
         list(config.POSITION_GROUPS)],
        names=["season", "team", "position_group"])
    g = (g.set_index(["season", "team", "position_group"])
           .reindex(idx, fill_value=0).reset_index())

    team_tot = g.groupby(["season", "team"], as_index=False)["cap_usd"].sum().rename(
        columns={"cap_usd": "team_rostered_cap"})
    g = g.merge(team_tot, on=["season", "team"])
    g["share_of_rostered_cap"] = g["cap_usd"] / g["team_rostered_cap"]

    lg = g.groupby(["season", "position_group"], as_index=False)["cap_usd"].sum().rename(
        columns={"cap_usd": "league_group_cap"})
    lg_tot = g.groupby("season", as_index=False)["cap_usd"].sum().rename(
        columns={"cap_usd": "league_rostered_cap"})
    lg = lg.merge(lg_tot, on="season")
    lg["league_share"] = lg["league_group_cap"] / lg["league_rostered_cap"]

    out = g.merge(lg[["season", "position_group", "league_share"]],
                  on=["season", "position_group"])
    out["delta_vs_league"] = out["share_of_rostered_cap"] - out["league_share"]
    out = out[[
        "season", "team", "position_group", "n_players", "cap_usd",
        "share_of_rostered_cap", "league_share", "delta_vs_league",
    ]].sort_values(["season", "team", "position_group"]).reset_index(drop=True)

    # Checked at full precision, before the write-time rounding: nine shares
    # rounded to 6dp can legitimately sum to 1 ± 5e-6.
    sums = out.groupby(["season", "team"])["share_of_rostered_cap"].sum()
    if not ((sums - 1.0).abs() < 1e-9).all():
        raise AssertionError("position_allocation: team shares do not sum to 1.000")
    lgs = (out.drop_duplicates(["season", "position_group"])
              .groupby("season")["league_share"].sum())
    if not ((lgs - 1.0).abs() < 1e-9).all():
        raise AssertionError("position_allocation: league shares do not sum to 1.000")

    out = io_utils.round_cols(out, {
        "cap_usd": 0, "share_of_rostered_cap": 6, "league_share": 6,
        "delta_vs_league": 6,
    })
    out = io_utils.as_int64(out, ["cap_usd", "n_players"])

    io_utils.assert_rows(out, "position_allocation")
    assert_full_32(out["team"], "position_allocation")

    face = (out[out["season"] == 2023].groupby("position_group")["league_share"]
            .first().round(4).to_dict())
    return out, {"unmapped_cap_share": round(unk_share, 6), "league_2023": face}


# --------------------------------------------------------------------------- #
# 6. golden checks
# --------------------------------------------------------------------------- #
def golden_checks(df: pd.DataFrame) -> list[dict]:
    out = []
    mah = df[(df["player"] == "Patrick Mahomes") & (df["season"] == 2023)]
    v = None if mah.empty else float(mah["cap_number_usd"].iloc[0])
    out.append({"check": "Mahomes KC 2023 cap number",
                "expected": GOLDEN_MAHOMES_2023, "got": v,
                "delta": None if v is None else v - GOLDEN_MAHOMES_2023})
    rw = df[(df["player"] == "Russell Wilson") & (df["season"] == 2013)]
    v = None if rw.empty else float(rw["cap_number_usd"].iloc[0])
    out.append({"check": "Wilson SEA 2013 cap hit",
                "expected": GOLDEN_WILSON_SEA_2013, "got": v,
                "delta": None if v is None else v - GOLDEN_WILSON_SEA_2013})
    for r in out:
        if r["delta"] is None or abs(r["delta"]) >= 1:
            raise AssertionError(f"golden check failed: {r}")
    return out


# --------------------------------------------------------------------------- #
# mart entry points — one contracts scan feeds all three marts
# --------------------------------------------------------------------------- #
_CACHE: dict = {}


def _prepare(ctx):
    if "df" in _CACHE:
        return _CACHE
    con = sources.duck_connect()
    load(con, download=ctx.download)
    df = player_seasons_df(con)
    pos = position_by_player_season(con)
    gc = golden_checks(df)
    if ctx.verbose:
        for r in gc:
            print(f"  golden {r['check']}: ${r['got']:,.0f} (delta {r['delta']:+.0f})")
    _CACHE.update({"con": con, "df": df, "pos": pos, "golden": gc})
    return _CACHE


def mart_team_season_cap(ctx) -> pd.DataFrame:
    s = _prepare(ctx)
    out = build_team_season_cap(s["df"], league_cap_map())
    ctx.note_source("nflverse historical_contracts.parquet",
                    rows=len(s["df"]), window=f"{TIER2_START}-{TIER2_END}")
    return out


def mart_player_season_cap(ctx) -> pd.DataFrame:
    s = _prepare(ctx)
    out, stats = build_player_season_cap(s["con"], s["df"], s["pos"],
                                         download=ctx.download)
    _CACHE["player_season_cap"] = out
    ctx.note_source("nflverse historical_contracts.parquet + players.parquet",
                    rows=stats["player_seasons"], window=f"{TIER2_START}-{TIER2_END}")
    ctx.stats["player_season_cap"] = stats
    if ctx.verbose:
        print(f"  player-seasons {stats['player_seasons']}, "
              f"team-seasons {stats['team_seasons']}, "
              f"gsis {stats['gsis_coverage']:.1%}, "
              f"ledger-marked rows {stats['ledger_marked_rows']} "
              f"({stats['ledger_players_in_window']} players)")
        for n in stats["collision_notes"]:
            print(f"  [name collision] {n}")
    return out


def mart_position_allocation(ctx) -> pd.DataFrame:
    psc = _CACHE.get("player_season_cap")
    if psc is None:
        psc = mart_player_season_cap(ctx)
    out, stats = build_position_allocation(psc)
    ctx.note_source("nflverse historical_contracts.parquet",
                    rows=len(psc), window=f"{TIER2_START}-{TIER2_END}")
    ctx.stats["position_allocation"] = stats
    if ctx.verbose:
        print(f"  unmapped cap share {stats['unmapped_cap_share']:.4%} (dropped)")
        print("  league 2023 shares: " + " · ".join(
            f"{k} {v:.1%}" for k, v in sorted(
                stats["league_2023"].items(), key=lambda kv: -kv[1])))
    return out
