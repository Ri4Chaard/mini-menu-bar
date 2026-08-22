# Phase 0 Research: Panel UI v2

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-22

Every unknown in the plan's Technical Context is resolved below. Values marked **measured** were read
out of `design/mini-menu-bar-design.pen` with the pen.dev `execute` tool, not estimated from the
rendered image.

---

## R-101: Panel geometry — the frames are 1:1 logical points

**Decision**: The panel becomes **632 × 235 logical points**, replacing today's 460 × 420. The design
frames are taken at face value, not rescaled.

**Rationale**: The type scale settles it. The frames use 15 pt section titles, 12 pt body text,
10–11 pt captions, 18 pt rail icons, and 36 pt rail buttons — all macOS-native sizes at 1×. Halving
them for a 2× reading gives 7.5 pt titles, which is not a legible interface. The vertical arithmetic
confirms it independently:

```
content padding (16 × 2)        32
header band                     24
gap                             14
body band                      108
gap                             14
divider                          1
gap                             14
footer band                     28
                              ----
                               235  = frame height exactly
```

A frame that resolves to its stated height to the point was laid out in the units it will ship in.

**Alternatives considered**: Treating the frames as 2× (≈316 × 118). Rejected — illegible type, and
the padding arithmetic would land on half-points throughout.

**Consequence**: The panel gets 37% wider and 44% shorter. `src/main/index.ts:60-61` changes from
`{ width: 460, height: 420 }` to `{ width: 632, height: 235 }`. On a 1280-wide laptop display a
632 pt panel anchored under a tray item near the right edge still fits; `menubar` already clamps
horizontal placement to the display's work area, so no new positioning logic is required.

---

## R-102: Design tokens — measured, not eyeballed

**Decision**: Adopt the measured values below verbatim as the token set. Full table in
[contracts/design-tokens.md](./contracts/design-tokens.md).

| Token | Measured value |
|---|---|
| Panel corner radius | 20 |
| Rail width / padding / gap | 64 / 12 / 6 |
| Rail button / icon | 36 × 36, radius 12 / 18 × 18 |
| Rail right border | `#ffffff0f`, 1 pt |
| Content padding / gap | 16 vertical, 18 horizontal / 14 |
| Band heights | header 24, body 108, divider 1, footer 28 |
| Header inner gaps | left group 8, right group 14 |
| Footer group gap | 10 |
| Chip padding / radius | 6 vertical, 12 horizontal / 9 |
| Switch / knob | 34 × 20, radius 10 / 16 |
| Surface / rail / divider | `#1a1a1c` / `#141416` / `#ffffff14` |
| Accent / accent subtle / accent border | `#2b89fa` / `#2b89fa26` / `#2b89fa8c` |
| Text primary / secondary / tertiary | `#f2f2f5` / `#8e8e93` / `#6e6e73` |
| Danger / danger subtle | `#ff5f55` / `#ff453a1f` |

**Rationale**: The constitution forbids per-component colour literals and requires tokens declared
once. Reading them out of the design file rather than sampling the screenshot removes the round-trip
error that produces "nearly right" palettes.

**Note**: The existing `theme.css` accent is `#2f6feb` (light) / `#4f8bff` (dark). Both are replaced
by `#2b89fa`; the design uses one accent across appearances.

---

## R-103: Typeface — system stack, not Inter

**Decision**: Keep the existing `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui`
stack. Do not ship Inter.

**Rationale**: Inter in the design file is a canvas stand-in for "a neutral UI sans" — pen.dev has no
access to SF Pro. On the actual target, SF Pro *is* the native UI face, it costs 0 KB against the
500 KB payload budget (Principle V), and it is what every adjacent menu bar surface renders in
(Principle III: "behaving unlike the surrounding OS is the fastest way to feel broken"). Inter's
metrics are close enough to SF that the measured sizes transfer without relayout.

**Alternatives considered**: Bundling Inter as a subset woff2 (~25–40 KB). Rejected — pays payload
for a worse match to the platform.

---

## R-104: Light appearance derived from the drawn dark design

**Decision**: Derive the light palette by inverting token *roles*, not by algorithmically inverting
hex values. Layout, spacing, type, and radii are identical across appearances; only the palette
differs. Both are emitted from one `@theme` block switched by `prefers-color-scheme` — no JavaScript,
satisfying FR-083 and the constitution's styling clause.

