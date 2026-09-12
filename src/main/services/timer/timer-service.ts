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
  /** Announce the finish. Returns true if an alarm is now ringing (FR-090). */
  notify(): boolean | void
  /** Silence a ringing alarm. Optional: a caller with no alarm need not say so. */
  silence?(): void
  /**
   * Whether reaching zero starts the same duration again (FR-089).
   *
   * A getter, not a flag: the preference can change while a countdown is
   * already running, and reading it at the moment of finishing is what makes
   * the switch take effect on the timer in front of you rather than the next
   * one. Optional so callers that never repeat need not say so.
   */
  repeat?(): boolean
}

export interface TimerService {
  get(): TimerState
  start(durationMs: number): TimerState
  /** Silence the finish alarm, leaving the countdown itself alone (FR-090). */
  dismissAlarm(): TimerState
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
  let alarming = false

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
    remainingMs: remaining(),
    alarming
  })

  const silence = (): void => {
    if (!alarming) return
    alarming = false
    deps.silence?.()
  }

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

  /**
   * Put the countdown into the running state. Shared by `start` and by the
   * repeat path, so a repeated cycle is indistinguishable from a fresh start -
   * including resetting `notified`, without which the second cycle would reach
   * zero in silence.
   *
   * `silenceAlarm` is what separates the two callers. Starting a countdown by
   * hand means you have seen the alarm, so it stops. A repeat has not been
   * seen by anyone, so it must not silence itself - that would turn
   * "ring until dismissed" into "ring until the next cycle begins" whenever
   * both toggles are on.
   */
  const begin = (durationMs: number, silenceAlarm = true): void => {
    if (silenceAlarm) silence()
    configuredDurationMs = durationMs
    frozenRemainingMs = durationMs
    deadlineAt = deps.now() + durationMs
    status = 'running'
    notified = false
    scheduleTimers()
    emit()
  }

  const finish = (): void => {
    if (status === 'finished') return
    status = 'finished'
    deadlineAt = null
    frozenRemainingMs = 0
    clearTimers()
    if (!notified) {
      notified = true
      alarming = deps.notify() === true
    }
    emit()

    // Repeat AFTER the finished state has been emitted. The tray and the
    // readout both see zero, so a repeating countdown still shows that it
    // completed instead of silently snapping back to the full duration.
    //
    // The guard is not defensive dressing: a zero-length duration would make
    // this restart, immediately expire and restart again without ever yielding.
    if (deps.repeat?.() === true && configuredDurationMs > 0) begin(configuredDurationMs, false)
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
      begin(durationMs)
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
      silence()
      status = 'idle'
      deadlineAt = null
      frozenRemainingMs = configuredDurationMs
      notified = false
      clearTimers()
      emit()
      return snapshot()
    },

    dismissAlarm() {
      // Reconcile first, like get() and toggle(). Without it a deadline that
      // passed while nothing was observing would be settled by this very call
      // AFTER the alarming check, so Dismiss would arm the alarm it was asked
      // to silence.
      reconcile()
      if (!alarming) return snapshot()
      silence()

      // Dismiss also clears the countdown back to its configured duration, so
      // the timer is ready to run again instead of sitting at 0:00 needing a
      // separate Reset.
      //
      // NOT while a countdown is running, which with repeat on is the normal
      // case: finish() has already begun the next cycle by the time the user
      // reaches for Dismiss, and resetting here would destroy it - turning
      // "repeat until stopped" into "run exactly twice". Silencing is the whole
      // of what Dismiss means in that state.
      if (status !== 'running') {
        status = 'idle'
        deadlineAt = null
        frozenRemainingMs = configuredDurationMs
        notified = false
        clearTimers()
      }

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
      silence()
      clearTimers()
      listeners.clear()
    }
  }
}
