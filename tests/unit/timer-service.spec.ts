/**
 * Timer state machine — constitution Principle IV requires these FIRST.
 *
 * The clock and the notifier are injected so the whole service is testable
 * without an Electron runtime, and so sleep can be simulated by jumping the
 * clock forward (which is exactly what research.md R-004 is about).
 */
import { describe, it, expect, vi } from 'vitest'
import { createTimerService } from '../../src/main/services/timer/timer-service'

function harness(start = 1_000_000, repeat?: () => boolean) {
  let now = start
  // Returning true is what a real notifier does when an alarm starts ringing;
  // the service takes that as the signal to enter the alarming state.
  const notify = vi.fn(() => true)
  const silence = vi.fn()
  const service = createTimerService({ now: () => now, notify, silence, repeat })
  return {
    service,
    notify,
    silence,
    advance(ms: number) {
      now += ms
    },
    get now() {
      return now
    }
  }
}

describe('timer state machine', () => {
  it('starts idle with a null deadline', () => {
    const { service } = harness()
    const s = service.get()
    expect(s.status).toBe('idle')
    expect(s.deadlineAt).toBeNull()
  })

  it('running implies a non-null deadline', () => {
    const { service } = harness()
    const s = service.start(60_000)
    expect(s.status).toBe('running')
    expect(s.deadlineAt).not.toBeNull()
  })

  it('every non-running status implies a null deadline', () => {
    const { service } = harness()
    service.start(60_000)
    expect(service.pause().deadlineAt).toBeNull()
    expect(service.reset().deadlineAt).toBeNull()
  })

  it('counts down against wall-clock time', () => {
    const h = harness()
    h.service.start(60_000)
    h.advance(15_000)
    expect(h.service.get().remainingMs).toBe(45_000)
  })

  it('pause freezes the remainder', () => {
    const h = harness()
    h.service.start(60_000)
    h.advance(20_000)
    const paused = h.service.pause()
    expect(paused.remainingMs).toBe(40_000)
    h.advance(30_000)
    expect(h.service.get().remainingMs).toBe(40_000)
  })

  it('resume continues from the frozen remainder, not the full duration', () => {
    const h = harness()
    h.service.start(60_000)
    h.advance(20_000)
    h.service.pause()
    h.advance(999_000)
    const resumed = h.service.resume()
    expect(resumed.remainingMs).toBe(40_000)
  })

  it('reset returns to the configured duration', () => {
    const h = harness()
    h.service.start(30_000)
    h.advance(10_000)
    const reset = h.service.reset()
    expect(reset.status).toBe('idle')
    expect(reset.remainingMs).toBe(30_000)
    expect(reset.configuredDurationMs).toBe(30_000)
  })

  it('pause from idle is a no-op rather than an error', () => {
    const { service } = harness()
    expect(() => service.pause()).not.toThrow()
    expect(service.pause().status).toBe('idle')
  })

  it('resume from running is a no-op rather than an error', () => {
    const { service } = harness()
    service.start(60_000)
    expect(service.resume().status).toBe('running')
  })

  it('reaches finished and notifies exactly once', () => {
    const h = harness()
    h.service.start(10_000)
    h.advance(10_001)
    expect(h.service.get().status).toBe('finished')
    expect(h.notify).toHaveBeenCalledTimes(1)
  })

  // The behaviour that a tick-accumulating timer silently gets wrong.
  it('survives sleep: a jump past the deadline finishes and notifies once (FR-020)', () => {
    const h = harness()
    h.service.start(60_000)
    h.advance(90 * 60 * 1000) // machine asleep for 90 minutes
    h.service.onResume()
    expect(h.service.get().status).toBe('finished')
    expect(h.service.get().remainingMs).toBe(0)
    expect(h.notify).toHaveBeenCalledTimes(1)
  })

  it('does not double-notify when resume fires after the deadline already passed', () => {
    const h = harness()
    h.service.start(1000)
    h.advance(5000)
    h.service.get()
    h.service.onResume()
    h.service.onResume()
    expect(h.notify).toHaveBeenCalledTimes(1)
  })

  it('remaining time never goes negative', () => {
    const h = harness()
    h.service.start(1000)
    h.advance(60_000)
    expect(h.service.get().remainingMs).toBe(0)
  })

  it('toggle starts an idle timer and pauses a running one (FR-019)', () => {
    const h = harness()
    expect(h.service.toggle().status).toBe('running')
    expect(h.service.toggle().status).toBe('paused')
    expect(h.service.toggle().status).toBe('running')
  })

  it('emits only while observed (constitution Principle V)', () => {
    const h = harness()
    const cb = vi.fn()
    const off = h.service.onChange(cb)
    h.service.start(60_000)
    expect(cb).toHaveBeenCalled()
    cb.mockClear()
    off()
    h.service.pause()
    expect(cb).not.toHaveBeenCalled()
  })
})

