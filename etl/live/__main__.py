"""CLI: `python -m etl.live resolve|build|status`."""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys

from .. import config as base
from .. import io_utils
from . import config as lc


def _github_output(values: dict) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as fh:
        for k, v in values.items():
            v = str(v).lower() if isinstance(v, bool) else str(v)
            # GITHUB_OUTPUT is line-delimited: a value carrying a line break
            # could smuggle extra outputs into the workflow. Refuse, don't escape.
            if "\n" in v or "\r" in v:
                raise ValueError(f"step output {k!r} contains a line break")
            fh.write(f"{k}={v}\n")


def cmd_resolve(args) -> int:
    from . import resolve

    today = dt.date.fromisoformat(args.today) if args.today else None
    r = resolve.resolve(write=not args.no_write, today=today)
    st = r["staleness"]
    prev = r["committed"]["live"]["asof_week"] if r["committed"] else ""
    _github_output({
        "decision": r["decision"],
        "changed": r["decision"] in ("init", "advance", "restate"),
        "asof_week": r["pins"]["live"]["asof_week"],
        "asof_date": r["pins"]["live"]["asof_date"],
        "prev_asof_week": prev,
        "stale": st["stale"],
        "expected_week": st["expected_week"],
        "message": r["message"],
    })
    return 3 if r["decision"] == "regress" else 0


def cmd_build(args) -> int:
    from . import pipeline

    pipeline.run(check_stable=args.check_stable, verbose=not args.quiet)
    return 0


def cmd_status(args) -> int:
    from . import resolve

    pins = resolve.read_pins()
    if pins is None:
        print(f"no pins: {lc.LIVE_PINS} is missing (run `python -m etl.live resolve`)")
        return 1
    lv, pb, gm = pins["live"], pins["pbp"], pins["games"]
    print(f"pinned   {lv['season']} through week {lv['asof_week']} ({lv['asof_date'] or '-'})")
    print(f"  pbp    {pb['asset']} sha256 {pb['sha256'][:16]}… updated {pb['updated_at']} "
          f"slice {pb['slice_rows']} plays")
    print(f"  games  {gm['repo']}@{gm['commit_sha'][:12]} slice {gm['slice_rows']} rows")
    ok = True
    if not lc.LIVE_MANIFEST.exists():
        print("built    nothing — data/marts/live/manifest.json is missing")
        return 1
    man = json.loads(lc.LIVE_MANIFEST.read_text())
    same = (man["asof_week"] == int(lv["asof_week"])
            and man["pins"]["pbp_slice_sha256"] == pb["slice_sha256"]
            and man["pins"]["games_slice_sha256"] == gm["slice_sha256"])
    print(f"built    week {man['asof_week']} — {'matches' if same else 'DOES NOT MATCH'} the pins")
    ok &= same
    for name, m in sorted(man["marts"].items()):
        p = base.REPO / m["file"]
        good = p.exists() and io_utils.md5_file(p) == m["md5"]
        ok &= good
        print(f"  {name:<16} {m['rows']:>3} rows  md5 {m['md5'][:12]}…  "
              f"{'ok' if good else 'DRIFTED'}")
    for name, why in sorted(man.get("not_built", {}).items()):
        print(f"  {name:<16} not built — {why}")
    st = io_utils.read_csv(lc.LIVE_MARTS_DIR / "live_status.csv").iloc[0]
    print(f"states   perf {st['perf_state']}; Cap+ {st['capplus_state']} — "
          f"{st['capplus_blank_reason']}")
    return 0 if ok else 1


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="python -m etl.live",
                                 description="The 2026 in-season live layer (DECISIONS 116).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    r = sub.add_parser("resolve", help="pin the inputs and compute asof_week")
    r.add_argument("--no-write", action="store_true", help="report only; leave the pin file")
    r.add_argument("--today", help="YYYY-MM-DD for the staleness check (default: UTC today)")
    b = sub.add_parser("build", help="build data/marts/live/ from the pins")
    b.add_argument("--check-stable", action="store_true",
                   help="build every live mart twice and diff the bytes")
    b.add_argument("--quiet", action="store_true")
    sub.add_parser("status", help="what is pinned and what is built")
    args = ap.parse_args(argv)
    return {"resolve": cmd_resolve, "build": cmd_build, "status": cmd_status}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
