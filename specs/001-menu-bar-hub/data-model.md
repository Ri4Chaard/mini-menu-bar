# Phase 1 Data Model: Menu Bar Hub

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-21

All types below are declared once in `src/shared/types.ts` and imported by both the main process and
the renderer. Nothing here crosses a network; every value is local to the machine (FR-037).

Two properties govern the whole model:

- **Derived vs. durable.** Only notes, preferences, and the unseen watermark are written to disk.
  Screenshots are re-derived from Spotlight on each launch; playback state is a read-through view of
  another app. Keeping that boundary sharp is what stops the app accumulating a stale cache to
  reconcile.
- **Serialisable across the bridge.** Every type crossing the preload boundary is plain JSON —
  timestamps are epoch milliseconds (`number`), never `Date` objects, which do not survive
  structured-clone round-trips predictably across the sandbox.

---

## ScreenshotEntry

A read-only reference to a screenshot file on disk. Derived, never persisted (R-003, R-010).

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Stable identity: absolute file path. Two entries are the same screenshot iff paths match. |
| `path` | `string` | Absolute path. Used for open and reveal. |
| `fileName` | `string` | Display label. May be user-renamed; not used for identity or detection. |
| `capturedAt` | `number` | Epoch ms, from `kMDItemContentCreationDate`. The sort key. |
| `thumbnailDataUrl` | `string \| null` | Data URL for display. `null` while generation is pending. |
| `width` \| `height` | `number` | Intrinsic pixel dimensions; drives aspect-ratio-correct display. |
| `isSeen` | `boolean` | Derived at read time: `capturedAt <= preferences.screenshotsSeenWatermark`. |

**Validation rules**

- `path` MUST be absolute and MUST have been confirmed as a screenshot via `kMDItemIsScreenCapture`
  (R-003). Filename patterns MUST NOT be used to qualify an entry.
- The collection is ordered by `capturedAt` descending and capped at 50 entries (spec assumption).
- Entries are **never** mutated on disk. No rename, move, copy, or delete (FR-014a).

**Lifecycle**

```
[Spotlight backfill on launch]  ──┐
                                  ├──▶ collection (≤50, newest first) ──▶ renderer
[FSEvents watch: file created] ───┘
                                  
[FSEvents watch: file removed] ──▶ entry dropped from collection
[open/reveal on missing file]  ──▶ entry dropped + "file no longer available" surfaced
```

The last row is the spec edge case for files deleted outside the app: the failure is reported to the
user and the entry is reconciled away, rather than failing silently.

---

## TimerState

A single countdown owned by the main process (R-004). The renderer renders this; it never computes it.

| Field | Type | Notes |
|---|---|---|
| `status` | `'idle' \| 'running' \| 'paused' \| 'finished'` | See transitions below. |
| `configuredDurationMs` | `number` | The duration the user set. Survives reset. Persisted. |
| `deadlineAt` | `number \| null` | Epoch ms. Non-null only while `running`. **The source of truth.** |
| `remainingMs` | `number` | While `running`, `deadlineAt - Date.now()`. While `paused`, the frozen remainder. |

**Why `deadlineAt` rather than a tick counter**: an absolute deadline stays correct across display
sleep, system sleep, and renderer throttling with no compensation logic (R-004, FR-020). A timer that
accumulates ticks silently loses however long the machine slept.

**State transitions**

```
        ┌──────── reset ─────────┬───────────────┐
        ▼                        │               │
     ┌──────┐  start   ┌─────────┴─┐  pause  ┌───┴────┐
     │ idle │─────────▶│  running  │────────▶│ paused │
     └──────┘          └─────┬─────┘◀────────└────────┘
                             │        resume
                    deadline reached
                             ▼
                       ┌──────────┐
                       │ finished │──── reset ───▶ idle
                       └──────────┘
```

**Validation rules**

- `configuredDurationMs` MUST be > 0.
- `deadlineAt` MUST be non-null exactly when `status === 'running'`; any other combination is a bug.
- Entering `finished` MUST emit exactly one notification, even if the transition is detected late
  (e.g. on wake from sleep). Detection-on-wake MUST NOT produce a duplicate notification.
- `pause` from `idle`/`finished`, and `resume` from `running`, are no-ops rather than errors.

---

## Note

A short plain-text item. Durable (R-010).

| Field | Type | Notes |
|---|---|---|
| `id` | `string` | Generated identifier, stable for the note's life. |
| `content` | `string` | Plain text. No formatting, attachments, or embedded media (spec assumption). |
| `createdAt` | `number` | Epoch ms. |
| `updatedAt` | `number` | Epoch ms. Bumped on every content write. |

**Validation rules**

- `content` MAY be empty — a freshly created note is empty by definition (FR-026).
- Writes are debounced in the renderer, but a write MUST be flushed when the panel loses focus, so
  blur-dismiss can never lose text (FR-027, and the autosave assumption in the spec).
