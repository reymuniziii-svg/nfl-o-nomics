# YIELD/YARD Brand System

Version 0.1

YIELD/YARD is an NFL statistics and data analytics product. The brand should feel like a serious software company that happens to understand football—not a fantasy league, sportsbook, or team merchandise brand.

## Brand idea

**Smarter data. Stronger decisions. Higher yield.**

The central visual device is the slash in `YIELD/YARD`. It can read as:

- a yard marker;
- a division sign connecting cost and performance;
- an upward trajectory;
- a clean separator between football and finance.

The balance is roughly **65% analytics software / 35% football culture**.

## Logo hierarchy

1. **Primary horizontal wordmark** — default for website headers, reports, decks and product navigation.
2. **Reversed wordmark** — use on End Zone, Field Green and Film Room backgrounds.
3. **Stacked lockup** — use for editorial covers, social cards and vertically constrained placements.
4. **YY monogram** — use for favicons, compact navigation and avatars.
5. **Premium app icon** — use only for installed application surfaces and launch graphics.
6. **Shield emblem** — secondary brand expression for merchandise, awards and special editorial packages. Do not use it as the default corporate logo.

### Clear space

Maintain clear space around the logo equal to the visual width of the slash. No text, borders, chart marks or photography may enter this area.

### Minimum sizes

| Asset | Digital | Print |
|---|---:|---:|
| Horizontal wordmark | 140 px wide | 1.4 in wide |
| Stacked wordmark | 110 px wide | 1.1 in wide |
| Monogram | 24 px | 0.25 in |
| Shield emblem | 80 px | 0.8 in |

### Prohibited use

- Do not recolor the lime slash to match an NFL team.
- Do not stretch, compress, outline or add drop shadows to the primary wordmark.
- Do not append official league or team marks.
- Do not place the logo directly over visually busy stadium photography.
- Do not use the shield and primary wordmark side by side.
- Do not use gold as the dominant logo color.

## Color tokens

| Token | Hex | Role |
|---|---|---|
| `--yy-end-zone` | `#071C16` | Primary dark background and core wordmark color |
| `--yy-field-green` | `#0B3D2E` | Secondary brand surface |
| `--yy-film-room` | `#111416` | Neutral black, text and interface chrome |
| `--yy-chalk-white` | `#FFFFFF` | Light background and reversed typography |
| `--yy-yield-lime` | `#A6E22E` | Selected states, positive movement, slash and primary data emphasis |
| `--yy-premium-gold` | `#D4AF37` | Benchmarks, value thresholds and premium accents |
| `--yy-muted` | `#A8B1AD` | Secondary text and inactive UI |
| `--yy-paper` | `#F5F6F2` | Editorial page background |

### Recommended ratios

For a typical product or marketing page:

- 55% white or paper
- 25% End Zone / Field Green
- 12% neutral gray / Film Room
- 6% Yield Lime
- 2% Premium Gold

Lime and gold are accents. Making either one the dominant page color will turn the product into an energy drink.

### Accessibility

- Use End Zone or Film Room text on Yield Lime.
- Use white text on End Zone, Field Green and Film Room.
- Avoid gold body text on white.
- Use gold primarily for strokes, icons, benchmarks and short labels.
- Confirm WCAG AA contrast for all production UI states.

## Typography

### Display: Bebas Neue

Use for:

- H1 and H2 headlines;
- large campaign statements;
- major numeric callouts;
- wordmark approximations in prototypes.

Default styling:

```css
font-family: "Bebas Neue", "Arial Narrow", sans-serif;
font-weight: 400;
letter-spacing: 0.02em;
line-height: 0.9;
```

### Athletic utility: Squadron Black

Use for:

- navigation labels;
- stat categories;
- tabs and filter groups;
- shield/badge typography;
- short all-caps calls to action.

Squadron Black is not bundled in this kit. It must be separately licensed and installed. Until then, use Rajdhani Bold as the web implementation substitute:

```css
font-family: "Squadron Black", "Rajdhani", "Arial Narrow", sans-serif;
font-weight: 700;
letter-spacing: 0.08em;
text-transform: uppercase;
```

Do not use the athletic face for paragraphs or dense table data.

### Product and body: Inter

Use for:

- body copy;
- tables;
- tooltips;
- chart labels;
- forms and controls;
- long-form editorial text.

```css
font-family: "Inter", Arial, sans-serif;
font-feature-settings: "tnum" 1, "ss01" 1;
```

Use tabular numerals for financial, contract and performance tables.

## Type scale

| Style | Desktop | Mobile | Face |
|---|---:|---:|---|
| Hero | 120–176 px | 72–96 px | Bebas Neue |
| H1 | 80–104 px | 56–72 px | Bebas Neue |
| H2 | 56–80 px | 42–56 px | Bebas Neue |
| Section label | 14–18 px | 13–16 px | Squadron / Rajdhani |
| Body large | 20–24 px | 18–20 px | Inter |
| Body | 16–18 px | 16 px | Inter |
| Data label | 12–14 px | 11–13 px | Inter / Rajdhani |
| Major metric | 34–64 px | 30–48 px | Rajdhani or Inter Bold |

