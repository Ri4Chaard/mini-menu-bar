/**
 * Composites a count badge into the corner of the menu bar image (FR-109).
 *
 * Why pixel arithmetic rather than anything civilised: Electron's `nativeImage`
 * cannot rasterise SVG. Handing it an SVG data URL returns an EMPTY image with
 * no error, which would have shipped as a blank menu bar item — probed and
 * confirmed against Electron 43 (research.md R-201). A canvas would need an
 * offscreen renderer alive to draw a badge, which Principle V forbids, and an
 * image library would be a native runtime dependency in the main process.
 *
 * So: a pure function over the raw BGRA buffer `NativeImage.toBitmap()` returns.
 * No dependency, no renderer payload, and exhaustively testable without
 * launching an app (Principle IV).
 */

/** Bytes per pixel in the BGRA buffer Electron hands back. */
const BPP = 4

/**
 * A 3x5 bitmap font, because there is no text rasteriser reachable from a
 * plain-TypeScript main process. Three bits per row, five rows per digit;
 * 3x5 is the smallest grid on which all ten digits stay unambiguous (R-202).
 */
const DIGITS: readonly (readonly number[])[] = [
  [0b111, 0b101, 0b101, 0b101, 0b111], // 0
  [0b010, 0b110, 0b010, 0b010, 0b111], // 1
  [0b111, 0b001, 0b111, 0b100, 0b111], // 2
  [0b111, 0b001, 0b111, 0b001, 0b111], // 3
  [0b101, 0b101, 0b111, 0b001, 0b001], // 4
  [0b111, 0b100, 0b111, 0b001, 0b111], // 5
  [0b111, 0b100, 0b111, 0b101, 0b111], // 6
  [0b111, 0b001, 0b010, 0b010, 0b010], // 7
  [0b111, 0b101, 0b111, 0b101, 0b111], // 8
  [0b111, 0b101, 0b111, 0b001, 0b111]  // 9
]

/** The plus in "99+", for counts too wide to render. */
const PLUS: readonly number[] = [0b000, 0b010, 0b111, 0b010, 0b000]

export const GLYPH_W = 3
export const GLYPH_H = 5

/**
 * How tall the digits should be as a fraction of the image.
 *
 * The first version drew the font at one buffer pixel per font pixel, which on
 * a 36 px canvas made the digits 5 px tall - about 2.5 logical points, and
 * unreadable in the menu bar. Each font pixel is now drawn as a `scale` x
 * `scale` block instead, chosen from the canvas height.
 */
const GLYPH_HEIGHT_FRACTION = 0.45
/** The badge must not swallow the thumbnail it sits on. */
const MAX_BOX_FRACTION = 0.66

/**
 * Pixels per font pixel for a given canvas height.
 *
 * Exported so the sizing rule is testable directly rather than only through
 * rendered output.
 */
export function badgeScale(height: number): number {
  if (!Number.isFinite(height) || height <= 0) return 1

  let scale = Math.max(1, Math.round((height * GLYPH_HEIGHT_FRACTION) / GLYPH_H))
  // Padding is one font pixel each side, so the box is GLYPH_H + 2 blocks tall.
  while (scale > 1 && (GLYPH_H + 2) * scale > height * MAX_BOX_FRACTION) scale -= 1
  return scale
}

/**
 * Badge colours.
 *
 * Named constants rather than CSS custom properties because this runs in the
 * main process, outside the renderer's token system entirely. They are chosen
 * to read against an arbitrary screenshot underneath: an opaque dark pill with
 * white ink, which is legible over both a bright and a dark thumbnail without
 * knowing anything about it.
 */
const PILL = { b: 0x1c, g: 0x1c, r: 0x1e, a: 0xff }
const INK = { b: 0xff, g: 0xff, r: 0xff, a: 0xff }

export function digitGlyph(digit: number): readonly number[] {
  return DIGITS[digit] ?? DIGITS[0]!
}

/** What the badge renders for a given count: digits, or "99+" when too wide. */
export function badgeText(count: number): string {
  if (count > 99) return '99+'
  return String(count)
}

/**
 * Write a count badge into the top-right corner of a BGRA bitmap, in place.
 *
 * A no-op for a count of zero or less. That guard is load-bearing, not
 * defensive: with no screenshots the tray falls back to the app icon, and a "0"
 * painted over it is precisely the bug FR-115 exists to prevent.
 */
export function composeBadge(
  bitmap: Buffer,
  width: number,
  height: number,
  count: number
): void {
  if (count <= 0) return
  if (!Number.isInteger(width) || !Number.isInteger(height)) return
  if (width <= 0 || height <= 0) return
  if (bitmap.length !== width * height * BPP) return

  const text = badgeText(count)
  const scale = badgeScale(height)
  // Tracking and padding are one font pixel each, scaled with the glyphs, so
  // the badge keeps its proportions at every size.
  const runW = (text.length * GLYPH_W + (text.length - 1)) * scale
  const boxW = runW + 2 * scale
  const boxH = (GLYPH_H + 2) * scale

  // Never a partial or clipped glyph: if it does not fit, nothing is drawn.
  if (boxW > width || boxH > height) return

  const boxX = width - boxW
  const boxY = 0

  for (let y = boxY; y < boxY + boxH; y++) {
    for (let x = boxX; x < boxX + boxW; x++) put(bitmap, width, x, y, PILL)
  }

  let penX = boxX + scale
  for (const char of text) {
    const glyph = char === '+' ? PLUS : digitGlyph(Number(char))
    for (let row = 0; row < GLYPH_H; row++) {
      const bits = glyph[row]!
      for (let col = 0; col < GLYPH_W; col++) {
        // Bit 2 is the leftmost column of the 3-wide glyph.
        if (!((bits >> (GLYPH_W - 1 - col)) & 1)) continue
        // One font pixel becomes a scale x scale block.
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            put(bitmap, width, penX + col * scale + dx, boxY + scale + row * scale + dy, INK)
          }
        }
      }
    }
    penX += (GLYPH_W + 1) * scale
  }
}

function put(
  bitmap: Buffer,
  width: number,
  x: number,
  y: number,
  colour: { b: number; g: number; r: number; a: number }
): void {
  const i = (y * width + x) * BPP
  bitmap[i] = colour.b
  bitmap[i + 1] = colour.g
  bitmap[i + 2] = colour.r
  bitmap[i + 3] = colour.a
}
