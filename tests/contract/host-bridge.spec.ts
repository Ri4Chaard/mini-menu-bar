/**
 * The contract suite required by constitution Principle IV.
 *
 * Part 1 runs behavioural assertions against the mock implementation.
 * Part 2 asserts the real bridge's wiring — that every method reaches the
 * correct enumerated channel with the correct payload — using a stubbed raw
 * global, so it runs without an Electron process.
 *
 * Between them, a method that exists in one implementation but not the other,
 * or that talks to an unenumerated channel, fails the build.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createMockBridge } from '../../src/renderer/host/host-mock'
import { ALL_INVOKE_CHANNELS, INVOKE_CHANNELS, EVENT_CHANNELS } from '../../src/shared/channels'
import type { HostBridge } from '../../src/renderer/host/host-contract'

const CONTRACT_METHODS: (keyof HostBridge)[] = [
  'listScreenshots', 'openScreenshot', 'revealScreenshot',
  'onScreenshotsChanged', 'getScreenshotSourceError', 'deleteScreenshots',
  'startScreenshotDrag',
  'getTimerState', 'startTimer', 'pauseTimer', 'resumeTimer', 'resetTimer', 'onTimerStateChanged',
  'dismissTimerAlarm',
  'getPreferences', 'updatePreferences', 'setTimerShortcut',
  'closePanel', 'onPanelShown', 'quitApp',
  'getAppVersion', 'checkForUpdates', 'openReleasesPage',
  'getEnvironment', 'supportsNativeFeatures'
]

/**
 * Feature 003 removed these sixteen. Asserting their ABSENCE is the point:
 * structural parity alone would pass happily if a method were quietly restored
 * to both implementations, and the contract requires a re-introduction to be a
 * deliberate, reviewed act (contracts/host-bridge.md).
 */
const REMOVED_METHODS = [
  'markScreenshotsSeen', 'copyScreenshots',
  'getPlaybackState', 'togglePlayPause', 'nextTrack', 'previousTrack', 'seekTo',
  'onPlaybackStateChanged', 'setVolume', 'setShuffle', 'setRepeat',
  'listNotes', 'createNote', 'updateNote', 'deleteNote', 'flushNotes'
] as const

// ============================================================================
// Part 1 — behavioural contract, run against the mock
// ============================================================================

