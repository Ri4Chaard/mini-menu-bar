# Phase 1 Data Model: MVP Scope — Screenshots & Timer

**Feature**: `003-mvp-screenshots-timer` | **Date**: 2026-09-12

This feature is predominantly **subtractive**. The table below is the authoritative list of what
changes; entities not listed are untouched.

---

## Entity changes

### `SectionId` (shared)

| Before | After |
|---|---|
| `'screenshots' \| 'timer' \| 'spotify' \| 'notes'` | `'screenshots' \| 'timer'` |

`SECTION_IDS` shrinks to match. `reviveSection` already falls back on an unknown value, so a stored
`'spotify'` resolves to `DEFAULT_PREFERENCES.lastSection` with no new code — see [R-209](./research.md#r-209).

### `PreviewPreferences` (shared)

| Field | Change |
|---|---|
| `screenshots: boolean` | unchanged |
| `timer: boolean` | unchanged |
| `spotify: boolean` | **removed** |

`mergePreferences` merges previews key-by-key to keep FR-031's independence guarantee; the `spotify`
key is removed from that merge in the same edit.

### `Preferences` (shared, persisted)

| Field | Change |
|---|---|
| `screenshotsSeenWatermark: number` | **removed** ([R-203](./research.md#r-203)) |
| `lastSection: SectionId` | narrowed; migrated on read |
| `previews` | loses `spotify` |
| everything else | unchanged |

**Migration is exercised on first launch**, not hypothetically: the developer's stored preferences
populate all three removed/narrowed fields.

### `ScreenshotEntry` (shared)

No field changes. What changes is what the system *derives* from the collection: `unseenCount()` is
replaced by a total count, and nothing marks entries as seen.

### `PlaybackState`, `Note` (shared)

**Removed entirely**, along with every type that exists only to serve them.

---

## New pure functions

All four are unit-tested without a host runtime, per Principle IV.

### `composeBadge(bitmap, width, height, count) → void` — `src/main/tray/badge.ts`

Mutates a BGRA buffer in place, writing a count badge into the top-right corner.

| Rule | Behaviour |
|---|---|
| `count <= 0` | no-op — the badge must never render `0` over the fallback icon |
| `1 <= count <= 99` | right-aligned digits on a filled pill |
| `count > 99` | renders `99+` ([R-202](./research.md#r-202)) |
| buffer too small for the badge | no-op rather than throwing or writing out of bounds |

Colours are two named constants (badge fill, digit ink) rather than tokens, because this runs in the
main process outside the CSS token system. The rationale is recorded at the constant.

### `digitGlyph(digit) → readonly number[]` — `src/main/tray/badge.ts`

The 3×5 bitmap font from [R-202](./research.md#r-202): five 3-bit rows per digit. Pure lookup,
exhaustively testable across all ten digits.

### `parseDuration(input) → number | null` — `src/renderer/sections/timer/parse-duration.ts`

| Input | Result |
|---|---|
| `7` | 420 000 ms (bare number means minutes) |
| `7:30` | 450 000 ms |
| `1:30:00` | 5 400 000 ms |
| `90s` | 90 000 ms |
| `2h` | 7 200 000 ms |
| `""`, `abc`, `-5`, `1:75` | `null` — rejected visibly, previous duration retained (FR-106) |
| below `MIN_TIMER_PRESET_MS` (1 s) | clamped up (FR-107) |
| above `MAX_TIMER_PRESET_MS` (24 h) | clamped down (FR-107) |

Rejection and clamping are deliberately different behaviours: unparseable input is a mistake to
surface, out-of-range input is an intent to honour within bounds. This mirrors how `normalisePresets`
already treats malformed persisted data.

### `screenshotCount(entries) → number` — `src/main/tray/preview-composer.ts`

Trivial, but named and tested because FR-110 makes it a contract: the badge must equal what the
section lists, and the section is capped at `MAX_SCREENSHOTS` (50).

---

## `TrayPreviewModel` change

| Before | After |
|---|---|
| `{ image: NativeImage \| null, title: string }` | `{ image: NativeImage \| null, badgeCount: number, title: string }` |

`composePreview` stops emitting the count as a title segment and stops emitting the Spotify segment
entirely. The title now carries only the timer, so it is frequently empty — which is correct: the
screenshot count moved *into* the image.

`tray-controller` gains the compositing step:

```text
thumbnail exists and preview on  →  composite badge  →  tray.setImage(composited)
no thumbnail (or preview off)    →  tray.setImage(defaultImage)   // no badge, ever
```

The guard on the second branch is the whole of FR-114 and FR-115: a zero count must never paint a
badge onto the wine glass.

---

## State transitions

### Screenshot selection (renderer, in-memory, not persisted)

| From | Event | To |
|---|---|---|
| unselected | `click` | selected |
| selected | `click` | unselected |
| any | `dblclick` | unchanged net of its two clicks, and the file opens ([R-206](./research.md#r-206)) |
| selected | entry disappears from the store | dropped from the selection |
| any | `dragstart` … `dragend` | unchanged — no `click` fires ([R-207](./research.md#r-207)) |

### Timer duration editing (renderer)

| From | Event | To |
|---|---|---|
| readout | click / focus + type | editing |
| editing | `Enter`, input parses | committed; readout shows the new duration |
| editing | `Enter`, input rejected | editing retained, error shown, previous duration intact |
| editing | `Escape` | reverted, focus returns to readout — **panel stays open** |
| readout | `Escape` | panel dismisses (unchanged Principle III behaviour) |
| editing | blur | treated as `Escape` — reverts rather than committing a half-typed value |

The two `Escape` rows are the Principle III conflict resolved in [R-208](./research.md#r-208).
