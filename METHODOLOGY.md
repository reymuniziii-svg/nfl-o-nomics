# Methodology

*This is the public methodology page — the draft that becomes `/methodology`.*

YIELD/YARD asks one question about every NFL team: **was it worth it?** This page explains how
we answer it, what our numbers can and cannot see, and where every figure comes from.

---

## What Cap+ is

**Cap+ measures how much on-field performance a team got for the money it actually spent, with
100 as the league average for that season.**

Think of it as field position. **100 is midfield.** Every 15 points of Cap+ is 15 yards. A team
at 130 is inside the opponent's 20 — red zone, elite. A team at 50 is on its own goal line,
about to give up a safety. A team at 100 got exactly league-average results for
league-average money.

Because Cap+ is centred on each season's league average, a 2015 team and a 2024 team can be
compared directly. Both are measured against the league they actually played in.

---

## How Cap+ is computed

**In words.** We build one performance score for each team from three things: how often it won,
how badly it beat or lost to its opponents, and how much better or worse its offence and defence
were than the opposition on a per-play basis. We compare each team to the rest of its own
season on all three, then average them equally. That gives us the numerator.

For the denominator, we add up what the team's cap actually carried that year: the money
committed to players on the roster, plus dead money — the cap charges left behind by players
who are no longer on the team. We count each dead dollar at one and a half times a live one.
Then we compare that total to what the average team spent that season. A team that spent
league-average money has a denominator of 1.00.

Divide the first number by the second, and you have Cap+.

**The math.**

```
Cap+ = (100 + 15 × P) ÷ R

P    = the performance score: an equal-weight blend of win percentage,
       point differential per game, and EPA margin per play, each measured
       against that season's league

R    = the team's cost ÷ the league-average cost that season,
       with a floor (see below)

cost = (cap charged to players on the roster + 1.5 × dead money) ÷ league cap
```

Regular season only. A tie counts as half a win. EPA is measured on running and passing plays.

### Why a dead dollar counts as one and a half

This is a claim about football economics, and we would rather state it plainly than bury it in
the arithmetic:

> **A dollar of dead cap costs a team half again what a live dollar does, because it buys no
> player and it blocks a roster spot.**

That is a judgement, not a measurement, and it changes the answer. So we publish the
alternative: **a comparison table showing every team's Cap+ if a dead dollar were counted as
exactly one dollar** sits alongside this page. The short version — at one-to-one, the teams
with the biggest dead-money charges drop about half a place and one point on average, which is
to say the dead money does almost nothing. At one-and-a-half, they drop about three places and
five and a half points. We chose the weight that makes the number mean what the page says it
means, and we are showing our work.

### The floor: you get no credit for money you never spent

A pure efficiency ratio has an obvious flaw — a team can improve its score by simply not
spending. Left alone, that arithmetic rewards a team for gutting its roster.

So we apply a floor. **No team's cost is counted as lower than the 25th percentile of that
season.** If you spent less than three-quarters of the league, you are treated as if you spent
at that line. It applies to all 32 teams, every season, in the same way. Eight teams a season
sit on the floor by construction.

This is what puts the 0-16 2017 Browns 32nd, where they belong. Without it, the same arithmetic
rated them mid-pack for the crime of not spending money.

### One date per season, printed beside every number

Dead money is not a season total that sits still. It accumulates through the league year as
players are released and traded, so the same team can read $57.6 million before the season and
$91.8 million once it is over. The figure depends entirely on when someone measured it.

So we do two things. **Every team in a season is read from the same dated table** — you are
never comparing one team's December to another team's July. And **the date is printed next to
the number**, every time, everywhere. If you see a dead-money figure on this site without a
date beside it, that is a bug and we want to hear about it.

For the same reason, **we never draw a line connecting dead-money figures across seasons.**
They are individual dated readings, not a trend, and connecting them would invent a story the
data cannot support.

**Two seasons carry a "provisional" badge: 2014 and 2019.** Those tables were published before
the league year opened, so they understate the final figures — the median team charge reads
$4.0 million and $3.4 million, against $50.3 million in 2024. That is a measurement-date
effect, not a league that got less disciplined.

