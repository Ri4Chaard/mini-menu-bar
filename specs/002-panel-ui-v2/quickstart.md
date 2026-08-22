# Quickstart & Validation: Panel UI v2

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Runnable checks that prove the feature works. Scenario IDs continue feature 001's sequence (which
ends at V-014) so results from both can be reported together.

## Prerequisites

```bash
npm install
```

macOS with Spotify installed and automation access granted (for V-112…V-115 in host mode only —
every scenario except V-116 and V-117 runs in browser mode against the mock).

## Commands

| Purpose | Command |
|---|---|
| Browser mode — the primary verification surface | `npm run dev:browser` |
| Host mode | `npm run dev` |
| Unit + contract suites | `npm test` |
| End-to-end | `npm run test:e2e` |
| Types | `npm run typecheck` |
| Lint (includes the no-host-globals rule) | `npm run lint` |
| Build + payload gate | `npm run build` |

---

## Shell and navigation

**V-101 — Panel geometry.** Open the panel in host mode. It measures 632 × 235 pt with a 20 pt corner
radius. No scrollbar appears on the panel itself in any section.
*Covers FR-041, FR-047, SC-001. Reference: [R-101](./research.md).*

**V-102 — Band arithmetic.** In DevTools, sum the content column: padding 16, header 24, gap 14, body
108, gap 14, divider 1, gap 14, footer 28, padding 16. It equals 235 exactly. Any drift means a band
was hard-coded off-token.
*Covers FR-044, FR-047. Reference: [contracts/design-tokens.md](./contracts/design-tokens.md).*

**V-103 — Rail.** Five icons, no labels, 36 × 36 at 18 pt icons. Exactly one is active, distinguished
by both background and icon colour. Clicking each switches the body while the rail, band structure,
and footer stay fixed.
*Covers FR-042, FR-043, FR-046, SC-003.*

**V-104 — Header shape.** Every section's header reads: title, status pill, text action, overflow
button — left to right, in that order.
*Covers FR-045.*

**V-105 — Keyboard.** Tab through the whole panel with the pointer unused. Every control is reachable,
focus is always visible, arrow keys move between rail items, and Escape dismisses. Every icon-only
control announces a name in the accessibility inspector.
*Covers FR-048, SC-004.*

---

## Appearance

**V-106 — Both appearances.** Switch System Settings → Appearance between Light and Dark **while the
panel is open**. The palette follows immediately; no layout shift, no reopen, no lost note edit.
*Covers FR-081, FR-082, FR-083.*

**V-107 — No JavaScript in the switch.** Confirm no `matchMedia` listener and no appearance-driven
re-render exists. The switch is a `prefers-color-scheme` media query only.
*Covers the constitution's styling clause.*

**V-108 — Contrast.** Run the contrast check over the token table in both appearances. Body text
clears 4.5:1; large text and meaningful icons clear 3:1. Verify specifically that
`--color-text-tertiary` is used only at 10–11 pt — it fails the body threshold in both appearances by
design and must never carry body copy.
*Covers FR-053, SC-005. Reference: [R-104](./research.md).*

**V-109 — No colour literals.** `grep -rn '#[0-9a-fA-F]\{3,8\}' src/renderer/sections/ src/renderer/components/` returns nothing.
*Covers FR-052, SC-007.*

---

## Screenshots

**V-110 — Strip and capacity.** With 4+ screenshots, exactly four thumbnails fit
(`4 × 124 + 3 × 12 = 532`). Each shows its relative time and filename. A fifth scrolls horizontally;
the header pill shows the full count, not the visible count.
*Covers FR-054, FR-055, FR-059, and the R-105 overflow rule.*

**V-111 — Selection and actions.** Select two thumbnails; the footer reads "2 selected". Select All
selects every entry. Copy places file references on the clipboard; with a single selection it places
the image itself — paste into Preview to confirm. Delete moves the files to the Trash and they are
recoverable in Finder.
*Covers FR-056, FR-057, FR-058. Reference: [R-107](./research.md), [R-108](./research.md).*

**V-112 — Selection reconciliation.** Select three screenshots, then delete one of the files in Finder
while the panel is open. The selection count drops to two and Copy still succeeds.
*Covers the R-106 reconciliation rule — the phantom-selection bug this rule exists to prevent.*

---

## Timer, Spotify, Notes

