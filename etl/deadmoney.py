"""Dead money — `dead_money_team_season` (+ `license_tier`), `dead_money_display`.

Promoted from `audit/build_deadmoney_curated.py`. The curated CSVs in
`data/curated/` are the source of record and are **not rewritten here**; this
module reads them, adds the one column ETL owes them, applies the runtime tier
filter, and emits the render-ready view.

THE HARDEST RULE IN THE PRODUCT (`SPEC.md` §2.1):

1. A `(team, season)` dead-money key without an `asof_date` is a bug and fails a
   structural test at build time.
2. **Value, date and stage always render together.** No compact variant drops
   the date; no tooltip-only date.
3. **Never plotted as a connected cross-season series.** These are individually
   dated readings taken at different points in different league years. The
   renderer is a dot plot with no connecting path.
4. Same-season drift is real and measured: CHI 2022 reads $57.6M preseason →
   $85.8M midseason → $91.8M final (+59%); the 2018 league total reads $155.2M
   in March and $348.5M in July, a 2.2x swing from measurement date alone.

`license_tier` is the new column and it is the mechanism the legal contingency
depends on (`SPEC.md` §7.5, `DECISIONS.md` 23, `RISKS.md` risk 1). It is derived
**deterministically from `source_url`** against the tiering in
`audit/findings_deadmoney_sourcing.md` Appendix A, by exact URL — an unmapped URL
raises, because a new curated row must declare its tier rather than default into
the shippable half.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import config, io_utils
from .team_codes import assert_full_32

# --------------------------------------------------------------------------- #
# license_tier — audit/findings_deadmoney_sourcing.md Appendix A, by exact URL.
# Row counts reproduce DATA_AUDIT.md §5 exactly: 69 / 45 / 64 / 192 = 370.
# --------------------------------------------------------------------------- #
LICENSE_TIER_BY_URL = {
    # ---- SAFE, league-official: ESPN Roster Management System / ESPN S&I.
    # RMS is the league's own contract system, not OTC/Spotrac. Cleanest tier.
    "https://web.archive.org/web/20140220id_/http://espn.go.com/blog/nflnation/post/_/id/117248/inside-slant-dead-money-totals": "SAFE_LEAGUE",
    "https://www.espn.com/nfl/story/_/id/13957641/dead-money-how-new-orleans-saints-salary-cap-woes-affect-drew-brees-future": "SAFE_LEAGUE",
    "https://www.espn.com/nfl/story/_/id/39665413/what-dead-money-largest-nfl-salary-cap-hits-ever-player-team": "SAFE_LEAGUE",
    # ---- SAFE, editorially transformed: partial selections written as prose.
    "https://sports.yahoo.com/dead-money-leaders-183000069--nfl.html": "SAFE_EDITORIAL",
    "https://thecomeback.com/nfl/examining-dead-money-and-injured-reserve-spending-at-nfls-quarter-season-mark.html": "SAFE_EDITORIAL",
    "https://www.cbssports.com/nfl/news/agents-take-heres-the-three-nfl-teams-wasting-the-most-salary-cap-resources/": "SAFE_EDITORIAL",
    "https://www.forbes.com/sites/billhuber/2019/05/16/dead-cap-money-puts-teams-behind-franchise-building-eight-ball/": "SAFE_EDITORIAL",
    "https://www.nbcsportsboston.com/boston/patriots/could-patriots-ranking-among-dead-money-leaders-cost-team-2020": "SAFE_EDITORIAL",
    "https://www.nbcsportsphiladelphia.com/nfl/philadelphia-eagles/how-the-eagles-wound-up-with-50-million-in-dead-money/189838/": "SAFE_EDITORIAL",
    # ---- REVIEW, Spotrac-derived: full-32 reproduction of a Spotrac table.
    "https://ftw.usatoday.com/story/sports/nfl/2017/07/05/nfl-salary-cap-dead-money-leaders-definition-ravens/81897409007/": "REVIEW_SPOTRAC",
    "https://www.profootballrumors.com/2022/07/nfl-teams-with-most-dead-cap": "REVIEW_SPOTRAC",
    # ---- REVIEW, OTC-derived: full-32 reproduction of an OverTheCap table.
    "https://www.thescore.com/nfl/news/1501210": "REVIEW_OTC",
    "https://www.thescore.com/nfl/news/1571301": "REVIEW_OTC",
    "https://www.thescore.com/nfl/news/1723008/updated-salary-cap-space-for-all-32-teams": "REVIEW_OTC",
    "https://www.profootballrumors.com/2023/07/2023-nfl-dead-money-by-team": "REVIEW_OTC",
    "https://www.profootballrumors.com/2024/11/2024-nfl-dead-money-by-team": "REVIEW_OTC",
    "https://www.profootballrumors.com/2025/12/2025-nfl-dead-money-by-team": "REVIEW_OTC",
}

#: Expected tier counts, from DATA_AUDIT.md §5. Asserted, not assumed.
EXPECTED_TIER_ROWS = {
    "SAFE_LEAGUE": 69, "SAFE_EDITORIAL": 45,
    "REVIEW_SPOTRAC": 64, "REVIEW_OTC": 192,
}


def add_license_tier(dm: pd.DataFrame) -> pd.DataFrame:
    unmapped = sorted(set(dm["source_url"]) - set(LICENSE_TIER_BY_URL))
    if unmapped:
        raise AssertionError(
            "dead_money_team_season: source_url with no licensing tier — a new "
            f"curated row must declare its tier in Appendix A: {unmapped}")
    out = dm.copy()
    out["license_tier"] = out["source_url"].map(LICENSE_TIER_BY_URL)
    got = out["license_tier"].value_counts().to_dict()
    if got != EXPECTED_TIER_ROWS:
        raise AssertionError(
            f"license tier counts drifted: {got} != {EXPECTED_TIER_ROWS}")
    return out


def load_team_season(*, tier: str | None = None) -> pd.DataFrame:
    """The curated snapshots with `license_tier` added and the runtime filter
    applied. `DEAD_MONEY_TIER='safe'` is the one-line licensing reversal."""
    dm = io_utils.read_csv(config.CURATED / "dead_money_team_season.csv")
    if dm["asof_date"].isna().any() or dm["asof_stage"].isna().any():
        raise AssertionError("a dead-money row without asof_date/asof_stage is a bug")
    io_utils.assert_rows(dm, "dead_money_team_season")
    dm = add_license_tier(dm)
    allowed = (config.LICENSE_TIERS_ALLOWED if tier is None
               else {"full": set(config.LICENSE_TIERS),
                     "safe": {"SAFE_LEAGUE", "SAFE_EDITORIAL"}}[tier])
    return dm[dm["license_tier"].isin(allowed)].reset_index(drop=True)


def load_ledger() -> pd.DataFrame:
    led = io_utils.read_csv(config.CURATED / "dead_money_ledger.csv")
    io_utils.assert_rows(led, "dead_money_ledger")
    if not led["is_actual"].all():
        raise AssertionError("every ledger row is is_actual = TRUE")
    return led


# --------------------------------------------------------------------------- #
# SAME-STAGE SNAPSHOT RESOLUTION — the pinned rule.
#
# CAPPLUS_MEMO.md §7 condition 3 requires all 32 teams in a season to be read
# from ONE dated snapshot, so a leaders-only later article cannot single
# individual teams out. What the memo does NOT pin is the tie-break, and the tie
# is real: `dead_money_team_season.csv` carries **two 2018 snapshots that are
# both `full32` AND both tagged `preseason`** — 2018-03-01 ($155.2M league-wide)
# and 2018-07-14 ($348.5M), 2.25x apart. `asof_stage` cannot break that tie, so
# resolving on stage alone is non-deterministic.
#
# THE PINNED RULE, in this order, per season:
#
#   1. Filter to the **broadest coverage class present**, ranked
#      `full32` > `partial` > `top5`. Only `full32` is a league-wide reading; a
#      season whose best class is anything else does NOT resolve and blanks
#      whole-season (DECISIONS 16) — standardising a season in which only the
#      five worst offenders are observed would rate 2013 Oakland as average.
#   2. Among those, take the **LATEST `asof_date`**. A table published after the
#      league year has opened is the more complete accounting of that season's
#      charges (DECISIONS 15).
#   3. **Record the chosen `asof_date` + `asof_stage` per season** in the emitted
#      resolution table (`dead_money_snapshot_resolution`), so the choice is data
#      the tests can assert rather than behaviour buried in a function.
#
# Verified consequences, asserted in `assert_pinned_resolution` below:
#   * 2018 resolves to **2018-07-14** (two full32 candidates; latest wins).
#   * 2019 resolves to **2019-03-10** (the 2019-05-16 Forbes rows are `partial`,
#     14 teams, and lose at step 1 — not at step 2). The two seasons are resolved
#     under the SAME rule, not opposite date rules.
#   * Exactly two seasons (2014, 2019) end up as pre-league-year tables, which is
#     how the memo badges them `provisional`.
#
# Deliberate copy of `audit/capplus_backtest.resolve_dead_money_same_stage`,
# minus its hard assertion that the covered-season tuple is exactly the nine, so
# that the `DEAD_MONEY_TIER='safe'` reversal can run without tripping it. The
# pipeline cross-checks this function against the audit original whenever the
# tier is 'full', so the copy cannot drift from the evidence record.
# --------------------------------------------------------------------------- #
#: Coverage classes, broadest first. Step 1 of the pinned rule.
COVERAGE_RANK = {"full32": 0, "partial": 1, "top5": 2}
#: Only this class is a league-wide reading a season may resolve on.
RESOLVABLE_COVERAGE = "full32"
#: The pinned outcomes. A change here is a data change, not a refactor.
PINNED_RESOLUTION = {
    2014: "2014-02-18", 2015: "2015-10-28", 2017: "2017-07-05",
    2018: "2018-07-14", 2019: "2019-03-10", 2022: "2022-07-05",
    2023: "2023-07-14", 2024: "2024-11-27", 2025: "2025-12-17",
}


def coverage_classes(dm: pd.DataFrame) -> pd.DataFrame:
    """Step 1 of the pinned rule, exposed so it can be asserted directly."""
    d = dm.copy()
    d["coverage_rank"] = d["coverage"].map(COVERAGE_RANK)
    if d["coverage_rank"].isna().any():
        bad = sorted(set(d.loc[d["coverage_rank"].isna(), "coverage"]))
        raise AssertionError(f"unknown dead-money coverage class: {bad}")
    best = d.groupby("season", as_index=False)["coverage_rank"].min()
    inv = {v: k for k, v in COVERAGE_RANK.items()}
    best["coverage_class"] = best["coverage_rank"].map(inv)
    best["resolvable"] = best["coverage_class"] == RESOLVABLE_COVERAGE
    return best[["season", "coverage_class", "resolvable"]]


def resolve_same_stage(dm: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    d = dm.copy()
    d["asof_date"] = pd.to_datetime(d["asof_date"])
    classes = coverage_classes(dm)
    resolvable = set(classes.loc[classes["resolvable"], "season"])

    # Step 1: broadest coverage class present, and it must be full32.
    full = d[(d["coverage"] == RESOLVABLE_COVERAGE) & d["season"].isin(resolvable)].copy()
    # Step 2: latest asof_date among the step-1 survivors.
    keep = full.groupby("season")["asof_date"].max().rename("keep_date").reset_index()
    full = full.merge(keep, on="season")
    full = full[full["asof_date"] == full["keep_date"]].drop(columns=["keep_date"])
    if len(full):
        if not (full.groupby("season")["team"].nunique() == 32).all():
            raise AssertionError("same-stage snapshot is not full-32")
        if not (full.groupby("season")["asof_date"].nunique() == 1).all():
            raise AssertionError("more than one date in a season")

    n_candidates = (d[d["coverage"] == RESOLVABLE_COVERAGE]
                    .groupby("season")["asof_date"].nunique()
                    .rename("n_candidate_snapshots").reset_index())
    snap = (full.groupby("season")
            .agg(asof_date=("asof_date", "first"), asof_stage=("asof_stage", "first"),
                 license_tier=("license_tier", "first"),
                 source_url=("source_url", "first"),
                 teams=("team", "nunique"),
                 median_dead_money_usd=("dead_money_usd", "median"),
                 total_dead_money_usd=("dead_money_usd", "sum"))
            .reset_index())
    snap = snap.merge(n_candidates, on="season", how="left")
    # A table published before the league year opened (mid-March) cannot see that
    # season's cuts and restructures at all, so its level is a floor, not a
    # measurement. Those seasons ship badged "provisional" — 2014 (Feb 18) and
    # 2019 (Mar 10). A July preseason table is after the league year opened.
    opens = pd.to_datetime(snap["season"].astype(str) + config.LEAGUE_YEAR_OPENS_MMDD)
    snap["badge"] = np.where(
        snap["asof_date"] < opens, "provisional",
        np.where(snap["asof_stage"] == "preseason", "preseason", "in_season"))
    snap["asof_date"] = snap["asof_date"].dt.strftime("%Y-%m-%d")

    out = full.rename(columns={"dead_money_usd": "dead_money_rec",
                               "asof_date": "dm_rec_asof_date",
                               "asof_stage": "dm_rec_asof_stage"})
    out["dm_rec_asof_date"] = out["dm_rec_asof_date"].dt.strftime("%Y-%m-%d")
    out = out[["season", "team", "dead_money_rec", "dm_rec_asof_date",
               "dm_rec_asof_stage", "license_tier", "source_url", "note"]]
    return out.sort_values(["season", "team"]).reset_index(drop=True), snap


def assert_pinned_resolution(snap: pd.DataFrame) -> None:
    """The pinned rule's outcomes, asserted. Only meaningful on the full tier —
    the `safe` reversal legitimately drops seven of the nine seasons."""
    if config.DEAD_MONEY_TIER != "full":
        return
    got = dict(zip(snap["season"].astype(int), snap["asof_date"]))
    if got != PINNED_RESOLUTION:
        raise AssertionError(
            f"snapshot resolution drifted from the pinned rule.\n"
            f"  got      {got}\n  expected {PINNED_RESOLUTION}")
    # The specific tie the rule exists to settle.
    if got[2018] != "2018-07-14":
        raise AssertionError("2018 must resolve to the later full32 table")
    if got[2019] != "2019-03-10":
        raise AssertionError(
            "2019 must resolve to its only full32 table; the 2019-05-16 rows are "
            "partial (14 teams) and lose at step 1, not step 2")


def build_snapshot_resolution(dm: pd.DataFrame) -> pd.DataFrame:
    """`dead_money_snapshot_resolution` — the resolution table, one row per
    season in the Tier 2 window, recording what the pinned rule chose and why.

    This is the mart the contract tests assert against: the choice is data, not
    behaviour buried in a function.
    """
    lo, hi = config.TIER2_WINDOW
    d = dm[dm["season"].between(lo, hi)].copy()
    classes = coverage_classes(d)
    _, snap = resolve_same_stage(d)
    assert_pinned_resolution(snap)

    cand = (d.groupby(["season", "coverage"], as_index=False)["asof_date"].nunique()
             .pivot(index="season", columns="coverage", values="asof_date")
             .reindex(columns=list(COVERAGE_RANK)).fillna(0).astype(int)
             .rename(columns={c: f"n_{c}_snapshots" for c in COVERAGE_RANK})
             .reset_index())

    out = (pd.DataFrame({"season": range(lo, hi + 1)})
             .merge(classes, on="season", how="left")
             .merge(cand, on="season", how="left")
             .merge(snap.rename(columns={
                 "asof_date": "chosen_asof_date", "asof_stage": "chosen_asof_stage",
                 "license_tier": "chosen_license_tier", "source_url": "chosen_source_url",
                 "teams": "chosen_n_teams"}),
                 on="season", how="left"))
    out["resolved"] = out["chosen_asof_date"].notna()
    out["rule"] = "broadest coverage class (full32) then latest asof_date"
    out["blank_reason"] = np.where(
        out["resolved"], "", config.BLANK_REASON_NO_DM_TABLE)
    for c in ("chosen_asof_date", "chosen_asof_stage", "chosen_license_tier",
              "chosen_source_url", "badge", "coverage_class"):
        out[c] = out[c].fillna("")
    out = out[[
        "season", "coverage_class", "resolvable", "resolved",
        "chosen_asof_date", "chosen_asof_stage", "badge", "chosen_license_tier",
        "chosen_n_teams", "n_candidate_snapshots",
        "n_full32_snapshots", "n_partial_snapshots", "n_top5_snapshots",
        "median_dead_money_usd", "total_dead_money_usd",
        "rule", "blank_reason", "chosen_source_url",
    ]].sort_values("season").reset_index(drop=True)
    out = io_utils.round_cols(out, {"median_dead_money_usd": 0,
                                    "total_dead_money_usd": 0})
    out = io_utils.as_int64(out, [
        "chosen_n_teams", "n_candidate_snapshots", "median_dead_money_usd",
        "total_dead_money_usd",
    ])
    out["resolvable"] = out["resolvable"].astype(bool)
    out["resolved"] = out["resolved"].astype(bool)
    return out


# --------------------------------------------------------------------------- #
# dead_money_display — render-ready, one row per (season, team), 2013-2025.
# --------------------------------------------------------------------------- #
def _ledger_by_team_season(led: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for r in led.itertuples():
        seasons = [int(s) for s in str(r.seasons).split("-")]
        span = list(range(seasons[0], seasons[-1] + 1))
        split = ("" if pd.isna(r.split_by_season) else str(r.split_by_season)).strip()
        parts = [int(x) for x in split.split("/")] if split else []
        for i, s in enumerate(span):
            rows.append({
                "season": s, "team": r.team, "ledger_player": r.player,
                "ledger_usd": parts[i] if parts and i < len(parts) else np.nan,
                "ledger_total_usd": int(r.total_usd),
                "ledger_split_established": bool(parts),
            })
    d = pd.DataFrame(rows)
    return (d.groupby(["season", "team"], as_index=False)
              .agg(ledger_n_charges=("ledger_player", "size"),
                   ledger_players=("ledger_player", lambda s: "; ".join(sorted(s))),
                   ledger_usd_attributed=("ledger_usd", "sum"),
                   ledger_split_all_established=("ledger_split_established", "all")))


def build_display(dm: pd.DataFrame, cap: pd.DataFrame,
                  led: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    lo, hi = config.TIER2_WINDOW
    dm = dm[dm["season"].between(lo, hi)].copy()
    same, snap = resolve_same_stage(dm)
    assert_pinned_resolution(snap)
    covered = set(snap["season"])

    grid = cap[["season", "team", "team_adjusted_cap_implied", "league_cap"]].copy()
    grid = grid[grid["season"].between(lo, hi)]

    out = grid.merge(
        same.rename(columns={
            "dead_money_rec": "dead_money_usd",
            "dm_rec_asof_date": "asof_date",
            "dm_rec_asof_stage": "asof_stage",
        }), on=["season", "team"], how="left")

    out["state"] = np.where(out["season"].isin(covered), "value", "blank")
    out["blank_reason"] = np.where(
        out["state"] == "blank", config.BLANK_REASON_NO_DM_TABLE, "")
    out["coverage"] = np.where(out["state"] == "value", "full32", "")
    out["season_coverage"] = np.where(
        out["season"].isin(covered), "full32", "leaders_only")

    # The four blank seasons still have published leaders. Those render as a
    # "biggest hits" leaderboard LABELLED AS SUCH, never as a 32-team view with
    # 22+ silent gaps (SPEC.md §2.1). The values ride along on their own columns
    # so no code path can mistake them for the season's team reading.
    leaders = dm[~dm["season"].isin(covered)].sort_values(
        ["season", "team", "asof_date"]).groupby(["season", "team"], as_index=False).last()
    leaders = leaders.rename(columns={
        "dead_money_usd": "leaders_only_usd", "asof_date": "leaders_only_asof_date",
        "asof_stage": "leaders_only_asof_stage", "coverage": "leaders_only_coverage",
        "source_url": "leaders_only_source_url", "license_tier": "leaders_only_license_tier",
    })[["season", "team", "leaders_only_usd", "leaders_only_asof_date",
        "leaders_only_asof_stage", "leaders_only_coverage",
        "leaders_only_source_url", "leaders_only_license_tier"]]
    out = out.merge(leaders, on=["season", "team"], how="left")

    # Alternate readings: how many OTHER dated snapshots exist for this
    # team-season. The UI shows them on request, never averaged, never merged.
    alt = dm.groupby(["season", "team"], as_index=False).size().rename(
        columns={"size": "n_readings"})
    out = out.merge(alt, on=["season", "team"], how="left")
    out["n_readings"] = out["n_readings"].fillna(0).astype(int)
    out["n_alternate_readings"] = (out["n_readings"] - 1).clip(lower=0)

    out = out.merge(
        snap[["season", "median_dead_money_usd", "badge"]].rename(
            columns={"median_dead_money_usd": "league_median_usd"}),
        on="season", how="left")

    # Burden denominator = implied adjusted cap — the cap the team actually
    # operated against (DECISIONS 25). The league-cap version ships beside it as
    # a labelled secondary readout.
    out["burden_of_adjusted_cap"] = out["dead_money_usd"] / out["team_adjusted_cap_implied"]
    out["burden_of_league_cap"] = out["dead_money_usd"] / out["league_cap"]

    out = out.merge(_ledger_by_team_season(led), on=["season", "team"], how="left")
    out["ledger_n_charges"] = out["ledger_n_charges"].fillna(0).astype(int)
    out["ledger_players"] = out["ledger_players"].fillna("")
    out["ledger_split_all_established"] = out["ledger_split_all_established"].fillna(
        False).astype(bool)

    # `license_tier` describes the reading the row actually carries, so it is
    # populated for a leaders-only row in a blank season too — it is the field
    # the DEAD_MONEY_TIER filter and the takedown runbook key on, and a row with
    # a value must always declare its licensing tier. It is empty only where the
    # row carries no reading of any kind (a team outside a blank season's
    # published leaders list).
    out["license_tier"] = out["license_tier"].fillna(
        out["leaders_only_license_tier"]).fillna("")
    out["source_url"] = out["source_url"].fillna(
        out["leaders_only_source_url"]).fillna("")
    out["note"] = out["note"].fillna("")
    out["asof_date"] = out["asof_date"].fillna("")
    out["asof_stage"] = out["asof_stage"].fillna("")
    out["badge"] = out["badge"].fillna("")

    out = out[[
        "season", "team", "state", "dead_money_usd", "asof_date", "asof_stage",
        "coverage", "license_tier", "badge", "blank_reason",
        "league_median_usd", "burden_of_adjusted_cap", "burden_of_league_cap",
        "team_adjusted_cap_implied", "league_cap",
        "season_coverage", "n_alternate_readings",
        "leaders_only_usd", "leaders_only_asof_date", "leaders_only_asof_stage",
        "leaders_only_coverage", "leaders_only_license_tier", "leaders_only_source_url",
        "ledger_n_charges", "ledger_players", "ledger_usd_attributed",
        "ledger_split_all_established",
        "source_url", "note",
    ]].sort_values(["season", "team"]).reset_index(drop=True)

    out = io_utils.round_cols(out, {
        "dead_money_usd": 0, "league_median_usd": 0, "leaders_only_usd": 0,
        "team_adjusted_cap_implied": 0, "league_cap": 0, "ledger_usd_attributed": 0,
        "burden_of_adjusted_cap": 6, "burden_of_league_cap": 6,
    })
    out = io_utils.as_int64(out, [
        "dead_money_usd", "league_median_usd", "leaders_only_usd",
        "team_adjusted_cap_implied", "league_cap", "ledger_usd_attributed",
    ])

    io_utils.assert_rows(out, "dead_money_display")
    assert_full_32(out["team"], "dead_money_display")
    # Rule 1: a value row without a date is a bug.
    bad = out[(out["state"] == "value") & (out["asof_date"] == "")]
    if len(bad):
        raise AssertionError(f"{len(bad)} value rows without an asof_date")
    # Blank rows carry the reason string, never a dash, a zero or an empty cell.
    blanks = out[out["state"] == "blank"]
    if blanks["dead_money_usd"].notna().any():
        raise AssertionError("a blank row carries a value")
    if (blanks["blank_reason"] != config.BLANK_REASON_NO_DM_TABLE).any():
        raise AssertionError("a blank row is missing the approved reason string")
    # Every row that carries a reading declares its licensing tier.
    carries = out["dead_money_usd"].notna() | out["leaders_only_usd"].notna()
    if (out.loc[carries, "license_tier"] == "").any():
        raise AssertionError("a row with a reading has no license_tier")
    if not out["license_tier"].isin(list(config.LICENSE_TIERS) + [""]).all():
        raise AssertionError("license_tier vocabulary drifted")

    stats = {
        "covered_seasons": sorted(int(s) for s in covered),
        "blank_seasons": sorted(int(s) for s in set(out["season"]) - covered),
        "value_rows": int((out["state"] == "value").sum()),
        "blank_rows": int((out["state"] == "blank").sum()),
        "leaders_rows_in_blank_seasons": int(out["leaders_only_usd"].notna().sum()),
        "snapshots": snap.assign(
            median_dead_money_M=(snap["median_dead_money_usd"] / 1e6).round(1)
        )[["season", "asof_date", "asof_stage", "badge", "median_dead_money_M"]]
            .to_dict("records"),
    }
    return out, stats


# --------------------------------------------------------------------------- #
# mart entry points
# --------------------------------------------------------------------------- #
def mart_dead_money_team_season(ctx) -> pd.DataFrame:
    out = load_team_season()
    ctx.note_source("curated dead_money_team_season.csv (press snapshots)",
                    rows=len(out), window=f"tier={config.DEAD_MONEY_TIER}")
    if ctx.verbose:
        print("  license tiers: "
              + " · ".join(f"{k} {v}" for k, v in
                           sorted(out['license_tier'].value_counts().items())))
    return out


def mart_dead_money_ledger(ctx) -> pd.DataFrame:
    out = load_ledger()
    ctx.note_source("curated dead_money_ledger.csv (ESPN/RMS + press)",
                    rows=len(out), window="2017-2027 charges")
    return out


def mart_dead_money_snapshot_resolution(ctx) -> pd.DataFrame:
    dm = load_team_season()
    out = build_snapshot_resolution(dm)
    ctx.note_source("curated dead_money_team_season.csv",
                    rows=len(dm), window=f"tier={config.DEAD_MONEY_TIER}")
    if ctx.verbose:
        for r in out.itertuples():
            if r.resolved:
                print(f"    {r.season} -> {r.chosen_asof_date} {r.chosen_asof_stage:<11}"
                      f" badge={r.badge:<11} ({r.n_candidate_snapshots} full32 "
                      f"candidate{'s' if r.n_candidate_snapshots != 1 else ''})")
            else:
                print(f"    {r.season} -> UNRESOLVED (best class "
                      f"'{r.coverage_class}') — whole-season blank")
    return out


def mart_dead_money_display(ctx) -> pd.DataFrame:
    dm = load_team_season()
    cap = io_utils.read_csv(config.MARTS / "team_season_cap.csv")
    led = load_ledger()
    out, stats = build_display(dm, cap, led)
    ctx.stats["dead_money_display"] = stats
    ctx.note_source("curated dead-money snapshots + team_season_cap",
                    rows=len(dm), window=f"tier={config.DEAD_MONEY_TIER}")
    if ctx.verbose:
        print(f"  covered seasons {stats['covered_seasons']}")
        print(f"  blank seasons   {stats['blank_seasons']} "
              f"({stats['blank_rows']} rows carry the approved reason string; "
              f"{stats['leaders_rows_in_blank_seasons']} carry a leaders-only reading)")
        for s in stats["snapshots"]:
            print(f"    {s['season']} @ {s['asof_date']} {s['asof_stage']:<11} "
                  f"badge={s['badge']:<11} median ${s['median_dead_money_M']}M")
    return out
