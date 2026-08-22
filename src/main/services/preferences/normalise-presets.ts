import {
  DEFAULT_PREFERENCES,
  MAX_TIMER_PRESET_MS,
  MAX_TIMER_PRESETS,
  MIN_TIMER_PRESET_MS
} from '@shared/types'

/**
 * Sort, de-duplicate, clamp and cap the timer preset list.
 *
 * Pure, so it is unit-tested without a host runtime (constitution Principle
 * IV). Applied on every read AND every write: presets are user data now
 * (FR-063), which means the array on disk can be anything, and a Timer section
 * that throws on a malformed file is worse than one that repairs it
 * (data-model.md, research.md R-112).
 */
export function normalisePresets(input: readonly number[] | undefined): number[] {
  if (!Array.isArray(input)) return [...DEFAULT_PREFERENCES.timerPresets]

  const cleaned = input
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    .map((value) => Math.round(value))
    .filter((value) => value >= MIN_TIMER_PRESET_MS && value <= MAX_TIMER_PRESET_MS)

  const unique = [...new Set(cleaned)].sort((a, b) => a - b)

  // Keeping the SHORTEST when over the cap is deliberate: short durations are
  // the ones reached most often, and the row is capped by width, not by taste.
  const capped = unique.slice(0, MAX_TIMER_PRESETS)

  // An empty row would leave the Timer with no way to set a duration at all.
  return capped.length > 0 ? capped : [...DEFAULT_PREFERENCES.timerPresets]
}
