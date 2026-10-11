"""`python -m etl.live resolve` — pin the live inputs and find the closed week.

Three things are pinned, and none of them is a moving URL (plan §3.2):

* **pbp** — the `play_by_play_2026.parquet` asset on the nflverse `pbp`
  release. The asset is overwritten in place, so the pin is its **sha256**
  (checked against GitHub's own `digest` when the API returns one), plus the
  asset's `size` and `updated_at`.
* **games** — `games.csv` read at an immutable nfldata **commit SHA**
  (`raw.githubusercontent.com/nflverse/nfldata/{sha}/data/games.csv`), never
  `master`, plus the file's sha256.
* **asof_week** — the last closed regular-season week (`closed_week`).

Each pin also records a **slice hash**: the sha256 of exactly the rows and
columns the live marts read (pbp REG plays through `asof_week`; the season's
schedule with scores and dates masked past it). The marts are a pure function
of the slices, so the no-op rule compares slices: a re-upload that only adds
next week's Thursday game changes the file hash, not the slice, and commits
nothing. The pbp file is downloaded once into a content-addressed cache outside
the repo (`config.CACHE_DIR`); `data/raw/` stays empty at rest.

`closed_week` and the slice functions are pure and run on local files, so the
fixture tests exercise them without the network.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import io
import os
import re
import shutil
import sys
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from ..team_codes import normalize_series
from . import config as lc

_SCRIM = "play_type IN ('pass','run')"


# --------------------------------------------------------------------------- #
# hashing
# --------------------------------------------------------------------------- #
def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _sha256_frame(df: pd.DataFrame) -> str:
    """A frame's canonical bytes: fixed column order, LF, %.17g floats (printf,
    not repr, so a pandas upgrade cannot move the hash)."""
    buf = io.StringIO()
    df.to_csv(buf, index=False, lineterminator="\n", float_format="%.17g")
    return hashlib.sha256(buf.getvalue().encode("utf-8")).hexdigest()


# --------------------------------------------------------------------------- #
# reading the two inputs (local files only)
# --------------------------------------------------------------------------- #
def read_schedule(source, season: int = lc.LIVE_SEASON) -> pd.DataFrame:
    """The season's REG schedule from games.csv (a path or a frame)."""
    g = source if isinstance(source, pd.DataFrame) else pd.read_csv(source)
    missing = set(lc.LIVE_GAMES_COLS) - set(g.columns)
    if missing:
        raise AssertionError(f"games.csv is missing column(s) {sorted(missing)}")
    g = g.loc[(g["season"] == season) & (g["game_type"] == "REG"),
              list(lc.LIVE_GAMES_COLS)].copy()
    if g.empty:
        raise AssertionError(f"games.csv has no {season} REG rows")
    if g["game_id"].duplicated().any():
        raise AssertionError("games.csv repeats a game_id")
    g["home_team"] = normalize_series(g["home_team"]).astype(object)
    g["away_team"] = normalize_series(g["away_team"]).astype(object)
    g["week"] = g["week"].astype(int)
    for c in ("home_score", "away_score"):
        g[c] = pd.to_numeric(g[c]).astype("Int64")
    return g.sort_values("game_id", kind="stable").reset_index(drop=True)


def pbp_connect(path: Path, season: int = lc.LIVE_SEASON):
    """DuckDB connection holding `pbp_raw`: the season's REG plays, projected.

    A renamed or dropped column fails here, loudly (RISKS risk 6)."""
    import duckdb

    con = duckdb.connect()
    cols = ", ".join(lc.LIVE_PBP_COLS)
    con.execute(f"CREATE TABLE pbp_raw AS SELECT {cols} FROM read_parquet(?) "
                f"WHERE season_type = 'REG'", [str(path)])
    seasons = {r[0] for r in con.execute("SELECT DISTINCT season FROM pbp_raw").fetchall()}
    if seasons - {season}:
        raise AssertionError(f"pbp file holds season(s) {sorted(seasons)}, expected {season}")
    return con


