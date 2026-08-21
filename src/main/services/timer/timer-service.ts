/**
 * The countdown, owned by the main process.
 *
 * Two reasons this cannot live in the renderer (research.md R-004), both of
 * which would otherwise produce bugs that only surface after shipping:
 *
 *  1. `menubar` hides the panel window rather than destroying it, and Chromium
 *     throttles hidden windows to roughly one tick a minute. A renderer-owned
 *     setInterval would make FR-017 silently fail.
 *  2. A tick-accumulating timer loses however long the machine slept. An
 *     absolute deadline compared against the clock is correct across sleep for
 *     free (FR-020).
 *
 * The clock and notifier are injected so the whole service is unit-testable
 * without an Electron runtime.
 */
import type { TimerState } from '@shared/types'

export interface TimerDeps {
  now(): number
  notify(): void
}

export interface TimerService {
  get(): TimerState
  start(durationMs: number): TimerState
  pause(): TimerState
  resume(): TimerState
  reset(): TimerState
  /** Single-keystroke start/pause for the global shortcut (FR-019). */
  toggle(): TimerState
  /** Called on powerMonitor 'resume' so a timer that expired during sleep fires. */
  onResume(): void
  onChange(cb: (state: TimerState) => void): () => void
  stop(): void
}

const DEFAULT_DURATION = 5 * 60 * 1000

export function createTimerService(deps: TimerDeps): TimerService {
  let status: TimerState['status'] = 'idle'
  let configuredDurationMs = DEFAULT_DURATION
  let deadlineAt: number | null = null
  let frozenRemainingMs = DEFAULT_DURATION
  let notified = false

  const listeners = new Set<(state: TimerState) => void>()
  let tick: ReturnType<typeof setInterval> | null = null
  let fuse: ReturnType<typeof setTimeout> | null = null

  const remaining = (): number =>
    status === 'running' && deadlineAt !== null
      ? Math.max(0, deadlineAt - deps.now())
      : frozenRemainingMs

  const snapshot = (): TimerState => ({
    status,
    configuredDurationMs,
    deadlineAt: status === 'running' ? deadlineAt : null,
    remainingMs: remaining()
  })

  const emit = (): void => {
    const state = snapshot()
    for (const cb of listeners) cb(state)
  }

  const clearTimers = (): void => {
    if (tick !== null) {
      clearInterval(tick)
      tick = null
    }
    if (fuse !== null) {
      clearTimeout(fuse)
      fuse = null
    }
  }

  const finish = (): void => {
    if (status === 'finished') return
    status = 'finished'
    deadlineAt = null
    frozenRemainingMs = 0
    clearTimers()
    if (!notified) {
      notified = true
      deps.notify()
    }
    emit()
  }

  /** Settle any deadline that has already passed, e.g. after sleep. */
  const reconcile = (): void => {
    if (status === 'running' && deadlineAt !== null && deps.now() >= deadlineAt) finish()
  }

  const scheduleTimers = (): void => {
    clearTimers()
    if (status !== 'running' || deadlineAt === null) return

    // A single fuse to the deadline is the only timer required when nothing is
    // observing — no 1 Hz work while the panel is closed and no preview is on.
    fuse = setTimeout(() => finish(), Math.max(0, deadlineAt - deps.now()))
    if (typeof fuse.unref === 'function') fuse.unref()

    if (listeners.size > 0) {
      tick = setInterval(() => {
        reconcile()
        if (status === 'running') emit()
      }, 1000)
      if (typeof tick.unref === 'function') tick.unref()
    }
  }

  return {
    get() {
      reconcile()
      return snapshot()
    },

    start(durationMs) {
      configuredDurationMs = durationMs
      frozenRemainingMs = durationMs
      deadlineAt = deps.now() + durationMs
      status = 'running'
      notified = false
      scheduleTimers()
      emit()
      return snapshot()
    },

    pause() {
      // No-op from idle or finished (data-model.md).
      if (status !== 'running') return snapshot()
      frozenRemainingMs = remaining()
      status = 'paused'
      deadlineAt = null
      clearTimers()
      emit()
      return snapshot()
    },

    resume() {
      if (status !== 'paused') return snapshot()
      deadlineAt = deps.now() + frozenRemainingMs
      status = 'running'
      scheduleTimers()
      emit()
      return snapshot()
    },

    reset() {
      status = 'idle'
      deadlineAt = null
      frozenRemainingMs = configuredDurationMs
      notified = false
      clearTimers()
      emit()
      return snapshot()
    },

    toggle() {
      reconcile()
      if (status === 'running') return this.pause()
      if (status === 'paused') return this.resume()
      return this.start(configuredDurationMs)
    },

    onResume() {
      reconcile()
      scheduleTimers()
    },

    onChange(cb) {
      listeners.add(cb)
      scheduleTimers()
      return () => {
        listeners.delete(cb)
        // Drop back to the single fuse when nobody is watching.
        scheduleTimers()
      }
    },

    stop() {
      clearTimers()
      listeners.clear()
    }
  }
}
