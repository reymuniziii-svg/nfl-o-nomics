"""Draft capital + realized return — `draft_pick`, `draft_class_summary`.

`SPEC.md` §2.9 / §7.8, `DECISIONS.md` 39/40/41. Promoted from
`audit/audit_support.py`.

**Value chart: the Fitzgerald–Spielberger NFL Draft Trade Value Chart**, published
at Over The Cap (`https://overthecap.com/draft-trade-value-chart`), cited on the
methodology page and in the chart footer. Chosen because its units are dollars of
surplus value produced by a pick relative to its rookie-contract cost — the same
units as the rest of this product — rather than the Jimmy Johnson chart's 1990s
trade-negotiation heuristic, which was never calibrated to on-field outcome.

This module builds `data/curated/fitzgerald_spielberger_chart.csv` first. The
values are **transcribed into this file** and carry a per-row `source_url`,
following the same curated-data pattern as `audit/build_deadmoney_curated.py`: a
live fetch is not reproducible and a mart that silently changes when a third
party edits a web page is not byte-stable. `verify_chart_against_source()` fetches
the live page and raises on any mismatch, so drift is a finding a human looks at,
not a silent rewrite.

**Team codes are PFR boxscore codes** (`NWE`, `GNB`, `SFO`, `LVR`, `SDG`) — a
fourth convention. `PFR_DRAFT_TEAM_MAP` must run **in front of**
`normalize_team`, which alone leaves 8 codes wrong (`DECISIONS.md` 4). This
module uses `normalize_draft_series`, which does both in the right order.

**`car_av` is 100% null — a dead column that looks live.** It is excluded from
the schema entirely so no one can read it by accident, and a structural test
asserts it is absent from the mart (`DECISIONS.md` 40).

**Tier boundaries are respected.** Draft capital and realized return are Tier 1
and available for all classes 2000–2025. Any framing of a draft class in
**dollars** is Tier 2 and renders only for 2013+ (`DECISIONS.md` 41); the mart
carries `dollar_framing_available` so the card cannot get it wrong.
"""

from __future__ import annotations

import re

import pandas as pd

from . import config, io_utils, sources
from .team_codes import assert_full_32, normalize_draft_series

CHART_PATH = config.CURATED / "fitzgerald_spielberger_chart.csv"

#: The published chart, picks 1-256, transcribed 2026-07-25 from
#: https://overthecap.com/draft-trade-value-chart. Verified: 256 contiguous
#: picks, monotone non-increasing, 3000 at pick 1 and 190 at pick 256.
FS_VALUES = [
    3000, 2649, 2443, 2297, 2184, 2092, 2014, 1946, 1887, 1833, 1785, 1741, 1700, 1663, 1628, 1595,  # 1-16
    1564, 1535, 1508, 1482, 1457, 1434, 1411, 1389, 1369, 1349, 1330, 1311, 1294, 1276, 1260, 1244,  # 17-32
    1228, 1213, 1198, 1184, 1170, 1157, 1143, 1131, 1118, 1106, 1094, 1082, 1071, 1060, 1049, 1038,  # 33-48
    1028, 1018, 1007, 998, 988, 979, 969, 960, 951, 942, 934, 925, 917, 909, 900, 892,               # 49-64
    885, 877, 869, 862, 854, 847, 840, 833, 826, 819, 812, 805, 799, 792, 786, 779,                  # 65-80
    773, 767, 761, 755, 749, 743, 737, 731, 725, 720, 714, 709, 703, 698, 692, 687,                  # 81-96
    682, 676, 671, 666, 661, 656, 651, 646, 642, 637, 632, 627, 623, 618, 613, 609,                  # 97-112
    604, 600, 595, 591, 587, 582, 578, 574, 570, 565, 561, 557, 553, 549, 545, 541,                  # 113-128
    537, 533, 529, 526, 522, 518, 514, 510, 507, 503, 499, 496, 492, 489, 485, 481,                  # 129-144
    478, 474, 471, 468, 464, 461, 457, 454, 451, 447, 444, 441, 438, 434, 431, 428,                  # 145-160
    425, 422, 419, 416, 412, 409, 406, 403, 400, 397, 394, 391, 388, 386, 383, 380,                  # 161-176
    377, 374, 371, 368, 366, 363, 360, 357, 354, 352, 349, 346, 344, 341, 338, 336,                  # 177-192
    333, 330, 328, 325, 323, 320, 318, 315, 312, 310, 307, 305, 302, 300, 298, 295,                  # 193-208
    293, 290, 288, 285, 283, 281, 278, 276, 274, 271, 269, 267, 264, 262, 260, 258,                  # 209-224
    255, 253, 251, 249, 246, 244, 242, 240, 238, 235, 233, 231, 229, 227, 225, 223,                  # 225-240
    220, 218, 216, 214, 212, 210, 208, 206, 204, 202, 200, 198, 196, 194, 192, 190,                  # 241-256
]

