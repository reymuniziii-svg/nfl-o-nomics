# Methodology

YIELD/YARD asks one question about every NFL team season: what did the wins cost? This page
shows how we answer it, what our numbers can't see, and where each figure comes from.

---

## What Cap+ is

**Cap+ measures how much on-field performance a team got for the cap money it carried, with 100
as that season's league average.**

Think of it as field position. 100 is midfield, and every 15 points is 15 yards. A team at 130
sits at the opponent's 20. A team at 70 is pinned at its own 20. Each team is measured against
its own season's league, so a 2015 team and a 2024 team compare directly.

Cap+ is a price tag, not a grade.

## How it's computed

Performance, called P, blends three measures with equal weights: win percentage (a tie counts as
half a win), point differential per game, and EPA margin per play. Each is compared with the rest
of that season. EPA, expected points added, is how many points a play added beyond what the
down, distance and field position predicted. The margin is offensive EPA per play minus
defensive EPA per play, on runs and passes. Regular season only. Alternate weightings correlate
at least 0.9968 with this one and shift teams 0.74 places or less on average.

Cost is the cap charged to rostered players plus dead money, the cap you still pay for players
who are gone, with each dead dollar counted at $1.50. We divide by the league cap, compare with
the season's average, and apply a floor.

```
Cap+ = (100 + 15 × P) ÷ R

P    = equal-weight blend of win percentage, point differential per game
       and EPA margin per play, each within its season

R    = team cost ÷ league-average cost, floored at the season's 25th percentile

cost = (cap charged to rostered players + 1.5 × dead money) ÷ league cap
```

Each season's mean is exactly 100. One pooled spread across all seasons sets 15 points as one
standard deviation, so a point means the same thing in every year.

### Why a dead dollar counts as $1.50

This is a claim about football economics, so we state it plainly.

> **A dollar of dead cap costs a team half again what a live dollar does, because it buys no
> player and it blocks a roster spot.**

It's a judgment, not a measurement, and it changes the answer, so here are the numbers beside
it. The middle column is the average move for each season's three biggest dead-money teams,
against their on-field rank.

| Weight on a dead dollar | Top-3 dead-money teams | 2022 ATL |
|---|---|---|
| $1.00 | down 0.63 places, 1.1 points | 96 (19th) |
| **$1.50 (ours)** | **down 3.22 places, 5.5 points** | **89 (27th)** |
| $2.00 | down 5.33 places, 9.2 points | 83 (30th) |

At $1.00, dead money does almost nothing, and Atlanta, 24th on the field in 2022, lands 19th. It
rates poorly only because we chose $1.50. At $2.00 we'd punish ordinary charges. Denver's $85.2M
as of 2024-11-27 sat above the $50.3M league median. Its cap consumption, rostered cap plus dead
money as a share of the league cap, was still exactly the 2024 median. At $2.00 it would drop to
20th.

### The floor

A pure ratio rewards a team for not spending. So no team's cost counts as lower than the 25th
percentile of its season. That puts eight teams a season on the floor by construction. The
league average is taken after the floor, so R = 1.00 still means league-average cost. The floor
is why the 0-16 Browns of 2017 rate 32nd. Without it, they rated 23rd for not spending.

At $1.50 per dead dollar, 44.1% of team-seasons have a cost above 1.00. So the weighted cost is
an index, never "% of cap used," and we publish it beside the plain cap-consumed percentage.

### One date per season

Dead money piles up through the league year as players are cut and traded. Chicago's 2022 figure
reads $57.6 million in the preseason and $91.8 million once the year is over. So every team in a
season is read from one dated table (2014-02-18 for 2014, 2025-12-17 for 2025), and the date is
printed next to every dead-money figure. We never connect those figures across seasons with a
line. They're dated readings, not a trend.

The 2014 and 2019 tables came out before the league year opened, so they understate the final
figures. Their median team charge reads $4.0 million and $3.4 million, against $50.3 million in
2024. Both seasons carry a "provisional" badge.

---

## What Cap+ is not

**It isn't a front-office grade.** Across the 288 team-seasons it covers, Cap+ correlates **0.95**
with Team Rating, the same performance score with no money in it. The reason is the salary cap.
Every team spends close to it, so cost varies by about 0.05 within a season and performance by
about 0.15. Cap+ is Team Rating with a small cost adjustment. It moves a team 2.2
places from its on-field rank, on average. Read it as what this season's wins cost.

