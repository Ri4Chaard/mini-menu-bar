# Contract: Host Bridge

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

This is the **only** interface between the React renderer and the Electron host. It is the boundary
required by constitution Principle II ("Thin Native Boundary") and the mechanism that keeps Principle
I ("Web-Standard Core") true after the stack change.

**Two implementations, one contract:**

| Implementation | File | Selected when |
|---|---|---|
| Real | `src/renderer/host/host-bridge.ts` | The preload-exposed global is present |
| Mock | `src/renderer/host/host-mock.ts` | It is not — i.e. running in a plain browser |

Both MUST satisfy the same contract test suite (constitution Principle IV). A method added here
without a mock implementation is an incomplete change.

## Boundary rules

1. **Data in, data out.** Every argument and return value is plain JSON-serialisable data. No DOM
   nodes, no callbacks into UI internals, no Electron object types, no `Date` instances (epoch
   milliseconds only — see [data-model.md](../data-model.md)).
2. **No host globals outside `src/renderer/host/`.** `window.__hostBridge` may be referenced in
   `host-bridge.ts` and nowhere else. Enforced by lint rule, not convention.
3. **Every method can fail.** The mock exercises failure paths too — a mock that only ever succeeds
   tests nothing about how the UI behaves when Spotify is closed or a file has vanished.
4. **No business logic in the preload script.** Preload only forwards. Composition, formatting,
   validation, and scheduling live in main (constitution, Process model).

## Interface

```ts
// src/renderer/host/host-contract.ts

export interface HostBridge {
  // ---- Screenshots (FR-009..FR-015) ----------------------------------------
  /** Current collection, newest first, capped at 50. */
  listScreenshots(): Promise<ScreenshotEntry[]>
  /** Opens in the system default image viewer. Rejects if the file no longer exists. */
  openScreenshot(id: string): Promise<void>
  /** Reveals in Finder with the file selected. Rejects if the file no longer exists. */
  revealScreenshot(id: string): Promise<void>
  /** Moves the seen-watermark forward; resets the unseen count. Idempotent. */
  markScreenshotsSeen(): Promise<void>
  /** Fires on add/remove and on screenshot-location change. */
  onScreenshotsChanged(cb: (entries: ScreenshotEntry[]) => void): Unsubscribe
  /** Non-null when the source is unreadable — permissions, missing folder (FR-015). */
  getScreenshotSourceError(): Promise<SourceError | null>

  // ---- Timer (FR-016..FR-020) ----------------------------------------------
  getTimerState(): Promise<TimerState>
  startTimer(durationMs: number): Promise<TimerState>
  pauseTimer(): Promise<TimerState>
  resumeTimer(): Promise<TimerState>
  resetTimer(): Promise<TimerState>
  /** Emitted at most 1 Hz, and only while the Timer section is open or its preview is on. */
  onTimerStateChanged(cb: (state: TimerState) => void): Unsubscribe

  // ---- Spotify (FR-021..FR-025) --------------------------------------------
  getPlaybackState(): Promise<PlaybackState>
  togglePlayPause(): Promise<void>
  nextTrack(): Promise<void>
  previousTrack(): Promise<void>
  seekTo(positionMs: number): Promise<void>
  /** Polling starts on first subscribe and stops on last unsubscribe (R-007). */
  onPlaybackStateChanged(cb: (state: PlaybackState) => void): Unsubscribe

  // ---- Notes (FR-026..FR-027) ----------------------------------------------
  listNotes(): Promise<Note[]>
  createNote(): Promise<Note>
  updateNote(id: string, content: string): Promise<Note>
  deleteNote(id: string): Promise<void>
  /** Flushes pending note writes. Called on panel blur so dismissal cannot lose text. */
  flushNotes(): Promise<void>

  // ---- Preferences & previews (FR-006, FR-029..FR-036) ---------------------
  getPreferences(): Promise<Preferences>
  /** Partial merge. Writing one preview flag MUST NOT read or alter another (FR-031). */
  updatePreferences(patch: Partial<Preferences>): Promise<Preferences>
  /** Rebinds the global shortcut. Resolves `false` if the accelerator is already taken (R-012). */
  setTimerShortcut(accelerator: string | null): Promise<boolean>

  // ---- Panel (FR-002) ------------------------------------------------------
  /** Closes the panel from inside — e.g. Escape handled in the renderer. */
  closePanel(): Promise<void>
  /** Fires when the panel is shown, so sections can refresh on open. */
  onPanelShown(cb: () => void): Unsubscribe

  // ---- Environment ---------------------------------------------------------
  /** `'electron'` or `'browser'`. The only permitted host check in UI code. */
  getEnvironment(): 'electron' | 'browser'
  /** False in browser mode; gates affordances that cannot work there. */
  supportsNativeFeatures(): boolean
}

export type Unsubscribe = () => void

export interface SourceError {
  kind: 'permission-denied' | 'location-missing' | 'unknown'
  message: string
}
```

## Error contract

Rejections carry `{ code, message }`, never raw Electron or Node errors. Codes:

| Code | Raised by | UI obligation |
|---|---|---|
| `FILE_NOT_FOUND` | `openScreenshot`, `revealScreenshot` | Show "file no longer available", drop the entry |
| `PERMISSION_DENIED` | screenshot source, Spotify control | Explain which permission and where to grant it |
| `SPOTIFY_UNAVAILABLE` | any Spotify method | Render the inactive state; controls inoperable |
| `SHORTCUT_TAKEN` | `setTimerShortcut` | Prompt for a different binding |
| `PERSISTENCE_FAILED` | note/preference writes | Surface; do not silently discard the user's text |

## Mock obligations

`host-mock.ts` MUST provide, so browser mode exercises the real UI paths:

- A fixture set of screenshot entries with embedded data-URL thumbnails, and a way to simulate a new
  screenshot arriving so `onScreenshotsChanged` is exercised.
- A working timer driven by the same absolute-deadline logic as the real one, so the countdown is
  genuinely testable in a browser.
- A cycling playback state, plus reachable `not-running` and `permission-denied` states.
- Notes and preferences backed by in-memory state that resets on reload.
- Reachable failure paths for every code in the table above.

## Contract test suite

`tests/contract/host-bridge.spec.ts` runs the same assertions against both implementations:

- Every method exists and returns the declared shape.
- Every listed error code is reachable and carries `{ code, message }`.
- Every `on*` method returns a working `Unsubscribe` that stops delivery.
- `updatePreferences` with one preview flag leaves the other two byte-identical (FR-031).
- `markScreenshotsSeen` is idempotent and only moves the watermark forward.
- Timer transitions match the state machine in [data-model.md](../data-model.md), including that
  `pause` from `idle` is a no-op rather than an error.
