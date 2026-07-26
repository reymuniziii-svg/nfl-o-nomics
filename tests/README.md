# tests/ — the YIELD/YARD CI harness

```bash
pip install pandas duckdb pyarrow pytest
pytest tests/ -v
```

Runs in **~0.4s**. Everything reads **committed files only** — `data/marts/`,
`data/curated/`, and the audit receipts in `audit/`. **No test may fetch from the
network.** CI has no secrets and no outbound access; a golden test that re-pulls a
remote asset is testing nflverse's uptime, not this pipeline. If you need a fact
that only exists remotely, commit the receipt and score against that.

Current state (2026-07-26): **182 passed, 0 skipped.** Every mart is built, so
every declared contract now validates for real.

Historically the count was 92 passed / 77 skipped, and a skip meant one thing —
*the mart has not been built yet.* There are still no "not applicable" skips, and
a skip reappearing means a mart went missing.

---

## What runs

| File | Covers | Source of truth |
|---|---|---|
| `test_golden.py` | 18 externally-verified facts + test 16b (negative) + the hand-computed cost-per-win | `DATA_AUDIT.md` §3, §3.1, §3.2 · `audit/golden_facts_sources.md` |
| `test_structural.py` | S1–S11, the whole-mart invariants | `DATA_AUDIT.md` §4, §4.1 |
| `test_contracts.py` | Schema contracts for every mart in SPEC §7 | `SPEC.md` §7 |
| `conftest.py` | Fixtures, tolerance helpers, audit-receipt parsers | — |

### `test_golden.py`

Tests 1–11 (records, point differential, cap ceilings) and 12–16 (money) score
directly against `data/marts/` and `data/curated/`. Tests 12, 13 and 16b score
against `data/curated/staging/contracts_golden_checks.csv`, the committed
recomputation of the nflverse contracts route.

**Test 16b is a negative test and it PASSES because the absence is expected.**
Russell Wilson's $85M Denver dead money must remain *absent* from the
nflverse-derived route and *present at the exact value* in
`data/curated/dead_money_ledger.csv`. nflverse `historical_contracts` is a
player-following career table — when a player is released it switches teams and
the charge left on the old team is never written. If a DEN charge ever appears
there, **that is a finding, not a fix**, and the build fails so a human looks.
Three tests hold this down: the two-season absence, the exact-value presence in
the curated ledger, and the breadth check that all five inference routes and 8 of
8 further separations still return zero rows.

**Tests 17 (Brady draft position) and 18 (Tomlinson snaps) now score against the
real marts** — `draft_pick` and `player_season_availability` landed 2026-07-26 and
both tests switched automatically, because each calls `find_mart()` first and only
falls back to the committed audit receipt (`audit/findings_support_datasets.md`)
when the mart is absent. **No edit was needed**, which was the point of the shape.
Keep the fallback: it is what lets a golden test exist before its mart does, and
`data/raw/` stays empty by design.

### `test_structural.py`

S1 era-correct team-season counts (861 = 31×3 + 32×24) · S2 zero missing REG
scores, checked *twice* — null cells **and** games-count consistency against the
era-correct schedule (6,967 REG games), because a game dropped upstream shows up
as a short schedule, not as a null · S3 league points balance · S4 record
arithmetic and the ties-as-half-a-win identity · S5 1:1 mart joins · S6 EPA sanity
band · S7 zero-win rows and the display rule · S8 the 2022 BUF/CIN 16-game
exception · S9 cap-spend plausibility bounds · S10 coaching completeness · S11
dead-money coverage shape and as-of discipline.

**The display-rule guard (S7) is the one worth reading.** `cost_per_win()` in that
file is a reference implementation of the `DATA_AUDIT.md` §4.1 rule, and the tests
prove the guard is load-bearing rather than decorative: 2017 CLE has *both* a cap
row and `wins = 0`, so an unguarded vectorised division genuinely yields `inf`
today, which would serialise into the app as `Infinity`. The guarded path must
render `"$151.1M spent · 0 wins"` and must be excluded from ratio-ranked
orderings. 2008 DET is asserted to have **no** cap row at all — it is Tier 1 only,
and asserting the absence is what stops a well-meaning backfill from inventing a
denominator.

