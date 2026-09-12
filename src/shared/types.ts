/**
 * Domain types shared by the main process and the renderer.
 *
 * Two rules govern everything here (data-model.md):
 *  - Every value crossing the preload boundary is plain JSON. Timestamps are
 *    epoch milliseconds, never Date objects — Date does not survive
 *    structured-clone round-trips predictably across the sandbox.
 *  - Only Preferences is durable. ScreenshotEntry is re-derived from Spotlight
 *    each launch.
 */

export type SectionId = 'screenshots' | 'timer'

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
  /**
   * True while the finish alarm is still sounding (FR-090).
   *
   * Part of the timer's state rather than a separate stream because it is the
   * timer that is alarming, and because the panel has to know without asking:
   * the Dismiss control only exists while this is true.
   *
   * Independent of `status`. Repeat can start the next countdown while the
   * previous alarm is still ringing, so 'running' with `alarming` is a real
   * combination, not a contradiction.
   */
  alarming: boolean
}

export interface PreviewPreferences {
  screenshots: boolean
  timer: boolean
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
  /**
   * Whether reaching zero makes a sound (FR-088).
   *
   * On by default, because a countdown you have to watch is not a countdown.
   * The notification is shown either way - this governs only the audio.
   */
  timerAlarm: boolean
  /**
   * Whether reaching zero starts the same duration again immediately (FR-089).
   *
   * Off by default: a timer that restarts itself unasked is a timer that never
   * stops, and the user has to be the one who chose that.
   */
  timerRepeat: boolean
}

export interface SourceError {
  kind: 'permission-denied' | 'location-missing' | 'unknown'
  message: string
}

export const DEFAULT_PREFERENCES: Preferences = {
  previews: { screenshots: false, timer: false },
  lastSection: 'screenshots',
  timerDurationMs: 5 * 60 * 1000,
  timerPresets: [60_000, 300_000, 600_000, 1_500_000],
  timerShortcut: 'Control+Option+T',
  timerAlarm: true,
  timerRepeat: false
}

export const SECTION_IDS: readonly SectionId[] = ['screenshots', 'timer']

/** Spec assumption: a bounded recent window, not a searchable archive. */
export const MAX_SCREENSHOTS = 50

/**
 * Layout constraint, not taste: the presets row is 237 pt wide inside a body
 * band of fixed height, so it cannot wrap (data-model.md, R-105).
 */
export const MAX_TIMER_PRESETS = 8

export const MIN_TIMER_PRESET_MS = 1_000
export const MAX_TIMER_PRESET_MS = 24 * 60 * 60 * 1000
