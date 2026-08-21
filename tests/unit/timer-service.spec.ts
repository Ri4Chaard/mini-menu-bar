/**
 * Timer state machine — constitution Principle IV requires these FIRST.
 *
 * The clock and the notifier are injected so the whole service is testable
 * without an Electron runtime, and so sleep can be simulated by jumping the
 * clock forward (which is exactly what research.md R-004 is about).
 */
import { describe, it, expect, vi } from 'vitest'
import { createTimerService } from '../../src/main/services/timer/timer-service'

function harness(start = 1_000_000) {
  let now = start
  const notify = vi.fn()
  const service = createTimerService({ now: () => now, notify })
  return {
    service,
    notify,
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
