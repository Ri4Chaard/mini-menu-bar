/**
 * Presets became user data the moment FR-063 allowed adding one, so the list
 * arrives from disk and can be anything.
 *
 * Normalisation is applied on read as well as write: a hand-edited or
 * half-written preferences file must be REPAIRED, never fatal. A timer section
 * that throws because someone typed a string into a JSON array is a worse
 * outcome than quietly dropping the bad entry (data-model.md, R-112).
 */
import { describe, expect, it } from 'vitest'
import { normalisePresets } from '../../src/main/services/preferences/normalise-presets'
import { DEFAULT_PREFERENCES, MAX_TIMER_PRESETS } from '../../src/shared/types'

const MINUTE = 60_000

describe('normalisePresets', () => {
  it('keeps a well-formed list unchanged', () => {
    expect(normalisePresets([MINUTE, 5 * MINUTE])).toEqual([MINUTE, 5 * MINUTE])
  })

  it('sorts ascending so the chip row reads as increasing duration', () => {
    expect(normalisePresets([25 * MINUTE, MINUTE, 10 * MINUTE])).toEqual([
      MINUTE,
      10 * MINUTE,
      25 * MINUTE
    ])
  })

  it('de-duplicates — two "5m" chips is a bug, not a preference', () => {
    expect(normalisePresets([5 * MINUTE, 5 * MINUTE, MINUTE])).toEqual([MINUTE, 5 * MINUTE])
  })

  it('drops durations outside the supported range', () => {
    // A sub-second timer is not a timer; a >24h one is not a menu bar concern.
    expect(normalisePresets([500, MINUTE, 25 * 60 * MINUTE])).toEqual([MINUTE])
  })

  it('caps the list at the width the presets row can hold', () => {
    const many = Array.from({ length: 20 }, (_, i) => (i + 1) * MINUTE)
    expect(normalisePresets(many)).toHaveLength(MAX_TIMER_PRESETS)
    // Keeps the shortest, since those are the ones reached most often.
    expect(normalisePresets(many)[0]).toBe(MINUTE)
  })

  it('repairs a malformed persisted array rather than throwing', () => {
    const wrecked = [MINUTE, '5m', null, NaN, Infinity, -3, 10 * MINUTE] as unknown as number[]
    expect(() => normalisePresets(wrecked)).not.toThrow()
    expect(normalisePresets(wrecked)).toEqual([MINUTE, 10 * MINUTE])
  })

  it('falls back to the defaults when nothing survives', () => {
    // An empty preset row would leave the Timer with no way to set a duration.
    expect(normalisePresets([])).toEqual(DEFAULT_PREFERENCES.timerPresets)
    expect(normalisePresets(undefined)).toEqual(DEFAULT_PREFERENCES.timerPresets)
    expect(normalisePresets('nonsense' as unknown as number[])).toEqual(
      DEFAULT_PREFERENCES.timerPresets
    )
  })

  it('rounds fractional milliseconds to integers', () => {
    expect(normalisePresets([60_000.7])).toEqual([60_001])
  })
})
