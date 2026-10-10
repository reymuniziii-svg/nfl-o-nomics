"""Dead money — `dead_money_team_season` (+ `license_tier`), `dead_money_display`.

Promoted from `audit/build_deadmoney_curated.py`. The curated CSVs in
`data/curated/` are the source of record and are **not rewritten here**; this
module reads them, adds the one column ETL owes them, applies the runtime tier
filter, and emits the render-ready view.

Two curated inputs (DECISIONS 112, 113):

* `dead_money_team_season.csv` — the dated press readings. Every value in it is
  a measurement.
* `dead_money_estimated.csv` — written by `etl/deadmoney_estimate.py`, one
  32-team table for each season that has no league-wide reading (2016, 2020,
  2021). Published readings are carried as-is; the rest are modeled, each with
  an 80% range. A season falls back to it only when it has no `full32`
  snapshot, and the whole file withdraws under `DEAD_MONEY_TIER='safe'`
  because the model trains on full-tier tables (`audit/findings_deadmoney_estimate.md` §6).

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
# Row counts reproduce DATA_AUDIT.md §5 (69 / 45 / 64 / 192 = 370) plus the
# 2013 Houston Press table added 2026-10-10.
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

# ---- Added 2026-10-10 (DECISIONS 112, 113). -------------------------------
LICENSE_TIER_BY_URL.update({
    # 2013 full-32 table, "h/t spotrac.com": a Spotrac reproduction.
    "https://www.houstonpress.com/news/nfl-free-agency-2013-dead-money-overview-6738609/": "REVIEW_SPOTRAC",
    # 2020-03-25 top-10, "figures from OverTheCap". Carried only as published
    # rows inside the 2020 estimated table, never in dead_money_team_season.
    # Tiered REVIEW_OTC, the conservative reading of an OTC reproduction.
    "https://www.nbcsportsboston.com/nfl/new-england-patriots/nfl-salary-cap-patriots-rank-among-leaders-in-dead-money-for-2020/387780": "REVIEW_OTC",
})

#: Expected tier counts: DATA_AUDIT.md §5 (69 / 45 / 64 / 192 = 370) plus the
#: 32 rows of the 2013 Houston Press table (REVIEW_SPOTRAC). Asserted.
EXPECTED_TIER_ROWS = {
    "SAFE_LEAGUE": 69, "SAFE_EDITORIAL": 45,
    "REVIEW_SPOTRAC": 96, "REVIEW_OTC": 192,
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


ESTIMATED_PATH = config.CURATED / "dead_money_estimated.csv"
ESTIMATED_COLUMNS = ["season", "team", "dead_money_usd_est", "lo_usd", "hi_usd", "method",
                     "anchor_used", "features_note", "anchor_asof_date", "ref_asof_date",
                     "ref_asof_stage", "source_url"]
#: Estimator methods. The first three are real readings carried as-is; the
#: last is the only modeled value.
EST_METHODS_PUBLISHED = ("measured_full32", "reading_ref_date", "reading_other_date")
EST_METHOD_MODELED = "ridge_z_anchor_level"


def load_estimated(*, tier: str | None = None) -> pd.DataFrame:
    """The curated estimate, restricted to the seasons it fills.

    Empty under the SAFE-only reversal: the model trains on full-tier tables,
    so the whole estimate withdraws with them. Published rows carry their
    source's licence tier (by exact URL, like every curated reading); modeled
    rows carry `config.MODELED_LICENSE_TIER`.
    """
    tier = config.DEAD_MONEY_TIER if tier is None else tier
    est = io_utils.read_csv(ESTIMATED_PATH)
    if list(est.columns) != ESTIMATED_COLUMNS:
        raise AssertionError(f"dead_money_estimated columns drifted: {list(est.columns)}")
    io_utils.assert_rows(est, "dead_money_estimated")
    if est.groupby("season")["team"].nunique().ne(32).any():
        raise AssertionError("dead_money_estimated is not 32 teams per season")
    if not est["method"].isin(EST_METHODS_PUBLISHED + (EST_METHOD_MODELED,)).all():
        raise AssertionError("dead_money_estimated: unknown method")
    est["anchor_used"] = est["anchor_used"].astype(str).str.lower().eq("true")
    if (est["anchor_used"] != est["method"].isin(EST_METHODS_PUBLISHED)).any():
        raise AssertionError("dead_money_estimated: anchor_used disagrees with method")
    est = est[est["season"].isin(config.CAPPLUS_ESTIMATED_SEASONS)].copy()
    if tier != "full":
        return est.iloc[0:0].assign(license_tier=pd.Series(dtype="object"))

    pub = est["anchor_used"]
    if (est.loc[pub, "source_url"].isna() | est.loc[pub, "anchor_asof_date"].isna()).any():
        raise AssertionError("a published row in the estimate has no source_url/date")
    if est.loc[~pub, "source_url"].notna().any() or est.loc[~pub, "anchor_asof_date"].notna().any():
        raise AssertionError("a modeled row in the estimate claims a source reading")
    unmapped = sorted(set(est.loc[pub, "source_url"]) - set(LICENSE_TIER_BY_URL))
    if unmapped:
        raise AssertionError(f"dead_money_estimated: source_url with no licensing tier: {unmapped}")
    est["license_tier"] = np.where(pub, est["source_url"].map(LICENSE_TIER_BY_URL),
                                   config.MODELED_LICENSE_TIER)
    n_pub = est[pub].groupby("season").size().to_dict()
    if {int(k): int(v) for k, v in n_pub.items()} != config.ESTIMATED_PUBLISHED_TEAMS:
        raise AssertionError(f"published teams per estimated season drifted: {n_pub}")
    # Ranges bracket the value; a published value is a point.
    if ((est["lo_usd"] > est["dead_money_usd_est"])
            | (est["hi_usd"] < est["dead_money_usd_est"])).any():
        raise AssertionError("an estimate falls outside its own range")
    if ((est.loc[pub, "lo_usd"] != est.loc[pub, "dead_money_usd_est"])
            | (est.loc[pub, "hi_usd"] != est.loc[pub, "dead_money_usd_est"])).any():
        raise AssertionError("a published row in the estimate carries a range")
    return est.reset_index(drop=True)


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
#      season whose best class is anything else does NOT resolve on a
#      measurement (step 4 decides what it gets instead) — standardising a
#      season in which only the five worst offenders are observed would rate
#      them against nothing.
#   2. Among those, take the **LATEST `asof_date`**. A table published after the
#      league year has opened is the more complete accounting of that season's
#      charges (DECISIONS 15).
#   3. **Record the chosen `asof_date` + `asof_stage` per season** in the emitted
#      resolution table (`dead_money_snapshot_resolution`), so the choice is data
#      the tests can assert rather than behaviour buried in a function.
#   4. **No full32 snapshot → the curated estimate** (DECISIONS 113). A season
#      with no league-wide reading resolves to `dead_money_estimated.csv` when
#      one is supplied, as of its reference date and stage, badged `estimated`
#      and recorded as coverage class `estimated`. Without it (the SAFE-only
#      reversal, or a caller that wants measurements only) the season does not
#      resolve and blanks whole-season, exactly as before.
#
# Verified consequences, asserted in `assert_pinned_resolution` below:
#   * 2018 resolves to **2018-07-14** (two full32 candidates; latest wins).
#   * 2019 resolves to **2019-03-10** (the 2019-05-16 Forbes rows are `partial`,
#     14 teams, and lose at step 1 — not at step 2). The two seasons are resolved
#     under the SAME rule, not opposite date rules.
#   * 2013 resolves to **2013-03-18**, the Houston Press full-32 table (the NFP
#     2013-12-06 rows are `top5` and lose at step 1).
#   * Three seasons are `provisional`: 2014 and 2019 (published before the
#     league year opened) and 2013 (one week into it — a one-season override
#     of the badge, since the date rule alone would call it `preseason`).
#   * 2016, 2020, 2021 resolve to the estimate at 2016-10-05, 2020-06-02 and
#     2021-09-06.
#
# Began as a deliberate copy of `audit/capplus_backtest.resolve_dead_money_same_stage`,
# minus its hard assertion that the covered-season tuple is exactly the nine.
# The cross-check against that original retired with the 2026-10-10 rulings
# (DECISIONS 114): the audit function asserts the July 2026 nine-season tuple,
# which 2013 now breaks by design. The pinned outcomes below are the guard.
# --------------------------------------------------------------------------- #
#: Coverage classes, broadest first. Step 1 of the pinned rule.
COVERAGE_RANK = {"full32": 0, "partial": 1, "top5": 2}
#: Only this class is a league-wide reading a season may resolve on.
RESOLVABLE_COVERAGE = "full32"
#: The coverage class recorded for a season resolved from the estimate.
ESTIMATED_COVERAGE = "estimated"
#: The pinned outcomes. A change here is a data change, not a refactor.
PINNED_RESOLUTION = {
    2013: "2013-03-18",
    2014: "2014-02-18", 2015: "2015-10-28", 2017: "2017-07-05",
    2018: "2018-07-14", 2019: "2019-03-10", 2022: "2022-07-05",
    2023: "2023-07-14", 2024: "2024-11-27", 2025: "2025-12-17",
}
#: The estimate's reference dates (one dated table per season).
PINNED_ESTIMATED = {2016: "2016-10-05", 2020: "2020-06-02", 2021: "2021-09-06"}
RULE_TEXT = ("broadest coverage class (full32) then latest asof_date; "
             "no full32 table -> the curated estimate")


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


def _badge_reason(badge: str, season: int, n_published: int) -> str:
    if badge == "provisional":
        return config.PROVISIONAL_BADGE_OVERRIDE.get(int(season), config.PROVISIONAL_BADGE_COPY)
    if badge == "estimated":
        return config.ESTIMATED_BADGE_COPY.format(n=int(n_published))
    return ""


def resolve_same_stage(dm: pd.DataFrame, est: pd.DataFrame | None = None
                       ) -> tuple[pd.DataFrame, pd.DataFrame]:
    """One 32-team dead-money table per season, plus the per-season record.

    `dm` is the (tier-filtered) curated readings. `est`, when supplied, is
    `load_estimated()`: seasons without a full32 snapshot fall back to it.
    Every returned row carries its provenance: `method`, `anchor_asof_date`
    (the real reading's date; null where modeled), `lo_usd`/`hi_usd` (the 80%
    range, estimated seasons only) and `is_modeled`.
    """
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
    # 2019 (Mar 10) — plus 2013 (Mar 18, one week in) by a one-season override.
    # A July preseason table is after the league year opened.
    opens = pd.to_datetime(snap["season"].astype(str) + config.LEAGUE_YEAR_OPENS_MMDD)
    early = (snap["asof_date"] < opens) | snap["season"].isin(
        list(config.PROVISIONAL_BADGE_OVERRIDE))
    snap["badge"] = np.where(
        early, "provisional",
        np.where(snap["asof_stage"] == "preseason", "preseason", "in_season"))
    snap["asof_date"] = snap["asof_date"].dt.strftime("%Y-%m-%d")
    snap["coverage_class"] = RESOLVABLE_COVERAGE
    snap["n_published_teams"] = snap["teams"]

    out = full.rename(columns={"dead_money_usd": "dead_money_rec",
                               "asof_date": "dm_rec_asof_date",
                               "asof_stage": "dm_rec_asof_stage"})
    out["dm_rec_asof_date"] = out["dm_rec_asof_date"].dt.strftime("%Y-%m-%d")
    out["method"] = "measured"
    out["anchor_asof_date"] = out["dm_rec_asof_date"]
    out["lo_usd"] = np.nan
    out["hi_usd"] = np.nan
    out["is_modeled"] = False

    # Step 4: seasons with no full32 table fall back to the curated estimate.
    if est is not None and len(est):
        fill = est[~est["season"].isin(set(snap["season"]))].copy()
        if len(fill):
            if fill.groupby("season")["ref_asof_date"].nunique().ne(1).any():
                raise AssertionError("an estimated season has more than one reference date")
            e = pd.DataFrame({
                "season": fill["season"], "team": fill["team"],
                "dead_money_rec": fill["dead_money_usd_est"].astype(float),
                "dm_rec_asof_date": fill["ref_asof_date"],
                "dm_rec_asof_stage": fill["ref_asof_stage"],
                "license_tier": fill["license_tier"],
                "source_url": fill["source_url"],
                "note": fill["features_note"],
                "method": fill["method"],
                "anchor_asof_date": fill["anchor_asof_date"],
                "lo_usd": fill["lo_usd"].astype(float),
                "hi_usd": fill["hi_usd"].astype(float),
                "is_modeled": fill["method"].eq(EST_METHOD_MODELED),
            })
            es = (e.groupby("season")
                  .agg(asof_date=("dm_rec_asof_date", "first"),
                       asof_stage=("dm_rec_asof_stage", "first"),
                       teams=("team", "nunique"),
                       median_dead_money_usd=("dead_money_rec", "median"),
                       total_dead_money_usd=("dead_money_rec", "sum"),
                       n_published_teams=("is_modeled", lambda s: int((~s).sum())))
                  .reset_index())
            es["license_tier"] = config.MODELED_LICENSE_TIER
            es["source_url"] = str(ESTIMATED_PATH.relative_to(config.REPO))
            es["n_candidate_snapshots"] = 0
            es["badge"] = "estimated"
            es["coverage_class"] = ESTIMATED_COVERAGE
            snap = pd.concat([snap, es[snap.columns]], ignore_index=True)
            out = pd.concat([out, e], ignore_index=True)

    snap["badge_reason"] = [
        _badge_reason(b, s, n) for b, s, n in
        zip(snap["badge"], snap["season"], snap["n_published_teams"])]
    snap = snap.sort_values("season").reset_index(drop=True)
    out = out[["season", "team", "dead_money_rec", "dm_rec_asof_date",
               "dm_rec_asof_stage", "license_tier", "source_url", "note",
               "method", "anchor_asof_date", "lo_usd", "hi_usd", "is_modeled"]]
    return out.sort_values(["season", "team"]).reset_index(drop=True), snap


def assert_pinned_resolution(snap: pd.DataFrame) -> None:
    """The pinned rule's outcomes, asserted. Only meaningful on the full tier —
    the `safe` reversal legitimately drops all but 2014 and 2015."""
    if config.DEAD_MONEY_TIER != "full":
        return
    meas = snap[snap["badge"] != "estimated"]
    got = dict(zip(meas["season"].astype(int), meas["asof_date"]))
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
    estd = snap[snap["badge"] == "estimated"]
    got_e = dict(zip(estd["season"].astype(int), estd["asof_date"]))
    if got_e and got_e != PINNED_ESTIMATED:
        raise AssertionError(f"estimated reference dates drifted: {got_e}")
    prov = tuple(int(s) for s in snap.loc[snap["badge"] == "provisional", "season"])
    if prov != config.CAPPLUS_PROVISIONAL_SEASONS:
        raise AssertionError(f"provisional seasons drifted: {prov}")


def build_snapshot_resolution(dm: pd.DataFrame, est: pd.DataFrame | None = None
                              ) -> pd.DataFrame:
    """`dead_money_snapshot_resolution` — the resolution table, one row per
    season in the Tier 2 window, recording what the pinned rule chose and why.

    This is the mart the contract tests assert against: the choice is data, not
    behaviour buried in a function.
    """
    lo, hi = config.TIER2_WINDOW
    d = dm[dm["season"].between(lo, hi)].copy()
    classes = coverage_classes(d)
    _, snap = resolve_same_stage(d, est)
    assert_pinned_resolution(snap)

    cand = (d.groupby(["season", "coverage"], as_index=False)["asof_date"].nunique()
             .pivot(index="season", columns="coverage", values="asof_date")
             .reindex(columns=list(COVERAGE_RANK)).fillna(0).astype(int)
             .rename(columns={c: f"n_{c}_snapshots" for c in COVERAGE_RANK})
             .reset_index())

    out = (pd.DataFrame({"season": range(lo, hi + 1)})
             .merge(classes, on="season", how="left")
             .merge(cand, on="season", how="left")
             .merge(snap.drop(columns=["coverage_class"]).rename(columns={
                 "asof_date": "chosen_asof_date", "asof_stage": "chosen_asof_stage",
                 "license_tier": "chosen_license_tier", "source_url": "chosen_source_url",
                 "teams": "chosen_n_teams"}),
                 on="season", how="left"))
    # A season resolved from the estimate records the class it resolved on.
    out.loc[out["badge"] == "estimated", "coverage_class"] = ESTIMATED_COVERAGE
    out["resolved"] = out["chosen_asof_date"].notna()
    out["rule"] = RULE_TEXT
    out["blank_reason"] = np.where(
        out["resolved"], "", config.BLANK_REASON_NO_DM_TABLE)
    for c in ("chosen_asof_date", "chosen_asof_stage", "chosen_license_tier",
              "chosen_source_url", "badge", "badge_reason", "coverage_class"):
        out[c] = out[c].fillna("")
    for c in ("n_full32_snapshots", "n_partial_snapshots", "n_top5_snapshots"):
        out[c] = out[c].fillna(0)
    out = out[[
        "season", "coverage_class", "resolvable", "resolved",
        "chosen_asof_date", "chosen_asof_stage", "badge", "badge_reason",
        "chosen_license_tier", "chosen_n_teams", "n_published_teams",
        "n_candidate_snapshots",
        "n_full32_snapshots", "n_partial_snapshots", "n_top5_snapshots",
        "median_dead_money_usd", "total_dead_money_usd",
        "rule", "blank_reason", "chosen_source_url",
    ]].sort_values("season").reset_index(drop=True)
    out = io_utils.round_cols(out, {"median_dead_money_usd": 0,
                                    "total_dead_money_usd": 0})
    out = io_utils.as_int64(out, [
        "chosen_n_teams", "n_published_teams", "n_candidate_snapshots",
        "n_full32_snapshots", "n_partial_snapshots", "n_top5_snapshots",
        "median_dead_money_usd", "total_dead_money_usd",
    ])
    out["resolvable"] = out["resolvable"].fillna(False).astype(bool)
    out["resolved"] = out["resolved"].astype(bool)
    if config.DEAD_MONEY_TIER == "full" and not out["resolved"].all():
        raise AssertionError(
            f"unresolved seasons under the full tier: "
            f"{out.loc[~out['resolved'], 'season'].tolist()}")
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


def build_display(dm: pd.DataFrame, cap: pd.DataFrame, led: pd.DataFrame,
                  est: pd.DataFrame | None = None) -> tuple[pd.DataFrame, dict]:
    """`dead_money_display` — the RESOLVED view, grain (season, team).

    **Exactly one value per team-season**, and nothing else. Under the shipping
    tier that is 416 rows: the 320 team-seasons of the ten measured full-32
    seasons (2013-2015, 2017-2019, 2022-2025) plus the 96 of the three
    estimated seasons (2016, 2020, 2021), of which 29 are published readings
    and 67 are modeled.

    Properties, each asserted below:

    1. **Every measured row is a real dated reading.** `(season, team,
       asof_date, value)` matches a row in `dead_money_team_season` — never an
       average, a merge or an interpolation of two snapshots (`SPEC.md` §2.1
       rule 3). In an estimated season a published row carries its own
       reading's date (`asof_date` = `anchor_asof_date`) and matches the
       source wherever the source holds that reading; a modeled row carries the
       season's reference date, `is_modeled = true` and its 80% range
       (`lo_usd`, `hi_usd`).
    2. **No dropped rows, and no invented ones outside the estimate.** The key
       set is the source's key set plus the estimated seasons' 32 teams.
    3. **Seasons are labelled.** `season_coverage` is `full32` (a measured
       league-wide table), `estimated` (the curated estimate) or `leaders_only`
       (a published leaderboard in a season that did not resolve — only under
       the SAFE-only reversal now). A leaders-only list is never rendered as a
       32-team view with silent gaps (`SPEC.md` §2.1).

    The whole-season blank statement lives in `dead_money_snapshot_resolution`,
    one row per season, never duplicated onto team rows.
    """
    lo, hi = config.TIER2_WINDOW
    dm = dm[dm["season"].between(lo, hi)].copy()
    same, snap = resolve_same_stage(dm, est)
    assert_pinned_resolution(snap)
    covered = set(snap["season"])
    est_seasons = set(snap.loc[snap["badge"] == "estimated", "season"])

    resolved = same.rename(columns={
        "dead_money_rec": "dead_money_usd",
        "dm_rec_asof_date": "asof_date",
        "dm_rec_asof_stage": "asof_stage",
    })
    is_est = resolved["season"].isin(est_seasons)
    # A published row in an estimated season prints its own reading's date.
    pub_est = is_est & ~resolved["is_modeled"]
    resolved.loc[pub_est, "asof_date"] = resolved.loc[pub_est, "anchor_asof_date"]
    resolved["coverage"] = np.where(is_est, ESTIMATED_COVERAGE, RESOLVABLE_COVERAGE)
    resolved["season_coverage"] = np.where(is_est, "estimated", "full32")

    # Seasons that did not resolve still have published leaders. They resolve to
    # their own latest reading, keep the source's coverage label, and are marked
    # `leaders_only` so no consumer can read them as a league-wide table.
    lead = dm[~dm["season"].isin(covered)].copy()
    lead["_rank"] = lead["coverage"].map(COVERAGE_RANK)
    lead = (lead.sort_values(["season", "team", "asof_date", "_rank"],
                             ascending=[True, True, True, True], kind="stable")
                .groupby(["season", "team"], as_index=False).last())
    lead["season_coverage"] = "leaders_only"
    lead["method"] = "measured"
    lead["anchor_asof_date"] = lead["asof_date"]
    lead["lo_usd"] = np.nan
    lead["hi_usd"] = np.nan
    lead["is_modeled"] = False
    cols = ["season", "team", "dead_money_usd", "asof_date", "asof_stage", "coverage",
            "license_tier", "source_url", "note", "season_coverage", "method",
            "anchor_asof_date", "lo_usd", "hi_usd", "is_modeled"]
    out = pd.concat([resolved[cols], lead[cols]], ignore_index=True)

    # Alternate readings: how many OTHER dated readings exist for this
    # team-season. The UI shows them on request, never averaged, never merged.
    alt = dm.groupby(["season", "team"], as_index=False).size().rename(
        columns={"size": "n_readings"})
    src_dates = set(zip(dm["season"], dm["team"], dm["asof_date"]))
    out = out.merge(alt, on=["season", "team"], how="left")
    out["n_readings"] = out["n_readings"].fillna(0).astype(int)
    in_src = [(s, t, a) in src_dates for s, t, a in
              zip(out["season"], out["team"], out["asof_date"])]
    out["n_alternate_readings"] = (out["n_readings"] - np.array(in_src, dtype=int)
                                   ).clip(lower=0).astype(int)

    out = out.merge(
        snap[["season", "median_dead_money_usd", "badge", "badge_reason"]].rename(
            columns={"median_dead_money_usd": "league_median_usd"}),
        on="season", how="left")

    # Burden denominator = implied adjusted cap — the cap the team actually
    # operated against (DECISIONS 25). The league-cap version ships beside it as
    # a labelled secondary readout; both denominators travel so the figure is
    # checkable from the row itself.
    out = out.merge(cap[["season", "team", "team_adjusted_cap_implied", "league_cap"]],
                    on=["season", "team"], how="left", validate="1:1")
    out["burden_of_adjusted_cap"] = out["dead_money_usd"] / out["team_adjusted_cap_implied"]
    out["burden_of_league_cap"] = out["dead_money_usd"] / out["league_cap"]

    out = out.merge(_ledger_by_team_season(led), on=["season", "team"], how="left")
    out["ledger_n_charges"] = out["ledger_n_charges"].fillna(0).astype(int)
    out["ledger_players"] = out["ledger_players"].fillna("")
    out["ledger_split_all_established"] = out["ledger_split_all_established"].fillna(
        False).astype(bool)
    for c in ("badge", "badge_reason", "note", "source_url", "anchor_asof_date"):
        out[c] = out[c].fillna("")
    out["is_modeled"] = out["is_modeled"].astype(bool)

    out = out[[
        "season", "team", "dead_money_usd", "asof_date", "asof_stage", "coverage",
        "license_tier", "season_coverage", "badge", "badge_reason",
        "method", "is_modeled", "anchor_asof_date", "lo_usd", "hi_usd",
        "n_alternate_readings",
        "league_median_usd", "team_adjusted_cap_implied", "league_cap",
        "burden_of_adjusted_cap", "burden_of_league_cap",
        "ledger_n_charges", "ledger_players", "ledger_usd_attributed",
        "ledger_split_all_established", "source_url", "note",
    ]].sort_values(["season", "team"]).reset_index(drop=True)

    out = io_utils.round_cols(out, {
        "dead_money_usd": 0, "league_median_usd": 0, "lo_usd": 0, "hi_usd": 0,
        "team_adjusted_cap_implied": 0, "league_cap": 0, "ledger_usd_attributed": 0,
        "burden_of_adjusted_cap": 6, "burden_of_league_cap": 6,
    })
    out = io_utils.as_int64(out, [
        "dead_money_usd", "league_median_usd", "lo_usd", "hi_usd",
        "team_adjusted_cap_implied", "league_cap", "ledger_usd_attributed",
    ])

    # Row count is tier-dependent by design. Under the shipping tier it is the
    # contracted 416; under the SAFE-only licensing reversal the estimate
    # withdraws and the mart collapses to the source's own team-seasons, which
    # is the contingency working (`RISKS.md` risk 1).
    want_keys = set(zip(dm["season"], dm["team"]))
    if est is not None:
        want_keys |= set(zip(same.loc[same["season"].isin(est_seasons), "season"],
                             same.loc[same["season"].isin(est_seasons), "team"]))
    if len(out) != len(want_keys):
        raise AssertionError(
            f"dead_money_display: {len(out)} rows != {len(want_keys)} team-seasons")
    if config.DEAD_MONEY_TIER == "full":
        io_utils.assert_rows(out, "dead_money_display")
    assert_full_32(out["team"], "dead_money_display")
    io_utils.assert_unique(out, ["season", "team"], "dead_money_display")

    # Property 1 — every measured row is a real dated source reading, and a
    # published row in an estimated season matches its source wherever the
    # source holds that reading.
    src_vals = {(int(s), t, a): int(v) for s, t, a, v in
                zip(dm["season"], dm["team"], dm["asof_date"], dm["dead_money_usd"])}
    meas = out[~out["season"].isin(est_seasons)]
    bad = [(int(r.season), r.team, r.asof_date) for r in meas.itertuples()
           if src_vals.get((int(r.season), r.team, r.asof_date)) != int(r.dead_money_usd)]
    if bad:
        raise AssertionError(
            f"{len(bad)} resolved row(s) do not correspond to any dated source "
            f"reading — snapshots must never be averaged or merged: {bad[:3]}")
    pub = out[out["season"].isin(est_seasons) & ~out["is_modeled"]]
    bad = [(int(r.season), r.team) for r in pub.itertuples()
           if (int(r.season), r.team, r.asof_date) in src_vals
           and src_vals[(int(r.season), r.team, r.asof_date)] != int(r.dead_money_usd)]
    if bad:
        raise AssertionError(f"published rows in the estimate disagree with the source: {bad}")
    if (out["is_modeled"] & ~out["season"].isin(est_seasons)).any():
        raise AssertionError("a modeled value outside the estimated seasons")
    m = out["is_modeled"]
    if out.loc[m, ["lo_usd", "hi_usd"]].isna().any().any() or (out.loc[m, "anchor_asof_date"] != "").any():
        raise AssertionError("a modeled row without its range, or with a reading date")
    if (out.loc[~m, "anchor_asof_date"] != out.loc[~m, "asof_date"]).any():
        raise AssertionError("a published row's asof_date is not its own reading's date")
    # Property 2 — no dropped rows; nothing invented outside the estimate.
    if set(zip(out["season"], out["team"])) != want_keys:
        raise AssertionError(
            "the display mart must resolve exactly the source's team-seasons plus "
            "the estimated seasons")
    # Value, date and stage always travel together.
    for col in ("dead_money_usd", "asof_date", "asof_stage", "coverage",
                "license_tier", "method"):
        if out[col].isna().any() or (out[col].astype(str) == "").any():
            raise AssertionError(f"dead_money_display: {col} must be present on every row")
    if not (out.loc[~m, "source_url"] != "").all():
        raise AssertionError("dead_money_display: a reading without its source_url")
    if not out["season_coverage"].isin(("full32", "estimated", "leaders_only")).all():
        raise AssertionError("dead_money_display: season_coverage vocabulary drifted")
    if not out["license_tier"].isin(
            list(config.LICENSE_TIERS) + [config.MODELED_LICENSE_TIER]).all():
        raise AssertionError("license_tier vocabulary drifted")
    if not out.loc[out["badge"] != "", "badge"].isin(config.CAPPLUS_BADGES).all():
        raise AssertionError("badge vocabulary drifted")

    leaders = out[out["season_coverage"] == "leaders_only"]
    estimated = out[out["season_coverage"] == "estimated"]
    stats = {
        "rows": len(out),
        "covered_seasons": sorted(int(s) for s in covered),
        "measured_seasons": sorted(int(s) for s in covered - est_seasons),
        "estimated_seasons": sorted(int(s) for s in est_seasons),
        "blank_seasons": sorted(int(s) for s in set(range(lo, hi + 1)) - covered),
        "full32_rows": int((out["season_coverage"] == "full32").sum()),
        "estimated_rows": int(len(estimated)),
        "estimated_modeled_rows": int(estimated["is_modeled"].sum()),
        "leaders_only_rows": int(len(leaders)),
        "leaders_only_by_season": {int(k): int(v) for k, v in
                                   leaders.groupby("season").size().items()},
        "blank_season_statement_lives_in": "dead_money_snapshot_resolution",
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
    est = load_estimated()
    out = build_snapshot_resolution(dm, est)
    ctx.note_source("curated dead_money_team_season.csv",
                    rows=len(dm), window=f"tier={config.DEAD_MONEY_TIER}")
    if ctx.verbose:
        for r in out.itertuples():
            if r.resolved and r.badge == "estimated":
                print(f"    {r.season} -> {r.chosen_asof_date} {r.chosen_asof_stage:<11}"
                      f" badge=estimated   ({r.n_published_teams} published, "
                      f"{32 - r.n_published_teams} modeled)")
            elif r.resolved:
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
    est = load_estimated()
    out, stats = build_display(dm, cap, led, est)
    ctx.stats["dead_money_display"] = stats
    ctx.note_source("curated dead-money snapshots + curated estimate + team_season_cap",
                    rows=len(dm) + len(est), window=f"tier={config.DEAD_MONEY_TIER}")
    if ctx.verbose:
        print(f"  {stats['rows']} resolved rows = {stats['full32_rows']} full32 "
              f"+ {stats['estimated_rows']} estimated ({stats['estimated_modeled_rows']} "
              f"modeled) + {stats['leaders_only_rows']} leaders-only")
        print(f"  covered seasons {stats['covered_seasons']}")
        print(f"  blank seasons   {stats['blank_seasons']} -> leaders-only rows "
              f"{stats['leaders_only_by_season']}; the whole-season blank statement "
              f"lives in dead_money_snapshot_resolution")
        for s in stats["snapshots"]:
            print(f"    {s['season']} @ {s['asof_date']} {s['asof_stage']:<11} "
                  f"badge={s['badge']:<11} median ${s['median_dead_money_M']}M")
    return out
