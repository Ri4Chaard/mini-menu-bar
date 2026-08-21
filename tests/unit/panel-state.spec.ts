/**
 * Panel state machine — constitution Principle IV requires these to be written
 * FIRST and to fail before src/main/window/panel-state.ts exists.
 *
 * FR-002 requires three independent dismissal paths (icon toggle, Escape, blur).
 * Each has a separate code path in the real window, so each gets its own case.
 */
import { describe, it, expect } from 'vitest'
import { panelReducer, initialPanelState, type PanelEvent } from '../../src/main/window/panel-state'

const run = (events: PanelEvent[]) => events.reduce(panelReducer, initialPanelState)

describe('panel state machine', () => {
  it('starts collapsed', () => {
    expect(initialPanelState.visible).toBe(false)
  })

  it('expands on tray click', () => {
    expect(run(['tray-click']).visible).toBe(true)
  })

  it('collapses on a second tray click (FR-002: icon toggle)', () => {
    expect(run(['tray-click', 'tray-click']).visible).toBe(false)
  })

  it('collapses on Escape (FR-002)', () => {
    expect(run(['tray-click', 'escape']).visible).toBe(false)
  })

  it('collapses on blur (FR-002)', () => {
    expect(run(['tray-click', 'blur']).visible).toBe(false)
  })

  it('ignores Escape while already collapsed', () => {
    expect(run(['escape']).visible).toBe(false)
  })

  it('ignores blur while already collapsed', () => {
    expect(run(['blur']).visible).toBe(false)
  })

  it('toggles cleanly across many cycles', () => {
    expect(run(['tray-click', 'blur', 'tray-click', 'escape', 'tray-click']).visible).toBe(true)
  })

  it('records which dismissal path was last used, for focus restoration', () => {
    expect(run(['tray-click', 'escape']).lastDismissal).toBe('escape')
    expect(run(['tray-click', 'blur']).lastDismissal).toBe('blur')
    expect(run(['tray-click', 'tray-click']).lastDismissal).toBe('tray-click')
  })

  it('is a pure function — the same input never mutates prior state', () => {
    const open = panelReducer(initialPanelState, 'tray-click')
    panelReducer(open, 'escape')
    expect(open.visible).toBe(true)
    expect(initialPanelState.visible).toBe(false)
  })
})
