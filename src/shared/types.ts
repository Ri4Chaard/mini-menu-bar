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
  /** Epoch ms, from kMDItemContentCreationDate. The sort key. */
  capturedAt: number
  /** null while thumbnail generation is pending. */
  thumbnailDataUrl: string | null
  width: number
  height: number
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
  timerShortcut: 'Control+Option+T',
  screenshotsSeenWatermark: 0
}

export const SECTION_IDS: readonly SectionId[] = ['screenshots', 'timer', 'spotify', 'notes']

/** Spec assumption: a bounded recent window, not a searchable archive. */
export const MAX_SCREENSHOTS = 50
