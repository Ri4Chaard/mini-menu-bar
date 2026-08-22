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
    // execFile attaches the process's stderr separately; osascript reports the
    // actual OSA error code there, not in `message`. Classifying on `message`
    // alone therefore never saw the code and fell through to "not running".
    const stderr = String((error as { stderr?: string }).stderr ?? '')
    const message = `${error instanceof Error ? error.message : String(error)} ${stderr}`

    // -1743 is errAEEventNotPermitted: the user declined automation access.
    if (/-1743|not allowed|not authori[sz]ed|assistive access/i.test(message)) {
      return { kind: 'permission-denied' }
    }
    if (/-600|not running/i.test(message)) return { kind: 'not-running' }
    // An unexpected script failure is NOT the same as Spotify being closed.
    // Logging it is what makes it discoverable: an earlier bug here reported
    // "Spotify isn't running" for a script error and hid the real cause.
    console.error('[spotify] unexpected AppleScript failure:', stderr.trim() || message)
    return { kind: 'error', message }
  }
}

/** ASCII unit separator - cannot occur inside a track or artist name. */
export const FIELD_SEP = '\u001F'

const S = "(ASCII character 31)"

/**
 * Reads playback state in one round trip.
 *
 * Two things here are deliberate and were both bugs first:
 *
 *  - Variable names are spelled out. `st` is ambiguous to the AppleScript
 *    parser (it reads as an ordinal suffix) and produced a hard syntax error,
 *    which meant Spotify never worked at all.
 *  - Position is rounded to whole milliseconds inside AppleScript. `player
 *    position` is a float, and AppleScript formats floats using the user's
 *    locale - on a Ukrainian system that is "98,248", which Number() parses as
 *    NaN. Rounding to an integer means no decimal separator ever crosses the
 *    boundary.
 *  - Duration is NOT rounded. Spotify already reports it as an integer number
 *    of milliseconds, and `round` on an integer fails with -1700, which took
 *    the whole script down.
 */
export const STATE_SCRIPT = `set playerState to player state as text
  if playerState is "stopped" then return playerState
  set trackName to name of current track
  set trackArtist to artist of current track
  set trackDuration to duration of current track
  set trackPosition to (round (player position * 1000))
  set soundVolume to sound volume
  set isShuffling to shuffling
  set isRepeating to repeating
  set artUrl to artwork url of current track
  return playerState & ${S} & trackName & ${S} & trackArtist & ${S} & (trackDuration as string) & ${S} & (trackPosition as string) & ${S} & (soundVolume as string) & ${S} & (isShuffling as string) & ${S} & (isRepeating as string) & ${S} & artUrl`

/**
 * Volume, shuffle and repeat ride the SAME round trip as the rest of the state
 * rather than three extra osascript spawns, which keeps the poll cost flat
 * (research.md R-109, constitution Principle V).
 *
 * `sound volume` is an integer, so it does not hit the decimal-separator trap
 * that `player position` did - but it still goes through the caller's numeric
 * guard, because a locale surprise here would blank the whole playback state.
 *
 * `repeating` is a BOOLEAN. The off/all/one cycle in Spotify's own interface is
 * not scriptable, which is why repeat ships as a toggle (FR-068 as amended).
 */
export const setVolumeScript = (volume: number): string => `set sound volume to ${volume}`
export const setShuffleScript = (on: boolean): string => `set shuffling to ${on}`
export const setRepeatScript = (on: boolean): string => `set repeating to ${on}`
