import { nativeImage } from 'electron'

/** Panel grid thumbnail. */
export const PANEL_THUMB = { width: 320, height: 200 }
/** Tray image, sized to the menu bar at the display's scale factor (R-005). */
export const TRAY_THUMB = { width: 32, height: 18 }

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