FS_METHOD_NOTE = (
    "Fitzgerald-Spielberger NFL Draft Trade Value Chart, Over The Cap. Method per "
    "the publisher: every 2011-2015 selection was graded retroactively after its "
    "rookie contract by converting each new contract into a percent of the Top 5 "
    "APY average at that position, then smoothing across a widening range of "
    "neighbouring picks. Units are surplus value relative to rookie-contract cost, "
    "not Jimmy Johnson trade points."
)
FS_EXTENSION_NOTE = (
    "NOT PUBLISHED. The chart runs to pick 256; drafts in the 2000-2025 window "
    "reach pick 262 (2003, 2022) via compensatory selections. Picks beyond 256 "
    "carry the pick-256 value (190) under an explicit flat-extension rule. This "
    "is a labelled extrapolation, never presented as a published value."
)

#: GOLDEN CHECK: Tom Brady, 2000, round 6, pick 199, New England. The raw team
#: code in the source is `NWE`, not `NE` — the whole point of convention 3.
GOLDEN_BRADY = {"season": 2000, "name": "Tom Brady", "round": 6, "pick": 199,
                "team_raw": "NWE", "team": "NE"}


# --------------------------------------------------------------------------- #
# 1. the curated chart
# --------------------------------------------------------------------------- #
def build_fs_chart() -> pd.DataFrame:
    if len(FS_VALUES) != config.FS_CHART_PUBLISHED_MAX_PICK:
        raise AssertionError("FS_VALUES is not 256 picks long")
    if any(a < b for a, b in zip(FS_VALUES, FS_VALUES[1:])):
        raise AssertionError("FS chart must be monotone non-increasing")

    rows = []
    for i, v in enumerate(FS_VALUES, start=1):
        rows.append({
            "pick": i, "chart_value": v, "value_basis": "published",
            "source_url": config.FS_CHART_URL,
            "source_note": FS_METHOD_NOTE,
            "source_reference": config.FS_CHART_BOOK,
            "transcribed_asof": "2026-07-25",
        })
    for i in range(config.FS_CHART_PUBLISHED_MAX_PICK + 1,
                   config.FS_CHART_MAX_PICK + 1):
        rows.append({
            "pick": i, "chart_value": FS_VALUES[-1],
            "value_basis": "extended_flat_from_pick_256",
            "source_url": config.FS_CHART_URL,
            "source_note": FS_EXTENSION_NOTE,
            "source_reference": config.FS_CHART_BOOK,
            "transcribed_asof": "2026-07-25",
        })
    return pd.DataFrame(rows)


def verify_chart_against_source() -> dict:
    """Fetch the live chart and diff it against the transcription.

    A mismatch is a **finding**, not a fix: the published chart changing is a
    data event a human must see. A network failure is reported and does not fail
    the build — the transcription is the source of record.
    """
    try:
        html = sources.fetch_text(config.FS_CHART_URL)
    except Exception as exc:  # pragma: no cover - network
        return {"checked": False, "reason": f"fetch failed: {exc}"}
    i = html.find('<table')
    j = html.find("</table>", i)
    if i < 0 or j < 0:
        return {"checked": False, "reason": "no table found on the page"}
    pairs = {}
    for row in re.findall(r"<tr>(.*?)</tr>", html[i:j], re.S):
        cells = [re.sub(r"<[^>]+>", "", c).strip()
                 for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S)]
        cells = [c for c in cells if c != ""]
        for k in range(0, len(cells) - 1, 2):
            try:
                pairs[int(cells[k])] = int(cells[k + 1].replace(",", ""))
            except ValueError:
                continue
    live = [pairs.get(p) for p in range(1, config.FS_CHART_PUBLISHED_MAX_PICK + 1)]
    mismatches = [(p, a, b) for p, (a, b) in
                  enumerate(zip(FS_VALUES, live), start=1) if a != b]
    if mismatches:
        raise AssertionError(
            "the published Fitzgerald-Spielberger chart has changed since "
            f"transcription — {len(mismatches)} picks differ, first "
            f"{mismatches[:3]}. This is a finding: verify, then update FS_VALUES.")
    return {"checked": True, "picks_verified": len(live)}


def load_chart() -> pd.DataFrame:
    if not CHART_PATH.exists():
        raise FileNotFoundError(
            f"{CHART_PATH} is missing — run the `fitzgerald_spielberger_chart` "
            "mart first (the pipeline orders it ahead of the draft marts).")
    return io_utils.read_csv(CHART_PATH)


# --------------------------------------------------------------------------- #
# 2. draft_pick — SPEC.md §7.8
# --------------------------------------------------------------------------- #
DRAFT_COLS = (
    "season, round, pick, team, gsis_id, pfr_player_id, pfr_player_name, "
    "position, side, college, hof, allpro, probowls, seasons_started, w_av, games"
)


