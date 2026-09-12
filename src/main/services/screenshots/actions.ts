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
 *   - This module mutates ONLY in response to an explicit click on Delete, and
 *     only in the way the user asked for. Starting a drag is here too, for the
 *     same reason - it happens only because the user picked a thumbnail up -
 *     though a drag copies at the destination and leaves the source file
 *     untouched.
 *
 * Feature 003 removed Copy entirely (FR-096), which makes dragging the only
 * route from the panel into another application (FR-103, research.md R-210).
 *
 * FR-014a was amended for feature 002 to draw that line; see FR-058 and the
 * note on FR-014a in specs/001-menu-bar-hub/spec.md. Deletion goes to the
 * Trash, never to unlink - the file stays recoverable in Finder
 * (research.md R-108).
 */
import { nativeImage, shell, type WebContents } from 'electron'
import { BridgeError } from '@shared/errors'
/**
 * Move one screenshot to the Trash. Resolves `false` if the OS refused, so the
 * caller can distinguish "some failed" from "all failed" - deleting 3 of 4
 * succeeds, 0 of 4 does not (contracts/host-bridge.md).
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

/**
 * Width of the image that follows the cursor during a drag. The stored
 * thumbnail is 320 px wide, which is a picture, not a cursor.
 */
const DRAG_ICON_WIDTH = 128

/**
 * Hand the dragged files to macOS.
 *
 * The renderer cannot do this: it has no paths, by design (constitution,
 * Security). It cancels its own HTML5 drag and asks main, which resolves the
 * ids it already owns and starts the native drag from the panel's own
 * webContents - so the drop lands in Messages, Slack or Finder as a real file
 * rather than as text.
 *
 * Read-only despite living in this module: a drag copies at the destination and
 * never touches the source file.
 */
export function beginScreenshotDrag(
  sender: WebContents,
  paths: readonly string[],
  iconDataUrl: string | null
): void {
  const first = paths[0]
  if (!first) throw new BridgeError('FILE_NOT_FOUND', 'No screenshots to drag.')

  // Electron refuses an empty icon outright, so this has to resolve to a real
  // image. The thumbnail main already generated is the cheap route; reading the
  // full-resolution file back off disk only to shrink it again is the slow way
  // to the same picture, and is kept as the fallback for an entry whose
  // thumbnail never rendered.
  const fromThumbnail = iconDataUrl
    ? nativeImage.createFromDataURL(iconDataUrl)
    : nativeImage.createEmpty()
  const source = fromThumbnail.isEmpty() ? nativeImage.createFromPath(first) : fromThumbnail
  if (source.isEmpty()) {
    throw new BridgeError('FILE_NOT_FOUND', 'That screenshot could not be prepared for dragging.')
  }

  sender.startDrag({ file: first, files: [...paths], icon: source.resize({ width: DRAG_ICON_WIDTH }) })
}
