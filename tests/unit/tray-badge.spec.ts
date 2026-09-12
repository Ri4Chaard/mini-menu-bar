/**
 * The six obligations in contracts/tray-badge.md.
 *
 * This runs without Electron: composeBadge takes a plain Buffer, so a test
 * constructs one directly. That is the whole reason the compositing was written
 * as a pure function over a buffer rather than against NativeImage.
 */
import { describe, expect, it } from 'vitest'
import {
  badgeScale,
  badgeText,
  composeBadge,
  digitGlyph,
  GLYPH_H,
  GLYPH_W
} from '../../src/main/tray/badge'

const W = 64
const H = 36
const BPP = 4

/** A mid-grey canvas, so both the dark pill and the white ink are detectable. */
const canvas = (w = W, h = H): Buffer => Buffer.alloc(w * h * BPP, 0x80)

const pixel = (buf: Buffer, w: number, x: number, y: number): number[] => {
  const i = (y * w + x) * BPP
  return [buf[i]!, buf[i + 1]!, buf[i + 2]!, buf[i + 3]!]
}

describe('digitGlyph', () => {
  it('renders all ten digits distinctly', () => {
    const seen = new Set<string>()
    for (let d = 0; d <= 9; d++) seen.add(digitGlyph(d).join(','))
    expect(seen.size).toBe(10)
  })

  it('gives every digit exactly five rows within the 3-bit width', () => {
    for (let d = 0; d <= 9; d++) {
      const glyph = digitGlyph(d)
      expect(glyph).toHaveLength(GLYPH_H)
      for (const row of glyph) expect(row).toBeLessThan(1 << GLYPH_W)
    }
  })

  it('every digit has at least one lit pixel, so none renders blank', () => {
    for (let d = 0; d <= 9; d++) {
      expect(digitGlyph(d).reduce((a, b) => a | b, 0)).toBeGreaterThan(0)
    }
  })
})

describe('badgeText', () => {
  it('renders a plain count up to 99', () => {
    expect(badgeText(1)).toBe('1')
    expect(badgeText(50)).toBe('50')
    expect(badgeText(99)).toBe('99')
  })

  it('renders 99+ beyond that rather than clipping a digit', () => {
    expect(badgeText(100)).toBe('99+')
    expect(badgeText(9999)).toBe('99+')
  })
})

