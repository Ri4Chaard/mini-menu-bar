/**
 * Drives the single Tray from the composed preview model (research.md R-005).
 *
 * Recomposes on preference change and on any source-data change, so the menu
 * bar reflects an external event within SC-007's 2-second budget without any
 * polling of its own.
 */
import { nativeImage, type NativeImage, type Tray } from 'electron'
import type { PlaybackState, TimerState } from '@shared/types'
import { DEFAULT_PREFERENCES } from '@shared/types'
import type { PreferencesService } from '../services/preferences/preferences-service'
import type { ScreenshotService } from '../services/screenshots/screenshot-store'
import { TRAY_THUMB, makeThumbnail } from '../services/screenshots/thumbnail'
import { composePreview } from './preview-composer'

export interface TrayController {
  refresh(): Promise<void>
  setTimer(state: TimerState): void
  setPlayback(state: PlaybackState): void
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
    status: 'idle',
    configuredDurationMs: DEFAULT_PREFERENCES.timerDurationMs,
    deadlineAt: null,
    remainingMs: DEFAULT_PREFERENCES.timerDurationMs
  }
  let playback: PlaybackState = {
    availability: 'not-running',
    trackName: null,
    artist: null,
    positionMs: null,
    durationMs: null,
    volume: null,
    shuffling: null,
    repeating: null,
    artworkDataUrl: null
  }

  let thumbnailFor: string | null = null
  let thumbnail: NativeImage | null = null
  let disposed = false

  /** Regenerate the tray-sized thumbnail only when the latest screenshot changes. */
  const ensureThumbnail = async (): Promise<NativeImage | null> => {
    const latest = screenshots?.latest() ?? null
    if (!latest) {
      thumbnailFor = null
      thumbnail = null
      return null
    }
    if (thumbnailFor === latest.id) return thumbnail

    const result = await makeThumbnail(latest.path, TRAY_THUMB)
    thumbnailFor = latest.id
    thumbnail = result.dataUrl ? nativeImage.createFromDataURL(result.dataUrl) : null
    return thumbnail
  }

  const apply = async (): Promise<void> => {
    if (disposed) return
    const prefs = preferences.get()
    const latestThumbnail = prefs.previews.screenshots ? await ensureThumbnail() : null

    const model = composePreview({
      preferences: prefs,
      unseenCount: screenshots?.unseenCount() ?? 0,
      latestThumbnail,
      timer,
      playback
    })

    // Screenshots are full-colour, so the thumbnail must not be treated as a
    // template image; the fallback icon is a template so it tints correctly.
    const image = model.image ?? defaultImage
    tray.setImage(image)
    tray.setTitle(model.title)
  }

  return {
    refresh: apply,
    setTimer(state) {
      timer = state
      void apply()
    },
    setPlayback(state) {
      playback = state
      void apply()
    },
    dispose() {
      disposed = true
    }
  }
}
