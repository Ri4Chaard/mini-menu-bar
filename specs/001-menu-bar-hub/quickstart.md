# Quickstart & Validation Guide: Menu Bar Hub

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-21

How to run the app in both of its modes, and the scenarios that prove each user story works. This is
a validation guide — implementation belongs in `tasks.md`.

## Prerequisites

- macOS (the only target platform; several checks below are macOS-specific)
- Node.js 22 LTS or newer, npm 10+
- Spotify desktop app installed — required only for the Spotify scenarios
- At least three existing screenshots somewhere on disk, for the backfill check

## Setup

```bash
npm install
```

## Two run modes

The app runs in two modes on purpose. Browser mode is not a convenience — it is how constitution
Principle I stays verifiable, and V-001 below tests it.

| Command | Mode | Host bridge | What it proves |
|---|---|---|---|
| `npm run dev:browser` | Renderer only, in Chrome | `host-mock.ts` | The UI is a plain web app |
| `npm run dev` | Full Electron app | `host-bridge.ts` | Real macOS integration |
| `npm run build` | Production bundle | — | Payload budget gate |
| `npm test` | Vitest: unit + contract | both | Contract parity |
| `npm run test:e2e` | Playwright against Electron | real | End-to-end behaviour |

On first `npm run dev`, macOS will prompt for automation access when the Spotify section is first
opened. Grant it, or use the denial to check the `permission-denied` state (V-010).

---

## Validation scenarios

Each maps to a user story or success criterion in [spec.md](./spec.md). Run them in order; V-001
first, because if it fails the architecture is wrong regardless of what else works.

### V-001 — The core runs as a plain web app *(constitution Principle I)*

1. `npm run dev:browser`, open the printed URL in Chrome.
2. **Expect**: the panel UI renders, all four sections are navigable, the mock screenshot fixtures
   display, the mock timer counts down, and the Notes section accepts typing.
3. Open DevTools; **expect** no errors about missing Electron globals.
4. Search the renderer source for `window.__hostBridge`; **expect** hits only in
   `src/renderer/host/host-bridge.ts`.

**Fails if**: any section requires Electron to render. That means host access has leaked past the
adapter.

### V-002 — Screenshots appear, including forgotten ones *(US-1, FR-009, FR-014, SC-001)*

1. `npm run dev`, click the menu bar icon.
2. **Expect**: the Screenshots section is selected and recent screenshots show as thumbnails, newest
   first, within 1 second of the click.
3. Confirm a screenshot you saved somewhere *other* than the current save location appears — this is
   the Spotlight backfill (R-003) doing the thing the feature exists for.

```bash
# What the backfill sees, for comparison against the UI:
mdfind "kMDItemImageIsScreenshot == 1 || kMDItemIsScreenCapture == 1" | head -50
# Where macOS is currently saving (unset ⇒ ~/Desktop):
defaults read com.apple.screencapture location 2>/dev/null || echo "~/Desktop (default)"
```

### V-003 — New screenshots arrive live *(FR-010, SC-002)*

1. With the panel open on Screenshots, press ⇧⌘4 and capture a region.
2. **Expect**: it appears at the top within 3 seconds, with no refresh, and scroll position and any
   selection are undisturbed.

### V-004 — Open and reveal *(FR-011, FR-012, SC-003)*

1. Open one screenshot → **expect** the default image viewer.
2. Reveal another → **expect** Finder with the file selected.
3. Delete a file in Finder while the panel shows it, then activate it → **expect** a "file no longer
   available" message and the entry disappearing, not a silent failure.

### V-005 — Files are never touched *(FR-014a — the read-only guarantee)*

```bash
# Before launching:
mdfind "kMDItemImageIsScreenshot == 1 || kMDItemIsScreenCapture == 1" | head -50 | xargs stat -f "%m %N" | sort > /tmp/before.txt
defaults read com.apple.screencapture location 2>/dev/null > /tmp/loc-before.txt
```

Run the app, browse all sections, quit, then re-run both commands into `after.txt` /
`loc-after.txt` and diff.

