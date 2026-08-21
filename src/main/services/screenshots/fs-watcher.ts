/**
 * Live detection of new screenshots.
 *
 * Uses fs.watch, which is FSEvents-backed on macOS: push-based, so it costs no
 * CPU while idle (constitution Principle V forbids polling). The Spotlight
 * backfill handles history; this handles latency — SC-002 allows 3 seconds and
 * this delivers in well under one.
 */
import { watch, type FSWatcher } from 'node:fs'
import { join, extname } from 'node:path'

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.tiff', '.heic', '.pdf'])

export interface DirectoryWatcher {
  /** Re-point at a new set of directories, e.g. after the save location changed. */
  retarget(directories: string[]): void
  close(): void
  current(): string[]
}

export function createDirectoryWatcher(
  onCandidate: (path: string) => void,
  onRemoved: (path: string) => void
): DirectoryWatcher {
  let watchers: FSWatcher[] = []
  let directories: string[] = []
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

  const closeAll = (): void => {
    for (const w of watchers) w.close()
    watchers = []
  }

  return {
    retarget(next) {
      const same = next.length === directories.length && next.every((d, i) => d === directories[i])
      if (same && watchers.length > 0) return
      closeAll()
      directories = [...next]
      for (const dir of directories) {
        try {
          const w = watch(dir, { persistent: false }, (_event, filename) => {
            if (!filename) return
            const name = filename.toString()
            if (!IMAGE_EXTENSIONS.has(extname(name).toLowerCase())) return
            // A partially-written capture must not be described too early.
            settle(join(dir, name), () => onCandidate(join(dir, name)))
          })
          w.on('error', () => undefined)
          watchers.push(w)
        } catch {
          // An unwatchable directory is surfaced through the source-error path,
          // not thrown here — one bad directory must not kill the others.
        }
      }
      void onRemoved
    },
    current: () => [...directories],
    close() {
      for (const t of debounce.values()) clearTimeout(t)
      debounce.clear()
      closeAll()
    }
  }
}
