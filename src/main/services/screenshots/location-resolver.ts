/**
 * Where macOS is currently saving screenshots.
 *
 * `defaults read com.apple.screencapture location` is unset by default, in
 * which case screenshots land on the Desktop (research.md R-003).
 */
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

function expandTilde(input: string): string {
  return input.startsWith('~') ? resolve(homedir(), input.slice(1).replace(/^\/+/, '')) : input
}

export async function resolveScreenshotLocation(): Promise<string> {
  try {
    const { stdout } = await run('defaults', ['read', 'com.apple.screencapture', 'location'], {
      timeout: 3000
    })
    const value = stdout.trim()
    if (value) return expandTilde(value)
  } catch {
    // Unset is the common case, not an error.
  }
  return resolve(homedir(), 'Desktop')
}

/**
 * The directories worth watching: the configured location, plus the Desktop
 * when that is not already it (FR-014).
 */
export async function resolveWatchedDirectories(): Promise<string[]> {
  const configured = await resolveScreenshotLocation()
  const desktop = resolve(homedir(), 'Desktop')
  return configured === desktop ? [configured] : [configured, desktop]
}
