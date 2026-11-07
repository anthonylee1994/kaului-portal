---
name: Ops Functional Precision
colors:
  surface: '#f9f9f9'
  surface-dim: '#dadada'
  surface-bright: '#f9f9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f3f3'
  surface-container: '#eeeeee'
  surface-container-high: '#e8e8e8'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#4c4546'
  inverse-surface: '#2f3131'
  inverse-on-surface: '#f1f1f1'
  outline: '#7e7576'
  outline-variant: '#cfc4c5'
  surface-tint: '#5e5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1b1b1b'
  on-primary-container: '#848484'
  inverse-primary: '#c6c6c6'
  secondary: '#5e5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e1dfdf'
  on-secondary-container: '#626262'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#1b1b1b'
  on-tertiary-container: '#848484'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2e2e2'
  primary-fixed-dim: '#c6c6c6'
  on-primary-fixed: '#1b1b1b'
  on-primary-fixed-variant: '#474747'
  secondary-fixed: '#e4e2e2'
  secondary-fixed-dim: '#c7c6c6'
  on-secondary-fixed: '#1b1c1c'
  on-secondary-fixed-variant: '#464747'
  tertiary-fixed: '#e2e2e2'
  tertiary-fixed-dim: '#c6c6c6'
  on-tertiary-fixed: '#1b1b1b'
  on-tertiary-fixed-variant: '#474747'
  background: '#f9f9f9'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 34px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '700'
    lineHeight: 26px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: 18px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-dense: 0.5rem
  margin: 1.5rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style
This design system is built for mission-critical operations, trust and safety moderation, and data-dense administrative surveillance. It merges functional minimalism with an industrial administrative aesthetic: stark, highly legible, unyielding, and completely devoid of frivolous decorative flourish.

