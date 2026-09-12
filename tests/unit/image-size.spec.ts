/**
 * Cover for the bug these functions exist to fix: thumbnails were visibly
 * squashed because `createThumbnailFromPath` stretches to the requested size
 * rather than fitting within it.
 */
import { describe, expect, it } from 'vitest'
import { deflateSync } from 'node:zlib'
import {
  fitWithin,
  parseImageSize,
  readJpegSize,
  readPngSize
} from '../../src/main/services/screenshots/image-size'

/** A minimal but genuinely valid PNG header. */
function pngHead(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const len = Buffer.alloc(4)
  len.writeUInt32BE(13)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    len,
    Buffer.from('IHDR', 'ascii'),
    ihdr,
    Buffer.alloc(4),
    deflateSync(Buffer.alloc(8))
  ])
}

function jpegHead(width: number, height: number): Buffer {
  const sof = Buffer.alloc(11)
  sof[0] = 0xff
  sof[1] = 0xc0
  sof.writeUInt16BE(9, 2)
  sof[4] = 8
  sof.writeUInt16BE(height, 5)
  sof.writeUInt16BE(width, 7)
  return Buffer.concat([Buffer.from([0xff, 0xd8]), sof])
}

describe('readPngSize', () => {
  it('reads the dimensions of a real screenshot shape', () => {
    expect(readPngSize(pngHead(1310, 500))).toEqual({ width: 1310, height: 500 })
  })

  it('reads a very large image', () => {
    expect(readPngSize(pngHead(5120, 2880))).toEqual({ width: 5120, height: 2880 })
  })

  it('rejects a buffer that is not a PNG', () => {
    expect(readPngSize(Buffer.from('not a png at all, truly not'))).toBeNull()
    expect(readPngSize(jpegHead(100, 100))).toBeNull()
  })

  it('rejects a truncated header rather than reading garbage', () => {
    expect(readPngSize(pngHead(100, 100).subarray(0, 20))).toBeNull()
  })
})

describe('readJpegSize', () => {
  it('reads dimensions from the SOF marker', () => {
    expect(readJpegSize(jpegHead(1920, 1080))).toEqual({ width: 1920, height: 1080 })
  })

  it('walks past a preceding metadata segment', () => {
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), Buffer.alloc(2), Buffer.alloc(30)])
    app1.writeUInt16BE(32, 2)
    const buf = Buffer.concat([Buffer.from([0xff, 0xd8]), app1, jpegHead(800, 600).subarray(2)])
    expect(readJpegSize(buf)).toEqual({ width: 800, height: 600 })
  })

  it('rejects a PNG', () => {
    expect(readJpegSize(pngHead(10, 10))).toBeNull()
  })
})

describe('parseImageSize', () => {
  it('handles either format', () => {
    expect(parseImageSize(pngHead(320, 200))).toEqual({ width: 320, height: 200 })
    expect(parseImageSize(jpegHead(320, 200))).toEqual({ width: 320, height: 200 })
  })

  it('returns null for something unrecognised, rather than guessing', () => {
    expect(parseImageSize(Buffer.alloc(64))).toBeNull()
  })
})

describe('fitWithin', () => {
  it('preserves the aspect ratio of a wide screenshot', () => {
    // The exact case that looked squashed: 2.62:1 forced into a 1.6:1 box.
    const fitted = fitWithin({ width: 1310, height: 500 }, { width: 320, height: 200 })
    expect(fitted).toEqual({ width: 320, height: 122 })
    expect(fitted.width / fitted.height).toBeCloseTo(1310 / 500, 1)
  })

  it('preserves the aspect ratio of a tall image', () => {
    const fitted = fitWithin({ width: 500, height: 1310 }, { width: 320, height: 200 })
    expect(fitted.height).toBe(200)
    expect(fitted.width / fitted.height).toBeCloseTo(500 / 1310, 1)
  })

  it('never exceeds the bounds in either dimension', () => {
    for (const source of [
      { width: 5120, height: 2880 },
      { width: 100, height: 4000 },
      { width: 4000, height: 100 },
      { width: 1310, height: 500 }
    ]) {
      const fitted = fitWithin(source, { width: 320, height: 200 })
      expect(fitted.width).toBeLessThanOrEqual(320)
      expect(fitted.height).toBeLessThanOrEqual(200)
    }
  })

  it('never upscales a source smaller than the box', () => {
    expect(fitWithin({ width: 134, height: 94 }, { width: 320, height: 200 })).toEqual({
      width: 134,
      height: 94
    })
  })

  it('never returns a zero dimension', () => {
    const fitted = fitWithin({ width: 10_000, height: 1 }, { width: 64, height: 36 })
    expect(fitted.width).toBeGreaterThan(0)
    expect(fitted.height).toBeGreaterThan(0)
  })

  it('falls back to the bounds for a degenerate source', () => {
    expect(fitWithin({ width: 0, height: 0 }, { width: 64, height: 36 })).toEqual({
      width: 64,
      height: 36
    })
  })
})
