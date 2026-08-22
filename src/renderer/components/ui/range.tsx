import { useState, type ReactNode } from 'react'

/**
 * The seek bar and the volume slider.
 *
 * A native range input, not a hand-rolled pointer-event widget. The panel
 * window is non-activating, which historically swallows the first pointerdown
 * of a custom drag; the native control also brings keyboard operation (arrows,
 * Home, End) and an accessible role, which FR-048 and SC-004 require
 * (research.md R-117). Styling lives in theme.css.
 *
 * `onCommit` fires on release, `onInput` during the drag. Callers that reach
 * the host - seeking, volume - MUST act on `onCommit`: each call is an
 * osascript spawn, and firing per pointer-move would spawn dozens per drag.
 */
export function Range({
  value,
  max,
  onCommit,
  label,
  valueText,
  disabled = false,
  className = ''
}: {
  value: number
  max: number
  onCommit: (next: number) => void
  label: string
  valueText?: string
  disabled?: boolean
  className?: string
}): ReactNode {
  // While dragging, the thumb follows the pointer locally. Without this the
  // control would snap back to the last polled value on every frame.
  const [dragging, setDragging] = useState<number | null>(null)
  const shown = dragging ?? value
  const safeMax = max > 0 ? max : 1

  return (
    <input
      type="range"
      className={`track ${className}`}
      min={0}
      max={safeMax}
      value={Math.min(shown, safeMax)}
      disabled={disabled}
      aria-label={label}
      aria-valuetext={valueText}
      style={{ '--track-progress': `${(Math.min(shown, safeMax) / safeMax) * 100}%` } as React.CSSProperties}
      onChange={(event) => setDragging(Number(event.target.value))}
      onPointerUp={() => {
        if (dragging === null) return
        onCommit(dragging)
        setDragging(null)
      }}
      onKeyUp={() => {
        if (dragging === null) return
        onCommit(dragging)
        setDragging(null)
      }}
      onBlur={() => setDragging(null)}
    />
  )
}
