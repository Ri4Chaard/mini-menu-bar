/**
 * The test that would have caught the screenshots-never-appear bug.
 *
 * Every other test in this repo mocks the shell, which is why a query naming an
 * attribute macOS does not populate - `kMDItemIsScreenCapture` - shipped and
 * survived four features. `mdfind` exits 0 with no output for such a query, so
 * the app could not tell "no screenshots on this machine" from "wrong key", and
 * rendered the empty state either way.
 *
 * So this suite talks to the real Spotlight index. It asserts the one thing a
 * mock cannot: that the attribute the app asks for is the attribute this
 * machine actually writes.
 *
 * It is macOS-only and depends on machine state, so it skips rather than fails
 * where it cannot see enough to judge - including a bare CI runner, which has
 * no screenshots. That is a deliberate limit: this suite protects a developer's
 * own machine and any machine with a screenshot history, and CI keeps the
 * pure-parsing cover in tests/unit/spotlight-parsing.spec.ts.
 */
import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import { basename } from 'node:path'
import { promisify } from 'node:util'
import { describe, it, expect } from 'vitest'
import {
  SCREENSHOT_ATTRIBUTES,
  SCREENSHOT_QUERY,
  isScreenshot
} from '../../src/main/services/screenshots/spotlight-source'

const run = promisify(execFile)

const onMac = process.platform === 'darwin'

async function mdfind(query: string): Promise<string[]> {
  try {
    const { stdout } = await run('mdfind', [query], { timeout: 20_000, maxBuffer: 16 << 20 })
    return stdout.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

async function indexingEnabled(): Promise<boolean> {
  try {
    const { stdout } = await run('mdutil', ['-s', '/'], { timeout: 5000 })
    return /Indexing enabled/i.test(stdout)
  } catch {
    return false
  }
}

/**
 * Screenshots found WITHOUT asking the attribute under test - otherwise this
 * suite would only ever confirm that the app agrees with itself.
 *
 * Production code is forbidden from identifying screenshots by filename: the
 * names are localised and they break on rename, which is the whole reason the
 * app uses metadata (see the note at the top of spotlight-source.ts). A test
 * oracle is the one place the heuristic is legitimate, because a false negative
 * only costs a skip and it gives an independent answer.
 *
 * Each pattern keeps the space before the date that `screencapture` writes.
 * That is what separates a real capture from the lookalikes other apps produce
 * - Zoom saves `Screenshot2026_02_08_122235.jpg`, which is not stamped and must
 * not be treated as evidence of anything.
 */
const ORACLE_PATTERNS = [
  'Screenshot *',
  'Screen Shot *',
  'Знімок екрана *',
  'Снимок экрана *',
  'Bildschirmfoto *',
  'Captura de pantalla *',
  "Capture d'écran *"
]

async function screenshotsByName(limit = 10): Promise<string[]> {
  const found = new Set<string>()

  for (const pattern of ORACLE_PATTERNS) {
    for (const path of await mdfind(`kMDItemFSName == "${pattern}"`)) {
      // A stale index entry names a file that is gone; it can say nothing about
      // an attribute.
      try {
        await access(path, constants.R_OK)
        found.add(path)
      } catch {
        continue
      }
      if (found.size >= limit) return [...found]
    }
  }

  return [...found]
}

describe.skipIf(!onMac)('Spotlight screenshot attribute, against the real index', () => {
  it('asks for an attribute this machine populates', async () => {
    if (!(await indexingEnabled())) return

    const byName = await screenshotsByName()
    if (byName.length === 0) return // No screenshot history here; nothing to judge.

    // The decisive assertion. With the attribute wrong, every one of these is
    // a real screenshot the app would silently drop - which is exactly what
    // shipped. `attempts: 1` because the file is long since indexed; the retry
    // loop exists for files being written right now.
    const verdicts = await Promise.all(byName.map((path) => isScreenshot(path, 1)))
    const missed = byName.filter((_, i) => !verdicts[i])

    expect(
      missed,
      `Spotlight does not report any of ${SCREENSHOT_ATTRIBUTES.join(' / ')} for files that ` +
        `are plainly screenshots. The app would show "No screenshots yet" on this machine.\n` +
        missed.map((p) => `  - ${basename(p)}`).join('\n')
    ).toEqual([])
  })

  it('returns those same screenshots from the disk-wide query', async () => {
    if (!(await indexingEnabled())) return

    const byName = await screenshotsByName()
    if (byName.length === 0) return

    const byQuery = new Set(await mdfind(SCREENSHOT_QUERY))

    // The backfill and the per-file check are two different calls into
    // Spotlight, and the original bug broke both. Agreeing with mdls is not
    // enough - the query has to return the file too, or history stays empty
    // while newly-watched files still arrive.
    expect(byName.filter((path) => !byQuery.has(path))).toEqual([])
  })

  it('agrees with itself: everything the query returns passes the file check', async () => {
    if (!(await indexingEnabled())) return

    const sample = (await mdfind(SCREENSHOT_QUERY)).slice(0, 10)
    if (sample.length === 0) return

    const live: string[] = []
    for (const path of sample) {
      try {
        await access(path, constants.R_OK)
        live.push(path)
      } catch {
        continue
      }
    }
    if (live.length === 0) return

    const verdicts = await Promise.all(live.map((path) => isScreenshot(path, 1)))
    expect(verdicts.every(Boolean)).toBe(true)
  })
})