- Deletion is immediate and permanent; there is no trash or undo in this feature.
- Notes are ordered by `updatedAt` descending.

---

## PlaybackState

A read-through projection of the Spotify desktop app (R-007). Never persisted, never authoritative —
the external app owns this data.

| Field | Type | Notes |
|---|---|---|
| `availability` | `'playing' \| 'paused' \| 'stopped' \| 'not-running' \| 'permission-denied'` | See below. |
| `trackName` | `string \| null` | `null` unless a track is loaded. |
| `artist` | `string \| null` | `null` unless a track is loaded. |
| `positionMs` | `number \| null` | Current playhead. |
| `durationMs` | `number \| null` | Total track length. |

**Why `availability` is one enum rather than a boolean plus flags**: the spec requires that controls
never appear functional when they are not (FR-025), and the *reason* they are inoperable changes what
the user should be told. `not-running` means "open Spotify"; `permission-denied` means "grant
automation access in System Settings" (R-007). Collapsing these into `isAvailable: false` would make
the correct message unrenderable.

**Validation rules**

- When `availability` is `not-running` or `permission-denied`, every other field MUST be `null` and
  every control MUST be presented as inoperable.
- `positionMs <= durationMs` when both are non-null.
- `positionMs` is a snapshot at poll time, not a live value. The renderer MAY interpolate between
  polls for smooth display but MUST reconcile to the polled value.

---

## Preferences

The single durable settings document. Persisted atomically to `userData` (R-010).

| Field | Type | Default | Requirement |
|---|---|---|---|
| `previews.screenshots` | `boolean` | `false` | FR-029, FR-036 |
| `previews.timer` | `boolean` | `false` | FR-029, FR-036 |
| `previews.spotify` | `boolean` | `false` | FR-029, FR-036 |
| `lastSection` | `SectionId` | `'screenshots'` | FR-006 |
| `timerDurationMs` | `number` | `300000` (5 min) | FR-016 |
| `timerShortcut` | `string \| null` | platform default accelerator | FR-019, R-012 |
| `screenshotsSeenWatermark` | `number` | `0` | FR-013 |

**Validation rules**

- The three `previews` flags are strictly independent; writing one MUST NOT read or alter another
  (FR-031). This is the requirement most likely to be broken by a convenient "update all previews"
  helper, so it is stated as a model constraint rather than left to implementation.
- `lastSection` MUST be one of the four known section ids; an unknown value falls back to
  `'screenshots'` rather than rendering an empty panel.
- `screenshotsSeenWatermark` is set to `Date.now()` when the user opens the Screenshots section, which
  is what makes the unseen count reset (FR-013). It only ever moves forward.
- An unreadable or corrupt preferences file MUST fall back to defaults and MUST NOT block startup.

---

## Section

Static configuration, not user data. Defined in code, not persisted.

| Field | Type | Notes |
|---|---|---|
| `id` | `'screenshots' \| 'timer' \| 'spotify' \| 'notes'` | Closed set — FR-004 fixes it at four. |
| `label` | `string` | Sidebar text. |
| `icon` | `LucideIcon` | Named import (R-009). |
| `supportsPreview` | `boolean` | `false` for `notes` only — encodes FR-028 in the model, so the settings UI derives its toggle list rather than hard-coding it. |

---

## TrayPreviewModel

The composed menu bar content (R-005). Computed in the main process from `Preferences`,
`ScreenshotEntry[]`, `TimerState`, and `PlaybackState`. Never crosses to the renderer — the renderer
has no reason to know how the tray is drawn.

| Field | Type | Notes |
|---|---|---|
| `image` | `NativeImage` | Latest screenshot thumbnail when that preview is on, else the app icon. |
| `title` | `string` | Composed, ordered: unseen count · timer remaining · track name. Empty when all previews are off. |

**Validation rules**

- Each segment has its own character budget and the composed string has a total cap; overlong content
  truncates with an ellipsis (FR-035, SC-010).
- Segment order is fixed regardless of which previews are enabled, so the menu bar does not reshuffle
  as previews toggle.
- Composition MUST be a pure function of its four inputs — this is what makes it unit-testable without
  an Electron runtime, which matters because it is the piece most exposed to fiddly formatting bugs.

---

## Relationships

```
Preferences ──drives──▶ TrayPreviewModel ◀──feeds── ScreenshotEntry[] (latest + unseen count)
     │                        ▲                     
     │                        ├────── TimerState (remainingMs)
     │                        └────── PlaybackState (trackName)
     │
     ├──selects──▶ Section (lastSection)
     ├──configures──▶ TimerState (configuredDurationMs, shortcut)
     └──watermarks──▶ ScreenshotEntry.isSeen

Note[] ── independent, panel-only (FR-028) ──▶ Notes section
```

`Preferences` is the hub: it is the only entity that both persists and fans out into every other part
of the model. That makes its write path the highest-value place for tests.
