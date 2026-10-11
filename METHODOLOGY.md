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

The EPA margin is adjusted for opponents. Gaining 0.1 EPA a play against the league's best
defenses is worth more than doing it against the worst, so we fit every game's offense and
defense at once and credit each team for who it played. Each season's average doesn't move. Most
teams shift a little; the biggest single move is under a tenth of an EPA point per play.

Cost is the cap charged to rostered players plus dead money, the cap you still pay for players
who are gone. A dead dollar counts once, like any other cap dollar. We divide by the league cap,
compare with the season's average, and apply a floor.

```
Cap+ = (100 + 15 × P) ÷ R

P    = equal-weight blend of win percentage, point differential per game
       and opponent-adjusted EPA margin per play, each within its season

R    = team cost ÷ league-average cost, floored at the season's 25th percentile

cost = (cap charged to rostered players + dead money) ÷ league cap
```

Each season's mean is exactly 100. The ten seasons with a measured dead-money table set the
spread: one pooled standard deviation across them is 15 points. The three estimated seasons
use that same 15, so a point means the same thing in every year.

### Why a dead dollar counts once

We used to count each dead dollar as $1.50, on the theory that it buys no player and blocks a
roster spot. That charges it twice. The dollar is in the cost once already, and the weaker
roster it left behind is already in the team's performance. So it counts once.

Here's what the other weights would do. The middle column is the average move for each season's
three biggest dead-money teams, against their on-field rank.

| Weight on a dead dollar | Top-3 dead-money teams | 2022 ATL |
|---|---|---|
| **$1.00 (ours)** | **down 0.56 places, 0.9 points** | **96.2 (20th)** |
| $1.50 | down 3.69 places, 5.3 points | 89.3 (27th) |
| $2.00 | down 5.51 places, 9.0 points | 82.5 (29th) |

Atlanta was 24th on the field in 2022 and lands 20th. The $1.50 weight was picked partly so that
Atlanta would rate poorly, and that's the wrong way to choose a number. Denver carried $85.2M
as of 2024-11-27, against a $50.3M league median, and still rates 10th, because its cap
consumption was the 2024 median. At $2.00 it would drop to 20th.

### The floor

A pure ratio rewards a team for not spending. So no team's cost counts as lower than the 25th
percentile of its season. That puts eight teams a season on the floor by construction. The
league average is taken after the floor, so R = 1.00 still means league-average cost. The floor
is why the 0-16 Browns of 2017 rate 32nd. Without it, they'd rate 24th for not spending.

With dead money counted once, cost is just cap consumed: rostered cap plus dead money as a share
of the league cap. 12.5% of team-seasons come in above 1.00, because a team's adjusted cap can
sit above the league figure.

### One date per season

Dead money piles up through the league year as players are cut and traded. Chicago's 2022 figure
reads $57.6 million in the preseason and $91.8 million once the year is over. So every team in a
season is read from one dated table (2013-03-18 for 2013, 2025-12-17 for 2025), and the date is
printed next to every dead-money figure. We never connect those figures across seasons with a
line. They're dated readings, not a trend.

Three tables came out early, so they understate the final figures, and those seasons carry a
"provisional" badge. The 2014 and 2019 tables were published before the league year opened. The
2013 table came out one week into it. Their median team charge reads $5.9 million (2013),
$4.0 million (2014) and $3.4 million (2019), against $50.3 million in 2024.

---

## What Cap+ is not

**It isn't a front-office grade.** Across the 416 team-seasons it covers, Cap+ correlates **0.96**
with Team Rating, the same performance score with no money in it. The reason is the salary cap.
Every team spends close to it, so cost varies by about 0.04 within a season and performance by
about 0.15. Cap+ is Team Rating with a small cost adjustment. It moves a team 1.9 places from its
on-field rank, on average. Read it as what this season's wins cost.

**It doesn't repeat.** The cost adjustment, Cap+ minus performance, carries from one season to
the next at only +0.07. Dead money is a one-year event.

**It can't see borrowed cap.** Cap+ counts the cap a team used this year, not the cap it
borrowed against. The next sections measure that gap.

## The rookie-QB finding

