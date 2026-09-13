/**
 * The release manifest is untrusted network input.
 *
 * It is held to the same standard as an IPC argument: parsed by explicit field
 * access, bounded in size, and rejected rather than coerced when it is not what
 * it claims to be. These cases are the reason parse-manifest.ts is a pure
 * function separate from the fetch.
 */
import { describe, expect, it } from 'vitest'
import { MAX_MANIFEST_BYTES, parseManifest } from '../../src/main/services/updates/parse-manifest'

describe('parseManifest', () => {
  it('reads a well-formed manifest', () => {
    const result = parseManifest(
      JSON.stringify({ version: '0.2.0', publishedAt: '2026-09-13T12:00:00.000Z' })
    )
    expect(result?.version).toBe('0.2.0')
    expect(result?.publishedAt).toBe(Date.parse('2026-09-13T12:00:00.000Z'))
  })

  it('accepts an epoch-millisecond publishedAt as well as an ISO string', () => {
    expect(parseManifest('{"version":"1.0.0","publishedAt":1757764800000}')?.publishedAt).toBe(
      1757764800000
    )
  })

  it('tolerates extra fields, so the schema can grow without breaking old builds', () => {
    const result = parseManifest('{"version":"1.0.0","minimumSystemVersion":"12.0","notes":"hi"}')
    expect(result).toEqual({ version: '1.0.0', publishedAt: null })
  })

  it('returns a null date rather than failing when publishedAt is unusable', () => {
    expect(parseManifest('{"version":"1.0.0","publishedAt":"not a date"}')).toEqual({
      version: '1.0.0',
      publishedAt: null
    })
    expect(parseManifest('{"version":"1.0.0"}')?.publishedAt).toBeNull()
  })

  it.each([
    ['{"publishedAt":"2026-01-01"}', 'no version at all'],
    ['{"version":123}', 'a numeric version'],
    ['{"version":null}', 'a null version'],
    ['{"version":""}', 'an empty version'],
    ['[{"version":"1.0.0"}]', 'an array root'],
    ['"1.0.0"', 'a bare string root'],
    ['null', 'a null root'],
    ['42', 'a numeric root'],
    ['not json at all', 'unparseable text'],
    ['<!DOCTYPE html><html>404</html>', 'an HTML error page served as the asset'],
    ['', 'an empty body']
  ])('rejects %s (%s)', (input) => {
    expect(parseManifest(input)).toBeNull()
  })

  it('rejects an absurdly long version string', () => {
    expect(parseManifest(JSON.stringify({ version: 'v'.repeat(100) }))).toBeNull()
  })

  it('refuses a body over the size ceiling before parsing it', () => {
    const padded = JSON.stringify({ version: '1.0.0', pad: 'x'.repeat(MAX_MANIFEST_BYTES) })
    expect(padded.length).toBeGreaterThan(MAX_MANIFEST_BYTES)
    expect(parseManifest(padded)).toBeNull()
  })

  it('does not let a __proto__ key in the JSON reach the result', () => {
    // JSON.parse makes __proto__ an OWN property rather than setting the
    // prototype, so the danger is a later spread carrying it onward. Reading
    // fields explicitly is what prevents that, and this pins the behaviour.
    const result = parseManifest('{"version":"1.0.0","__proto__":{"polluted":true}}')
    expect(result).toEqual({ version: '1.0.0', publishedAt: null })
    expect(Object.getPrototypeOf(result!)).toBe(Object.prototype)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('does not let a constructor key through either', () => {
    expect(parseManifest('{"version":"1.0.0","constructor":{"prototype":{"x":1}}}')).toEqual({
      version: '1.0.0',
      publishedAt: null
    })
    expect(({} as Record<string, unknown>).x).toBeUndefined()
  })
})