**Expect**: byte-identical. No file moved, renamed, or re-dated; the system save location unchanged.

### V-006 — Panel dismissal *(FR-002, FR-007, constitution Principle III)*

Verify **all four**, since each has a separate code path:

1. Click the menu bar icon while open → closes.
2. Press Escape → closes.
3. Click another application → closes.
4. Tab through the panel → focus stays inside, and returns to the trigger on close.

### V-007 — Timer survives a closed panel and a sleeping Mac *(US-3, FR-017, FR-020)*

1. Start a 2-minute timer, close the panel, wait 30 s, reopen.
   **Expect**: roughly 90 s remaining — **not** ~115 s. A near-full countdown means the renderer owns
   the clock and `backgroundThrottling` is eating ticks (R-004).
2. Start a 1-minute timer, close the lid for 90 s, reopen.
   **Expect**: the completion notification fires on wake, exactly once.

### V-008 — Global shortcut *(FR-019, SC-004, R-012)*

1. With the panel closed and another app focused, press the timer shortcut → timer starts.
2. Press again → pauses. Again → resumes from the same point.
3. In Settings, bind it to a combination another app owns → **expect** a visible "already in use"
   message, not a silent no-op.

### V-009 — Previews toggle independently *(US-2, FR-029..FR-036, SC-006)*

1. Enable **Screenshots** preview → thumbnail plus unseen count appears within 1 second.
2. Take a screenshot → count increments; open the Screenshots section → count resets to zero.
3. Enable **Timer** preview and start a timer → countdown updates live in the menu bar.
4. Enable **Spotify** preview → track name appears; change track → it updates within 2 seconds.
5. With all three on, toggle each off individually → **expect** only that segment disappears and the
   others are untouched.
6. Check the Settings list → **expect** no preview toggle for Notes (FR-028).
7. Play a track with a very long name → **expect** truncation, with other menu bar items undisplaced.
8. Quit and relaunch → **expect** all toggle states restored (FR-036).

### V-010 — Spotify degrades honestly *(US-4, FR-025)*

Check all three inactive states render distinctly and leave controls inoperable:

1. Quit Spotify → "not running".
2. Deny automation access (`tccutil reset AppleEvents` to re-prompt) → "permission denied", with a
   pointer to System Settings.
3. Spotify open, nothing loaded → "nothing playing".

Then with music playing: play/pause, next, previous, and scrub — each reflected in Spotify itself.

### V-011 — Notes persist and never lose text *(US-5, FR-027)*

1. Create a note, type, then dismiss the panel by clicking away **mid-sentence**.
2. Reopen → **expect** every character saved. This is the blur-dismiss + autosave interaction, the
   most likely place for data loss in this app.
3. Quit and relaunch → notes intact. Edit, then delete → gone.

### V-012 — Idle cost *(SC-011, constitution Principle V)*

1. Run the app, close the panel, disable all previews, ensure no timer is running.
2. Open Activity Monitor, watch the app for 60 s.
3. **Expect**: CPU effectively 0.0%, and the app absent from the top energy consumers.
4. Repeat with the Spotify preview *on* → some periodic cost is expected (polling, R-007). Turn it
   off → **expect** it returns to zero, proving polling actually stops.

### V-013 — Payload budget *(constitution Principle V)*

```bash
npm run build
```

**Expect**: the reported renderer bundle is under 500 KB uncompressed, and the build **fails** above
it. A build that merely warns does not satisfy the constitution — the budget is a gate.

### V-014 — Appearance and motion *(FR-008, constitution Principle III)*

1. With the panel open, switch System Settings → Appearance between Light and Dark.
   **Expect**: the panel follows immediately, without reopening.
2. Enable Accessibility → Display → Reduce Motion, reopen the panel and switch sections.
   **Expect**: no animation; transitions are instant.

---

## Definition of done

All of V-001 to V-014 pass, `npm test` is green (unit + contract, both bridge implementations), and
`npm run test:e2e` is green.

The two that most often get skipped and shouldn't: **V-001**, because it is the only check that the
core is still a web app, and **V-005**, because the read-only promise is invisible until it has
already been broken.