describe('HostBridge contract — mock implementation', () => {
  let host: ReturnType<typeof createMockBridge>
  beforeEach(() => {
    host = createMockBridge()
  })

  it('implements every method on the contract', () => {
    for (const name of CONTRACT_METHODS) {
      expect(typeof host[name], `missing ${String(name)}`).toBe('function')
    }
  })

  it('reports itself as a browser host without native features', () => {
    expect(host.getEnvironment()).toBe('browser')
    expect(host.supportsNativeFeatures()).toBe(false)
  })

  describe('screenshots', () => {
    it('returns entries newest first', async () => {
      const list = await host.listScreenshots()
      expect(list.length).toBeGreaterThan(0)
      const times = list.map((s) => s.capturedAt)
      expect([...times].sort((a, b) => b - a)).toEqual(times)
    })

    it('delivers new entries to subscribers and stops after unsubscribe', () => {
      const cb = vi.fn()
      const off = host.onScreenshotsChanged(cb)
      host.__mock.addScreenshot()
      expect(cb).toHaveBeenCalledTimes(1)
      off()
      host.__mock.addScreenshot()
      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('rejects with FILE_NOT_FOUND when the file has vanished', async () => {
      const [first] = await host.listScreenshots()
      host.__mock.setNextFileMissing(true)
      await expect(host.openScreenshot(first!.id)).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' })
      await expect(host.revealScreenshot(first!.id)).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' })
    })

    it('rejects with PERMISSION_DENIED when the source is unreadable', async () => {
      host.__mock.setSourceError({ kind: 'permission-denied', message: 'no access' })
      await expect(host.listScreenshots()).rejects.toMatchObject({ code: 'PERMISSION_DENIED' })
      expect(await host.getScreenshotSourceError()).toMatchObject({ kind: 'permission-denied' })
    })

  })

  describe('timer state machine (data-model.md)', () => {
    it('starts idle with the configured duration remaining', async () => {
      const s = await host.getTimerState()
      expect(s.status).toBe('idle')
      expect(s.deadlineAt).toBeNull()
    })

    it('running implies a non-null deadline; every other status implies null', async () => {
      const running = await host.startTimer(60_000)
      expect(running.status).toBe('running')
      expect(running.deadlineAt).not.toBeNull()

      const paused = await host.pauseTimer()
      expect(paused.status).toBe('paused')
      expect(paused.deadlineAt).toBeNull()

      const reset = await host.resetTimer()
      expect(reset.status).toBe('idle')
      expect(reset.deadlineAt).toBeNull()
    })

    it('pause from idle is a no-op rather than an error', async () => {
      const before = await host.getTimerState()
      const after = await host.pauseTimer()
      expect(after.status).toBe(before.status)
    })

    it('resume from running is a no-op rather than an error', async () => {
      await host.startTimer(60_000)
      const after = await host.resumeTimer()
      expect(after.status).toBe('running')
    })

    it('resume continues from the frozen remainder, not from the full duration', async () => {
      vi.useFakeTimers()
      try {
        await host.startTimer(60_000)
        vi.advanceTimersByTime(10_000)
        const paused = await host.pauseTimer()
        expect(paused.remainingMs).toBeLessThanOrEqual(50_000)
        const resumed = await host.resumeTimer()
        expect(resumed.remainingMs).toBeLessThanOrEqual(50_000)
      } finally {
        vi.useRealTimers()
      }
    })

    it('reset returns to the configured duration', async () => {
      await host.startTimer(30_000)
      const reset = await host.resetTimer()
      expect(reset.remainingMs).toBe(30_000)
      expect(reset.configuredDurationMs).toBe(30_000)
    })

    it('unsubscribing stops delivery', async () => {
      const cb = vi.fn()
      const off = host.onTimerStateChanged(cb)
      off()
      await host.startTimer(1000)
      expect(cb).not.toHaveBeenCalled()
    })
  })

  describe('preferences (FR-031)', () => {
    it('writing one preview flag leaves the other untouched', async () => {
      await host.updatePreferences({ previews: { screenshots: true, timer: true } })
      const before = await host.getPreferences()
      const after = await host.updatePreferences({
        previews: { ...before.previews, timer: false }
      })
      // The written flag changes; the unwritten one is preserved (FR-031).
      expect(after.previews.timer).toBe(false)
      expect(after.previews.screenshots).toBe(before.previews.screenshots)
      expect(after.previews.screenshots).toBe(true)
    })

    it('a partial patch does not blank unrelated settings', async () => {
      await host.updatePreferences({ lastSection: 'timer', timerDurationMs: 90_000 })
      const after = await host.updatePreferences({ previews: { screenshots: true } as never })
      expect(after.lastSection).toBe('timer')
      expect(after.timerDurationMs).toBe(90_000)
    })

    it('reports SHORTCUT_TAKEN as false rather than throwing', async () => {
      expect(await host.setTimerShortcut('Command+Space')).toBe(false)
      expect(await host.setTimerShortcut('Control+Option+K')).toBe(true)
    })
  })

  describe('screenshot delete (FR-058)', () => {

    it('emits the survivors after a delete', async () => {
      const before = await host.listScreenshots()
      const cb = vi.fn()
      host.onScreenshotsChanged(cb)

      await host.deleteScreenshots([before[0]!.id])

      expect(cb).toHaveBeenCalled()
      const after = cb.mock.calls.at(-1)![0] as { id: string }[]
      expect(after.map((e) => e.id)).not.toContain(before[0]!.id)
      expect(after).toHaveLength(before.length - 1)
    })

    it('surfaces a delete that fails entirely', async () => {
      const [first] = await host.listScreenshots()
      host.__mock.setDeleteFails(true)
      await expect(host.deleteScreenshots([first!.id])).rejects.toThrow()
    })
  })

  describe('the update check (FR-126)', () => {
    it('reports up to date by default, with no update on offer', async () => {
      const result = await host.checkForUpdates()
      expect(result.status).toBe('up-to-date')
      expect(result.latestVersion).toBe(result.currentVersion)
    })

    it('reports a newer version when one exists', async () => {
      host.__mock.setUpdateOutcome({ kind: 'available', latestVersion: '9.9.9' })
      const result = await host.checkForUpdates()
      expect(result.status).toBe('update-available')
      expect(result.latestVersion).toBe('9.9.9')
    })

    it('does not call an older version an update, because isNewer decides', async () => {
      // The mock routes through the same comparison the host uses, so it cannot
      // quietly disagree about what "newer" means.
      host.__mock.setUpdateOutcome({ kind: 'available', latestVersion: '0.0.0-mock' })
      expect((await host.checkForUpdates()).status).toBe('up-to-date')
    })

    it('rejects with NETWORK_UNAVAILABLE when offline, rather than resolving', async () => {
      // A mock that always succeeds proves nothing (constitution Principle I).
      host.__mock.setUpdateOutcome({ kind: 'offline' })
      await expect(host.checkForUpdates()).rejects.toMatchObject({
        code: 'NETWORK_UNAVAILABLE'
      })
    })

    it('never hands the renderer a URL', async () => {
      host.__mock.setUpdateOutcome({ kind: 'available', latestVersion: '9.9.9' })
      const result = await host.checkForUpdates()
      expect(JSON.stringify(result)).not.toMatch(/https?:\/\//)
    })

    it('reports a version without needing a network call first', async () => {
      host.__mock.setUpdateOutcome({ kind: 'offline' })
      await expect(host.getAppVersion()).resolves.toMatch(/^\d+\.\d+\.\d+/)
    })

    it('opens the releases page on request', async () => {
      expect(host.__mock.didOpenReleases()).toBe(false)
      await host.openReleasesPage()
      expect(host.__mock.didOpenReleases()).toBe(true)
    })
  })

  describe('the timer finish alarm (FR-090)', () => {
    it('exposes dismissal as its own operation, not as a reset', () => {
      // Dismissing must not throw away a countdown that repeat has already
      // restarted, which is exactly what reset would do.
      expect(host.dismissTimerAlarm).not.toBe(host.resetTimer)
    })

    it('is a no-op when nothing is ringing', async () => {
      const state = await host.dismissTimerAlarm()
      expect(state.alarming).toBe(false)
      expect(state.status).toBe('idle')
    })

    it('clears the countdown so the timer is startable again', async () => {
      await host.startTimer(1000)
      await new Promise((r) => setTimeout(r, 1100))

      const dismissed = await host.dismissTimerAlarm()
      expect(dismissed.alarming).toBe(false)
      // Not left sitting at 0:00 in 'finished' needing a separate Reset.
      expect(dismissed.status).toBe('idle')
      expect(dismissed.remainingMs).toBe(dismissed.configuredDurationMs)
    })
  })

  describe('dragging screenshots out', () => {
    it('carries exactly the ids it was given', async () => {
      const [first, second] = await host.listScreenshots()
      await host.startScreenshotDrag([first!.id, second!.id])
      expect(host.__mock.lastDragIds()).toEqual([first!.id, second!.id])
    })

    it('refuses a drag that resolves no live file', async () => {
      // The alternative is a drag session carrying nothing: the cursor picks up
      // an image and the drop silently does nothing at the far end.
      await expect(host.startScreenshotDrag(['gone'])).rejects.toThrow()
      expect(host.__mock.lastDragIds()).toBeNull()
    })

    it('drags the files that still resolve when some have vanished', async () => {
      const [first] = await host.listScreenshots()
      await host.startScreenshotDrag([first!.id, 'gone'])
      expect(host.__mock.lastDragIds()).toEqual([first!.id])
    })
  })

  describe('quit (FR-076)', () => {
    it('resolves and records the call rather than exiting', async () => {
      expect(host.__mock.didQuit()).toBe(false)
      await expect(host.quitApp()).resolves.toBeUndefined()
      expect(host.__mock.didQuit()).toBe(true)
    })
  })

  it('every on* method returns a working unsubscribe', () => {
    const subs = [
      host.onScreenshotsChanged(() => {}),
      host.onTimerStateChanged(() => {}),
      host.onPanelShown(() => {})
    ]
    for (const off of subs) {
      expect(typeof off).toBe('function')
      expect(() => off()).not.toThrow()
    }
  })
})

// ============================================================================
// Part 2 — wiring contract for the real bridge (no Electron process needed)
// ============================================================================

describe('HostBridge contract — real implementation wiring', () => {
  const invoke = vi.fn(async () => undefined)
  const subscribe = vi.fn(() => () => {})
  let real: HostBridge

  beforeEach(async () => {
    invoke.mockClear()
    subscribe.mockClear()
    ;(globalThis as { window?: unknown }).window = { __hostBridge: { invoke, subscribe } }
    const mod = await import('../../src/renderer/host/host-bridge')
    real = mod.createElectronBridge()
  })

  it('implements every method on the contract', () => {
    for (const name of CONTRACT_METHODS) {
      expect(typeof real[name], `missing ${String(name)}`).toBe('function')
    }
  })

  it('reports itself as an electron host with native features', () => {
    expect(real.getEnvironment()).toBe('electron')
    expect(real.supportsNativeFeatures()).toBe(true)
  })

  it('only ever talks to enumerated invoke channels', async () => {
    await real.listScreenshots()
    await real.openScreenshot('x')
    await real.getTimerState()
    await real.startTimer(1000)
    await real.getPreferences()
    await real.updatePreferences({})
    await real.setTimerShortcut(null)
    await real.closePanel()

    const used = invoke.mock.calls.map((c) => (c as unknown[])[0] as string)
    expect(used.length).toBeGreaterThan(0)
    for (const channel of used) {
      expect(ALL_INVOKE_CHANNELS, `unenumerated channel: ${channel}`).toContain(channel)
    }
  })

  it('sends ids rather than filesystem paths for screenshot actions', async () => {
    await real.openScreenshot('some-id')
    expect(invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.screenshotsOpen, { id: 'some-id' })
  })

  it('dismisses the alarm through its own enumerated channel', async () => {
    await real.dismissTimerAlarm()
    expect(invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.timerDismissAlarm, undefined)
  })

  it('reads the version through its own channel, not bundled into the check', async () => {
    await real.getAppVersion()
    expect(invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.appGetVersion, undefined)
  })

  it('checks for updates through its enumerated channel with no payload', async () => {
    await real.checkForUpdates()
    expect(invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.appCheckUpdates, undefined)
  })

  it('opens the releases page without ever sending a URL (FR-126)', async () => {
    await real.openReleasesPage()
    expect(invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.appOpenReleases, undefined)
    // The point of the assertion: no argument carries an address.
    const call = (invoke.mock.calls as unknown[][]).find(
      (c) => c[0] === INVOKE_CHANNELS.appOpenReleases
    )
    expect(call?.[1]).toBeUndefined()
  })

  it('starts a drag by id, so the renderer never names a file', async () => {
    await real.startScreenshotDrag(['a', 'b'])
    expect(invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.screenshotsStartDrag, { ids: ['a', 'b'] })
  })

  it('subscribes to screenshot changes through its enumerated event channel', () => {
    const off = real.onScreenshotsChanged(() => {})
    expect(subscribe).toHaveBeenCalledWith(EVENT_CHANNELS.screenshotsChanged, expect.any(Function))
    expect(() => off()).not.toThrow()
  })
})

// ============================================================================
// Part 3 — structural parity between the two implementations
// ============================================================================

/**
 * CONTRACT_METHODS is hand-maintained, so on its own it proves only that the
 * listed methods exist. These two cases close the loop: the mock and the real
 * bridge must expose the SAME method set, and that set must be exactly the
 * list. Adding a method to the interface and to one implementation - the
 * "I'll add the mock in a follow-up" failure the constitution forbids - fails
 * here rather than at runtime in browser mode.
 */
describe('HostBridge contract — structural parity', () => {
  const methodsOf = (impl: object): string[] =>
    Object.entries(impl)
      .filter(([name, value]) => typeof value === 'function' && !name.startsWith('__'))
      .map(([name]) => name)
      .sort()

  it('the mock and the real bridge expose identical method sets', async () => {
    ;(globalThis as { window?: unknown }).window = {
      __hostBridge: { invoke: async () => undefined, subscribe: () => () => {} }
    }
    const { createElectronBridge } = await import('../../src/renderer/host/host-bridge')

    expect(methodsOf(createMockBridge())).toEqual(methodsOf(createElectronBridge()))
  })

  it('the declared contract list matches what the implementations actually expose', () => {
    expect(methodsOf(createMockBridge())).toEqual([...CONTRACT_METHODS].sort())
  })

  it('exposes none of the sixteen methods feature 003 removed', async () => {
    ;(globalThis as { window?: unknown }).window = {
      __hostBridge: { invoke: async () => undefined, subscribe: () => () => {} }
    }
    const { createElectronBridge } = await import('../../src/renderer/host/host-bridge')
    for (const impl of [createMockBridge(), createElectronBridge()]) {
      for (const name of REMOVED_METHODS) {
        expect(methodsOf(impl), `${name} was re-introduced`).not.toContain(name)
      }
    }
  })
})
