/**
 * Spotlight backfill.
 *
 * macOS stamps a screenshot with a metadata attribute when the file is written,
 * and that attribute survives renaming and moving. That is why the backfill
 * finds screenshots *wherever they ended up* - which is the user's actual
 * stated problem, not just "show me the configured folder" (research.md R-003).
 *
 * WHICH attribute is the whole ballgame, and the obvious-looking name is the
 * wrong one. `kMDItemIsScreenCapture` is in Apple's MDItem reference and reads
 * like the right key, but nothing populates it on current macOS - measured on
 * 15.7.4, a real screenshot reports `(null)` for it and `mdfind` matches zero
 * files on the whole disk. The attribute macOS actually writes is
 * `kMDItemImageIsScreenshot`.
 *
 * Shipping the wrong one made the backfill return nothing on every machine, and
 * because `mdfind` exits 0 with no output, that failure was indistinguishable
 * from "this user has no screenshots". Only staged captures kept appearing,
 * because staging-source.ts identifies those by provenance and never asks
 * Spotlight (see SCREENSHOT_ATTRIBUTES below).
 *
 * Filename patterns are deliberately NOT used: they are localised - a Ukrainian
 * system writes "Знімок екрана 2026-08-21 о 17.31.10.png" - and they break on
 * rename (FR-014, spec assumption "screenshot identification").
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { basename } from 'node:path'
import { MAX_SCREENSHOTS } from '@shared/types'

const run = promisify(execFile)

/**
 * Every attribute that has meant "this file is a screenshot", newest first.
 *
 * `kMDItemImageIsScreenshot` is the one current macOS writes and the only one
 * that matches anything today. `kMDItemIsScreenCapture` is kept behind it
 * rather than deleted: it is what Apple's reference documents, it costs one
 * clause in a query that runs once per launch, and an older macOS that does
 * populate it keeps working. Neither is asserted to exist - a machine where
 * both are empty is a machine with no indexed screenshots, which is a normal
 * state.
 *
 * Both the disk-wide query and the single-file check are derived from this
 * list, so the two can never drift apart and start disagreeing about what a
 * screenshot is.
 */
export const SCREENSHOT_ATTRIBUTES = [
  'kMDItemImageIsScreenshot',
  'kMDItemIsScreenCapture'
] as const

export const SCREENSHOT_QUERY = SCREENSHOT_ATTRIBUTES.map((attr) => `${attr} == 1`).join(' || ')
const CREATION_ATTR = 'kMDItemContentCreationDate'

export interface RawScreenshot {
  path: string
  fileName: string
  capturedAt: number
  /**
   * True for a capture still parked in the macOS staging area - taken, but
   * never saved anywhere the user can find it (staging-source.ts). It is the
   * one fact about an entry the UI cannot re-derive from the path.
   */
  isTemporary: boolean
}

/** Parse Spotlight timestamps, which come back as `2026-08-21 14:31:13 +0000`. */
function parseSpotlightDate(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '(null)') return null
  const ms = Date.parse(trimmed.replace(' +', '+').replace(/(\d{4}-\d{2}-\d{2}) /, '$1T'))
  return Number.isFinite(ms) ? ms : null
}

/**
 * Split `mdls -raw` output into one value per requested attribute.
 *
 * Exported so the NUL framing is covered by a test without shelling out - it is
 * the one part of this module's contract with mdls that is easy to get wrong
 * and invisible when it is.
 */
export function parseAttributeValues(stdout: string): string[] {
  return stdout.split('\0').map((value) => value.trim())
}

/**
 * True if this specific file carries the screenshot attribute.
 *
 * Spotlight does not index instantly: measured on a real Mac, the attribute
 * takes roughly two seconds to appear after the file is written. Checking once
 * and giving up is why freshly-taken screenshots used to appear only
 * intermittently - the watcher asked too early, got "no", and dropped the file
 * until the next launch's backfill.
 */
export async function isScreenshot(path: string, attempts = 12, delayMs = 500): Promise<boolean> {
  const names = SCREENSHOT_ATTRIBUTES.flatMap((attr) => ['-name', attr])

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const { stdout } = await run('mdls', ['-raw', ...names, path], { timeout: 5000 })
      // `mdls -raw` separates the values of multiple -name flags with NUL, and
      // reports an unset one as the literal "(null)". Any attribute saying 1 is
      // enough - they are alternative spellings of the same fact.
      if (parseAttributeValues(stdout).includes('1')) return true
    } catch {
      return false
    }
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return false
}

export async function describe(path: string): Promise<RawScreenshot | null> {
  try {
    const { stdout } = await run('mdls', ['-raw', '-name', CREATION_ATTR, path], { timeout: 5000 })
    const capturedAt = parseSpotlightDate(stdout)
    if (capturedAt === null) return null
    return { path, fileName: basename(path), capturedAt, isTemporary: false }
  } catch {
    return null
  }
}

/**
 * Every screenshot on the machine, newest first, capped.
 *
 * Not scoped to the watched directories on purpose - the whole point is to
 * surface the ones saved somewhere long forgotten.
 *
 * `mdfind -attr` returns the creation date alongside each path, so this is a
 * single child process. The previous version ran `mdls` per candidate through
 * Promise.all, which fanned out to hundreds of concurrent processes on a
 * machine with a real screenshot history.
 */
/**
 * Parse one `mdfind -attr` line into a screenshot record.
 *
 * Both the path and the date contain spaces, and mdfind separates them with a
 * run of spaces rather than a tab, so this anchors on the attribute name and
 * takes its LAST occurrence - a path could in principle contain the earlier
 * text. Exported so the format is covered by tests without shelling out.
 */
export function parseBackfillLine(line: string): RawScreenshot | null {
  const marker = `${CREATION_ATTR} = `
  const at = line.lastIndexOf(marker)
  if (at === -1) return null

  const path = line.slice(0, at).trimEnd()
  const capturedAt = parseSpotlightDate(line.slice(at + marker.length))
  if (!path || capturedAt === null) return null

  return { path, fileName: basename(path), capturedAt, isTemporary: false }
}

export async function backfillScreenshots(limit = MAX_SCREENSHOTS): Promise<RawScreenshot[]> {
  const { stdout } = await run('mdfind', ['-attr', CREATION_ATTR, SCREENSHOT_QUERY], {
    timeout: 20_000,
    maxBuffer: 16 << 20
  })

  return stdout
    .split('\n')
    .flatMap((line) => {
      const parsed = parseBackfillLine(line)
      return parsed ? [parsed] : []
    })
    .sort((a, b) => b.capturedAt - a.capturedAt)
    .slice(0, limit)
}