def pbp_games(con) -> pd.DataFrame:
    """One row per pbp game: week, final score, scrimmage plays."""
    g = con.execute(f"""
        SELECT game_id,
               min(week) AS week, count(DISTINCT week) AS n_weeks,
               min(home_score) AS home_min, max(home_score) AS home_score,
               min(away_score) AS away_min, max(away_score) AS away_score,
               sum(CASE WHEN {_SCRIM} THEN 1 ELSE 0 END) AS scrim_plays
        FROM pbp_raw GROUP BY game_id ORDER BY game_id
    """).df()
    if (g["n_weeks"] > 1).any():
        raise AssertionError("a pbp game spans two weeks")
    if ((g["home_min"] != g["home_score"]) | (g["away_min"] != g["away_score"])).any():
        raise AssertionError("pbp final score is not constant within a game")
    return g[["game_id", "week", "home_score", "away_score", "scrim_plays"]]


# --------------------------------------------------------------------------- #
# the closed-week rule (plan §1.1)
# --------------------------------------------------------------------------- #
@dataclass
class ClosedWeek:
    asof_week: int
    asof_date: str | None
    #: Why the first open week is open (empty when the season is complete).
    open_week: int | None = None
    open_reasons: list = field(default_factory=list)


def closed_week(schedule: pd.DataFrame, pbp: pd.DataFrame, *,
                cancelled=(), min_scrim_plays: int = lc.LIVE_MIN_SCRIM_PLAYS
                ) -> ClosedWeek:
    """The last week W such that every REG game in weeks <= W (cancelled games
    aside) has both scores in games.csv, is in pbp, has a pbp final score equal
    to the schedule's, and has at least `min_scrim_plays` pass + run plays.

    Byes need no special case: a team off in week W has no game to check. A
    postponed game keeps its week open until it is played or cancelled. A game
    from week N+1 (a Thursday retry) is never inspected while week N is open
    and is filtered out of every input by `asof_week` either way.
    """
    cancelled = set(cancelled)
    weeks = sorted(int(w) for w in schedule["week"].unique())
    if weeks != list(range(1, len(weeks) + 1)):
        raise AssertionError(f"schedule weeks are not 1..N: {weeks}")
    pb = pbp.set_index("game_id")
    asof, asof_date = 0, None
    for w in weeks:
        wk = schedule[(schedule["week"] == w) & ~schedule["game_id"].isin(cancelled)]
        reasons = []
        for r in wk.itertuples(index=False):
            if pd.isna(r.home_score) or pd.isna(r.away_score):
                reasons.append(f"{r.game_id}: no final score in games.csv")
            elif r.game_id not in pb.index:
                reasons.append(f"{r.game_id}: not in pbp yet")
            else:
                p = pb.loc[r.game_id]
                if int(p["week"]) != w:
                    reasons.append(f"{r.game_id}: pbp week {int(p['week'])} != schedule week {w}")
                elif (int(p["home_score"]), int(p["away_score"])) != (int(r.home_score),
                                                                      int(r.away_score)):
                    reasons.append(f"{r.game_id}: pbp final {int(p['away_score'])}-"
                                   f"{int(p['home_score'])} != schedule "
                                   f"{int(r.away_score)}-{int(r.home_score)}")
                elif int(p["scrim_plays"]) < min_scrim_plays:
                    reasons.append(f"{r.game_id}: {int(p['scrim_plays'])} pass+run plays "
                                   f"< {min_scrim_plays}")
        if reasons:
            return ClosedWeek(asof, asof_date, w, reasons)
        asof = w
        days = wk["gameday"].dropna()
        asof_date = str(days.max()) if not days.empty else asof_date
    return ClosedWeek(asof, asof_date)


# --------------------------------------------------------------------------- #
# slices — exactly what the marts read
# --------------------------------------------------------------------------- #
def schedule_slice(schedule: pd.DataFrame, asof_week: int) -> pd.DataFrame:
    """The whole season's pairings (bye weeks depend on them), with scores and
    game days masked past `asof_week` (the marts never read them)."""
    s = schedule.copy()
    late = s["week"] > asof_week
    s.loc[late, ["home_score", "away_score"]] = pd.NA
    s.loc[late, "gameday"] = None
    return s.sort_values("game_id", kind="stable").reset_index(drop=True)


