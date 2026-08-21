# Phase 0 Research: Menu Bar Hub

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-21

Resolves every NEEDS CLARIFICATION in the plan's Technical Context, plus best-practice questions
raised by the chosen stack and the macOS integrations.

---

## R-001: Shell scaffolding — `menubar` package vs. hand-rolled Tray + BrowserWindow

**Decision**: Use the `menubar` package (v9.5.3, actively maintained — last publish ~2 weeks before
this plan), configuring its `browserWindow` options explicitly for the constitution's security
requirements.

**Rationale**: It solves panel positioning relative to the tray item, show/hide lifecycle, and
blur-dismiss — three fiddly behaviours that FR-002 requires and that are easy to get subtly wrong.
It exposes `.app`, `.tray`, and `.window`, so the composed tray preview (R-005) and custom window
options remain fully under our control. Its `windowPosition: 'trayCenter'` handles multi-display and
notch geometry.

**Constraints it imposes**: `menubar` creates the `BrowserWindow`, so `webPreferences`
(`sandbox`, `contextIsolation`, `nodeIntegration`, `preload`) MUST be passed through its
`browserWindow` option rather than set afterwards. The window is *hidden*, not destroyed, on
dismiss — which drives R-006.

**Alternatives considered**:
- *Hand-rolled `Tray` + frameless `BrowserWindow`*: total control, zero dependency (better for
  Principle V), but re-implements positioning maths and blur-dismiss edge cases. Rejected as
  avoidable work with a real correctness risk. Revisit if `menubar` blocks the tray composition.
- *`electron-menubar`*: deprecated by its author. Rejected.
- *`electron-tray-window`*: smaller community, no clear advantage. Rejected.

---

## R-002: Build toolchain — electron-vite

**Decision**: `electron-vite` with React + TypeScript, three build targets: `main`, `preload`,
`renderer`.

**Rationale**: It models exactly the three-role process split the constitution mandates, gives HMR on
the renderer, and — critically for Principle I — the renderer is a normal Vite app that can be served
standalone in a browser (R-011).

**Sandbox constraint (important)**: With `sandbox: true`, the preload script MUST be built as
**CommonJS**, and its dependencies MUST be bundled rather than externalised (no `externalizeDepsPlugin`
on the preload target). A sandboxed preload also has no general Node access — only a polyfilled
subset around `ipcRenderer`. This is a *feature* for us: it makes "no business logic in preload"
(constitution, Process model) mechanically enforced rather than merely agreed.

**Alternatives considered**: Electron Forge + Vite plugin (heavier config, packaging opinions we do
not need yet); Webpack (slower, no advantage here).

---

## R-003: Screenshot discovery — Spotlight backfill + FSEvents watch

**Decision**: Two complementary mechanisms.

1. **Backfill (startup + manual refresh)**: query Spotlight for
   `kMDItemIsScreenCapture == 1`, sorted by content-creation date, capped at the 50 most recent
   (spec assumption).
2. **Live detection**: an FSEvents-backed directory watch on the configured screenshot save
   location, read from `defaults read com.apple.screencapture location` (unset ⇒ `~/Desktop`), plus
   `~/Desktop` when that is not already the configured location. New image files are confirmed as
   screenshots by reading their `kMDItemIsScreenCapture` attribute.

**Rationale**: This is the finding that most improves the feature. `kMDItemIsScreenCapture` is set by
macOS when the file is written, applies on 10.8+, and **survives renaming and moving**. That means
the backfill finds screenshots *wherever they ended up* — which is literally the user's stated core
problem ("saved to some folder I forget about"), not just the folder we happen to watch. The FSEvents
watch then gives sub-second latency for new captures (SC-002 requires < 3 s) and is push-based, so it
costs no CPU while idle (SC-011).

**Read-only compliance**: Both mechanisms only read. Nothing is moved, renamed, or written, per
FR-014a.

**Location changes (FR-014b)**: Re-read the `com.apple.screencapture` default on app focus and on
`powerMonitor` resume, and re-point the watcher if it changed.

