"""Remote source access — DuckDB `httpfs`, exactly the audited pattern.

`DECISIONS.md` 7: *DuckDB `httpfs` remote scan; `data/raw/` stays empty.* The pbp
files carry 372 columns and we read six; nothing needs to land on disk. DuckDB's
httpfs is pointed at `HTTPS_PROXY` and `/root/.ccr/ca-bundle.crt` and **TLS
verification stays enabled**. This is the established pattern in every audit
script and `ARCHITECTURE.md` §4.1 says it is not re-litigated.

`--download` survives as a one-file-at-a-time fallback that deletes each file
immediately after loading, for environments where httpfs cannot follow GitHub's
signed release-asset redirects.
"""

from __future__ import annotations

import io
import os
import sys
import time
from pathlib import Path

import pandas as pd
import requests

from . import config


def duck_connect():
    """DuckDB connection with httpfs configured for the outbound agent proxy."""
    import duckdb

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs;")
    proxy = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy") or ""
    proxy = proxy.replace("https://", "").replace("http://", "").rstrip("/")
    if proxy:
        con.execute(f"SET http_proxy='{proxy}';")
    if Path(config.CA_BUNDLE).exists():
        # Trust the proxy CA -- never disable verification.
        try:
            con.execute(f"SET ca_cert_file='{config.CA_BUNDLE}';")
        except Exception as exc:  # pragma: no cover
            print(f"  [warn] could not set ca_cert_file: {exc}", file=sys.stderr)
    con.execute("SET enable_progress_bar=false;")
    return con


def retry(fn, label: str, attempts: int = config.HTTP_RETRIES):
    last = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as exc:
            last = exc
            print(f"  [retry {i + 1}/{attempts}] {label}: {exc}", file=sys.stderr)
            time.sleep(3 * (i + 1))
    raise RuntimeError(f"failed: {label}: {last}")


def scan_parquet(con, url: str, table: str, columns: str = "*", *,
                 download: bool = False) -> None:
    """Materialize a remote parquet into `table`, projecting `columns` only.

    With `download=True` the file lands in `data/raw/` and is deleted in a
    `finally` — the raw file never outlives the load, so `data/raw/` is empty at
    rest either way.
    """
    def _remote():
        con.execute(
            f"CREATE OR REPLACE TABLE {table} AS "
            f"SELECT {columns} FROM read_parquet('{url}')"
        )

    def _download():
        config.RAW.mkdir(parents=True, exist_ok=True)
        path = config.RAW / url.rsplit("/", 1)[-1]
        try:
            with requests.get(url, stream=True, timeout=config.HTTP_TIMEOUT_S) as r:
                r.raise_for_status()
                with open(path, "wb") as fh:
                    for chunk in r.iter_content(chunk_size=1 << 20):
                        fh.write(chunk)
            con.execute(
                f"CREATE OR REPLACE TABLE {table} AS "
                f"SELECT {columns} FROM read_parquet('{path.as_posix()}')"
            )
        finally:
            if path.exists():
                path.unlink()

    retry(_download if download else _remote, label=f"scan {url}")


def scan_parquet_temp(con, url: str, table: str, columns: str = "*", *,
                      download: bool = False) -> None:
    """As `scan_parquet`, into a TEMP table (per-season pbp loading)."""
    def _remote():
        con.execute(
            f"CREATE OR REPLACE TEMP TABLE {table} AS "
            f"SELECT {columns} FROM read_parquet('{url}')"
        )

    if download:
        return scan_parquet(con, url, table, columns, download=True)
    retry(_remote, label=f"scan {url}")


def url_exists(url: str) -> bool:
    """Existence probe. NOTE: an HTTP 200 is not coverage — the 2012 snap-count
    asset returns 200 and contains zero rows (`DATA_AUDIT.md` §6 trap 6).
    Always check row counts as well."""
    try:
        return requests.head(url, allow_redirects=True, timeout=60).status_code == 200
    except requests.RequestException:
        return False


def fetch_csv(url: str) -> pd.DataFrame:
    r = requests.get(url, timeout=90)
    r.raise_for_status()
    return pd.read_csv(io.StringIO(r.text))


def fetch_text(url: str) -> str:
    r = requests.get(url, timeout=90)
    r.raise_for_status()
    return r.text
