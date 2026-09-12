# Phase 0 Research: MVP Scope — Screenshots & Timer

**Feature**: `003-mvp-screenshots-timer` | **Date**: 2026-09-12

Decision identifiers continue the project series (`001` used R-0xx, `002` used R-1xx).

---

<a id="r-201"></a>

## R-201 — How to draw a count badge onto the menu bar image

**Decision**: Composite the badge directly into the thumbnail's raw BGRA bitmap with a pure function
in the main process, then rebuild a `NativeImage` from the mutated buffer.

**Rationale**: FR-109 puts the count *inside the image's top-right corner*, not beside it, which
rules out the cheap answer of `tray.setTitle()`. Of the ways to actually draw, only one survives the
constitution.

This was **probed against Electron 43 rather than assumed**:

```text
createThumbnailFromPath -> size={"width":32,"height":18} scale=[1,2] empty=false
toBitmap              -> 2304 bytes, expected 2304 (BGRA)   ✅ round-trip works
createFromBitmap      -> size={"width":32,"height":18} empty=false
2x createFromBitmap   -> size={"width":32,"height":18} scale=[2]  ✅ retina path works
SVG data URL          -> empty=true size={"width":0,"height":0}   ❌ SVG unsupported
```

The last line is the decisive one: the intuitive approach — compose an SVG string and hand it to
`nativeImage.createFromDataURL` — silently produces an **empty image**. It would have failed at
runtime with no error, showing a blank menu bar item.

A 32×18 image is 2304 bytes; writing a badge touches at most a few hundred of them. The work is
trivial and happens only on the existing tray-refresh path.

**Alternatives considered**:

- **`tray.setTitle()` text beside the image** — free, but not what FR-109 specifies, and it is what
  the app does today (the behaviour the user asked to change).
- **SVG → `createFromDataURL`** — *rejected on evidence*: unsupported, fails silently.
- **Offscreen `BrowserWindow` with a canvas** — works, but keeps a renderer process alive to draw a
  badge, violating Principle V's "no background work when the panel is closed".
- **An image library (`sharp`, `jimp`, `canvas`)** — a native-module runtime dependency in the main
  process, which the constitution's dependency gate requires justifying against exactly this
  hand-written alternative. ~50 lines of buffer arithmetic is cheaper than the dependency.

---

<a id="r-202"></a>

## R-202 — Rendering digits without a font

**Decision**: Embed a 3×5 pixel bitmap font for the ten digits as a constant table, composited at 2×
(a 64×36 canvas) and tagged `scaleFactor: 2`.

**Rationale**: There is no text rasteriser reachable from a plain-TypeScript main process. Digits are
the only glyphs needed, and 3×5 is the smallest grid at which all ten remain unambiguous. Each digit
is five 3-bit rows — one `number[10][5]` constant.

Scale is what makes this legible. At 1× the tray image is 32×18, leaving roughly 10×6 px for a badge
— not enough for two digits. The probe confirmed a 64×36 bitmap tagged `scaleFactor: 2` presents as
a logical 32×18, which gives the badge ~20×12 real pixels: comfortable for two 3×5 digits plus
padding.

**Counts above 99** render as `99+`, because three digits plus padding exceeds the badge width even
at 2×. `MAX_SCREENSHOTS` is 50, so this is a defensive branch rather than a reachable state — but it
is specified and tested, because a silently clipped digit is worse than a deliberate `+`.

**Alternatives considered**:

- **4×6 or 5×7 fonts** — more legible per glyph, but two digits no longer fit the corner without
  covering the thumbnail.
- **Unicode superscripts / circled numerals** — still requires a rasteriser.
- **Dots instead of digits** — unreadable past three.

---

<a id="r-203"></a>

## R-203 — The count is the total, and the watermark dies

**Decision**: The badge counts every entry the screenshots store lists. The `screenshotsSeenWatermark`
preference, the `screenshots:mark-seen` channel, the `markScreenshotsSeen()` bridge method, and
`unseenCount()` are all deleted.

**Rationale**: Directly from the user's clarification (Q2 → A). "Available" means what the section
lists. Keeping the watermark alongside a total-count badge would leave a persisted field that nothing
reads — dead state that the next reader has to reason about.

This also removes a subtle behaviour: today the badge *changes when you look at it*, because opening
the panel marks entries seen. FR-110 and the US4 acceptance scenario now assert the opposite.

**Alternatives considered**:

- **Keep the watermark for later** — speculative retention of a field with no reader.
- **Total, emphasised while unseen exist** — offered as Q2 option C, not chosen; would have kept the
  whole watermark apparatus for a styling nuance invisible at menu bar size.

---

<a id="r-204"></a>

## R-204 — The empty state, and what the "placeholder" actually was

**Decision**: When no screenshots exist, the tray shows the app's template icon with no badge. The
icon itself is replaced with the wine-glass silhouette.

