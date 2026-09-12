# Contract Delta: Host Bridge

**Feature**: `003-mvp-screenshots-timer` | Supersedes the Spotify/Notes/Copy portions of
[`002-panel-ui-v2/contracts/host-bridge.md`](../../002-panel-ui-v2/contracts/host-bridge.md)

**Net change: 11 methods removed, 0 added.** Under constitution Principle II a contract change
requires the interface, the real binding, the browser mock, and the contract tests to move in one
change set. For removals that means the method disappears from all four, and the contract test
asserts its *absence* so a later re-introduction is a deliberate, reviewed act.

---

## Removed — screenshots

| Method | Reason |
|---|---|
| `copyScreenshots(ids: string[]): Promise<void>` | Copy action removed ([R-210](../research.md#r-210)) |
| `markScreenshotsSeen(): Promise<void>` | seen/unseen concept removed ([R-203](../research.md#r-203)) |

## Removed — Spotify

| Method |
|---|
| `getPlayback(): Promise<PlaybackState>` |
| `togglePlayback(): Promise<void>` |
| `nextTrack(): Promise<void>` |
| `previousTrack(): Promise<void>` |
| `seek(positionMs: number): Promise<void>` |
| `setVolume(volume: number): Promise<void>` |
| `setShuffle(shuffling: boolean): Promise<void>` |
| `setRepeat(repeating: boolean): Promise<void>` |
| `onPlaybackChanged(cb): Unsubscribe` |
| `setPlaybackSubscribed(active: boolean): void` |

## Removed — Notes

| Method |
|---|
| `listNotes()`, `createNote()`, `updateNote()`, `deleteNote()`, `flushNotes()` |

> The headline count of 11 refers to the distinct capabilities named in the spec's FR-091/092/096.
> The precise method list is whatever `host-contract.ts` currently declares for these three areas;
> the implementing change removes all of them and the contract test enumerates the survivors.

---

## Retained and unchanged

`listScreenshots`, `openScreenshot`, `revealScreenshot`, `deleteScreenshots`, `startScreenshotDrag`,
`getScreenshotSourceError`, `onScreenshotsChanged`, and the whole timer, preferences, panel and app
surface.

`startScreenshotDrag` is explicitly retained and unchanged — with Copy gone it is the **sole** path
from the panel into another application (FR-103).

---

## Contract test obligations

`tests/contract/host-bridge.spec.ts` must:

1. Assert the exact surviving method set, so an accidental re-addition fails the suite.
2. Assert that the mock and the real binding expose **identical** key sets.
3. Keep exercising failure paths for every survivor — the principle requires the mock to expose
   failures, not only successes. Required: screenshot source error, trash failure, thumbnail failure.

## Mock obligations

`host-mock.ts` loses the same methods. Its Spotify and Notes fixture data is deleted rather than left
orphaned. `dev:browser` must still present Screenshots, Timer and Settings with every interaction
exercisable — this is the Principle I gate and is verified in [quickstart.md](../quickstart.md).
