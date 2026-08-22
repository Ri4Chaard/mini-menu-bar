/**
 * macOS capture staging.
 *
 * A screenshot taken with the floating-thumbnail preview - or with
 * "Save to -> Clipboard" - is written to a scratch directory owned by
 * screencaptureui and never reaches the configured save location unless the
 * user saves it. Those captures are invisible to the Spotlight backfill for two
 * independent reasons: the per-user temporary area under /var/folders is
 * excluded from the Spotlight index, and the file is often gone before the
 * index would have caught up anyway.
 *
 * So this source identifies a capture by PROVENANCE rather than by metadata:
 * the file sits inside a directory that screencaptureui created for its own
 * use. That is a stronger signal than a filename pattern, which is localised
 * and breaks on rename (see the note at the top of spotlight-source.ts) - the
 * directory name is written by the system and never seen by the user.
 *
 * macOS guards that area more tightly than its mode bits suggest, and the shape
 * of this module is dictated by exactly what it permits. Measured on macOS 24.6,
 * as the owning user, unsandboxed and from Electron alike:
 *
 *   readdir($TMPDIR/TemporaryItems)             EPERM
 *   watch($TMPDIR/TemporaryItems)               EPERM  (flat and recursive)
 *   readdir/stat/read of a KNOWN capture dir    permitted
 *   watch($TMPDIR, { recursive: true })         permitted, and its events name
 *                                               paths inside TemporaryItems
 *
 * So captures cannot be enumerated - they can only be noticed as they arrive,
 * one level up, and read once their exact path is known. That is why the watch
 * target is the whole temporary directory rather than the staging root, and why
 * `listStagingCaptures` is a best-effort backfill that returns nothing on a
 * machine with this restriction rather than the primary source it looks like.
 *
 * Read-only, like every other module on the indexing path (FR-014a). Nothing
 * here creates the staging directory either: its absence means nothing has been
 * captured yet, which is a normal state and not an error.
 */
import { readdir, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, relative, sep } from 'node:path'
import { MAX_SCREENSHOTS } from '@shared/types'
import { isImageFile } from './fs-watcher'
import type { RawScreenshot } from './spotlight-source'

/**
 * Every directory screencaptureui makes for itself starts with this. The suffix
 * is random and a new one appears per capture session, which is why the watch
 * has to be recursive and the scan has to enumerate rather than guess.
 */
export const CAPTURE_DIR_PREFIX = 'NSIRD_screencaptureui'

/** `$TMPDIR/TemporaryItems` - the per-user scratch area screencaptureui uses. */
export function stagingRoot(): string {
  return join(tmpdir(), 'TemporaryItems')
}

/**
 * The directory actually watched: one level above the staging root, because the
 * staging root itself cannot be watched (see the note at the top).
 */
export function stagingWatchRoot(): string {
  return tmpdir()
}

/**
 * True for an absolute path that names a staged capture.
 *
 * This is the single predicate: the watcher filters incoming paths with it and
 * the store routes ingestion with it, so there is no way for the two to drift
 * apart and start disagreeing about what a capture is.
 *
 * It runs on every event from a recursive watch over the whole temporary
 * directory, which is busy, so it stays to string work - no filesystem call.
 */
export function isStagingCapture(path: string, root = stagingRoot()): boolean {
  const rel = relative(root, path)
  if (!rel || rel.startsWith('..')) return false
  const segments = rel.split(sep).filter(Boolean)
  const last = segments[segments.length - 1]
  if (segments.length < 2 || !last) return false
  return segments[0]!.startsWith(CAPTURE_DIR_PREFIX) && isImageFile(last)
}

/**
 * Metadata for one staged capture.
 *
 * `birthtimeMs` rather than a Spotlight attribute - there is no index here. A
 * zero-length file is skipped rather than described: the capture is still being
 * written, and the watcher will fire again when it is not.
 */
export async function describeStagingCapture(path: string): Promise<RawScreenshot | null> {
  try {
    const info = await stat(path)
    if (!info.isFile() || info.size === 0) return null
    return {
      path,
      fileName: basename(path),
      capturedAt: info.birthtimeMs || info.mtimeMs,
      isTemporary: true
    }
  } catch {
    return null
  }
}

/**
 * Best-effort backfill: every capture already staged, newest first, capped.
 *
 * Returns nothing where the staging root refuses enumeration, which is the
 * common case and is treated as "none" rather than as a failure. The practical
 * consequence is that a capture taken BEFORE the app started may be invisible
 * while one taken after it is not - which is the right way round, since the app
 * lives in the menu bar and is running when the screenshot is taken.
 *
 * `root` is injectable so this can be exercised against a real directory tree
 * rather than against the machine's own temporary area, which is restricted,
 * shared and different on every run.
 */
export async function listStagingCaptures(
  limit = MAX_SCREENSHOTS,
  root = stagingRoot()
): Promise<RawScreenshot[]> {
  let captureDirs: string[]
  try {
    captureDirs = (await readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(CAPTURE_DIR_PREFIX))
      .map((entry) => join(root, entry.name))
  } catch {
    return []
  }

  const found: RawScreenshot[] = []
  for (const dir of captureDirs) {
    let names: string[]
    try {
      names = await readdir(dir)
    } catch {
      // One unreadable capture directory must not lose the others.
      continue
    }
    for (const name of names) {
      if (!isImageFile(name)) continue
      const described = await describeStagingCapture(join(dir, name))
      if (described) found.push(described)
    }
  }

  return found.sort((a, b) => b.capturedAt - a.capturedAt).slice(0, limit)
}
