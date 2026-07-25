#!/usr/bin/env python3.11
"""Audit Wikimedia Commons player-photo availability for the PlayerMark component.

WHY THIS EXISTS
---------------
PlayerMark renders a treated player photo sourced EXCLUSIVELY from Wikimedia
Commons (free-culture licenses only, safe for commercial use) and falls back to
a designed card (initials / number / team colors) when no usable photo exists.
Before build we need two numbers and one schema:

  * the expected fallback rate  = 1 - usable-image rate
  * the license mix we will owe attribution for
  * the per-asset license-metadata fields the product data model must carry

POPULATION
----------
Top 250 players by single-season cap_number over 2021-2025 (deduped to unique
players, each kept at his max-cap season/team), plus a fixed marquee dead-money
roster that must be present regardless of cap rank.

Cap data comes from the SAME source and the SAME dedup discipline as
audit_contracts.py -- the nested `cols` column is a player-level career cap
table replicated onto every contract row, so player-seasons MUST be deduped on
(otc_id, year) and the 'Total'/junk year rows dropped before ranking. We import
those helpers rather than reimplementing them.

IDENTITY VERIFICATION (the hard part)
-------------------------------------
Name collisions are the known failure mode: Commons full-text search for
"Josh Allen" happily returns the Jaguars linebacker for the Bills quarterback,
and "Mike Williams" returns any of four NFL players plus a bassist. A Commons
search hit is therefore NEVER trusted on its own. Every accepted image must
clear one of these, in descending strength:

  wikidata_p18_team      P18 image on a Wikidata entity that is an American
                         football player (P106/P641) AND whose P54 teams
                         include the team we expect from the cap data
  wikidata_p18_sport     same, but P54 did not confirm the team
  wikipedia_lead_image   no P18; the verified en.wikipedia article's own free
                         lead image (pageprops.page_image_free)
  commons_usage_on_page  Commons search hit whose globalusage includes the
                         verified en.wikipedia article
  commons_category       Commons search hit whose categories/description name
                         the player AND (NFL | American football | his team)

Anything that clears none of these is recorded as NO USABLE IMAGE, even when a
plausible-looking file exists. Collisions are logged, not silently dropped.

LICENSE FILTER
--------------
usable = free-culture only: CC BY, CC BY-SA, CC0/public domain, and the
PD-USGov / attribution-style tags. Anything carrying NC, ND, fair-use or
"non-free" is rejected even though it verified as the right person.

Outputs (overwritten in full on every run -- the script is idempotent):
  data/curated/staging/player_images_sample.csv
  audit/findings_image_audit.md  is written by hand from this script's summary

Usage:
  python3.11 audit/audit_images.py [--top 250] [--start 2021] [--end 2025]
                                   [--cache PATH] [--limit N]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from html import unescape
from pathlib import Path

import pandas as pd
import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
from audit_contracts import (  # noqa: E402
    build_player_seasons,
    duck_connect,
    load_contracts,
    player_seasons_df,
    position_by_player_season,
)

ROOT = Path(__file__).resolve().parent.parent
STAGING = ROOT / "data" / "curated" / "staging"

TOP_N = 250
WINDOW = (2021, 2025)

# Marquee dead-money names the product's cap-hell stories depend on. These are
# force-included even when their max 2021-2025 cap number falls outside the
# top-250 cut (several were released and carry dead money, not cap numbers).
MARQUEE = [
    "Russell Wilson", "Tua Tagovailoa", "Matt Ryan", "Carson Wentz",
    "Aaron Rodgers", "Tom Brady", "Kirk Cousins", "Deshaun Watson",
    "Trey Lance", "Jimmy Garoppolo", "Baker Mayfield", "Derek Carr",
]

# ------------------------------------------------------------------ Wikimedia

UA = ("NFL-o-nomics-image-audit/1.0 "
      "(https://github.com/nfl-o-nomics; reymuniziii@gmail.com) "
      "python-requests")

WP = "https://en.wikipedia.org/w/api.php"
WD = "https://www.wikidata.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"

# Wikidata identity anchors.
Q_HUMAN = "Q5"
Q_AF_PLAYER = "Q19204627"        # American football player (occupation, P106)
Q_AF_SPORT = "Q41323"            # American football (sport, P641)
Q_AF_COACH = "Q41583"            # American football coach -- de-prioritized

# team code -> strings that must appear in a Wikidata P54 team label.
TEAM_LABELS = {
    "ARI": "Arizona Cardinals", "ATL": "Atlanta Falcons",
    "BAL": "Baltimore Ravens", "BUF": "Buffalo Bills",
    "CAR": "Carolina Panthers", "CHI": "Chicago Bears",
    "CIN": "Cincinnati Bengals", "CLE": "Cleveland Browns",
    "DAL": "Dallas Cowboys", "DEN": "Denver Broncos",
    "DET": "Detroit Lions", "GB": "Green Bay Packers",
    "HOU": "Houston Texans", "IND": "Indianapolis Colts",
    "JAX": "Jacksonville Jaguars", "KC": "Kansas City Chiefs",
    "LA": "Los Angeles Rams", "LAC": "Los Angeles Chargers",
    "LV": "Las Vegas Raiders", "MIA": "Miami Dolphins",
    "MIN": "Minnesota Vikings", "NE": "New England Patriots",
    "NO": "New Orleans Saints", "NYG": "New York Giants",
    "NYJ": "New York Jets", "PHI": "Philadelphia Eagles",
    "PIT": "Pittsburgh Steelers", "SEA": "Seattle Seahawks",
    "SF": "San Francisco 49ers", "TB": "Tampa Bay Buccaneers",
    "TEN": "Tennessee Titans", "WAS": "Washington Commanders",
}
# Relocation / rename aliases -- a P54 label may be the era-correct name.
TEAM_ALIASES = {
    "LV": ["Oakland Raiders"],
    "LAC": ["San Diego Chargers"],
    "LA": ["St. Louis Rams"],
    "WAS": ["Washington Redskins", "Washington Football Team"],
    "TEN": ["Houston Oilers"],
}

# ---------------------------------------------------------------- license law

# Rejected outright: NonCommercial, NoDerivatives, fair use, any non-free tag.
NONFREE_MARKERS = (
    "-nc", "nc-", "noncommercial", "non-commercial",
    "-nd", "nd-", "noderiv", "no derivative",
    "fair use", "fairuse", "non-free", "nonfree", "copyright",
)
# Accepted free-culture families (machine tag prefix or short-name substring).
FREE_MARKERS = (
    "cc-by", "cc by", "cc-zero", "cc0", "cc 0",
    "pd", "public domain", "publicdomain",
    "attribution", "fal", "free art", "gfdl",
    "copyrighted free use", "no restrictions",
)


def classify_license(machine: str, short: str, usage: str) -> tuple[bool, str]:
    """Return (is_free_culture, reason). Machine tag wins; short name backs it up."""
    blob = " ".join(x.lower() for x in (machine, short, usage) if x)
    if not blob.strip():
        return False, "no license metadata on file page"
    for bad in NONFREE_MARKERS:
        # 'copyright' alone would false-positive on "Copyrighted free use".
        if bad == "copyright" and "copyrighted free use" in blob:
            continue
        if bad in blob:
            return False, f"non-free marker '{bad.strip('-')}'"
    for good in FREE_MARKERS:
        if good in blob:
            return True, "free-culture"
    return False, "unrecognized license tag"


def strip_html(s: str | None) -> str:
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", unescape(s)).strip()


# ------------------------------------------------------------------- client


class Wiki:
    """Polite MediaWiki client: maxlag, spacing, exponential backoff on 429/503."""

    def __init__(self, cache_path: Path | None = None, spacing: float = 0.06):
        self.s = requests.Session()
        self.s.headers.update({"User-Agent": UA, "Accept-Encoding": "gzip"})
        self.spacing = spacing
        self.calls = 0
        self.retries = 0
        self._last = 0.0
        self.cache_path = cache_path
        self.cache: dict[str, dict] = {}
        if cache_path and cache_path.exists():
            self.cache = json.loads(cache_path.read_text())

    def save(self):
        if self.cache_path:
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            self.cache_path.write_text(json.dumps(self.cache))

    def get(self, host: str, params: dict, attempts: int = 5) -> dict:
        params = dict(params, format="json", formatversion="2", maxlag="5")
        key = host + "?" + "&".join(f"{k}={params[k]}" for k in sorted(params))
        if key in self.cache:
            return self.cache[key]
        delay = 1.0
        for i in range(attempts):
            gap = self.spacing - (time.time() - self._last)
            if gap > 0:
                time.sleep(gap)
            try:
                r = self.s.get(host, params=params, timeout=60)
                self._last = time.time()
                self.calls += 1
                if r.status_code in (429, 503):
                    raise RuntimeError(f"HTTP {r.status_code}")
                r.raise_for_status()
                data = r.json()
                # maxlag rejection comes back 200-with-error on some configs.
                if isinstance(data, dict) and data.get("error", {}).get("code") == "maxlag":
                    raise RuntimeError("maxlag")
                self.cache[key] = data
                return data
            except Exception as exc:  # noqa: BLE001
                self.retries += 1
                if i == attempts - 1:
                    print(f"    [give up] {host} {exc}", file=sys.stderr)
                    return {}
                time.sleep(delay)
                delay *= 2
        return {}


# --------------------------------------------------------------- population


def build_population(top_n: int, start: int, end: int) -> pd.DataFrame:
    """Top-N players by max single-season cap number in the window, + marquee."""
    con = duck_connect()
    load_contracts(con, download=False)
    build_player_seasons(con)          # dedup on (otc_id, year); drops 'Total'
    df = player_seasons_df(con)
    pos = position_by_player_season(con)

    # Career span from the FULL history -- used for the era cohort split.
    career = (df.groupby("otc_id", as_index=False)
                .agg(career_first_season=("season", "min"),
                     career_last_season=("season", "max")))

    win = df[df["season"].between(start, end) & df["cap_number_usd"].notna()].copy()
    win = win.merge(pos, on=["otc_id", "season"], how="left")

    # One row per player: his max-cap season inside the window (ties -> later season).
    win = win.sort_values(["otc_id", "cap_number_usd", "season"],
                          ascending=[True, False, False])
    best = win.drop_duplicates("otc_id", keep="first").copy()
    best = best.rename(columns={"season": "max_cap_season",
                                "cap_number_usd": "max_cap_usd"})
    best = best[["otc_id", "player", "max_cap_season", "team", "position",
                 "max_cap_usd"]]
    best = best.merge(career, on="otc_id", how="left")
    best = best.sort_values("max_cap_usd", ascending=False).reset_index(drop=True)

    top = best.head(top_n).copy()
    top["selection"] = "top_cap"

    have = set(top["player"])
    extra = best[best["player"].isin([m for m in MARQUEE if m not in have])].copy()
    # Guard against OTC name duplicates (two players sharing a name in-source).
    extra = extra.sort_values("max_cap_usd", ascending=False)
    extra = extra.drop_duplicates("player", keep="first")
    extra["selection"] = "marquee"

    pop = pd.concat([top, extra], ignore_index=True)
    missing = [m for m in MARQUEE if m not in set(pop["player"])]
    if missing:
        print(f"  [warn] marquee names absent from 2021-2025 cap rows: {missing}")
    pop["cap_rank"] = pop["max_cap_usd"].rank(ascending=False, method="min").astype(int)
    return pop.reset_index(drop=True)


# ---------------------------------------------------- identity + image lookup


def wd_entities(w: Wiki, ids: list[str], props: str = "claims|labels") -> dict:
    """Batched wbgetentities (Wikidata caps at 50 ids per request)."""
    out = {}
    for i in range(0, len(ids), 50):
        chunk = ids[i:i + 50]
        r = w.get(WD, {"action": "wbgetentities", "ids": "|".join(chunk),
                       "props": props, "languages": "en"})
        out.update(r.get("entities", {}))
    return out


def claim_ids(entity: dict, prop: str) -> list[str]:
    vals = []
    for c in entity.get("claims", {}).get(prop, []):
        v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(v, dict) and "id" in v:
            vals.append(v["id"])
    return vals


def claim_strings(entity: dict, prop: str) -> list[str]:
    vals = []
    for c in entity.get("claims", {}).get(prop, []):
        v = c.get("mainsnak", {}).get("datavalue", {}).get("value")
        if isinstance(v, str):
            vals.append(v)
    return vals


SUFFIXES = {"jr", "sr", "ii", "iii", "iv", "v"}

# Diminutives that are NOT a prefix of the formal name, so the prefix rule
# below cannot catch them. OTC uses the everyday name, Wikipedia the legal one.
DIMINUTIVES = {
    "bill": "william", "billy": "william", "will": "william",
    "bob": "robert", "bobby": "robert", "rob": "robert",
    "dick": "richard", "rick": "richard", "ricky": "richard",
    "jim": "james", "jimmy": "james", "jack": "john", "johnny": "john",
    "chuck": "charles", "charlie": "charles", "hank": "henry",
    "tony": "anthony", "ted": "theodore", "teddy": "theodore",
    "harry": "harold", "gus": "augustus", "bud": "buddy",
    "mike": "michael", "nick": "nicholas", "tom": "thomas",
    "dave": "david", "steve": "stephen", "joe": "joseph",
    "pat": "patrick", "greg": "gregory", "ken": "kenneth",
}


def norm_name(s: str) -> tuple[str, ...]:
    """Fold a name to comparable tokens: no diacritics, punctuation or suffixes."""
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"\([^)]*\)", " ", s)          # drop '(American football)' etc.
    s = re.sub(r"[^a-z\s-]", " ", s)
    toks = [t for t in s.split() if t and t not in SUFFIXES]
    return tuple(toks)


def tight_name(s: str) -> str:
    """Letters only, suffixes dropped. Collapses initial styling differences:
    'D.K. Metcalf' / 'DK Metcalf' / 'D. K. Metcalf' all fold to 'dkmetcalf'."""
    return "".join(norm_name(s)).replace("-", "")


def name_exact(a: str, b: str) -> bool:
    return norm_name(a) == norm_name(b) or (
        bool(tight_name(a)) and tight_name(a) == tight_name(b))


def _first_name_compatible(x: str, y: str) -> bool:
    if x == y:
        return True
    if DIMINUTIVES.get(x) == y or DIMINUTIVES.get(y) == x:
        return True
    # Matt/Matthew, Alex/Alexander, Zach/Zachary, Cam/Cameron, ...
    lo, hi = sorted((x, y), key=len)
    return len(lo) >= 3 and hi.startswith(lo)


def name_related(a: str, b: str) -> bool:
    """Compatible given name and an overlapping surname token.

    Covers the two things OTC does not track: legal-name changes (OTC's
    'Josh Allen' on JAX is Wikipedia's 'Josh Hines-Allen') and formal-vs-
    everyday first names ('Matt Stafford' vs 'Matthew Stafford'). A
    related-but-not-exact match is only ever accepted when the team check
    independently confirms it.
    """
    ta, tb = norm_name(a), norm_name(b)
    if not ta or not tb or not _first_name_compatible(ta[0], tb[0]):
        return False
    sa = set(re.split(r"-", " ".join(ta[1:])) + list(ta[1:]))
    sb = set(re.split(r"-", " ".join(tb[1:])) + list(tb[1:]))
    return bool({x for x in sa if x} & {x for x in sb if x})


class Resolver:
    """Name -> verified Wikidata entity + en.wikipedia article.

    A candidate is accepted only if it is a human American-football player AND
    its name matches the cap-data name -- exactly, or loosely with an
    independent team confirmation. Everything else is skipped, and the
    same-name-different-person cases are logged.
    """

    def __init__(self, w: Wiki):
        self.w = w
        self.team_label_cache: dict[str, str] = {}
        self.collisions: list[dict] = []

    # -- candidate generation -------------------------------------------------

    @staticmethod
    def title_variants(name: str) -> list[str]:
        """Spelling variants of the cap-data name that Wikipedia may title under.

        OTC writes "D.J. Jones"; Wikipedia titles it "D. J. Jones", and neither
        the bare title nor the football-weighted search finds the other. Also
        normalizes OTC's "Michael Pittman, Jr." comma style.
        """
        out = [name]
        base = name.replace(",", "")
        if base != name:
            out.append(base)
        m = re.match(r"^((?:[A-Za-z]\.\s*){2,})(.+)$", base)
        if m:
            letters = re.findall(r"([A-Za-z])\.", m.group(1))
            rest = m.group(2).strip()
            out.append(" ".join(f"{c}." for c in letters) + " " + rest)  # D. J. X
            out.append("".join(letters) + " " + rest)                    # DJ X
            out.append("".join(f"{c}." for c in letters) + " " + rest)   # D.J. X
        seen, uniq = set(), []
        for t in out:
            if t not in seen:
                seen.add(t)
                uniq.append(t)
        return uniq

    def candidates(self, name: str) -> list[tuple[str, str]]:
        """[(article_title, source)] worth checking, best-guess first."""
        cands: list[tuple[str, str]] = []
        seen = set()

        def add(t, src):
            if t and t not in seen:
                seen.add(t)
                cands.append((t, src))

        variants = self.title_variants(name)
        for v in variants:
            add(v, "direct_title")
        add(f"{name} (American football)", "disambig_title")
        add(f"{name} (quarterback)", "disambig_title")
        for v in variants[1:]:
            add(f"{v} (American football)", "disambig_title")

        # full-text search, football-weighted
        r = self.w.get(WP, {"action": "query", "list": "search",
                            "srsearch": f'{name} American football NFL',
                            "srnamespace": "0", "srlimit": "8"})
        for hit in r.get("query", {}).get("search", []):
            add(hit.get("title"), "search")

        # A disambiguation page IS the namesake list. "D.J. Jones" lands on one
        # and neither the bare title nor search ever reaches the real article
        # ("D. J. Jones (defensive lineman)"), so follow its links.
        r = self.w.get(WP, {"action": "query", "titles": "|".join(variants),
                            "prop": "pageprops|links", "redirects": "1",
                            "pllimit": "100", "plnamespace": "0"})
        for p in r.get("query", {}).get("pages", []):
            if "disambiguation" not in p.get("pageprops", {}):
                continue
            for link in p.get("links", []):
                if name_related(name, link["title"]) or name_exact(name, link["title"]):
                    add(link["title"], "disambiguation_link")
        return cands[:20]

    # -- team confirmation ----------------------------------------------------

    def team_categories(self, team: str) -> list[str]:
        if not team or team not in TEAM_LABELS:
            return []
        return [f"Category:{n} players"
                for n in [TEAM_LABELS[team]] + TEAM_ALIASES.get(team, [])]

    def team_labels(self, qids: list[str]) -> list[str]:
        need = [q for q in qids if q not in self.team_label_cache]
        if need:
            ents = wd_entities(self.w, need, props="labels")
            for q in need:
                self.team_label_cache[q] = (ents.get(q, {}).get("labels", {})
                                            .get("en", {}).get("value", ""))
        return [self.team_label_cache.get(q, "") for q in qids]

    def team_ok_wikidata(self, entity: dict, team: str) -> bool:
        """P54 'member of sports team'. Patchy -- Wikidata lags roster moves."""
        if not team or team not in TEAM_LABELS:
            return False
        want = [TEAM_LABELS[team]] + TEAM_ALIASES.get(team, [])
        labels = self.team_labels(claim_ids(entity, "P54"))
        return any(any(w.lower() in lab.lower() for w in want)
                   for lab in labels if lab)

    # -- resolution -----------------------------------------------------------

    def resolve(self, name: str, team: str) -> dict:
        cands = self.candidates(name)
        if not cands:
            return {}
        titles = [t for t, _ in cands]

        r = self.w.get(WP, {"action": "query", "titles": "|".join(titles),
                            "prop": "pageprops", "redirects": "1"})
        pages, alias = {}, {}
        for p in r.get("query", {}).get("pages", []):
            if "missing" not in p:
                pages[p["title"]] = p
        for group in ("redirects", "normalized"):
            for m in r.get("query", {}).get(group, []) or []:
                alias[m.get("from")] = m.get("to")

        def lookup(t):
            seen = set()
            while t in alias and t not in seen:
                seen.add(t)
                t = alias[t]
            return pages.get(t)

        # Which candidates carry the expected team's category?
        teamcats = self.team_categories(team)
        cat_hit: set[str] = set()
        if teamcats:
            rc = self.w.get(WP, {"action": "query", "titles": "|".join(titles),
                                 "prop": "categories", "redirects": "1",
                                 "clcategories": "|".join(teamcats),
                                 "cllimit": "500"})
            for p in rc.get("query", {}).get("pages", []):
                if p.get("categories"):
                    cat_hit.add(p["title"])

        qids, order = [], []
        for t, src in cands:
            p = lookup(t)
            if not p:
                continue
            pp = p.get("pageprops", {})
            if "disambiguation" in pp:
                continue
            q = pp.get("wikibase_item")
            if q and q not in qids:
                qids.append(q)
                order.append((p["title"], q, src, pp))
        if not qids:
            return {}
        ents = wd_entities(self.w, qids)

        exact_af, loose_af, wrong_person = [], [], []
        for title, qid, src, pp in order:
            e = ents.get(qid, {})
            if not e:
                continue
            is_human = Q_HUMAN in claim_ids(e, "P31")
            occ, sport = claim_ids(e, "P106"), claim_ids(e, "P641")
            label = e.get("labels", {}).get("en", {}).get("value", title)
            confirmed = (title in cat_hit) or self.team_ok_wikidata(e, team)
            # Carrying "<Team> players" on en.wikipedia is itself proof of being
            # an NFL player -- some articles have no P106/P641 at all.
            is_af = (Q_AF_PLAYER in occ) or (Q_AF_SPORT in sport) or (title in cat_hit)
            rec = {"title": title, "qid": qid, "entity": e, "pageprops": pp,
                   "team_confirmed": confirmed, "source": src, "label": label,
                   "is_coach": (Q_AF_COACH in occ) or ("coach" in title.lower())}

            if not is_human:
                continue
            if not is_af:
                # Same name, different human -- the collision we must not accept.
                if name_exact(name, label) or name_exact(name, title):
                    wrong_person.append({**rec, "occupations": ",".join(occ[:4])})
                continue
            if name_exact(name, label) or name_exact(name, title):
                exact_af.append(rec)
            elif name_related(name, label) or name_related(name, title):
                loose_af.append(rec)

        # ---- selection ----------------------------------------------------
        # Team confirmation ALWAYS outranks a bare name match: OTC's "Josh
        # Allen" on JAX is Wikipedia's "Josh Hines-Allen", and an exact-name
        # rule alone would hand him the Bills quarterback's photo.
        exact_ok = [c for c in exact_af if c["team_confirmed"]]
        loose_ok = [c for c in loose_af if c["team_confirmed"]]
        # Last resort when nothing is team-confirmed: the sole namesake who is
        # a player and not a coach. Wikipedia lags roster moves -- Robert Hunt's
        # article still carries only "Miami Dolphins players" after his 2024
        # move to Carolina.
        players_only = [c for c in exact_af if not c["is_coach"]]

        chosen, route = None, ""
        if exact_ok:
            chosen, route = exact_ok[0], "team_category"
        elif loose_ok:
            chosen, route = loose_ok[0], "name_variant_team_category"
        elif len(players_only) == 1:
            chosen, route = players_only[0], "sole_non_coach_namesake"
        picked = chosen["title"] if chosen else None

        # ---- collision log (written once, after the decision) --------------
        if wrong_person:
            self.collisions.append({
                "player": name, "expected_team": team, "kind": "wrong_person",
                "n_others": len(wrong_person),
                "other_article": " | ".join(c["title"] for c in wrong_person),
                "other_qid": " | ".join(c["qid"] for c in wrong_person),
                "detail": "article(s) with this exact name describe a human who "
                          "is not an American football player (P106="
                          + "; ".join(c["occupations"] or "none" for c in wrong_person)
                          + ")",
                "resolution": (f"rejected; used verified football article '{picked}'"
                               if picked else
                               "rejected; no verified football namesake -> no image"),
            })

        if len(exact_af) > 1:
            self.collisions.append({
                "player": name, "expected_team": team, "kind": "same_name_players",
                "n_others": len(exact_af),
                "other_article": " | ".join(c["title"] for c in exact_af),
                "other_qid": " | ".join(c["qid"] for c in exact_af),
                "detail": f"{len(exact_af)} American football players share this name",
                "resolution": (
                    f"team category '{TEAM_LABELS.get(team, team)} players' "
                    f"selected '{picked}'" if route == "team_category"
                    else f"no team category on any namesake (stale article); sole "
                         f"non-coach namesake '{picked}' selected"
                    if route == "sole_non_coach_namesake"
                    else f"exact-name namesakes all unconfirmed; team category "
                         f"selected the name variant '{picked}'"
                    if route == "name_variant_team_category"
                    else "no team category and >1 non-coach namesake -> "
                         "AMBIGUOUS, no image"),
            })

        if route == "name_variant_team_category":
            self.collisions.append({
                "player": name, "expected_team": team, "kind": "name_variant",
                "n_others": len(exact_af),
                "other_article": picked,
                "other_qid": chosen["qid"],
                "detail": ("cap-data name matches no article title; Wikipedia "
                           "uses a different legal or formal name"
                           if not exact_af else
                           "an unrelated player holds the exact name; the "
                           "cap-data name is a short form of a different player"),
                "resolution": f"accepted via '{TEAM_LABELS.get(team, team)} "
                              f"players' category confirmation",
            })

        if chosen:
            return chosen
        # Exactly one exact-name football player and nothing else to weigh:
        # accept, but the caller records that the team was never confirmed.
        if len(exact_af) == 1:
            return exact_af[0]
        return {}


# ------------------------------------------------------------- Commons files


def commons_fileinfo(w: Wiki, titles: list[str]) -> dict:
    """imageinfo + license extmetadata + categories for File: titles."""
    out = {}
    for i in range(0, len(titles), 20):
        chunk = [t if t.startswith("File:") else f"File:{t}" for t in titles[i:i + 20]]
        r = w.get(COMMONS, {
            "action": "query", "titles": "|".join(chunk),
            "prop": "imageinfo",
            "iiprop": "url|size|user|extmetadata",
            "iiextmetadatafilter": ("LicenseShortName|LicenseUrl|License|UsageTerms|"
                                    "Artist|Credit|AttributionRequired|Restrictions|"
                                    "ImageDescription|Categories|DateTimeOriginal"),
        })
        for p in r.get("query", {}).get("pages", []):
            if "missing" in p or not p.get("imageinfo"):
                continue
            ii = p["imageinfo"][0]
            em = ii.get("extmetadata", {})

            def g(k):
                return em.get(k, {}).get("value", "")

            out[p["title"]] = {
                "file_title": p["title"],
                "file_url": ii.get("url", ""),
                "descriptionurl": ii.get("descriptionurl", ""),
                "width": ii.get("width"), "height": ii.get("height"),
                "uploader": ii.get("user", ""),
                "author": strip_html(g("Artist")) or strip_html(g("Credit")),
                "license": strip_html(g("LicenseShortName")),
                "license_machine": strip_html(g("License")),
                "license_url": strip_html(g("LicenseUrl")),
                "usage_terms": strip_html(g("UsageTerms")),
                "attribution_required": strip_html(g("AttributionRequired")),
                "restrictions": strip_html(g("Restrictions")),
                "description": strip_html(g("ImageDescription")),
                "categories": strip_html(g("Categories")),
            }
    return out


def commons_usage(w: Wiki, title: str) -> list[str]:
    """en.wikipedia article titles that embed this Commons file."""
    r = w.get(COMMONS, {"action": "query", "titles": title,
                        "prop": "globalusage", "gulimit": "100"})
    pages = r.get("query", {}).get("pages", [])
    if not pages:
        return []
    return [g.get("title", "") for g in pages[0].get("globalusage", [])
            if g.get("wiki") == "en.wikipedia.org"]


def commons_search(w: Wiki, name: str, limit: int = 8) -> list[str]:
    r = w.get(COMMONS, {"action": "query", "list": "search",
                        "srsearch": f'{name} American football',
                        "srnamespace": "6", "srlimit": str(limit)})
    return [h["title"] for h in r.get("query", {}).get("search", [])]


IMAGE_EXT = (".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp")
# Word-boundary matched -- a substring test rejects "Baker Mayfield" on "field".
NOT_A_PORTRAIT = re.compile(
    r"\b(logo|logos|signature|jersey|helmet|stadium|field|arena|trophy|"
    r"ring|banner|map|diagram|chart)\b", re.I)


def is_image_file(title: str) -> bool:
    """Raster image, not an SVG logo / video / PDF."""
    return bool(title) and title.lower().endswith(IMAGE_EXT)


def is_portrait_candidate(title: str) -> bool:
    """Extra filter for UNCURATED Commons search hits, which are full of
    logos, jersey vectors and stadium shots. Not applied to Wikidata P18 or a
    Wikipedia lead image -- those are already curated as the subject's photo."""
    return is_image_file(title) and not NOT_A_PORTRAIT.search(title)


def attribution_string(rec: dict) -> str:
    who = rec.get("author") or rec.get("uploader") or "Unknown author"
    lic = rec.get("license") or rec.get("license_machine") or "see file page"
    return f"{who}, {lic}, via Wikimedia Commons"


# ------------------------------------------------------------------- per row


def audit_player(w: Wiki, res: Resolver, row) -> dict:
    name, team = row.player, row.team
    out = {
        "player": name, "otc_id": row.otc_id, "team": team,
        "max_cap_season": row.max_cap_season,
        "position": row.position, "selection": row.selection,
        "cap_rank": row.cap_rank, "max_cap_usd": round(float(row.max_cap_usd), 0),
        "career_first_season": row.career_first_season,
        "career_last_season": row.career_last_season,
        "has_usable_image": False, "file_title": "", "file_url": "",
        "author": "", "license": "", "license_url": "", "attribution": "",
        "verification_method": "none", "notes": "",
        "width": "", "height": "", "license_machine": "",
        "attribution_required": "", "restrictions": "", "wikidata_qid": "",
        "wikipedia_article": "",
    }

    hit = res.resolve(name, team)
    if not hit:
        out["notes"] = "no verified American-football Wikidata entity for this name"
        return out
    out["wikidata_qid"] = hit["qid"]
    out["wikipedia_article"] = hit["title"]
    strength = "team" if hit["team_confirmed"] else "sport"
    if not hit["team_confirmed"]:
        out["notes"] = "entity verified as NFL player; P54 did not list expected team"

    # ---- route 1: Wikidata P18 -------------------------------------------
    # MediaWiki normalizes underscores to spaces in returned titles; match it
    # so the imageinfo lookup keys line up.
    p18 = [f.replace("_", " ") for f in claim_strings(hit["entity"], "P18")]
    p18 = [f for f in p18 if is_image_file(f)]
    # ---- route 2: the article's own free lead image ------------------------
    lead = hit["pageprops"].get("page_image_free", "")
    lead = lead.replace("_", " ") if is_image_file(lead) else ""

    tried: list[tuple[str, str]] = []
    tried += [(f, f"wikidata_p18_{strength}") for f in p18]
    if lead:
        tried.append((lead, "wikipedia_lead_image"))

    info = commons_fileinfo(w, [t for t, _ in tried]) if tried else {}
    rejected = []
    for fname, method in tried:
        rec = info.get(f"File:{fname}") or info.get(fname)
        if not rec:
            continue
        free, why = classify_license(rec["license_machine"], rec["license"],
                                     rec["usage_terms"])
        if not free:
            rejected.append(f"{fname} [{rec['license'] or why}]")
            continue
        return finish(out, rec, method, rejected)

    # ---- route 3: Commons full-text search, verified before use -----------
    cands = [t for t in commons_search(w, name) if is_portrait_candidate(t)][:5]
    if cands:
        info = commons_fileinfo(w, cands)
        art = hit["title"]
        last = name.split()[-1].lower().strip(".")
        team_words = [TEAM_LABELS.get(team, "")] + TEAM_ALIASES.get(team, [])
        team_words = [x for x in team_words if x]
        for t in cands:
            rec = info.get(t)
            if not rec:
                continue
            free, why = classify_license(rec["license_machine"], rec["license"],
                                         rec["usage_terms"])
            if not free:
                rejected.append(f"{t} [{rec['license'] or why}]")
                continue
            blob = f"{rec['description']} {rec['categories']}".lower()
            if art in commons_usage(w, t):
                return finish(out, rec, "commons_usage_on_page", rejected)
            named = last in blob and name.split()[0].lower() in blob
            ctx = ("american football" in blob or "nfl" in blob
                   or any(tw.lower() in blob for tw in team_words)
                   or any(tw.split()[-1].lower() in blob for tw in team_words))
            if named and ctx:
                return finish(out, rec, "commons_category", rejected)
            rejected.append(f"{t} [unverified identity]")

    out["notes"] = "; ".join(
        [out["notes"]] * bool(out["notes"])
        + (["rejected: " + ", ".join(rejected[:3])] if rejected else [])
        + (["no free-culture photo found on Commons"] if not rejected else []))
    return out


def finish(out: dict, rec: dict, method: str, rejected: list[str]) -> dict:
    out.update({
        "has_usable_image": True,
        "file_title": rec["file_title"],
        "file_url": rec["file_url"],
        "author": rec["author"] or rec["uploader"],
        "license": rec["license"] or rec["license_machine"],
        "license_url": rec["license_url"],
        "attribution": attribution_string(rec),
        "verification_method": method,
        "width": rec["width"], "height": rec["height"],
        "license_machine": rec["license_machine"],
        "attribution_required": rec["attribution_required"],
        "restrictions": rec["restrictions"],
    })
    notes = [n for n in [out["notes"]] if n]
    if rejected:
        notes.append("rejected earlier: " + ", ".join(rejected[:2]))
    out["notes"] = "; ".join(notes)
    return out


# ---------------------------------------------------------------------- main


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--top", type=int, default=TOP_N)
    ap.add_argument("--start", type=int, default=WINDOW[0])
    ap.add_argument("--end", type=int, default=WINDOW[1])
    ap.add_argument("--limit", type=int, default=0, help="debug: first N players")
    ap.add_argument("--cache", type=str, default="",
                    help="optional JSON response cache (kept OUTSIDE the repo)")
    args = ap.parse_args()

    STAGING.mkdir(parents=True, exist_ok=True)

    print("== building population from historical_contracts.parquet ==")
    t0 = time.time()
    pop = build_population(args.top, args.start, args.end)
    print(f"  {len(pop)} unique players "
          f"({(pop.selection == 'top_cap').sum()} top-cap + "
          f"{(pop.selection == 'marquee').sum()} marquee) in {time.time() - t0:.1f}s")
    print(f"  cap window {args.start}-{args.end}; "
          f"min max-cap in population ${pop.max_cap_usd.min():,.0f}")

    if args.limit:
        pop = pop.head(args.limit)

    w = Wiki(Path(args.cache) if args.cache else None)
    res = Resolver(w)

    print(f"\n== querying Wikimedia for {len(pop)} players ==")
    rows = []
    t0 = time.time()
    for i, row in enumerate(pop.itertuples(), 1):
        rows.append(audit_player(w, res, row))
        if i % 25 == 0:
            hits = sum(r["has_usable_image"] for r in rows)
            print(f"  {i}/{len(pop)}  usable {hits}/{i} ({hits / i:.1%})  "
                  f"{w.calls} api calls  {time.time() - t0:.0f}s")
            w.save()
    w.save()

    out = pd.DataFrame(rows)
    cols = ["player", "otc_id", "team", "max_cap_season", "has_usable_image",
            "file_title", "file_url", "author", "license", "license_url",
            "attribution", "verification_method", "notes",
            "position", "selection", "cap_rank", "max_cap_usd",
            "career_first_season", "career_last_season",
            "width", "height", "license_machine", "attribution_required",
            "restrictions", "wikidata_qid", "wikipedia_article"]
    out = out[cols].sort_values("cap_rank").reset_index(drop=True)
    dest = STAGING / "player_images_sample.csv"
    out.to_csv(dest, index=False)

    # ------------------------------------------------------------ summary
    n = len(out)
    hits = int(out["has_usable_image"].sum())
    print(f"\n== results ==")
    print(f"  population              : {n}")
    print(f"  usable image            : {hits} ({hits / n:.1%})")
    print(f"  EXPECTED FALLBACK RATE  : {1 - hits / n:.1%}")
    print(f"  api calls               : {w.calls} ({w.retries} retries)")

    qb = out["position"] == "QB"
    for label, mask in [("QB", qb), ("non-QB", ~qb)]:
        s = out[mask]
        if len(s):
            print(f"  {label:<10}: {int(s.has_usable_image.sum())}/{len(s)} "
                  f"({s.has_usable_image.mean():.1%})")

    print("\n  license mix:")
    for lic, k in out[out.has_usable_image]["license"].value_counts().items():
        print(f"    {lic:<28} {k:>4}  ({k / hits:.1%})")

    print("\n  verification methods:")
    for m, k in out["verification_method"].value_counts().items():
        print(f"    {m:<28} {k:>4}  ({k / n:.1%})")

    print(f"\n  collisions logged: {len(res.collisions)}")
    for c in res.collisions:
        print(f"    [{c['kind']}] {c['player']} ({c['expected_team']}) -> "
              f"{c['other_article']} :: {c['detail']} :: {c['resolution']}")

    coll = pd.DataFrame(res.collisions)
    if not coll.empty:
        coll.to_csv(STAGING / "player_images_collisions.csv", index=False)
        print(f"  wrote {STAGING / 'player_images_collisions.csv'}")
    print(f"  wrote {dest}  ({n} rows)")

    raw = ROOT / "data" / "raw"
    left = [p.name for p in raw.glob("*") if p.is_file()] if raw.exists() else []
    print(f"  data/raw/ left empty    : {'PASS' if not left else 'FAIL ' + str(left)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