**Alternatives considered**:
- *`mdfind -live`* (long-running Spotlight query that streams updates): would catch screenshots saved
  anywhere, not just watched folders. Attractive, but requires parsing a quirky update protocol from
  a persistent child process. Documented as the fallback if FSEvents proves unreliable.
- *Polling the directory on a timer*: violates the 0%-idle-CPU budget. Rejected.
- *Filename-pattern matching* (`Screenshot 2026-...png`): the pattern is localised and breaks on
  rename. Rejected in favour of the metadata attribute.

---

## R-004: Timer lives in the main process — not the renderer

**Decision**: The countdown is owned by the main process and is defined by an **absolute deadline
timestamp**, not by accumulating ticks. The renderer receives state and renders it; it never owns the
clock.

**Rationale**: Two independent reasons, both of which would otherwise produce bugs that only appear
after shipping:

1. **`backgroundThrottling`** is on by default for `BrowserWindow`s. Because `menubar` *hides* the
   panel window rather than destroying it (R-001), a renderer-owned `setInterval` gets throttled to
   roughly once a minute while the panel is closed. FR-017 ("timer MUST continue running while the
   panel is closed") would silently fail. Disabling `backgroundThrottling` would "fix" it at the cost
   of the idle-CPU budget — the wrong trade.
2. **Sleep (FR-020)**: any tick-accumulating timer loses the time the machine was asleep. A stored
   deadline compared against `Date.now()` is correct across sleep for free.

**Wake handling**: subscribe to `powerMonitor`'s `resume`; on wake, if the deadline has passed, fire
the completion notification immediately (spec edge case: "a timer that expired during sleep notifies
on wake").

**Ticking for display**: main emits a state event at most once per second, and **only** while either
the panel is open on the Timer section or the Timer preview is enabled. When neither is true, the
timer holds a single `setTimeout` to its deadline and emits nothing.

---

## R-005: Menu bar preview composition — one tray item, composed content

**Decision**: A single `Tray` instance. Its **image** slot carries the latest screenshot thumbnail
(when that preview is on, otherwise the app icon) and its **title** slot carries a composed string
assembled from the enabled text previews, in fixed order: unseen-count · timer remaining · track name.

**Rationale**: FR-001 requires exactly one menu bar item; multiple `Tray` instances would violate it
and would also produce exactly the menu bar clutter the user is trying to control. `Tray.setTitle()`
is macOS-only, which is fine — macOS is the only target.

**Width budget (FR-035, SC-010)**: The composed title is truncated to a fixed character budget per
segment (track names are the offender), with the whole string capped. Truncation happens in the main
process during composition, so no renderer involvement.

**Thumbnail generation**: `nativeImage.createThumbnailFromPath()` produces the tray-sized image;
mark it `setTemplateImage(false)` since screenshots are full-colour, and size to the menu bar height
at the display's scale factor.

**Alternatives considered**: one `Tray` per enabled preview (maps cleanly onto independent toggles,
but breaks FR-001 and multiplies clutter); rendering previews into an offscreen `BrowserWindow` and
capturing to a `nativeImage` (full styling control, but an always-alive renderer contradicts the idle
budget). Both rejected.

---

## R-006: Animation — `motion` with LazyMotion, and the fallback trigger

**Decision**: Use `motion` (the package formerly published as `framer-motion`; imports come from
`motion/react`), loaded via `LazyMotion` + the `m` component with the `domAnimation` feature set.
Restricted to transient enter/exit transitions on panel open, section switch, and list insertion.

**Rationale for keeping it** — the user's hedge was "if it will affect our hardware performance too
much then lets use native css", so this is a measured answer rather than a preference:

- **Bundle**: `LazyMotion` + `m` ships ~4.6 KB initially, ~15 KB gzipped with the animation feature
  set loaded — versus ~30 KB gzipped for the full import. Comfortably inside the payload budget.
- **Idle cost is structurally zero**: every animation is transient and runs only while the panel is
  *visible*. The panel is hidden whenever the user is not looking at it, and Chromium throttles
  hidden windows. The idle-CPU budget (SC-011) is therefore unaffected by this choice — the thing
  that would break it is a *looping* animation, which is banned below regardless of library.
- The menu bar previews are native tray rendering (R-005), so no animation library touches the
  always-on surface at all.

**Rules that make this safe** (these matter more than the library choice):
- No infinite or looping animations anywhere. No animated spinners that persist; use static or
  CSS-only indicators.
- Animate only compositor-friendly properties: `transform` and `opacity`.
- Honour `prefers-reduced-motion` via Motion's `useReducedMotion`, per constitution Principle III.

**Fallback trigger (explicit, so this is decidable rather than argued)**: drop to CSS transitions if
either measurement fails — panel open-to-interactive exceeds 100 ms (constitution Principle V), or
idle CPU with the panel closed is measurably above 0%. Because usage is confined to a handful of
wrapper components behind a single `motion/` module, the swap is a contained change, not a rewrite.

**Alternatives considered**: pure CSS transitions (zero bytes, entirely sufficient for what we need —
this remains the fallback); `Motion One` / `AutoAnimate` (smaller, but a third animation vocabulary to
learn for marginal gain).

---

## R-007: Spotify control — AppleScript via `osascript`, adaptively polled

**Decision**: Drive the Spotify desktop app through AppleScript executed by `osascript` from the main
process. Read `player state`, `current track` (name, artist, duration), and `player position`; write
`playpause`, `next track`, `previous track`, and `set player position to`.

**Consent requirement**: Controlling another app via Apple Events is gated by macOS TCC. The app
bundle MUST declare `NSAppleEventsUsageDescription` in `Info.plist`, and the user gets a one-time
consent prompt. Denial is a first-class state, not an error: FR-025 requires a clear inactive state,
and "permission denied" must be distinguishable from "Spotify isn't running".

**Polling policy (protects SC-011)**: poll `player position` at ~1 s **only** while the panel is open
on the Spotify section. Poll track/state at ~2 s only while the Spotify preview is enabled. With the
panel closed and the preview off, polling stops entirely — no timers, no child processes.

**Alternatives considered**:
- *Spotify Web API*: gives richer data but requires OAuth, network access, and a Premium account for
  playback control — contradicting FR-037/FR-038 (local-only, no account). Rejected.
- *`NSDistributedNotificationCenter` on `com.spotify.client.PlaybackStateChanged`*: event-driven and
  strictly better than polling, but needs a native module or a helper binary. Recorded as a future
  optimisation once the polling version is measured.

---

## R-008: Styling — Tailwind CSS v4, tokens as CSS variables

**Decision**: Tailwind CSS v4 with its CSS-first configuration. Appearance tokens are declared once as
CSS custom properties and switched under `prefers-color-scheme`; components reference tokens only.

**Rationale**: Satisfies the constitution's "appearance tokens MUST be defined once… no per-component
colour literals" directly — Tailwind's `@theme` block becomes the single source of truth, and the
generated CSS is scoped to classes actually used, keeping output small.

**Note**: Because tokens are CSS variables, the light/dark switch requires no JavaScript and no
re-render, which satisfies the spec edge case "appearance switches while the panel is open".

---

## R-009: Icons — `lucide-react`, named imports only

**Decision**: `lucide-react`, imported per-icon by name (`import { Camera } from 'lucide-react'`).

**Rationale**: Named imports tree-shake to only the icons used; the expected set is ~15–20 icons, a
few KB total. Barrel/dynamic imports would pull the whole set and blow the payload budget — so this is
a lint-enforceable rule, not a style preference.

---

## R-010: Local persistence — hand-rolled JSON store

**Decision**: Notes and preferences persist as JSON files under `app.getPath('userData')`, written
atomically (write to a temp file, then rename).

**Rationale**: Principle V sets runtime dependencies to zero by default and asks why hand-writing is
worse. For two small documents it is not worse — this is roughly 60 lines, and atomic rename is the
whole trick. The screenshot index is *not* persisted; it is derived from Spotlight on each launch
(R-003), so the only durable state is notes, preferences, and the unseen-screenshot watermark.

**Alternatives considered**: `electron-store` (a dependency for something this small); SQLite (vastly
over-specified for a handful of notes).

---

## R-011: Browser-runnable renderer — how Principle I stays enforceable

**Decision**: The renderer talks to exactly one module, `host-contract.ts`, with two implementations:
`host-bridge.ts` (reads the preload-exposed global) and `host-mock.ts` (in-memory fixtures). Selection
is by capability detection at startup. `npm run dev:browser` serves the renderer alone on the Vite dev
server, where the mock is selected and the entire UI is exercisable in Chrome.

**Rationale**: This is what keeps the constitution's central claim true after the stack change. React
and TypeScript do not compromise it — a Vite renderer is still a plain web page. What would compromise
it is Electron APIs reaching into components, which the single-module boundary plus a lint rule
banning `window.__hostBridge` outside `src/renderer/host/` prevents mechanically.

**Testing consequence**: the same contract test suite runs against both implementations, satisfying
constitution Principle II and Principle IV.

---

## R-012: Global shortcut registration

**Decision**: Electron `globalShortcut` for timer start/pause, with a default binding, user-rebindable
from the Settings section, persisted with preferences.

**Failure mode that must surface**: `globalShortcut.register()` returns `false` when another
application already owns the combination. Silently ignoring that is the obvious bug here — FR-019
requires the shortcut to work, so a failed registration MUST be shown in the Timer/Settings UI with a
prompt to choose another binding.

---

## Payload budget check (constitution Principle V: < 500 KB uncompressed)

| Item | Est. uncompressed |
|---|---|
| React + React DOM (production) | ~150 KB |
| `motion` via LazyMotion + `m` (`domAnimation`) | ~45 KB |
| `lucide-react`, ~20 named icons | ~10 KB |
| Tailwind generated CSS | ~25 KB |
| Application code | ~80 KB |
| **Estimated total** | **~310 KB** |

Fits, with roughly 40% headroom — but this is an estimate, and Principle V makes it a gate. A build
step MUST report the renderer bundle size and fail the build above 500 KB, so the budget is enforced
rather than assumed.

---

## Summary of resolved unknowns

| ID | Question | Resolution |
|---|---|---|
| R-001 | Menu bar scaffolding | `menubar` v9.5.3, security options passed through |
| R-002 | Build toolchain | electron-vite; preload built as CJS for `sandbox: true` |
| R-003 | Screenshot discovery | Spotlight `kMDItemIsScreenCapture` backfill + FSEvents watch |
| R-004 | Timer ownership | Main process, absolute deadline (throttling + sleep correctness) |
| R-005 | Preview rendering | One tray: image slot + composed, truncated title slot |
| R-006 | Framer Motion viability | Keep as `motion` + LazyMotion; explicit fallback trigger defined |
| R-007 | Spotify integration | `osascript` AppleScript, adaptive polling, TCC consent state |
| R-008 | Styling | Tailwind v4, CSS-variable tokens, no-JS dark mode |
| R-009 | Icons | `lucide-react` named imports only |
| R-010 | Persistence | Hand-rolled atomic JSON store in `userData` |
| R-011 | Browser-runnable core | Single host module, mock implementation, `dev:browser` script |
| R-012 | Global shortcut | `globalShortcut`, rebindable, registration failure surfaced |

## Sources

- [menubar — npm](https://www.npmjs.com/package/menubar)
- [max-mapper/menubar — GitHub](https://github.com/max-mapper/menubar)
- [Tray Menu — Electron docs](https://www.electronjs.org/docs/latest/tutorial/tray)
- [Using Preload Scripts — Electron docs](https://www.electronjs.org/docs/latest/tutorial/tutorial-preload)
- [Motion & Framer Motion upgrade guide](https://motion.dev/docs/react-upgrade-guide)
- [Reduce bundle size of Framer Motion](https://motion.dev/docs/react-reduce-bundle-size)
- [LazyMotion — Motion for React](https://motion.dev/docs/react-lazy-motion)
- [electron-vite — Development guide](https://electron-vite.org/guide/dev)
- [electron-vite discussion: sandbox: true](https://github.com/alex8088/electron-vite/discussions/423)
- [How to quickly find all Mac screenshots, no matter their location](https://www.idownloadblog.com/2017/10/03/how-to-find-screenshots-mac/)
- [How to Find All Screen Shots on Mac with a Search Trick](https://osxdaily.com/2017/08/24/find-all-screenshots-mac/)
