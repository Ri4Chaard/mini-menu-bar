/**
 * "Edited 2m ago · 18 words" has to be reproducible in a test, not left to
 * whichever regex happens to ship (data-model.md, FR-072).
 */
import { describe, expect, it } from 'vitest'
import { countWords, noteTitle } from '../../../src/renderer/sections/notes/note-stats'

describe('countWords', () => {
  it('counts words separated by single spaces', () => {
    expect(countWords('one two three')).toBe(3)
  })

  it('collapses runs of whitespace rather than counting empty segments', () => {
    expect(countWords('one   two\n\nthree\tfour')).toBe(4)
  })

  it('ignores leading and trailing whitespace', () => {
    expect(countWords('  padded  ')).toBe(1)
  })

  it('counts an empty or whitespace-only note as zero', () => {
    expect(countWords('')).toBe(0)
    expect(countWords('   \n\t  ')).toBe(0)
  })

  it('treats punctuation as part of the word it is attached to', () => {
    expect(countWords("don't stop — really")).toBe(4)
  })
})

describe('noteTitle', () => {
  it('uses the first line', () => {
    expect(noteTitle('Grocery list\nmilk\neggs')).toBe('Grocery list')
  })

  it('falls back for an empty note rather than rendering a blank row', () => {
    expect(noteTitle('')).toBe('New note')
    expect(noteTitle('   ')).toBe('New note')
  })

  it('truncates a very long first line so the 186 pt list row cannot be pushed open', () => {
    const title = noteTitle('x'.repeat(200))
    expect(title.length).toBeLessThanOrEqual(60)
  })
})
