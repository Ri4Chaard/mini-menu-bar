/**
 * Main process entry point.
 *
 * Owns the Tray, window lifecycle, and every OS integration. The renderer never
 * sees any of this - it reaches the host only through the preload bridge
 * (constitution: Process model).
 */
import { app, nativeImage, powerMonitor, shell } from 'electron'
import { menubar } from 'menubar'
import { join } from 'node:path'
import { EVENT_CHANNELS } from '@shared/channels'
import { registerIpcHandlers, type AppServices } from './ipc/register'
import { createPanelController } from './window/panel-window'
import { createPreferencesService } from './services/preferences/preferences-service'
import { createScreenshotService } from './services/screenshots/screenshot-store'
import { createTimerService } from './services/timer/timer-service'
import { createNotificationService } from './services/notifications/notification-service'
import { createShortcutService } from './services/shortcuts/shortcut-service'
import { createTrayController } from './tray/tray-controller'

const isDev = !app.isPackaged
const RESOURCES = isDev ? join(__dirname, '../../resources') : join(process.resourcesPath, 'resources')

// A menu bar utility has no Dock presence.
app.dock?.hide()

/**
 * Constitution, Security: deny new windows and any navigation to a non-local
 * origin. This runs before any window exists so nothing can slip through.
 */
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    // External links open in the user's browser, never inside the app.
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => {
    const isLocal = url.startsWith('file://') || url.startsWith('http://localhost')
    if (!isLocal) event.preventDefault()
  })
})

async function bootstrap(): Promise<void> {
  const preferences = createPreferencesService()
  await preferences.load()

  const trayIcon = nativeImage.createFromPath(join(RESOURCES, 'trayTemplate.png'))
  trayIcon.setTemplateImage(true)

  const mb = menubar({
    index: isDev && process.env.ELECTRON_RENDERER_URL
      ? process.env.ELECTRON_RENDERER_URL
      : `file://${join(__dirname, '../renderer/index.html')}`,
    icon: trayIcon,
    preloadWindow: true,
    showDockIcon: false,
    browserWindow: {
      // Panel UI v2: the design frames are 1:1 logical points, not a 2x
      // rendering - the 15 pt titles and the band arithmetic summing to exactly
      // 235 both settle it (research.md R-101). Wider and much shorter than v1.
      width: 632,
      height: 235,
      resizable: false,
      // Required so menubar emits 'focus-lost' instead of hiding the panel on
      // its own 100 ms blur timer. Dismissal is decided in panel-window.ts.
      alwaysOnTop: true,
      // Constitution, Security. These three are non-negotiable.
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true
      }
    }
  })

  mb.on('ready', async () => {
    const panel = createPanelController(mb)

    const send = (channel: string, payload?: unknown): void => {
      const target = mb.window
      if (target && !target.isDestroyed()) target.webContents.send(channel, payload)
    }

    // ---- Services -------------------------------------------------------
    const notifications = createNotificationService()
    const screenshots = createScreenshotService()
    const timer = createTimerService({
      now: () => Date.now(),
      // Both read at the moment of finishing rather than captured here, so
      // toggling the bell or repeat affects the countdown already running.
      notify: () => notifications.timerFinished({ alarm: preferences.get().timerAlarm }),
      silence: () => notifications.stopAlarm(),
      repeat: () => preferences.get().timerRepeat
    })
    const shortcuts = createShortcutService(preferences, () => {
      const state = timer.toggle()
      send(EVENT_CHANNELS.timerChanged, state)
      tray.setTimer(state)
    })

    const tray = createTrayController({
      tray: mb.tray,
      preferences,
      screenshots,
      defaultImage: trayIcon
    })

    // ---- Wiring ---------------------------------------------------------
    screenshots.onChange((entries) => {
      send(EVENT_CHANNELS.screenshotsChanged, entries)
      void tray.refresh()
    })
    timer.onChange((state) => {
      send(EVENT_CHANNELS.timerChanged, state)
      tray.setTimer(state)
    })
    preferences.onChange(() => {
      void tray.refresh()
    })

    // A timer that expired while the machine slept must notify on wake, and the
    // screenshot location may have changed in the meantime (R-003, R-004).
    powerMonitor.on('resume', () => {
      timer.onResume()
      void screenshots.refreshLocation()
    })

    registerIpcHandlers({ preferences, panel, screenshots, timer, shortcuts } satisfies AppServices)

    await shortcuts.apply()
    await screenshots.start()
    await tray.refresh()

    app.on('before-quit', () => {
      shortcuts.dispose()
      screenshots.stop()
      timer.stop()
      tray.dispose()
    })
  })
}

void app.whenReady().then(bootstrap)

// A menu bar app stays alive with no windows open.
app.on('window-all-closed', () => {
  /* intentionally empty */
})
