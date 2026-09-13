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
  type Preferences,
  type ScreenshotEntry,
  type SourceError,
  type TimerState,
  type UpdateCheckResult
} from '@shared/types'
import { isNewer } from '@shared/semver'
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
      isTemporary: s.staged
    }
  })
}

export interface MockControls {
  /** Simulate a new screenshot arriving, so onScreenshotsChanged is exercised. */
  addScreenshot(): void
  /** Force the screenshots source into an error state (FR-015). */
  setSourceError(error: SourceError | null): void
  /** Make the next screenshot open/reveal fail with FILE_NOT_FOUND. */
  setNextFileMissing(missing: boolean): void
  /** Make every delete fail, so the all-failed path is reachable (Principle I). */
  setDeleteFails(fails: boolean): void
  /** True once quitApp was called - the mock cannot actually exit. */
  didQuit(): boolean
  /** Which ids the last drag carried, so the selection rule is assertable. */
  lastDragIds(): string[] | null
  /**
   * Choose what the next update check does.
   *
   * All three outcomes are reachable because a mock that only succeeds proves
   * nothing (contracts/host-bridge.md). 'offline' rejects rather than resolving
   * with a failure shape, matching the host.
   */
  setUpdateOutcome(outcome: UpdateOutcome): void
  /** True once openReleasesPage was called - the mock opens no tab. */
  didOpenReleases(): boolean
}

export type UpdateOutcome =
  | { kind: 'up-to-date' }
  | { kind: 'available'; latestVersion: string }
  | { kind: 'offline' }

/**
 * Deliberately not a plausible release number. Browser mode showing 0.0.0-mock
 * is what makes it obvious at a glance that this is not a packaged build.
 */
const MOCK_VERSION = '0.0.0-mock'

export function createMockBridge(): HostBridge & { __mock: MockControls } {
  let updateOutcome: UpdateOutcome = { kind: 'up-to-date' }
  let openedReleases = false
  const now = Date.now()
  let screenshots = seedScreenshots(now)
  let sourceError: SourceError | null = null
  let nextFileMissing = false
  let deleteFails = false
  let dragIds: string[] | null = null
  let quit = false
  let prefs: Preferences = { ...DEFAULT_PREFERENCES, previews: { ...DEFAULT_PREFERENCES.previews } }

  const screenshotListeners = new Set<(e: ScreenshotEntry[]) => void>()
  const timerListeners = new Set<(s: TimerState) => void>()
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

  /**
   * Settle a deadline that has already passed.
   *
   * The host reconciles on demand inside get() and dismissAlarm(), so a timer
   * that expired while nothing was observing is already 'finished' by the time
   * it is asked about. Without the same step here the mock only ever settles
   * while a subscriber keeps it ticking, and browser mode would disagree with
   * the host about whether the alarm is ringing (Principle I).
   */
  const reconcileTimer = (): void => {
    if (timer.status !== 'running' || timer.deadlineAt === null) return
    if (Date.now() < timer.deadlineAt) return
    emitTimer()
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

  const findScreenshot = (id: string): ScreenshotEntry => {
    const found = screenshots.find((s) => s.id === id)
    if (!found || nextFileMissing) {
      throw new BridgeError('FILE_NOT_FOUND', 'That screenshot is no longer available.')
    }
    return found
  }

  const snapshot = (): ScreenshotEntry[] => screenshots.map((s) => ({ ...s }))

  const emitScreenshots = (): void => {
    const list = snapshot()
    for (const cb of screenshotListeners) cb(list)
  }

  const bridge: HostBridge & { __mock: MockControls } = {
    async listScreenshots() {
      if (sourceError) throw new BridgeError('PERMISSION_DENIED', sourceError.message)
      return snapshot()
    },
    async openScreenshot(id) {
      findScreenshot(id)
    },
    async revealScreenshot(id) {
      findScreenshot(id)
    },
    async getScreenshotSourceError() {
      return sourceError
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
      reconcileTimer()
      return projectTimer()
    },
    async dismissTimerAlarm() {
      reconcileTimer()
      if (!timer.alarming) return projectTimer()

      // Mirrors the host: dismissing silences AND clears the countdown back to
      // its configured duration, so the timer is ready to start again - except
      // while a repeat cycle is already running, where resetting would destroy
      // the countdown the user can see ticking.
      timer =
        timer.status === 'running'
          ? { ...timer, alarming: false }
          : {
              ...timer,
              alarming: false,
              status: 'idle',
              deadlineAt: null,
              remainingMs: timer.configuredDurationMs
            }
      stopTicking()
      emitTimer()
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

    async getAppVersion() {
      return MOCK_VERSION
    },

    async checkForUpdates() {
      if (updateOutcome.kind === 'offline') {
        throw new BridgeError('NETWORK_UNAVAILABLE', "Couldn't reach the update server.")
      }
      const latestVersion =
        updateOutcome.kind === 'available' ? updateOutcome.latestVersion : MOCK_VERSION
      return {
        // Through the same isNewer the host uses, so browser mode and the host
        // cannot quietly disagree about what "newer" means.
        status: isNewer(latestVersion, MOCK_VERSION) ? 'update-available' : 'up-to-date',
        currentVersion: MOCK_VERSION,
        latestVersion,
        publishedAt: updateOutcome.kind === 'available' ? Date.now() - 86_400_000 : null,
        checkedAt: Date.now()
      } satisfies UpdateCheckResult
    },

    async openReleasesPage() {
      openedReleases = true
    },

    getEnvironment: () => 'browser',
    supportsNativeFeatures: () => false,

    __mock: {
      setUpdateOutcome(outcome) {
        updateOutcome = outcome
      },
      didOpenReleases: () => openedReleases,
      setDeleteFails(fails) {
        deleteFails = fails
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
            isTemporary: false
          },
          ...screenshots
        ].slice(0, MAX_SCREENSHOTS)
        emitScreenshots()
      },
      setSourceError(error) {
        sourceError = error
        emitScreenshots()
      },
      setNextFileMissing(missing) {
        nextFileMissing = missing
      }
    }
  }

  return bridge
}
