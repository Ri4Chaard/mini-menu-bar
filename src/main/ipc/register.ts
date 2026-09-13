/**
 * IPC handler registration.
 *
 * Every handler validates its arguments before use — a sandboxed renderer is
 * still the least-trusted process in the app (contracts/ipc-channels.md).
 * Errors are normalised before crossing the boundary so raw Node errors never
 * leak paths or stack traces into the renderer.
 *
 * Services are optional so the app stays runnable at every delivery checkpoint:
 * a section whose story has not landed yet reports a clear message rather than
 * crashing the process.
 */
import { app, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { BridgeError, serializeError } from '@shared/errors'
import { INVOKE_CHANNELS, type InvokeChannel } from '@shared/channels'
import {
  requireId,
  requireNullableString,
  requirePositiveDuration,
  requireIdArray,
  requireObject
} from './validate'
import { MAX_SCREENSHOTS, type Preferences } from '@shared/types'
import type { PreferencesService } from '../services/preferences/preferences-service'
import type { ScreenshotService } from '../services/screenshots/screenshot-store'
import type { TimerService } from '../services/timer/timer-service'
import type { ShortcutService } from '../services/shortcuts/shortcut-service'
import type { PanelController } from '../window/panel-window'
import type { UpdateService } from '../services/updates/update-service'

export interface AppServices {
  preferences: PreferencesService
  panel: PanelController
  screenshots?: ScreenshotService
  timer?: TimerService
  shortcuts?: ShortcutService
  panelShortcut?: ShortcutService
  updates?: UpdateService
}

function need<T>(service: T | undefined, name: string): T {
  if (!service) {
    throw new BridgeError('UNKNOWN', `${name} is not available in this build yet.`)
  }
  return service
}

/**
 * The event is passed through because one channel genuinely needs it: a native
 * drag is started FROM a webContents, so `screenshots:start-drag` has to know
 * which one asked. Everything else ignores it.
 */
type Handler = (payload: unknown, event: IpcMainInvokeEvent) => unknown | Promise<unknown>

/**
 * How long focus loss is ignored after a drag begins.
 *
 * Electron reports no drag-finished event, so this is a bound rather than a
 * signal. It has to outlast a deliberate drag across the screen and stay short
 * enough that the panel still dismisses promptly once the drop is done.
 */
const DRAG_DISMISSAL_GRACE_MS = 6000

export function registerIpcHandlers(services: AppServices): void {
  const handlers: Record<InvokeChannel, Handler> = {
    // ---- Screenshots -------------------------------------------------------
    [INVOKE_CHANNELS.screenshotsList]: () => need(services.screenshots, 'Screenshots').list(),
    [INVOKE_CHANNELS.screenshotsOpen]: (p) =>
      // An id, resolved against main-process state. Never a renderer-supplied path.
      need(services.screenshots, 'Screenshots').open(requireId(p)),
    [INVOKE_CHANNELS.screenshotsReveal]: (p) =>
      need(services.screenshots, 'Screenshots').reveal(requireId(p)),
    [INVOKE_CHANNELS.screenshotsSourceError]: () =>
      need(services.screenshots, 'Screenshots').sourceError(),
    [INVOKE_CHANNELS.screenshotsDelete]: (p) =>
      need(services.screenshots, 'Screenshots').remove(requireIdArray(p, MAX_SCREENSHOTS)),
    [INVOKE_CHANNELS.screenshotsStartDrag]: async (p, event) => {
      const ids = requireIdArray(p, MAX_SCREENSHOTS)
      // Suppressed BEFORE the drag starts, not after: the drop target becoming
      // frontmost is the focus loss FR-002 would read as a dismissal, and
      // hiding the panel mid-drag cancels the drag with it.
      services.panel.suppressDismissal(DRAG_DISMISSAL_GRACE_MS)
      await need(services.screenshots, 'Screenshots').startDrag(ids, event.sender)
    },

    // ---- Timer -------------------------------------------------------------
    [INVOKE_CHANNELS.timerGet]: () => need(services.timer, 'Timer').get(),
    [INVOKE_CHANNELS.timerStart]: (p) =>
      need(services.timer, 'Timer').start(requirePositiveDuration(p, 'durationMs')),
    [INVOKE_CHANNELS.timerPause]: () => need(services.timer, 'Timer').pause(),
    [INVOKE_CHANNELS.timerResume]: () => need(services.timer, 'Timer').resume(),
    [INVOKE_CHANNELS.timerReset]: () => need(services.timer, 'Timer').reset(),
    [INVOKE_CHANNELS.timerDismissAlarm]: () => need(services.timer, 'Timer').dismissAlarm(),

    // ---- Preferences -------------------------------------------------------
    [INVOKE_CHANNELS.prefsGet]: () => services.preferences.get(),
    [INVOKE_CHANNELS.prefsUpdate]: (p) =>
      // Merge, never replace, so a partial patch cannot blank unrelated settings.
      services.preferences.update(requireObject(p, 'patch') as Partial<Preferences>),
    [INVOKE_CHANNELS.prefsSetShortcut]: (p) =>
      need(services.shortcuts, 'Shortcuts').rebind(requireNullableString(p, 'accelerator')),
    [INVOKE_CHANNELS.prefsSetPanelShortcut]: (p) =>
      need(services.panelShortcut, 'Shortcuts').rebind(requireNullableString(p, 'accelerator')),

    // ---- Panel -------------------------------------------------------------
    [INVOKE_CHANNELS.panelClose]: () => services.panel.close(),

    // ---- App ---------------------------------------------------------------
    // The app is an accessory (LSUIElement): no Dock icon, no application
    // menu, so without this channel there is no way out but Activity Monitor
    // (research.md R-113). No confirmation, matching every other menu bar
    // utility.
    [INVOKE_CHANNELS.appQuit]: () => app.quit(),

    // The version is its own channel rather than a field on the check result:
    // it has to render before, during and after a failed check, and when the
    // user never checks at all (contracts/ipc-channels.md).
    [INVOKE_CHANNELS.appGetVersion]: () => need(services.updates, 'Updates').getVersion(),
    [INVOKE_CHANNELS.appCheckUpdates]: () => need(services.updates, 'Updates').check(),
    [INVOKE_CHANNELS.appOpenReleases]: () =>
      // No payload: the renderer does not hold the address (FR-126).
      need(services.updates, 'Updates').openReleasesPage()
  }

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, async (event, payload: unknown) => {
      try {
        return await handler(payload, event)
      } catch (error) {
        // Normalise before crossing the boundary (contracts/host-bridge.md).
        // The original is kept as `cause` for main-process logs; only the
        // serialised shape travels to the renderer.
        throw new Error(serializeError(error), { cause: error })
      }
    })
  }
}
