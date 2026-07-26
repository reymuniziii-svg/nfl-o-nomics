"""YIELD/YARD production ETL.

`ARCHITECTURE.md` §4. Python 3.11, offline, idempotent, byte-stable. Reads
nflverse releases (remotely, via DuckDB httpfs) and the curated CSVs in
`data/curated/`; writes `data/marts/*.csv`, which is the entire contract surface
between this package and the TypeScript app (`SPEC.md` §7).

Run: `python -m etl.pipeline [--mart NAME]`.
"""

__all__ = ["config", "team_codes"]
