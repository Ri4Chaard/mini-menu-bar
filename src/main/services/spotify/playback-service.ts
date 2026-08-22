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
import {
  FIELD_SEP,
  STATE_SCRIPT,
  runSpotifyScript,
  setRepeatScript,
  setShuffleScript,
  setVolumeScript
} from './applescript'
import { createArtworkCache } from './artwork'

export interface PlaybackService {
  get(): Promise<PlaybackState>
  toggle(): Promise<void>
  next(): Promise<void>
  previous(): Promise<void>
  seek(positionMs: number): Promise<void>
  setVolume(volume: number): Promise<void>
  setShuffle(shuffling: boolean): Promise<void>
  /** A toggle, not a cycle: only a boolean is scriptable (R-109). */
  setRepeat(repeating: boolean): Promise<void>
  setSubscribed(active: boolean): void
  /** The preview needs polling too, independently of a renderer subscription. */
  setPreviewActive(active: boolean): void
  onChange(cb: (state: PlaybackState) => void): () => void
  stop(): void
}

/**
 * Every field nulls together. A stale volume or a leftover artwork riding an
 * unavailable state is the ghost the data-model rule exists to prevent.
 */
const unavailable = (availability: PlaybackState['availability']): PlaybackState => ({
  availability,
  trackName: null,
  artist: null,
  positionMs: null,
  durationMs: null,
  volume: null,
  shuffling: null,
  repeating: null,
  artworkDataUrl: null
})

/** AppleScript renders booleans as the words "true" and "false". */
function toBoolean(value: string | undefined): boolean | null {
  if (value === undefined) return null
  const normalised = value.trim().toLowerCase()
  if (normalised === 'true') return true
  if (normalised === 'false') return false
  return null
}

/**
 * Locale-safe numeric parse.
 *
 * AppleScript formats numbers with the user's decimal separator, so a Ukrainian
 * or German system yields "98,248" where Number() gives NaN. The script now
 * rounds to integers so this should not trigger, but a stray separator must
 * degrade to a sane value rather than blanking the whole playback state.
 */
function toNumber(value: string | undefined): number {
  if (!value) return 0
  const n = Number(value.replace(',', '.').replace(/\s/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * `artworkUrl` is deliberately NOT part of PlaybackState: it never crosses the
 * boundary. The service resolves it to a data URL before the state is emitted,
 * so the renderer receives bytes and never an address it could fetch
 * (data-model.md, R-111).
 */
export interface ParsedState {
  state: PlaybackState
  artworkUrl: string | null
}

export function parseStateOutput(raw: string): ParsedState {
  const parts = raw.split(FIELD_SEP)
  const state = parts[0] ?? 'stopped'
  if (state === 'stopped' || parts.length < 5) {
    return { state: unavailable('stopped'), artworkUrl: null }
  }

  // Both already whole milliseconds - AppleScript rounds them (see STATE_SCRIPT).
  const durationMs = Math.round(toNumber(parts[3]))
  const positionMs = Math.round(toNumber(parts[4]))

  // Fields 5-8 are absent on an older Spotify build that predates them; the
  // section degrades to hiding those controls rather than blanking the state.
  const volume = parts[5] === undefined ? null : Math.round(toNumber(parts[5]))

  return {
    state: {
      availability: state === 'playing' ? 'playing' : 'paused',
      trackName: parts[1] || null,
      artist: parts[2] || null,
      // Position never exceeds duration (data-model.md validation rule).
      positionMs: durationMs > 0 ? Math.min(positionMs, durationMs) : positionMs,
      durationMs: durationMs || null,
      volume: volume === null ? null : Math.min(Math.max(volume, 0), 100),
      shuffling: toBoolean(parts[6]),
      repeating: toBoolean(parts[7]),
      // Filled in by the service once the bytes are cached.
      artworkDataUrl: null
    },
    artworkUrl: parts[8]?.trim() || null
  }
}

export function createPlaybackService(): PlaybackService {
  let latest: PlaybackState = unavailable('not-running')
  let subscribed = false
  let previewActive = false
  let handle: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<(state: PlaybackState) => void>()
  const artwork = createArtworkCache()

  const equal = (a: PlaybackState, b: PlaybackState): boolean =>
    a.availability === b.availability &&
    a.trackName === b.trackName &&
    a.artist === b.artist &&
    a.durationMs === b.durationMs &&
    a.volume === b.volume &&
    a.shuffling === b.shuffling &&
    a.repeating === b.repeating &&
    a.artworkDataUrl === b.artworkDataUrl &&
    Math.abs((a.positionMs ?? 0) - (b.positionMs ?? 0)) < 900

  const read = async (): Promise<PlaybackState> => {
    const outcome = await runSpotifyScript(STATE_SCRIPT)
    switch (outcome.kind) {
      case 'ok': {
        const { state, artworkUrl } = parseStateOutput(outcome.value)
        // Only reached while something is observing playback, so the artwork
        // request rides the same demand-driven gate as the poll itself
        // (Principle V, FR-087).
        return { ...state, artworkDataUrl: await artwork.get(artworkUrl) }
      }
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
    setVolume: (volume) => command(setVolumeScript(Math.min(Math.max(Math.round(volume), 0), 100))),
    setShuffle: (shuffling) => command(setShuffleScript(shuffling)),
    setRepeat: (repeating) => command(setRepeatScript(repeating)),
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
