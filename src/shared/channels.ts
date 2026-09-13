/**
 * The authoritative IPC channel enumeration.
 *
 * The constitution forbids wildcard or dynamically-named channels, and requires
 * this list to match contracts/ipc-channels.md exactly. A channel absent from
 * here MUST NOT be registered.
 */

export const INVOKE_CHANNELS = {
  screenshotsList: 'screenshots:list',
  screenshotsOpen: 'screenshots:open',
  screenshotsReveal: 'screenshots:reveal',
  screenshotsSourceError: 'screenshots:source-error',
  screenshotsDelete: 'screenshots:delete',
  screenshotsStartDrag: 'screenshots:start-drag',

  timerGet: 'timer:get',
  timerStart: 'timer:start',
  timerPause: 'timer:pause',
  timerResume: 'timer:resume',
  timerReset: 'timer:reset',
  timerDismissAlarm: 'timer:dismiss-alarm',

  prefsGet: 'prefs:get',
  prefsUpdate: 'prefs:update',
  prefsSetShortcut: 'prefs:set-shortcut',
  prefsSetPanelShortcut: 'prefs:set-panel-shortcut',

  panelClose: 'panel:close',

  appQuit: 'app:quit',
  appGetVersion: 'app:get-version',
  appCheckUpdates: 'app:check-updates',
  appOpenReleases: 'app:open-releases'
} as const

export const EVENT_CHANNELS = {
  screenshotsChanged: 'screenshots:changed',
  timerChanged: 'timer:changed',
  panelShown: 'panel:shown'
} as const

export type InvokeChannel = (typeof INVOKE_CHANNELS)[keyof typeof INVOKE_CHANNELS]
export type EventChannel = (typeof EVENT_CHANNELS)[keyof typeof EVENT_CHANNELS]

export const ALL_INVOKE_CHANNELS: readonly InvokeChannel[] = Object.values(INVOKE_CHANNELS)
export const ALL_EVENT_CHANNELS: readonly EventChannel[] = Object.values(EVENT_CHANNELS)
