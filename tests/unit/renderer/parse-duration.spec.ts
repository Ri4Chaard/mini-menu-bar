/**
 * Every row of the format table in data-model.md, plus the distinction the
 * feature turns on: unparseable input is REJECTED (FR-106) while out-of-range
 * input is CLAMPED (FR-107). Conflating the two is the likely defect here.
 */
import { describe, expect, it } from 'vitest'
import {
  formatDurationInput,
  parseDuration
} from '../../../src/renderer/sections/timer/parse-duration'
import { MAX_TIMER_PRESET_MS, MIN_TIMER_PRESET_MS } from '../../../src/shared/types'

const MINUTE = 60_000

describe('parseDuration — accepted formats', () => {
  it('reads a bare number as minutes', () => {
    expect(parseDuration('7')).toBe(7 * MINUTE)
    expect(parseDuration('25')).toBe(25 * MINUTE)
  })

  it('reads m:ss', () => {
    expect(parseDuration('7:30')).toBe(7 * MINUTE + 30_000)
    expect(parseDuration('0:45')).toBe(45_000)
  })

  it('reads h:mm:ss', () => {
    expect(parseDuration('1:30:00')).toBe(90 * MINUTE)
    expect(parseDuration('2:00:30')).toBe(120 * MINUTE + 30_000)
  })

  it('reads an explicit unit suffix', () => {
    expect(parseDuration('90s')).toBe(90_000)
    expect(parseDuration('7m')).toBe(7 * MINUTE)
    expect(parseDuration('2h')).toBe(2 * 60 * MINUTE)
  })

  it('tolerates surrounding whitespace and case', () => {
    expect(parseDuration('  7M  ')).toBe(7 * MINUTE)
    expect(parseDuration(' 90S ')).toBe(90_000)
  })
})

describe('parseDuration — rejection (FR-106)', () => {
  it.each(['', '   ', 'abc', '-5', '5.5', '7:', ':30', '1:2:3:4', 'm', '7x', '1e3'])(
    'rejects %o rather than guessing',
    (input) => {
      expect(parseDuration(input)).toBeNull()
    }
  )

  it('rejects an out-of-range seconds field rather than carrying it', () => {
    // "1:75" must not be silently read as 2:15 - the user meant something else.
    expect(parseDuration('1:75')).toBeNull()
    expect(parseDuration('1:60')).toBeNull()
  })
})

describe('parseDuration — clamping (FR-107)', () => {
  it('clamps below the minimum rather than rejecting', () => {
    expect(parseDuration('0')).toBe(MIN_TIMER_PRESET_MS)
    expect(parseDuration('0:00')).toBe(MIN_TIMER_PRESET_MS)
  })

  it('clamps above the maximum rather than rejecting', () => {
    expect(parseDuration('99h')).toBe(MAX_TIMER_PRESET_MS)
    expect(parseDuration('9999')).toBe(MAX_TIMER_PRESET_MS)
  })

  it('never returns a duration outside the supported range', () => {
    for (const input of ['0', '1', '7:30', '24h', '99h', '9999']) {
      const ms = parseDuration(input)
      expect(ms).not.toBeNull()
      expect(ms!).toBeGreaterThanOrEqual(MIN_TIMER_PRESET_MS)
      expect(ms!).toBeLessThanOrEqual(MAX_TIMER_PRESET_MS)
    }
  })

  it('a zero duration never starts a timer that finishes instantly', () => {
    expect(parseDuration('0')).toBeGreaterThan(0)
  })
})

describe('formatDurationInput', () => {
  it('renders m:ss under an hour', () => {
    expect(formatDurationInput(7 * MINUTE + 30_000)).toBe('7:30')
    expect(formatDurationInput(45_000)).toBe('0:45')
  })

  it('renders h:mm:ss at or over an hour', () => {
    expect(formatDurationInput(90 * MINUTE)).toBe('1:30:00')
  })

  it('round-trips through parseDuration', () => {
    for (const ms of [1000, 45_000, 7 * MINUTE, 25 * MINUTE, 90 * MINUTE, 3 * 60 * MINUTE]) {
      expect(parseDuration(formatDurationInput(ms))).toBe(ms)
    }
  })
})