### `test_contracts.py`

A registry of 18 mart specs — exact column set, dtype coercibility, nullability,
coverage-flag vocabularies, grain uniqueness, row count, season window, forbidden
columns.

**Auto-discovery.** Every declared contract now resolves — the eleven marts that
were still being built when this was written (`capplus_official`, `team_rating`,
`team_season_stability`, `regime_events`, `draft_pick`, `draft_class_summary`,
`player_season_cap`, `player_season_availability`, `player_images`,
`position_allocation`, `dead_money_display`) **all landed 2026-07-26 and validate
in full.** The mechanism stays, because it is how the next mart gets a contract
before it exists: each resolves through `find_mart()`, which tries `.csv` then
`.parquet`, in `data/marts/` then `data/curated/`, under both the SPEC name and
the BUILD_PLAN alias (`stability_index`, `draft_capital`,
`positional_allocation`). Absent → `pytest.skip` with a reason naming the SPEC
section. Present → the full contract validates on the next run, **no edit here**.

Two columns were **PENDING** — `license_tier` on `dead_money_team_season` and
`stint` on `coaching_staff` (SPEC §7, BUILD_PLAN Phase 1 item 4). **Both shipped
2026-07-26** and `test_pending_spec_columns` now validates them fully rather than
skipping. `license_tier` additionally has its DATA_AUDIT §5 tier distribution
pinned (69 / 45 / 64 / 192) — that count is the mechanism the
`DEAD_MONEY_TIER=SAFE_ONLY` legal contingency depends on.

---

## Tolerances

From `DATA_AUDIT.md` §3, enforced by `assert_exact` and `assert_money` in
`conftest.py`:

| Class | Tolerance | Applies to |
|---|---|---|
| Exact | `==`, delta 0 | wins, records, point differential, **cap ceilings**, draft position, snap counts |
| Money | **±1%** | player cap hits, dead-money charges, cash spend, cost per win |

Two things people get wrong here. **League cap ceilings are exact, not ±1%** —
they are published figures, not derived money. And the ±1% band exists to absorb a
*source revision*, not slop: every money check currently returns **$0**, and
ARCHITECTURE §12 is explicit that a drift of one dollar fails the build. If a money
test starts landing at 0.4% instead of 0.0%, investigate — do not shrug at it
because it is inside the band.

---

## Genuine data finding — `asof_stage` is not a unique selector

Reported rather than papered over. `test_s11_stage_is_not_a_unique_selector_known_ambiguity_is_pinned`
pins it.

`SPEC.md` §7.4 says the UI and Cap+ select one dead-money snapshot per season by
"the same-stage resolution". **That resolution is not deterministic for 2018.**
`dead_money_team_season` carries two full-32 snapshots for 2018 that are *both*
tagged `preseason`:

| as-of | stage | coverage | league-wide total |
|---|---|---|---|
| 2018-03-01 | `preseason` | `full32` | $155,227,000 |
| 2018-07-14 | `preseason` | `full32` | $348,465,510 |

A **2.25× swing**, and `coverage` does not break the tie because both are
`full32`. `capplus_candidates.csv` silently resolved to the July row. Contrast
2019, which also has two `preseason` dates but is *not* ambiguous, because there
`coverage` separates the full-32 March reading from the partial 14-team May one —
and the resolution correctly took March.

So the two affected seasons were resolved by opposite date rules (2018 → later,
2019 → earlier) and only one of them is explained by a stated field. The root
cause is that `AsOfStage` has four values and cannot distinguish "start of the
league year" from "post-June-1 / training camp", which is precisely the window in
which dead money accrues fastest.