**It doesn't repeat.** The cost adjustment, Cap+ minus performance, carries from one season to
the next at only +0.158. Dead money is a one-year event.

**It can't see borrowed cap.** Cap+ counts the cap a team used this year, not the cap it
borrowed against. The next sections measure that gap.

## The rookie-QB finding

The theory says a team with a quarterback on his first contract has a built-in edge. We tested it.
The starting QB is the one with the most offensive snaps. He's in his rookie window if the team
drafted him and he's still on his draft-year contract. The season must fall within four seasons
of the draft, which admits the fifth-year option. Of the 288 Cap+ team-seasons, 100 have a starter
in his rookie window. We call that a rookie-deal starter.

| | Teams | Avg Cap+ | Avg Team Rating | QB-timing points |
|---|---:|---:|---:|---:|
| Rookie-deal QB | 100 | 98.0 | 97.4 | +2.8 |
| Veteran-deal QB | 188 | 101.1 | 101.4 | −1.5 |

Teams with a rookie-deal starter average below 100 because they're usually still bad. Their cheap
quarterbacks add 2.8 points on average, a fifth of one standard deviation. Give each a league-
median-priced starter and Cap+ falls by that much. The 2019 Chiefs score −2.4: their cost was
already under the floor, so a cheap quarterback bought them nothing Cap+ could see. Within each
season, Cap+ and QB share of the cap correlate positively, from +0.12 to +0.45.

## QB-neutral Cap+

We recompute Cap+ as if each team had paid the season's median starting QB, on the same scale.
It sits beside Cap+ and splits it into two parts that add up exactly.

```
Cap+ − 100 = QB-timing points + roster points

QB-timing points = Cap+ − QB-neutral Cap+
roster points    = QB-neutral Cap+ − 100
```

QB-timing points are what the quarterback's contract was worth. Roster points are everything
else. Teams with a rookie-deal starter are also ranked against each other, and teams with a
veteran-deal starter likewise.

## The future-cap mortgage

A signing bonus is charged to the cap in equal yearly slices. The slices that land in later
seasons are the future-cap mortgage. For each rostered player we multiply his prorated bonus by
the contract seasons left after this one, then add up the team.

This is where the money varies. As a share of one league cap, the mortgage has a within-season
standard deviation of 0.16, against 0.055 for cap consumed and 0.12 for cash paid.

It's an estimate. It assumes flat proration. It can't see void years, the dummy contract years
that push cap hits later, or restructures not yet signed. It counts 504 of 32,105 player-seasons
as zero for lack of a contract length.

## Cap+ (obligation) — candidate

Cap+ (obligation) — candidate adds 0.5 × the future-cap mortgage to cost, with the same floor
and calibration. Its correlation with Team Rating drops from 0.95 to 0.89, and teams move 3.6
places from their on-field rank on average, up from 2.2. In 2025, Buffalo falls from third to
16th, with 92% of a cap already charged to future seasons.

The 0.5 is a candidate, not a published claim, the way the $1.50 is a claim. So the index
carries the word "candidate" and always sits beside Cap+, never alone. It appears in three
places: the Review control on the league Field, the Review column on the leaderboard, and the
"What Cap+ can't see" card on each team page.

---

## Blank seasons and Team Rating

Cap+ covers **nine seasons: 2014, 2015, 2017, 2018, 2019, 2022, 2023, 2024 and 2025**. That's
288 of 416 team-seasons, or 69.2%.

**Four seasons are blank: 2013, 2016, 2020 and 2021.** Only 5, 8, 5 and 10 teams had a published
table, and a leaders list isn't a league table. We won't estimate the gap, so the whole season
goes blank. Each blank says why:

> Not available — no league-wide dead-money table was published for this season.

League-wide contract data doesn't exist before 2013, so neither does Cap+. For **1999 through
2012**, the Cap+ slot says:

> Not available — league-wide contract coverage begins in 2013.

