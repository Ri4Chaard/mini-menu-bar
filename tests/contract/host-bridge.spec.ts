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
  'listScreenshots', 'openScreenshot', 'revealScreenshot', 'markScreenshotsSeen',
  'onScreenshotsChanged', 'getScreenshotSourceError', 'copyScreenshots', 'deleteScreenshots',
  'startScreenshotDrag',
  'getTimerState', 'startTimer', 'pauseTimer', 'resumeTimer', 'resetTimer', 'onTimerStateChanged',
  'getPlaybackState', 'togglePlayPause', 'nextTrack', 'previousTrack', 'seekTo', 'onPlaybackStateChanged',
  'setVolume', 'setShuffle', 'setRepeat',
  'listNotes', 'createNote', 'updateNote', 'deleteNote', 'flushNotes',
  'getPreferences', 'updatePreferences', 'setTimerShortcut',
  'closePanel', 'onPanelShown', 'quitApp',
  'getEnvironment', 'supportsNativeFeatures'
]

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

    it('markScreenshotsSeen is idempotent and only moves the watermark forward', async () => {
      await host.markScreenshotsSeen()
      const first = (await host.getPreferences()).screenshotsSeenWatermark
      await host.markScreenshotsSeen()
      const second = (await host.getPreferences()).screenshotsSeenWatermark
      expect(second).toBeGreaterThanOrEqual(first)
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

  describe('playback', () => {
    it('nulls every field when unavailable and keeps controls inoperable (FR-025)', async () => {
      for (const state of ['not-running', 'permission-denied'] as const) {
        host.__mock.setPlaybackAvailability(state)
        const s = await host.getPlaybackState()
        expect(s.availability).toBe(state)
        expect(s.trackName).toBeNull()
        expect(s.artist).toBeNull()
        expect(s.positionMs).toBeNull()
        expect(s.durationMs).toBeNull()
        await expect(host.togglePlayPause()).rejects.toMatchObject({ code: 'SPOTIFY_UNAVAILABLE' })
        await expect(host.nextTrack()).rejects.toMatchObject({ code: 'SPOTIFY_UNAVAILABLE' })
      }
    })

    it('clamps a seek beyond the track duration', async () => {
      const before = await host.getPlaybackState()
      await host.seekTo(before.durationMs! + 999_999)
      const after = await host.getPlaybackState()
      expect(after.positionMs).toBeLessThanOrEqual(after.durationMs!)
    })

    it('clamps a negative seek to zero', async () => {
      await host.seekTo(-5000)
      expect((await host.getPlaybackState()).positionMs).toBe(0)
    })

    it('position never exceeds duration', async () => {
      const s = await host.getPlaybackState()
      if (s.positionMs !== null && s.durationMs !== null) {
        expect(s.positionMs).toBeLessThanOrEqual(s.durationMs)
      }
    })
  })

  describe('notes', () => {
    it('creates, updates and deletes', async () => {
      const created = await host.createNote()
      expect(created.content).toBe('')
      const updated = await host.updateNote(created.id, 'hello')
      expect(updated.content).toBe('hello')
      expect(updated.updatedAt).toBeGreaterThanOrEqual(created.createdAt)
      await host.deleteNote(created.id)
      expect((await host.listNotes()).find((n) => n.id === created.id)).toBeUndefined()
    })

    it('orders notes by updatedAt descending', async () => {
      const list = await host.listNotes()
      const times = list.map((n) => n.updatedAt)
      expect([...times].sort((a, b) => b - a)).toEqual(times)
    })
  })

  describe('preferences (FR-031)', () => {
    it('writing one preview flag leaves the other two untouched', async () => {
      await host.updatePreferences({ previews: { screenshots: true, timer: true, spotify: true } })
      const before = await host.getPreferences()
      const after = await host.updatePreferences({
        previews: { ...before.previews, timer: false }
      })
      expect(after.previews.timer).toBe(false)
      expect(after.previews.screenshots).toBe(before.previews.screenshots)
      expect(after.previews.spotify).toBe(before.previews.spotify)
    })

    it('a partial patch does not blank unrelated settings', async () => {
      await host.updatePreferences({ lastSection: 'notes', timerDurationMs: 90_000 })
      const after = await host.updatePreferences({ previews: { screenshots: true } as never })
      expect(after.lastSection).toBe('notes')
      expect(after.timerDurationMs).toBe(90_000)
    })

    it('reports SHORTCUT_TAKEN as false rather than throwing', async () => {
      expect(await host.setTimerShortcut('Command+Space')).toBe(false)
      expect(await host.setTimerShortcut('Control+Option+K')).toBe(true)
    })
  })

  describe('screenshot copy and delete (FR-058)', () => {
    it('copies a single screenshot as an image and several as file references', async () => {
      const [first, second] = await host.listScreenshots()

      await host.copyScreenshots([first!.id])
      expect(host.__mock.lastClipboardMode()).toBe('image')

      await host.copyScreenshots([first!.id, second!.id])
      expect(host.__mock.lastClipboardMode()).toBe('references')
    })

    it('skips ids that no longer resolve but succeeds if any do', async () => {
      const [first] = await host.listScreenshots()
      await expect(host.copyScreenshots([first!.id, 'gone'])).resolves.toBeUndefined()
      expect(host.__mock.lastClipboardMode()).toBe('image')
    })

    it('throws rather than clearing the clipboard when nothing resolves', async () => {
      await expect(host.copyScreenshots(['gone', 'also-gone'])).rejects.toThrow()
    })

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

  describe('spotify volume, shuffle and repeat (FR-068 as amended)', () => {
    it('accepts the ends of the volume range', async () => {
      await expect(host.setVolume(0)).resolves.toBeUndefined()
      await expect(host.setVolume(100)).resolves.toBeUndefined()
      expect((await host.getPlaybackState()).volume).toBe(100)
    })

    it.each([-1, 101, 50.5, '50' as unknown as number])('rejects volume %s', async (bad) => {
      await expect(host.setVolume(bad)).rejects.toThrow()
    })

    it('rejects a non-boolean shuffle or repeat', async () => {
      await expect(host.setShuffle('yes' as unknown as boolean)).rejects.toThrow()
      await expect(host.setRepeat(1 as unknown as boolean)).rejects.toThrow()
    })

    it('round-trips shuffle and repeat through the playback state', async () => {
      await host.setShuffle(true)
      await host.setRepeat(true)
      const state = await host.getPlaybackState()
      expect(state.shuffling).toBe(true)
      // A toggle, not a cycle - the boolean is all Spotify exposes (R-109).
      expect(state.repeating).toBe(true)
    })

    it('refuses all three when Spotify is unavailable', async () => {
      host.__mock.setPlaybackAvailability('not-running')
      await expect(host.setVolume(50)).rejects.toThrow()
      await expect(host.setShuffle(true)).rejects.toThrow()
      await expect(host.setRepeat(true)).rejects.toThrow()
    })
  })

  describe('playback state nulling (data-model.md)', () => {
    it.each(['not-running', 'permission-denied'] as const)(
      'nulls every field when availability is %s',
      async (availability) => {
        host.__mock.setPlaybackAvailability(availability)
        const state = await host.getPlaybackState()
        // A stale volume or leftover artwork on an unavailable state is the
        // ghost this rule exists to prevent.
        expect(state).toMatchObject({
          trackName: null,
          artist: null,
          positionMs: null,
          durationMs: null,
          volume: null,
          shuffling: null,
          repeating: null,
          artworkDataUrl: null
        })
      }
    )

    it('carries artwork as a data URL, never an http(s) address', async () => {
      const state = await host.getPlaybackState()
      expect(state.artworkDataUrl).toMatch(/^data:/)
      // The renderer must never receive something it could fetch (R-111).
      expect(state.artworkDataUrl).not.toMatch(/^https?:/)
    })

    it('falls back to no artwork without disturbing the rest of the state', async () => {
      host.__mock.setArtworkMissing(true)
      const state = await host.getPlaybackState()
      expect(state.artworkDataUrl).toBeNull()
      expect(state.trackName).toBeTruthy()
      expect(state.durationMs).toBeGreaterThan(0)
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
      host.onPlaybackStateChanged(() => {}),
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
    await real.markScreenshotsSeen()
    await real.getTimerState()
    await real.startTimer(1000)
    await real.getPlaybackState()
    await real.seekTo(5)
    await real.listNotes()
    await real.createNote()
    await real.updateNote('a', 'b')
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

  it('starts a drag by id, so the renderer never names a file', async () => {
    await real.startScreenshotDrag(['a', 'b'])
    expect(invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.screenshotsStartDrag, { ids: ['a', 'b'] })
  })

  it('brackets a playback subscription with subscribe(true) and subscribe(false)', () => {
    const off = real.onPlaybackStateChanged(() => {})
    expect(invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.spotifySubscribe, { active: true })
    expect(subscribe).toHaveBeenCalledWith(EVENT_CHANNELS.spotifyChanged, expect.any(Function))
    off()
    expect(invoke).toHaveBeenCalledWith(INVOKE_CHANNELS.spotifySubscribe, { active: false })
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
})
