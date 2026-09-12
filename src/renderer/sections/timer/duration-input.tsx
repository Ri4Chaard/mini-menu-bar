import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatClock } from './format-clock'
import { formatDurationInput, parseDuration } from './parse-duration'

/**
 * The countdown readout, editable in place (FR-104).
 *
 * It is the readout itself rather than a new field because `002` fixed the
 * panel's band arithmetic — 16+24+14+108+14+1+14+28+16 = 235, asserted by
 * tests/unit/design-tokens.spec.ts — and an extra row would break it. Display
 * and editor share the same 108 pt band (research.md R-208).
 *
 * Both states are laid out on ONE fixed-width grid cell, and the button and the
 * input carry identical type metrics and zero padding. Anything else makes the
 * panel visibly jump the moment the field opens: the readout is the widest
 * thing in the left column, so a few pixels of difference shoves the transport
 * buttons and the whole preset row sideways, and at six presets the last chip
 * falls off the panel entirely.
 *
 * Escape is the delicate part. PanelShell dismisses the panel on Escape via a
 * bubble-phase listener on the panel root, and a text field has to be able to
 * cancel an edit without the panel vanishing underneath it. The rule is two
 * stage: the FIRST Escape reverts the field and stops propagating, so the panel
 * stays open; a SECOND Escape, with nothing being edited, reaches PanelShell
 * and dismisses as it always did. This is a deliberate change to a Principle
 * III guarantee, recorded in the plan's Constitution Check.
 */
export function DurationInput({
  displayMs,
  configuredMs,
  status,
  onCommit
}: {
  /** What the readout shows when not editing — the live countdown. */
  displayMs: number
  /** What the field is seeded with — the configured duration, not the remainder. */
  configuredMs: number
  status: string
  onCommit: (ms: number) => void
}): ReactNode {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [rejected, setRejected] = useState(false)
  const field = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) field.current?.select()
  }, [editing])

  const begin = (): void => {
    setDraft(formatDurationInput(configuredMs))
    setRejected(false)
    setEditing(true)
  }

  /** Revert without committing. Used by Escape and by blur alike (R-208). */
  const cancel = (): void => {
    setEditing(false)
    setRejected(false)
  }

  const commit = (): void => {
    const ms = parseDuration(draft)
    if (ms === null) {
      // Rejected input keeps the field open and leaves the previous duration
      // intact, rather than starting some other timer than the one asked for
      // (FR-106).
      setRejected(true)
      return
    }
    setEditing(false)
    setRejected(false)
    onCommit(ms)
  }

  // Identical on both, so swapping one for the other moves nothing. `w-[6ch]`
  // with tabular numerals holds the longest clock this readout shows,
  // "1:02:05", without reflowing for shorter ones.
  const metrics =
    'block m-0 w-[6ch] border-0 p-0 bg-transparent text-left text-[length:var(--text-display)] leading-[1.05] font-semibold tabular-nums'

  if (!editing) {
    return (
      <button
        type="button"
        onClick={begin}
        aria-label={`Countdown ${formatClock(displayMs)}. Click to type a duration.`}
        className={`${metrics} text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]`}
      >
        <span aria-live="polite" data-status={status}>
          {formatClock(displayMs)}
        </span>
      </button>
    )
  }

  return (
    <input
      ref={field}
      value={draft}
      aria-label="Timer duration"
      aria-invalid={rejected}
      inputMode="numeric"
      spellCheck={false}
      onChange={(event) => {
        setDraft(event.target.value)
        setRejected(false)
      }}
      onBlur={cancel}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          // Stop here so PanelShell's Escape handler does not also fire. The
          // next Escape finds nothing being edited and dismisses the panel.
          event.stopPropagation()
          cancel()
        }
      }}
      className={`${metrics} outline-none ${
        rejected
          ? 'text-[var(--color-danger)] underline decoration-wavy'
          : 'text-[var(--color-text)]'
      }`}
    />
  )
}
