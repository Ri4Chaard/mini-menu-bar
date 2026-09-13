/**
 * The committed icon assets, checked mechanically.
 *
 * `scripts/make-icons.mjs` writes these and they are committed so a contributor
 * who never runs the script can still build. That convenience is exactly why
 * they need a test: a regenerated asset can drift from its obligations with
 * nothing to catch it.
 *
 * The template invariant is the important one. A macOS menu bar icon MUST be a
 * template image - monochrome plus alpha - so the system can tint it for light
 * and dark menu bars (FR-116). The app icon must NOT be, and the two are
 * produced by the same script, so the risk of one leaking into the other is
 * real rather than theoretical. This is the mechanical half of manual gate
 * T047; the appearance itself still needs an eye.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { join } from 'node:path'

const ROOT = join(__dirname, '../..')

interface Png {
  width: number
  height: number
  /** RGBA, 4 bytes per pixel, rows already de-filtered. */
  pixels: Buffer
}

/**
 * A PNG reader for exactly the PNGs our own encoder writes: 8-bit RGBA,
 * non-interlaced, every scanline filter type 0 (None).
 *
 * Deliberately narrow. A general decoder would be a dependency, and the point
 * here is to verify what the encoder produced, not to accept arbitrary input -
 * so an unexpected bit depth, colour type or filter is a failure, not a case
 * to handle.
 */
function decodePng(path: string): Png {
  const data = readFileSync(path)
  expect(data.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

  let offset = 8
  let width = 0
  let height = 0
  const idat: Buffer[] = []

  while (offset < data.length) {
    const length = data.readUInt32BE(offset)
    const type = data.subarray(offset + 4, offset + 8).toString('ascii')
    const body = data.subarray(offset + 8, offset + 8 + length)

    if (type === 'IHDR') {
      width = body.readUInt32BE(0)
      height = body.readUInt32BE(4)
      expect(body[8], 'bit depth').toBe(8)
      expect(body[9], 'colour type (6 = RGBA)').toBe(6)
      expect(body[12], 'interlace').toBe(0)
    } else if (type === 'IDAT') {
      idat.push(body)
    }
    offset += 12 + length
  }

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const pixels = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    const src = y * (1 + stride)
    expect(raw[src], `scanline ${y} filter type`).toBe(0)
    raw.copy(pixels, y * stride, src + 1, src + 1 + stride)
  }
  return { width, height, pixels }
}

const pixelAt = (png: Png, x: number, y: number): number[] => {
  const i = (y * png.width + x) * 4
  return [png.pixels[i]!, png.pixels[i + 1]!, png.pixels[i + 2]!, png.pixels[i + 3]!]
}

describe.each([
  ['resources/trayTemplate.png', 18],
  ['resources/trayTemplate@2x.png', 36]
])('%s is a valid macOS template image', (relative, expected) => {
  const png = decodePng(join(ROOT, relative))

  it(`is ${expected}x${expected}`, () => {
    expect([png.width, png.height]).toEqual([expected, expected])
  })

  it('is monochrome: every pixel is pure black, carrying shape in alpha alone', () => {
    // Any colour here and macOS would render the menu bar item as drawn rather
    // than tinting it, so it would stay dark on a dark menu bar.
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        const [r, g, b] = pixelAt(png, x, y)
        expect([r, g, b], `pixel ${x},${y}`).toEqual([0, 0, 0])
      }
    }
  })

  it('has no background fill: all four corners are fully transparent', () => {
    const max = png.width - 1
    for (const [x, y] of [
      [0, 0],
      [max, 0],
      [0, max],
      [max, max]
    ]) {
      expect(pixelAt(png, x!, y!)[3], `corner ${x},${y} alpha`).toBe(0)
    }
  })

  it('actually drew the mark: at least one fully opaque pixel', () => {
    let opaque = 0
    for (let i = 3; i < png.pixels.length; i += 4) if (png.pixels[i] === 255) opaque++
    expect(opaque).toBeGreaterThan(0)
  })
})

/** sRGB relative luminance, WCAG 2.1. Mirrors tests/unit/design-tokens.spec.ts. */
function luminance([r, g, b]: number[]): number {
  const channels = [r!, g!, b!].map((value) => {
    const c = value / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

describe('build/icon.icns', () => {
  it('exists and is a real icns bundle', () => {
    const data = readFileSync(join(ROOT, 'build/icon.icns'))
    expect(data.subarray(0, 4).toString('ascii')).toBe('icns')
    // The tray glyph reused as an app icon was ~58 KB. A squircle with a
    // gradient and a baked shadow is substantially larger; this is a cheap
    // guard against the placeholder silently coming back.
    expect(data.length).toBeGreaterThan(100_000)
  })
})

describe('app icon palette', () => {
  // The values scripts/make-icons.mjs draws with. Asserted here rather than
  // eyeballed, matching how design-tokens.spec.ts treats the panel palette.
  const GLYPH = [0xfb, 0xf6, 0xef]
  const GRADIENT_LIGHTEST = [0x8e, 0x33, 0x50]

  it('the glyph clears 4.5:1 against the lightest point of the background', () => {
    expect(contrast(GLYPH, GRADIENT_LIGHTEST)).toBeGreaterThanOrEqual(4.5)
  })
})
