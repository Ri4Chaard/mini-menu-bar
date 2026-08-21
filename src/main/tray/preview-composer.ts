/**
 * Composes the menu bar content from four inputs.
 *
 * FR-001 requires exactly one menu bar item, so this is a single tray: the
 * image slot carries the latest screenshot thumbnail, and the title slot
 * carries a composed string (research.md R-005).
 *
 * Deliberately a pure function of its inputs, with no Electron imports beyond a
 * type. That is what makes the truncation and ordering rules exhaustively
 * testable without launching an app (constitution Principle IV).
 */
import type { NativeImage } from 'electron'
import type { PlaybackState, Preferences, TimerState } from '@shared/types'

/** Per-segment and total character budgets (FR-035, SC-010). */
export const TRACK_BUDGET = 24
export const TITLE_BUDGET = 42
const SEPARATOR = '  '

export interface PreviewInput {
  preferences: Preferences
  unseenCount: number
  latestThumbnail: NativeImage | null
  timer: TimerState
  playback: PlaybackState
}

export interface TrayPreviewModel {
  image: NativeImage | null
  title: string
}

export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`
}

export function truncate(text: string, budget: number): string {
  if (text.length <= budget) return text
  return `${text.slice(0, Math.max(0, budget - 1)).trimEnd()}…`
}

export function composePreview(input: PreviewInput): TrayPreviewModel {
  const { preferences, unseenCount, latestThumbnail, timer, playback } = input
  const { previews } = preferences

  // Fixed order, regardless of which previews are enabled, so the menu bar does
  // not reshuffle as the user toggles things.
  const segments: string[] = []

  if (previews.screenshots && unseenCount > 0) {
    segments.push(String(unseenCount))
  }

  if (previews.timer && (timer.status === 'running' || timer.status === 'paused')) {
    const remaining = formatRemaining(timer.remainingMs)
    segments.push(timer.status === 'paused' ? `${remaining} paused` : remaining)
  }

  if (
    previews.spotify &&
    (playback.availability === 'playing' || playback.availability === 'paused') &&
    playback.trackName
  ) {
    segments.push(truncate(playback.trackName, TRACK_BUDGET))
  }

  const title = truncate(segments.join(SEPARATOR), TITLE_BUDGET)

  return {
    image: previews.screenshots ? latestThumbnail : null,
    title
  }
}