**V-113 — Timer.** Pick a preset: the readout shows that duration and the chip reads active. Start:
the status line shows the running state and the projected finish time. Add a custom preset — it
persists across a restart, sorts into place, and a duplicate is rejected silently.
*Covers FR-060, FR-061, FR-062, FR-063. Reference: [R-112](./research.md).*

**V-114 — Spotify playback.** With a track playing: album art, title, artist, elapsed, total, and a
correctly positioned progress indicator. The primary transport button flips between play and pause.
*Covers FR-064, FR-065, FR-067.*

**V-115 — Spotify seek and volume.** Drag the seek bar: the position follows the drag locally and
exactly **one** `seekTo` fires on release — confirm no `osascript` storm in Activity Monitor. Volume,
shuffle, and repeat round-trip through the next poll. Repeat is an on/off toggle, not a three-state
cycle.
*Covers FR-066, FR-068 as amended. Reference: [R-109](./research.md), [R-117](./research.md).*

**V-116 — Artwork stays in main.** In host mode, confirm the renderer issues no network request
(DevTools → Network is empty) while art displays. Kill network access: the art slot falls back to a
placeholder and every other field still renders.
*Covers FR-087. Reference: [R-111](./research.md). **Host mode only.***

**V-117 — Notes.** List and editor sit side by side. Selecting a note swaps the editor. Typing saves
with no explicit action; the footer shows the edit time and word count. Delete the open note — the
editor moves to the next, or to an empty state if none remain.
*Covers FR-069, FR-070, FR-071, FR-072.*

---

## Settings and the preview toggle

**V-118 — Two columns.** Menu bar checkboxes left, timer shortcut right, vertical hairline between.
The shortcut renders as one chip per key with Apply beside it. An unavailable shortcut is explained
in place and the previous one is kept.
*Covers FR-073, FR-074, FR-075.*

**V-119 — The toggle appears in exactly three sections.** Screenshots, Timer, and Spotify each show
the preview switch in their footer. **Notes and Settings do not** — Settings shows only the version
and its secondary actions. This is the drafting error in the `Settings Widget v2` frame; a build that
reproduces it fails this scenario.
*Covers FR-077, FR-079. Reference: [R-114](./research.md).*

**V-120 — One preference, two surfaces.** Flip the switch in the Spotify footer, then open Settings:
the Spotify checkbox already shows the new state, and the menu bar preview appeared or disappeared.
Flip it back from Settings and return to Spotify — the footer switch agrees.
*Covers FR-078.*

**V-121 — Toggle copy.** The switch label describes the **menu bar preview**. The design's
"Floating capture bar" sublabel appears nowhere in the build.
*Covers FR-080.*

**V-122 — Secondary actions.** Reset Defaults restores every preference and re-registers the shortcut.
Updates opens the releases page in the default browser and makes no in-app request. Quit exits the
app. The footer shows the version.
*Covers FR-076. Reference: [R-113](./research.md).*

---

## Gates

**V-123 — Payload.** `npm run build` reports the renderer bundle size and stays under 500 KB
uncompressed. Report the measured number, not the R-116 estimate. The build **fails** above the
threshold — a warning does not satisfy the constitution.
*Covers Principle V.*

**V-124 — Idle CPU.** Panel closed, no preview enabled: idle CPU effectively 0%. No `osascript`
process, no timer, no artwork fetch.
*Covers Principle V, demand-driven work.*

**V-125 — Open-to-interactive.** Panel reaches interactive within 100 ms of the tray click; section
switch completes within 150 ms.
*Covers SC-003, Principle V.*

**V-126 — Browser mode completeness.** Every scenario except V-116 runs in `npm run dev:browser`
against the mock, including the failure paths: Spotify unavailable, delete failure, copy with no
resolving id, artwork fetch failure.
*Covers Principle I, FR-085, and the constitution's "a mock that always succeeds proves nothing".*

**V-127 — No host globals.** `npm run lint` passes, including the rule forbidding `require`,
`process`, `ipcRenderer`, and the bridge global outside the adapter module.
*Covers Principle I, II.*

**V-128 — No regression.** Feature 001's V-001…V-014 still pass.
*Covers SC-008.*

---

## Reporting

The constitution requires two things noted in the change description before merge:

1. **Manual ergonomics gate** — Escape, blur-dismiss, toggle, keyboard focus, both appearances,
   reduced motion (V-103, V-105, V-106).
2. **Performance gate** — measured idle CPU and open-to-interactive latency (V-124, V-125), required
   because this feature touches the adapter and the polling script.