/**
 * FR-089. Repeat is read at the moment of finishing rather than captured at
 * start, so the switch applies to the countdown in front of you.
 */
describe('repeat on finish', () => {
  it('starts the same duration again when repeat is on', () => {
    const h = harness(1_000_000, () => true)
    h.service.start(60_000)
    h.advance(60_000)

    const state = h.service.get()
    expect(state.status).toBe('running')
    expect(state.remainingMs).toBe(60_000)
    expect(state.deadlineAt).toBe(h.now + 60_000)
  })

  it('stays finished when repeat is off', () => {
    const h = harness(1_000_000, () => false)
    h.service.start(60_000)
    h.advance(60_000)
    expect(h.service.get().status).toBe('finished')
  })

  it('stays finished when no repeat getter was supplied at all', () => {
    const h = harness()
    h.service.start(60_000)
    h.advance(60_000)
    expect(h.service.get().status).toBe('finished')
  })

  it('notifies on every cycle, not only the first', () => {
    // The second cycle reaching zero in silence is the bug this guards: the
    // notified flag has to be cleared by the restart, not just by reset().
    const h = harness(1_000_000, () => true)
    h.service.start(60_000)
    h.advance(60_000)
    h.service.get()
    expect(h.notify).toHaveBeenCalledTimes(1)

    h.advance(60_000)
    h.service.get()
    expect(h.notify).toHaveBeenCalledTimes(2)
  })

  it('takes effect on a countdown that was already running', () => {
    let repeating = false
    const h = harness(1_000_000, () => repeating)
    h.service.start(60_000)
    repeating = true
    h.advance(60_000)
    expect(h.service.get().status).toBe('running')
  })

  it('can still be reset out of a repeating cycle', () => {
    const h = harness(1_000_000, () => true)
    h.service.start(60_000)
    h.advance(60_000)
    h.service.get()
    expect(h.service.reset().status).toBe('idle')
  })

  it('keeps the configured duration across a repeat', () => {
    const h = harness(1_000_000, () => true)
    h.service.start(25 * 60_000)
    h.advance(25 * 60_000)
    expect(h.service.get().configuredDurationMs).toBe(25 * 60_000)
  })
})

/**
 * FR-090. The alarm rings until dismissed, and dismissing it is not the same
 * as resetting the countdown.
 */
