/**
 * Wires the pure panel state machine to the menubar-managed BrowserWindow.
 *
 * `menubar` hides the window rather than destroying it, which is why the timer
 * lives in the main process (research.md R-004) - a renderer-owned countdown
 * would be throttled while hidden.
 */
import { app } from 'electron'
import type { Menubar } from 'menubar'
import { EVENT_CHANNELS } from '@shared/channels'
import { initialPanelState, panelReducer, type PanelEvent, type PanelState } from './panel-state'

export interface PanelController {
  handle(event: PanelEvent): void
  state(): PanelState
  close(): void
  /**
   * Show the panel regardless of what it is currently doing.
   *
   * Deliberately not a `tray-click`, which TOGGLES: an alarm that fires while
   * the panel happens to be open would close it, hiding the one control the
   * user needs. Idempotent, so repeated calls are harmless.
   */
  show(): void
  /**
   * Ignore focus loss for the next `ms`. Used by the one operation that
   * deliberately hands focus elsewhere - dragging a file out - where FR-002's
   * "activating another application dismisses the panel" would otherwise hide
   * the very window that owns the drag, cancelling it.
   */
  suppressDismissal(ms: number): void
}

/**
 * Grace period after showing during which focus loss is ignored.
 *
 * A menu bar app runs as an accessory (LSUIElement, no Dock icon), so macOS
 * often hands focus straight back to the previously active application in the
 * moments after the panel appears. Treating that as a dismissal is what made
 * the panel vanish as soon as the pointer moved away.
 */
const FOCUS_GRACE_MS = 400

export function createPanelController(mb: Menubar): PanelController {
  let state: PanelState = initialPanelState
  let shownAt = 0
  let everFocused = false
  let suppressedUntil = 0

  const apply = (next: PanelState): void => {
    if (next.visible === state.visible) {
      state = next
      return
    }
    state = next
    if (next.visible) void mb.showWindow()
    else mb.hideWindow()
  }

  const controller: PanelController = {
    handle(event) {
      apply(panelReducer(state, event))
    },
    state: () => state,
    close() {
      apply(panelReducer(state, 'escape'))
    },
    show() {
      if (state.visible) return
      apply({ visible: true, lastDismissal: null })
    },
    suppressDismissal(ms) {
      // Bounded, and never shortened by a later shorter request. An unbounded
      // hold would leave the panel unable to dismiss at all if the drag were
      // abandoned - Electron reports no drag-finished event to release it on.
      suppressedUntil = Math.max(suppressedUntil, Date.now() + ms)
    }
  }

  mb.on('after-show', () => {
    state = { visible: true, lastDismissal: null }
    shownAt = Date.now()
    everFocused = false
    suppressedUntil = 0

    const window = mb.window
    if (window) {
      // Activate the APPLICATION, not just the window.
      //
      // window.focus() alone gives the panel keyboard focus but leaves the
      // system menu bar owned by whatever app was frontmost - so the menu bar
      // keeps following that app and disappears when the pointer moves away,
      // even though our panel is still open. An accessory app (LSUIElement, no
      // Dock icon) has to activate explicitly, and menubar makes this worse by
      // calling setVisibleOnAllWorkspaces with skipTransformProcessType, which
      // deliberately skips the transform that would otherwise activate us.
      //
      // Activating means the menu bar belongs to this app for as long as the
      // panel is open, which is the requested behaviour: while the panel is
      // open, the menu bar cannot go away.
      app.focus({ steal: true })
      window.focus()
      window.once('focus', () => {
        everFocused = true
      })
    }
    window?.webContents.send(EVENT_CHANNELS.panelShown)
  })

  mb.on('after-hide', () => {
    state = { visible: false, lastDismissal: state.lastDismissal ?? 'tray-click' }
  })

  /**
   * With `alwaysOnTop` set, menubar emits this instead of hiding the window on
   * its own 100 ms blur timer, which leaves the decision here.
   *
   * FR-002 still holds - activating another application dismisses the panel -
   * but only genuine focus loss counts. Blur inside the grace period, or before
   * the window ever held focus, is the accessory-app artefact described above
   * and is ignored.
   */
  mb.on('focus-lost', () => {
    if (!state.visible) return
    if (!everFocused) return
    if (Date.now() - shownAt < FOCUS_GRACE_MS) return
    if (Date.now() < suppressedUntil) return
    controller.handle('blur')
  })

  return controller
}