def pbp_slice(con, asof_week: int, cancelled=()) -> pd.DataFrame:
    excl = sorted(set(cancelled))
    where = f"week <= {int(asof_week)}"
    if excl:
        where += " AND game_id NOT IN (" + ", ".join(f"'{g}'" for g in excl) + ")"
    cols = ", ".join(lc.LIVE_PBP_COLS)
    return con.execute(f"SELECT {cols} FROM pbp_raw WHERE {where} "
                       f"ORDER BY game_id, play_id").df()


def slice_hashes(schedule: pd.DataFrame, con, asof_week: int, cancelled=()) -> dict:
    ps = pbp_slice(con, asof_week, cancelled)
    ss = schedule_slice(schedule, asof_week)
    return {"pbp_slice_sha256": _sha256_frame(ps), "pbp_slice_rows": int(len(ps)),
            "games_slice_sha256": _sha256_frame(ss), "games_slice_rows": int(len(ss))}


# --------------------------------------------------------------------------- #
# staleness (workflow only; no clock ever reaches a mart or the pin file)
# --------------------------------------------------------------------------- #
def staleness(schedule: pd.DataFrame, asof_week: int, today: dt.date) -> dict:
    nxt = asof_week + 1
    if nxt > int(schedule["week"].max()):
        return {"stale": False, "expected_week": asof_week, "overdue_days": 0}
    last = pd.to_datetime(schedule.loc[schedule["week"] == nxt, "gameday"]).max().date()
    overdue = (today - last).days
    return {"stale": overdue >= lc.STALE_AFTER_DAYS, "expected_week": nxt,
            "next_week_last_gameday": last.isoformat(), "overdue_days": overdue}


# --------------------------------------------------------------------------- #
# the pin file — a tiny TOML subset we write and read ourselves
# --------------------------------------------------------------------------- #
PIN_SECTIONS = ("live", "pbp", "games")


def _toml_value(v) -> str:
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, (list, tuple)):
        return "[" + ", ".join(_toml_value(x) for x in v) + "]"
    s = "" if v is None else str(v)
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def render_pins(pins: dict) -> str:
    out = [
        "# etl/live/live_pins.toml — GENERATED by `python -m etl.live resolve`. Do not hand-edit.",
        "#",
        "# The live layer's pins (DECISIONS 116, plan §3.2). pbp is pinned by content",
        "# hash (the release asset is overwritten in place); games.csv by an immutable",
        "# nfldata commit SHA. *_slice_sha256 hashes exactly what the marts read; the",
        "# weekly job is a no-op while asof_week and both slices are unchanged.",
        "",
    ]
    for sec in PIN_SECTIONS:
        out.append(f"[{sec}]")
        for k, v in pins[sec].items():
            out.append(f"{k} = {_toml_value(v)}")
        out.append("")
    return "\n".join(out).rstrip("\n") + "\n"


_KV = re.compile(r'^([A-Za-z0-9_]+)\s*=\s*(.+)$')


def _parse_value(raw: str):
    raw = raw.strip()
    if raw.startswith('"'):
        return raw[1:-1].replace('\\"', '"').replace("\\\\", "\\")
    if raw.startswith("["):
        inner = raw[1:-1].strip()
        return [] if not inner else [_parse_value(x) for x in
                                     re.findall(r'"(?:[^"\\]|\\.)*"|[^,\s]+', inner)]
    if raw in ("true", "false"):
        return raw == "true"
    return int(raw)


def parse_pins(text: str) -> dict:
    pins: dict = {}
    sec = None
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("[") and line.endswith("]"):
            sec = line[1:-1]
            pins[sec] = {}
            continue
        m = _KV.match(line)
        if not m or sec is None:
            raise ValueError(f"unparseable pin line: {line!r}")
        pins[sec][m.group(1)] = _parse_value(m.group(2))
    return pins


def read_pins(path: Path = lc.LIVE_PINS) -> dict | None:
    return parse_pins(Path(path).read_text(encoding="utf-8")) if Path(path).exists() else None


