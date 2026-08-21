/**
 * Spotlight backfill.
 *
 * `kMDItemIsScreenCapture` is set by macOS when the file is written, applies on
 * 10.8+, and survives renaming and moving. That is why the backfill finds
 * screenshots *wherever they ended up* — which is the user's actual stated
 * problem, not just "show me the configured folder" (research.md R-003).
 *
 * Filename patterns are deliberately NOT used: they are localised and break on
 * rename (FR-014, spec assumption "screenshot identification").
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { basename } from 'node:path'
import { MAX_SCREENSHOTS } from '@shared/types'

const run = promisify(execFile)

export const SCREENSHOT_QUERY = 'kMDItemIsScreenCapture == 1'

export interface RawScreenshot {
  path: string
  fileName: string
  capturedAt: number
}

/** Parse `mdls -raw` timestamps, which come back as `2026-08-21 13:52:08 +0000`. */
function parseMdlsDate(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '(null)') return null
  const ms = Date.parse(trimmed.replace(' +', '+').replace(/(\d{4}-\d{2}-\d{2}) /, '$1T'))
  return Number.isFinite(ms) ? ms : null
}

async function creationTime(path: string): Promise<number | null> {
  try {
    const { stdout } = await run('mdls', ['-raw', '-name', 'kMDItemContentCreationDate', path], {
      timeout: 5000
    })
    return parseMdlsDate(stdout)
  } catch {
    return null
  }
}

/** True if this specific file carries the screenshot attribute. */
export async function isScreenshot(path: string): Promise<boolean> {
  try {
    const { stdout } = await run('mdls', ['-raw', '-name', 'kMDItemIsScreenCapture', path], {
      timeout: 5000
    })
    return stdout.trim() === '1'
  } catch {
    return false
  }
}

export async function describe(path: string): Promise<RawScreenshot | null> {
  const capturedAt = await creationTime(path)
  if (capturedAt === null) return null
  return { path, fileName: basename(path), capturedAt }
}

/**
 * Every screenshot on the machine, newest first, capped.
 *
 * Not scoped to the watched directories on purpose — the whole point is to
 * surface the ones saved somewhere long forgotten.
 */
export async function backfillScreenshots(limit = MAX_SCREENSHOTS): Promise<RawScreenshot[]> {
  const { stdout } = await run('mdfind', [SCREENSHOT_QUERY], { timeout: 15_000, maxBuffer: 8 << 20 })
  const paths = stdout.split('\n').map((p) => p.trim()).filter(Boolean)

  // mdfind does not sort, so resolve times then take the newest. Cap the number
  // of mdls calls to keep startup cheap.
  const candidates = paths.slice(0, Math.max(limit * 6, 200))
  const described = await Promise.all(candidates.map((p) => describe(p)))

  return described
    .filter((d): d is RawScreenshot => d !== null)
    .sort((a, b) => b.capturedAt - a.capturedAt)
    .slice(0, limit)
}
