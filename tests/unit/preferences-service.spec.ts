import { describe, it, expect } from 'vitest'
import { mergePreferences, revivePreferences } from '../../src/main/services/preferences/preferences-service'
import { DEFAULT_PREFERENCES, type Preferences } from '../../src/shared/types'

const base = (over: Partial<Preferences> = {}): Preferences => ({
  ...DEFAULT_PREFERENCES,
  ...over,
  previews: { ...DEFAULT_PREFERENCES.previews, ...(over.previews ?? {}) }
})

describe('preference merge — preview independence (FR-031)', () => {
  it('writing one preview flag leaves the other two byte-identical', () => {
    const current = base({ previews: { screenshots: true, timer: false, spotify: true } })
    const next = mergePreferences(current, { previews: { ...current.previews, timer: true } })

    expect(next.previews.timer).toBe(true)
    expect(next.previews.screenshots).toBe(current.previews.screenshots)
    expect(next.previews.spotify).toBe(current.previews.spotify)
  })

  it('a patch naming only one preview key does not blank the others', () => {
    const current = base({ previews: { screenshots: true, timer: true, spotify: true } })
    // A wholesale `previews` assignment is the bug this guards against.
    const next = mergePreferences(current, { previews: { screenshots: false } as never })

    expect(next.previews.screenshots).toBe(false)
    expect(next.previews.timer).toBe(true)
    expect(next.previews.spotify).toBe(true)
  })

  it('leaves unrelated preferences untouched', () => {
    const current = base({ timerDurationMs: 90_000, lastSection: 'notes' })
    const next = mergePreferences(current, { previews: { ...current.previews, spotify: true } })

    expect(next.timerDurationMs).toBe(90_000)
    expect(next.lastSection).toBe('notes')
  })
})

describe('preference merge — watermark (FR-013)', () => {
  it('moves the watermark forward', () => {
    const next = mergePreferences(base({ screenshotsSeenWatermark: 100 }), {
      screenshotsSeenWatermark: 500
    })
    expect(next.screenshotsSeenWatermark).toBe(500)
  })

  it('never moves the watermark backward', () => {
    const next = mergePreferences(base({ screenshotsSeenWatermark: 500 }), {
      screenshotsSeenWatermark: 100
    })
    expect(next.screenshotsSeenWatermark).toBe(500)
  })

  it('is idempotent', () => {
    const once = mergePreferences(base({ screenshotsSeenWatermark: 0 }), { screenshotsSeenWatermark: 300 })
    const twice = mergePreferences(once, { screenshotsSeenWatermark: 300 })
    expect(twice).toEqual(once)
  })
})

describe('preference revival', () => {
  it('falls back to defaults for a corrupt document', () => {
    expect(revivePreferences({ previews: 'nope', lastSection: 42 })).toEqual(DEFAULT_PREFERENCES)
  })

  it('rejects an unknown section rather than rendering an empty panel', () => {
    expect(revivePreferences({ lastSection: 'weather' }).lastSection).toBe('screenshots')
  })

  it('preserves a valid section', () => {
    expect(revivePreferences({ lastSection: 'spotify' }).lastSection).toBe('spotify')
  })
})
