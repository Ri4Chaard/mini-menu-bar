/**
 * Live detection of new screenshots.
 *
 * Uses fs.watch, which is FSEvents-backed on macOS: push-based, so it costs no
 * CPU while idle (constitution Principle V forbids polling). The Spotlight
 * backfill handles history; this handles latency — SC-002 allows 3 seconds and
 * this delivers in well under one.
 *
 * Targets differ in shape. The saved-screenshot directories are flat and
 * watched flat. Captures macOS has not saved yet are reached by watching the
 * whole temporary directory recursively with a much narrower filter, because
 * the directory they actually live in refuses to be watched at all — see
 * staging-source.ts.
 */
import { watch, type FSWatcher } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename, join, extname } from 'node:path'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.tiff', '.heic', '.pdf'])

export function isImageFile(name: string): boolean {
  return IMAGE_EXTENSIONS.has(extname(name).toLowerCase())
}

export interface WatchTarget {
  directory: string
  /** FSEvents supports recursive watches; needed for per-capture subdirectories. */
  recursive?: boolean
  /**
   * Applied to the ABSOLUTE path, before debouncing. Defaults to "is an image".
   * A shared directory needs a narrower filter, or every unrelated write in it
   * is queued and stat'd - and a recursive watch over a busy tree makes that
   * the difference between a string comparison and a syscall per event.
   */
  accept?: (path: string) => boolean
}

export interface DirectoryWatcher {
  /** Re-point at a new set of targets, e.g. after the save location changed. */
  retarget(targets: readonly WatchTarget[]): void
  close(): void
  current(): string[]
}

export function createDirectoryWatcher(
  onCandidate: (path: string) => void,
  onRemoved: (path: string) => void
): DirectoryWatcher {
  let watchers: FSWatcher[] = []
  let targets: WatchTarget[] = []
  // macOS emits several events for one file write; collapse them.
  const debounce = new Map<string, ReturnType<typeof setTimeout>>()

  const settle = (path: string, notify: () => void): void => {
    const existing = debounce.get(path)
    if (existing) clearTimeout(existing)
    debounce.set(
      path,
      setTimeout(() => {
        debounce.delete(path)
        notify()
      }, 250)
    )
  }

  /**
   * fs.watch reports "something happened to this name", not what. Once the
   * events have settled, the file's existence is the answer: gone means the
   * user saved a staged capture, or deleted a file in Finder, and the entry
   * has to be reconciled away rather than described at a path that no longer
   * resolves.
   */
  const classify = async (path: string): Promise<void> => {
    try {
      await stat(path)
    } catch {
      onRemoved(path)
      return
    }
    onCandidate(path)
  }

  const closeAll = (): void => {
    for (const w of watchers) w.close()
    watchers = []
  }

  const key = (target: WatchTarget): string =>
    `${target.recursive === true ? 'r' : 'f'}:${target.directory}`

  return {
    retarget(next) {
      const same =
        next.length === targets.length && next.every((t, i) => key(t) === key(targets[i]!))
      if (same && watchers.length > 0) return
      closeAll()
      targets = [...next]
      for (const target of targets) {
        const accept = target.accept ?? ((path: string) => isImageFile(basename(path)))
        try {
          const w = watch(
            target.directory,
            { persistent: false, recursive: target.recursive === true },
            (_event, filename) => {
              if (!filename) return
              const path = join(target.directory, filename.toString())
              if (!accept(path)) return
              // A partially-written capture must not be described too early.
              settle(path, () => void classify(path))
            }
          )
          w.on('error', () => undefined)
          watchers.push(w)
        } catch {
          // An unwatchable directory is surfaced through the source-error path,
          // not thrown here — one bad directory must not kill the others. The
          // staging root routinely does not exist yet, which is not an error.
        }
      }
    },
    current: () => targets.map((t) => t.directory),
    close() {
      for (const t of debounce.values()) clearTimeout(t)
      debounce.clear()
      closeAll()
    }
  }
}
