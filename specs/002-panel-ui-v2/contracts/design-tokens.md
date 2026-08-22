# Contract: Design Tokens

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

The constitution requires appearance tokens *"declared once and emitted as CSS custom properties
switched by `prefers-color-scheme`"*, and forbids per-component colour literals. This file is the
authoritative token set. `src/renderer/styles/theme.css` MUST match it, and SC-007 audits that no
colour, spacing, or radius literal appears inside a section component.

Dark values are **measured** from `design/mini-menu-bar-design.pen`. Light values are derived by role
inversion ([R-104](../research.md)), with two deliberate contrast corrections noted below.

## Colour

| Token | Dark (measured) | Light (derived) | Used for |
|---|---|---|---|
| `--color-surface` | `#1a1a1c` | `#ffffff` | Panel background, content column |
| `--color-rail` | `#141416` | `#f0f0f3` | Icon rail — MUST read as recessed vs. surface in both |
| `--color-rail-border` | `#ffffff0f` | `#0000000f` | Rail's 1 pt right edge |
| `--color-hairline` | `#ffffff14` | `#00000014` | Band divider, pane divider |
| `--color-fill-subtle` | `#ffffff0a` | `#00000008` | Shortcut field, inactive note row |
| `--color-fill` | `#ffffff0f` | `#0000000d` | Icon buttons, inactive chips |
| `--color-fill-strong` | `#ffffff14` | `#00000014` | Count pill, secondary buttons |
| `--color-text` | `#f2f2f5` | `#1c1c1e` | Titles, primary labels, values |
| `--color-text-secondary` | `#8e8e93` | `#6e6e73` † | Metadata, sublabels, timestamps |
| `--color-text-tertiary` | `#6e6e73` | `#8e8e93` † | Group labels, hints — captions only, see below |
| `--color-text-strong` | `#e5e5ea` | `#2c2c2e` | Key chips |
| `--color-accent` | `#2b89fa` | `#2b89fa` | Active rail item, selection badges, progress fills, accent icons |
| `--color-accent-strong` | `#1b6fd6` | `#1b6fd6` ‡ | Filled accent buttons that carry a **text label** |
| `--color-accent-text` | `#5aa7ff` | `#0a63c9` † | All accent-coloured **text**, on any surface |
| `--color-accent-subtle` | `#2b89fa26` | `#2b89fa1f` | Active rail item background, active preset chip |
| `--color-accent-faint` | `#2b89fa1f` | `#2b89fa14` | Accent secondary buttons |
| `--color-accent-border` | `#2b89fa8c` | `#2b89fa8c` | Active preset chip border |
| `--color-on-accent` | `#ffffff` | `#ffffff` | Text and icons on a filled accent surface |
| `--color-danger` | `#ff5f55` | `#d70015` † | Delete labels and icons |
| `--color-danger-subtle` | `#ff453a1f` | `#d700151a` | Delete button background |
| `--color-scrim` | `#000000a6` | `#000000a6` | Time chip over a thumbnail — stays dark in both, it sits on an image |

† **Contrast corrections.** These four are not mechanical role swaps:

- Light `--color-text-secondary` is `#6e6e73` (≈ 5.3:1 on white), not the dark palette's `#8e8e93`
  (≈ 3.5:1 on white — fails the 4.5:1 body threshold).
- Light `--color-text-tertiary` takes `#8e8e93` (≈ 3.5:1). **Permitted only for 10–11 pt captions and
  non-essential metadata**, which is what the design uses it for. It MUST NOT be promoted to body
  copy in either appearance — dark `#6e6e73` on `#1a1a1c` is ≈ 3.2:1 and fails the same threshold.
- Light `--color-accent-text` darkens to `#0a63c9`; `#5aa7ff` on a light fill is ≈ 2.1:1.
- Light `--color-danger` darkens to `#d70015`; `#ff5f55` on white is ≈ 3.0:1.

