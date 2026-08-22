/**
 * The macOS pasteboard holds one image at a time, so "copy 4 screenshots as
 * images" has no faithful representation (research.md R-107).
 *
 * One shot copies as an IMAGE - that is what makes the feature useful, paste
 * straight into Slack or Figma. Several copy as FILE REFERENCES, because the
 * intent there is "put these files somewhere". Choosing between the two is
 * pure, so it is decided and tested here rather than inside an Electron call.
 */
import { describe, expect, it } from 'vitest'
import { planClipboardWrite } from '../../src/main/services/screenshots/clipboard'

describe('planClipboardWrite', () => {
  it('copies a single screenshot as an image', () => {
    expect(planClipboardWrite(['/tmp/one.png'])).toEqual({ mode: 'image', path: '/tmp/one.png' })
  })

  it('copies several screenshots as file references', () => {
    expect(planClipboardWrite(['/tmp/a.png', '/tmp/b.png'])).toEqual({
      mode: 'references',
      paths: ['/tmp/a.png', '/tmp/b.png'],
      uriList: 'file:///tmp/a.png\nfile:///tmp/b.png',
      text: '/tmp/a.png\n/tmp/b.png'
    })
  })

  it('percent-encodes characters that are not URL-safe', () => {
    const plan = planClipboardWrite(['/tmp/Screen shot 1.png', '/tmp/b.png'])
    expect(plan).toMatchObject({ mode: 'references' })
    if (plan.mode !== 'references') throw new Error('unreachable')
    // A raw space in a file:// URL makes the whole uri-list unparseable to the
    // receiving app, which shows up as a silent no-op paste.
    expect(plan.uriList).toBe('file:///tmp/Screen%20shot%201.png\nfile:///tmp/b.png')
    // The plain-text flavour stays human-readable - it is what a text editor
    // receives, and an encoded path there would be wrong.
    expect(plan.text).toBe('/tmp/Screen shot 1.png\n/tmp/b.png')
  })

  it('throws when nothing resolved rather than writing an empty clipboard', () => {
    // Copying 3 of 4 succeeds; copying 0 of 4 is a failure the user must see,
    // not a silently cleared pasteboard (contracts/host-bridge.md).
    expect(() => planClipboardWrite([])).toThrow(/no screenshots/i)
  })
})
