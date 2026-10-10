"""Shared fixtures and helpers for the YIELD/YARD CI test harness.

Everything here reads COMMITTED FILES ONLY. No test in this suite may perform a
network fetch: CI runs with no secrets and no outbound access, and a golden test
that re-pulls a remote asset is testing the internet, not the pipeline.

Reference documents:
  DATA_AUDIT.md  §3  — the 18 golden tests (external values + tolerances)
  DATA_AUDIT.md  §4  — the 11 structural tests
  SPEC.md        §7  — mart data contracts
  ARCHITECTURE.md §12 — testing strategy
"""

from __future__ import annotations

import ast
import functools
import re
from pathlib import Path

import pandas as pd
import pytest

# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------

REPO = Path(__file__).resolve().parents[1]
MARTS = REPO / "data" / "marts"
CURATED = REPO / "data" / "curated"
STAGING = CURATED / "staging"
AUDIT = REPO / "audit"

# Directories searched, in order, when resolving a mart by filename.
DATA_DIRS = (MARTS, CURATED)

# --------------------------------------------------------------------------
# Tolerances — DATA_AUDIT.md §3
# --------------------------------------------------------------------------

MONEY_TOL = 0.01  # +/-1% for money
EXACT = 0  # wins, records, point differential, cap ceilings, draft position, snaps


# --------------------------------------------------------------------------
# Loading
# --------------------------------------------------------------------------


@functools.lru_cache(maxsize=None)
def _read_csv(path_str: str) -> pd.DataFrame:
    return pd.read_csv(path_str)


def load(relpath: str) -> pd.DataFrame:
    """Load a committed CSV relative to the repo root. Fails loudly if absent."""
    p = REPO / relpath
    if not p.exists():
        raise FileNotFoundError(f"required committed file missing: {relpath}")
    return _read_csv(str(p)).copy()


def find_mart(*candidates: str) -> Path | None:
    """Resolve the first existing file among `candidates` in data/marts then data/curated.

    Candidate names may be bare stems ("capplus_official") or include an
    extension. Bare stems try .csv then .parquet, so a mart landing in either
    format is picked up automatically.
    """
    for name in candidates:
        stems = [name] if "." in Path(name).name else [f"{name}.csv", f"{name}.parquet"]
        for stem in stems:
            for d in DATA_DIRS:
                p = d / stem
                if p.exists():
                    return p
    return None


def read_any(path: Path) -> pd.DataFrame:
    if path.suffix == ".parquet":
        return pd.read_parquet(path)
    return _read_csv(str(path)).copy()


def rel(path: Path) -> str:
    try:
        return str(path.relative_to(REPO))
    except ValueError:  # pragma: no cover
        return str(path)


# --------------------------------------------------------------------------
# Assertion helpers
# --------------------------------------------------------------------------


def assert_exact(actual, expected, label: str) -> None:
    """Exact-tolerance assertion (wins, records, point diff, cap ceilings,
    draft position, snap counts). A delta of one fails the build."""
    assert actual == expected, (
        f"{label}: pipeline={actual!r} external={expected!r} "
        f"delta={_delta(actual, expected)} — tolerance is EXACT (DATA_AUDIT §3)"
    )


def assert_money(actual, expected, label: str, tol: float = MONEY_TOL) -> None:
    """+/-1% money assertion (DATA_AUDIT §3). Deltas are currently $0 on every
    money check; the tolerance exists for source revision, not for slop."""
    actual = float(actual)
    expected = float(expected)
    if expected == 0:
        assert actual == 0, f"{label}: expected $0, pipeline=${actual:,.2f}"
        return
    pct = abs(actual - expected) / abs(expected)
    assert pct <= tol, (
        f"{label}: pipeline=${actual:,.2f} external=${expected:,.2f} "
        f"delta=${actual - expected:,.2f} ({pct:.4%}) — tolerance is +/-{tol:.0%}"
    )


def _delta(actual, expected):
    try:
        return actual - expected
    except TypeError:
        return "n/a"


def one_row(df: pd.DataFrame, label: str, **eq) -> pd.Series:
    """Select exactly one row by equality filters; assert the selection is unique."""
    mask = pd.Series(True, index=df.index)
    for col, val in eq.items():
        mask &= df[col] == val
    sel = df[mask]
    assert len(sel) == 1, (
        f"{label}: expected exactly 1 row for {eq}, found {len(sel)}"
    )
    return sel.iloc[0]