‡ **The measured accent cannot carry white body text.** White on `#2b89fa` is 3.46:1 — comfortably
past the 3:1 icon threshold, and short of the 4.5:1 body threshold that FR-053 sets. The design uses
white-on-accent for both: 18 pt play/pause and 11–12 pt check marks (icons, fine) *and* the 13 pt
"Start" and 12 pt "Apply" labels (text, failing). `--color-accent-strong` (`#1b6fd6`, white at
4.89:1) exists for that second group only. It is identical in both appearances, because the fill
*is* the background — appearance does not change the ratio.

**Two rules follow, and `tests/unit/design-tokens.spec.ts` enforces both:**

1. **Accent-coloured text uses `--color-accent-text`, never `--color-accent`.** Raw accent as a
   12 pt label on white is 3.46:1. This applies to every header text action ("Select All",
   "Edit Presets", "Open Spotify", "Reset Defaults").
2. **A filled accent control uses `--color-accent-strong` if it has a text label**, and
   `--color-accent` if it carries only an icon or is purely decorative.

FR-053 and SC-005 are verified against this table in both appearances by computing ratios, not by
sampling the rendered screenshot.

## Geometry

| Token | Value | Notes |
|---|---|---|
| `--panel-width` / `--panel-height` | `632` / `235` | 1:1 logical points ([R-101](../research.md)) |
| `--radius-panel` | `20` | Replaces today's `12` |
| `--rail-width` | `64` | |
| `--rail-padding` / `--rail-gap` | `12` / `6` | |
| `--rail-item` / `--rail-icon` | `36` / `18` | Item radius `--radius-control` |
| `--content-padding-y` / `--content-padding-x` | `16` / `18` | |
| `--content-gap` | `14` | Between all four bands |
| `--band-header` / `--band-body` / `--band-footer` | `24` / `108` / `28` | Divider is 1 |
| `--header-gap-left` / `--header-gap-right` | `8` / `14` | |
| `--footer-gap` | `10` | |
| `--radius-control` | `12` | Rail items, icon buttons |
| `--radius-chip` | `9` | Presets, key chips, pills |
| `--chip-padding-y` / `--chip-padding-x` | `6` / `12` | |
| `--switch-w` / `--switch-h` / `--switch-knob` | `34` / `20` / `16` | Switch radius `10` |
| `--thumb-w` / `--thumb-h` / `--thumb-gap` | `124` / `88` / `12` | `4 × 124 + 3 × 12 = 532` exactly |
| `--track-height` / `--track-knob` | `4` / `10` | Seek and volume |

**The band arithmetic is a contract, not a coincidence**:
`16 + 24 + 14 + 108 + 14 + 1 + 14 + 28 + 16 = 235`. Any change to a band height or gap must keep this
sum at `--panel-height`, or the panel scrolls and FR-047 breaks.

## Type

Family: the existing `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif` stack.
The design file's Inter is a canvas stand-in ([R-103](../research.md)).

| Token | Size | Weight | Used for |
|---|---|---|---|
| `--text-display` | `48` | 600, line-height 1.05 | Timer readout |
| `--text-title` | `15` | 600 | Section titles, editor title |
| `--text-track` | `17` | 600 | Spotify track title |
| `--text-body` | `12` | 400 | Labels, note titles, option labels |
| `--text-control` | `11.5` | 500 | Button labels, preset labels |
| `--text-meta` | `11` | 400 | Counts, status, key chips |
| `--text-caption` | `10.5` | 400 | Thumbnail filenames, hints |
| `--text-micro` | `10` | 400 | Time chips, group labels, sublabels |

## Motion

| Token | Value |
|---|---|
| `--duration-fast` | `120ms` |
| `--duration-base` | `180ms` |

Animation is opacity-only and confined to `src/renderer/motion/`
([R-115](../research.md)). `prefers-reduced-motion` is honoured by the existing CSS override in
`theme.css` and by `useReducedMotion`.

## Rules

1. **No colour, radius, or spacing literal inside a section component.** Every value resolves to a
   token here. SC-007 audits this; a grep for `#` in `src/renderer/sections/` should return nothing.
2. **The light/dark switch is CSS-only.** No JavaScript, no re-render, no `matchMedia` listener —
   FR-083 falls out of the media query.
3. **One accent across appearances.** `--color-accent` does not change with appearance; only the
   fills and text derived from it do.
4. **Adding a token is a contract change.** It lands in this file and `theme.css` in the same change.
