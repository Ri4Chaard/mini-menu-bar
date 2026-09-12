/**
 * Drives the single Tray from the composed preview model (research.md R-005).
 *
 * Recomposes on preference change and on any source-data change, so the menu
 * bar reflects an external event within SC-007's 2-second budget without any
 * polling of its own.
 */
import { nativeImage, type NativeImage, type Tray } from 'electron'
import type { TimerState } from '@shared/types'
import { DEFAULT_PREFERENCES } from '@shared/types'
import type { PreferencesService } from '../services/preferences/preferences-service'
import type { ScreenshotService } from '../services/screenshots/screenshot-store'
import { TRAY_THUMB_2X, makeThumbnail } from '../services/screenshots/thumbnail'
import { composeBadge } from './badge'
import { composePreview } from './preview-composer'

export interface TrayController {
  refresh(): Promise<void>
  setTimer(state: TimerState): void
  dispose(): void
}

export interface TrayDeps {
  tray: Tray
  preferences: PreferencesService
  screenshots?: ScreenshotService
  /** The icon shown when the screenshots preview is off. */
  defaultImage: NativeImage
}

export function createTrayController(deps: TrayDeps): TrayController {
  const { tray, preferences, screenshots, defaultImage } = deps

  let timer: TimerState = {
    alarming: false,
    status: 'idle',
    configuredDurationMs: DEFAULT_PREFERENCES.timerDurationMs,
    deadlineAt: null,
    remainingMs: DEFAULT_PREFERENCES.timerDurationMs
  }
  /**
   * The latest screenshot as a raw 2x bitmap, cached by entry id.
   *
   * The BITMAP is cached rather than the finished NativeImage because the badge
   * count changes independently of the thumbnail - a deletion alters the count
   * while the newest screenshot stays the same - so the badge is composited
   * fresh on every apply() onto a copy of this.
   */
  let bitmapFor: string | null = null
  let bitmap: { buffer: Buffer; width: number; height: number } | null = null
  let disposed = false

  /** Regenerate the tray-sized bitmap only when the latest screenshot changes. */
  const ensureBitmap = async (): Promise<typeof bitmap> => {
    const latest = screenshots?.latest() ?? null
    if (!latest) {
      bitmapFor = null
      bitmap = null
      return null
    }
    if (bitmapFor === latest.id) return bitmap

    const result = await makeThumbnail(latest.path, TRAY_THUMB_2X)
    bitmapFor = latest.id
    if (!result.dataUrl) {
      bitmap = null
      return null
    }
    const image = nativeImage.createFromDataURL(result.dataUrl)
    const { width, height } = image.getSize()
    bitmap = { buffer: image.toBitmap(), width, height }
    return bitmap
  }

  const apply = async (): Promise<void> => {
    if (disposed) return
    const prefs = preferences.get()
    const source = prefs.previews.screenshots ? await ensureBitmap() : null

    const model = composePreview({
      preferences: prefs,
      screenshotCount: screenshots?.count() ?? 0,
      // composePreview only needs to know WHETHER there is an image, so that it
      // can decide whether a badge may be shown at all (FR-114).
      latestThumbnail: source ? ({} as NativeImage) : null,
      timer
    })

    let image: NativeImage
    if (source) {
      // A copy, because the cached bitmap is reused across refreshes and the
      // badge is not part of the screenshot.
      const buffer = Buffer.from(source.buffer)
      composeBadge(buffer, source.width, source.height, model.badgeCount)
      image = nativeImage.createFromBitmap(buffer, {
        width: source.width,
        height: source.height,
        scaleFactor: 2
      })
    } else {
      // No screenshot: the app icon, and NEVER a badge over it (FR-114,
      // FR-115). Screenshots are full-colour so they must not be treated as
      // template images; this fallback is a template so it tints correctly.
      image = defaultImage
    }

    tray.setImage(image)
    tray.setTitle(model.title)
  }

  return {
    refresh: apply,
    setTimer(state) {
      timer = state
      void apply()
    },
    dispose() {
      disposed = true
    }
  }
}
