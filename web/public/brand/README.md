# Brand marks — outlined copies

These six files are outlined copies of
`design/handoff/project/uploads/yield-yard-brand-kit/assets/*.svg`, same filenames. **Use these,
not the kit originals.**

**Why.** `design/system/TYPE.md` §8, final bullet: the kit ships the marks as live `<text>` in
`'Bebas Neue'` with `font-weight="700"`. On any machine without Bebas installed they fall back to
Arial Narrow — the identity silently changes. Every `<text>` is now a baked `<path>`, so the marks
render identically everywhere with no font dependency. The synthetic `font-weight="700"` is gone
(TYPE.md §1: Bebas Neue is a single 400 weight; 700 was a synthetic bold). Inter runs keep their
real 700/800 weights. `monogram.svg` had no `<text>` and is copied verbatim.

**Script.** `web/scripts/outline-brand-svgs.py` (needs `fonttools brotli lxml uharfbuzz`). It
shapes each run with HarfBuzz — kerning on, ligatures off, matching Chromium, which kerns even at
non-zero letter-spacing — then bakes glyph coordinates through a `TransformPen`, honouring
inherited `font-*`/`letter-spacing`/`text-anchor` from the wrapping `<g>` and `text-anchor` shifts.
Inter is instanced from `public/fonts/inter-var.woff2` at the declared `wght` and the fvar default
`opsz` (14), which is what Chromium actually resolves for these runs. Re-run with
`python3 web/scripts/outline-brand-svgs.py`.

**Verification.** Bebas + Inter installed via `fc-cache`, original and outlined rendered in
Chromium (Playwright) at native viewBox size, compared as the fraction of pixels differing by more
than 8/255 on any channel. Images in `web/verify/brand/`.

| File | vs original with synthetic bold dropped | vs original exactly as shipped |
|---|---|---|
| `app-icon.svg` | **0.114%** | 0.114% |
| `badge.svg` | **0.787%** | 1.536% |
| `logo-horizontal-dark.svg` | **1.680%** | 4.593% |
| `logo-horizontal-light.svg` | **1.767%** | 4.516% |
| `logo-stacked.svg` | **1.210%** | 3.221% |
| `monogram.svg` | **0.000%** | 0.000% |

Column 1 is the layout-fidelity number and is the one to read: all under 2%, and the residual is a
1px antialiasing band on glyph edges — at 2x render every file drops to ≤0.29%, and no sub-pixel
offset improves the match, so glyph positions are exact. Column 2 is larger on the wordmarks only
because it still contains the synthetic bold this change deliberately removes.
