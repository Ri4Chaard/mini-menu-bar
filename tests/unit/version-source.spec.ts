/**
 * The version must come from the running application, never from a string
 * written down in interface code (FR-124).
 *
 * This exists because that is precisely the bug feature 004 fixed:
 * settings-section.tsx carried `const APP_VERSION = 'v0.1.0'` alongside a
 * releases URL naming a repository that did not exist. Both drifted silently
 * because nothing checked. A comment saying "read it from the host" would have
 * drifted too; this does not.
 */
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RENDERER = join(__dirname, '../../src/renderer')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry) ? [full] : []
  })
}

/**
 * The one legitimate version literal in the renderer.
 *
 * host-mock.ts IS the source of truth for browser mode - there is no running
 * application behind it to ask. Exempted by name rather than by loosening the
 * pattern, so adding a second exemption is a visible decision.
 */
const EXEMPT = ['host/host-mock.ts']

const files = sourceFiles(RENDERER).filter(
  (f) => !EXEMPT.includes(f.slice(RENDERER.length + 1))
)

describe('the renderer never hardcodes a version', () => {
  it('finds source files to check, so a broken glob cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it.each(files.map((f) => [f.slice(RENDERER.length + 1), f]))(
    '%s contains no version literal',
    (_label, path) => {
      const source = readFileSync(path, 'utf8')
      // A quoted dotted triple, optionally v-prefixed: 'v0.1.0', "1.2.3".
      const matches = source.match(/['"`]v?\d+\.\d+\.\d+[^'"`]*['"`]/g) ?? []
      expect(matches, `hardcoded version in ${path}`).toEqual([])
    }
  )
})

describe('the renderer never hardcodes a releases URL', () => {
  it.each(files.map((f) => [f.slice(RENDERER.length + 1), f]))(
    '%s contains no github.com address',
    (_label, path) => {
      // FR-126: the interface receives a version string, never an address.
      // openReleasesPage() takes no argument for exactly this reason.
      expect(readFileSync(path, 'utf8')).not.toMatch(/https?:\/\/[^'"`\s]*github\.com/)
    }
  )
})