**Rationale**: The reported "image placeholder" is not a placeholder at all — it is
`resources/trayTemplate.png`, a four-square grid glyph that reads as a broken image. The existing
fallback logic (`model.image ?? defaultImage`) is already correct; the asset was the bug.

This is why the spec's overall items 2 and 3 collapse into one change: replacing the glyph fixes the
empty state *and* gives the app a real identity. No code change is needed in the fallback path — only
the asset, plus a guard that the badge is never composited onto the fallback icon (a count of zero
must not render "0" over the wine glass).

---

<a id="r-205"></a>

## R-205 — Generating the icon assets without a design tool

**Decision**: Author the wine-glass silhouette as a build-time script that emits PNGs with a
hand-rolled encoder over Node's built-in `zlib`, then assemble `icon.icns` with `iconutil`.

**Rationale**: Tool availability was checked on the target machine:

```text
qlmanage yes | sips yes | iconutil yes
rsvg-convert no | convert no | magick no | inkscape no | cairosvg no
node zlib.deflateSync: function
```

No SVG rasteriser is installed, so an SVG source cannot be reliably converted. PNG, by contrast, is
straightforward to emit: IHDR + IDAT (`zlib.deflateSync`) + IEND with CRC32. `iconutil` then builds
the `.icns` from a generated `.iconset` directory, and `sips` handles any resizing.

Being a **build-time** script, this touches neither the runtime dependency baseline nor the renderer
payload. The generated assets are committed, so a contributor without the script can still build.

**Tray icons must be template images** — monochrome plus alpha — so macOS tints them for light and
dark menu bars. This constrains the wine glass to a silhouette, which is recorded as an assumption in
the spec rather than discovered during implementation.

**Alternatives considered**:

- **`qlmanage -t` on an SVG** — produces a thumbnail with no control over padding or alpha.
- **Commit binary PNGs with no generator** — works, but leaves the asset unreproducible and
  un-reviewable in a diff.
- **A font glyph (🍷)** — emoji are colour, not template, and render inconsistently at menu bar size.

---

<a id="r-206"></a>

## R-206 — Click-to-select and double-click-to-open, with no click delay

**Decision**: `click` toggles selection immediately. `dblclick` opens. No timer, no deferral.

**Rationale**: This is normally the messiest interaction in a file browser, because distinguishing
single from double click means delaying the single-click action by ~250 ms — which feels broken.

FR-101 dissolves the problem by specifying that a double-click "MUST leave the selection state
unchanged from what the constituent clicks produced". Two clicks on an unselected thumbnail toggle it
on, then off — net zero — and then `dblclick` opens the file. The user sees selection respond
instantly on every single click, and a double-click opens without disturbing selection.

The naive implementation is therefore the *correct* one. This was a deliberate choice at spec time,
recorded here so it is not "simplified" into a click-delay later by someone who assumes it was an
oversight.

**Alternatives considered**:

- **250 ms deferral to disambiguate** — makes every selection feel laggy, for no gain.
- **Drop opening entirely** — recorded as the spec assumption to revisit; keeps the gesture free but
  removes a capability the user did not ask to lose.

---

<a id="r-207"></a>

## R-207 — Click versus drag on the same element

**Decision**: Rely on the platform contract that a completed drag suppresses the subsequent `click`.
The card frame stays the drag source; the click handler moves onto the same frame.

**Rationale**: Chromium does not fire `click` after a `dragstart`/`drop` sequence on the same
element, so dragging a thumbnail out will not also toggle its selection. This is the behaviour the
current code already depends on implicitly.

**This is the one assumption in the plan that is not probed**, because it needs a real pointer drag.
It is therefore promoted to an explicit manual check in [quickstart.md](./quickstart.md) rather than
being left to be discovered as a bug: *drag a thumbnail out and confirm its selection state is
unchanged on return.* If the assumption fails, the fallback is a small movement threshold in the
click handler, which is a local change to one component.

---

<a id="r-208"></a>

## R-208 — Typed duration entry, and the `Escape` conflict it creates

**Decision**: Make the existing large clock readout editable in place. Click or focus it, type, press
`Enter` to commit. Parsing is a pure function; bounds reuse the existing `MIN_TIMER_PRESET_MS` (1 s)
and `MAX_TIMER_PRESET_MS` (24 h).

**Rationale**: `002` fixed the panel's band arithmetic — `16+24+14+108+14+1+14+28+16 = 235` — and
`tests/unit/design-tokens.spec.ts` asserts that sum against `--panel-height`. Adding a duration field
as a new row would break it. Making the readout itself the input adds no row at all: the display and
the editor are the same 108 pt band.

Accepted formats, resolved by one pure parser: `7` → 7 min, `7:30` → 7 min 30 s, `1:30:00` → 90 min,
`90s`, `2h`. Unparseable input is rejected visibly and leaves the previous duration intact (FR-106).
Out-of-range input clamps rather than rejecting (FR-107), matching how `normalisePresets` already
treats user data on disk.

