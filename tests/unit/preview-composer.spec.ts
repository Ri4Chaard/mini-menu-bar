/**
 * Preview composer - constitution Principle IV requires pure-function logic to
 * be unit-tested, and this is the piece most exposed to fiddly truncation and
 * ordering bugs (research.md R-005).
 */
import { describe, it, expect } from 'vitest'
import {
  composePreview,
  formatRemaining,
  TITLE_BUDGET,
  TRACK_BUDGET
} from '../../src/main/tray/preview-composer'
import { DEFAULT_PREFERENCES, type PlaybackState, type Preferences, type TimerState } from '../../src/shared/types'

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

const playback = (over: Partial<PlaybackState> = {}): PlaybackState => ({
  availability: 'playing',
  trackName: 'Teardrop',
  artist: 'Massive Attack',
  volume: 65,
  shuffling: false,
  repeating: false,
  artworkDataUrl: null,
  positionMs: 1000,
  durationMs: 330_000,
  ...over
})

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

describe('composePreview', () => {
  it('produces an empty title when all previews are off', () => {
    const { title } = composePreview({
      preferences: prefs(),
      unseenCount: 4,
      latestThumbnail: null,
      timer: timer(),
      playback: playback()
    })
    expect(title).toBe('')
  })

  it('shows the unseen count only when the screenshots preview is on', () => {
    const on = composePreview({
      preferences: prefs({ screenshots: true }),
      unseenCount: 3,
      latestThumbnail: null,
      timer: timer(),
      playback: playback()
    })
    expect(on.title).toContain('3')

    const off = composePreview({
      preferences: prefs(),
      unseenCount: 3,
      latestThumbnail: null,
      timer: timer(),
      playback: playback()
    })
    expect(off.title).not.toContain('3')
  })

  it('omits the count segment when nothing is unseen', () => {
    const { title } = composePreview({
      preferences: prefs({ screenshots: true }),
      unseenCount: 0,
      latestThumbnail: null,
      timer: timer(),
      playback: playback()
    })
    expect(title).toBe('')
  })

  it('shows the countdown only while a timer is running or paused', () => {
    const running = composePreview({
      preferences: prefs({ timer: true }),
      unseenCount: 0,
      latestThumbnail: null,
      timer: timer(),
      playback: playback()
    })
    expect(running.title).toContain('2:05')

    const idle = composePreview({
      preferences: prefs({ timer: true }),
      unseenCount: 0,
      latestThumbnail: null,
      timer: timer({ status: 'idle', remainingMs: 300_000, deadlineAt: null }),
      playback: playback()
    })
    expect(idle.title).toBe('')
  })

  it('shows the track name only when playing or paused', () => {
    const playing = composePreview({
      preferences: prefs({ spotify: true }),
      unseenCount: 0,
      latestThumbnail: null,
      timer: timer({ status: 'idle' }),
      playback: playback()
    })
    expect(playing.title).toContain('Teardrop')

    for (const availability of ['not-running', 'permission-denied', 'stopped'] as const) {
      const off = composePreview({
        preferences: prefs({ spotify: true }),
        unseenCount: 0,
        latestThumbnail: null,
        timer: timer({ status: 'idle' }),
        playback: playback({ availability, trackName: null })
      })
      expect(off.title).toBe('')
    }
  })

  it('keeps segment order fixed so the menu bar does not reshuffle as previews toggle', () => {
    const { title } = composePreview({
      preferences: prefs({ screenshots: true, timer: true, spotify: true }),
      unseenCount: 2,
      latestThumbnail: null,
      timer: timer(),
      playback: playback()
    })
    const countAt = title.indexOf('2')
    const timerAt = title.indexOf('2:05')
    const trackAt = title.indexOf('Teardrop')
    expect(countAt).toBeLessThan(timerAt)
    expect(timerAt).toBeLessThan(trackAt)
  })

  it('truncates an overlong track name rather than displacing menu bar items (FR-035)', () => {
    const long = 'A Song With A Deliberately Very Long Title That Would Push Everything Off Screen'
    const { title } = composePreview({
      preferences: prefs({ spotify: true }),
      unseenCount: 0,
      latestThumbnail: null,
      timer: timer({ status: 'idle' }),
      playback: playback({ trackName: long })
    })
    expect(title.length).toBeLessThanOrEqual(TITLE_BUDGET)
    expect(title).toContain('…')
    expect(title).not.toContain('Off Screen')
  })

  it('caps the whole title even with every segment at maximum length', () => {
    const { title } = composePreview({
      preferences: prefs({ screenshots: true, timer: true, spotify: true }),
      unseenCount: 9999,
      latestThumbnail: null,
      timer: timer({ remainingMs: 3_725_000 }),
      playback: playback({ trackName: 'X'.repeat(TRACK_BUDGET * 4) })
    })
    expect(title.length).toBeLessThanOrEqual(TITLE_BUDGET)
  })

  it('uses the screenshot thumbnail only when that preview is on', () => {
    const thumb = { fake: true } as never
    expect(
      composePreview({
        preferences: prefs({ screenshots: true }),
        unseenCount: 1,
        latestThumbnail: thumb,
        timer: timer({ status: 'idle' }),
        playback: playback({ availability: 'not-running' })
      }).image
    ).toBe(thumb)

    expect(
      composePreview({
        preferences: prefs({ screenshots: false }),
        unseenCount: 1,
        latestThumbnail: thumb,
        timer: timer({ status: 'idle' }),
        playback: playback({ availability: 'not-running' })
      }).image
    ).toBeNull()
  })

  it('is pure - the same input always yields the same output', () => {
    const input = {
      preferences: prefs({ screenshots: true, timer: true, spotify: true }),
      unseenCount: 5,
      latestThumbnail: null,
      timer: timer(),
      playback: playback()
    }
    expect(composePreview(input).title).toBe(composePreview(input).title)
  })
})