| Role | Dark (drawn) | Light (derived) |
|---|---|---|
| Panel surface | `#1a1a1c` | `#ffffff` |
| Rail surface | `#141416` (darker than content) | `#f0f0f3` (darker than content) |
| Hairline | `#ffffff14` | `#00000014` |
| Text primary | `#f2f2f5` | `#1c1c1e` |
| Text secondary | `#8e8e93` | `#6e6e73` |
| Text tertiary | `#6e6e73` | `#8e8e93` |
| Accent | `#2b89fa` | `#2b89fa` (unchanged) |
| Accent subtle | `#2b89fa26` | `#2b89fa1f` |
| Danger | `#ff5f55` | `#d70015` |

**Rationale**: The rail's defining property is that it is *recessed relative to the content* (FR-049).
Inverting hex values would make it lighter than the content and break that relationship. Role
inversion preserves the design's structure. The accent holds at `#2b89fa` because it already clears
4.5:1 against both `#ffffff` and `#1a1a1c` for non-text use and reads as the same brand mark in both.

**Contrast check (FR-053, SC-005)**: `#8e8e93` on `#1a1a1c` is ≈ 5.1:1 — passes for body text.
`#6e6e73` on `#1a1a1c` is ≈ 3.2:1 — **fails** the 4.5:1 body threshold. Tertiary text is therefore
restricted to 10–11 pt captions and non-essential metadata, which the design already does, and the
implementation must not promote it to body copy. Light-mode `#8e8e93` on `#ffffff` is ≈ 3.5:1 and
**fails**; light secondary is lightened to `#6e6e73` (≈ 5.3:1) as recorded in the table above. This
is the one place where the light palette is not a mechanical role swap, and the reason is contrast.

**Alternatives considered**: Dark-only, dropping the light palette. Rejected by the user (Q3 → B),
and independently blocked by Principle III, which requires both appearances.

---

## R-105: Overflow strategy — the body scrolls, the panel never does

**Decision**: The body band is a fixed 108 pt. Each section handles its own overflow inside that
band: the screenshot strip scrolls horizontally, the note list and note editor scroll vertically.
The header, divider, and footer bands never move, and the panel itself never scrolls (FR-047).

**Rationale**: A menu bar panel that changes height as content arrives is the failure mode Principle
III exists to prevent. Fixing the bands and containing overflow per-section keeps the panel a
constant, predictable object.

**Measured capacity**: content width 532, thumbnail 124, gap 12 → `4 × 124 + 3 × 12 = 532`. Exactly
four thumbnails fit with no partial fifth. Beyond four the strip scrolls horizontally, most recent
first, and the header pill shows the full count so the user knows more exist (FR-059).

---

## R-106: Screenshot selection is renderer-owned and ephemeral

**Decision**: Selection lives in `useState` in the Screenshots section. It is not persisted, not sent
across the bridge as state, and is cleared when the panel closes. Only the resulting *action* crosses
the boundary, carrying an array of ids.

**Rationale**: Principle II's boundary is data-in/data-out for capabilities the browser cannot
provide. "Which thumbnails are highlighted" is not such a capability. Persisting it would also
violate the constitution's state clause — derived state that can be recomputed (as empty) at startup
must not be persisted.

**Reconciliation rule**: when `screenshots:changed` arrives, selected ids that no longer exist in the
new list are dropped. Without this, deleting a file outside the app leaves a phantom in the selection
count and Copy acts on a missing path.

---

## R-107: Copying screenshots to the clipboard

**Decision**: One selected screenshot → write it as an **image** (`clipboard.write({ image })` via
`nativeImage.createFromPath`). Two or more → write the **file references** as a newline-joined
`text/uri-list` of `file://` URLs alongside a plain-text path list.

**Rationale**: The macOS pasteboard holds one image at a time, so "copy 4 screenshots as images" has
no faithful representation. Copying a single shot as an image is what makes the feature useful —
paste straight into Slack, Mail, or Figma. For a multi-selection the user's intent is almost always
"put these files somewhere", which file references serve correctly. Electron exposes both without a
native module.

**Alternatives considered**: Always copying file references. Rejected — the single-screenshot case is
the common one and pasting a file path into a chat window is not what the user asked for. Writing
`NSFilenamesPboardType` directly via `clipboard.writeBuffer` with a serialised plist. Rejected —
requires hand-rolling plist encoding for a marginal fidelity gain over `text/uri-list`.

**Boundary note**: the renderer sends ids. Main resolves ids to paths against its own store. No
filesystem path is ever accepted from the renderer (constitution, Security).

---

## R-108: Deleting screenshots — Trash, not unlink

**Decision**: `shell.trashItem(path)` for each selected id, then reconcile the store and emit
`screenshots:changed`.

**Rationale**: Deletion is user-initiated and irreversible-looking; `trashItem` makes it recoverable
in Finder and matches what every other macOS app does with Delete. It also avoids needing a
confirmation dialog inside a panel that dismisses on focus loss — a modal over a non-activating
panel is a poor interaction and `trashItem` makes it unnecessary.