describe('the finish alarm', () => {
  it('enters the alarming state when the notifier starts ringing', () => {
    const h = harness()
    h.service.start(60_000)
    h.advance(60_000)
    expect(h.service.get().alarming).toBe(true)
  })

  it('does not alarm when the notifier reports no sound', () => {
    let now = 1_000_000
    const service = createTimerService({ now: () => now, notify: () => false })
    service.start(60_000)
    now += 60_000
    expect(service.get().alarming).toBe(false)
  })

  it('stays ringing indefinitely until something stops it', () => {
    const h = harness()
    h.service.start(60_000)
    h.advance(60_000)
    h.service.get()
    h.advance(60 * 60_000)
    expect(h.service.get().alarming).toBe(true)
    expect(h.silence).not.toHaveBeenCalled()
  })

  it('is silenced by dismissAlarm, which also clears the countdown', () => {
    // Dismiss used to leave the timer sitting at 0:00 in 'finished', so using
    // it again meant pressing Reset first. It now returns to the configured
    // duration, ready to start.
    const h = harness()
    h.service.start(60_000)
    h.advance(60_000)
    const after = h.service.dismissAlarm()
    expect(after.alarming).toBe(false)
    expect(after.status).toBe('idle')
    expect(after.remainingMs).toBe(60_000)
    expect(after.configuredDurationMs).toBe(60_000)
    expect(h.silence).toHaveBeenCalledTimes(1)
  })

  it('leaves the dismissed timer startable without a separate reset', () => {
    const h = harness()
    h.service.start(60_000)
    h.advance(60_000)
    h.service.dismissAlarm()

    const started = h.service.start(h.service.get().configuredDurationMs)
    expect(started.status).toBe('running')
    expect(started.remainingMs).toBe(60_000)
  })

  it('does not re-alarm after dismissing, having cleared the notified latch', () => {
    const h = harness()
    h.service.start(60_000)
    h.advance(60_000)
    h.service.dismissAlarm()
    h.notify.mockClear()

    // A fresh countdown must be able to announce its own finish.
    h.service.start(30_000)
    h.advance(30_000)
    expect(h.service.get().alarming).toBe(true)
    expect(h.notify).toHaveBeenCalledTimes(1)
  })

  it('treats dismissing nothing as a no-op rather than an error', () => {
    const h = harness()
    expect(h.service.dismissAlarm().status).toBe('idle')
    expect(h.silence).not.toHaveBeenCalled()
  })

  it('is silenced by reset', () => {
    const h = harness()
    h.service.start(60_000)
    h.advance(60_000)
    h.service.get()
    expect(h.service.reset().alarming).toBe(false)
    expect(h.silence).toHaveBeenCalledTimes(1)
  })

  it('is silenced by starting a new countdown, which the user has clearly seen', () => {
    const h = harness()
    h.service.start(60_000)
    h.advance(60_000)
    h.service.get()
    expect(h.service.start(30_000).alarming).toBe(false)
    expect(h.silence).toHaveBeenCalledTimes(1)
  })

  it('keeps ringing through a repeat, which nobody has seen', () => {
    // Otherwise "ring until dismissed" quietly becomes "ring until the next
    // cycle starts" whenever both toggles are on.
    const h = harness(1_000_000, () => true)
    h.service.start(60_000)
    h.advance(60_000)
    const state = h.service.get()
    expect(state.status).toBe('running')
    expect(state.alarming).toBe(true)
    expect(h.silence).not.toHaveBeenCalled()
  })

  /**
   * The exception to "Dismiss resets". With repeat on, finish() has already
   * started the next cycle by the time the user reaches for Dismiss, so
   * resetting would destroy it - turning "repeat until stopped" into "run
   * exactly twice".
   */
  it('leaves a repeated countdown running when the alarm is dismissed', () => {
    const h = harness(1_000_000, () => true)
    h.service.start(60_000)
    h.advance(60_000)
    h.service.get()
    const after = h.service.dismissAlarm()
    expect(after.alarming).toBe(false)
    expect(after.status).toBe('running')
  })

  it('does not shorten the repeated countdown it declines to reset', () => {
    const h = harness(1_000_000, () => true)
    h.service.start(60_000)
    h.advance(60_000)
    h.service.get()
    h.advance(10_000)

    const after = h.service.dismissAlarm()
    expect(after.status).toBe('running')
    // Still counting down the repeat that was already in flight, not restarted.
    expect(after.remainingMs).toBe(50_000)
  })

  it('silences the alarm when the service is torn down', () => {
    const h = harness()
    h.service.start(60_000)
    h.advance(60_000)
    h.service.get()
    h.service.stop()
    expect(h.silence).toHaveBeenCalledTimes(1)
  })
})
