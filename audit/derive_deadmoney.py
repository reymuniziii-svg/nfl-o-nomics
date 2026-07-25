#!/usr/bin/env python3.11
"""PROTOTYPE: can dead money be DERIVED in-house from the nflverse contracts file?

Motivation (findings_deadmoney_sourcing.md §5): dead money is a derived quantity
that only OverTheCap and Spotrac compute, and neither licenses it. Every
per-team-season figure we can cite traces back to one of them. If the charge can
be reconstructed from clean-terms contract data, the licensing problem disappears
and we get full-window coverage instead of a handful of dated snapshots.

Source: https://github.com/nflverse/nflverse-data/releases/download/contracts/
        historical_contracts.parquet   (OTC-derived contract TERMS, redistributed
        by nflverse -- terms, not the dead-money computation)

ACCOUNTING MODEL
  A signing bonus is paid in cash up front but charged to the cap in equal
  installments over the contract's length, capped at five years. When a player is
  released or traded, every installment not yet charged accelerates onto the cap
  at once. That accelerated remainder -- plus any future salary that was
  guaranteed -- is the dead money charge:

      dead_money = unamortized_signing_bonus_proration + accelerating_guarantees

STRUCTURAL FACTS THIS PROTOTYPE MUST WORK AROUND (see audit/audit_contracts.py)
  1. `cols` is the player's ENTIRE CAREER cap table, replicated byte-identically
     onto every one of his contract rows. It MUST be deduped on (otc_id, year)
     before use, and junk year labels ('Total', '0', '201') dropped.
  2. When a player joins a new team, the new team's schedule OVERWRITES the future
     years of the old contract in `cols`. The old contract's post-separation
     schedule -- exactly the thing dead money is computed from -- is not retained
     anywhere in the dataset. It must be inferred from contract terms.
  3. There is no signing-bonus field, no restructure event, and no transaction
     date. Restructures appear only as an unexplained JUMP in `prorated_bonus`.

Three GENERAL estimators are implemented and scored on the same validation set.
None is tuned per case; each is a single formula applied to every separation.

Usage:
  python3.11 audit/derive_deadmoney.py [--download]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audit_contracts import (  # noqa: E402
    NICKNAME_TO_CODE, build_player_seasons, duck_connect, load_contracts,
)
from team_codes import normalize_team  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
STAGING = ROOT / "data" / "curated" / "staging"

# Known ACTUAL charges (from data/curated/dead_money_ledger.csv, press-verified).
# (player, team_code, first_season_of_charge, actual_total_usd, label)
VALIDATION = [
    ("Russell Wilson", "DEN", 2024, 85_000_000, "2024+2025 (53.0/32.0)"),
    ("Matt Ryan", "ATL", 2022, 40_525_000, "2022"),
    ("Aaron Rodgers", "GB", 2023, 40_300_000, "2023"),
    ("Tom Brady", "TB", 2023, 35_104_000, "2023"),
    ("Carson Wentz", "PHI", 2021, 33_820_000, "2021"),
    ("Khalil Mack", "CHI", 2022, 24_000_000, "2022"),
    ("Marcell Dareus", "BUF", 2017, 23_940_000, "2017+2018"),
]

# Team-season totals to test aggregation (ESPN/RMS season-final values).
VALIDATION_TEAM = [("CHI", 2022, 91_800_000), ("ATL", 2022, 87_600_000)]

MAX_PRORATION_YEARS = 5  # league rule: a bonus prorates over at most five years


# --------------------------------------------------------------- data assembly


def player_season_table(con) -> pd.DataFrame:
    df = con.execute("""
        SELECT otc_id, player, season, nickname, base_salary, prorated_bonus,
               guaranteed_salary, cap_number, option_bonus, roster_bonus
        FROM ps WHERE season IS NOT NULL
    """).df()
    df["team"] = df["nickname"].map(NICKNAME_TO_CODE).map(normalize_team)
    for c in ("base_salary", "prorated_bonus", "guaranteed_salary", "cap_number",
              "option_bonus", "roster_bonus"):
        df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0.0) * 1e6
    return df.sort_values(["otc_id", "season"]).reset_index(drop=True)


def contract_table(con) -> pd.DataFrame:
    c = con.execute("""
        SELECT otc_id, player, team AS team_raw, year_signed, years, value, apy, guaranteed
        FROM c WHERE year_signed IS NOT NULL AND years IS NOT NULL AND years > 0
    """).df()
    for k in ("value", "apy", "guaranteed"):
        c[k] = pd.to_numeric(c[k], errors="coerce").fillna(0.0) * 1e6
    return c


def attach_signing_team(contracts: pd.DataFrame, ps: pd.DataFrame) -> pd.DataFrame:
    """Resolve each contract's signing team from `cols` at year_signed.

    The contract-level `team` string is unreliable for multi-team deals: it is a
    slash-joined set whose order is NOT signing-team-first (Wentz's 2019 PHI
    extension is labelled 'IND/PHI/WAS'). The team the player actually appears on
    in the year the contract was signed is the robust signal.
    """
    key = ps[["otc_id", "season", "team"]].rename(
        columns={"season": "year_signed", "team": "signing_team"})
    out = contracts.merge(key, on=["otc_id", "year_signed"], how="left")
    # Fallback for single-team contract strings when cols has no row that year.
    fallback = out["team_raw"].map(NICKNAME_TO_CODE).map(normalize_team)
    out["signing_team"] = out["signing_team"].fillna(fallback)
    return out


def direct_read_probe(ps: pd.DataFrame) -> pd.DataFrame:
    """ROUTE R -- the one case where OTC's own dead-money figure survives in `cols`.

    Structural fact 2 says the new team's schedule overwrites the old contract's
    future years. That overwrite only happens if the player SIGNS SOMEWHERE ELSE.
    For a player who retires (or leaves the league) the career table is never
    overwritten, and OTC leaves the accelerated charge sitting in `cap_number` on a
    season with no base salary.

    Signature: base_salary == 0 AND cap_number > 0 AND prorated_bonus > 0.

    Tom Brady 2023 is the textbook instance -- cap_number $35,104,000 with zero
    base salary, which is precisely the published charge, to the dollar. This is a
    direct read, not a derivation, so it carries no model error at all. It is also
    structurally limited to retirements: it cannot see a single trade or release,
    which is where the overwhelming majority of dead money is actually created.
    """
    m = ps[(ps.base_salary == 0) & (ps.cap_number > 0) & (ps.prorated_bonus > 0)]
    return m[["otc_id", "player", "season", "team", "cap_number",
              "prorated_bonus"]].copy()


def find_separations(ps: pd.DataFrame) -> pd.DataFrame:
    """A separation = the player's team changes between consecutive cols years.

    `last_season` is his final season on the departed team; the dead money lands
    from `last_season + 1` onward.
    """
    rows = []
    for otc, g in ps.groupby("otc_id", sort=False):
        g = g.dropna(subset=["team"]).sort_values("season")
        if len(g) < 2:
            continue
        arr = g[["season", "team", "player"]].to_records(index=False)
        for i in range(len(arr) - 1):
            s0, t0, name = arr[i]
            s1, t1, _ = arr[i + 1]
            if t0 != t1:
                rows.append({"otc_id": otc, "player": name, "from_team": t0,
                             "to_team": t1, "last_season": int(s0),
                             "charge_season": int(s0) + 1})
    return pd.DataFrame(rows)


# ------------------------------------------------------------------- estimators


def estimate(sep_row, contracts: pd.DataFrame, ps: pd.DataFrame) -> dict | None:
    """Compute all three general estimators for one separation.

    Common inputs
      obs      the player's seasons on the departed team under the governing
               contract, i.e. year_signed .. last_season
      expensed cumulative proration already charged to the cap over `obs`
      layers   restructure layers, inferred from year-over-year JUMPS in
               prorated_bonus (the only restructure signal in the data)

    M1 flat        remaining proration = last observed rate x years left in the
                   nominal proration window, plus unpaid guarantees.
    M2 layered     each layer amortizes over min(5, years left in the contract);
                   conservative -- assumes no void years.
    M3 layered-5yr each layer amortizes over a full 5 years regardless of contract
                   end; permissive -- approximates void-year behaviour.
    """
    otc, team, S = sep_row.otc_id, sep_row.from_team, sep_row.last_season

    cand = contracts[(contracts.otc_id == otc)
                     & (contracts.signing_team == team)
                     & (contracts.year_signed <= S)]
    if cand.empty:
        return None
    C = cand.sort_values("year_signed").iloc[-1]
    y0, nyears, gtd = int(C.year_signed), int(C.years), float(C.guaranteed)

    obs = ps[(ps.otc_id == otc) & (ps.season.between(y0, S)) & (ps.team == team)]
    obs = obs.sort_values("season")
    if obs.empty:
        return None

    expensed = float(obs["prorated_bonus"].sum())
    gtd_paid = float(obs["guaranteed_salary"].sum())
    last_rate = float(obs.iloc[-1]["prorated_bonus"])
    # An option bonus exercised in-window prorates like a signing bonus.
    option_total = float(obs["option_bonus"].sum())

    contract_end = y0 + nyears - 1
    nominal_end = y0 + min(nyears, MAX_PRORATION_YEARS) - 1

    # ---- M1: flat remaining window
    m1_prorate = max(0, nominal_end - S) * last_rate

    # ---- layers: base at y0, then each year-over-year increase is a restructure
    rates = dict(zip(obs["season"].astype(int), obs["prorated_bonus"].astype(float)))
    layers = []  # (start_year, size)
    prev = 0.0
    for yr in range(y0, S + 1):
        r = rates.get(yr, prev)
        if yr == y0:
            if r > 0:
                layers.append((yr, r))
        elif r > prev + 1.0:  # $1 tolerance against float noise
            layers.append((yr, r - prev))
        prev = r

    def layered(cap_to_contract_end: bool) -> float:
        tot = 0.0
        for start, size in layers:
            if cap_to_contract_end:
                life = min(MAX_PRORATION_YEARS, max(1, contract_end - start + 1))
            else:
                life = MAX_PRORATION_YEARS
            end = start + life - 1
            tot += max(0, end - S) * size
        return tot

    m2_prorate = layered(True)
    m3_prorate = layered(False)

    # ---- accelerating guarantees: guaranteed money not yet paid out as bonus
    # proration or as guaranteed salary while the player was on the roster.
    def rem_gtd(prorate_remaining: float) -> float:
        bonus_total = expensed + prorate_remaining
        return max(0.0, gtd - bonus_total - gtd_paid)

    return {
        "player": sep_row.player, "team": team, "to_team": sep_row.to_team,
        "last_season": S, "charge_season": sep_row.charge_season,
        "year_signed": y0, "years": nyears,
        "contract_value": float(C.value), "guaranteed": gtd,
        "expensed_proration": expensed, "last_rate": last_rate,
        "option_bonus_seen": option_total, "n_layers": len(layers),
        "m1_usd": m1_prorate + rem_gtd(m1_prorate),
        "m2_usd": m2_prorate + rem_gtd(m2_prorate),
        "m3_usd": m3_prorate + rem_gtd(m3_prorate),
        "m1_prorate": m1_prorate, "m2_prorate": m2_prorate, "m3_prorate": m3_prorate,
    }


def build_estimates(ps: pd.DataFrame, contracts: pd.DataFrame,
                    seps: pd.DataFrame) -> pd.DataFrame:
    out = []
    for r in seps.itertuples():
        e = estimate(r, contracts, ps)
        if e:
            out.append(e)
    return pd.DataFrame(out)


# ---------------------------------------------------------------- verification


def score(est: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for name, team, season, actual, label in VALIDATION:
        m = est[(est.player == name) & (est.team == team)
                & (est.charge_season == season)]
        rec = {"case": f"{name} / {team} {label}", "actual_usd": actual}
        if m.empty:
            rec.update({"derived_usd": None, "delta_usd": None, "delta_pct": None,
                        "note": "NO SEPARATION DETECTED"})
        else:
            row = m.iloc[0]
            for k in ("m1", "m2", "m3"):
                v = float(row[f"{k}_usd"])
                rec[f"{k}_usd"] = v
                rec[f"{k}_delta_pct"] = (v - actual) / actual * 100.0
            rec["note"] = ""
        rows.append(rec)
    return pd.DataFrame(rows)


def score_team(est: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for team, season, actual in VALIDATION_TEAM:
        sub = est[(est.team == team) & (est.charge_season == season)]
        rec = {"case": f"{team} {season} team total", "actual_usd": actual,
               "n_separations": len(sub)}
        for k in ("m1", "m2", "m3"):
            v = float(sub[f"{k}_usd"].sum())
            rec[f"{k}_usd"] = v
            rec[f"{k}_delta_pct"] = (v - actual) / actual * 100.0
        rows.append(rec)
    return pd.DataFrame(rows)


def fmt(v) -> str:
    return "     n/a" if v is None or pd.isna(v) else f"${v/1e6:>8.2f}M"


def pct(v) -> str:
    return "    n/a" if v is None or pd.isna(v) else f"{v:+7.1f}%"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--download", action="store_true")
    args = ap.parse_args()
    STAGING.mkdir(parents=True, exist_ok=True)

    print("== loading contracts parquet ==")
    con = duck_connect()
    load_contracts(con, args.download)
    build_player_seasons(con)

    ps = player_season_table(con)
    contracts = attach_signing_team(contract_table(con), ps)
    seps = find_separations(ps)
    print(f"  player-seasons {len(ps):,} | contracts {len(contracts):,} | "
          f"separations detected {len(seps):,}")

    est = build_estimates(ps, contracts, seps)
    print(f"  separations with a resolvable governing contract: {len(est):,} "
          f"({len(est)/len(seps):.1%})")
    est.to_csv(STAGING / "deadmoney_derived_estimates.csv", index=False)

    # ------------------------------------------------- individual validation
    print("\n== INDIVIDUAL CHARGE VALIDATION ==")
    sc = score(est)
    hdr = (f"  {'case':<44} {'actual':>10} {'M1 flat':>10} {'d%':>8} "
           f"{'M2 layer':>10} {'d%':>8} {'M3 lyr5y':>10} {'d%':>8}")
    print(hdr)
    print("  " + "-" * (len(hdr) - 2))
    for r in sc.itertuples():
        print(f"  {r.case:<44} {fmt(r.actual_usd)} "
              f"{fmt(getattr(r,'m1_usd',None))} {pct(getattr(r,'m1_delta_pct',None))} "
              f"{fmt(getattr(r,'m2_usd',None))} {pct(getattr(r,'m2_delta_pct',None))} "
              f"{fmt(getattr(r,'m3_usd',None))} {pct(getattr(r,'m3_delta_pct',None))}"
              + (f"   [{r.note}]" if r.note else ""))
    sc.to_csv(STAGING / "deadmoney_derivation_scorecard.csv", index=False)

    # ------------------------------------------------------ team validation
    print("\n== TEAM-SEASON TOTAL VALIDATION ==")
    st = score_team(est)
    for r in st.itertuples():
        print(f"  {r.case:<28} n_sep={r.n_separations:>3}  actual {fmt(r.actual_usd)}   "
              f"M1 {fmt(r.m1_usd)} {pct(r.m1_delta_pct)}   "
              f"M2 {fmt(r.m2_usd)} {pct(r.m2_delta_pct)}   "
              f"M3 {fmt(r.m3_usd)} {pct(r.m3_delta_pct)}")
    st.to_csv(STAGING / "deadmoney_derivation_team_scorecard.csv", index=False)

    # ------------------------------------------- Route R: direct read probe
    print("\n== ROUTE R: direct read (retirements only, no model) ==")
    dr = direct_read_probe(ps)
    dr.to_csv(STAGING / "deadmoney_direct_read.csv", index=False)
    brady = dr[(dr.player == "Tom Brady") & (dr.season == 2023)]
    if not brady.empty:
        v = float(brady.iloc[0]["cap_number"])
        print(f"  Tom Brady TB 2023 direct read: {fmt(v)} vs actual "
              f"{fmt(35_104_000)}  delta {pct((v - 35_104_000)/35_104_000*100)}")
    print(f"  rows matching the zero-salary/positive-cap signature: {len(dr):,}")
    print(f"  distinct players                                    : {dr.otc_id.nunique():,}")
    covered = len(dr)
    print(f"  vs {len(seps):,} trade/release separations the route CANNOT see "
          f"({covered/(covered+len(seps)):.1%} of all events)")

    # ---------------------------------------------------------- the verdict
    print("\n== VERDICT ==")
    best, best_med = None, None
    for k in ("m1", "m2", "m3"):
        col = f"{k}_delta_pct"
        if col not in sc:
            continue
        med = sc[col].abs().median()
        hit = int((sc[col].abs() <= 15).sum())
        print(f"  {k}: median |error| = {med:6.1f}%   within +/-15%: {hit}/{len(sc)}")
        if best_med is None or med < best_med:
            best, best_med = k, med
    n_missing = int(sc["note"].eq("NO SEPARATION DETECTED").sum())
    if n_missing:
        print(f"  cases with no detectable separation: {n_missing}/{len(sc)}")
    viable = best_med is not None and best_med <= 15.0 and n_missing == 0
    print(f"\n  BEST MODEL: {best}  (median |error| {best_med:.1f}%)")
    print(f"  DERIVATION VIABLE FOR PHASE 1: {'YES' if viable else 'NO'}")
    if not viable:
        print("  -> the curated press snapshots stand alone; do not ship derived figures.")

    leftover = [p.name for p in (ROOT / "data" / "raw").glob("*") if p.is_file()]
    print(f"\n  data/raw/ left empty: {'PASS' if not leftover else 'FAIL ' + str(leftover)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
