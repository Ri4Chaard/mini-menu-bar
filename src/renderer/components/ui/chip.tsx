import type { ReactNode } from 'react'

/**
 * The small rounded control the design repeats across sections: timer presets,
 * shortcut keys, and the header count pill's larger sibling.
 *
 * Measured: 6/12 padding, radius 9 (contracts/design-tokens.md).
 */
export function Chip({
  children,
  active = false,
  onClick,
  disabled = false,
  label
}: {
  children: ReactNode
  active?: boolean
  onClick?: () => void
  disabled?: boolean
  label?: string
}): ReactNode {
  const base =
    'flex shrink-0 items-center rounded-[var(--radius-chip)] px-[var(--chip-padding-x)] py-[var(--chip-padding-y)] text-[length:var(--text-control)] font-medium'
  const tone = active
    ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent-text)] ring-1 ring-[var(--color-accent-border)] ring-inset'
    : 'bg-[var(--color-fill)] text-[var(--color-text-secondary)]'

  // A static chip (a shortcut key) is not a button. Rendering it as one would
  // put it in the tab order and announce it as actionable to a screen reader.
  if (!onClick) {
    return (
      <span
        className={`${base} ${active ? tone : 'bg-[var(--color-fill-strong)] text-[var(--color-text-strong)]'}`}
      >
        {children}
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      className={`${base} ${tone} transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-fill-strong)] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]`}
    >
      {children}
    </button>
  )
}
