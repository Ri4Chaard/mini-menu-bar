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

function seedScreenshots(now: number): ScreenshotEntry[] {
  return [
    { label: 'Design review', hue: 210, ago: 2 * MINUTE },
    { label: 'Bug repro', hue: 12, ago: 26 * MINUTE },
    { label: 'Invoice', hue: 140, ago: 3 * 60 * MINUTE },
    { label: 'Chat thread', hue: 280, ago: 9 * 60 * MINUTE },
    { label: 'Old mockup', hue: 45, ago: 52 * 60 * MINUTE }
  ].map((s, i) => ({
    id: `/Users/mock/Desktop/Screenshot ${i + 1}.png`,
    path: `/Users/mock/Desktop/Screenshot ${i + 1}.png`,
    fileName: `Screenshot ${i + 1}.png`,
    capturedAt: now - s.ago,
    thumbnailDataUrl: swatch(s.hue, s.label),
    width: 320,
    height: 200,
    isSeen: i > 1
  }))
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
}

export function createMockBridge(): HostBridge & { __mock: MockControls } {
  const now = Date.now()
  let screenshots = seedScreenshots(now)
  let sourceError: SourceError | null = null
  let nextFileMissing = false
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
    remainingMs: prefs.timerDurationMs
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
      timer = { ...timer, status: 'finished', deadlineAt: null, remainingMs: 0 }
      stopTicking()
      for (const cb of timerListeners) cb({ ...timer })
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

  const playback = (): PlaybackState => {
    if (availability === 'not-running' || availability === 'permission-denied') {
      return { availability, trackName: null, artist: null, positionMs: null, durationMs: null }
    }
    const t = MOCK_TRACKS[trackIndex % MOCK_TRACKS.length]!
    return { availability, trackName: t.trackName, artist: t.artist, positionMs, durationMs: t.durationMs }
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
    onScreenshotsChanged(cb) {
      screenshotListeners.add(cb)
      return () => screenshotListeners.delete(cb) as unknown as void
    },

    async getTimerState() {
      return projectTimer()
    },
    async startTimer(durationMs) {
      timer = {
        status: 'running',
        configuredDurationMs: durationMs,
        deadlineAt: Date.now() + durationMs,
        remainingMs: durationMs
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
        remainingMs: timer.configuredDurationMs
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

    getEnvironment: () => 'browser',
    supportsNativeFeatures: () => false,

    __mock: {
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
