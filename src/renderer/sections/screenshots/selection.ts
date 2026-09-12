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

/**
 * Which screenshots a drag carries.
 *
 * Dragging a SELECTED thumbnail drags the whole selection; dragging an
 * unselected one drags just that file and leaves the selection untouched. That
 * is Finder's rule, and the alternative - always sending the selection - would
 * silently attach files the user had forgotten were still ticked.
 */
export function dragIdsFor(id: string, selected: ReadonlySet<string>): string[] {
  return selected.has(id) ? [...selected] : [id]
}

/**
 * Toggle one id in or out of the selection.
 *
 * Lifted out of the component because feature 003 made this the section's
 * PRIMARY gesture (FR-097), and because the double-click rule is a property of
 * this function rather than of the DOM: applying it twice must return a set
 * equal to the original, which is exactly what lets `dblclick` open a file
 * without disturbing selection and without a click-delay (FR-101, R-206).
 */
export function toggleSelection(
  selected: ReadonlySet<string>,
  id: string
): ReadonlySet<string> {
  const next = new Set(selected)
  if (!next.delete(id)) next.add(id)
  return next
}