def build_draft_pick(chart: pd.DataFrame, *, download: bool = False,
                     verbose: bool = True) -> tuple[pd.DataFrame, dict]:
    lo, hi = config.DRAFT_WINDOW
    con = sources.duck_connect()
    sources.scan_parquet(con, config.DRAFT_URL, "draft", DRAFT_COLS,
                         download=download)
    d = con.execute(
        f"SELECT * FROM draft WHERE season BETWEEN {lo} AND {hi}").df()

    raw_teams = sorted(set(d["team"].dropna()))
    d["team"] = normalize_draft_series(d["team"]).astype("object")

    # The 8 codes normalize_team ALONE gets wrong. Assert the trap, don't trust it.
    from .team_codes import normalize_team as _nt
    naive_wrong = sorted(t for t in raw_teams if _nt(t) not in set(d["team"]))
    if len(naive_wrong) != 8:
        raise AssertionError(
            f"expected normalize_team alone to miss exactly 8 draft codes, "
            f"got {len(naive_wrong)}: {naive_wrong}")

    d = d.rename(columns={"pfr_player_name": "player_name"})
    d = d.merge(chart[["pick", "chart_value", "value_basis"]], on="pick", how="left")
    if d["chart_value"].isna().any():
        missing = sorted(set(d.loc[d["chart_value"].isna(), "pick"]))
        raise AssertionError(f"picks with no chart value: {missing}")

    out = d[[
        "season", "team", "round", "pick", "player_name",
        "gsis_id", "pfr_player_id", "position", "side", "college",
        "chart_value", "value_basis",
        "games", "w_av", "seasons_started", "probowls", "allpro", "hof",
    ]].sort_values(["season", "pick"]).reset_index(drop=True)
    out["hof"] = out["hof"].fillna(False).astype(bool)
    out = io_utils.as_int64(out, [
        "round", "pick", "chart_value", "games", "w_av", "seasons_started",
        "probowls", "allpro",
    ])

    io_utils.assert_rows(out, "draft_pick")
    io_utils.assert_no_column(out, "draft_pick", "car_av")
    assert_full_32(out["team"], "draft_pick")
    io_utils.assert_unique(out, ["season", "pick"], "draft_pick")

    b = out[(out["season"] == GOLDEN_BRADY["season"])
            & (out["player_name"] == GOLDEN_BRADY["name"])]
    if len(b) != 1:
        raise AssertionError("golden: Tom Brady 2000 not found exactly once")
    br = b.iloc[0]
    if not (int(br["round"]) == GOLDEN_BRADY["round"]
            and int(br["pick"]) == GOLDEN_BRADY["pick"]
            and br["team"] == GOLDEN_BRADY["team"]):
        raise AssertionError(
            f"golden Brady failed: round {br['round']}, pick {br['pick']}, "
            f"team {br['team']}")

    stats = {
        "picks": len(out),
        "seasons": f"{lo}-{hi}",
        "raw_team_codes": len(raw_teams),
        "codes_normalize_team_alone_misses": naive_wrong,
        "gsis_coverage": round(float(out["gsis_id"].notna().mean()), 4),
        "pfr_coverage": round(float(out["pfr_player_id"].notna().mean()), 4),
        "games_coverage": round(float(out["games"].notna().mean()), 4),
        "w_av_coverage": round(float(out["w_av"].notna().mean()), 4),
        "seasons_started_coverage": round(float(out["seasons_started"].notna().mean()), 4),
        "extended_picks": int((out["value_basis"] != "published").sum()),
        "golden_brady": {
            "round": int(br["round"]), "pick": int(br["pick"]),
            "team": br["team"], "chart_value": int(br["chart_value"]),
            "raw_code_in_source": GOLDEN_BRADY["team_raw"],
        },
    }
    if verbose:
        print(f"  {len(out)} picks {lo}-{hi}; normalize_team alone misses "
              f"{naive_wrong}")
        print(f"  golden Brady 2000: R{stats['golden_brady']['round']} "
              f"P{stats['golden_brady']['pick']} "
              f"{GOLDEN_BRADY['team_raw']} -> {stats['golden_brady']['team']}, "
              f"chart value {stats['golden_brady']['chart_value']}  PASS")
    return out, stats


