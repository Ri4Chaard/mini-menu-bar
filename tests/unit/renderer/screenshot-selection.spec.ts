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
import {
  dragIdsFor,
  reconcileSelection
} from '../../../src/renderer/sections/screenshots/selection'
import { timeChipLabel } from '../../../src/renderer/sections/screenshots/screenshot-card'

const entry = (id: string): ScreenshotEntry => ({
  id,
  path: `/tmp/${id}.png`,
  fileName: `${id}.png`,
  capturedAt: 0,
  thumbnailDataUrl: null,
  width: 100,
  height: 100,
  isTemporary: false,
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

describe('dragIdsFor', () => {
  it('drags the whole selection when the dragged file is part of it', () => {
    expect(dragIdsFor('b', new Set(['a', 'b', 'c']))).toEqual(['a', 'b', 'c'])
  })

  it('drags only the dragged file when it is not selected', () => {
    // The failure this prevents: a selection made minutes ago, forgotten, and
    // then silently attached to a message because one unrelated thumbnail was
    // picked up.
    expect(dragIdsFor('d', new Set(['a', 'b', 'c']))).toEqual(['d'])
  })

  it('drags a single file when nothing is selected', () => {
    expect(dragIdsFor('a', new Set())).toEqual(['a'])
  })
})

describe('timeChipLabel', () => {
  const now = Date.parse('2026-08-22T12:00:00Z')
  const at = (minutesAgo: number): number => now - minutesAgo * 60_000

  it('shows only the elapsed time for a saved screenshot', () => {
    expect(timeChipLabel({ ...entry('a'), capturedAt: at(14) }, now)).toBe('14m ago')
  })

  it('marks a staged capture as unsaved', () => {
    // It looks identical to a saved file in the strip, and it is not: it will
    // disappear on its own once macOS is done with it.
    expect(timeChipLabel({ ...entry('a'), capturedAt: at(2), isTemporary: true }, now)).toBe(
      'Unsaved · 2m ago'
    )
  })
})