# --------------------------------------------------------------------------
# Committed audit receipts
#
# Golden tests 17 (Brady draft position) and 18 (Tomlinson snaps) score against
# the draft and snap-count assets. Those marts are not built yet (BUILD_PLAN
# Phase 1 item 4) and data/raw/ is empty by design, so the only committed
# pipeline value for them is the recomputation recorded in
# audit/findings_support_datasets.md at assembly time.
#
# These helpers parse that receipt. The tests prefer a real mart the moment one
# lands and fall back to the receipt until then — neither route touches the
# network.
# --------------------------------------------------------------------------


@functools.lru_cache(maxsize=1)
def support_findings_text() -> str:
    p = AUDIT / "findings_support_datasets.md"
    if not p.exists():
        pytest.fail(
            "audit/findings_support_datasets.md is missing — it is the committed "
            "receipt for golden tests 17 and 18 until the draft and snap marts land"
        )
    return p.read_text(encoding="utf-8")


@functools.lru_cache(maxsize=1)
def brady_receipt() -> dict:
    """Parse the Tom Brady golden-check dict from the committed audit receipt."""
    text = support_findings_text()
    m = re.search(
        r"GOLDEN CHECK -- Tom Brady 2000[^\n]*\n\s*(\{.*?\})\s*\n", text, re.S
    )
    assert m, "Brady golden-check block not found in audit/findings_support_datasets.md"
    return ast.literal_eval(m.group(1))


@functools.lru_cache(maxsize=1)
def tomlinson_receipt() -> dict:
    """Parse the Laken Tomlinson golden-check figures from the committed receipt."""
    text = support_findings_text()
    block = re.search(
        r"GOLDEN CHECK -- Laken Tomlinson.*?(?=\n=====)", text, re.S
    )
    assert block, "Tomlinson golden-check block not found in audit receipt"
    b = block.group(0)
    m = re.search(
        r"pipeline=([\d,]+)\s+expected=([\d,]+)\s+delta=([+-][\d,]+)\s+"
        r"avg offense_pct=([\d.]+)\s+games=(\d+)",
        b,
    )
    assert m, f"could not parse Tomlinson figures from receipt block:\n{b[:400]}"
    return {
        "off_snaps": int(m.group(1).replace(",", "")),
        "expected": int(m.group(2).replace(",", "")),
        "delta": int(m.group(3).replace(",", "")),
        "avg_off_pct": float(m.group(4)),
        "games": int(m.group(5)),
        "game_type": "REG" if "REG" in b else None,
    }


# --------------------------------------------------------------------------
# Fixtures — the committed marts and curated files
# --------------------------------------------------------------------------


@pytest.fixture(scope="session")
def results() -> pd.DataFrame:
    """data/marts/team_season_results.csv — 861 rows, grain (season, team)."""
    return load("data/marts/team_season_results.csv")


@pytest.fixture(scope="session")
def epa() -> pd.DataFrame:
    """data/marts/team_season_epa.csv — 861 rows, grain (season, team)."""
    return load("data/marts/team_season_epa.csv")


@pytest.fixture(scope="session")
def cap() -> pd.DataFrame:
    """data/marts/team_season_cap.csv — 416 rows, 2013-2025."""
    return load("data/marts/team_season_cap.csv")


@pytest.fixture(scope="session")
def league_cap() -> pd.DataFrame:
    """data/curated/league_cap.csv — 32 rows, 1994-2025 (2010 null)."""
    return load("data/curated/league_cap.csv")


@pytest.fixture(scope="session")
def dm_ledger() -> pd.DataFrame:
    """data/curated/dead_money_ledger.csv — 21 marquee charges."""
    return load("data/curated/dead_money_ledger.csv")


@pytest.fixture(scope="session")
def dm_team_season() -> pd.DataFrame:
    """data/curated/dead_money_team_season.csv — 402 dated snapshot rows."""
    return load("data/curated/dead_money_team_season.csv")


@pytest.fixture(scope="session")
def coaching() -> pd.DataFrame:
    """data/curated/coaching_staff.csv — 2,612 rows over 830 team-seasons."""
    return load("data/curated/coaching_staff.csv")


@pytest.fixture(scope="session")
def contracts_golden() -> pd.DataFrame:
    """data/curated/staging/contracts_golden_checks.csv — the nflverse-route
    recomputation of golden tests 12, 13 and 16b, recorded at assembly time."""
    return load("data/curated/staging/contracts_golden_checks.csv")


@pytest.fixture(scope="session")
def dm_nflverse_probe() -> pd.DataFrame:
    """data/curated/staging/contracts_deadmoney_probe.csv — the five inference
    routes and eight further separations tested against nflverse contracts."""
    return load("data/curated/staging/contracts_deadmoney_probe.csv")
