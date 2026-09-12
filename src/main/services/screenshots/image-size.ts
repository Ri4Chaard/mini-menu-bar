/**
 * Reads an image's true pixel dimensions from its header bytes.
 *
 * This exists because `nativeImage.createThumbnailFromPath(path, size)` does
 * NOT preserve aspect ratio, despite its parameter being named `maxSize`: it
 * stretches the image to exactly the size requested. A 2.62:1 screenshot asked
 * for at 320x200 comes back at 320x200, visibly squashed, and no amount of CSS
 * `object-fit` can undo it because the distortion is already in the bitmap.
 *
 * So the fitted size has to be computed before the thumbnail is requested, and
 * that needs the source dimensions. Parsing the header is far cheaper than
 * `createFromPath().getSize()`, which fully decodes a multi-megabyte screenshot
 * only to read two numbers off it.
 *
 * Pure over a Buffer, so it is unit-tested without touching the filesystem
 * (constitution Principle IV).
 */

export interface ImageSize {
  width: number
  height: number
}

/** PNG: IHDR is always the first chunk, so width and height sit at a fixed offset. */
export function readPngSize(head: Buffer): ImageSize | null {
  if (head.length < 24) return null
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (!signature.every((byte, i) => head[i] === byte)) return null
  if (head.toString('ascii', 12, 16) !== 'IHDR') return null

  const width = head.readUInt32BE(16)
  const height = head.readUInt32BE(20)
  return width > 0 && height > 0 ? { width, height } : null
}

/**
 * JPEG: dimensions live in a Start Of Frame marker, whose position depends on
 * how much metadata precedes it, so the segment chain has to be walked.
 */
export function readJpegSize(head: Buffer): ImageSize | null {
  if (head.length < 4 || head[0] !== 0xff || head[1] !== 0xd8) return null

  let offset = 2
  while (offset + 9 < head.length) {
    if (head[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = head[offset + 1]!
    // Standalone markers carry no length payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    const length = head.readUInt16BE(offset + 2)
    // SOF0..SOF15, excluding the DHT/JPG/DAC markers interleaved in that range.
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof) {
      const height = head.readUInt16BE(offset + 5)
      const width = head.readUInt16BE(offset + 7)
      return width > 0 && height > 0 ? { width, height } : null
    }
    if (length < 2) return null
    offset += 2 + length
  }
  return null
}

export function parseImageSize(head: Buffer): ImageSize | null {
  return readPngSize(head) ?? readJpegSize(head)
}

/**
 * The largest box with the source's aspect ratio that fits inside `bounds`.
 *
 * "Contain", not "cover": the thumbnail keeps the whole frame and the UI crops
 * it with CSS if it wants to. Cropping here would throw away pixels the panel
 * might want, and a letterboxed tray image is still honest where a stretched
 * one is not.
 */
export function fitWithin(source: ImageSize, bounds: ImageSize): ImageSize {
  if (source.width <= 0 || source.height <= 0) return bounds

  const scale = Math.min(bounds.width / source.width, bounds.height / source.height)
  // Never upscale: a tiny screenshot blown up to fill the box is worse than a
  // small one shown at its own size.
  const capped = Math.min(scale, 1)

  return {
    width: Math.max(1, Math.round(source.width * capped)),
    height: Math.max(1, Math.round(source.height * capped))
  }
}
