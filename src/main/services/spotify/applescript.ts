/**
 * AppleScript access to the Spotify desktop app.
 *
 * Apple Events are gated by macOS TCC: the bundle must declare
 * NSAppleEventsUsageDescription and the user grants a one-time consent. Denial
 * is a first-class state, not an error - "permission denied" must be
 * distinguishable from "Spotify isn't running" (research.md R-007, FR-025).
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export type ScriptOutcome =
  | { kind: 'ok'; value: string }
  | { kind: 'not-running' }
  | { kind: 'permission-denied' }
  | { kind: 'error'; message: string }

export async function runSpotifyScript(body: string): Promise<ScriptOutcome> {
  const script = `if application "Spotify" is running then
  tell application "Spotify"
    ${body}
  end tell
else
  return "__NOT_RUNNING__"
end if`

  try {
    const { stdout } = await run('osascript', ['-e', script], { timeout: 5000 })
    const value = stdout.trim()
    if (value === '__NOT_RUNNING__') return { kind: 'not-running' }
    return { kind: 'ok', value }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    // -1743 is errAEEventNotPermitted: the user declined automation access.
    if (/-1743|not allowed|not authori[sz]ed|assistive access/i.test(message)) {
      return { kind: 'permission-denied' }
    }
    if (/-600|not running/i.test(message)) return { kind: 'not-running' }
    return { kind: 'error', message }
  }
}

/** ASCII unit separator - cannot occur inside a track or artist name. */
export const FIELD_SEP = '\u001F'

const S = "(ASCII character 31)"

export const STATE_SCRIPT = `set st to player state as string
  if st is "stopped" then return st
  set n to name of current track
  set a to artist of current track
  set d to duration of current track
  set p to player position
  return st & ${S} & n & ${S} & a & ${S} & (d as string) & ${S} & (p as string)`
