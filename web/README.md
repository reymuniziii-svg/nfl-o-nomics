# web/ — YIELD/YARD front end

Next.js App Router + TypeScript. Reads **precomputed marts only** (`ARCHITECTURE.md` §3): no
nflverse fetch, no parquet, no metric computed at request time.

The repo is polyglot — `etl/` is Python, `web/` is Node. This package owns everything under
`web/` and reads (never writes) the rest of the repo.

```
npm install
npm run seed      # marts -> database  (PGlite by default; see below)
npm run build     # 1,168 units
npm start
npm run verify    # Playwright: both canvases, both themes, the design rules asserted
```

`npm run dev` and `npm run build` both run `scripts/prepare.mjs` first, which mirrors the asset
pipeline's output, the design tokens and `METHODOLOGY.md` into `web/` and regenerates the
`etl/config.py` flag bridge. Everything it writes is gitignored.

## The DATABASE_URL swap, in one line

**`DATABASE_URL` unset → PGlite (in-process Postgres, `.data/pgdata.tar.gz`); set it to a Neon
connection string and re-run `npm run seed && npm run build` — same Drizzle schema, same seed
program, same queries, no code change.**

Local-first is the default so the project needs no provisioned service to develop or build
against: `npm run seed` writes `.data/pglite` and dumps it to `.data/pgdata.tar.gz`, which every
`next build` render worker inflates read-only into memory. When Neon is provisioned, set
`DATABASE_URL` (read-write role for the seed job, read-only role for the app — `ARCHITECTURE.md`
§8) and both programs follow it. See `.env.example`.

## Layout

| Path | What it is |
|---|---|
| `db/schema.ts` | Drizzle schema — the single TypeScript definition of `SPEC.md` §7 |
| `db/seed.ts` | The seed program. Tolerant mart location, tolerant of marts that do not exist yet, destructive and idempotent, prints a manifest |
| `db/client.ts` | The `DATABASE_URL` switch |
| `lib/data/` | The typed data layer. Every accessor returns `Metric<T>` |
| `lib/metric.ts` | `Metric<T>` and the approved launch copy |
| `lib/teams.ts` | The 32 codes, divisions, legacy redirects, and the era-identity table |
| `lib/marks.ts` | TeamMark / PlayerMark loaders and the kill-switch branch |
| `lib/flags.ts` | GATE #3 flags: env var > `etl/config.py` bridge > literal default |
| `lib/display.ts` | Display helpers and the `Coverage` shape every chart takes. Decides band NAMES, never colors |
| `lib/view.ts` | View models — bundle → component props, so a page file is routing and composition only |
| `lib/csv.ts` | The CSV projection, run on the server beside the render (`DECISIONS.md` 55) |
| `components/` | The design system: primitives, marks, charts, the Receipt, the leaderboard, pickers, shell |
| `app/` | The routes of `SPEC.md` §6 |
| `scripts/prepare.mjs` | Asset mirror, flag bridge, `METHODOLOGY.md` copy, token mirror |
| `scripts/verify.py` | The Playwright check. Ten assertions, both canvases, both themes |
| `scripts/outline-brand-svgs.py` | Regenerates `public/brand/` from the brand kit, text converted to paths |

## Routes

| Route | Rendering |
|---|---|
| `/` | static — home, AFC East default |
| `/division/{div}` | static, 8 |
| `/team/{abbr}` | **301** to the franchise's most recent season (`next.config.ts`) |
| `/team/{abbr}/{season}` | static, 861 |
| `/player` | static — the search surface over the v1 population |
| `/player/{id}` | static, 251 — the audited v1 population (DECISIONS 53) |
| `/compare?a=&b=` | on demand, cached at the edge for the life of the snapshot |
| `/share/receipt/{div}/{season}` | static, 8 (current season) + on demand — the SQUARE Receipt export |
| `/share/team/{abbr}/{season}` | static, 32 (current season) + on demand — the SQUARE team-header export |
| `/methodology`, `/credits` | static |

### Screenshot variants

`SCREENSHOT_VARIANTS.md` is implemented as **routes**, not as a render mode on the product
pages: `?share=1` would make an otherwise static page read `searchParams`, which turns it
dynamic and loses the prerender. The two share routes mount the same components with
`size="square"` and `export`, which applies `.yy-export` (border `.42` dark / `.28` light, flat
surfaces, 1 ms durations), **force-expands every disclosure**, removes the controls and moves the
lens state into the eyebrow.

The card carries `[data-export-root]`; a rasterizer screenshots that element at
`devicePixelRatio ≥ 2` for the 1080 × 1080 crop. The theme is the reader's own
(`SCREENSHOT_VARIANTS.md` §8) and is always pinned EXPLICITLY on `<html>` by the boot script in
`app/layout.tsx` — `tokens.css` §27 pairs `.yy-export` with `[data-theme="light"]` only, so an
inherited (attribute-less) light preference would give the export dark card surfaces under light
ink.

## Fonts

All three faces are **self-hosted, latin-subset WOFF2**, under OFL 1.1, in `public/fonts/` with
their licenses and a reproducible subset command (`public/fonts/README.md`). There are no
third-party font requests. Bebas Neue is declared at **400 only** — it is a single-weight family
and 700 would invite a synthetic bold (`TYPE.md` §1).

`public/brand/` holds **outlined** copies of the six brand marks: the kit ships them as live
`<text>` in Bebas Neue, which renders as Arial Narrow on any machine without the font
(`TYPE.md` §8). Only the outlined copies are used in the app.

Legacy franchise codes (`oak`, `stl`, `sd`, `lar`, `sl`, `jac`, `arz`, `blt`, `clv`, `hst`,
`wsh`, `wft`) **301** to the canonical route, with or without a season. The route key is
franchise-continuous; the rendered identity is era-correct, so `/team/lv/2003` is the 2003
Raiders and the page says **Oakland**.

## Design tokens

`app/globals.css` imports `./fonts.css` and then `./tokens.css`, which `scripts/prepare.mjs`
mirrors from `design/system/tokens.css` (and stubs with the same token names if the design track
has not published yet). Components bind to the semantic layer — `--yy-bg`, `--yy-fg-1`,
`--yy-line-divider` — never to a raw palette token, or they will not theme.

`globals.css` also carries the composed type recipes from `TYPE.md` §6 verbatim (`.yy-label`,
`.yy-num`, `.yy-caption`, …). A component composes them and never invents a variant. Everything
else is a CSS Module beside its component, and **no component names a color, a radius, a
spacing or a font family** — team color is the one exception and it arrives as data from
`chipdata.json`, in the two places `DECISIONS.md` 80 allows.

## Verification

`python3 scripts/verify.py [base_url]` drives the production build with Playwright at **390** and
**1280**, in **both themes**, over twelve surfaces, and asserts:

1. no `Infinity` / `NaN` anywhere in the rendered text;
2. tabular numerals actually applied to `.yy-num`, in the self-hosted face;
3. the lens caveat's short form present on the hero;
4. every dead-money figure carrying its as-of date on the same line;
5. the `SAMPLE` chip absent on real data (checked structurally, not by the word);
6. every blank rendering a reason;
7. no sideways page scroll;
8. `document.fonts.ready` before every shot;
9. no page error and no hydration mismatch;
10. `data-theme` pinned explicitly on `<html>`.

It also rasterizes the two square exports at 2.7× (1080 × 1080) in both themes and checks the
crop geometry, the absence of any collapsed disclosure, and the product mark. Output —
screenshots plus `report.json` — lands in `web/verify/`, which is gitignored.
