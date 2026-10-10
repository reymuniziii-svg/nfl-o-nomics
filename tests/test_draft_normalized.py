"""Draft return, time-normalised — `draft_pick` / `draft_class_summary`.

`w_av` is CUMULATIVE career value: a 2015 class has had a decade to accumulate
it and a 2024 class one season, so ranking classes on `return_w_av` mostly ranks
them by age. Dividing by seasons elapsed reverses the bias (careers end), so the
marts carry a draft-year index instead: 100 = the average class of that draft
year. Committed files only, no network.
"""

from __future__ import annotations

import pandas as pd
import pytest

from conftest import MARTS, rel

LAST_SEASON = 2025
MATURE_SEASONS = 4  # a full rookie contract
CLASS_CSV = MARTS / "draft_class_summary.csv"


@pytest.fixture(scope="module")
def picks() -> pd.DataFrame:
    return pd.read_csv(MARTS / "draft_pick.csv")


@pytest.fixture(scope="module")
def classes() -> pd.DataFrame:
    return pd.read_csv(CLASS_CSV)


def test_seasons_elapsed_is_draft_season_inclusive(picks, classes):
    for df in (picks, classes):
        assert (df["seasons_elapsed"] == LAST_SEASON - df["season"] + 1).all()
        assert df["seasons_elapsed"].min() == 1  # the 2025 class
    per_class = picks.groupby(["season", "team"])["seasons_elapsed"].nunique()
    assert (per_class == 1).all()


def test_draft_index_is_return_over_draft_year_mean(classes):
    year_mean = classes.groupby("season")["return_w_av"].transform("mean")
    expected = classes["return_w_av"] / year_mean * 100.0
    assert (expected - classes["draft_index"]).abs().max() <= 5e-5
    means = classes.groupby("season")["draft_index"].mean()
    assert (means - 100.0).abs().max() <= 5e-5, means[(means - 100).abs() > 5e-5]


def test_maturity_splits_at_a_full_rookie_contract(classes):
    early = classes["maturity"] == "early"
    assert (early == (classes["seasons_elapsed"] < MATURE_SEASONS)).all()
    assert set(classes.loc[early, "season"]) == {2023, 2024, 2025}
    assert classes.loc[~early, "season"].max() == 2022


def test_draft_index_rank_is_one_to_n_within_year(classes):
    assert classes["draft_index_rank"].notna().all()
    for season, g in classes.groupby("season"):
        r = g["draft_index_rank"].astype(int)
        assert r.min() == 1 and r.max() <= len(g) <= 32, (
            f"{rel(CLASS_CSV)} {season}: ranks {r.min()}..{r.max()} over {len(g)}")
        assert int(g.loc[g["draft_index"].idxmax(), "draft_index_rank"]) == 1
        expected = g["draft_index"].rank(ascending=False, method="min").astype(int)
        assert (expected == r).all()
