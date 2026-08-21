/**
 * Regression cover for two parsing bugs that both produced silent, intermittent
 * failure rather than a visible error - the kind that quietly come back.
 */
import { describe, it, expect } from 'vitest'
import { parseBackfillLine } from '../../src/main/services/screenshots/spotlight-source'
import { parseStateOutput } from '../../src/main/services/spotify/playback-service'
import { FIELD_SEP } from '../../src/main/services/spotify/applescript'

describe('mdfind -attr line parsing', () => {
  it('parses a plain line', () => {
    const parsed = parseBackfillLine(
      '/Users/me/Desktop/shot.png    kMDItemContentCreationDate = 2026-08-21 14:31:13 +0000'
    )
    expect(parsed?.fileName).toBe('shot.png')
    expect(parsed?.capturedAt).toBe(Date.parse('2026-08-21T14:31:13+0000'))
  })

  it('parses a localised filename containing spaces', () => {
    // The real format on a Ukrainian system. Filename matching would fail here,
    // which is exactly why detection uses the metadata attribute.
    const parsed = parseBackfillLine(
      '/Users/me/Desktop/Знімок екрана 2026-08-21 о 17.31.10.png    kMDItemContentCreationDate = 2026-08-21 14:31:13 +0000'
    )
    expect(parsed?.fileName).toBe('Знімок екрана 2026-08-21 о 17.31.10.png')
    expect(parsed?.capturedAt).toBeGreaterThan(0)
  })

  it('does not assume a tab separator', () => {
    expect(parseBackfillLine('/a/b.png\tkMDItemContentCreationDate = 2026-08-21 14:31:13 +0000')).not.toBeNull()
    expect(parseBackfillLine('/a/b.png     kMDItemContentCreationDate = 2026-08-21 14:31:13 +0000')).not.toBeNull()
  })

  it('ignores lines with no date and null dates', () => {
    expect(parseBackfillLine('/Users/me/Desktop/shot.png')).toBeNull()
    expect(parseBackfillLine('/a/b.png    kMDItemContentCreationDate = (null)')).toBeNull()
    expect(parseBackfillLine('')).toBeNull()
  })
})

describe('Spotify state parsing', () => {
  const line = (...parts: string[]): string => parts.join(FIELD_SEP)

  it('parses a normal playing state', () => {
    const state = parseStateOutput(line('playing', 'Dying', 'Cold Hart', '209583', '98248'))
    expect(state).toMatchObject({
      availability: 'playing',
      trackName: 'Dying',
      artist: 'Cold Hart',
      durationMs: 209583,
      positionMs: 98248
    })
  })

  it('survives a locale that formats decimals with a comma', () => {
    // AppleScript formats numbers using the user's locale. On a Ukrainian or
    // German system `player position` comes back as "98,248" - which Number()
    // reads as NaN, blanking the entire playback state.
    const state = parseStateOutput(line('playing', 'Dying', 'Cold Hart', '209583', '98,248'))
    expect(state.positionMs).toBe(98)
    expect(state.trackName).toBe('Dying')
    expect(state.availability).toBe('playing')
  })

  it('reports stopped without inventing track data', () => {
    const state = parseStateOutput('stopped')
    expect(state.availability).toBe('stopped')
    expect(state.trackName).toBeNull()
    expect(state.positionMs).toBeNull()
  })

  it('clamps position to duration', () => {
    const state = parseStateOutput(line('playing', 'X', 'Y', '1000', '99999'))
    expect(state.positionMs).toBeLessThanOrEqual(state.durationMs!)
  })

  it('treats a truncated response as stopped rather than throwing', () => {
    expect(parseStateOutput(line('playing', 'X')).availability).toBe('stopped')
    expect(parseStateOutput('').availability).toBe('stopped')
  })

  it('preserves a track name containing a comma', () => {
    const state = parseStateOutput(line('paused', 'Hello, Goodbye', 'The Beatles', '203000', '1000'))
    expect(state.trackName).toBe('Hello, Goodbye')
    expect(state.availability).toBe('paused')
  })
})
