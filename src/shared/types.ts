/**
 * Domain types shared by the main process and the renderer.
 *
 * Two rules govern everything here (data-model.md):
 *  - Every value crossing the preload boundary is plain JSON. Timestamps are
 *    epoch milliseconds, never Date objects — Date does not survive
 *    structured-clone round-trips predictably across the sandbox.
 *  - Only Note, Preferences and the seen-watermark are durable. ScreenshotEntry
 *    is re-derived from Spotlight each launch; PlaybackState is a read-through
 *    view of another application.
 */

export type SectionId = 'screenshots' | 'timer' | 'spotify' | 'notes'

/** A read-only reference to a screenshot file. Never persisted. */
export interface ScreenshotEntry {
  /** Absolute file path. Two entries are the same screenshot iff paths match. */
  id: string
  path: string
  /** Display label only. May be user-renamed; never used for identity. */
  fileName: string
  /**
   * Epoch ms. The sort key. From kMDItemContentCreationDate for an indexed
   * file, or the file birth time for a staged capture, which no index covers.
   */
  capturedAt: number
  /** null while thumbnail generation is pending. */
  thumbnailDataUrl: string | null
  width: number
  height: number
  /**
   * True while the capture is still parked in the macOS staging area: taken,
   * but never saved anywhere the user can find it. Such a file disappears on
   * its own once it is saved or discarded, so the strip labels it rather than
   * letting it look like a file that will still be there tomorrow.
   */
  isTemporary: boolean
  /** Derived at read time from Preferences.screenshotsSeenWatermark. */
  isSeen: boolean
}

export type TimerStatus = 'idle' | 'running' | 'paused' | 'finished'

/**
 * A single countdown, owned by the main process.
 *
 * `deadlineAt` is the source of truth, not `remainingMs`. An absolute deadline
 * stays correct across display sleep, system sleep and renderer throttling with
 * no compensation logic (research.md R-004).
 */
export interface TimerState {
  status: TimerStatus
  configuredDurationMs: number
  /** Epoch ms. Non-null exactly when status === 'running'. */
  deadlineAt: number | null
  remainingMs: number
}

export interface Note {
  id: string
  content: string
  createdAt: number
  updatedAt: number
}

/**
 * Why one enum rather than `isAvailable` plus flags: the reason playback is
 * inoperable changes what the user must be told. 'not-running' means "open
 * Spotify"; 'permission-denied' means "grant automation access". Collapsing
 * them would make the correct message unrenderable (FR-025).
 */
export type PlaybackAvailability =
  | 'playing'
  | 'paused'
  | 'stopped'
  | 'not-running'
  | 'permission-denied'

export interface PlaybackState {
  availability: PlaybackAvailability
  trackName: string | null
  artist: string | null
  positionMs: number | null
  durationMs: number | null
  /** Spotify's `sound volume`: an integer 0-100 (research.md R-109). */
  volume: number | null
  shuffling: boolean | null
  /**
   * A boolean, NOT the three-state off/all/one cycle Spotify's own UI shows.
   * Only `repeating` is scriptable, so repeat ships as a toggle (R-109).
   */
  repeating: boolean | null
  /**
   * A data URL, never the https artwork URL.
   *
   * Handing the renderer a URL would let it make the request - an <img src> is
   * a network call. Main fetches, caches per track, and passes bytes, which is
   * what keeps the renderer network-free and browser mode working against a
   * mock placeholder (data-model.md, R-111, FR-087).
   */
  artworkDataUrl: string | null
}

export interface PreviewPreferences {
  screenshots: boolean
  timer: boolean
  spotify: boolean
}

export interface Preferences {
  previews: PreviewPreferences
  lastSection: SectionId
  timerDurationMs: number
  /**
   * Durations offered as chips in the Timer body. User-editable (FR-063),
   * which is what makes this user data rather than a constant. Normalised on
   * every write: sorted, de-duplicated, clamped, capped (data-model.md).
   */
  timerPresets: number[]
  timerShortcut: string | null
  /** Epoch ms. Only ever moves forward. Screenshots at or before this are seen. */
  screenshotsSeenWatermark: number
}

export interface SourceError {
  kind: 'permission-denied' | 'location-missing' | 'unknown'
  message: string
}

export const DEFAULT_PREFERENCES: Preferences = {
  previews: { screenshots: false, timer: false, spotify: false },
  lastSection: 'screenshots',
  timerDurationMs: 5 * 60 * 1000,
  timerPresets: [60_000, 300_000, 600_000, 1_500_000],
  timerShortcut: 'Control+Option+T',
  screenshotsSeenWatermark: 0
}

export const SECTION_IDS: readonly SectionId[] = ['screenshots', 'timer', 'spotify', 'notes']

/** Spec assumption: a bounded recent window, not a searchable archive. */
export const MAX_SCREENSHOTS = 50

/**
 * Layout constraint, not taste: the presets row is 237 pt wide inside a body
 * band of fixed height, so it cannot wrap (data-model.md, R-105).
 */
export const MAX_TIMER_PRESETS = 8

export const MIN_TIMER_PRESET_MS = 1_000
export const MAX_TIMER_PRESET_MS = 24 * 60 * 60 * 1000
