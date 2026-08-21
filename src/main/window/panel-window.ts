/**
 * Wires the pure panel state machine to the menubar-managed BrowserWindow.
 *
 * `menubar` hides the window rather than destroying it, which is why the timer
 * lives in the main process (research.md R-004) — a renderer-owned countdown
 * would be throttled while hidden.
 */
import type { BrowserWindow } from 'electron'
import type { Menubar } from 'menubar'
import { EVENT_CHANNELS } from '@shared/channels'
import { initialPanelState, panelReducer, type PanelEvent, type PanelState } from './panel-state'

export interface PanelController {
  handle(event: PanelEvent): void
  state(): PanelState
  close(): void
}

export function createPanelController(mb: Menubar): PanelController {
  let state: PanelState = initialPanelState

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
    }
  }

  // menubar drives show/hide itself on tray click; mirror its result into our
  // state so the machine and the window never disagree.
  mb.on('after-show', () => {
    state = { visible: true, lastDismissal: null }
    mb.window?.webContents.send(EVENT_CHANNELS.panelShown)
  })
  mb.on('after-hide', () => {
    state = { visible: false, lastDismissal: state.lastDismissal ?? 'tray-click' }
  })

  return controller
}

/**
 * FR-002 blur dismissal. menubar's own `alwaysOnTop: false` handling covers the
 * common case, but an explicit blur listener is required so the panel also
 * dismisses when focus moves to another app without a click landing on it.
 */
export function attachBlurDismissal(window: BrowserWindow, controller: PanelController): void {
  window.on('blur', () => {
    if (!window.webContents.isDevToolsFocused()) controller.handle('blur')
  })
}
