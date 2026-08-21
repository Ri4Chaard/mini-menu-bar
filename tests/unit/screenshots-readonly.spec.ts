/**
 * FR-014a: the app treats screenshot files as strictly read-only.
 *
 * The read-only promise is invisible until it has already been broken, so this
 * asserts it mechanically rather than by review. Every module on the screenshot
 * code path is scanned for mutating filesystem calls.
 */
import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const DIR = join(process.cwd(), 'src/main/services/screenshots')
const MODULES = [
  'screenshot-store.ts',
  'spotlight-source.ts',
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

describe('screenshot code path is read-only (FR-014a)', () => {
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
