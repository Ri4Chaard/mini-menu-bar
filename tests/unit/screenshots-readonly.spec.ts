/**
 * FR-014a, as amended for feature 002.
 *
 * The original promise was that the app never touches a screenshot file at all.
 * Feature 002 adds user-initiated Copy and Delete (FR-058), so the promise is
 * narrowed rather than dropped, and the line it is narrowed to is the one that
 * actually protects the user:
 *
 *   - The INDEXING path never mutates, full stop. It watches, reads metadata
 *     and builds thumbnails. Nothing it does is initiated by the app touching
 *     a file. This is unchanged and asserted below exactly as before.
 *   - The ACTION path (actions.ts) may mutate, but only via the Trash, and
 *     only in response to an explicit click. It may never unlink, rename,
 *     overwrite or copy a file in place.
 *
 * The read-only promise is invisible until it has already been broken, which
 * is why both halves are asserted mechanically rather than by review.
 */
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'src/main/services/screenshots')
const MODULES = [
  'screenshot-store.ts',
  'spotlight-source.ts',
  'staging-source.ts',
  'fs-watcher.ts',
  'thumbnail.ts',
  'location-resolver.ts'
]

/** Mutating fs operations. `watch`, `access`, `readFile`, `stat` are allowed. */
const FORBIDDEN = [
  'writeFile', 'appendFile', 'rename', 'unlink', 'rm(', 'rmdir', 'mkdir',
  'copyFile', 'truncate', 'chmod', 'chown', 'utimes', 'createWriteStream',
  'trashItem', 'moveItemToTrash'
]

describe('screenshot INDEXING path is read-only (FR-014a)', () => {
  for (const file of MODULES) {
    it(`${file} contains no mutating filesystem call`, async () => {
      const source = await readFile(join(DIR, file), 'utf8')
      const code = source
        .split('\n')
        .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
        .join('\n')
      for (const call of FORBIDDEN) {
        expect(code, `${file} must not call ${call}`).not.toContain(call)
      }
    })
  }

  it('never invokes the defaults *write* command for screencapture settings', async () => {
    for (const file of MODULES) {
      const source = await readFile(join(DIR, file), 'utf8')
      expect(source).not.toContain("'write'")
      expect(source).not.toMatch(/defaults['"],\s*\[['"]write/)
    }
  })
})

describe('screenshot ACTION path deletes only to the Trash (FR-058)', () => {
  /**
   * Everything from FORBIDDEN except trashItem/moveItemToTrash. Delete must
   * stay recoverable in Finder: an unlink here would be indistinguishable to
   * the user right up to the moment they try to get the file back
   * (research.md R-108).
   */
  const STILL_FORBIDDEN = FORBIDDEN.filter(
    (call) => call !== 'trashItem' && call !== 'moveItemToTrash'
  )

  it('actions.ts never hard-deletes, renames or overwrites', async () => {
    const source = await readFile(join(DIR, 'actions.ts'), 'utf8')
    const code = source
      .split('\n')
      .filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'))
      .join('\n')
    for (const call of STILL_FORBIDDEN) {
      expect(code, `actions.ts must not call ${call}`).not.toContain(call)
    }
  })

  it('trashing is confined to actions.ts', async () => {
    // If a second module grows its own trashItem call, the amended invariant
    // stops being reviewable in one place. Keeping it to one module is what
    // makes the narrowing safe.
    for (const file of MODULES) {
      const source = await readFile(join(DIR, file), 'utf8')
      expect(source, `${file} must delegate deletion to actions.ts`).not.toContain('trashItem')
    }
  })
})
