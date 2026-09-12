import { MAX_TIMER_PRESET_MS, MIN_TIMER_PRESET_MS } from '@shared/types'

/**
 * Parse a typed timer duration (FR-104).
 *
 * Rejection and clamping are deliberately different outcomes, and the
 * difference is about intent (FR-106 vs FR-107):
 *
 *   - Unparseable input is a MISTAKE. It returns null so the UI can say so and
 *     keep the previous duration, rather than silently starting some other
 *     timer than the one that was asked for.
 *   - Out-of-range input is an INTENT the app cannot honour exactly, so it is
 *     clamped into range. This mirrors how `normalisePresets` already repairs
 *     rather than rejects user data.
 *
 * Pure, so it is unit-tested without a host runtime (constitution Principle IV).
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** A bare number means MINUTES: "7" is the common case, and 7 ms is not useful. */
const BARE_NUMBER = /^(\d+)$/
/** "90s", "7m", "2h" — an explicit unit. */
const SUFFIXED = /^(\d+)\s*(s|m|h)$/i
/** "7:30" (m:ss) or "1:30:00" (h:mm:ss). */
const CLOCK = /^(\d+):([0-5]\d)(?::([0-5]\d))?$/

export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase()
  if (text === '') return null

  const ms = parseToMs(text)
  if (ms === null) return null

  return Math.min(Math.max(ms, MIN_TIMER_PRESET_MS), MAX_TIMER_PRESET_MS)
}

function parseToMs(text: string): number | null {
  const bare = BARE_NUMBER.exec(text)
  if (bare) return Number(bare[1]) * MINUTE

  const suffixed = SUFFIXED.exec(text)
  if (suffixed) {
    const value = Number(suffixed[1])
    const unit = suffixed[2]
    if (unit === 's') return value * 1000
    if (unit === 'm') return value * MINUTE
    return value * HOUR
  }

  const clock = CLOCK.exec(text)
  if (clock) {
    const [, a, b, c] = clock
    // Three parts are h:mm:ss; two are m:ss. The seconds group is bounded to
    // 0-59 by the pattern, so "1:75" does not parse at all rather than being
    // silently read as 2:15.
    return c === undefined
      ? Number(a) * MINUTE + Number(b) * 1000
      : Number(a) * HOUR + Number(b) * MINUTE + Number(c) * 1000
  }

  return null
}

/** Render a duration the way the input accepts it, for seeding the field. */
export function formatDurationInput(ms: number): string {
  const total = Math.round(ms / 1000)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${minutes}:${pad(seconds)}`
}
