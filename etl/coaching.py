"""Stability Index + regimes — `team_season_stability`, `regime_events`.

New code, built to `SPEC.md` §2.8 exactly (`DECISIONS.md` 35). *"Not an approval
gate — it ships on this spec."* It is the largest single build item in Phase 1.

Source: `data/curated/coaching_staff.csv` — 2,612 rows, 830 team-seasons,
2000-2025, roles HC/OC/DC, 435 distinct people + the `NONE` sentinel. The curated
file deliberately preserves **era codes** (35 of them); this module normalizes to
the 32 current-franchise codes and the curated source is left untouched.

THE FORMULATION, step by step (§2.8):

**1 — slot resolution.** For each `(season, team, role)`: `opening_holder` is the
first row in chronological stint order, `closing_holder` the last, `n_stints` the
row count. 119 slots are multi-row (HC 58, OC 39, DC 22); three are 3-row.

**2 — `NONE` handling.** `NONE` (60 rows: OC 38, DC 22, HC 0) means the title was
genuinely unfilled. It is **not** parsed out of the free-text `note` — `note` is
display and provenance only and is never parsed by code (`DECISIONS.md` 31) — and
it is **not** treated as a flat no-change. The holder identity is the sentinel
`NONE@<canonical HC name>`: the head coach absorbed the role. Consequences, all
correct against the data: ARI 2019-2022 OC is `NONE@Kliff Kingsbury` in all four
seasons and registers zero churn (Kingsbury called plays throughout); if the HC
changes, the `NONE` slot changes too and churn registers; a transition into or
out of a `NONE` slot is a real change event counted at **half weight**, because
the title moved without a guaranteed change of play-caller.

Where the HC slot itself changes hands mid-season, the sentinel is resolved
side-by-side: the `NONE` slot's `opening_holder` takes the HC's opening holder
and its `closing_holder` takes the HC's closing holder. That is the only reading
under which "if the HC changes, the `NONE` slot changes too" holds for an
in-season HC change as well as an offseason one.

**3 — change events** at `t` vs `t−1` for the same franchise: a *boundary change*
when `opening_holder(t) ≠ closing_holder(t−1)`; an *in-season change* per extra
stint, `n_stints(t) − 1`.

**4 — churn points.** HC boundary 3.0 · HC in-season 4.5 · OC/DC boundary 1.0 ·
OC/DC in-season 1.5 · ×0.5 across a `NONE@…` transition. Mid-season changes are
weighted 1.5× their boundary equivalents throughout: a firing in October is both
a change and a signal of crisis.

**5 — the index.** `W(t) = churn(t) + 0.6·churn(t−1) + 0.3·churn(t−2)`;
`SI(t) = clamp(0, 100, 100 − 5·W(t))`. 100 = total continuity. Seasons with a
truncated window (2000, 2001 league-wide; HOU 2002-2003, since the franchise
enters in 2002) are computed on the terms available and flagged
`window_truncated`.

**6 — regimes.** A regime is a maximal run of consecutive seasons under the same
head-coach identity for one franchise. **Coordinator changes never start a
regime**; they contribute churn only.

**7 — regime change → dead money.** For every regime-change event at season `s`,
report the team's dead money in `s+1` and `s+2`, **only where a full-32 table
exists**, each with its own as-of date and stage beside that season's league
median. The two readings are **never connected** — a pair of chips, not a trend.

**8 — name joins.** `coach_name` is not a safe join key. Join on
`(coach_name, season, team, role)` and carry a surrogate `coach_id` built by
dense-ranking the distinct `coach_name` strings exactly as delivered.
**Never fuzzy-match on name.** Jim E. Mora ≠ Jim L. Mora; Pete Carmichael Sr. ≠
Pete Carmichael Jr.; Gary/Klint/Klay Kubiak, Bob/Bobby Babich, Bob/Bobby Slowik,
Norv/Scott Turner, Gregg/Blake Williams, Wade/Wes Phillips, Mike/Adam Zimmer are
verified distinct and must never be merged.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from . import config, deadmoney, io_utils
from .team_codes import assert_full_32, normalize_series

ROLES = ("HC", "OC", "DC")
NONE_PREFIX = "NONE@"

#: Structural tests that fail the build (SPEC.md §2.8).
EXPECTED_TEAM_SEASONS = 830
EXPECTED_DISTINCT_NAMES = 436  # 435 people + the NONE sentinel

#: Name-suffix tokens stripped when deriving a regime's surname label.
_SUFFIXES = {"jr.", "jr", "sr.", "sr", "ii", "iii", "iv"}


# --------------------------------------------------------------------------- #
# load
# --------------------------------------------------------------------------- #
def load_staff() -> pd.DataFrame:
    df = io_utils.read_csv(config.CURATED / "coaching_staff.csv")
    io_utils.assert_rows(df, "coaching_staff")
    if not df["role"].isin(ROLES).all():
        raise AssertionError("coaching_staff: role vocabulary drifted")
    if df["coach_name"].isna().any() or (df["coach_name"].astype(str) == "").any():
        raise AssertionError("coaching_staff: blank coach_name")
    if df["source_url"].isna().any():
        raise AssertionError("coaching_staff: blank source_url")
    n_names = df["coach_name"].nunique()
    if n_names != EXPECTED_DISTINCT_NAMES:
        raise AssertionError(
            f"coaching_staff: {n_names} distinct coach_name values, "
            f"expected {EXPECTED_DISTINCT_NAMES} (435 people + NONE)")
    if ((df["role"] == "HC") & (df["coach_name"] == config.NONE_SENTINEL)).any():
        raise AssertionError("coaching_staff: an HC slot is NONE")

    # Surrogate key: dense-rank the distinct strings exactly as delivered.
    # Never fuzzy-matched, never normalized, never merged.
    names = sorted(df["coach_name"].unique())
    coach_id = {n: i + 1 for i, n in enumerate(names)}
    df["coach_id"] = df["coach_name"].map(coach_id)

    # Stint index in the file's chronological order — the curated build writes
    # multi-stint rows in order and the slots are contiguous.
    df["stint"] = df.groupby(["season", "team", "role"], sort=False).cumcount() + 1

    # Era codes stay in `team` (this is a curated source, SPEC.md §7.7);
    # the derived marts key on the normalized franchise code.
    df["team_current"] = normalize_series(df["team"]).astype("object")
    if df.groupby(["season", "team_current"]).ngroups != EXPECTED_TEAM_SEASONS:
        raise AssertionError("coaching_staff: team-season count drifted")
    return df


# --------------------------------------------------------------------------- #
# 1-2. slots and NONE resolution
# --------------------------------------------------------------------------- #
def build_slots(staff: pd.DataFrame) -> pd.DataFrame:
    g = (staff.sort_values(["season", "team_current", "role", "stint"], kind="stable")
              .groupby(["season", "team_current", "role"], sort=False))
    slots = g.agg(
        opening_raw=("coach_name", "first"),
        closing_raw=("coach_name", "last"),
        n_stints=("coach_name", "size"),
        names=("coach_name", list),
    ).reset_index().rename(columns={"team_current": "team"})

    # Every team-season must carry all three roles.
    per = slots.groupby(["season", "team"])["role"].nunique()
    if not (per == 3).all():
        bad = per[per != 3]
        raise AssertionError(f"team-seasons missing a role: {bad.to_dict()}")

    hc = slots[slots["role"] == "HC"][["season", "team", "opening_raw", "closing_raw"]]
    hc = hc.rename(columns={"opening_raw": "hc_opening", "closing_raw": "hc_closing"})
    slots = slots.merge(hc, on=["season", "team"], how="left", validate="m:1")

    def _resolve(name, hc_name):
        return f"{NONE_PREFIX}{hc_name}" if name == config.NONE_SENTINEL else name

    slots["opening_holder"] = [
        _resolve(n, h) for n, h in zip(slots["opening_raw"], slots["hc_opening"])
    ]
    slots["closing_holder"] = [
        _resolve(n, h) for n, h in zip(slots["closing_raw"], slots["hc_closing"])
    ]
    # Per-stint identities, used for the in-season half-weight rule. A middle or
    # trailing NONE stint resolves against the closing HC, a leading one against
    # the opening HC.
    resolved = []
    for names, ho, hc_ in zip(slots["names"], slots["hc_opening"], slots["hc_closing"]):
        out = []
        for i, n in enumerate(names):
            out.append(_resolve(n, ho if i == 0 else hc_))
        resolved.append(out)
    slots["stint_holders"] = resolved
    return slots.drop(columns=["names"])


# --------------------------------------------------------------------------- #
# 3-4. change events and churn points
# --------------------------------------------------------------------------- #
def _is_none(name: str) -> bool:
    return isinstance(name, str) and name.startswith(NONE_PREFIX)


def _weight(role: str, kind: str) -> float:
    if role == "HC":
        return (config.CHURN_HC_BOUNDARY if kind == "boundary"
                else config.CHURN_HC_IN_SEASON)
    return (config.CHURN_COORD_BOUNDARY if kind == "boundary"
            else config.CHURN_COORD_IN_SEASON)


def build_churn(slots: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    idx = {(int(r.season), r.team, r.role): r for r in slots.itertuples()}
    rows, events = [], []
    for r in slots.itertuples():
        season, team, role = int(r.season), r.team, r.role
        prev = idx.get((season - 1, team, role))

        churn = 0.0
        n_boundary = 0
        if prev is not None and r.opening_holder != prev.closing_holder:
            half = _is_none(r.opening_holder) or _is_none(prev.closing_holder)
            pts = _weight(role, "boundary") * (config.CHURN_NONE_MULTIPLIER if half else 1.0)
            churn += pts
            n_boundary = 1
            events.append({"season": season, "team": team, "role": role,
                           "kind": "boundary", "outgoing": prev.closing_holder,
                           "incoming": r.opening_holder, "half_weight": half,
                           "points": pts})

        n_in_season = int(r.n_stints) - 1
        holders = r.stint_holders
        for a, b in zip(holders[:-1], holders[1:]):
            half = _is_none(a) or _is_none(b)
            pts = _weight(role, "in_season") * (config.CHURN_NONE_MULTIPLIER if half else 1.0)
            churn += pts
            events.append({"season": season, "team": team, "role": role,
                           "kind": "in_season", "outgoing": a, "incoming": b,
                           "half_weight": half, "points": pts})

        rows.append({
            "season": season, "team": team, "role": role,
            "churn_points": churn,
            "boundary_changes": n_boundary,
            "in_season_changes": n_in_season,
            "has_prev_season": prev is not None,
        })
    return pd.DataFrame(rows), pd.DataFrame(events)


# --------------------------------------------------------------------------- #
# 5-6. the index, tenures, regimes
# --------------------------------------------------------------------------- #
def _surname(name: str) -> str:
    parts = [p for p in str(name).split() if p.strip(".").lower() not in _SUFFIXES]
    return parts[-1] if parts else str(name)


def build_stability(slots: pd.DataFrame, churn_role: pd.DataFrame) -> pd.DataFrame:
    ts = (churn_role.groupby(["season", "team"], as_index=False)
                    .agg(churn_points=("churn_points", "sum")))
    wide = slots.pivot(index=["season", "team"], columns="role").reset_index()
    wide.columns = [c[0] if not c[1] else f"{c[1].lower()}_{c[0]}" for c in wide.columns]
    ts = ts.merge(
        wide[["season", "team",
              "hc_closing_holder", "oc_closing_holder", "dc_closing_holder",
              "hc_opening_holder", "hc_n_stints", "oc_n_stints", "dc_n_stints"]],
        on=["season", "team"], how="left", validate="1:1")

    by = {(int(r.season), r.team): float(r.churn_points) for r in ts.itertuples()}
    present = set(by)

    w, trunc = [], []
    for r in ts.itertuples():
        s, t = int(r.season), r.team
        terms, missing = 0.0, False
        for lag, coef in enumerate(config.W_DECAY):
            key = (s - lag, t)
            if key in present:
                terms += coef * by[key]
            elif lag > 0:
                missing = True
        w.append(terms)
        trunc.append(missing)
    ts["W"] = w
    ts["window_truncated"] = trunc
    ts["stability_index"] = (config.INDEX_MEAN - config.SI_SLOPE * ts["W"]).clip(
        config.SI_MIN, config.SI_MAX)

    ts = ts.sort_values(["team", "season"], kind="stable").reset_index(drop=True)

    # Tenure: the length of the closing holder's unbroken run of consecutive
    # seasons ending at t. A gap in the franchise's season coverage resets it.
    for role in ("hc", "oc", "dc"):
        col, out = f"{role}_closing_holder", []
        run, prev_key, prev_name = 0, None, None
        for r in ts.itertuples():
            key = (r.team, int(r.season))
            name = getattr(r, col)
            contiguous = (prev_key is not None and prev_key[0] == r.team
                          and prev_key[1] == int(r.season) - 1)
            run = run + 1 if (contiguous and name == prev_name) else 1
            out.append(run)
            prev_key, prev_name = key, name
        ts[f"{role}_tenure_seasons"] = out

    # Regimes: head-coach identity only. Coordinator changes never start one.
    regime_id, regime_n, regime_start = [], [], []
    cur_id, cur_start, prev_key, prev_hc = None, None, None, None
    for r in ts.itertuples():
        contiguous = (prev_key is not None and prev_key[0] == r.team
                      and prev_key[1] == int(r.season) - 1)
        if not contiguous or r.hc_closing_holder != prev_hc:
            cur_start = int(r.season)
            cur_id = f"{r.team}-{cur_start}-{_surname(r.hc_closing_holder)}"
        regime_id.append(cur_id)
        regime_start.append(cur_start)
        regime_n.append(int(r.season) - cur_start + 1)
        prev_key, prev_hc = (r.team, int(r.season)), r.hc_closing_holder
    ts["regime_id"] = regime_id
    ts["regime_start_season"] = regime_start
    ts["regime_season_n"] = regime_n

    out = ts.rename(columns={
        "hc_closing_holder": "hc", "oc_closing_holder": "oc", "dc_closing_holder": "dc",
        "hc_n_stints": "hc_stints", "oc_n_stints": "oc_stints", "dc_n_stints": "dc_stints",
    })[[
        "season", "team", "churn_points", "W", "stability_index", "window_truncated",
        "hc", "oc", "dc",
        "hc_tenure_seasons", "oc_tenure_seasons", "dc_tenure_seasons",
        "hc_stints", "oc_stints", "dc_stints",
        "regime_id", "regime_start_season", "regime_season_n",
    ]].sort_values(["season", "team"]).reset_index(drop=True)

    out = io_utils.round_cols(out, {"churn_points": 6, "W": 6, "stability_index": 6})
    out = io_utils.as_int64(out, [
        "hc_tenure_seasons", "oc_tenure_seasons", "dc_tenure_seasons",
        "hc_stints", "oc_stints", "dc_stints", "regime_start_season",
        "regime_season_n",
    ])
    out["window_truncated"] = out["window_truncated"].astype(bool)

    io_utils.assert_rows(out, "team_season_stability")
    assert_full_32(out["team"], "team_season_stability")
    if not out["stability_index"].between(config.SI_MIN, config.SI_MAX).all():
        raise AssertionError("stability_index outside 0..100")
    lo = out[out["season"] == config.COACHING_WINDOW[0]]
    if not lo["window_truncated"].all():
        raise AssertionError("season 2000 must be window_truncated")
    return out


# --------------------------------------------------------------------------- #
# 7. regime_events + the dead-money link
# --------------------------------------------------------------------------- #
def build_regime_events(stability: pd.DataFrame) -> pd.DataFrame:
    st = stability.sort_values(["team", "season"], kind="stable").reset_index(drop=True)
    hc_stints = {(int(r.season), r.team): int(r.hc_stints) for r in st.itertuples()}

    rows, prev = [], {}
    for r in st.itertuples():
        s, t = int(r.season), r.team
        p = prev.get(t)
        if p is not None and p["season"] == s - 1 and p["hc"] != r.hc:
            rows.append({
                "team": t, "season": s,
                # A multi-stint HC slot means the identity changed DURING season
                # s; otherwise the change sits on the offseason boundary.
                "kind": "in_season" if hc_stints[(s, t)] > 1 else "offseason",
                "outgoing_hc": p["hc"], "incoming_hc": r.hc,
                "regime_id": r.regime_id,
                "prev_regime_id": p["regime_id"],
                "prev_regime_seasons": p["regime_season_n"],
            })
        prev[t] = {"season": s, "hc": r.hc, "regime_id": r.regime_id,
                   "regime_season_n": int(r.regime_season_n)}

    ev = pd.DataFrame(rows)

    dm = deadmoney.load_team_season()
    same, snap = deadmoney.resolve_same_stage(dm)
    med = snap.set_index("season")["median_dead_money_usd"].to_dict()
    lookup = {(int(r.season), r.team): r for r in same.itertuples()}
    covered = set(snap["season"])

    for k in (1, 2):
        state, usd, date, stage, median, reason, seas = [], [], [], [], [], [], []
        for r in ev.itertuples():
            s = int(r.season) + k
            seas.append(s)
            hit = lookup.get((s, r.team))
            if hit is not None and s in covered:
                state.append("value")
                usd.append(int(hit.dead_money_rec))
                date.append(hit.dm_rec_asof_date)
                stage.append(hit.dm_rec_asof_stage)
                median.append(int(round(med[s])))
                reason.append("")
            else:
                state.append("blank")
                usd.append(pd.NA)
                date.append("")
                stage.append("")
                median.append(pd.NA)
                # Partial-coverage rows are NEVER substituted.
                reason.append(config.BLANK_REASON_NO_DM_TABLE_FOR.format(season=s))
        ev[f"dm_next{k}_season"] = seas
        ev[f"dm_next{k}_state"] = state
        ev[f"dm_next{k}_usd"] = usd
        ev[f"dm_next{k}_asof_date"] = date
        ev[f"dm_next{k}_asof_stage"] = stage
        ev[f"dm_next{k}_league_median_usd"] = median
        ev[f"dm_next{k}_blank_reason"] = reason

    ev = ev.sort_values(["team", "season"]).reset_index(drop=True)
    ev = io_utils.as_int64(ev, [
        "season", "prev_regime_seasons",
        "dm_next1_season", "dm_next1_usd", "dm_next1_league_median_usd",
        "dm_next2_season", "dm_next2_usd", "dm_next2_league_median_usd",
    ])
    assert_full_32(ev["team"], "regime_events")
    if not ev["kind"].isin(("offseason", "in_season")).all():
        raise AssertionError("regime_events: kind vocabulary drifted")
    return ev


def aggregate_regime_effect(ev: pd.DataFrame) -> dict:
    """The aggregate readout, computed ONLY over pairs where the full-32 table
    exists, printing its own `n`, and worded as an association, never a cause
    (`SPEC.md` §2.8 step 7)."""
    vals = []
    for k in (1, 2):
        sub = ev[ev[f"dm_next{k}_state"] == "value"]
        for r in sub.itertuples():
            med = float(getattr(r, f"dm_next{k}_league_median_usd"))
            if med > 0:
                vals.append(float(getattr(r, f"dm_next{k}_usd")) / med)
    if not vals:
        return {"n_pairs": 0}
    arr = np.array(vals)
    return {
        "n_pairs": int(len(arr)),
        "mean_vs_league_median": round(float(arr.mean()), 4),
        "median_vs_league_median": round(float(np.median(arr)), 4),
        "pct_above_league_median": round(float((arr > 1.0).mean()), 4),
        "wording": "association, never cause",
    }


# --------------------------------------------------------------------------- #
# sanity: Belichick-era New England
# --------------------------------------------------------------------------- #
def belichick_sanity(stability: pd.DataFrame) -> dict:
    ne = stability[(stability["team"] == "NE")
                   & stability["season"].between(2000, 2023)].copy()
    all_si = stability["stability_index"].astype(float)
    p90 = float(all_si.quantile(0.90))
    mean_si = float(ne["stability_index"].astype(float).mean())
    # Franchise mean over the same window, ranked among all 32.
    win = stability[stability["season"].between(2000, 2023)]
    fr = win.groupby("team")["stability_index"].mean().sort_values(ascending=False)
    rank = int(list(fr.index).index("NE") + 1)
    in_top_decile = float((ne["stability_index"].astype(float) >= p90).mean())
    return {
        "seasons": int(len(ne)),
        "ne_mean_si_2000_2023": round(mean_si, 2),
        "league_p90_si": round(p90, 2),
        "ne_franchise_rank_2000_2023": rank,
        "ne_share_of_seasons_at_or_above_league_p90": round(in_top_decile, 4),
        "hc_tenure_max": int(ne["hc_tenure_seasons"].max()),
        "regimes": sorted(ne["regime_id"].unique()),
    }


# --------------------------------------------------------------------------- #
# mart entry points
# --------------------------------------------------------------------------- #
_CACHE: dict = {}


def _prepare(ctx):
    if "stability" not in _CACHE:
        staff = load_staff()
        slots = build_slots(staff)
        churn_role, events = build_churn(slots)
        stability = build_stability(slots, churn_role)
        _CACHE.update({"staff": staff, "slots": slots, "churn": churn_role,
                       "events": events, "stability": stability})
    return _CACHE


def mart_coaching_staff(ctx) -> pd.DataFrame:
    s = _prepare(ctx)
    out = s["staff"][[
        "season", "team", "team_current", "role", "stint", "coach_id",
        "coach_name", "note", "source_url",
    ]].copy()
    ctx.note_source("curated coaching_staff.csv (Wikipedia-primary, verified)",
                    rows=len(out),
                    window=f"{config.COACHING_WINDOW[0]}-{config.COACHING_WINDOW[1]}")
    return out


def mart_team_season_stability(ctx) -> pd.DataFrame:
    s = _prepare(ctx)
    out = s["stability"]
    san = belichick_sanity(out)
    ctx.stats["stability"] = {
        "team_seasons": len(out),
        "window_truncated_rows": int(out["window_truncated"].sum()),
        "mean_si": round(float(out["stability_index"].mean()), 2),
        "min_si": round(float(out["stability_index"].min()), 2),
        "n_change_events": int(len(s["events"])),
        "n_half_weight_events": int(s["events"]["half_weight"].sum()),
        "belichick": san,
    }
    ctx.note_source("curated coaching_staff.csv", rows=len(s["staff"]),
                    window=f"{config.COACHING_WINDOW[0]}-{config.COACHING_WINDOW[1]}")
    if ctx.verbose:
        print(f"  {len(out)} team-seasons; mean SI "
              f"{ctx.stats['stability']['mean_si']}, min "
              f"{ctx.stats['stability']['min_si']}; "
              f"{ctx.stats['stability']['window_truncated_rows']} window-truncated")
        print(f"  change events {len(s['events'])} "
              f"({int(s['events']['half_weight'].sum())} at NONE half weight)")
        print(f"  Belichick-era NE 2000-2023: mean SI {san['ne_mean_si_2000_2023']} "
              f"vs league p90 {san['league_p90_si']}; franchise rank "
              f"#{san['ne_franchise_rank_2000_2023']} of 32; HC tenure peak "
              f"{san['hc_tenure_max']}")
    return out


def mart_regime_events(ctx) -> pd.DataFrame:
    s = _prepare(ctx)
    ev = build_regime_events(s["stability"])
    agg = aggregate_regime_effect(ev)
    ctx.stats["regime_events"] = {
        "events": len(ev),
        "offseason": int((ev["kind"] == "offseason").sum()),
        "in_season": int((ev["kind"] == "in_season").sum()),
        "dm_next1_value": int((ev["dm_next1_state"] == "value").sum()),
        "dm_next2_value": int((ev["dm_next2_state"] == "value").sum()),
        "aggregate": agg,
    }
    ctx.note_source("team_season_stability + curated dead-money snapshots",
                    rows=len(ev), window=f"tier={config.DEAD_MONEY_TIER}")
    if ctx.verbose:
        st = ctx.stats["regime_events"]
        print(f"  {st['events']} regime changes "
              f"({st['offseason']} offseason, {st['in_season']} in-season); "
              f"dead-money links s+1 {st['dm_next1_value']}, s+2 {st['dm_next2_value']}")
        if agg["n_pairs"]:
            print(f"  association readout: n={agg['n_pairs']} dated pairs, "
                  f"mean {agg['mean_vs_league_median']}x the league median for "
                  f"that season ({agg['pct_above_league_median']:.0%} above it)")
    return ev
