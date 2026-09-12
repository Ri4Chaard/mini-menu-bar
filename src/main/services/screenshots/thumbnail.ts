import { nativeImage } from 'electron'

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
    const image = await nativeImage.createThumbnailFromPath(path, size)
    if (image.isEmpty()) return { dataUrl: null, width: 0, height: 0 }
    const { width, height } = image.getSize()
    return { dataUrl: image.toDataURL(), width, height }
  } catch {
    // A vanished or unreadable file yields no thumbnail; the entry is reconciled
    // away by the store rather than rendering a broken image.
    return { dataUrl: null, width: 0, height: 0 }
  }
}
