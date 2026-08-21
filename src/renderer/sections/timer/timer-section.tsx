import { useEffect, useState, type ReactNode } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import type { TimerState } from '@shared/types'
import { useHost } from '../../host/use-host'
import { formatClock } from './format-clock'

const PRESETS = [1, 5, 10, 25]

export function TimerSection(): ReactNode {
  const host = useHost()
  const [state, setState] = useState<TimerState | null>(null)

  useEffect(() => {
    void host.getTimerState().then(setState).catch(() => setState(null))
    // Subscribing is what tells the main process to emit at 1 Hz; unsubscribing
    // drops it back to a single fuse (constitution Principle V).
    return host.onTimerStateChanged(setState)
  }, [host])

  if (!state) return null

  const running = state.status === 'running'
  const primary = running
    ? { label: 'Pause', icon: Pause, run: () => host.pauseTimer() }
    : state.status === 'paused'
      ? { label: 'Resume', icon: Play, run: () => host.resumeTimer() }
      : { label: 'Start', icon: Play, run: () => host.startTimer(state.configuredDurationMs) }

  const PrimaryIcon = primary.icon

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-4">
      <p
        aria-live="polite"
        className="font-mono text-4xl tabular-nums"
        data-status={state.status}
      >
        {formatClock(state.remainingMs)}
      </p>

      {state.status === 'finished' ? (
        <p className="text-[color:var(--color-accent)]">Finished</p>
      ) : null}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void primary.run().then(setState)}
          className="flex items-center gap-1.5 rounded-[var(--radius-card)] bg-[color:var(--color-accent)] px-3 py-1.5 text-[color:var(--color-accent-text)] focus-visible:outline focus-visible:outline-2"
        >
          <PrimaryIcon className="size-4" aria-hidden />
          {primary.label}
        </button>
        <button
          type="button"
          onClick={() => void host.resetTimer().then(setState)}
          aria-label="Reset timer"
          className="rounded-[var(--radius-card)] border border-[color:var(--color-border)] p-1.5 hover:bg-[color:var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2"
        >
          <RotateCcw className="size-4" aria-hidden />
        </button>
      </div>

      <div className="flex gap-1.5">
        {PRESETS.map((minutes) => (
          <button
            key={minutes}
            type="button"
            disabled={running}
            onClick={() => void host.startTimer(minutes * 60_000).then(setState)}
            className="rounded-[var(--radius-card)] border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-surface-hover)] disabled:opacity-40 focus-visible:outline focus-visible:outline-2"
          >
            {minutes}m
          </button>
        ))}
      </div>
    </div>
  )
}
