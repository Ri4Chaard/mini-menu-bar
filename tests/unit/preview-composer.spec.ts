/**
 * Preview composer - constitution Principle IV requires pure-function logic to
 * be unit-tested, and this is the piece most exposed to fiddly truncation and
 * ordering bugs (research.md R-005).
 *
 * Feature 003 changed what this composes. The screenshot count left the title
 * and became a badge on the image (FR-109), the Spotify segment is gone, and
 * the count is now the total rather than an unseen subset (FR-110).
 */
import { describe, it, expect } from 'vitest'
import { composePreview, formatRemaining, TITLE_BUDGET } from '../../src/main/tray/preview-composer'
import { DEFAULT_PREFERENCES, type Preferences, type TimerState } from '../../src/shared/types'

const prefs = (over: Partial<Preferences['previews']> = {}): Preferences => ({
  ...DEFAULT_PREFERENCES,
  previews: { ...DEFAULT_PREFERENCES.previews, ...over }
})

const timer = (over: Partial<TimerState> = {}): TimerState => ({
  status: 'running',
  configuredDurationMs: 300_000,
  deadlineAt: Date.now() + 125_000,
  remainingMs: 125_000,
  alarming: false,
  ...over
})

const thumb = { fake: true } as never

describe('formatRemaining', () => {
  it('renders minutes and seconds zero-padded', () => {
    expect(formatRemaining(125_000)).toBe('2:05')
  })
  it('renders hours when over an hour', () => {
    expect(formatRemaining(3_725_000)).toBe('1:02:05')
  })
  it('renders zero as 0:00', () => {
    expect(formatRemaining(0)).toBe('0:00')
  })
  it('never renders negative time', () => {
    expect(formatRemaining(-5000)).toBe('0:00')
  })
})

describe('composePreview — title', () => {
  it('produces an empty title when all previews are off', () => {
    const { title } = composePreview({
      preferences: prefs(),
      screenshotCount: 4,
      latestThumbnail: thumb,
      timer: timer()
    })
    expect(title).toBe('')
  })

  it('never puts the screenshot count in the title — it belongs on the image now', () => {
    const { title } = composePreview({
      preferences: prefs({ screenshots: true }),
      screenshotCount: 7,
      latestThumbnail: thumb,
      timer: timer({ status: 'idle' })
    })
    expect(title).toBe('')
    expect(title).not.toContain('7')
  })

  it('shows the countdown only while a timer is running or paused', () => {
    const running = composePreview({
      preferences: prefs({ timer: true }),
      screenshotCount: 0,
      latestThumbnail: null,
      timer: timer()
    })
    expect(running.title).toContain('2:05')

    const idle = composePreview({
      preferences: prefs({ timer: true }),
      screenshotCount: 0,
      latestThumbnail: null,
      timer: timer({ status: 'idle', remainingMs: 300_000, deadlineAt: null })
    })
    expect(idle.title).toBe('')
  })

  it('marks a paused countdown as paused', () => {
    const { title } = composePreview({
      preferences: prefs({ timer: true }),
      screenshotCount: 0,
      latestThumbnail: null,
      timer: timer({ status: 'paused', deadlineAt: null })
    })
    expect(title).toContain('paused')
  })

  it('caps the title even with an hours-long countdown (FR-035)', () => {
    const { title } = composePreview({
      preferences: prefs({ screenshots: true, timer: true }),
      screenshotCount: 9999,
      latestThumbnail: thumb,
      timer: timer({ remainingMs: 3_725_000 })
    })
    expect(title.length).toBeLessThanOrEqual(TITLE_BUDGET)
  })
})

describe('composePreview — image and badge', () => {
  it('uses the screenshot thumbnail only when that preview is on', () => {
    expect(
      composePreview({
        preferences: prefs({ screenshots: true }),
        screenshotCount: 1,
        latestThumbnail: thumb,
        timer: timer({ status: 'idle' })
      }).image
    ).toBe(thumb)

    expect(
      composePreview({
        preferences: prefs({ screenshots: false }),
        screenshotCount: 1,
        latestThumbnail: thumb,
        timer: timer({ status: 'idle' })
      }).image
    ).toBeNull()
  })

  it('reports the total count, not an unseen subset (FR-110)', () => {
    expect(
      composePreview({
        preferences: prefs({ screenshots: true }),
        screenshotCount: 12,
        latestThumbnail: thumb,
        timer: timer({ status: 'idle' })
      }).badgeCount
    ).toBe(12)
  })

  /**
   * The guard FR-115 exists for: with no thumbnail the tray falls back to the
   * app icon, and a badge must not follow it there. A "0" painted over the wine
   * glass is precisely the bug the user reported in a different form.
   */
  it('reports no badge when there is no thumbnail to carry it (FR-114)', () => {
    expect(
      composePreview({
        preferences: prefs({ screenshots: true }),
        screenshotCount: 0,
        latestThumbnail: null,
        timer: timer({ status: 'idle' })
      }).badgeCount
    ).toBe(0)
  })

  it('reports no badge when the screenshots preview is off, however many exist', () => {
    const { image, badgeCount } = composePreview({
      preferences: prefs({ screenshots: false }),
      screenshotCount: 42,
      latestThumbnail: thumb,
      timer: timer({ status: 'idle' })
    })
    expect(image).toBeNull()
    expect(badgeCount).toBe(0)
  })

  it('never reports a badge without an image to put it on', () => {
    for (const count of [0, 1, 50]) {
      for (const screenshots of [true, false]) {
        for (const latestThumbnail of [thumb, null]) {
          const model = composePreview({
            preferences: prefs({ screenshots }),
            screenshotCount: count,
            latestThumbnail,
            timer: timer({ status: 'idle' })
          })
          if (model.badgeCount > 0) expect(model.image).not.toBeNull()
        }
      }
    }
  })
})

describe('composePreview — purity', () => {
  it('the same input always yields the same output', () => {
    const input = {
      preferences: prefs({ screenshots: true, timer: true }),
      screenshotCount: 5,
      latestThumbnail: thumb,
      timer: timer()
    }
    expect(composePreview(input)).toEqual(composePreview(input))
  })
})
