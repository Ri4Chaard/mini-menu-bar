/**
 * The panel's two-state machine, kept pure so it is testable without an
 * Electron runtime (constitution Principle IV).
 *
 * FR-002 requires three dismissal paths. Modelling them as distinct events
 * rather than one `close` keeps the reducer honest about which path fired,
 * which the window layer needs for focus restoration.
 */
export type PanelEvent = 'tray-click' | 'escape' | 'blur'

export interface PanelState {
  visible: boolean
  lastDismissal: PanelEvent | null
}

export const initialPanelState: PanelState = Object.freeze({
  visible: false,
  lastDismissal: null
})

export function panelReducer(state: PanelState, event: PanelEvent): PanelState {
  switch (event) {
    case 'tray-click':
      return state.visible
        ? { visible: false, lastDismissal: 'tray-click' }
        : { visible: true, lastDismissal: null }
    case 'escape':
    case 'blur':
      // Dismissal events while already collapsed are no-ops, not errors.
      return state.visible ? { visible: false, lastDismissal: event } : state
    default:
      return state
  }
}