def write_pins(pins: dict, path: Path = lc.LIVE_PINS) -> Path:
    Path(path).write_text(render_pins(pins), encoding="utf-8")
    return Path(path)


def decide(committed: dict | None, proposed: dict) -> str:
    """init | advance | restate | noop | regress."""
    if committed is None:
        return "init"
    a, b = committed["live"], proposed["live"]
    if int(b["asof_week"]) < int(a["asof_week"]):
        return "regress"
    if int(b["asof_week"]) > int(a["asof_week"]):
        return "advance"
    same = (committed["pbp"].get("slice_sha256") == proposed["pbp"]["slice_sha256"]
            and committed["games"].get("slice_sha256") == proposed["games"]["slice_sha256"]
            and list(a.get("cancelled_games", [])) == list(b.get("cancelled_games", [])))
    return "noop" if same else "restate"


def commit_message(pins: dict, decision: str) -> str:
    lv, pb, gm = pins["live"], pins["pbp"], pins["games"]
    tail = f"[pbp sha256:{pb['sha256'][:12]}, games @{gm['commit_sha'][:7]}]"
    if decision == "restate":
        return f"live: restate week {lv['asof_week']} ({lv['asof_date']}) {tail}"
    return (f"live: {lv['season']} through week {lv['asof_week']} "
            f"({lv['asof_date']}) {tail}")


# --------------------------------------------------------------------------- #
# network (resolve and a cold build only; never at test time)
# --------------------------------------------------------------------------- #
def _get(url: str, *, stream: bool = False):
    import requests  # lazy: the test suite never touches the network

    headers = {"Accept": "application/vnd.github+json"} if "api.github.com" in url else {}
    tok = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if tok and "api.github.com" in url:
        headers["Authorization"] = f"Bearer {tok}"
    r = requests.get(url, headers=headers, stream=stream, timeout=120)
    r.raise_for_status()
    return r


def fetch_pbp_meta() -> dict:
    rel = _get(lc.PBP_RELEASE_API).json()
    hits = [a for a in rel.get("assets", []) if a["name"] == lc.PBP_ASSET]
    if len(hits) != 1:
        raise AssertionError(f"{lc.PBP_ASSET} not found on the {lc.PBP_RELEASE_TAG} release")
    a = hits[0]
    return {"size": int(a["size"]), "updated_at": a["updated_at"],
            "digest": a.get("digest") or "", "url": a["browser_download_url"]}


def fetch_games_commit() -> dict:
    c = _get(lc.GAMES_COMMITS_API).json()
    if not c:
        raise AssertionError(f"no commits for {lc.GAMES_REPO}/{lc.GAMES_PATH}")
    return {"sha": c[0]["sha"], "date": c[0]["commit"]["committer"]["date"]}


def games_url(commit_sha: str) -> str:
    return lc.GAMES_RAW_AT.format(repo=lc.GAMES_REPO, sha=commit_sha, path=lc.GAMES_PATH)


def download(url: str, suffix: str) -> tuple[Path, str]:
    """Download into the content-addressed cache; return (path, sha256)."""
    lc.CACHE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = lc.CACHE_DIR / f".partial-{os.getpid()}{suffix}"
    try:
        with _get(url, stream=True) as r, open(tmp, "wb") as fh:
            for chunk in r.iter_content(chunk_size=1 << 20):
                fh.write(chunk)
        sha = sha256_file(tmp)
        dest = lc.CACHE_DIR / f"{sha}{suffix}"
        shutil.move(str(tmp), dest)
        return dest, sha
    finally:
        if tmp.exists():
            tmp.unlink()


def cached(sha: str, suffix: str) -> Path | None:
    p = lc.CACHE_DIR / f"{sha}{suffix}"
    return p if p.exists() and sha256_file(p) == sha else None