Those years show **Team Rating (performance only)**, which is 100 + 15 × P for all 861
team-seasons. It has its own name and styling, and it's never "Cap+ without the money."
Franchise timelines break at 2013. From 2014 to 2025 we plot both lines, so you can see the gap
before the Cap+ line stops.

## Three kinds of money

**Cap hit** is what a player counted against his team's salary cap. These are settled,
end-of-year figures. Patrick Mahomes' 2023 cap hit is $37,133,824, the September rework, not the
$49.3 million he was first scheduled for. We have no "as of Week 8" cap view because the data
can't support one. The cap total we can see covers players on the roster only. It runs 15% to
22% below a team's true cap because dead money sits outside it, so we never call it "cap used."

**Cash spent** is what the team paid out in a year. Signing bonuses are paid up front but charged
to the cap over time, so cash and cap differ. Cash leaves out money paid to players released
during the year.

**Dead money** is cap you still pay for players who are gone. Dan Graziano of ESPN defines it:

> "A dead money charge is a charge on an NFL team's salary cap for a player who is no longer
> on the roster. It represents any remaining signing bonus proration that was not accounted
> for prior to the player's release or trade. It is not a cash payment..."

Nobody writes a check for it. It's roster room already spent.

## Cost per win and the receipt verdict

Cost per win divides spending by wins. The team page defaults to cash and says "cash per win."
The roster receipt and the share cards price a win in cap, because every receipt line is a cap
hit. Both name the currency beside the figure. The 2023 49ers paid $258,275,910 in cash over 12
wins, or $21.52M per win. A team with zero wins gets no ratio, only its spending and a "0 wins"
label.

The **receipt verdict** sorts every club in a season by cap per win and cuts the list at that
season's quintiles, or fifths. From cheapest to costliest, the labels are STEAL, WORTH IT, FAIR PRICE,
OVERPAID and MONEY PIT. Zero-win clubs are excluded. The cutoffs reset every season, so a verdict
means cheap or expensive for that year's league. It judges the price of wins, which Cap+
doesn't, so the two can disagree.

---

## Where the data comes from

**Results, play-by-play, draft picks, rosters and snap counts** come from
[nflverse](https://nflverse.nflverse.com/), an open NFL data project. Results and play-by-play
cover **1999 through 2025** with no gaps, 861 team-seasons. The data is a snapshot, not a live
feed. The 2026 season is excluded until it's complete.

**Contract and salary figures** come from Over The Cap data published through nflverse.
**Player-level contract detail begins in 2013.** Before that, the record samples notable
deals: 43 players per team against a 53-man roster in 2012, under 15% of a team's cap by 2004.
We don't use it for team totals.

**League salary-cap ceilings, 1994–2025**, and **dead money by team** are compiled by hand from
public reporting, with a source link on every row. Nothing is estimated.

**Draft pick value** uses the [Fitzgerald–Spielberger NFL Draft Trade Value
Chart](https://overthecap.com/draft-trade-value-chart), published at Over The Cap. Its units are
dollars of surplus value, like the rest of this site, which the 1990s Jimmy Johnson chart's
aren't. On a draft card, **capital counts every pick a team made, while realized return counts
only picks that carry a `gsis_id`, the player ID the join needs.** Excluded picks are counted
beside it.

**Coaching staffs for every team from 2000 to 2025** (head coach and both coordinators) are
compiled row by row with sources. Every head-coach row was checked against an independent
franchise record, and a 10% sample of coordinators against a second source.

**Games played and snap counts run 2013 to 2025.** The 2012 snap file has no rows, and the games
column stops at 2013, so a games total counts only that window and the page says so. Tom Brady's
card shows 158 games over 10 seasons because that's what the record holds.

**Player photographs** come from [Wikimedia Commons](https://commons.wikimedia.org/), used under
their own licenses with the photographer credited. The full list is at [/credits](/credits).
Where no free photograph exists, we show a designed card. **Team marks** are the clubs' own.

---

## What we won't do

We won't invent a player grade. Every number attached to a player is something he did or
something he was paid. Where we made a call (the dead-dollar weight, the floor, the equal
weights, the half-mortgage), we show the alternative. A missing season says so and says why, a
dated figure carries its date, and a chart starts where coverage does.

If a number here is wrong, tell us. We'll fix it, note what changed and when, and leave the
correction on the page.
