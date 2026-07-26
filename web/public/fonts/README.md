# Self-hosted webfonts

All three families are **SIL Open Font License 1.1**. Licence texts ship here: `OFL-BebasNeue.txt`,
`OFL-Rajdhani.txt`, `OFL-Inter.txt`. Self-hosted because `TYPE.md` §8 forbids third-party font
requests (no Google Fonts calls at runtime).

| File | Face | Source |
|---|---|---|
| `bebas-neue-400.woff2` | Bebas Neue Regular (400 — the family's only weight) | repo handoff kit: `design/handoff/project/uploads/Bebas_Neue,DM_Serif_Display,Squada_One/Bebas_Neue/BebasNeue-Regular.ttf` (upstream: `https://github.com/google/fonts/tree/main/ofl/bebasneue`) |
| `rajdhani-400.woff2` | Rajdhani Regular | `https://raw.githubusercontent.com/google/fonts/main/ofl/rajdhani/Rajdhani-Regular.ttf` |
| `rajdhani-500.woff2` | Rajdhani Medium | `https://raw.githubusercontent.com/google/fonts/main/ofl/rajdhani/Rajdhani-Medium.ttf` |
| `rajdhani-600.woff2` | Rajdhani SemiBold | `https://raw.githubusercontent.com/google/fonts/main/ofl/rajdhani/Rajdhani-SemiBold.ttf` |
| `inter-var.woff2` | Inter **variable**, axes `opsz` 14–32 and `wght` 100–900 (`fvar`/`gvar` retained) | `https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf` |

Declared in `app/fonts.css` (Bebas at 400 only — never 700; Rajdhani as three rules; Inter as one
`font-weight: 100 900` rule).

## Exact subset command

Latin subset plus the geometric/arrow glyphs the product uses. Run per face, swapping in/out paths:

```sh
python3 -m fontTools.subset INPUT.ttf \
  --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2192,U+2193,U+2212,U+2215,U+2265,U+2713,U+FEFF,U+FFFD,U+22A0,U+229F,U+25A2,U+25A8,U+25AE,U+25B2,U+25BC,U+25C7,U+2039-203A,U+2044" \
  --layout-features='*' --flavor=woff2 --output-file=OUT.woff2
```

Verify: `python3 -c "from fontTools.ttLib import TTFont; f=TTFont('OUT.woff2'); print(f['head'].unitsPerEm, 'fvar' in f)"`
→ Bebas/Rajdhani `1000 False`, Inter `2048 True`.

Coverage note: Inter carries `◇ ▲ ▼ ‹ › · − – → ↓ ✓ ≥`. Bebas Neue and Rajdhani carry only
`‹ › · − – ≥` — they have no geometric-shape or arrow glyphs upstream, so those codepoints fall
through to the next family in the stack. `▮` U+25AE, `⊟` U+229F and `▨` U+25A8 exist in none of the
three faces and need a fallback wherever they are used.