# --------------------------------------------------------------------------- #
# resolve
# --------------------------------------------------------------------------- #
def propose(schedule: pd.DataFrame, con, *, pbp_meta: dict, games_meta: dict,
            cancelled=None, min_scrim_plays: int = lc.LIVE_MIN_SCRIM_PLAYS
            ) -> tuple[dict, ClosedWeek]:
    """The pin set implied by two local inputs and their metadata. Pure."""
    cancelled = sorted(lc.LIVE_CANCELLED_GAMES if cancelled is None else cancelled)
    cw = closed_week(schedule, pbp_games(con), cancelled=cancelled,
                     min_scrim_plays=min_scrim_plays)
    sl = slice_hashes(schedule, con, cw.asof_week, cancelled)
    pins = {
        "live": {"season": lc.LIVE_SEASON, "asof_week": cw.asof_week,
                 "asof_date": cw.asof_date or "", "cancelled_games": cancelled},
        "pbp": {"release_tag": lc.PBP_RELEASE_TAG, "asset": lc.PBP_ASSET,
                "url": lc.PBP_URL, "size": pbp_meta["size"],
                "updated_at": pbp_meta["updated_at"], "github_digest": pbp_meta["digest"],
                "sha256": pbp_meta["sha256"],
                "projected_columns": ", ".join(lc.LIVE_PBP_COLS),
                "slice_sha256": sl["pbp_slice_sha256"], "slice_rows": sl["pbp_slice_rows"]},
        "games": {"repo": lc.GAMES_REPO, "path": lc.GAMES_PATH,
                  "commit_sha": games_meta["sha"], "commit_date": games_meta["date"],
                  "url": games_url(games_meta["sha"]), "sha256": games_meta["sha256"],
                  "projected_columns": ", ".join(lc.LIVE_GAMES_COLS),
                  "slice_sha256": sl["games_slice_sha256"],
                  "slice_rows": sl["games_slice_rows"]},
    }
    return pins, cw


def resolve(*, write: bool = True, today: dt.date | None = None,
            verbose: bool = True) -> dict:
    meta = fetch_pbp_meta()
    gmeta = fetch_games_commit()
    pbp_path, pbp_sha = download(meta["url"], ".parquet")
    if meta["digest"] and meta["digest"] != f"sha256:{pbp_sha}":
        raise AssertionError(f"pbp download sha256:{pbp_sha} != GitHub digest {meta['digest']}")
    meta["sha256"] = pbp_sha
    games_path, games_sha = download(games_url(gmeta["sha"]), ".csv")
    gmeta["sha256"] = games_sha

    schedule = read_schedule(games_path)
    con = pbp_connect(pbp_path)
    proposed, cw = propose(schedule, con, pbp_meta=meta, games_meta=gmeta)
    committed = read_pins()
    decision = decide(committed, proposed)
    st = staleness(schedule, cw.asof_week, today or dt.datetime.now(dt.timezone.utc).date())

    if verbose:
        lv = proposed["live"]
        print(f"pbp   {lc.PBP_ASSET}  {meta['size']:,} bytes  updated {meta['updated_at']}  "
              f"sha256 {pbp_sha[:16]}…  (digest {'match' if meta['digest'] else 'absent'})")
        print(f"games {lc.GAMES_REPO}@{gmeta['sha'][:12]}  ({gmeta['date']})  "
              f"sha256 {games_sha[:16]}…")
        print(f"closed through week {lv['asof_week']} ({lv['asof_date'] or 'none'})")
        if cw.open_week:
            print(f"week {cw.open_week} open: {len(cw.open_reasons)} game(s) not final")
            for r in cw.open_reasons[:6]:
                print(f"    {r}")
        prev = committed["live"]["asof_week"] if committed else None
        print(f"decision: {decision}  (committed asof_week {prev})")
        print(f"staleness: {st}")

    if decision == "regress":
        print("!! asof_week went BACKWARDS against the committed pins; nothing written. "
              "A game was pulled or re-scored upstream — investigate before re-running.",
              file=sys.stderr)
    elif decision != "noop" and write:
        write_pins(proposed)
        if verbose:
            print(f"wrote {lc.LIVE_PINS.relative_to(lc.base.REPO)}")
    return {"decision": decision, "pins": proposed, "committed": committed,
            "closed": cw, "staleness": st,
            "message": commit_message(proposed, decision) if decision != "noop" else ""}