**The Principle III conflict**: `Escape` is a guaranteed panel-dismissal gesture. Inside a text field
it must instead cancel the edit. The rule is two-stage — **first `Escape` reverts the field and
returns focus to the readout; a second `Escape` dismisses the panel.** This is a genuine change to a
constitutional guarantee, so it is surfaced in the Constitution Check and carries its own quickstart
verification rather than being absorbed silently.

**Alternatives considered**:

- **A separate input row** — breaks the asserted band arithmetic.
- **Stepper buttons** — more clicks than the preset row it replaces.
- **A modal or popover editor** — a second dismissible surface inside a panel that is itself
  dismissed by blur; two competing `Escape` targets is worse than one ordered pair.

---

<a id="r-209"></a>

## R-209 — Migrating preferences that name removed things

**Decision**: Extend the existing `revivePreferences` reviver. `lastSection` of `spotify` or `notes`
falls back to `screenshots`; `previews.spotify` and `screenshotsSeenWatermark` are dropped on read
and never written back. `notes.json` is left on disk.

**Rationale**: The reviver already does exactly this shape of repair — `reviveSection` falls back on
an unknown value, and `normalisePresets` repairs malformed arrays on read as well as write. The
migration is an edit to existing logic, not new machinery.

This is not hypothetical. The developer's own `preferences.json` currently reads:

```json
{ "previews": { "spotify": true, ... }, "lastSection": "spotify", "screenshotsSeenWatermark": 1789208753656 }
```

All three removed fields are populated, so the migration path is exercised on the very first launch
after this change. That makes it a P1 test, not a defensive one.

Leaving `notes.json` in place is deliberate: a scope reduction should not destroy user data. It
becomes unreachable, not deleted.

---

<a id="r-210"></a>

## R-210 — Removing Copy

**Decision**: Delete `src/main/services/screenshots/clipboard.ts`, the `screenshots:copy` channel,
`copyScreenshots()` from the contract, binding and mock, the Copy control, and
`tests/unit/clipboard-mode.spec.ts`.

**Rationale**: The user's clarification (Q1) was to remove the button entirely. Retaining the
main-process clipboard machinery behind a removed control would leave a reachable IPC channel with no
caller — precisely what the constitution's channel enumeration exists to prevent.

**Recorded tension**: this supersedes the user's original request #2, which asked Copy to place
*images* rather than paths. Single-selection copy works correctly today; this drops a working
capability rather than fixing a broken one. The trade was made knowingly because the clipboard holds
one image at a time, making the multi-select case unsatisfiable. Reversing it means restoring one
pure function (`planClipboardWrite`), one channel, and one control.

---

<a id="r-211"></a>

## R-211 — What the Spotify removal buys back

**Decision**: Delete the Spotify service, its AppleScript module, its artwork cache and network
fetch, its nine IPC channels, the `com.apple.security.automation.apple-events` entitlement, and the
`NSAppleEventsUsageDescription` Info.plist key.

**Rationale**: Three constitutional improvements fall out, all measurable:

1. **Privacy** — album-art fetching was the app's only outbound network path. Removing it returns the
   app to genuinely zero network access, which the constitution's Privacy clause prefers.
2. **Security** — the app stops requesting Apple Events access, so macOS never prompts. Nine channels
   leave the enumerated surface.
3. **CPU** — the 2 s `osascript` poll was the single largest consumer measured. Whole-app idle CPU was
   **0.277%** with the Spotify preview enabled (the developer's real configuration), essentially all
   of it in the main process on that loop.

`com.apple.security.cs.allow-jit` is left in place but flagged for review: its comment claims it is
needed because "osascript and mdfind run as child processes", which is not what that entitlement
does. `mdfind` still runs, so removing it is a separate, testable change and is **out of scope here**
rather than bundled in speculatively.

---

<a id="r-212"></a>

## R-212 — Payload and performance expectations

**Decision**: No new budget is requested. The Principle V gates are expected to move favourably, and
the plan commits to measuring rather than assuming.

**Rationale**: Deleting two of five sections, `lucide-react` icons used only by them, and the Spotify
artwork path strictly reduces the renderer bundle from its measured 332.5 KB against
a 500 KB gate. The badge module lives in main and does not count toward that budget at all.

The performance gate from the constitution ("any change touching timers, animation, polling, or the
adapter MUST report measured idle CPU") applies to this feature, since it deletes a poll loop and
changes the adapter. Baseline for the comparison, measured on this machine before the change:

| Metric | Before |
|---|---|
| Idle CPU, previews on | 0.277% (0.18 s over 65 s) |
| Memory, 4 processes | 96.7 MB physical footprint |
| Renderer payload | 332.5 KB of 500 KB gate |

`quickstart.md` carries the re-measurement steps.
