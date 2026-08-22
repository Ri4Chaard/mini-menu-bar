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
  screenshotsMarkSeen: 'screenshots:mark-seen',
  screenshotsSourceError: 'screenshots:source-error',
  screenshotsCopy: 'screenshots:copy',
  screenshotsDelete: 'screenshots:delete',
  screenshotsStartDrag: 'screenshots:start-drag',

  timerGet: 'timer:get',
  timerStart: 'timer:start',
  timerPause: 'timer:pause',
  timerResume: 'timer:resume',
  timerReset: 'timer:reset',

  spotifyGet: 'spotify:get',
  spotifyToggle: 'spotify:toggle',
  spotifyNext: 'spotify:next',
  spotifyPrevious: 'spotify:previous',
  spotifySeek: 'spotify:seek',
  spotifySubscribe: 'spotify:subscribe',
  spotifySetVolume: 'spotify:set-volume',
  spotifySetShuffle: 'spotify:set-shuffle',
  spotifySetRepeat: 'spotify:set-repeat',

  notesList: 'notes:list',
  notesCreate: 'notes:create',
  notesUpdate: 'notes:update',
  notesDelete: 'notes:delete',
  notesFlush: 'notes:flush',

  prefsGet: 'prefs:get',
  prefsUpdate: 'prefs:update',
  prefsSetShortcut: 'prefs:set-shortcut',

  panelClose: 'panel:close',

  appQuit: 'app:quit'
} as const

export const EVENT_CHANNELS = {
  screenshotsChanged: 'screenshots:changed',
  timerChanged: 'timer:changed',
  spotifyChanged: 'spotify:changed',
  panelShown: 'panel:shown'
} as const

export type InvokeChannel = (typeof INVOKE_CHANNELS)[keyof typeof INVOKE_CHANNELS]
export type EventChannel = (typeof EVENT_CHANNELS)[keyof typeof EVENT_CHANNELS]

export const ALL_INVOKE_CHANNELS: readonly InvokeChannel[] = Object.values(INVOKE_CHANNELS)
export const ALL_EVENT_CHANNELS: readonly EventChannel[] = Object.values(EVENT_CHANNELS)
