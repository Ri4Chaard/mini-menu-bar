/**
 * The screenshot collection: derived state, never persisted (data-model.md).
 *
 * Read-only over the user's filesystem. This module contains no write, rename,
 * move, or delete call, and tests/unit/screenshots-readonly.spec.ts asserts
 * that mechanically (FR-014a).
 */
import { access, constants } from 'node:fs/promises'
import { shell } from 'electron'
import { BridgeError } from '@shared/errors'
import { MAX_SCREENSHOTS, type ScreenshotEntry, type SourceError } from '@shared/types'
import type { PreferencesService } from '../preferences/preferences-service'
import { backfillScreenshots, describe, isScreenshot } from './spotlight-source'
import { createDirectoryWatcher } from './fs-watcher'
import { resolveWatchedDirectories } from './location-resolver'
import { makeThumbnail } from './thumbnail'

export interface ScreenshotService {
  list(): Promise<ScreenshotEntry[]>
  open(id: string): Promise<void>
  reveal(id: string): Promise<void>
  markSeen(): Promise<void>
  sourceError(): Promise<SourceError | null>
  latest(): ScreenshotEntry | null
  unseenCount(): number
  onChange(cb: (entries: ScreenshotEntry[]) => void): () => void
  start(): Promise<void>
  refreshLocation(): Promise<void>
  stop(): void
}

export function createScreenshotService(preferences: PreferencesService): ScreenshotService {
  let entries: ScreenshotEntry[] = []
  let error: SourceError | null = null
  const listeners = new Set<(entries: ScreenshotEntry[]) => void>()

  const withSeen = (list: ScreenshotEntry[]): ScreenshotEntry[] => {
    const watermark = preferences.get().screenshotsSeenWatermark
    return list.map((e) => ({ ...e, isSeen: e.capturedAt <= watermark }))
  }

  const emit = (): void => {
    const snapshot = withSeen(entries)
    for (const cb of listeners) cb(snapshot)
  }

  const insert = (entry: ScreenshotEntry): void => {
    if (entries.some((e) => e.id === entry.id)) return
    entries = [entry, ...entries].sort((a, b) => b.capturedAt - a.capturedAt).slice(0, MAX_SCREENSHOTS)
    emit()
  }

  const drop = (id: string): void => {
    const before = entries.length
    entries = entries.filter((e) => e.id !== id)
    if (entries.length !== before) emit()
  }

  const ingest = async (path: string): Promise<void> => {
    // Confirm by metadata, never by filename (research.md R-003). This retries:
    // Spotlight takes roughly two seconds to stamp the attribute after the file
    // is written, so a single early check silently drops fresh screenshots.
    if (!(await isScreenshot(path))) return
    const raw = await describe(path)
    if (!raw) return
    const thumb = await makeThumbnail(raw.path)
    insert({
      id: raw.path,
      path: raw.path,
      fileName: raw.fileName,
      capturedAt: raw.capturedAt,
      thumbnailDataUrl: thumb.dataUrl,
      width: thumb.width,
      height: thumb.height,
      isSeen: false
    })
  }

    /**
   * Bounded concurrency. Thumbnail generation opens image files, and firing
   * fifty at once on a machine with a real screenshot history starves the
   * event loop and produces intermittent failures.
   */
  const mapLimited = async <T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> => {
    const out: R[] = new Array(items.length)
    let next = 0
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++
        out[index] = await fn(items[index]!)
      }
    })
    await Promise.all(workers)
    return out
  }

  const watcher = createDirectoryWatcher(
    (path) => void ingest(path),
    (path) => drop(path)
  )

  const requireExisting = async (id: string): Promise<ScreenshotEntry> => {
    const entry = entries.find((e) => e.id === id)
    if (!entry) throw new BridgeError('FILE_NOT_FOUND', 'That screenshot is no longer available.')
    try {
      await access(entry.path, constants.R_OK)
    } catch {
      // Reconcile the vanished file away, then report it (spec edge case).
      drop(id)
      throw new BridgeError('FILE_NOT_FOUND', 'That screenshot is no longer available.')
    }
    return entry
  }

  const classifyError = (cause: unknown): SourceError => {
    const message = cause instanceof Error ? cause.message : String(cause)
    if (/operation not permitted|EACCES|EPERM/i.test(message)) {
      return {
        kind: 'permission-denied',
        message:
          'This app needs permission to read your screenshots folder. Grant access in System Settings → Privacy & Security → Files and Folders.'
      }
    }
    if (/ENOENT|no such file/i.test(message)) {
      return { kind: 'location-missing', message: 'The screenshot folder could not be found.' }
    }
    return { kind: 'unknown', message: `Could not read screenshots: ${message}` }
  }

  return {
    async list() {
      if (error) throw new BridgeError('PERMISSION_DENIED', error.message)
      return withSeen(entries)
    },

    async open(id) {
      const entry = await requireExisting(id)
      const failure = await shell.openPath(entry.path)
      if (failure) throw new BridgeError('FILE_NOT_FOUND', failure)
    },

    async reveal(id) {
      const entry = await requireExisting(id)
      shell.showItemInFolder(entry.path)
    },

    async markSeen() {
      await preferences.update({ screenshotsSeenWatermark: Date.now() })
      emit()
    },

    async sourceError() {
      return error
    },

    latest: () => withSeen(entries)[0] ?? null,

    unseenCount: () => withSeen(entries).filter((e) => !e.isSeen).length,

    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb) as unknown as void
    },

    async start() {
      try {
        const raws = await backfillScreenshots()
        const built = await mapLimited(raws, 6, async (raw) => {
          const thumb = await makeThumbnail(raw.path)
          return {
            id: raw.path,
            path: raw.path,
            fileName: raw.fileName,
            capturedAt: raw.capturedAt,
            thumbnailDataUrl: thumb.dataUrl,
            width: thumb.width,
            height: thumb.height,
            isSeen: false
          } satisfies ScreenshotEntry
        })
        entries = built.sort((a, b) => b.capturedAt - a.capturedAt).slice(0, MAX_SCREENSHOTS)
        error = null
      } catch (cause) {
        error = classifyError(cause)
      }
      await this.refreshLocation()
      emit()
    },

    /** FR-014b: follow the system save location if the user changes it. */
    async refreshLocation() {
      try {
        watcher.retarget(await resolveWatchedDirectories())
      } catch (cause) {
        error = classifyError(cause)
        emit()
      }
    },

    stop() {
      watcher.close()
      listeners.clear()
    }
  }
}
