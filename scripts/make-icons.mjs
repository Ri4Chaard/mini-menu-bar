#!/usr/bin/env node
/**
 * Generates the app's wine-glass identity: the menu bar template images and the
 * .icns bundle icon.
 *
 * Build-time only, so it touches neither the runtime dependency baseline nor
 * the renderer payload budget. It emits PNGs with a hand-rolled encoder over
 * Node's built-in `zlib` because no SVG rasteriser is installed on the target
 * machine — qlmanage/sips exist, rsvg/ImageMagick/Inkscape do not (R-205).
 * `iconutil` then assembles the .icns.
 *
 * The generated assets are committed, so a contributor who never runs this can
 * still build. Run it only when the mark itself changes:
 *
 *     node scripts/make-icons.mjs
 *
 * A menu bar icon MUST be a template image — monochrome plus alpha — so macOS
 * can tint it for light and dark menu bars. That is why the mark is a
 * silhouette rather than an illustration (FR-116).
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---- PNG encoding ---------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = -1
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** Encode RGBA pixel data as a PNG. */
function encodePng(rgba, width, height) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  // 10..12 are compression, filter and interlace: all zero (the defaults).

  // One filter byte per scanline, filter type 0 (None).
  const raw = Buffer.alloc(height * (1 + width * 4))
  for (let y = 0; y < height; y++) {
    const src = y * width * 4
    const dst = y * (1 + width * 4)
    raw[dst] = 0
    rgba.copy(raw, dst + 1, src, src + width * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---- The mark -------------------------------------------------------------

/**
 * Signed distance to the wine-glass silhouette, in a 0..1 square.
 *
 * Drawn as maths rather than traced from art so it stays crisp at every size
 * the .icns needs, from 16 px to 1024 px, with no resampling artefacts.
 * Coverage is sampled rather than thresholded, which is what gives the edges
 * their antialiasing.
 */
function coverage(u, v) {
  const cx = 0.5

  // Bowl: the LOWER half of an ellipse, so the rim is open and flat across the
  // top and the body tapers to a point where it meets the stem. A full ellipse
  // here reads as a mushroom, which is what the first attempt produced.
  const rimY = 0.14
  const bowlDepth = 0.42
  const rimHalfW = 0.27
  if (v >= rimY && v <= rimY + bowlDepth) {
    const t = (v - rimY) / bowlDepth
    const halfW = rimHalfW * Math.sqrt(Math.max(0, 1 - t * t))
    if (Math.abs(u - cx) <= halfW) return 1
  }

  // Stem.
  const stemTop = rimY + bowlDepth - 0.02
  const footTop = 0.80
  const stemHalfW = 0.032
  if (v > stemTop && v <= footTop && Math.abs(u - cx) <= stemHalfW) return 1

  // Foot: flares from the stem out to a base.
  const footBottom = 0.87
  if (v > footTop && v <= footBottom) {
    const t = (v - footTop) / (footBottom - footTop)
    if (Math.abs(u - cx) <= stemHalfW + t * (0.21 - stemHalfW)) return 1
  }

  return 0
}

/** Render the mark at `size` px with 4x4 supersampling for smooth edges. */
function renderMark(size, { colour = [0, 0, 0], padding = 0.06 } = {}) {
  const rgba = Buffer.alloc(size * size * 4)
  const SS = 4
  const [r, g, b] = colour

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let hits = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = (x + (sx + 0.5) / SS) / size
          const py = (y + (sy + 0.5) / SS) / size
          // Map the padded box onto the 0..1 design square.
          const u = (px - padding) / (1 - padding * 2)
          const v = (py - padding) / (1 - padding * 2)
          if (u >= 0 && u <= 1 && v >= 0 && v <= 1) hits += coverage(u, v)
        }
      }
      const alpha = Math.round((hits / (SS * SS)) * 255)
      const i = (y * size + x) * 4
      rgba[i] = r
      rgba[i + 1] = g
      rgba[i + 2] = b
      rgba[i + 3] = alpha
    }
  }
  return rgba
}

function writeMark(path, size, opts) {
  writeFileSync(path, encodePng(renderMark(size, opts), size, size))
  return path
}

// ---- Outputs --------------------------------------------------------------

// Menu bar template images. Black plus alpha; macOS does the tinting, so the
// colour here is irrelevant beyond being fully opaque where the mark is.
// 18 pt tall is the conventional menu bar glyph size.
writeMark(join(ROOT, 'resources/trayTemplate.png'), 18)
writeMark(join(ROOT, 'resources/trayTemplate@2x.png'), 36)

// The bundle icon. Same silhouette at higher fidelity, on transparency.
const iconset = join(ROOT, 'build/icon.iconset')
rmSync(iconset, { recursive: true, force: true })
mkdirSync(iconset, { recursive: true })

for (const [size, name] of [
  [16, 'icon_16x16.png'], [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'], [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'], [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'], [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'], [1024, 'icon_512x512@2x.png']
]) {
  writeMark(join(iconset, name), size, { colour: [28, 28, 30] })
}

execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(ROOT, 'build/icon.icns')])
rmSync(iconset, { recursive: true, force: true })

console.log('✓ resources/trayTemplate.png, trayTemplate@2x.png, build/icon.icns')
