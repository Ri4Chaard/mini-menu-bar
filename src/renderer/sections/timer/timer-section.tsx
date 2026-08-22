import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Bell, BellOff, Pause, Play, Plus, Repeat, RotateCcw } from 'lucide-react'
import { MAX_TIMER_PRESETS, type Preferences, type TimerState } from '@shared/types'
import { useHost } from '../../host/use-host'
import { FooterNote, HeaderAction, SectionChrome } from '../../components/section-chrome'
import { PreviewToggle } from '../../components/preview-toggle'
import { Chip } from '../../components/ui/chip'
import { IconButton } from '../../components/ui/icon-button'
import { formatClock } from './format-clock'

const MINUTE = 60_000

/** "5m", "25m", "1h 30m" — the chip label for a duration. */
export function presetLabel(ms: number): string {
  const minutes = Math.round(ms / MINUTE)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

/** "Ready · ends at 18:32" — the status line under the readout. */
function statusLine(state: TimerState): string {
  // The alarm outranks everything: it is the thing demanding attention, and it
  // can be ringing over a countdown repeat has already restarted.
  if (state.alarming) return 'Alarm ringing'
  if (state.status === 'finished') return 'Finished'
  if (state.status === 'idle') return `Ready · ${presetLabel(state.configuredDurationMs)}`

  const endsAt = new Date(Date.now() + state.remainingMs)
  const clock = endsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  return state.status === 'paused' ? `Paused · ends at ${clock}` : `Running · ends at ${clock}`
}

export function TimerSection({
  preferences,
  onUpdatePreferences
}: {
  preferences: Preferences
  onUpdatePreferences: (patch: Partial<Preferences>) => void
}): ReactNode {
  const host = useHost()
  const [state, setState] = useState<TimerState | null>(null)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    void host.getTimerState().then(setState).catch(() => setState(null))
    // Subscribing is what tells the main process to emit at 1 Hz; unsubscribing
    // drops it back to a single fuse (constitution Principle V).
    return host.onTimerStateChanged(setState)
  }, [host])

  const presets = preferences.timerPresets
  const nextPreset = useMemo(() => {
    // Offer the next round duration that is not already on the row.
    const candidates = [1, 2, 3, 5, 10, 15, 20, 25, 30, 45, 60, 90].map((m) => m * MINUTE)
    return candidates.find((ms) => !presets.includes(ms)) ?? null
  }, [presets])

  if (!state) return null

  const running = state.status === 'running'
  // Dismiss REPLACES the transport action rather than joining the row. The
  // body band is a fixed 108 pt and the button row already fills its width, so
  // a third button would push the presets out of the panel - and while an
  // alarm is ringing, silencing it is the only thing the user came here to do.
  const primary = state.alarming
    ? { label: 'Dismiss', icon: BellOff, run: () => host.dismissTimerAlarm() }
    : running
      ? { label: 'Pause', icon: Pause, run: () => host.pauseTimer() }
      : state.status === 'paused'
        ? { label: 'Resume', icon: Play, run: () => host.resumeTimer() }
        : { label: 'Start', icon: Play, run: () => host.startTimer(state.configuredDurationMs) }
  const PrimaryIcon = primary.icon

  const footer = (
    <>
      <PreviewToggle section="timer" preferences={preferences} onUpdate={onUpdatePreferences} />
      <div style={{ gap: 'var(--footer-gap)' }} className="flex items-center">
        <FooterNote>When done</FooterNote>
        {/* Both are preferences, not commands, so they read as pressed and
            survive a restart. Neither needs a bridge method: the main process
            reads them at the moment the countdown reaches zero, which is what
            lets either one take effect on the timer already running. */}
        <IconButton
          icon={Bell}
          label="Sound an alarm when the timer finishes"
          tone={preferences.timerAlarm ? 'accent' : 'fill'}
          pressed={preferences.timerAlarm}
          onClick={() => onUpdatePreferences({ timerAlarm: !preferences.timerAlarm })}
        />
        <IconButton
          icon={Repeat}
          label="Repeat the timer when it finishes"
          tone={preferences.timerRepeat ? 'accent' : 'fill'}
          pressed={preferences.timerRepeat}
          onClick={() => onUpdatePreferences({ timerRepeat: !preferences.timerRepeat })}
        />
      </div>
    </>
  )

  return (
    <SectionChrome
      title="Timer"
      pill={state.alarming ? 'Alarm' : state.status === 'idle' ? 'Focus' : state.status}
      action={
        <HeaderAction
          label={editing ? 'Done' : 'Edit Presets'}
          onClick={() => setEditing((v) => !v)}
        />
      }
      footer={footer}
    >
      <div className="flex h-full items-center justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <p
            aria-live="polite"
            data-status={state.status}
            className="text-[length:var(--text-display)] leading-[1.05] font-semibold tabular-nums text-[var(--color-text)]"
          >
            {formatClock(state.remainingMs)}
          </p>
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={`size-1.5 rounded-full ${
                state.alarming
                  ? 'bg-[var(--color-danger)]'
                  : running
                    ? 'bg-[var(--color-accent)]'
                    : 'bg-[var(--color-text-tertiary)]'
              }`}
            />
            <span className="text-[length:var(--text-meta)] text-[var(--color-text-secondary)]">
              {statusLine(state)}
            </span>
          </span>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void primary.run().then(setState)}
              // --color-accent-strong, not --color-accent: this button carries a
              // text label, and white on the measured accent is 3.46:1
              // (contracts/design-tokens.md).
              className="flex h-9 w-22 items-center justify-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--color-accent-strong)] text-[var(--color-on-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              <PrimaryIcon className="size-3.5" aria-hidden />
              {primary.label}
            </button>
            <IconButton
              icon={RotateCcw}
              label="Reset timer"
              size={36}
              iconSize={15}
              onClick={() => void host.resetTimer().then(setState)}
            />
          </div>

          <div className="flex items-center gap-2">
            {presets.map((ms) => (
              <Chip
                key={ms}
                active={!editing && ms === state.configuredDurationMs}
                onClick={() => {
                  if (editing) {
                    if (presets.length > 1) {
                      onUpdatePreferences({ timerPresets: presets.filter((p) => p !== ms) })
                    }
                    return
                  }
                  void host.startTimer(ms).then(setState)
                }}
                // No aria-label in the normal case: the chip's own text IS its
                // accessible name ("1m", "5m"), which is what the e2e suite and
                // a screen reader both address it by.
                label={editing ? `Remove the ${presetLabel(ms)} preset` : undefined}
              >
                {editing ? `${presetLabel(ms)} ✕` : presetLabel(ms)}
              </Chip>
            ))}
            {nextPreset !== null && presets.length < MAX_TIMER_PRESETS ? (
              <IconButton
                icon={Plus}
                label={`Add a ${presetLabel(nextPreset)} preset`}
                size={28}
                iconSize={13}
                onClick={() =>
                  onUpdatePreferences({ timerPresets: [...presets, nextPreset] })
                }
              />
            ) : null}
          </div>
        </div>
      </div>
    </SectionChrome>
  )
}
