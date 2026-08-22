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
  clamp,
  requireBoolean,
  requireId,
  requireNullableString,
  requirePositiveDuration,
  requireFiniteNumber,
  requireIdArray,
  requireObject,
  requireString,
  requireVolume
} from './validate'
import { MAX_SCREENSHOTS, type Preferences } from '@shared/types'
import type { PreferencesService } from '../services/preferences/preferences-service'
import type { ScreenshotService } from '../services/screenshots/screenshot-store'
import type { TimerService } from '../services/timer/timer-service'
import type { PlaybackService } from '../services/spotify/playback-service'
import type { NotesService } from '../services/notes/notes-service'
import type { ShortcutService } from '../services/shortcuts/shortcut-service'
import type { PanelController } from '../window/panel-window'

export interface AppServices {
  preferences: PreferencesService
  panel: PanelController
  screenshots?: ScreenshotService
  timer?: TimerService
  playback?: PlaybackService
  notes?: NotesService
  shortcuts?: ShortcutService
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
    [INVOKE_CHANNELS.screenshotsMarkSeen]: () => need(services.screenshots, 'Screenshots').markSeen(),
    [INVOKE_CHANNELS.screenshotsSourceError]: () =>
      need(services.screenshots, 'Screenshots').sourceError(),
    [INVOKE_CHANNELS.screenshotsCopy]: (p) =>
      // Ids, not paths - main resolves them against its own store.
      need(services.screenshots, 'Screenshots').copy(requireIdArray(p, MAX_SCREENSHOTS)),
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

    // ---- Spotify -----------------------------------------------------------
    [INVOKE_CHANNELS.spotifyGet]: () => need(services.playback, 'Spotify').get(),
    [INVOKE_CHANNELS.spotifyToggle]: () => need(services.playback, 'Spotify').toggle(),
    [INVOKE_CHANNELS.spotifyNext]: () => need(services.playback, 'Spotify').next(),
    [INVOKE_CHANNELS.spotifyPrevious]: () => need(services.playback, 'Spotify').previous(),
    [INVOKE_CHANNELS.spotifySeek]: async (p) => {
      const service = need(services.playback, 'Spotify')
      const requested = requireFiniteNumber(p, 'positionMs')
      const state = await service.get()
      // Clamp to [0, duration] before it reaches AppleScript.
      await service.seek(clamp(requested, 0, state.durationMs ?? 0))
    },
    [INVOKE_CHANNELS.spotifySubscribe]: (p) =>
      need(services.playback, 'Spotify').setSubscribed(requireBoolean(p, 'active')),
    [INVOKE_CHANNELS.spotifySetVolume]: (p) =>
      need(services.playback, 'Spotify').setVolume(requireVolume(p)),
    [INVOKE_CHANNELS.spotifySetShuffle]: (p) =>
      need(services.playback, 'Spotify').setShuffle(requireBoolean(p, 'shuffling')),
    [INVOKE_CHANNELS.spotifySetRepeat]: (p) =>
      need(services.playback, 'Spotify').setRepeat(requireBoolean(p, 'repeating')),

    // ---- Notes -------------------------------------------------------------
    [INVOKE_CHANNELS.notesList]: () => need(services.notes, 'Notes').list(),
    [INVOKE_CHANNELS.notesCreate]: () => need(services.notes, 'Notes').create(),
    [INVOKE_CHANNELS.notesUpdate]: (p) =>
      need(services.notes, 'Notes').update(requireId(p), requireString(p, 'content')),
    [INVOKE_CHANNELS.notesDelete]: (p) => need(services.notes, 'Notes').remove(requireId(p)),
    [INVOKE_CHANNELS.notesFlush]: () => need(services.notes, 'Notes').flush(),

    // ---- Preferences -------------------------------------------------------
    [INVOKE_CHANNELS.prefsGet]: () => services.preferences.get(),
    [INVOKE_CHANNELS.prefsUpdate]: (p) =>
      // Merge, never replace, so a partial patch cannot blank unrelated settings.
      services.preferences.update(requireObject(p, 'patch') as Partial<Preferences>),
    [INVOKE_CHANNELS.prefsSetShortcut]: (p) =>
      need(services.shortcuts, 'Shortcuts').rebind(requireNullableString(p, 'accelerator')),

    // ---- Panel -------------------------------------------------------------
    [INVOKE_CHANNELS.panelClose]: () => services.panel.close(),

    // ---- App ---------------------------------------------------------------
    // The app is an accessory (LSUIElement): no Dock icon, no application
    // menu, so without this channel there is no way out but Activity Monitor
    // (research.md R-113). No confirmation, matching every other menu bar
    // utility.
    [INVOKE_CHANNELS.appQuit]: () => app.quit()
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
