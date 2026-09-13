/**
 * Feature 003 removed two sections, one preview flag and the seen-watermark.
 * Every preferences.json written before that change names at least one of them.
 *
 * This is a P1 path, not a defensive one: the developer's own file carried
 * `previews.spotify` and `screenshotsSeenWatermark` at the time the feature was
 * planned, so the very first launch after the change exercises it
 * (research.md R-209).
 */
import { describe, expect, it } from 'vitest'
import { mergePreferences, revivePreferences } from '../../src/main/services/preferences/preferences-service'
import { DEFAULT_PREFERENCES } from '../../src/shared/types'

/** The shape captured from the real file before implementation began. */
const STORED_BEFORE_003 = {
  previews: { screenshots: true, timer: true, spotify: true },
  lastSection: 'spotify',
  timerDurationMs: 300_000,
  timerPresets: [60_000, 120_000, 180_000, 900_000, 1_200_000],
  timerShortcut: 'Control+Option+T',
  timerAlarm: true,
  timerRepeat: false,
  screenshotsSeenWatermark: 1_789_211_898_715
}

describe('preferences migration (feature 003)', () => {
  it('resolves a removed lastSection to one that still exists', () => {
    const revived = revivePreferences(STORED_BEFORE_003)
    expect(revived.lastSection).toBe(DEFAULT_PREFERENCES.lastSection)
    expect(revived.lastSection).toBe('screenshots')
  })

  it('resolves a lastSection of "notes" as well as "spotify"', () => {
    expect(revivePreferences({ ...STORED_BEFORE_003, lastSection: 'notes' }).lastSection).toBe(
      'screenshots'
    )
  })

  it('drops the removed spotify preview flag entirely', () => {
    const revived = revivePreferences(STORED_BEFORE_003)
    expect(Object.keys(revived.previews).sort()).toEqual(['screenshots', 'timer'])
    expect('spotify' in revived.previews).toBe(false)
  })

  it('drops the seen-watermark entirely', () => {
    expect('screenshotsSeenWatermark' in revivePreferences(STORED_BEFORE_003)).toBe(false)
  })

  it('preserves every surviving value', () => {
    const revived = revivePreferences(STORED_BEFORE_003)
    expect(revived.previews.screenshots).toBe(true)
    expect(revived.previews.timer).toBe(true)
    expect(revived.timerDurationMs).toBe(300_000)
    expect(revived.timerShortcut).toBe('Control+Option+T')
    expect(revived.timerAlarm).toBe(true)
    expect(revived.timerRepeat).toBe(false)
    expect(revived.timerPresets).toEqual([60_000, 120_000, 180_000, 900_000, 1_200_000])
  })

  it('never writes a removed field back, even when a patch supplies one', () => {
    const current = revivePreferences(STORED_BEFORE_003)
    // A stale renderer or a hand-edited file could still send these.
    const patched = mergePreferences(current, {
      previews: { screenshots: false, timer: true, spotify: true },
      screenshotsSeenWatermark: 999
    } as never)

    expect('screenshotsSeenWatermark' in patched).toBe(false)
    expect('spotify' in patched.previews).toBe(false)
    // The surviving half of the patch still applies.
    expect(patched.previews.screenshots).toBe(false)
    expect(patched.previews.timer).toBe(true)
  })

  it('repairs a file that is missing everything', () => {
    expect(revivePreferences({})).toEqual(DEFAULT_PREFERENCES)
    expect(revivePreferences(null)).toEqual(DEFAULT_PREFERENCES)
  })

  describe('the feature 004 panel shortcut', () => {
    it('gets its default in a file written before it existed', () => {
      // This binding is the only keyboard route into the app when the tray
      // icon is hidden behind a full menu bar, so an upgrading user must get
      // it without having to configure anything.
      expect(revivePreferences(STORED_BEFORE_003).panelShortcut).toBe(
        DEFAULT_PREFERENCES.panelShortcut
      )
    })

    it('keeps an explicit null, which means the user cleared it', () => {
      // null is a real value here, distinct from "missing", so it must not be
      // overwritten with the default on every load.
      expect(revivePreferences({ panelShortcut: null }).panelShortcut).toBeNull()
    })

    it('keeps a user-chosen binding', () => {
      expect(revivePreferences({ panelShortcut: 'Command+Shift+J' }).panelShortcut).toBe(
        'Command+Shift+J'
      )
    })

    it('falls back rather than trusting a non-string', () => {
      expect(revivePreferences({ panelShortcut: 42 }).panelShortcut).toBe(
        DEFAULT_PREFERENCES.panelShortcut
      )
    })

    it('does not collide with the timer binding by default', () => {
      expect(DEFAULT_PREFERENCES.panelShortcut).not.toBe(DEFAULT_PREFERENCES.timerShortcut)
    })
  })

  describe('the feature 004 update preference', () => {
    it('defaults to off for a file written before it existed', () => {
      // The whole migration: revivePreferences reads every field by name with a
      // typed fallback, so a pre-004 file simply lacks the key and gets false.
      // Nothing needs a version stamp (R-209, R-405).
      expect(revivePreferences(STORED_BEFORE_003).updateCheckOnLaunch).toBe(false)
    })

    it('is off by default, so a fresh install makes no request at launch', () => {
      // SC-026. If this ever flips, the privacy claim in the README is false.
      expect(DEFAULT_PREFERENCES.updateCheckOnLaunch).toBe(false)
    })

    it('survives a round trip once the user turns it on', () => {
      expect(revivePreferences({ updateCheckOnLaunch: true }).updateCheckOnLaunch).toBe(true)
    })

    it('falls back rather than trusting a non-boolean', () => {
      expect(revivePreferences({ updateCheckOnLaunch: 'yes' }).updateCheckOnLaunch).toBe(false)
      expect(revivePreferences({ updateCheckOnLaunch: 1 }).updateCheckOnLaunch).toBe(false)
    })
  })
})
