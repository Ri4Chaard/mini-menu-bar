/**
 * The real host binding.
 *
 * This is the ONLY file in the renderer permitted to reference the
 * preload-exposed global — enforced by an ESLint rule, not convention
 * (constitution Principle I).
 */
import { EVENT_CHANNELS, INVOKE_CHANNELS } from '@shared/channels'
import type {
  Preferences,
  ScreenshotEntry,
  SourceError,
  TimerState
} from '@shared/types'
import type { HostBridge, Unsubscribe } from './host-contract'

interface RawBridge {
  invoke(channel: string, payload?: unknown): Promise<unknown>
  subscribe(channel: string, cb: (payload: unknown) => void): () => void
}

function raw(): RawBridge | null {
  const candidate = (window as unknown as { __hostBridge?: RawBridge }).__hostBridge
  return candidate && typeof candidate.invoke === 'function' ? candidate : null
}

export function isElectronHostAvailable(): boolean {
  return raw() !== null
}

export function createElectronBridge(): HostBridge {
  const bridge = raw()
  if (!bridge) throw new Error('Electron host bridge is not available')

  const call = <T>(channel: string, payload?: unknown): Promise<T> =>
    bridge.invoke(channel, payload) as Promise<T>

  const on = <T>(channel: string, cb: (value: T) => void): Unsubscribe =>
    bridge.subscribe(channel, (payload) => cb(payload as T))

  return {
    listScreenshots: () => call<ScreenshotEntry[]>(INVOKE_CHANNELS.screenshotsList),
    openScreenshot: (id) => call<void>(INVOKE_CHANNELS.screenshotsOpen, { id }),
    revealScreenshot: (id) => call<void>(INVOKE_CHANNELS.screenshotsReveal, { id }),
    getScreenshotSourceError: () => call<SourceError | null>(INVOKE_CHANNELS.screenshotsSourceError),
    deleteScreenshots: (ids) => call<void>(INVOKE_CHANNELS.screenshotsDelete, { ids }),
    startScreenshotDrag: (ids) => call<void>(INVOKE_CHANNELS.screenshotsStartDrag, { ids }),
    onScreenshotsChanged: (cb) => on<ScreenshotEntry[]>(EVENT_CHANNELS.screenshotsChanged, cb),

    getTimerState: () => call<TimerState>(INVOKE_CHANNELS.timerGet),
    startTimer: (durationMs) => call<TimerState>(INVOKE_CHANNELS.timerStart, { durationMs }),
    pauseTimer: () => call<TimerState>(INVOKE_CHANNELS.timerPause),
    resumeTimer: () => call<TimerState>(INVOKE_CHANNELS.timerResume),
    resetTimer: () => call<TimerState>(INVOKE_CHANNELS.timerReset),
    dismissTimerAlarm: () => call<TimerState>(INVOKE_CHANNELS.timerDismissAlarm),
    onTimerStateChanged: (cb) => on<TimerState>(EVENT_CHANNELS.timerChanged, cb),

    getPreferences: () => call<Preferences>(INVOKE_CHANNELS.prefsGet),
    updatePreferences: (patch) => call<Preferences>(INVOKE_CHANNELS.prefsUpdate, patch),
    setTimerShortcut: (accelerator) =>
      call<boolean>(INVOKE_CHANNELS.prefsSetShortcut, { accelerator }),

    closePanel: () => call<void>(INVOKE_CHANNELS.panelClose),
    quitApp: () => call<void>(INVOKE_CHANNELS.appQuit),
    onPanelShown: (cb) => on<void>(EVENT_CHANNELS.panelShown, () => cb()),

    getEnvironment: () => 'electron',
    supportsNativeFeatures: () => true
  }
}
