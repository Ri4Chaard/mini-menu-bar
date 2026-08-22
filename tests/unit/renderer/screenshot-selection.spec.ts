/**
 * Selection is renderer-owned and ephemeral (research.md R-106), which makes
 * reconciliation the one place it can go wrong: files disappear underneath it.
 *
 * The bug this rule exists to prevent: select three screenshots, delete one in
 * Finder, and without reconciliation the footer still reads "3 selected" while
 * Copy resolves only two paths. The count outlives the file.
 */
import { describe, expect, it } from 'vitest'
import type { ScreenshotEntry } from '../../../src/shared/types'
import { reconcileSelection } from '../../../src/renderer/sections/screenshots/selection'

const entry = (id: string): ScreenshotEntry => ({
  id,
  path: `/tmp/${id}.png`,
  fileName: `${id}.png`,
  capturedAt: 0,
  thumbnailDataUrl: null,
  width: 100,
  height: 100,
  isSeen: true
})

describe('reconcileSelection', () => {
  it('drops ids that are no longer in the collection', () => {
    const selected = new Set(['a', 'b', 'c'])
    expect(reconcileSelection(selected, [entry('a'), entry('c')])).toEqual(new Set(['a', 'c']))
  })

  it('keeps every id that still resolves', () => {
    const selected = new Set(['a', 'b'])
    expect(reconcileSelection(selected, [entry('a'), entry('b'), entry('c')])).toEqual(
      new Set(['a', 'b'])
    )
  })

  it('empties the selection when the collection empties', () => {
    expect(reconcileSelection(new Set(['a', 'b']), [])).toEqual(new Set())
  })

  it('never invents an id that was not selected', () => {
    expect(reconcileSelection(new Set(['a']), [entry('a'), entry('b')])).toEqual(new Set(['a']))
  })

  it('returns the same set instance when nothing changed', () => {
    // Identity matters here: this runs inside a subscription callback on every
    // screenshots:changed push. Returning a fresh Set each time would re-render
    // the strip on every unrelated file event.
    const selected = new Set(['a'])
    expect(reconcileSelection(selected, [entry('a'), entry('b')])).toBe(selected)
  })

  it('handles an empty selection without allocating', () => {
    const selected: ReadonlySet<string> = new Set()
    expect(reconcileSelection(selected, [entry('a')])).toBe(selected)
  })
})
