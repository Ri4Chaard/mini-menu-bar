/**
 * User-initiated actions ON screenshot files.
 *
 * This module is deliberately separate from the indexing path
 * (screenshot-store, spotlight-source, fs-watcher, thumbnail,
 * location-resolver), which stays strictly read-only under feature 001's
 * FR-014a. The distinction that matters is not "does the app ever touch these
 * files" but "does it touch them on its own initiative":
 *
 *   - The indexer NEVER mutates. It watches, reads metadata, and builds
 *     thumbnails. That invariant is unchanged and still asserted mechanically.
 *   - This module mutates ONLY in response to an explicit click on Copy or
 *     Delete, and only in the two ways the user asked for.
 *
 * FR-014a was amended for feature 002 to draw that line; see FR-058 and the
 * note on FR-014a in specs/001-menu-bar-hub/spec.md. Deletion goes to the
 * Trash, never to unlink - the file stays recoverable in Finder
 * (research.md R-108).
 */
import { shell } from 'electron'
import { BridgeError } from '@shared/errors'
import { writeToClipboard } from './clipboard'

export { planClipboardWrite, writeToClipboard } from './clipboard'

export function copyScreenshotsToClipboard(paths: readonly string[]): void {
  writeToClipboard(paths)
}

/**
 * Move one screenshot to the Trash. Resolves `false` if the OS refused, so the
 * caller can distinguish "some failed" from "all failed" - copying or deleting
 * 3 of 4 succeeds, 0 of 4 does not (contracts/host-bridge.md).
 */
export async function trashScreenshot(path: string): Promise<boolean> {
  try {
    await shell.trashItem(path)
    return true
  } catch {
    return false
  }
}

export function nothingDeleted(cause?: unknown): BridgeError {
  const message =
    cause instanceof Error ? cause.message : 'None of those screenshots could be deleted.'
  return new BridgeError('FILE_NOT_FOUND', message)
}