**Alternatives considered**: `fs.unlink`. Rejected — unrecoverable, and would demand a confirmation
step the panel cannot host well.

---

## R-109: Spotify volume, shuffle, and repeat via AppleScript

**Decision**: All three are reachable through the existing `runSpotifyScript` helper with no new
dependency and no network access.

| Control | Spotify AppleScript property | Type |
|---|---|---|
| Volume | `sound volume` | integer 0–100, read/write |
| Shuffle | `shuffling` | boolean, read/write |
| Repeat | `repeating` | **boolean**, read/write |

These fold into the existing single-round-trip `STATE_SCRIPT` as three additional fields rather than
three extra `osascript` spawns, keeping the poll cost flat (Principle V).

**Consequence — repeat is a toggle, not a cycle**: FR-068 says "cycle repeat", which implies the
three-state off → all → one that the Spotify *client UI* offers. The scripting interface exposes only
a boolean. Repeat therefore ships as an on/off toggle. **This requires a spec amendment** — recorded
in the plan's Constitution Check and applied to FR-068.

**Locale hazard**: `sound volume` is an integer, so it does not hit the decimal-separator bug that
`player position` did (see `applescript.ts`). It still goes through the existing `toNumber` guard.

---

## R-110: Spotify "Like" is not implementable within the constitution

**Decision**: **Drop the Like control from scope.** The heart affordance in the design frame is not
built.

**Rationale**: The Spotify desktop AppleScript dictionary exposes no writable "liked"/"saved"
property. The `starred` property on the track class is a vestige of the retired Starred-playlist
feature, is read-only, and does not reflect Liked Songs. The only real route is the Spotify Web API,
which requires OAuth, a registered application, a token store, and outbound HTTPS on every toggle —
directly against the constitution's Privacy clause ("No network calls… without an explicit approved
spec entry") and against feature 001's standing promise that Spotify control works offline with no
account.

Adding an account and a network dependency to gain one heart icon is not a trade this feature should
make on its own authority.

**This requires a spec amendment** to FR-068 — recorded in the plan's Constitution Check.

**Alternatives considered**: Rendering the heart as a permanently disabled control. Rejected — a
control that never does anything is worse than its absence. Repurposing the slot for "Open track in
Spotify". Deferred; the header already carries an "Open Spotify" action.

---

## R-111: Album art requires one declared outbound request

**Decision**: Fetch album art from the `artwork url` the Spotify AppleScript dictionary exposes on
the current track, **in the main process**, cache it in memory keyed by track, and pass it to the
renderer as a data URL. This is an outbound network request and is declared explicitly in the spec.

**Rationale**: FR-064 requires album art, and it is the visual anchor of the whole Spotify frame.
There is no local source: Spotify stores artwork in its own cache in an undocumented layout, and the
scripting interface hands back an `https://i.scdn.co/...` URL, not image bytes.

**Constraints that make this acceptable**, all enforced in the main process:

- Image bytes only, to `i.scdn.co`. No cookies, no credentials, no headers identifying the user.
- Requested only when the Spotify section is open or its menu bar preview is on — the same
  demand-driven gate that governs playback polling (Principle V).
- One request per distinct artwork URL per session; the in-memory cache serves repeats.
- Failure is silent and non-blocking: the art slot falls back to a neutral placeholder and the rest
  of the section renders normally. No retry storm.
- The renderer never issues the request and never sees the URL, only the resulting data URL — the
  boundary stays data-in/data-out.

**This requires a spec amendment** adding the declaration — recorded in the plan's Constitution Check.

**Alternatives considered**: Ship a placeholder and no real art. Rejected — it guts the section's
design and the user chose the design-faithful option in Q1. Read Spotify's on-disk cache. Rejected —
undocumented, version-fragile, and a worse privacy story than one anonymous image GET.

---

## R-112: Timer presets become persisted preferences

**Decision**: Add `timerPresets: number[]` to `Preferences`, defaulting to
`[60_000, 300_000, 600_000, 1_500_000]` — the 1m / 5m / 10m / 25m drawn in the frame, which are also
today's hard-coded `PRESETS` in `timer-section.tsx`. Adding a preset appends; the list is sorted
ascending, de-duplicated, and capped at 8.

**Rationale**: FR-063 requires user-added presets, which makes the list user data rather than a
constant. It rides the existing `prefs:update` channel, so no new IPC surface is needed for it.

**Validation**: each entry is an integer in [1_000, 86_400_000]. The cap at 8 is a layout constraint
— the presets row is 237 pt wide and cannot hold more without wrapping, which the fixed body height
forbids.

---

## R-113: Settings secondary actions

**Decision**:

| Action | Implementation |
|---|---|
| Reset Defaults | `prefs:update` with `DEFAULT_PREFERENCES`; re-registers the timer shortcut |
| Updates | `shell.openExternal` to the releases page in the user's browser |
| Quit | new `app:quit` channel → `app.quit()` |

**Rationale**: "Updates" as an *in-app* update check would be an undeclared outbound request. Opening
the releases page hands the request to the user's browser instead — the app makes no network call,
the user sees exactly where they are going, and no version-comparison logic or update channel needs
to exist. `app.quit()` needs a channel because the app runs as an accessory with no Dock icon and no
menu bar Quit item; without it there is no way out but Activity Monitor.

---

## R-114: The footer toggle and the Settings checkbox are one preference

**Decision**: Both write `previews.<section>` through the existing `prefs:update`. The footer toggle
is rendered by the shared section chrome, driven by `SectionDefinition.supportsPreview` from
`src/renderer/sections/registry.ts`, so Notes and Settings cannot grow one by accident.

**Rationale**: FR-077 to FR-080. The registry already encodes exactly this fact and already carries
the comment explaining why (feature 001, FR-028). Deriving the toggle from it rather than hard-coding
per section is what keeps them from drifting — and is why the `Settings Widget v2` frame's stray
switch cannot be reproduced in code even by mistake.

**Preferences state is lifted to `App`** (it already is), so flipping the switch in the Spotify
footer re-renders the Settings checkbox with no extra wiring.

---

## R-115: Section switch animation

**Decision**: Keep the existing `useFadeIn` cross-fade on section change, confined to
`src/renderer/motion/`. Do not animate the rail, the band structure, or the footer — only the body
content cross-fades.

**Rationale**: FR-046 requires the chrome to stay fixed; animating it would read as the whole panel
redrawing. Opacity is compositor-friendly as Principle V requires. `prefers-reduced-motion` is already
handled twice over — `useReducedMotion` in `motion/index.tsx` and the CSS override in `theme.css`.

---

## R-116: Payload budget

**Decision**: No new runtime dependency. Estimated renderer delta **+18 to +25 KB uncompressed**
against the ~310 KB baseline from feature 001, leaving ~165 KB of headroom under the 500 KB gate.

**Breakdown**: five rebuilt section bodies plus shared chrome ≈ +15 KB of JSX and logic; roughly six
additional `lucide-react` named imports (shuffle, repeat, volume, check, plus, more) ≈ +2 KB
tree-shaken; expanded token block ≈ +1 KB of CSS; no new packages.

**Gate**: `scripts/check-bundle-size.mjs` already fails the build above the threshold. The
implementation reports the measured number rather than this estimate.

---

## R-117: Pointer-drag controls in a non-activating panel

**Decision**: Implement the seek bar and volume slider as native `<input type="range">` styled with
the token set, not as custom pointer-event widgets.

**Rationale**: The panel window is non-activating, which historically makes hand-rolled
`pointerdown`/`pointermove` capture unreliable — the first click can be swallowed by activation
handling. A native range input gets correct drag behaviour, keyboard operation (arrows, Home, End),
and an accessible role for free, which is what FR-048 and SC-004 require. Styling it to match the
drawn 4 pt track and 10 pt knob is pure CSS.

**Seek commit rule**: fire `seekTo` on release (`change`), not continuously on `input`. Each seek is
an `osascript` spawn; firing per pointer-move would spawn dozens of processes per drag. The rendered
position follows the drag locally while the drag is in progress.

---

## Summary of resolved unknowns

| ID | Unknown | Resolution |
|---|---|---|
| R-101 | Panel size | 632 × 235, frames are 1:1 |
| R-102 | Token values | Measured from the .pen file |
| R-103 | Typeface | System stack, not Inter |
| R-104 | Light palette | Role inversion, two contrast corrections |
| R-105 | Overflow | Bands fixed, per-section internal scroll |
| R-106 | Selection model | Renderer-owned, ephemeral, reconciled |
| R-107 | Copy | Image for one, file references for many |
| R-108 | Delete | `shell.trashItem` |
| R-109 | Volume/shuffle/repeat | AppleScript; repeat is boolean |
| R-110 | Like | Not implementable — dropped, spec amendment |
| R-111 | Album art | Declared outbound request, main-process only |
| R-112 | Timer presets | New persisted preference |
| R-113 | Settings actions | Reset / openExternal / new quit channel |
| R-114 | Toggle sync | One preference, derived from the registry |
| R-115 | Animation | Existing cross-fade, body only |
| R-116 | Payload | +18–25 KB, no new dependency |
| R-117 | Drag controls | Native range inputs, seek on release |

No NEEDS CLARIFICATION remain.
