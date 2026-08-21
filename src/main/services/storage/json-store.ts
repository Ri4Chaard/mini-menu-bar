/**
 * A ~60-line atomic JSON store. Constitution Principle V sets runtime
 * dependencies to zero by default and asks why hand-writing is worse; for two
 * small documents it is not worse, and atomic rename is the whole trick
 * (research.md R-010).
 */
import { readFile, rename, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { BridgeError } from '@shared/errors'

export interface JsonStore<T> {
  read(): Promise<T>
  write(value: T): Promise<void>
}

export function createJsonStore<T>(
  filePath: string,
  fallback: T,
  revive: (raw: unknown, fallback: T) => T = (raw, fb) => (raw as T) ?? fb
): JsonStore<T> {
  let queue: Promise<void> = Promise.resolve()

  return {
    async read(): Promise<T> {
      try {
        const text = await readFile(filePath, 'utf8')
        return revive(JSON.parse(text), fallback)
      } catch {
        // A missing or corrupt file falls back to defaults and MUST NOT block
        // startup (data-model.md, Preferences validation rules).
        return fallback
      }
    },

    async write(value: T): Promise<void> {
      // Serialise writes so two concurrent saves cannot interleave temp files.
      const run = queue.then(async () => {
        const tmp = join(dirname(filePath), `.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`)
        try {
          await mkdir(dirname(filePath), { recursive: true })
          await writeFile(tmp, JSON.stringify(value, null, 2), 'utf8')
          // Rename is atomic within a filesystem: readers see either the old
          // file or the new one, never a half-written document.
          await rename(tmp, filePath)
        } catch (error) {
          throw new BridgeError(
            'PERSISTENCE_FAILED',
            `Could not save to disk: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      })
      queue = run.catch(() => undefined)
      return run
    }
  }
}