# --------------------------------------------------------------------------- #
# 3. draft_class_summary — capital spent vs realized return, per team-class
# --------------------------------------------------------------------------- #
def build_draft_class_summary(picks: pd.DataFrame) -> pd.DataFrame:
    d = picks.copy()
    d["has_gsis"] = d["gsis_id"].notna()

    g = (d.groupby(["season", "team"], as_index=False)
           .agg(n_picks=("pick", "size"),
                capital=("chart_value", "sum"),
                n_excluded_no_gsis=("has_gsis", lambda s: int((~s).sum())),
                return_games=("games", "sum"),
                return_w_av=("w_av", "sum"),
                return_seasons_started=("seasons_started", "sum"),
                return_probowls=("probowls", "sum"),
                return_allpro=("allpro", "sum")))

    g["capital_rank"] = g.groupby("season")["capital"].rank(
        ascending=False, method="min")

    # Return per capital. Chart values run to 3000 at pick 1, so per-1,000 keeps
    # the number readable. Reported as independently-sourced ratios, never
    # blended into a single invented score (SPEC.md §2.9).
    cap_k = g["capital"] / 1000.0
    g["w_av_per_1000_capital"] = g["return_w_av"] / cap_k
    g["games_per_1000_capital"] = g["return_games"] / cap_k
    g["seasons_started_per_1000_capital"] = g["return_seasons_started"] / cap_k

    # Tier boundaries. Capital and return are Tier 1 for the whole window; any
    # DOLLAR framing of a class is Tier 2 and renders 2013+ only.
    g["dollar_framing_available"] = g["season"] >= config.DOLLAR_FRAMING_START
    g["dollar_framing_blank_reason"] = [
        "" if ok else config.BLANK_REASON_PRE_TIER2
        for ok in g["dollar_framing_available"]
    ]
    g["snaps_available"] = g["season"] >= config.SNAP_START

    out = g[[
        "season", "team", "n_picks", "capital", "capital_rank",
        "return_games", "return_w_av", "return_seasons_started",
        "return_probowls", "return_allpro",
        "w_av_per_1000_capital", "games_per_1000_capital",
        "seasons_started_per_1000_capital",
        "n_excluded_no_gsis", "snaps_available",
        "dollar_framing_available", "dollar_framing_blank_reason",
    ]].sort_values(["season", "team"]).reset_index(drop=True)

    out = io_utils.round_cols(out, {
        "w_av_per_1000_capital": 4, "games_per_1000_capital": 4,
        "seasons_started_per_1000_capital": 4,
    })
    out = io_utils.as_int64(out, [
        "n_picks", "capital", "capital_rank",
        "return_games", "return_w_av", "return_seasons_started",
        "return_probowls", "return_allpro", "n_excluded_no_gsis",
    ])
    out["snaps_available"] = out["snaps_available"].astype(bool)
    out["dollar_framing_available"] = out["dollar_framing_available"].astype(bool)

    assert_full_32(out["team"], "draft_class_summary")
    io_utils.assert_unique(out, ["season", "team"], "draft_class_summary")
    if int(out["capital"].sum()) != int(picks["chart_value"].sum()):
        raise AssertionError("draft_class_summary: capital does not tie to picks")
    return out


# --------------------------------------------------------------------------- #
# mart entry points
# --------------------------------------------------------------------------- #
_CACHE: dict = {}


def mart_fitzgerald_spielberger_chart(ctx) -> pd.DataFrame:
    out = build_fs_chart()
    ver = verify_chart_against_source()
    ctx.stats["fs_chart"] = {"rows": len(out), "verification": ver}
    ctx.note_source("Over The Cap — Fitzgerald-Spielberger trade value chart",
                    rows=len(out),
                    window=f"picks 1-{config.FS_CHART_MAX_PICK}")
    if ctx.verbose:
        if ver.get("checked"):
            print(f"  live source verified: {ver['picks_verified']} published "
                  f"picks match the transcription exactly")
        else:
            print(f"  live source NOT verified ({ver.get('reason')}); "
                  f"transcription is the source of record")
    return out


def mart_draft_pick(ctx) -> pd.DataFrame:
    chart = load_chart()
    out, stats = build_draft_pick(chart, download=ctx.download, verbose=ctx.verbose)
    _CACHE["picks"] = out
    ctx.stats["draft_pick"] = stats
    ctx.note_source("nflverse draft_picks.parquet + F-S chart", rows=len(out),
                    asset="draft_picks",
                    window=f"{config.DRAFT_WINDOW[0]}-{config.DRAFT_WINDOW[1]}")
    return out


def mart_draft_class_summary(ctx) -> pd.DataFrame:
    picks = _CACHE.get("picks")
    if picks is None:
        picks = mart_draft_pick(ctx)
    out = build_draft_class_summary(picks)
    ctx.note_source("draft_pick", rows=len(picks),
                    window=f"{config.DRAFT_WINDOW[0]}-{config.DRAFT_WINDOW[1]}")
    if ctx.verbose:
        top = out.nlargest(3, "capital")[["season", "team", "capital", "n_picks"]]
        print(f"  {len(out)} team-classes; biggest capital: " + " · ".join(
            f"{int(r.season)} {r.team} {int(r.capital)}" for r in top.itertuples()))
    return out