The visual style prioritizes operational throughput, cognitive speed, and unambiguous decision-making. High-contrast monolithic framing—anchored by solid black navigation bars and crisp paper-white container cards set against an industrial concrete neutral foundation (#F2F2F2)—ensures operators can parse thousands of records, identify anomalies, and execute moderation actions without visual fatigue or ambiguity.

## Colors
The color architecture enforces strict utility, functional contrast, and unambiguous semantic signaling.

### Monolithic Neutrals
- **Page Background Canvas:** `#F2F2F2` (Industrial soft concrete base)
- **Container / Card Surface:** `#FFFFFF` (Pure stark white)
- **Primary Text & Structure:** `#000000` (Pitch black for supreme legibility)
- **Secondary Text / Metadata:** `#666666` (Pitch black at 60% optical weight)
- **Structural Outlines / Card Borders:** `rgba(0, 0, 0, 0.15)`
- **Header Navigation Bar:** `#000000` ground with `#FFFFFF` active elements and `rgba(255, 255, 255, 0.60)` inactive items.

### Strict Operational Semantics
- **Danger (Banned, Underage, Destructive Actions):**
  - Text & Accents: `#DC2626` / `#B91C1C` (Red 600/700)
  - Surface Tint: `#FEF2F2` (Red 50)
  - Stroke: `#FECACA` (Red 200)
- **Warning (Open Reports, Escalations, Flags):**
  - Text & Accents: `#D97706` / `#B45309` (Amber 600/700)
  - Surface Tint: `#FFFBEB` (Amber 50)
  - Stroke: `#FDE68A` (Amber 200)
- **Success (Active State, Verified, Actioned Records):**
  - Text & Accents: `#16A34A` / `#15803D` (Green 600/700)
  - Surface Tint: `#F0FDF4` (Green 50)
  - Stroke: `#BBF7D0` (Green 200)
- **Neutral / Dormant (Dismissed, Archived, Soft Deleted):**
  - Text & Accents: `#71717A` / `#52525B` (Zinc 500/600)
  - Surface Tint: `#F4F4F5` (Zinc 100)
  - Stroke: `#E4E4E7` (Zinc 200)

## Typography
Typography is split into dual disciplines:

1. **System Interface Sans (`Inter`):** Used across operational navigation, table headers, form inputs, body text, and button labels. It is tuned with compact vertical metrics and disciplined line-heights to support high information density.
2. **Technical Telemetry Monospace (`JetBrains Mono`):** Applied strictly to identifiers, UUIDs, IP addresses, database keys, hash values, execution timestamps, error traces, and operational tabular metrics. This guarantees tabular alignment and instant character disambiguation (e.g., `0` vs `O`, `1` vs `l`).

## Layout & Spacing
The layout follows a tight, functional 12-column density grid designed for operational panels, split-pane triage, and dense data tables.

- **Global Margins & Canvas:** The default canvas margins are `1.5rem` on desktop displays, dropping to `1rem` on compact displays.
- **Micro-Spacers:** Component padding prioritizes spatial conservation:
  - `space-xs` (4px): Inline token chips, metric delimiters, and status dots.
  - `space-sm` (8px): Table cell vertical padding, compact form controls, and nested list items.
  - `space-md` (12px): Standard button padding, control bars, and card headers.
  - `space-lg` (16px): Card internal content padding and master-detail split borders.
  - `space-xl` (24px): Structural division between operational zones.

## Elevation & Depth
Elevation in this design system avoids soft, floating, or diffuse multi-layered shadows. Instead, it relies on strict structural framing and micro-borders:

- **Surface Layer 0 (Canvas):** Solid `#F2F2F2`.
- **Surface Layer 1 (Operational Cards):** Pure White `#FFFFFF` encapsulated by an explicit single-pixel border `rgba(0, 0, 0, 0.15)` and anchored with an ultra-subtle, non-distracting resting shadow: `0 1px 2px 0 rgba(0, 0, 0, 0.05)`.
- **Surface Layer 2 (Modals, Overlays, and Command Palettes):** Crisp White `#FFFFFF` backed by `border: 1px solid #000000`, complemented by a crisp drop shadow `0 8px 16px -4px rgba(0, 0, 0, 0.12)`.
- **Command Header:** Flush, un-elevated pitch-black banner (`#000000`) acting as an immovable horizontal beam across the top edge.

## Shapes
Geometry is disciplined, pairing high-radius structural containers with sharp functional micro-elements:

- **HeroUI Containers & Cards:** Configured with `rounded-2xl` (16px / 1rem radius) to frame analytical and administrative clusters cleanly against the `#F2F2F2` backdrop.
- **Interactive Controls (Inputs, Buttons, Dropdowns):** Defined with standard `0.375rem` (6px) or `0.5rem` (8px) radius to maintain crisp utility without visual bulk.
- **Status Badges & Semantic Chips:** Border radius of `0.25rem` (4px) or full capsule (`9999px`) where high-contrast glanceability is required.

## Components

### Header Navigation
- **Surface:** Pitch black (`#000000`), height `56px`, zero bottom border.
- **Active Navigation Items:** Text color `#FFFFFF`, weight `600`, subtle bottom indicator or contrast chip.
- **Inactive Navigation Items:** Text color `rgba(255, 255, 255, 0.60)`, transitioning to `#FFFFFF` on hover.

### Operational Cards
- **Base:** White background (`#FFFFFF`), `rounded-2xl`, outline `1px solid rgba(0, 0, 0, 0.15)`, and `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05)`.
- **Card Header:** Border-bottom `1px solid rgba(0, 0, 0, 0.08)`, vertical padding `12px`, horizontal padding `16px`. Title in `14px` bold with uppercase monospace contextual metadata.

### Status Semantic Badges & Chips
- **Sizing:** Fixed height `22px`, horizontal padding `8px`, font size `11px`, font family `JetBrains Mono`, uppercase.
- **Danger (Banned / Underage / Ban Actions):** Background `#FEF2F2`, border `1px solid #FECACA`, text `#B91C1C`.
- **Warning (Open Reports / Alerts):** Background `#FFFBEB`, border `1px solid #FDE68A`, text `#B45309`.
- **Success (Active / Actioned):** Background `#F0FDF4`, border `1px solid #BBF7D0`, text `#15803D`.
- **Neutral (Dismissed / Archived):** Background `#F4F4F5`, border `1px solid #E4E4E7`, text `#52525B`.

### Buttons
- **Primary Action:** Solid `#000000` background, `#FFFFFF` text, font weight `600`, radius `6px`. Hover: `#262626`.
- **Destructive Action:** Solid `#DC2626` background, `#FFFFFF` text, radius `6px`. Hover: `#B91C1C`.
- **Secondary / Outline:** Background `#FFFFFF`, border `1px solid rgba(0, 0, 0, 0.20)`, text `#000000`. Hover: `#F4F4F5`.

### Dense Data Tables
- **Header:** Background `#FAFAFA`, border-bottom `1px solid rgba(0, 0, 0, 0.15)`, text `rgba(0, 0, 0, 0.60)`, font size `11px`, uppercase, font weight `600`.
- **Rows:** Alternating rows or pure white with border-bottom `1px solid rgba(0, 0, 0, 0.06)`. Row height `40px` for high-density scanning. Monospace styling applied directly to all key ID, timestamp, and numerical columns.

### Inputs & Checkboxes
- **Text Inputs:** Height `34px`, border `1px solid rgba(0, 0, 0, 0.20)`, radius `6px`, text `#000000`, placeholder `#A1A1AA`. Focus state: border `1px solid #000000` with zero diffuse glow.
- **Checkboxes:** Standard 16x16px box, radius `3px`, border `1.5px solid rgba(0, 0, 0, 0.40)`. Active: solid `#000000` fill with white checkmark.