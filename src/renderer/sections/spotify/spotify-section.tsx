import { useEffect, useState, type ReactNode } from 'react'
import { Music, Pause, Play, Repeat, Shuffle, SkipBack, SkipForward, Volume2 } from 'lucide-react'
import type { PlaybackState, Preferences } from '@shared/types'
import { useHost } from '../../host/use-host'
import { ErrorState } from '../../components/states'
import { SectionChrome } from '../../components/section-chrome'
import { PreviewToggle } from '../../components/preview-toggle'
import { IconButton } from '../../components/ui/icon-button'
import { Range } from '../../components/ui/range'

function clock(ms: number | null): string {
  if (ms === null) return '0:00'
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const UNAVAILABLE: Record<string, string> = {
  'not-running': 'Open Spotify to control playback from here.',
  'permission-denied':
    'Automation access to Spotify was denied. Grant it in System Settings → Privacy & Security → Automation.',
  stopped: 'Nothing is playing right now.'
}

export function SpotifySection({
  preferences,
  onUpdatePreferences
}: {
  preferences: Preferences
  onUpdatePreferences: (patch: Partial<Preferences>) => void
}): ReactNode {
  const host = useHost()
  const [state, setState] = useState<PlaybackState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void host.getPlaybackState().then(setState).catch(() => setState(null))
    return host.onPlaybackStateChanged(setState)
  }, [host])

  const act = (run: () => Promise<void>): void => {
    setError(null)
    void run().catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : String(cause))
    )
  }

  const playing = state?.availability === 'playing'
  const live = playing || state?.availability === 'paused'

  const footer = (
    <>
      <PreviewToggle section="spotify" preferences={preferences} onUpdate={onUpdatePreferences} />
      <div style={{ gap: 'var(--footer-gap)' }} className="flex items-center">
        <span className="flex items-center gap-1.5">
          <Volume2 className="size-3.5 shrink-0 text-[var(--color-text-secondary)]" aria-hidden />
          <Range
            className="w-[70px]"
            label="Volume"
            value={state?.volume ?? 0}
            max={100}
            disabled={!live || state?.volume === null}
            valueText={`${state?.volume ?? 0} percent`}
            onCommit={(next) => act(() => host.setVolume(next))}
          />
        </span>
        <IconButton
          icon={Shuffle}
          label="Shuffle"
          tone={state?.shuffling ? 'accent' : 'fill'}
          pressed={state?.shuffling ?? false}
          disabled={!live || state?.shuffling === null}
          onClick={() => act(() => host.setShuffle(!state?.shuffling))}
        />
        {/* A toggle, not a three-state cycle: only a boolean is scriptable
            (research.md R-109, FR-068 as amended). */}
        <IconButton
          icon={Repeat}
          label="Repeat"
          tone={state?.repeating ? 'accent' : 'fill'}
          pressed={state?.repeating ?? false}
          disabled={!live || state?.repeating === null}
          onClick={() => act(() => host.setRepeat(!state?.repeating))}
        />
      </div>
    </>
  )

  return (
    <SectionChrome
      title="Spotify"
      pill={playing ? 'Playing' : state?.availability === 'paused' ? 'Paused' : 'Idle'}
      // The frame draws an "Open Spotify" action here. It is not built: there
      // is no bridge method that launches another application, and adding one
      // widens the native boundary for a convenience the Dock already provides.
      // A control that does nothing is worse than its absence (cf. R-110).
      action={undefined}
      footer={footer}
    >
      {!live ? (
        <ErrorState
          title="Spotify isn't playing"
          detail={UNAVAILABLE[state?.availability ?? 'not-running']}
        />
      ) : (
        <div className="flex h-full items-center gap-4">
          {/* FR-087: a data URL from main, never a URL the renderer fetches.
              A null one falls back here without disturbing anything else. */}
          <div
            className="flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] bg-[var(--color-fill)]"
            style={{ width: 88, height: 88 }}
          >
            {state.artworkDataUrl ? (
              <img src={state.artworkDataUrl} alt="" className="size-full object-cover" />
            ) : (
              <Music className="size-7 text-[var(--color-text-tertiary)]" aria-hidden />
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex min-w-0 flex-col">
              <p className="truncate text-[length:var(--text-track)] font-semibold text-[var(--color-text)]">
                {state.trackName ?? 'Unknown track'}
              </p>
              <p className="truncate text-[length:var(--text-control)] text-[var(--color-text-secondary)]">
                {state.artist ?? 'Unknown artist'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[length:var(--text-caption)] tabular-nums text-[var(--color-text-secondary)]">
                {clock(state.positionMs)}
              </span>
              {/* Seeking commits on RELEASE. Each seek is an osascript spawn,
                  so firing per pointer-move would spawn dozens per drag (R-117). */}
              <Range
                className="w-full min-w-0 flex-1"
                label="Seek"
                value={state.positionMs ?? 0}
                max={state.durationMs ?? 0}
                valueText={clock(state.positionMs)}
                onCommit={(next) => act(() => host.seekTo(next))}
              />
              <span className="shrink-0 text-[length:var(--text-caption)] tabular-nums text-[var(--color-text-secondary)]">
                {clock(state.durationMs)}
              </span>
            </div>

            {error ? (
              <p role="alert" className="truncate text-[length:var(--text-micro)] text-[var(--color-danger)]">
                {error}
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <IconButton
              icon={SkipBack}
              label="Previous track"
              tone="plain"
              size={34}
              iconSize={17}
              onClick={() => act(() => host.previousTrack())}
            />
            <IconButton
              icon={playing ? Pause : Play}
              label={playing ? 'Pause' : 'Play'}
              tone="accent"
              size={44}
              iconSize={18}
              onClick={() => act(() => host.togglePlayPause())}
            />
            <IconButton
              icon={SkipForward}
              label="Next track"
              tone="plain"
              size={34}
              iconSize={17}
              onClick={() => act(() => host.nextTrack())}
            />
          </div>
        </div>
      )}
    </SectionChrome>
  )
}
