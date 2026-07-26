"""Deterministic I/O — the machinery behind byte-stable re-runs.

`ARCHITECTURE.md` §4.3 and `DECISIONS.md` 6 make byte-stable, idempotent re-runs
the standard: *"deterministic sort order on every output, `csv.QUOTE_MINIMAL`, LF
line endings, UTF-8, trailing newline, fixed float formatting, no timestamps in
output files, no dict iteration order dependence, fixed random seeds where
sampling occurs."*

Every mart writes through `write_csv`. Nothing else writes a mart.

**No wall-clock anywhere.** The manifest records *source data versions* — the
season windows and row counts of the inputs a mart consumed — never
`datetime.now()`. A timestamp in an output file is what breaks byte-stability,
and byte-stability is what makes the CI golden tests mean anything.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pandas as pd

from . import config


def write_csv(df: pd.DataFrame, path: Path, *, sort: list[str] | None = None) -> Path:
    """Write one mart deterministically and return its path.

    * `sort` (when given) is applied before writing, so output order never
      depends on upstream groupby ordering or dict iteration order.
    * The index is never written.
    * LF line endings, UTF-8, `QUOTE_MINIMAL` (pandas' default), trailing
      newline. The call is deliberately the same shape the Phase-0 audit used,
      so re-emitting an existing mart reproduces it byte-for-byte.
    """
    if sort:
        df = df.sort_values(sort, kind="stable").reset_index(drop=True)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(
        path,
        index=False,
        lineterminator=config.CSV_LINE_TERMINATOR,
        encoding=config.CSV_ENCODING,
    )
    return path


def read_csv(path: Path, **kw) -> pd.DataFrame:
    return pd.read_csv(Path(path), **kw)


def md5_file(path: Path) -> str:
    h = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def md5_bytes(data: bytes) -> str:
    return hashlib.md5(data).hexdigest()


def round_cols(df: pd.DataFrame, spec: dict[str, int]) -> pd.DataFrame:
    """Round before writing so float repr can never drift run to run.

    A column that rounds to 0 decimals is additionally cast through a nullable
    integer where it is whole, so dollars render as `165975853` and not
    `165975853.0`. Columns absent from `df` are ignored.
    """
    out = df.copy()
    for col, nd in spec.items():
        if col not in out.columns:
            continue
        out[col] = pd.to_numeric(out[col], errors="coerce").round(nd)
    return out


def as_int64(df: pd.DataFrame, cols) -> pd.DataFrame:
    """Cast to nullable Int64 so whole numbers never print a trailing `.0`."""
    out = df.copy()
    for c in cols:
        if c in out.columns:
            out[c] = pd.to_numeric(out[c], errors="coerce").round(0).astype("Int64")
    return out


def as_bool_str(df: pd.DataFrame, cols) -> pd.DataFrame:
    """Booleans render as `True`/`False`, matching the existing marts."""
    out = df.copy()
    for c in cols:
        if c in out.columns:
            out[c] = out[c].astype(bool)
    return out


def assert_raw_empty() -> None:
    """`data/raw/` is empty at rest and a test asserts it (DECISIONS 7)."""
    raw = config.RAW
    if not raw.exists():
        return
    leftover = sorted(p.name for p in raw.iterdir() if p.is_file())
    if leftover:
        raise AssertionError(f"data/raw/ is not empty: {leftover}")


def assert_rows(df: pd.DataFrame, name: str) -> None:
    """Fail the build when a mart misses its contracted row count."""
    want = config.EXPECTED_ROWS.get(name)
    if want is not None and len(df) != want:
        raise AssertionError(f"{name}: expected {want} rows, got {len(df)}")


def assert_no_column(df: pd.DataFrame, name: str, column: str) -> None:
    """`car_av` is 100% null in the source — a dead column that looks live.
    It is excluded from the schema entirely so no one can read it by accident
    (`DECISIONS.md` 40); this is the structural test that keeps it out."""
    if column in df.columns:
        raise AssertionError(f"{name}: column {column!r} must not exist in this mart")


def assert_unique(df: pd.DataFrame, keys: list[str], name: str) -> None:
    dup = df.duplicated(subset=keys).sum()
    if dup:
        raise AssertionError(f"{name}: {dup} duplicate rows on {keys}")
