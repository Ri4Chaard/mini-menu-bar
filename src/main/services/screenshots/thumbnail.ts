import { nativeImage } from 'electron'
import { open } from 'node:fs/promises'
import { fitWithin, parseImageSize, type ImageSize } from './image-size'

/**
 * Enough of the file to contain the header in either format. PNG needs 24
 * bytes; JPEG needs however much metadata precedes its SOF marker, which for a
 * screenshot with an ICC profile can run to a few kilobytes.
 */
const HEADER_BYTES = 64 * 1024

/**
 * The source's true pixel size, read from its header.
 *
 * Falls back to null rather than throwing: an unreadable or unrecognised file
 * simply loses aspect correction, which is a worse thumbnail, not a failure.
 */
async function readSourceSize(path: string): Promise<ImageSize | null> {
  let handle
  try {
    handle = await open(path, 'r')
    const buffer = Buffer.alloc(HEADER_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, HEADER_BYTES, 0)
    return parseImageSize(buffer.subarray(0, bytesRead))
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => {})
  }
}

/** Panel grid thumbnail. */
export const PANEL_THUMB = { width: 320, height: 200 }
/** Tray image in logical points, sized to the menu bar (R-005). */
export const TRAY_THUMB = { width: 32, height: 18 }

/**
 * The tray image is actually generated at 2x and tagged `scaleFactor: 2`.
 *
 * Not for retina crispness alone: at 1x the whole image is 32x18, which leaves
 * roughly 10x6 px for the count badge - not enough for two digits. At 2x the
 * badge gets ~20x12 real pixels, which is what makes it legible at all
 * (research.md R-202).
 */
export const TRAY_THUMB_2X = { width: TRAY_THUMB.width * 2, height: TRAY_THUMB.height * 2 }

export interface ThumbnailResult {
  dataUrl: string | null
  width: number
  height: number
}

export async function makeThumbnail(
  path: string,
  size: { width: number; height: number } = PANEL_THUMB
): Promise<ThumbnailResult> {
  try {
    // `createThumbnailFromPath` STRETCHES to exactly the size it is given -
    // its `maxSize` parameter is a misnomer - so the aspect-correct size has to
    // be computed first from the source's own header. Without this a 2.62:1
    // screenshot came back as 1.6:1, visibly squashed, and no CSS object-fit
    // could recover it because the distortion was already in the bitmap.
    const source = await readSourceSize(path)
    const target = source ? fitWithin(source, size) : size

    const image = await nativeImage.createThumbnailFromPath(path, target)
    if (image.isEmpty()) return { dataUrl: null, width: 0, height: 0 }
    const { width, height } = image.getSize()
    return { dataUrl: image.toDataURL(), width, height }
  } catch {
    // A vanished or unreadable file yields no thumbnail; the entry is reconciled
    // away by the store rather than rendering a broken image.
    return { dataUrl: null, width: 0, height: 0 }
  }
}