## Layout and geometry

- Base spacing unit: `4px`.
- Preferred component increments: `8, 12, 16, 24, 32, 48, 64, 96px`.
- Standard card radius: `18–24px`.
- App icon radius: approximately 21% of icon width.
- Standard border: `1px solid rgba(7, 28, 22, 0.15)`.
- Dark cards may use a subtle top-left-to-bottom-right green gradient.
- Use yard ticks as dividers sparingly. They are a structural motif, not confetti.

## Data visualization system

The chart system should borrow spatial cues from football fields without making every chart literally resemble one.

### Color logic

- **Yield Lime:** selected player/team, primary series, positive trajectory.
- **Premium Gold:** benchmark, league average, target or fair-value threshold.
- **White / muted gray:** comparison series on dark backgrounds.
- **Field Green:** secondary positive series or contextual region.
- **Red:** reserve for genuine negative status, risk or alert states; do not use it merely because a team wears red.

### Chart rules

- Use direct labels where possible.
- Use no more than one lime series per chart.
- Do not use gradients inside quantitative bars or lines.
- Gridlines should remain below 15% opacity.
- Yard numbers and hash marks may reinforce an axis but must not replace conventional labels.
- Use gold dashed lines for expected value, median, target or historical benchmark.
- Use a minimum 3 px line on large marketing charts and 2 px in product UI.
- Tooltips should show the metric, percentile/rank, sample and source date.
- Always distinguish contract cost, on-field performance and composite value metrics.

### Value Stadium view

The Value Stadium is the signature visualization. It should map a player's or team's value into an intuitive stadium seating metaphor:

- lower bowl / midfield = elite value;
- upper deck / end zones = weaker value;
- lime highlight = current subject;
- gold ring or line = league benchmark;
- hover or tap reveals the exact metric and percentile.

The visualization must remain analytically honest. Stadium geometry should organize the information, not distort it.

## Photography and imagery

Preferred imagery:

- wide stadium architecture;
- field geometry and yard markers;
- film-room screens and tactical diagrams;
- player detail shots that leave negative space for data overlays;
- restrained dark grading with clear white highlights.

Avoid:

- generic screaming-fan stock photography;
- gambling imagery, chips or betting slips;
- team-logo collages;
- excessive neon glow;
- fake holographic dashboards;
- official NFL or team marks without permission.

Place a dark green scrim of 65–85% opacity behind white logo or data overlays.

## Iconography

- Use a 2 px stroke at 24 px icon size.
- Prefer geometric line icons with rounded line caps.
- Core metaphor set: target, upward yield, play route, contract, roster, field, bar chart and percentile.
- Do not mix filled sports clip art with line-based product icons.

## Voice

Brand language should be confident, analytical and plainspoken.

Preferred:

- “See what each win actually costs.”
- “Compare performance to cap commitment.”
- “Find value the standings miss.”
- “The contract is only half the story.”

Avoid:

- “Revolutionary AI-powered next-generation insights.”
- gambling jargon;
- breathless sports-talk clichés;
- unsupported claims of prediction certainty.

## Product UI guidance

- Dark mode is the flagship visual expression, but all core product views need a true light mode.
- Default tables use Inter with tabular numerals.
- Filters use Squadron / Rajdhani all caps at modest sizes.
- Selected states use Yield Lime with End Zone text.
- Gold should mark benchmarks, not clickable controls.
- Rounded cards should not become a sea of floating pills; retain strong page-level grid alignment.

## CSS tokens

```css
:root {
  --yy-end-zone: #071C16;
  --yy-field-green: #0B3D2E;
  --yy-film-room: #111416;
  --yy-chalk-white: #FFFFFF;
  --yy-yield-lime: #A6E22E;
  --yy-premium-gold: #D4AF37;
  --yy-muted: #A8B1AD;
  --yy-paper: #F5F6F2;

  --yy-font-display: "Bebas Neue", "Arial Narrow", sans-serif;
  --yy-font-athletic: "Squadron Black", "Rajdhani", "Arial Narrow", sans-serif;
  --yy-font-body: "Inter", Arial, sans-serif;

  --yy-radius-card: 22px;
  --yy-radius-control: 8px;
  --yy-border: 1px solid rgba(7, 28, 22, 0.15);
  --yy-shadow: 0 24px 70px rgba(2, 9, 7, 0.18);
}
```

## Included files

- `index.html` — responsive brand-guideline webpage.
- `design.md` — implementation and usage specification.
- `assets/logo-horizontal-dark.svg`
- `assets/logo-horizontal-light.svg`
- `assets/logo-stacked.svg`
- `assets/monogram.svg`
- `assets/app-icon.svg`
- `assets/badge.svg`
- `assets/reference-board.png` — selected visual concept used as the design reference.

## Legal note

YIELD/YARD is presented as an independent football analytics product. Do not imply endorsement by or affiliation with the NFL or any NFL club. Official league, club and player marks require separate permissions.
