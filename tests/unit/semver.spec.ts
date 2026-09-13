/**
 * Constitution Principle IV: the version comparison is a pure function, so it
 * is unit-tested without a host runtime.
 *
 * The candidate version arrives from the network, so the hostile cases matter
 * as much as the ordinary ones: this function must never announce an update on
 * input it did not understand.
 */
import { describe, expect, it } from 'vitest'
import { compareSemver, isNewer, parseSemver } from '../../src/shared/semver'

describe('parseSemver', () => {
  it('parses a plain version', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] })
  })

  it('tolerates a leading v, because git tags carry one', () => {
    expect(parseSemver('v0.2.0')).toEqual(parseSemver('0.2.0'))
  })

  it('splits prerelease identifiers', () => {
    expect(parseSemver('1.0.0-beta.11')?.prerelease).toEqual(['beta', '11'])
  })

  it('discards build metadata (SemVer 10: ignored for precedence)', () => {
    expect(parseSemver('1.0.0+20130313144700')).toEqual(parseSemver('1.0.0'))
  })

  it.each([
    ['01.2.3', 'leading zero in major'],
    ['1.2', 'missing patch'],
    ['1.2.3.4', 'too many parts'],
    ['1.0.0-alpha..1', 'empty prerelease identifier'],
    ['1.0.0-01', 'leading zero in a numeric prerelease identifier'],
    ['', 'empty string'],
    ['garbage', 'not a version at all'],
    ['<!DOCTYPE html>', 'an error page where JSON was expected']
  ])('rejects %s (%s)', (input) => {
    expect(parseSemver(input)).toBeNull()
  })
})

describe('compareSemver', () => {
  it('compares numerically, not lexicographically', () => {
    // The one that actually bites: as strings, "0.10.0" sorts below "0.9.0".
    expect(compareSemver('0.10.0', '0.9.0')).toBe(1)
    expect(compareSemver('1.0.10', '1.0.9')).toBe(1)
  })

  it('orders major over minor over patch', () => {
    expect(compareSemver('2.0.0', '1.99.99')).toBe(1)
    expect(compareSemver('1.1.0', '1.0.99')).toBe(1)
    expect(compareSemver('1.0.1', '1.0.0')).toBe(1)
  })

  it('treats equal versions as equal', () => {
    expect(compareSemver('1.2.3', 'v1.2.3')).toBe(0)
  })

  it('ranks a prerelease below its release (SemVer 11)', () => {
    expect(compareSemver('1.0.0-beta.1', '1.0.0')).toBe(-1)
    expect(compareSemver('1.0.0', '1.0.0-rc.1')).toBe(1)
  })

  it('follows the full SemVer 11 prerelease ordering', () => {
    const ascending = [
      '1.0.0-alpha',
      '1.0.0-alpha.1',
      '1.0.0-alpha.beta',
      '1.0.0-beta',
      '1.0.0-beta.2',
      '1.0.0-beta.11',
      '1.0.0-rc.1',
      '1.0.0'
    ]
    for (let i = 0; i < ascending.length - 1; i++) {
      expect(
        compareSemver(ascending[i]!, ascending[i + 1]!),
        `${ascending[i]} < ${ascending[i + 1]}`
      ).toBe(-1)
    }
  })

  it('throws on unparseable input, so a caller must opt into leniency', () => {
    expect(() => compareSemver('garbage', '1.0.0')).toThrow(TypeError)
  })
})

describe('isNewer', () => {
  it('is true only for a strictly greater version', () => {
    expect(isNewer('0.3.0', '0.2.0')).toBe(true)
    expect(isNewer('0.2.0', '0.2.0')).toBe(false)
    expect(isNewer('0.1.0', '0.2.0')).toBe(false)
  })

  it('does not treat a prerelease as newer than its release', () => {
    expect(isNewer('1.0.0-rc.1', '1.0.0')).toBe(false)
  })

  it.each([
    ['garbage', '1.0.0'],
    ['1.0.0', 'garbage'],
    ['', '1.0.0'],
    ['<!DOCTYPE html>', '0.1.0'],
    ['99.99.99-', '0.1.0']
  ])('fails closed for (%s, %s): unparseable is never an update', (candidate, current) => {
    expect(isNewer(candidate, current)).toBe(false)
  })

  it('never throws, for any string input', () => {
    const hostile = ['', ' ', 'null', '{}', '[]', '../../etc/passwd', 'v'.repeat(1000)]
    for (const value of hostile) {
      expect(() => isNewer(value, '0.1.0')).not.toThrow()
      expect(() => isNewer('0.1.0', value)).not.toThrow()
    }
  })
})