---

## What Cap+ is not

**It is not a front-office grade.** Cap+ measures one season's resources against one season's
results. It does not measure whether a team is well run. We know this because we checked: the
cap adjustment — the part of Cap+ that is not just performance — **repeats from one season to
the next at only +0.158**. Dead money is genuinely a one-year event. A team can be terrible on
Cap+ one year and fine the next, and that is the metric working correctly, not failing.

We are publishing that number ourselves, up front, because it is the first thing a careful
reader would compute and we would rather they read it here.

**It cannot see mortgaged future cap.** Cap+ measures the cap a team consumed this year, not
the cap it borrowed against. A team that restructures every contract to win now looks
efficient today and pays for it in a season this metric will score separately. When you see an
all-in team rating well, that is the limit of the measurement, not an endorsement of the
strategy.

**It is not available for every season.** Cap+ covers **nine seasons: 2014, 2015, 2017, 2018,
2019, 2022, 2023, 2024 and 2025.** For **2013, 2016, 2020 and 2021**, no league-wide dead-money
table was published, and we will not fill four seasons with estimates. Those seasons say so.

For **1999 through 2012**, league-wide contract data does not exist, so Cap+ does not exist
either. Those seasons show **Team Rating (performance only)** — the same performance score,
with no money in it, clearly labelled and visibly styled differently. It is not Cap+ with a
qualifier; it is a different number with a different name. Where the two overlap, we plot both,
so you can see the gap between them before the Cap+ line stops.

The honest bridge: both are built from the identical performance score. Only the money
adjustment starts in 2013.

---

## The three money lenses

Every dollar figure on this site is one of three things, and we always say which.

**Cap hit** — what a player counted against his team's salary cap. These are settled,
end-of-year figures: a player's cap number is restated through the league year, and what we
show is where it landed. Patrick Mahomes' 2023 cap hit is $37,133,824, the September rework —
not the $49.3 million he was originally scheduled for. There is no "as of Week 8" cap view on
this site, because the underlying data does not support one.

**Cash spent** — what a team actually paid out in a given year. Signing bonuses are paid up
front and charged to the cap over time, so cash and cap tell genuinely different stories, and
cash is usually the better answer to "what did this cost." One thing it does not include: money
paid to players the team released during the year.

**Dead money** — the cap charges left behind by players who are gone. We use the standard
definition, from Dan Graziano at ESPN:

> "A dead money charge is a charge on an NFL team's salary cap for a player who is no longer
> on the roster. It represents any remaining signing bonus proration that was not accounted
> for prior to the player's release or trade. It is not a cash payment..."

That last sentence matters. Dead money is not a cheque anyone writes. It is roster-building
capacity that has already been spent and cannot be spent again.

One more thing worth knowing about cap figures: the cap number we can see is the money
committed to players **on the roster**. It runs consistently below a team's true cap, because
dead money sits outside it — which is exactly why we add dead money back in when computing
Cap+, and why we never label a roster-cap total "cap used."

---

## Where the data comes from

