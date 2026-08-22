/**
 * The browser implementation of the host bridge.
 *
 * This is not a stub — it is what makes constitution Principle I verifiable.
 * It exposes failure paths as well as success paths, because a mock that always
 * succeeds proves nothing about how the UI behaves when a file is missing or a
 * permission is denied (contracts/host-bridge.md, "Mock obligations").
 */
import { BridgeError } from '@shared/errors'
import {
  DEFAULT_PREFERENCES,
  MAX_SCREENSHOTS,
  type Note,
  type PlaybackState,
  type Preferences,
  type ScreenshotEntry,
  type SourceError,
  type TimerState
} from '@shared/types'
import type { HostBridge } from './host-contract'
import { mergeForMock } from './merge-preferences'

/** A recognisable placeholder thumbnail, generated rather than shipped as an asset. */
function swatch(hue: number, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200">
    <rect width="320" height="200" fill="hsl(${hue} 45% 55%)"/>
    <rect x="16" y="16" width="288" height="168" fill="hsl(${hue} 45% 92%)" opacity="0.35"/>
    <text x="160" y="112" font-family="system-ui" font-size="26" fill="hsl(${hue} 60% 18%)"
      text-anchor="middle">${label}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const MINUTE = 60_000

/**
 * The newest entry is staged on purpose. A capture that was taken but never
 * saved renders differently, and a mock where that state is unreachable cannot
 * show whether the difference actually reads (Principle I, "mock obligations").
 */
function seedScreenshots(now: number): ScreenshotEntry[] {
  return [
    { label: 'Design review', hue: 210, ago: 2 * MINUTE, staged: true },
    { label: 'Bug repro', hue: 12, ago: 26 * MINUTE, staged: false },
    { label: 'Invoice', hue: 140, ago: 3 * 60 * MINUTE, staged: false },
    { label: 'Chat thread', hue: 280, ago: 9 * 60 * MINUTE, staged: false },
    { label: 'Old mockup', hue: 45, ago: 52 * 60 * MINUTE, staged: false }
  ].map((s, i) => {
    const path = s.staged
      ? `/mock/tmp/TemporaryItems/NSIRD_screencaptureui_mock/Screenshot ${i + 1}.png`
      : `/Users/mock/Desktop/Screenshot ${i + 1}.png`
    return {
      id: path,
      path,
      fileName: `Screenshot ${i + 1}.png`,
      capturedAt: now - s.ago,
      thumbnailDataUrl: swatch(s.hue, s.label),
      width: 320,
      height: 200,
      isTemporary: s.staged,
      isSeen: i > 1
    }
  })
}

const MOCK_TRACKS = [
  { trackName: 'Windowlicker', artist: 'Aphex Twin', durationMs: 366_000 },
  { trackName: 'Teardrop', artist: 'Massive Attack', durationMs: 330_000 },
  { trackName: 'A Song With A Deliberately Very Long Title To Test Truncation', artist: 'Test Artist', durationMs: 245_000 }
]

export interface MockControls {
  /** Simulate a new screenshot arriving, so onScreenshotsChanged is exercised. */
  addScreenshot(): void
  /** Force the screenshots source into an error state (FR-015). */
  setSourceError(error: SourceError | null): void
  /** Reach the not-running / permission-denied states (FR-025). */
  setPlaybackAvailability(availability: PlaybackState['availability']): void
  /** Make the next screenshot open/reveal fail with FILE_NOT_FOUND. */
  setNextFileMissing(missing: boolean): void
  /** Which clipboard flavour the last copy chose, so R-107 is assertable. */
  lastClipboardMode(): 'image' | 'references' | null
  /** Make every delete fail, so the all-failed path is reachable (Principle I). */
  setDeleteFails(fails: boolean): void
  /** Blank the artwork so the placeholder path is exercisable (R-111). */
  setArtworkMissing(missing: boolean): void
  /** True once quitApp was called - the mock cannot actually exit. */
  didQuit(): boolean
  /** Which ids the last drag carried, so the selection rule is assertable. */
  lastDragIds(): string[] | null
}

export function createMockBridge(): HostBridge & { __mock: MockControls } {
  const now = Date.now()
  let screenshots = seedScreenshots(now)
  let sourceError: SourceError | null = null
  let nextFileMissing = false
  let clipboardMode: 'image' | 'references' | null = null
  let deleteFails = false
  let dragIds: string[] | null = null
  let artworkMissing = false
  let quit = false
  let notes: Note[] = [
    { id: 'n1', content: 'Remember to check the tray truncation budget.', createdAt: now - MINUTE, updatedAt: now - MINUTE }
  ]
  let prefs: Preferences = { ...DEFAULT_PREFERENCES, previews: { ...DEFAULT_PREFERENCES.previews } }
  let noteSeq = 2

  const screenshotListeners = new Set<(e: ScreenshotEntry[]) => void>()
  const timerListeners = new Set<(s: TimerState) => void>()
  const playbackListeners = new Set<(s: PlaybackState) => void>()
  const panelListeners = new Set<() => void>()

  // ---- Timer: the same absolute-deadline logic as the real service, so the
  // countdown genuinely works in browser mode (research.md R-004).
  let timer: TimerState = {
    status: 'idle',
    configuredDurationMs: prefs.timerDurationMs,
    deadlineAt: null,
    remainingMs: prefs.timerDurationMs,
    alarming: false
  }
  let tickHandle: ReturnType<typeof setInterval> | null = null

  const projectTimer = (): TimerState => {
    if (timer.status !== 'running' || timer.deadlineAt === null) return { ...timer }
    const remainingMs = Math.max(0, timer.deadlineAt - Date.now())
    return { ...timer, remainingMs }
  }

  const emitTimer = (): void => {
    const state = projectTimer()
    if (state.status === 'running' && state.remainingMs === 0) {
      // The browser cannot make the sound, but it MUST reach the alarming
      // state: otherwise Dismiss is unreachable in browser mode and the one
      // control added for it cannot be exercised there at all (Principle I).
      timer = {
        ...timer,
        status: 'finished',
        deadlineAt: null,
        remainingMs: 0,
        alarming: prefs.timerAlarm
      }
      stopTicking()
      for (const cb of timerListeners) cb({ ...timer })

      // Repeat is mirrored here, not left to the host: it changes what the
      // countdown DOES, so a browser session where the toggle did nothing would
      // not be running the same timer (Principle I). The alarm is not mirrored -
      // there is no browser equivalent of a system alert sound.
      if (prefs.timerRepeat && timer.configuredDurationMs > 0) {
        timer = {
          status: 'running',
          configuredDurationMs: timer.configuredDurationMs,
          deadlineAt: Date.now() + timer.configuredDurationMs,
          remainingMs: timer.configuredDurationMs,
          // Not cleared: a repeat nobody has seen must not silence itself.
          alarming: timer.alarming
        }
        startTicking()
        for (const cb of timerListeners) cb({ ...timer })
      }
      return
    }
    for (const cb of timerListeners) cb(state)
  }

  function startTicking(): void {
    // Demand-driven: no interval unless someone is watching (Principle V).
    if (tickHandle !== null || timerListeners.size === 0) return
    tickHandle = setInterval(emitTimer, 1000)
  }
  function stopTicking(): void {
    if (tickHandle !== null) {
      clearInterval(tickHandle)
      tickHandle = null
    }
  }

  // ---- Playback: cycles so the UI is exercised without Spotify present.
  let trackIndex = 0
  let availability: PlaybackState['availability'] = 'playing'
  let positionMs = 42_000

  let volume = 65
  let shuffling = false
  let repeating = false

  const playback = (): PlaybackState => {
    // Every field nulls together when playback is unavailable - a stale volume
    // or a leftover artwork on a 'not-running' state is exactly the kind of
    // ghost the data-model rule exists to prevent.
    if (availability === 'not-running' || availability === 'permission-denied') {
      return {
        availability,
        trackName: null,
        artist: null,
        positionMs: null,
        durationMs: null,
        volume: null,
        shuffling: null,
        repeating: null,
        artworkDataUrl: null
      }
    }
    const t = MOCK_TRACKS[trackIndex % MOCK_TRACKS.length]!
    return {
      availability,
      trackName: t.trackName,
      artist: t.artist,
      positionMs,
      durationMs: t.durationMs,
      volume,
      shuffling,
      repeating,
      // A static inline placeholder. The mock NEVER fetches: browser mode has
      // to work with no network at all (Principle I, R-111).
      artworkDataUrl: artworkMissing ? null : swatch((trackIndex * 97) % 360, 'Album')
    }
  }

  const requirePlayback = (): void => {
    if (availability === 'not-running' || availability === 'permission-denied') {
      throw new BridgeError('SPOTIFY_UNAVAILABLE', 'Spotify is not available.')
    }
  }
  const emitPlayback = (): void => {
    const s = playback()
    for (const cb of playbackListeners) cb(s)
  }
  let playbackHandle: ReturnType<typeof setInterval> | null = null

  const findScreenshot = (id: string): ScreenshotEntry => {
    const found = screenshots.find((s) => s.id === id)
    if (!found || nextFileMissing) {
      throw new BridgeError('FILE_NOT_FOUND', 'That screenshot is no longer available.')
    }
    return found
  }

  const withWatermark = (list: ScreenshotEntry[]): ScreenshotEntry[] =>
    list.map((s) => ({ ...s, isSeen: s.capturedAt <= prefs.screenshotsSeenWatermark }))

  const emitScreenshots = (): void => {
    const list = withWatermark(screenshots)
    for (const cb of screenshotListeners) cb(list)
  }

  const bridge: HostBridge & { __mock: MockControls } = {
    async listScreenshots() {
      if (sourceError) throw new BridgeError('PERMISSION_DENIED', sourceError.message)
      return withWatermark(screenshots)
    },
    async openScreenshot(id) {
      findScreenshot(id)
    },
    async revealScreenshot(id) {
      findScreenshot(id)
    },
    async markScreenshotsSeen() {
      prefs = { ...prefs, screenshotsSeenWatermark: Math.max(prefs.screenshotsSeenWatermark, Date.now()) }
      emitScreenshots()
    },
    async getScreenshotSourceError() {
      return sourceError
    },
    async copyScreenshots(ids) {
      const live = ids.filter((id) => screenshots.some((s) => s.id === id))
      // Copying 3 of 4 succeeds; copying 0 of 4 does not (R-107).
      if (live.length === 0) {
        throw new BridgeError('FILE_NOT_FOUND', 'No screenshots to copy')
      }
      clipboardMode = live.length === 1 ? 'image' : 'references'
    },
    /**
     * A browser cannot hand a real file to another application, so the mock
     * records the request instead of performing it. It still enforces the same
     * precondition as the host - a drag that resolves nothing is an error, not
     * a cursor carrying nothing.
     */
    async startScreenshotDrag(ids) {
      const live = ids.filter((id) => screenshots.some((s) => s.id === id))
      if (live.length === 0) {
        throw new BridgeError('FILE_NOT_FOUND', 'Those screenshots are no longer available.')
      }
      dragIds = live
    },
    async deleteScreenshots(ids) {
      if (deleteFails) {
        throw new BridgeError('FILE_NOT_FOUND', 'None of those screenshots could be deleted.')
      }
      const before = screenshots.length
      screenshots = screenshots.filter((s) => !ids.includes(s.id))
      if (screenshots.length === before) {
        throw new BridgeError('FILE_NOT_FOUND', 'None of those screenshots could be deleted.')
      }
      emitScreenshots()
    },
    onScreenshotsChanged(cb) {
      screenshotListeners.add(cb)
      return () => screenshotListeners.delete(cb) as unknown as void
    },

    async getTimerState() {
      return projectTimer()
    },
    async dismissTimerAlarm() {
      if (timer.alarming) {
        timer = { ...timer, alarming: false }
        emitTimer()
      }
      return projectTimer()
    },
    async startTimer(durationMs) {
      timer = {
        status: 'running',
        configuredDurationMs: durationMs,
        deadlineAt: Date.now() + durationMs,
        remainingMs: durationMs,
        alarming: false
      }
      prefs = { ...prefs, timerDurationMs: durationMs }
      startTicking()
      return projectTimer()
    },
    async pauseTimer() {
      // Pause from idle or finished is a no-op, not an error (data-model.md).
      if (timer.status !== 'running') return projectTimer()
      timer = { ...projectTimer(), status: 'paused', deadlineAt: null }
      stopTicking()
      return { ...timer }
    },
    async resumeTimer() {
      if (timer.status !== 'paused') return projectTimer()
      timer = { ...timer, status: 'running', deadlineAt: Date.now() + timer.remainingMs }
      startTicking()
      return projectTimer()
    },
    async resetTimer() {
      stopTicking()
      timer = {
        status: 'idle',
        configuredDurationMs: timer.configuredDurationMs,
        deadlineAt: null,
        remainingMs: timer.configuredDurationMs,
        // Reset is the "everything off" action, alarm included.
        alarming: false
      }
      return { ...timer }
    },
    onTimerStateChanged(cb) {
      timerListeners.add(cb)
      if (timer.status === 'running') startTicking()
      return () => {
        timerListeners.delete(cb)
        if (timerListeners.size === 0) stopTicking()
      }
    },

    async getPlaybackState() {
      return playback()
    },
    async togglePlayPause() {
      if (availability === 'playing') availability = 'paused'
      else if (availability === 'paused') availability = 'playing'
      else throw new BridgeError('SPOTIFY_UNAVAILABLE', 'Spotify is not available.')
      emitPlayback()
    },
    async nextTrack() {
      if (availability === 'not-running' || availability === 'permission-denied') {
        throw new BridgeError('SPOTIFY_UNAVAILABLE', 'Spotify is not available.')
      }
      trackIndex += 1
      positionMs = 0
      emitPlayback()
    },
    async previousTrack() {
      if (availability === 'not-running' || availability === 'permission-denied') {
        throw new BridgeError('SPOTIFY_UNAVAILABLE', 'Spotify is not available.')
      }
      trackIndex = Math.max(0, trackIndex - 1)
      positionMs = 0
      emitPlayback()
    },
    async seekTo(target) {
      const state = playback()
      if (state.durationMs === null) {
        throw new BridgeError('SPOTIFY_UNAVAILABLE', 'Spotify is not available.')
      }
      positionMs = Math.min(Math.max(0, target), state.durationMs)
      emitPlayback()
    },
    async setVolume(next) {
      requirePlayback()
      if (!Number.isInteger(next) || next < 0 || next > 100) {
        throw new BridgeError('INVALID_ARGUMENT', 'volume must be an integer between 0 and 100')
      }
      volume = next
      emitPlayback()
    },
    async setShuffle(next) {
      requirePlayback()
      if (typeof next !== 'boolean') {
        throw new BridgeError('INVALID_ARGUMENT', 'shuffling must be a boolean')
      }
      shuffling = next
      emitPlayback()
    },
    async setRepeat(next) {
      requirePlayback()
      if (typeof next !== 'boolean') {
        throw new BridgeError('INVALID_ARGUMENT', 'repeating must be a boolean')
      }
      // A toggle, not a cycle: Spotify exposes only a boolean (R-109).
      repeating = next
      emitPlayback()
    },
    onPlaybackStateChanged(cb) {
      playbackListeners.add(cb)
      if (playbackHandle === null) {
        playbackHandle = setInterval(() => {
          if (availability === 'playing') {
            const d = playback().durationMs ?? 0
            positionMs = Math.min(positionMs + 1000, d)
          }
          emitPlayback()
        }, 1000)
      }
      return () => {
        playbackListeners.delete(cb)
        if (playbackListeners.size === 0 && playbackHandle !== null) {
          clearInterval(playbackHandle)
          playbackHandle = null
        }
      }
    },

    async listNotes() {
      return notes.map((n) => ({ ...n })).sort((a, b) => b.updatedAt - a.updatedAt)
    },
    async createNote() {
      const note: Note = { id: `n${noteSeq++}`, content: '', createdAt: Date.now(), updatedAt: Date.now() }
      notes = [note, ...notes]
      return { ...note }
    },
    async updateNote(id, content) {
      const found = notes.find((n) => n.id === id)
      if (!found) throw new BridgeError('FILE_NOT_FOUND', 'That note no longer exists.')
      found.content = content
      found.updatedAt = Date.now()
      return { ...found }
    },
    async deleteNote(id) {
      notes = notes.filter((n) => n.id !== id)
    },
    async flushNotes() {
      /* in-memory: nothing to flush */
    },

    async getPreferences() {
      return { ...prefs, previews: { ...prefs.previews } }
    },
    async updatePreferences(patch) {
      prefs = mergeForMock(prefs, patch)
      return { ...prefs, previews: { ...prefs.previews } }
    },
    async setTimerShortcut(accelerator) {
      // A binding another app already owns must be reachable in browser mode too.
      if (accelerator === 'Command+Space') return false
      prefs = { ...prefs, timerShortcut: accelerator }
      return true
    },

    async closePanel() {
      /* no panel to close in a browser tab */
    },
    onPanelShown(cb) {
      panelListeners.add(cb)
      return () => panelListeners.delete(cb) as unknown as void
    },

    async quitApp() {
      // Cannot exit a browser tab; record it so tests can assert the call.
      quit = true
    },

    getEnvironment: () => 'browser',
    supportsNativeFeatures: () => false,

    __mock: {
      lastClipboardMode: () => clipboardMode,
      setDeleteFails(fails) {
        deleteFails = fails
      },
      setArtworkMissing(missing) {
        artworkMissing = missing
        emitPlayback()
      },
      didQuit: () => quit,
      lastDragIds: () => (dragIds ? [...dragIds] : null),
      addScreenshot() {
        const n = screenshots.length + 1
        screenshots = [
          {
            id: `/Users/mock/Desktop/Screenshot new ${n}.png`,
            path: `/Users/mock/Desktop/Screenshot new ${n}.png`,
            fileName: `Screenshot new ${n}.png`,
            capturedAt: Date.now(),
            thumbnailDataUrl: swatch((n * 57) % 360, `New ${n}`),
            width: 320,
            height: 200,
            isTemporary: false,
            isSeen: false
          },
          ...screenshots
        ].slice(0, MAX_SCREENSHOTS)
        emitScreenshots()
      },
      setSourceError(error) {
        sourceError = error
        emitScreenshots()
      },
      setPlaybackAvailability(next) {
        availability = next
        emitPlayback()
      },
      setNextFileMissing(missing) {
        nextFileMissing = missing
      }
    }
  }

  return bridge
}
