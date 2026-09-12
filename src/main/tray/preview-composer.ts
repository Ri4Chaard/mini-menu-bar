/**
 * Composes the menu bar content from four inputs.
 *
 * FR-001 requires exactly one menu bar item, so this is a single tray: the
 * image slot carries the latest screenshot thumbnail with a count badge, and
 * the title slot carries a composed string (research.md R-005).
 *
 * Deliberately a pure function of its inputs, with no Electron imports beyond a
 * type. That is what makes the truncation and ordering rules exhaustively
 * testable without launching an app (constitution Principle IV).
 */
import type { NativeImage } from 'electron'
import type { Preferences, TimerState } from '@shared/types'

/** Total character budget for the title (FR-035, SC-010). */
export const TITLE_BUDGET = 42
const SEPARATOR = '  '

export interface PreviewInput {
  preferences: Preferences
  /** Every screenshot currently listed, not an unseen subset (FR-110). */
  screenshotCount: number
  latestThumbnail: NativeImage | null
  timer: TimerState
}

export interface TrayPreviewModel {
  image: NativeImage | null
  /**
   * What the badge should read, or 0 for no badge at all.
   *
   * Separate from `image` because the guard matters: a zero count must never
   * be composited, or deleting the last screenshot paints "0" over the app
   * icon - the exact bug FR-115 exists to prevent.
   */
  badgeCount: number
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
  const { preferences, screenshotCount, latestThumbnail, timer } = input
  const { previews } = preferences

  // Fixed order, regardless of which previews are enabled, so the menu bar does
  // not reshuffle as the user toggles things. The screenshot count is no longer
  // one of these: it moved INTO the image as a badge (FR-109), which is why the
  // title is now frequently empty.
  const segments: string[] = []

  if (previews.timer && (timer.status === 'running' || timer.status === 'paused')) {
    const remaining = formatRemaining(timer.remainingMs)
    segments.push(timer.status === 'paused' ? `${remaining} paused` : remaining)
  }

  const title = truncate(segments.join(SEPARATOR), TITLE_BUDGET)
  const image = previews.screenshots ? latestThumbnail : null

  return {
    image,
    // No image means the fallback app icon is about to be shown, and the badge
    // must not follow it there (FR-114).
    badgeCount: image ? screenshotCount : 0,
    title
  }
}
