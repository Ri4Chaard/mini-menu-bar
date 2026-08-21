/**
 * A read-through view of Spotify. Never persisted, never authoritative - the
 * external app owns this data (data-model.md).
 *
 * Polling is demand-driven: it starts when something observes it and stops when
 * the last observer goes away. With the panel closed and the preview off there
 * are no timers and no child processes (constitution Principle V).
 */
import { BridgeError } from '@shared/errors'
import type { PlaybackState } from '@shared/types'
import { FIELD_SEP, STATE_SCRIPT, runSpotifyScript } from './applescript'

export interface PlaybackService {
  get(): Promise<PlaybackState>
  toggle(): Promise<void>
  next(): Promise<void>
  previous(): Promise<void>
  seek(positionMs: number): Promise<void>
  setSubscribed(active: boolean): void
  /** The preview needs polling too, independently of a renderer subscription. */
  setPreviewActive(active: boolean): void
  onChange(cb: (state: PlaybackState) => void): () => void
  stop(): void
}

const unavailable = (availability: PlaybackState['availability']): PlaybackState => ({
  availability,
  trackName: null,
  artist: null,
  positionMs: null,
  durationMs: null
})

export function parseStateOutput(raw: string): PlaybackState {
  const parts = raw.split(FIELD_SEP)
  const state = parts[0] ?? 'stopped'
  if (state === 'stopped' || parts.length < 5) return unavailable('stopped')

  const durationMs = Math.round(Number(parts[3]) || 0)
  const positionMs = Math.round((Number(parts[4]) || 0) * 1000)
  return {
    availability: state === 'playing' ? 'playing' : 'paused',
    trackName: parts[1] || null,
    artist: parts[2] || null,
    // Position never exceeds duration (data-model.md validation rule).
    positionMs: durationMs > 0 ? Math.min(positionMs, durationMs) : positionMs,
    durationMs: durationMs || null
  }
}

export function createPlaybackService(): PlaybackService {
  let latest: PlaybackState = unavailable('not-running')
  let subscribed = false
  let previewActive = false
  let handle: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<(state: PlaybackState) => void>()

  const equal = (a: PlaybackState, b: PlaybackState): boolean =>
    a.availability === b.availability &&
    a.trackName === b.trackName &&
    a.artist === b.artist &&
    a.durationMs === b.durationMs &&
    Math.abs((a.positionMs ?? 0) - (b.positionMs ?? 0)) < 900

  const read = async (): Promise<PlaybackState> => {
    const outcome = await runSpotifyScript(STATE_SCRIPT)
    switch (outcome.kind) {
      case 'ok':
        return parseStateOutput(outcome.value)
      case 'permission-denied':
        return unavailable('permission-denied')
      default:
        return unavailable('not-running')
    }
  }

  const poll = async (): Promise<void> => {
    const next = await read()
    const changed = !equal(latest, next)
    latest = next
    if (changed) for (const cb of listeners) cb(latest)
  }

  const reschedule = (): void => {
    const wanted = subscribed || previewActive
    if (wanted && handle === null) {
      void poll()
      handle = setInterval(() => void poll(), subscribed ? 1000 : 2000)
      if (typeof handle.unref === 'function') handle.unref()
    } else if (!wanted && handle !== null) {
      clearInterval(handle)
      handle = null
    }
  }

  const command = async (body: string): Promise<void> => {
    const outcome = await runSpotifyScript(body)
    if (outcome.kind === 'permission-denied') {
      latest = unavailable('permission-denied')
      throw new BridgeError(
        'SPOTIFY_UNAVAILABLE',
        'Automation access to Spotify was denied. Grant it in System Settings, Privacy and Security, Automation.'
      )
    }
    if (outcome.kind !== 'ok') {
      latest = unavailable('not-running')
      throw new BridgeError('SPOTIFY_UNAVAILABLE', 'Spotify is not running.')
    }
    await poll()
  }

  return {
    async get() {
      if (handle === null) await poll()
      return latest
    },
    toggle: () => command('playpause'),
    next: () => command('next track'),
    previous: () => command('previous track'),
    seek: (positionMs) => command(`set player position to ${Math.max(0, positionMs) / 1000}`),
    setSubscribed(active) {
      subscribed = active
      reschedule()
    },
    setPreviewActive(active) {
      previewActive = active
      reschedule()
    },
    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb) as unknown as void
    },
    stop() {
      if (handle !== null) clearInterval(handle)
      handle = null
      listeners.clear()
    }
  }
}