describe('composeBadge', () => {
  it('leaves the buffer byte-identical for a count of zero', () => {
    const before = canvas()
    const after = Buffer.from(before)
    composeBadge(after, W, H, 0)
    expect(after.equals(before)).toBe(true)
  })

  it('leaves the buffer byte-identical for a negative count', () => {
    const before = canvas()
    const after = Buffer.from(before)
    composeBadge(after, W, H, -3)
    expect(after.equals(before)).toBe(true)
  })

  it('draws something for a count of one', () => {
    const before = canvas()
    const after = Buffer.from(before)
    composeBadge(after, W, H, 1)
    expect(after.equals(before)).toBe(false)
  })

  it('draws in the TOP-RIGHT corner and nowhere else (FR-109)', () => {
    const before = canvas()
    const after = Buffer.from(before)
    composeBadge(after, W, H, 7)

    // The badge is exactly this tall; everything below it must be untouched.
    const maxBoxH = (GLYPH_H + 2) * badgeScale(H)
    for (let y = maxBoxH; y < H; y++) {
      for (let x = 0; x < W; x++) {
        expect(pixel(after, W, x, y), `row ${y} was touched`).toEqual(pixel(before, W, x, y))
      }
    }
    // The top-LEFT must be untouched too — this is a right-corner badge.
    expect(pixel(after, W, 0, 0)).toEqual(pixel(before, W, 0, 0))
    // The top-right corner pixel itself is the pill.
    expect(pixel(after, W, W - 1, 0)).not.toEqual(pixel(before, W, W - 1, 0))
  })

  it('widens for a two-digit count and right-aligns both', () => {
    const one = canvas()
    const two = canvas()
    composeBadge(one, W, H, 7)
    composeBadge(two, W, H, 42)

    const litColumns = (buf: Buffer): number => {
      let n = 0
      for (let x = 0; x < W; x++) {
        for (let y = 0; y < (GLYPH_H + 2) * badgeScale(H); y++) {
          if (pixel(buf, W, x, y)[3] === 0xff && pixel(buf, W, x, y)[0] !== 0x80) {
            n++
            break
          }
        }
      }
      return n
    }
    expect(litColumns(two)).toBeGreaterThan(litColumns(one))

    // Both touch the right edge: the badge is anchored there, not centred.
    expect(pixel(one, W, W - 1, 0)[0]).not.toBe(0x80)
    expect(pixel(two, W, W - 1, 0)[0]).not.toBe(0x80)
  })

  it('is a no-op rather than a throw or an overflow on an undersized buffer', () => {
    const wrong = Buffer.alloc(10, 0x80)
    const before = Buffer.from(wrong)
    expect(() => composeBadge(wrong, W, H, 5)).not.toThrow()
    expect(wrong.equals(before)).toBe(true)
  })

  it('is a no-op when the badge cannot fit the canvas, never a clipped glyph', () => {
    const tiny = canvas(6, 4)
    const before = Buffer.from(tiny)
    composeBadge(tiny, 6, 4, 5)
    expect(tiny.equals(before)).toBe(true)
  })

  it('never writes outside the buffer for any count', () => {
    for (const count of [1, 9, 10, 99, 100, 9999]) {
      const buf = canvas()
      expect(() => composeBadge(buf, W, H, count)).not.toThrow()
      expect(buf.length).toBe(W * H * BPP)
    }
  })

  it('rejects malformed dimensions rather than guessing', () => {
    for (const [w, h] of [[0, H], [W, 0], [-1, H], [1.5, H]] as const) {
      const buf = canvas()
      const before = Buffer.from(buf)
      expect(() => composeBadge(buf, w, h, 5)).not.toThrow()
      expect(buf.equals(before)).toBe(true)
    }
  })

  it('is deterministic — the same inputs produce the same bytes', () => {
    const a = canvas()
    const b = canvas()
    composeBadge(a, W, H, 23)
    composeBadge(b, W, H, 23)
    expect(a.equals(b)).toBe(true)
  })
})

/**
 * The reported bug: at one buffer pixel per font pixel the digits were 5 px
 * tall on a 36 px canvas — roughly 2.5 logical points, and unreadable in the
 * menu bar. Each font pixel is now a scale x scale block.
 */
describe('badgeScale', () => {
  it('makes the digits a usable fraction of the image height', () => {
    for (const h of [24, 36, 50]) {
      const glyphHeight = GLYPH_H * badgeScale(h)
      expect(glyphHeight / h).toBeGreaterThan(0.3)
    }
  })

  it('never lets the badge swallow the thumbnail', () => {
    for (const h of [12, 18, 24, 36, 50, 100]) {
      const boxHeight = (GLYPH_H + 2) * badgeScale(h)
      expect(boxHeight).toBeLessThanOrEqual(h)
    }
  })

  it('grows with the canvas', () => {
    expect(badgeScale(36)).toBeGreaterThan(badgeScale(18))
    expect(badgeScale(72)).toBeGreaterThanOrEqual(badgeScale(36))
  })

  it('never drops below one, however small the canvas', () => {
    for (const h of [0, 1, 4, 7, -5, NaN]) expect(badgeScale(h)).toBeGreaterThanOrEqual(1)
  })

  it('draws visibly more ink at the larger scale', () => {
    const ink = (h: number): number => {
      const buf = Buffer.alloc(W * h * BPP, 0x80)
      composeBadge(buf, W, h, 8)
      let n = 0
      for (let i = 0; i < buf.length; i += BPP) if (buf[i] !== 0x80) n++
      return n
    }
    expect(ink(36)).toBeGreaterThan(ink(18) * 2)
  })
})
