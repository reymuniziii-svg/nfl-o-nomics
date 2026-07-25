---
name: Gridiron Analytics
colors:
  surface: '#031427'
  surface-dim: '#031427'
  surface-bright: '#2a3a4f'
  surface-container-lowest: '#000f21'
  surface-container-low: '#0b1c30'
  surface-container: '#102034'
  surface-container-high: '#1b2b3f'
  surface-container-highest: '#26364a'
  on-surface: '#d3e4fe'
  on-surface-variant: '#c5c6ca'
  inverse-surface: '#d3e4fe'
  inverse-on-surface: '#213145'
  outline: '#8f9194'
  outline-variant: '#45474a'
  surface-tint: '#c6c6c9'
  primary: '#c6c6c9'
  on-primary: '#2f3133'
  primary-container: '#0f1113'
  on-primary-container: '#7b7d7f'
  inverse-primary: '#5d5e61'
  secondary: '#d3fbff'
  on-secondary: '#00363a'
  secondary-container: '#00eefc'
  on-secondary-container: '#00686f'
  tertiary: '#ffb59a'
  on-tertiary: '#5a1b00'
  tertiary-container: '#250700'
  on-tertiary-container: '#da4e00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e2e2e5'
  primary-fixed-dim: '#c6c6c9'
  on-primary-fixed: '#1a1c1e'
  on-primary-fixed-variant: '#454749'
  secondary-fixed: '#7df4ff'
  secondary-fixed-dim: '#00dbe9'
  on-secondary-fixed: '#002022'
  on-secondary-fixed-variant: '#004f54'
  tertiary-fixed: '#ffdbce'
  tertiary-fixed-dim: '#ffb59a'
  on-tertiary-fixed: '#370e00'
  on-tertiary-fixed-variant: '#802a00'
  background: '#031427'
  on-background: '#d3e4fe'
  surface-variant: '#26364a'
typography:
  display-lg:
    fontFamily: Archivo Narrow
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Archivo Narrow
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: 0.02em
  headline-lg-mobile:
    fontFamily: Archivo Narrow
    fontSize: 24px
    fontWeight: '700'
    lineHeight: '1.2'
  data-lg:
    fontFamily: JetBrains Mono
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: -0.04em
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-mono:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.4'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 48px
  max-width: 1440px
---

## Brand & Style

This design system is built at the intersection of high-octane sports broadcasting and granular financial engineering. It targets an audience of "data-obsessed fans"—individuals who view the NFL through the lens of salary caps, ROI per player, and roster efficiency.

The visual style is **High-Contrast / Glassmorphic**, borrowing the intensity of a stadium jumbotron and refining it with the clinical precision of a professional trading terminal. The aesthetic relies on the tension between dark, expansive voids and razor-sharp neon data points. It is aggressive yet technical, designed to feel like a high-end financial tool optimized for the energy of a Sunday night game.

## Colors

The palette is centered on an **Obsidian and Charcoal** base to eliminate glare and maximize the "glow" of data elements. 

- **Foundation:** Deep Charcoal (`#0F1113`) and Pure Obsidian create the background depth.
- **Data Accents:** Electric Blue (`#00F0FF`), Neon Orange (`#FF5C00`), and Lime are reserved strictly for data visualization, active states, and critical KPIs.
- **Structure:** Slate (`#64748B`) is used for hairlines and borders, ensuring they remain visible but do not compete with the primary content.
- **Semantic:** Success is Lime, Warning is Orange, and Informational updates are Electric Blue.

## Typography

This system uses a dual-font strategy to separate narrative from data. 

- **Headlines:** `Archivo Narrow` provides an aggressive, condensed feel reminiscent of sports news tickers. It should be used in all-caps for primary section headers to emphasize "Broadcast Energy."
- **Data & Numbers:** `JetBrains Mono` is the engine of the system. Every salary figure, percentage, and index score must be rendered in monospace to ensure vertical alignment in tables and a sense of "Pure Data" precision.
- **Body Text:** `Inter` handles the explanatory text, providing a neutral, highly legible balance to the high-character display fonts.

## Layout & Spacing

The layout is a **12-column Fluid Grid** with high-density spacing units. Given the technical nature of the content, we prioritize "Information Density" over excessive whitespace.

- **Desktop:** 12 columns, 16px gutters, 48px side margins. Cards often span 3 or 4 columns.
- **Mobile:** 4 columns, 12px gutters, 16px side margins.
- **Rhythm:** A 4px baseline grid ensures that monospaced data tables align perfectly across rows. Elements should be packed tightly within containers to evoke a "Mission Control" dashboard feel.

## Elevation & Depth

Hierarchy is achieved through **Glassmorphism and Tonal Layering** rather than traditional shadows.

- **Base Layer:** Pure Obsidian.
- **Surface Layer:** Glassmorphic containers with a `backdrop-filter: blur(20px)` and a 10% white tint.
- **Borders:** Ultra-thin 1px hairlines using the Neutral Slate at 20% opacity. For "Active" or "Highlighted" cards, the border adopts the primary Neon Blue.
- **Depth:** No shadows are used. Instead, depth is conveyed by the varying intensity of the background blur and the contrast of the hairline borders.

## Shapes

The shape language is "Soft-Industrial." While the aesthetic is technical, we use moderate rounding to signify a modern, premium software experience rather than a legacy terminal.

- **Primary Containers:** 8px (`rounded-md` based on scale 2) for a balanced, professional appearance.
- **Interactive Elements:** 16px (`rounded-lg`) for buttons and input fields to make them clearly distinct from structural containers.
- **Status Indicators:** 100% circular for small status pips or team avatars.

## Components

### Glassmorphic Cards
Cards are the primary organizational unit. They feature a semi-transparent background and a 1px slate border. If a card represents a specific team, the border may adopt a subtle "glow" in that team’s primary color.

### Data Tables
Tables are high-density. Rows are separated by 0.5px hairlines. Header labels use `label-mono` in slate, while cell values use `data-lg` in pure white or neon accents for emphasis.

### Cap+ Index Lockups
A specialized component for displaying index scores. It consists of a large display-size monospaced number paired with a bold, condensed "CAP+" label. This lockup should feel like a "Scoreboard" element.

### Buttons & Inputs
Buttons are ghost-style by default with 1px neon borders. On hover, they fill with the neon color and use black text for maximum contrast. Inputs use monospaced text for all numerical entry to maintain alignment.

### Photo Treatment
Player and stadium imagery must use a **Duotone Filter**. This filter maps the image's dark tones to Charcoal (`#0F1113`) and light tones to the specific NFL team's primary color. This ensures that photography feels like a structural part of the UI rather than an outside element.