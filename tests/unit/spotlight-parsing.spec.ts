/**
 * Regression cover for a parsing bug that produced silent, intermittent failure
 * rather than a visible error - the kind that quietly comes back.
 *
 * This file also covered Spotify state parsing until feature 003 removed it.
 */
import { describe, it, expect } from 'vitest'
import {
  SCREENSHOT_ATTRIBUTES,
  SCREENSHOT_QUERY,
  parseAttributeValues,
  parseBackfillLine
} from '../../src/main/services/screenshots/spotlight-source'

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

/**
 * The constant itself, locked down.
 *
 * `kMDItemIsScreenCapture` reads like the right key and is the one Apple's
 * reference documents, so it is easy to "tidy" the working attribute back out
 * again. Nothing on a mocked machine would notice: the query would still be
 * well-formed and mdfind would still exit 0, just with no output. The live
 * check lives in tests/integration/spotlight-attribute.spec.ts; this is the
 * part that can run anywhere.
 */
describe('screenshot attributes', () => {
  it('asks for the attribute current macOS actually writes', () => {
    expect(SCREENSHOT_ATTRIBUTES).toContain('kMDItemImageIsScreenshot')
  })

  it('keeps the documented-but-unpopulated name as a fallback, not the primary', () => {
    expect(SCREENSHOT_ATTRIBUTES.indexOf('kMDItemImageIsScreenshot')).toBeLessThan(
      SCREENSHOT_ATTRIBUTES.indexOf('kMDItemIsScreenCapture')
    )
  })

  it('builds one mdfind query that accepts either', () => {
    expect(SCREENSHOT_QUERY).toBe(
      'kMDItemImageIsScreenshot == 1 || kMDItemIsScreenCapture == 1'
    )
  })
})

/**
 * `mdls -raw` with several -name flags returns the values NUL-separated, and
 * reports an unset attribute as the literal string "(null)" rather than as an
 * empty value. Splitting on the wrong character silently yields one blob that
 * never equals "1", which reads as "not a screenshot" for every file.
 */
describe('mdls -raw value framing', () => {
  it('splits NUL-separated values', () => {
    expect(parseAttributeValues('1\0(null)')).toEqual(['1', '(null)'])
  })

  it('handles a single requested attribute with a trailing newline', () => {
    expect(parseAttributeValues('1\n')).toEqual(['1'])
  })

  it('reports an unset attribute as (null), never as 1', () => {
    expect(parseAttributeValues('(null)\0(null)')).not.toContain('1')
  })
})