**Game results, play-by-play and EPA, draft picks, rosters and snap counts** come from
[nflverse](https://nflverse.nflverse.com/), an open NFL data project. Results and play-by-play
cover **1999 through 2025** with no gaps — 861 team-seasons.

**Contract and salary figures** are derived from Over The Cap data published through nflverse.
**Player-by-player contract detail begins in 2013.** Before that, the record is a sample of
notable deals rather than a roster — in 2012 it covers 43 players per team against a 53-man
roster, and by 2004 it covers under 15% of a team's cap. That is fine for asking about star
contracts and useless for asking what a team spent, so we do not use it for team totals and
we say so on every page where the boundary bites.

**League salary cap ceilings, 1994–2025**, and **dead money by team** are compiled by hand from
public reporting, with a **source link on every single row**. Nothing is estimated and nothing
is filled in. Dead money by team is available for **2014, 2015, 2017, 2018, 2019, 2022, 2023,
2024 and 2025** — nine seasons, all 32 teams, each from one dated table. **Four seasons — 2013,
2016, 2020 and 2021 — are honestly blank**, because only a handful of teams were ever
published and a leaders list is not a league table.

**Draft pick value** uses the [Fitzgerald–Spielberger NFL Draft Trade Value
Chart](https://overthecap.com/draft-trade-value-chart), published at Over The Cap. Every "capital"
figure on a draft card is the summed chart value of the picks a team made. We chose it over the
better-known Jimmy Johnson chart because its units are dollars of surplus value produced by a pick
relative to what its rookie contract costs — the same units as the rest of this site — where the
Johnson chart is a 1990s trade-negotiation heuristic that was never calibrated against what players
actually went on to do.

Two figures on that card are measured over different sets of picks, and the card says so: **capital
counts every pick a team made, while realised return counts only the picks that carry a `gsis_id` to
join on.** Where any pick is excluded, the count is printed beside the figures.

**Coaching staffs — head coach, offensive coordinator and defensive coordinator for every team
from 2000 to 2025** — are compiled the same way, row by row with sources. Every head-coach row
was cross-checked against an independent franchise record, and a random 10% sample of
coordinators was verified against a second independent source. Where sources genuinely
disagree, we keep the disagreement in the notes rather than picking a winner quietly.

**Availability — games played and snap counts — runs 2013 to 2025.** The 2012 snap file exists
upstream and contains no rows, and the games column in the same table does not reach back past 2013
either. So a player's "games" total on this site is his games *inside that window*, and the page
labels it that way. Tom Brady's card says 158 games over 10 seasons because that is what the record
holds, not because he played 158 games. We would rather tell you that than let a total imply
otherwise.

**Player photographs** come from [Wikimedia Commons](https://commons.wikimedia.org/), used
under their own licences with the photographer credited. Every photograph on this site is
credited, and the full list is at [/credits](/credits). Where no freely licensed photograph of
a player exists, we show a designed card rather than a stock image or a guess.

**Team marks** are the clubs' own, used to identify the teams they belong to.

---

## What we will never do

**We will never invent a player grade.** No letter grades, no star ratings, no proprietary
"player value score," no verdict on whether a contract was good. Every number attached to a
player on this site is something he did or something someone paid him.

**We will never publish a number we cannot defend.** Every figure traces to a source you can
open. Where we make a judgement call — the weight on a dead dollar, the spending floor, the
equal weighting of the performance inputs — we tell you it is a judgement call and we show you
what the alternative looks like.

**We will never show partial data silently.** If a metric does not exist for a season, that
season says so and says why. If a figure was measured on a particular date, the date is next to
it. If coverage starts in 2013, the chart starts in 2013. You will never look at an unbroken
line here and be wrong about what it means.

---

## Corrections

If a number here is wrong, tell us and we will fix it, note what changed, and say when — the
correction stays on the page.


## What Cap+ is, and is not (added 2026-10-10)

Across the 288 team-seasons it covers, Cap+ correlates **0.95** with Team Rating, the
performance-only score. That is not an accident of the formula; it is the salary cap. Every
team spends close to the cap, so "performance per dollar" is mostly performance. Cap+ moves a
team about two places from its on-field rank. Read it as **what this season's wins cost**, not
as a grade of the front office.

Two things people assume about it are measured and published beside it:

- **Rookie-contract quarterbacks.** Swapping each team's starter for a league-median-priced
  starter moves Cap+ by about three points on average for teams with a QB on a rookie deal.
  Those teams average *below* 100, because they are usually still bad. We show the QB-neutral
  number and the rookie-window flag so you can check.
- **Money borrowed from future seasons.** Signing-bonus money already charged to future caps
  varies three times as much between teams as cap spending does, and Cap+ cannot see it. We
  publish it as "future-cap mortgage" and, as a candidate under review, a version of Cap+ that
  charges half of it to this season. It is an estimate: flat proration, no void years.
