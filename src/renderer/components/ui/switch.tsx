import type { ReactNode } from 'react'

/**
 * Measured: 34x20 track, 16 knob, radius 10.
 *
 * `role="switch"` on a real <button> rather than a styled checkbox: it gets
 * Space and Enter, focus, and an on/off announcement for free, and there is no
 * form here for a checkbox to belong to.
 */
export function Switch({
  checked,
  onChange,
  label,
  describedBy
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  describedBy?: string
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      style={{ width: 'var(--switch-w)', height: 'var(--switch-h)' }}
      className={`relative shrink-0 rounded-full transition-colors duration-[var(--duration-base)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
        checked ? 'bg-[var(--color-accent)]' : 'bg-[var(--color-fill-strong)]'
      }`}
    >
      <span
        aria-hidden
        style={{
          width: 'var(--switch-knob)',
          height: 'var(--switch-knob)',
          // Both axes in one declaration: an inline `transform` replaces the
          // utility class outright, so a -translate-y-1/2 class here would be
          // silently dropped and the knob would sit at the track's top edge.
          transform: checked
            ? 'translate(calc(var(--switch-w) - var(--switch-knob) - 2px), -50%)'
            : 'translate(2px, -50%)'
        }}
        className="absolute top-1/2 left-0 rounded-full bg-[var(--color-on-accent)] transition-transform duration-[var(--duration-base)]"
      />
    </button>
  )
}
