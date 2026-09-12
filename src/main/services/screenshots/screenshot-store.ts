/**
 * The screenshot collection: derived state, never persisted (data-model.md).
 *
 * Read-only over the user's filesystem. This module contains no write, rename,
 * move, or delete call, and tests/unit/screenshots-readonly.spec.ts asserts
 * that mechanically (FR-014a).
 */
import { access, constants } from 'node:fs/promises'
import { shell, type WebContents } from 'electron'
import { BridgeError } from '@shared/errors'
import { MAX_SCREENSHOTS, type ScreenshotEntry, type SourceError } from '@shared/types'
import { beginScreenshotDrag, nothingDeleted, trashScreenshot } from './actions'
import { backfillScreenshots, describe, isScreenshot, type RawScreenshot } from './spotlight-source'
import { createDirectoryWatcher } from './fs-watcher'
import {
  describeStagingCapture,
  isStagingCapture,
  listStagingCaptures,
  stagingWatchRoot
} from './staging-source'
import { resolveWatchedDirectories } from './location-resolver'
import { makeThumbnail } from './thumbnail'

export interface ScreenshotService {
  list(): Promise<ScreenshotEntry[]>
  open(id: string): Promise<void>
  reveal(id: string): Promise<void>
  remove(ids: readonly string[]): Promise<void>
  startDrag(ids: readonly string[], sender: WebContents): Promise<void>
  sourceError(): Promise<SourceError | null>
  latest(): ScreenshotEntry | null
  /** What the menu bar badge reports: every entry currently listed (FR-110). */
  count(): number
  onChange(cb: (entries: ScreenshotEntry[]) => void): () => void
  start(): Promise<void>
  refreshLocation(): Promise<void>
  stop(): void
}

export function createScreenshotService(): ScreenshotService {
  let entries: ScreenshotEntry[] = []
  let error: SourceError | null = null
  const listeners = new Set<(entries: ScreenshotEntry[]) => void>()

  const snapshot = (): ScreenshotEntry[] => entries.map((e) => ({ ...e }))

  const emit = (): void => {
    const list = snapshot()
    for (const cb of listeners) cb(list)
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

  const build = async (raw: RawScreenshot): Promise<ScreenshotEntry> => {
    const thumb = await makeThumbnail(raw.path)
    return {
      id: raw.path,
      path: raw.path,
      fileName: raw.fileName,
      capturedAt: raw.capturedAt,
      thumbnailDataUrl: thumb.dataUrl,
      width: thumb.width,
      height: thumb.height,
      isTemporary: raw.isTemporary
    }
  }

  /**
   * Two sources, two identification rules, and the path decides which applies.
   *
   * A file in a saved location is confirmed by metadata, never by filename
   * (research.md R-003), and that check retries: Spotlight takes roughly two
   * seconds to stamp the attribute after the file is written, so a single early
   * check silently drops fresh screenshots.
   *
   * A staged capture can never pass that check - the temporary area is outside
   * the Spotlight index - so putting it through the same path would spend six
   * seconds retrying and then discard it. Its provenance is the proof instead
   * (staging-source.ts).
   */
  const ingest = async (path: string): Promise<void> => {
    if (isStagingCapture(path)) {
      const staged = await describeStagingCapture(path)
      if (staged) insert(await build(staged))
      return
    }
    if (!(await isScreenshot(path))) return
    const raw = await describe(path)
    if (!raw) return
    insert(await build(raw))
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
      return snapshot()
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

    /**
     * Trash, not unlink (research.md R-108). Deletion stays recoverable in
     * Finder, which is also what makes a confirmation step unnecessary - and a
     * modal over a panel that dismisses on focus loss would be a poor one.
     */
    async remove(ids) {
      let deleted = 0

      for (const id of ids) {
        const entry = entries.find((e) => e.id === id)
        if (!entry) continue
        if (await trashScreenshot(entry.path)) {
          drop(id)
          deleted += 1
        }
      }

      if (deleted === 0 && ids.length > 0) throw nothingDeleted()
    },

    /**
     * Ids in, a native drag out. Same rule as copy: the renderer never names a
     * file, and a drag of 3 live files out of 4 succeeds - only resolving none
     * of them is a failure, because then nothing would leave the panel and the
     * user would be left dragging a cursor that carries nothing.
     */
    async startDrag(ids, sender) {
      const live: ScreenshotEntry[] = []
      for (const id of ids) {
        const entry = entries.find((e) => e.id === id)
        if (!entry) continue
        try {
          await access(entry.path, constants.R_OK)
          live.push(entry)
        } catch {
          drop(id)
        }
      }

      const first = live[0]
      if (!first) {
        throw new BridgeError('FILE_NOT_FOUND', 'Those screenshots are no longer available.')
      }
      beginScreenshotDrag(sender, live.map((e) => e.path), first.thumbnailDataUrl)
    },

    async sourceError() {
      return error
    },

    latest: () => snapshot()[0] ?? null,

    // The total, not an unseen subset: viewing no longer changes what the menu
    // bar reports (FR-110, FR-112, research.md R-203).
    count: () => entries.length,

    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb) as unknown as void
    },

    async start() {
      let indexed: RawScreenshot[] = []
      try {
        indexed = await backfillScreenshots()
        error = null
      } catch (cause) {
        error = classifyError(cause)
      }

      // Staging is a supplementary source, so its failures are separate from
      // the section's error state in both directions: an unreadable temporary
      // area must not blank a working Spotlight index, and a failed Spotlight
      // query must not hide captures that are sitting right there.
      const staged = await listStagingCaptures().catch(() => [])

      // Identity is the path (data-model.md), so a saved capture and its staged
      // original are two entries, not one - which is correct: the staged copy is
      // about to disappear and the saved one is not. The map is here to collapse
      // a repeat within a single source, not to reconcile across them.
      const byPath = new Map<string, RawScreenshot>()
      for (const raw of [...indexed, ...staged]) {
        if (!byPath.has(raw.path)) byPath.set(raw.path, raw)
      }

      // Capped BEFORE thumbnails are generated. Two sources can together exceed
      // the cap, and building thumbnails for entries that are about to be
      // sliced off is work nobody sees.
      const merged = [...byPath.values()]
        .sort((a, b) => b.capturedAt - a.capturedAt)
        .slice(0, MAX_SCREENSHOTS)

      entries = await mapLimited(merged, 6, build)
      await this.refreshLocation()
      emit()
    },

    /** FR-014b: follow the system save location if the user changes it. */
    async refreshLocation() {
      try {
        const saved = await resolveWatchedDirectories()
        watcher.retarget([
          ...saved.map((directory) => ({ directory })),
          // The whole temporary directory, not the staging root: that root
          // cannot be watched or listed at all, while a recursive watch one
          // level up still reports the paths inside it (staging-source.ts).
          // Which is why the filter matters here more than anywhere else - this
          // target sees every temporary file every application writes, and
          // isStagingCapture rejects them without touching the disk.
          { directory: stagingWatchRoot(), recursive: true, accept: isStagingCapture }
        ])
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
