/**
 * Putting screenshots on the macOS pasteboard.
 *
 * The pasteboard holds one image at a time, so a multi-selection cannot be
 * copied as images. The choice between the two representations is pure and
 * lives in `planClipboardWrite` so it can be unit-tested without an Electron
 * runtime (research.md R-107, constitution Principle IV).
 */
import { clipboard, nativeImage } from 'electron'
import { pathToFileURL } from 'node:url'
import { BridgeError } from '@shared/errors'

export type ClipboardPlan =
  | { mode: 'image'; path: string }
  | { mode: 'references'; paths: string[]; uriList: string; text: string }

export function planClipboardWrite(paths: readonly string[]): ClipboardPlan {
  if (paths.length === 0) {
    // Copying 3 of 4 succeeds; copying 0 of 4 must surface, not silently clear
    // the pasteboard (contracts/host-bridge.md).
    throw new BridgeError('FILE_NOT_FOUND', 'No screenshots to copy')
  }

  if (paths.length === 1) return { mode: 'image', path: paths[0]! }

  return {
    mode: 'references',
    paths: [...paths],
    // A raw space in a file:// URL makes the uri-list unparseable to the
    // receiving app, which the user sees as a paste that does nothing.
    uriList: paths.map((path) => pathToFileURL(path).href).join('\n'),
    // The text flavour stays human-readable: it is what a text editor gets.
    text: paths.join('\n')
  }
}

export function writeToClipboard(paths: readonly string[]): void {
  const plan = planClipboardWrite(paths)

  if (plan.mode === 'image') {
    const image = nativeImage.createFromPath(plan.path)
    if (image.isEmpty()) {
      throw new BridgeError('FILE_NOT_FOUND', 'That screenshot could not be read')
    }
    clipboard.write({ image })
    return
  }

  clipboard.write({ text: plan.text, 'text/uri-list': plan.uriList } as Parameters<
    typeof clipboard.write
  >[0])
}
