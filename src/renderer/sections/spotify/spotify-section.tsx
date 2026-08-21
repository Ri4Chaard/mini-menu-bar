import { useEffect, useState, type ReactNode } from 'react'
import { Music, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import type { PlaybackState } from '@shared/types'
import { useHost } from '../../host/use-host'
import { ErrorState, EmptyState } from '../../components/states'
import { formatClock } from '../timer/format-clock'

/**
 * FR-025: each inactive state renders distinctly, and controls are never
 * presented as functional when they are not. The reason playback is inoperable
 * changes what the user must be told, which is why availability is an enum
 * rather than a boolean (data-model.md).
 */
function InactiveState({ state }: { state: PlaybackState['availability'] }): ReactNode {
  if (state === 'permission-denied') {
    return (
      <ErrorState
        title="Automation access denied"
        detail="Allow this app to control Spotify in System Settings, Privacy and Security, Automation."
      />
    )
  }
  if (state === 'not-running') {
    return <EmptyState icon={Music} title="Spotify isn't running" hint="Open Spotify to control playback." />
  }
  return <EmptyState icon={Music} title="Nothing playing" hint="Start a track in Spotify." />
}

export function SpotifySection(): ReactNode {
  const host = useHost()
  const [state, setState] = useState<PlaybackState | null>(null)
  const [scrubbing, setScrubbing] = useState<number | null>(null)

  useEffect(() => {
    void host.getPlaybackState().then(setState).catch(() => setState(null))
    // Subscribing starts polling in main; unsubscribing stops it (R-007).
    return host.onPlaybackStateChanged(setState)
  }, [host])

  if (!state) return null
  if (state.availability !== 'playing' && state.availability !== 'paused') {
    return <InactiveState state={state.availability} />
  }

  const playing = state.availability === 'playing'
  const duration = state.durationMs ?? 0
  // Show the dragged value while scrubbing, then reconcile to the polled value.
  const position = scrubbing ?? state.positionMs ?? 0

  return (
    <div className="flex h-full flex-col justify-center gap-3 p-4">
      <div className="min-w-0 text-center">
        <p className="truncate font-medium" title={state.trackName ?? ''}>
          {state.trackName}
        </p>
        <p className="truncate text-[color:var(--color-text-muted)]" title={state.artist ?? ''}>
          {state.artist}
        </p>
      </div>

      <div className="flex items-center gap-2">
        <span className="w-9 shrink-0 text-right tabular-nums text-[color:var(--color-text-muted)]">
          {formatClock(position)}
        </span>
        <input
          type="range"
          min={0}
          max={duration || 1}
          value={position}
          aria-label="Playback position"
          onChange={(e) => setScrubbing(Number(e.target.value))}
          onMouseUp={() => {
            if (scrubbing !== null) void host.seekTo(scrubbing)
            setScrubbing(null)
          }}
          onKeyUp={() => {
            if (scrubbing !== null) void host.seekTo(scrubbing)
            setScrubbing(null)
          }}
          className="min-w-0 flex-1 accent-[color:var(--color-accent)]"
        />
        <span className="w-9 shrink-0 tabular-nums text-[color:var(--color-text-muted)]">
          {formatClock(duration)}
        </span>
      </div>

      <div className="flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => void host.previousTrack()}
          aria-label="Previous track"
          className="rounded-full p-2 hover:bg-[color:var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2"
        >
          <SkipBack className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => void host.togglePlayPause()}
          aria-label={playing ? 'Pause' : 'Play'}
          className="rounded-full bg-[color:var(--color-accent)] p-2.5 text-[color:var(--color-accent-text)] focus-visible:outline focus-visible:outline-2"
        >
          {playing ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => void host.nextTrack()}
          aria-label="Next track"
          className="rounded-full p-2 hover:bg-[color:var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2"
        >
          <SkipForward className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
