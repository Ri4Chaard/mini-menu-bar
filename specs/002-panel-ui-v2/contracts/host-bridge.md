# Contract: Host Bridge (delta)

**Feature**: [spec.md](../spec.md) | **Plan**: [plan.md](../plan.md)

A **delta** against [feature 001's host-bridge contract](../001-menu-bar-hub/contracts/host-bridge.md).
Every method there stays. This file adds six.

Constitution Principle II governs all of them: data-in/data-out, plain JSON only, errors normalised
to `BridgeError`, and *"adding a method to the adapter is a contract change: it requires updated
contract tests and a mock implementation in the same change set."* A method landing without its mock
and its contract test is an incomplete change, not a follow-up.

## New methods

```ts
export interface HostBridge {
  // ---- Screenshots (FR-058) ------------------------------------------------
  copyScreenshots(ids: string[]): Promise<void>
  deleteScreenshots(ids: string[]): Promise<void>

  // ---- Spotify (FR-068 as amended) -----------------------------------------
  setVolume(volume: number): Promise<void>
  setShuffle(shuffling: boolean): Promise<void>
  setRepeat(repeating: boolean): Promise<void>

  // ---- App (FR-076) --------------------------------------------------------
  quitApp(): Promise<void>
}
```

### `copyScreenshots(ids)`

Places the identified screenshots on the system clipboard.

| | |
|---|---|
| **Input** | 1…`MAX_SCREENSHOTS` screenshot ids |
| **Returns** | `void` on success |
| **Behaviour** | One id → the image itself. Two or more → file references ([R-107](../research.md)) |
| **Throws** | `BridgeError` if no id resolves, or if the clipboard write fails |
| **Partial resolution** | Ids that no longer resolve are skipped. Copying 3 of 4 succeeds; copying 0 of 4 throws |

The renderer passes **ids, never paths**. Main resolves them against its own store — the
constitution's Security clause, and the reason this method cannot be simplified to take paths.

### `deleteScreenshots(ids)`

Moves the identified screenshots to the Trash ([R-108](../research.md)).

| | |
|---|---|
| **Input** | 1…`MAX_SCREENSHOTS` screenshot ids |
| **Returns** | `void`; a `screenshots:changed` event follows with the survivors |
| **Throws** | `BridgeError` if every id fails to trash |
| **Partial failure** | Ids that fail are skipped and reported through the changed event, which still lists them if they survived on disk |

Recoverable by design: `shell.trashItem`, not `unlink`. A panel that dismisses on focus loss is a bad
host for a confirmation dialog, and Trash makes one unnecessary.

### `setVolume(volume)`

| | |
|---|---|
| **Input** | Integer 0–100 |
| **Returns** | `void`; the next `spotify:changed` carries the new value |
| **Throws** | `BridgeError` on a non-integer or out-of-range value, or when Spotify is unavailable |

Callers debounce. The renderer commits on release, not on every pointer-move
([R-117](../research.md)) — each call is an `osascript` spawn.

### `setShuffle(shuffling)` / `setRepeat(repeating)`

| | |
|---|---|
| **Input** | Strict boolean |
| **Returns** | `void`; the next `spotify:changed` carries the new value |
| **Throws** | `BridgeError` when Spotify is unavailable |

**`setRepeat` is a toggle, not a cycle.** Spotify's `repeating` property is a boolean; the
three-state off → all → one in Spotify's own UI is not scriptable ([R-109](../research.md), FR-068 as
amended).

### `quitApp()`

| | |
|---|---|
| **Input** | — |
| **Returns** | Never resolves in the host — the process exits |
| **Mock** | Resolves and sets a flag the tests can assert |

Needed because the app is an accessory (`LSUIElement`): no Dock icon, no application menu, therefore
no other way to quit ([R-113](../research.md)).

## Not added, and why

| Considered | Why not |
|---|---|
| `likeTrack()` | No writable liked/saved property in Spotify's AppleScript dictionary. The Web API route needs OAuth and per-toggle HTTPS, against the Privacy clause and feature 001's offline promise ([R-110](../research.md)). Dropped from FR-068 by amendment A-2 |
| `checkForUpdates()` | Would be an in-app network call. "Updates" opens the releases page via `shell.openExternal` instead — the app makes no request ([R-113](../research.md)) |
| `setSelection(ids)` | Selection is not a capability the browser lacks. It stays in renderer state ([R-106](../research.md)) |
| `getArtwork(url)` | Would hand the renderer a URL to fetch. Artwork arrives inside `PlaybackState` as a data URL so the request stays in main ([R-111](../research.md)) |
| `setTimerPresets(...)` | Rides the existing `updatePreferences` — presets are just a preference field ([R-112](../research.md)) |
| `setPreviewEnabled(...)` | Same — the footer toggle writes `previews.<section>` through `updatePreferences` ([R-114](../research.md)) |

Five of the six rejections keep the boundary from widening for things that are not host capabilities.
That is Principle II working as intended.

## Mock obligations

`host-mock.ts` implements all six. The constitution requires the mock to expose **failure paths, not
only success paths** — *"a mock that always succeeds proves nothing"*. These are mandatory:

| Scenario | Mock behaviour |
|---|---|
| Copy with no resolving id | Throws `BridgeError` |
| Copy one vs. many | Records which clipboard mode was chosen, so the R-107 rule is assertable |
| Delete | Removes from the mock collection and emits `onScreenshotsChanged` with the survivors |
| Delete failure | A designated fixture id always fails to trash |
| Spotify unavailable | `setVolume` / `setShuffle` / `setRepeat` throw, matching `availability: 'not-running'` |
| Volume out of range | Throws before touching state |
| Artwork | `artworkDataUrl` returns a static inline placeholder — never a network fetch |
| Artwork failure | A designated fixture track yields `artworkDataUrl: null`, so the placeholder path is exercisable |
| `quitApp` | Resolves; sets an assertable flag rather than exiting |

## Contract tests

One suite, run against both `host-bridge.ts` and `host-mock.ts` (Principle IV). Written before the
implementations.

1. Every method in `HostBridge` exists on both implementations — a structural test, so an
   interface addition without a mock fails the build.
2. Copy: single id → image mode; multiple ids → reference mode; unresolvable ids skipped; all-fail
   throws.
3. Delete: survivors emitted via the changed event; selection reconciliation drops removed ids.
4. Volume: rejects `-1`, `101`, `50.5`, `"50"`; accepts `0` and `100`.
5. Shuffle / repeat: reject non-booleans; round-trip through `PlaybackState`.
6. Every method rejects with a normalised `BridgeError` — never a raw Node or Electron error.
7. `PlaybackState` nulls `volume`, `shuffling`, `repeating`, and `artworkDataUrl` whenever
   `availability` is not `playing` or `paused`.