**This is not a test failure and nothing here is blocked by it.** The declared
grain in SPEC §7.5, `(season, team, asof_date)`, *is* unique — asserted by
`test_s11_grain_is_unique_on_season_team_asof_date`. But before `capplus_official`
is promoted, the resolution rule needs an explicit, written tie-break (most likely:
prefer `full32`, then take the latest `asof_date`, and record which was chosen).
The test pins the ambiguity to exactly the one group where it exists today; a
*new* ambiguous group appearing anywhere fails the build, because it would
silently change which snapshot Cap+ resolves to.

**RESOLVED 2026-07-26 — the tie-break is pinned, and it is the one guessed above**
(`DECISIONS.md` 97, `etl/README.md`): filter to the broadest coverage class present
(`full32` > `partial` > `top5`), then take the latest `asof_date`; a season whose
best class is not `full32` does not resolve and blanks whole-season. The choice is
**emitted as data** — one row per season in the `dead_money_snapshot_resolution`
mart — so the tests assert against the recorded decision rather than against
behaviour buried in a function, and `deadmoney.assert_pinned_resolution` holds the
per-season outcomes. Under this rule 2018 and 2019 resolve by the *same* rule
rather than by opposite date rules: 2019's May reading is `partial` (14 teams) and
loses at step 1, not step 2. The ambiguity pin above stays exactly as it is.

---

## How to add a golden test

1. **Verify the fact externally first, and write down the URL.** Add it to
   `audit/golden_facts_sources.md` with a `VALUE` / `SOURCE` / `CONFIDENCE` block,
   in that file's existing format. A number with no citation is not a golden test.
   If sources disagree, say so in the CONFIDENCE line and pin *which* snapshot you
   mean — Mahomes 2023 moved three times inside one year.

2. **Add the row to `DATA_AUDIT.md` §3** with the external value, the pipeline
   value, the delta and the verdict, so the audit table and the suite stay in
   lockstep.

3. **Write the test in `test_golden.py`**, named `test_gNN_<slug>`:

   ```python
   def test_g19_2019_bal_record(results):
       """#19  2019 BAL regular-season record — external 14-2 (Wikipedia)."""
       r = one_row(results, "2019 BAL", season=2019, team="BAL")
       assert_exact(int(r.wins), 14, "2019 BAL wins")
   ```

   - Use `assert_exact` for wins, records, point differential, cap ceilings, draft
     position and snap counts; `assert_money` for anything denominated in dollars.
   - Use `one_row(df, label, **filters)` rather than `.iloc[0]` — it asserts the
     selection is unique, which catches a duplicated key as a *test* failure
     instead of silently scoring the wrong row.
   - Take the mart through a fixture (`results`, `cap`, `league_cap`,
     `dm_ledger`, `dm_team_season`, `coaching`, `epa`). Fixtures are
     session-scoped and cached.
   - Put the external value and its source **in the docstring**. Six months from
     now the docstring is the only thing that explains why the number is what it is.

4. **If the fact lives in a mart that does not exist yet**, follow the shape of
   tests 17 and 18: call `find_mart(...)` first, assert against the mart when it
   returns a path, and fall back to a committed receipt otherwise. Never make the
   test fetch.

5. **Run `pytest tests/ -v` and make it pass against the data as committed.** If it
   does not pass, work out which side is wrong before touching either. A golden
   test that fails is doing its job; the fix is a fix to the pipeline or a
   correction to the external value, and either way it gets written down. Loosening
   a tolerance to get to green is how a $0 delta becomes a $2M one nobody notices.

### Adding a structural test or a mart contract

Structural invariants go in `test_structural.py` next to their `SNN` sibling.
New marts go in the `REGISTRY` in `test_contracts.py` — add a `Mart(...)` entry
with its `spec_ref`, filename candidates, columns and grain, and every rule in the
file picks it up automatically. Use `pending={...}` for a column SPEC requires but
ETL has not shipped, so the contract is declared without breaking the build.
