/**
 * Regression cover for a parsing bug that produced silent, intermittent failure
 * rather than a visible error - the kind that quietly comes back.
 *
 * This file also covered Spotify state parsing until feature 003 removed it.
 */
import { describe, it, expect } from 'vitest'
import { parseBackfillLine } from '../../src/main/services/screenshots/spotlight-source'

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
