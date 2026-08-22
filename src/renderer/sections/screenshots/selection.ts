import type { ScreenshotEntry } from '@shared/types'

/**
 * Drop selected ids that no longer exist in the collection.
 *
 * Runs on every `screenshots:changed` push, so it returns the SAME set
 * instance when nothing was dropped - a fresh Set every time would re-render
 * the strip on unrelated file events (research.md R-106).
 */
export function reconcileSelection(
  selected: ReadonlySet<string>,
  entries: readonly ScreenshotEntry[]
): ReadonlySet<string> {
  if (selected.size === 0) return selected

  const live = new Set(entries.map((entry) => entry.id))
  const survivors = [...selected].filter((id) => live.has(id))
  if (survivors.length === selected.size) return selected
  return new Set(survivors)
}
