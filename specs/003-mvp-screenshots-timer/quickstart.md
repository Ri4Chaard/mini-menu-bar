# Quickstart: MVP Scope — Screenshots & Timer

**Feature**: `003-mvp-screenshots-timer` | **Date**: 2026-09-12

Runnable validation for this feature. Each section states what it proves and which requirement it
closes. Run top to bottom; the gates are ordered cheapest-first.

---

## Prerequisites

```bash
npm install
mdfind 'kMDItemImageIsScreenshot == 1 || kMDItemIsScreenCapture == 1' | wc -l   # need at least 3 screenshots to exercise selection
```

**Back up the preferences file before the first run** — the migration rewrites it, and the original
is the only copy of the pre-migration state:

```bash
cp ~/Library/"Application Support"/mini-menu-bar/preferences.json /tmp/prefs-before.json
```

---

## Gate 1 — Static checks

```bash
npm run typecheck
npm run lint          # Principle I: no host global outside the adapter
npm test              # unit + contract suites
```

Expected: all pass. `tests/unit/clipboard-mode.spec.ts` and `tests/unit/artwork-cache.spec.ts` should
no longer exist; `tests/unit/tray-badge.spec.ts`, `parse-duration.spec.ts` and
`preferences-migration.spec.ts` should.

## Gate 2 — Payload budget (Principle V)

```bash
npm run build
```

The build fails above 500 KB. Expected: **below the 332.5 KB baseline**, since two sections are gone.
Record the number — a payload that did not shrink means dead code is still reachable.

## Gate 3 — Browser mode (Principle I)

```bash
npm run dev:browser
```

Verify:

- Only Screenshots, Timer and Settings are reachable — no Spotify, no Notes. *(FR-091, FR-092)*
- No Copy control anywhere in Screenshots. *(FR-096)*
- Clicking a mock thumbnail selects it; clicking again deselects. *(FR-097)*
- Double-clicking opens (the mock logs the call) and leaves selection net-unchanged. *(FR-101)*
- The lower-right per-card icon reads as "show in folder", not a download arrow. *(FR-102)*
- The clock readout accepts typed input. *(FR-104)*
- Mock failure paths still surface: screenshot source error, trash failure. *(Principle I)*

## Gate 4 — Preference migration

This is a **P1 path, not a defensive one** — the developer's stored preferences populate all three
removed fields ([R-209](./research.md#r-209)).

```bash
cat /tmp/prefs-before.json   # confirm: lastSection "spotify", previews.spotify, screenshotsSeenWatermark
npm run dev
```

Verify:

- The app launches without error and opens on a section that exists. *(FR-094)*
- After first write, the file no longer contains `spotify`, `notes`, or `screenshotsSeenWatermark`:

```bash
grep -E 'spotify|notes|SeenWatermark' ~/Library/"Application Support"/mini-menu-bar/preferences.json \
  && echo "FAIL: removed field persisted" || echo "OK: migrated"
```

- `notes.json` is still present and untouched. *(spec assumption — scope reduction must not destroy data)*

## Gate 5 — Menu bar badge

With `previews.screenshots` enabled:

| Step | Expected | Requirement |
|---|---|---|
| Take a screenshot | badge count increases within 2 s | FR-109, FR-113 |
| Open and close the panel | count **unchanged** by viewing | FR-112 |
| Compare badge to section | equal | FR-110 |
| Delete all screenshots | wine-glass icon, **no badge**, no grid glyph at any point | FR-114, FR-115 |
| Switch light ↔ dark menu bar | icon tints correctly (template image) | FR-116 |
| Disable the preview | app icon, no count | FR-114 |

The delete-all step is the one that regresses most easily: watch for a single frame of "0" or of the
old four-square glyph.

## Gate 6 — Manual ergonomics (Principle III, required before merge)

| Check | Expected |
|---|---|
| Click the menu bar item | panel toggles |
| `Escape` with the clock **not** being edited | panel dismisses |
| `Escape` **while editing** the clock | edit reverts, **panel stays open** |
| `Escape` again | panel dismisses |
| Blur while editing | reverts, does not commit a half-typed value |
| `Tab` through the panel | focus cycles; returns to trigger on close |
| Dark and light appearance | both correct |
| `prefers-reduced-motion` | expand/collapse animation disabled |

Rows 2–5 are the [R-208](./research.md#r-208) two-stage `Escape` rule — the one Principle III
behaviour this feature changes. **Note the result in the change description**, as the constitution's
manual gate requires.

## Gate 7 — Drag versus click (the unprobed assumption)

[R-207](./research.md#r-207) relies on Chromium suppressing `click` after a drag. It could not be
probed without a real pointer, so it is verified by hand:

1. Note a thumbnail's selection state.
2. Drag it into Finder and drop it.
3. Return to the panel.

**Expected**: the file is copied *and* the thumbnail's selection state is unchanged. If it toggled,
apply the movement-threshold fallback named in R-207.

Also confirm drag-out still works at all — with Copy gone it is the only path into another
application. *(FR-103, SC-015)*

## Gate 8 — Performance re-measurement (Principle V gate)

This feature deletes a poll loop and changes the adapter, so the constitution requires measured idle
CPU to be reported. Baseline from [R-212](./research.md#r-212):

| Metric | Before | After | |
|---|---|---|---|
| Idle CPU, previews on | 0.277% | **0.185%** | ✅ −33% |
| Memory, physical footprint | 96.7 MB | 110.5 MB | ⚠️ see note |
| Renderer payload | 332.5 KB of 500 KB | **319.4 KB** | ✅ −13.1 KB |

**Measured 2026-09-12**, panel closed, `previews.screenshots` and `previews.timer` enabled — the
developer's real configuration. CPU is a cumulative-time delta over a 65 s window, not a `top` sample.

**On the memory figure**: this is not a clean win and should not be reported as one. The increase
sits almost entirely in Chromium's GPU process (31.0 → 40.7 MB), which was already observed to be
volatile during baselining — it peaked at 139.7 MB before settling to 31.0 MB on the same build. The
main process fell slightly (36.9 → 32.9 MB) and the renderer is flat. Treat memory as unchanged
within noise rather than regressed, and re-measure across several launches before drawing any
conclusion.

Measure CPU as a cumulative-time delta over a wall-clock window rather than sampling `top`, which
drops processes in and out of its row list and gives unstable figures:

```bash
# with the app running and the panel closed
P=$(pgrep -f "electron/dist/Electron.app" | head -1)
T0=$(ps -p $P -o cputime=); sleep 60; T1=$(ps -p $P -o cputime=)
echo "cpu time before=$T0 after=$T1 over 60s"
```

Expected: idle CPU **falls**, since the 2 s `osascript` spawn is gone.

---

## Done when

- [ ] Gates 1–5 pass
- [ ] Gate 6 manually verified and noted in the change description
- [ ] Gate 7 confirms drag-out intact and selection unaffected
- [ ] Gate 8 numbers recorded and not worse than baseline
