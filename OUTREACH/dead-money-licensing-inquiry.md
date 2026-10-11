# Dead-money licensing inquiry (drafts for Rey to send)

Status 2026-10-11: YIELD/YARD is public at https://nfl-o-nomics.vercel.app with per-team
dead-money tables for 13 seasons. Ten of those seasons reproduce a full 32-team figure set
that traces to one compiler: OverTheCap (2018, 2019, 2023, 2024, 2025, plus six 2020 readings)
or Spotrac (2013, 2017, 2022). RISKS.md risk 1 and `audit/findings_deadmoney_sourcing.md`
Appendix A call for sign-off before shipping those. Two paths, not exclusive:

1. **Ask the compilers directly** (drafts below). A yes removes the risk; a no tells us to
   flip `DEAD_MONEY_TIER=safe`, which keeps Cap+ on 2014–2016 and 2021 only.
2. **Counsel review** of the selection-and-arrangement question. Facts are not copyrightable;
   a full 32-row table is close to a whole compilation. Thirty minutes with an IP lawyer.

Both go out under reymuniziii@gmail.com (personal project), not the BerlinRosen address.

---

## Email 1 — OverTheCap (Jason Fitzgerald), via the site contact form or jason@overthecap.com

**Subject:** Attribution and permission for team dead-money figures on YIELD/YARD

Jason,

I'm Rey Muniz. I built YIELD/YARD (nfl-o-nomics.vercel.app), a free, non-commercial site that
asks one question about every NFL team-season since 1999: what did the wins cost. It's a
side project, no ads, no paywall, source open on GitHub.

Dead money is the one input nobody publishes as league data, and the best per-team tables
for 2018, 2019 and 2023–2025 are yours, reproduced in press pieces that credit Over The Cap.
I use those figures, one dated snapshot per season, with the date and a link to the source
on every number, and a methodology page that names you as the compiler.

I'd like to do this with your permission rather than around it. Specifically:

- May I keep citing those seasons' per-team dead-money figures, attributed to Over The Cap
  with a link on every figure?
- Would you prefer a different attribution line, a link to a specific OTC page, or that I
  stop at a subset (for example, the top ten per season) rather than all 32?
- If you'd rather I not use them at all, say so and I'll pull them within a week. The site
  is built so that happens with one switch.

Happy to show you the pages or walk through the method. Thanks for the work; the site
wouldn't exist without it.

Rey Muniz
reymuniziii@gmail.com

---

## Email 2 — Spotrac (contact@spotrac.com or the site form)

**Subject:** Attribution and permission for team dead-money figures on YIELD/YARD

Hello,

I'm Rey Muniz. I built YIELD/YARD (nfl-o-nomics.vercel.app), a free, non-commercial site on
NFL cap economics: what each team's wins cost, season by season since 1999. No ads, no
paywall, code open on GitHub.

Three of my seasons' per-team dead-money tables (2013, 2017, 2022) come from press pieces
that credit Spotrac as the compiler. Every figure carries its as-of date and a link to the
source, and the methodology page names Spotrac.

I'd like your permission to keep doing that, and I'll follow whatever attribution you
prefer: a specific line, a link to a Spotrac page, or a cap on how many teams per season I
reproduce. If you'd rather the figures come down, tell me and they're gone within a week.

Thanks,
Rey Muniz
reymuniziii@gmail.com

---

## If either says no

Run `DEAD_MONEY_TIER=safe` and redeploy. Cap+ then renders for 2014, 2015, 2016 and 2021 only
(2016 and 2021 are estimated from SAFE anchors); every other season shows the approved blank
sentence. The site still works; the all-time lists get thin. Decide then whether to pursue a
paid license or rebuild the dead-money layer from a licensed feed.
