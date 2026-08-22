# Data Model: Panel UI v2

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

This is a **delta** against [feature 001's data model](../001-menu-bar-hub/data-model.md). Types not
mentioned here are unchanged. The two rules from feature 001 still govern everything: every value
crossing the preload boundary is plain JSON with epoch-millisecond timestamps, and only `Note`,
`Preferences`, and the seen-watermark are durable.

---

## Changed: `Preferences`

```ts
export interface Preferences {
  previews: PreviewPreferences
  lastSection: SectionId
  timerDurationMs: number
  timerPresets: number[]        // NEW
  timerShortcut: string | null
  screenshotsSeenWatermark: number
}
```

### `timerPresets: number[]` — new, persisted

The durations offered as chips in the Timer body. User-editable (FR-063), which is what makes this
user data rather than the constant it is today in `timer-section.tsx`.

| Rule | Value | Why |
|---|---|---|
| Default | `[60_000, 300_000, 600_000, 1_500_000]` | The 1m / 5m / 10m / 25m drawn in the frame; identical to today's hard-coded `PRESETS`, so existing installs see no change |
| Entry range | integer, 1_000 … 86_400_000 ms | A sub-second timer is not a timer; a >24h one is not a menu bar concern |
| Ordering | ascending | The chip row reads left to right as increasing duration |
| Uniqueness | de-duplicated | Two "5m" chips are a bug, not a preference |
| Maximum length | 8 | Layout constraint, not taste — the presets row is 237 pt wide and the body height is fixed, so it cannot wrap ([R-105](./research.md), [R-112](./research.md)) |

Normalisation (sort, de-dupe, clamp, cap) is a **pure function**, unit-tested without a host runtime,
and applied in the preferences service on every write — not in the UI. A malformed persisted array
from a hand-edited file is repaired on read rather than crashing the section.

**Migration**: absent on existing installs. The preferences service already merges partial persisted
state over `DEFAULT_PREFERENCES`, so a missing field resolves to the default with no migration step.

---

## Changed: `PlaybackState`

```ts
export interface PlaybackState {
  availability: PlaybackAvailability
  trackName: string | null
  artist: string | null
  positionMs: number | null
  durationMs: number | null
  volume: number | null            // NEW — 0..100
  shuffling: boolean | null        // NEW
  repeating: boolean | null        // NEW
  artworkDataUrl: string | null    // NEW
}
```

All four are `null` whenever `availability` is `not-running`, `permission-denied`, or `stopped` — the
same rule the existing fields follow. The `unavailable()` helper in `playback-service.ts` is extended
to null them, so an unavailable state cannot carry stale volume or artwork.

| Field | Source | Notes |
|---|---|---|
| `volume` | `sound volume` | Integer 0–100, read/write ([R-109](./research.md)) |
| `shuffling` | `shuffling` | Boolean, read/write |
| `repeating` | `repeating` | Boolean, read/write. **Not** a three-state cycle — the scripting interface exposes only on/off (FR-068 as amended) |
| `artworkDataUrl` | derived | **Not** the `artwork url` from AppleScript. Main fetches the URL, caches the bytes per track, and passes a `data:` URL ([R-111](./research.md)) |

### Why `artworkDataUrl` and not `artworkUrl`

Passing the `https://i.scdn.co/…` URL to the renderer would let the renderer make the request — an
`<img src>` is a network call. Handing over a data URL keeps the outbound request in the main
process, where the constraints in [R-111](./research.md) are enforceable, and keeps the renderer
network-free so it still runs in browser mode against a mock that returns a static placeholder.

**Cache**: in-memory, keyed by artwork URL, capped at 20 entries (LRU). Never persisted — it is
derived state that can be recomputed, which the constitution's state clause forbids persisting.

**Failure**: a failed fetch yields `null`, not an error. The art slot renders a neutral placeholder
and every other field in the state is unaffected.

---

## Changed: `ScreenshotEntry` — unchanged shape, new lifecycle

The type is untouched. What changes is that entries can now be **removed by user action** rather than
only by external file events.

**Reconciliation rule**: after a delete, main re-reads the store and emits `screenshots:changed` with
the surviving entries. The renderer drops any selected id absent from the new list
([R-106](./research.md)). Without this rule the selection count outlives the files it counted and
Copy acts on a missing path.

---

## New (renderer-only, not persisted, never crosses the boundary)

### `ScreenshotSelection`

```ts
type ScreenshotSelection = ReadonlySet<string>   // screenshot ids
```

Lives in `useState` inside the Screenshots section. Cleared when the panel closes. Only the resulting
action crosses the bridge, as `{ ids: string[] }`.

Not persisted, deliberately: the constitution requires that derived state which can be recomputed at
startup is not persisted, and "nothing selected" is the correct state on every open. Not sent across
the bridge as state either — highlighting is not a capability the browser lacks
([R-106](./research.md)).

### `NoteStats`

```ts
interface NoteStats {
  wordCount: number
  updatedAt: number
}
```

Derived from the open `Note` for the footer's "Edited 2m ago · 18 words" (FR-072). Computed by a pure
function in the renderer, unit-tested. Not stored — recomputable from `Note.content` at any moment.

**Word counting rule**: split on runs of whitespace, discard empty segments. An empty or
whitespace-only note is 0 words. This is stated because "18 words" must be reproducible in a test,
not left to whichever regex ships.

---

## Entity relationships

```text
Preferences ──1:1── PreviewPreferences        (previews.screenshots | .timer | .spotify)
     │
     ├── timerPresets: number[]               NEW, persisted, normalised on write
     └── lastSection: SectionId

ScreenshotEntry[]  ←─ reconciled ──  ScreenshotSelection   (renderer-only, ephemeral)
                                            │
                                            └─→ { ids } ─→ copy | delete

PlaybackState  ←─ polled while observed ──  Spotify.app     (AppleScript)
     └── artworkDataUrl  ←─ fetched + cached in main ──  i.scdn.co   (declared, FR-087)

Note ──derived──> NoteStats                  (renderer-only, recomputed)
```

---

## Validation rules crossing the boundary

Every new IPC payload is validated in `src/main/ipc/validate.ts` before use, per the constitution's
Security clause. Contract detail in [contracts/ipc-channels.md](./contracts/ipc-channels.md).

| Payload | Rule | On violation |
|---|---|---|
| `{ ids: string[] }` | Array of strings, length 1…`MAX_SCREENSHOTS`; every id must resolve in the store | Reject with `BridgeError`; ids that no longer resolve are skipped, not fatal |
| `{ volume: number }` | Integer, 0…100 | Reject with `BridgeError` |
| `{ shuffling: boolean }` / `{ repeating: boolean }` | Strict boolean | Reject with `BridgeError` |
| `timerPresets` within `prefs:update` | Normalised per the rules above | Repaired, never rejected — a bad preset list must not make preferences unwritable |

**Path rule restated**: no new channel accepts a filesystem path. Copy and Delete take ids; main
resolves them against the store it owns. This is the constitution's rule and it is the reason
`copyScreenshots` cannot be "simplified" to take paths.