The theory says a team with a quarterback on his first contract has a built-in edge. We tested it.
The starting QB is the one with the most offensive snaps. He's in his rookie window if the team
drafted him and he's still on his draft-year contract. The season must fall within four seasons
of the draft, which admits the fifth-year option. Of the 416 Cap+ team-seasons, 146 have a starter
in his rookie window. We call that a rookie-deal starter.

| | Teams | Avg Cap+ | Avg Team Rating | QB-timing points |
|---|---:|---:|---:|---:|
| Rookie-deal QB | 146 | 97.8 | 97.4 | +3.2 |
| Veteran-deal QB | 270 | 101.2 | 101.4 | −1.8 |

Teams with a rookie-deal starter average below 100 because they're usually still bad. Their cheap
quarterbacks add 3.2 points on average, about a fifth of one standard deviation. Give each a
league-median-priced starter and Cap+ falls by that much. The 2019 Chiefs score −1.4: their cost
was already under the floor, so a cheap quarterback bought them nothing Cap+ could see. Within
each season, Cap+ and QB share of the cap correlate positively, from +0.10 to +0.42.

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

A signing bonus is paid when the deal is signed, but it's charged to the cap in equal yearly
slices. The slices that land in later seasons are the future-cap mortgage. For each rostered
player we multiply his prorated bonus by the contract seasons left after this one, then add up
the team.

This is where the money varies. As a share of one league cap, the mortgage has a within-season
standard deviation of 0.16, against 0.05 for cap consumed and 0.12 for cash paid.

It's an estimate. It assumes flat proration. It can't see void years, the dummy contract years
that push cap hits later, or restructures not yet signed. It counts 550 of 32,265 player-seasons
as zero for lack of a contract length.

## Cap or cash: the mortgage is the bridge

Cap and cash keep different books. Cap spreads a bonus over the contract. Cash counts it the day
it's paid. The mortgage is the difference between them: money a team has already paid out that
the cap hasn't charged yet.

So we don't fold it into Cap+. Adding a cash item to a cap number mixes two sets of books. We
price a win both ways instead, cap per win and cash per win, and put the mortgage beside them so
you can see why the two differ. A team whose cash runs well ahead of its cap has usually paid
bonuses the cap will charge later, and its mortgage shows it.

---

## Thirteen seasons, three of them estimated, and Team Rating

Cap+ covers **every season from 2013 to 2025**, all 416 team-seasons.

**Ten seasons are measured:** 2013, 2014, 2015, 2017, 2018, 2019, 2022, 2023, 2024 and 2025. Each
has a published dead-money table for all 32 teams.

**Three are estimated: 2016, 2020 and 2021.** Nobody published a full table for them. We have
real figures for 8, 11 and 10 teams, from published lists. For everyone else we estimate dead
money from the contract record: how much unexplained room sat under each team's adjusted cap,
how much cap its roster used, which players with bonus money still owed had just left, and the
team's dead money the year before or after. The published lists pin the season's level. Every
estimate carries an 80% range, and we never show an estimated dollar figure without it. We
tested the method by hiding each measured season and estimating it: the typical team's Cap+ rank
moved one place. These seasons carry an "estimated" badge that says how many teams are real.
For 2016 it reads:

> Estimated — 8 of 32 teams are published figures; the rest are modeled from contract data.

If the licensing of the review-tier tables ever forces us to drop them, the estimate goes too,
because it learns from those tables. Seasons without a table would then go blank, and say why:

> Not available — no league-wide dead-money table was published for this season.

League-wide contract data doesn't exist before 2013, so neither does Cap+. For **1999 through
2012**, the Cap+ slot says:

> Not available — league-wide contract coverage begins in 2013.

Those years show **Team Rating (performance only)**, which is 100 + 15 × P for all 861
team-seasons. It has its own name and styling, and it's never "Cap+ without the money."
Franchise timelines break at 2013. From 2013 to 2025 we plot both lines, so you can see the gap
between them.

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
public reporting, with a source link on every row. The one exception is the modeled dead money
in 2016, 2020 and 2021, which is labeled as an estimate, carries its range, and has no source
link because it isn't a reading.

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
weights, the estimated seasons), we show the alternative. A missing season says so and says why, a
dated figure carries its date, and a chart starts where coverage does.

If a number here is wrong, tell us. We'll fix it, note what changed and when, and leave the
correction on the page.
