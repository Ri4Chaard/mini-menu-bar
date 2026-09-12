import { useEffect, useState, type ReactNode } from 'react'
import { Bell, BellOff, Pause, Play, Repeat, RotateCcw } from 'lucide-react'
import { MAX_TIMER_PRESETS, type Preferences, type TimerState } from '@shared/types'
import { DurationInput } from './duration-input'
import { useHost } from '../../host/use-host'
import { FooterNote, HeaderAction, SectionChrome } from '../../components/section-chrome'
import { PreviewToggle } from '../../components/preview-toggle'
import { Chip } from '../../components/ui/chip'
import { IconButton } from '../../components/ui/icon-button'



/**
 * "10s", "90s", "5m", "1m 30s", "1h 30m" — the chip label for a duration.
 *
 * Seconds are spelled out rather than rounded away. Rounding to the nearest
 * minute turned a typed 0:10 into a chip reading "0m", which names a timer that
 * cannot exist - the minimum is 1 s.
 */
export function presetLabel(ms: number): string {
  const totalSeconds = Math.round(ms / 1000)

  if (totalSeconds < 60) return `${totalSeconds}s`

  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

/**
 * Whether the readout is showing a duration the user is CHOOSING rather than a
 * countdown in progress.
 *
 * 'finished' belongs here alongside 'idle', and leaving it out was a bug: after
 * a timer ended, typing a new duration had no visible effect because the
 * readout kept falling back to the finished countdown's remaining 0 ms. It is
 * reachable with the alarm toggle off too, where there is no Dismiss button to
 * clear the finished state at all.
 */
export function isSettable(status: TimerState['status']): boolean {
  return status === 'idle' || status === 'finished'
}

/** What the big readout shows: a typed duration if there is one, else the clock. */
export function readoutMs(state: TimerState, pendingMs: number | null): number {
  return pendingMs !== null && isSettable(state.status) ? pendingMs : state.remainingMs
}

/** "Ready · ends at 18:32" — the status line under the readout. */
export function statusLine(state: TimerState, pendingMs: number | null = null): string {
  // The alarm outranks everything: it is the thing demanding attention, and it
  // can be ringing over a countdown repeat has already restarted.
  if (state.alarming) return 'Alarm ringing'
  // A typed duration outranks 'Finished': the readout is showing what will run
  // next, so the line beneath it must not still describe the run that ended.
  if (pendingMs !== null && isSettable(state.status)) return `Ready · ${presetLabel(pendingMs)}`
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

  /**
   * A duration typed but not yet started.
   *
   * Held here rather than pushed through the timer service because FR-108
   * forbids a typed duration silently replacing a countdown that is already
   * running. Typing sets what Start will use; it never touches a live
   * countdown. Persisted alongside, so it survives a restart.
   */
  const [pendingMs, setPendingMs] = useState<number | null>(null)

  if (!state) return null

  const running = state.status === 'running'

  /** The duration the Save control would store: what is typed, else configured. */
  const currentMs = pendingMs ?? state.configuredDurationMs
  const alreadySaved = presets.includes(currentMs)
  const rowFull = presets.length >= MAX_TIMER_PRESETS
  const canSave = !alreadySaved && !rowFull

  const saveLabel = alreadySaved ? 'Saved' : rowFull ? `Max ${MAX_TIMER_PRESETS}` : 'Save'

  /**
   * Add the current duration to the quick-pick row.
   *
   * Explicit because a duration typed for a one-off timer should not become a
   * permanent chip on its own. normalisePresets sorts, de-duplicates and caps
   * the result, so this cannot produce a duplicate or overflow the row.
   */
  const saveCurrent = (): void => {
    if (!canSave) return
    onUpdatePreferences({ timerPresets: [...presets, currentMs] })
  }
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
        : {
            label: 'Start',
            icon: Play,
            run: async () => {
              const next = await host.startTimer(pendingMs ?? state.configuredDurationMs)
              // startTimer adopts the duration as `configuredDurationMs`, so the
              // pending value has done its job. Holding on to it would make the
              // readout show the typed duration again the moment this countdown
              // finished, instead of 0:00.
              setPendingMs(null)
              return next
            }
          }
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
        editing ? (
          <HeaderAction label="Done" onClick={() => setEditing(false)} />
        ) : (
          <div style={{ gap: 'var(--header-gap-right)' }} className="flex items-center">
            <HeaderAction
              label={saveLabel}
              // Disabled rather than hidden, so the row's cap is discoverable
              // before the user hits it rather than at the moment it silently
              // stops working.
              onClick={canSave ? saveCurrent : undefined}
            />
            <HeaderAction label="Edit" onClick={() => setEditing(true)} />
          </div>
        )
      }
      footer={footer}
    >
      <div className="flex h-full items-center justify-between gap-4">
        {/* shrink-0 on the left column: the readout and status line are fixed
            content, so the preset row is what must give way if anything does. */}
        <div className="flex shrink-0 flex-col gap-1.5">
          <DurationInput
            displayMs={readoutMs(state, pendingMs)}
            configuredMs={pendingMs ?? state.configuredDurationMs}
            status={state.status}
            // Committing a typed duration sets what Start will use. It does
            // NOT touch the preset row - a duration typed once for a one-off
            // timer should not silently become a permanent chip. Saving is a
            // separate, explicit act (see the Save control below).
            onCommit={(ms) => {
              setPendingMs(ms)
              onUpdatePreferences({ timerDurationMs: ms })
            }}
          />
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
              {statusLine(state, pendingMs)}
            </span>
          </span>
        </div>

        <div className="flex min-w-0 flex-col items-end gap-3">
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

          {/* The row cannot wrap (the body band is a fixed 108 pt), so it is
              capped at MAX_TIMER_PRESETS and clipped as a backstop. Without the
              clip an over-long label pushes the last chip past the panel edge,
              which is what a six-preset row used to do. */}
          <div className="flex min-w-0 items-center gap-2 overflow-hidden">
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
                  setPendingMs(null)
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
            {/* The control that used to sit here invented a duration on the
                user's behalf from a fixed candidate list, which is exactly what
                FR-105 removes. Durations are typed into the readout now, and a
                committed one joins this row as a quick pick. */}
          </div>
        </div>
      </div>
    </SectionChrome>
  )
}
