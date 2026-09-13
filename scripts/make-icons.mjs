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
function coverage(u, v, stemHalfW = 0.032) {
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

// ---- The macOS app icon ---------------------------------------------------

/**
 * Apple's macOS icon grid, normalised into the same 0..1 square `coverage`
 * uses. On a 1024 canvas the rounded square is 824 x 824, centred, leaving a
 * 100 px margin on every side for the shadow macOS does NOT draw for you -
 * Apple's own templates bake it in, and so do we.
 */
const HALF = 412 / 1024
/** The margin the shadow lives in. */
const INSET = 100 / 1024
/**
 * Corner reach. Since Big Sur the corner is a CONTINUOUS-curvature turn rather
 * than a circular arc, spread over roughly 1.528x the nominal radius of 185.4.
 */
const CORNER = 283.3 / 1024
/**
 * Superellipse exponent. N = 2 reproduces the legacy circular-arc rounded rect
 * exactly; 2.7 gives the flatter shoulders and tighter apex of the modern
 * shape. Minimum radius of curvature works out at 182 px on a 1024 canvas,
 * within 2% of Apple's 185.4.
 */
const N = 2.7

/**
 * Coverage of the squircle, with the superellipse applied in CORNER SPACE.
 *
 * A whole-shape superellipse over the full 824 would bow the straight edges
 * inward by ~13 px at the shoulder. Apple's shape has genuinely straight edges
 * for the middle ~31% of each side, which is what clamping dx/dy to zero
 * outside the corner box preserves.
 */
function squircleCoverage(u, v, half = HALF) {
  const corner = Math.min(CORNER, half)
  const dx = Math.max(0, Math.abs(u - 0.5) - (half - corner))
  const dy = Math.max(0, Math.abs(v - 0.5) - (half - corner))
  if (Math.abs(u - 0.5) > half || Math.abs(v - 0.5) > half) return 0
  if (dx === 0 || dy === 0) return 1
  return (dx / corner) ** N + (dy / corner) ** N <= 1 ? 1 : 0
}

// sRGB <-> linear light. Interpolating a gradient in sRGB darkens the midpoint
// into mud; the whole point of these two is that the ramp stays even.
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toSrgb = (l) => (l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055)

const hexToLinear = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => toLinear(c / 255))
}

// Wine burgundy: the colour follows the mark rather than being an arbitrary
// brand hue. Cream glass on the lighter stop measures 7.1:1.
const GRAD_TOP = hexToLinear('#8E3350')
const GRAD_BOTTOM = hexToLinear('#4A1229')
const FLAT_SMALL = hexToLinear('#6B2440')
const GLYPH = [0xfb, 0xf6, 0xef]

/**
 * Per-size drawing rules.
 *
 * Every well-drawn macOS icon is redrawn at small sizes rather than scaled, and
 * the stem is why: at the 0.66 glyph span a 0.032 half-width stem is 0.68 px at
 * 16 px, which antialiases into a grey smudge. The floor widens it to something
 * that survives, and the gradient and depth come off where they would only
 * muddy a handful of pixels.
 */
function rulesFor(size) {
  if (size <= 32) return { span: 0.78, minStemPx: 1.5, gradient: false, bevel: false, shadow: false }
  if (size <= 128) return { span: 0.7, minStemPx: 1.2, gradient: true, bevel: true, shadow: false }
  return { span: 0.66, minStemPx: 0, gradient: true, bevel: true, shadow: true }
}

/** Render the full macOS app icon at `size` px, 4x4 supersampled. */
function renderAppIcon(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const SS = 4
  const { span, minStemPx, gradient, bevel, shadow } = rulesFor(size)

  // Half-width in design units that yields at least `minStemPx` device pixels.
  const stemHalfW = Math.max(0.032, minStemPx / (2 * span * size))

  // Inner bevel: a hairline of lift along the top edge and shade along the
  // bottom, produced by testing against a slightly shrunk squircle.
  const bevelHalf = HALF - 2 / 1024

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bgHits = 0
      let glyphHits = 0
      let bevelHits = 0
      let shadowAcc = 0
      let rAcc = 0
      let gAcc = 0
      let bAcc = 0

      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size
          const v = (y + (sy + 0.5) / SS) / size

          const inside = squircleCoverage(u, v)
          if (inside) {
            bgHits++
            const t = gradient ? Math.min(1, Math.max(0, (v - (0.5 - HALF)) / (2 * HALF))) : -1
            for (let c = 0; c < 3; c++) {
              const lin = t < 0 ? FLAT_SMALL[c] : GRAD_TOP[c] + (GRAD_BOTTOM[c] - GRAD_TOP[c]) * t
              const acc = toSrgb(lin) * 255
              if (c === 0) rAcc += acc
              else if (c === 1) gAcc += acc
              else bAcc += acc
            }
            if (bevel && !squircleCoverage(u, v, bevelHalf)) bevelHits += v < 0.5 ? 1 : -1

            // Glyph, mapped into a centred box of `span` of the canvas.
            const gu = (u - (0.5 - span / 2)) / span
            const gv = (v - (0.5 - span / 2)) / span
            if (gu >= 0 && gu <= 1 && gv >= 0 && gv <= 1 && coverage(gu, gv, stemHalfW)) glyphHits++
          } else if (shadow) {
            // Baked drop shadow in the 100 px margin: nested expanded
            // silhouettes offset downward, weights decaying linearly.
            const K = 8
            for (let k = 1; k <= K; k++) {
              const grow = (k / K) * (INSET * 0.9)
              if (squircleCoverage(u, v - 10 / 1024, HALF + grow)) {
                shadowAcc += (1 - (k - 1) / K) / K
                break
              }
            }
          }
        }
      }

      const total = SS * SS
      const i = (y * size + x) * 4
      const bgA = bgHits / total

      if (bgA > 0) {
        const lift = (bevelHits / total) * 26
        const gA = glyphHits / total
        // Glyph over background, both already premultiplied by their coverage.
        const mix = (base, glyph) =>
          Math.round(Math.min(255, Math.max(0, (base / Math.max(bgHits, 1) + lift) * (1 - gA) + glyph * gA)))
        rgba[i] = mix(rAcc, GLYPH[0])
        rgba[i + 1] = mix(gAcc, GLYPH[1])
        rgba[i + 2] = mix(bAcc, GLYPH[2])
        rgba[i + 3] = Math.round(Math.min(1, bgA + shadowAcc / total) * 255)
      } else {
        const sA = Math.min(1, shadowAcc / total) * 0.42
        rgba[i] = 0
        rgba[i + 1] = 0
        rgba[i + 2] = 0
        rgba[i + 3] = Math.round(sA * 255)
      }
    }
  }
  return rgba
}


// ---- Outputs --------------------------------------------------------------

// Menu bar template images. Black plus alpha; macOS does the tinting, so the
// colour here is irrelevant beyond being fully opaque where the mark is.
// 18 pt tall is the conventional menu bar glyph size.
writeMark(join(ROOT, 'resources/trayTemplate.png'), 18)
writeMark(join(ROOT, 'resources/trayTemplate@2x.png'), 36)

// The bundle icon: a real macOS app icon - squircle, gradient, baked shadow -
// NOT the tray silhouette reused, which is what shipped before and read as
// broken beside every other icon in the Dock.
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
  writeFileSync(join(iconset, name), encodePng(renderAppIcon(size), size, size))
}

execFileSync('iconutil', ['-c', 'icns', iconset, '-o', join(ROOT, 'build/icon.icns')])
rmSync(iconset, { recursive: true, force: true })

console.log('✓ resources/trayTemplate.png, trayTemplate@2x.png, build/icon.icns')
