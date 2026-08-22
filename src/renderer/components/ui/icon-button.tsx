import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type IconButtonTone = 'plain' | 'fill' | 'accent' | 'danger'

const TONES: Record<IconButtonTone, string> = {
  plain: 'text-[var(--color-text-secondary)] hover:bg-[var(--color-fill)]',
  fill: 'bg-[var(--color-fill)] text-[var(--color-text-secondary)] hover:bg-[var(--color-fill-strong)]',
  // Icon-only, so --color-accent is correct here: white on it clears the 3:1
  // icon threshold. A labelled accent button uses --color-accent-strong.
  accent: 'bg-[var(--color-accent)] text-[var(--color-on-accent)]',
  danger: 'bg-[var(--color-danger-subtle)] text-[var(--color-danger)]'
}

/**
 * Every icon-only control in the panel.
 *
 * `label` is required by the type, not optional-with-a-default: FR-048 and
 * SC-004 need each of these to announce a name, and an icon-only button with no
 * accessible name is the single easiest a11y regression to ship.
 */
export function IconButton({
  icon: Icon,
  label,
  onClick,
  size = 24,
  iconSize = 14,
  tone = 'fill',
  disabled = false,
  pressed
}: {
  icon: LucideIcon
  label: string
  onClick?: () => void
  size?: number
  iconSize?: number
  tone?: IconButtonTone
  disabled?: boolean
  pressed?: boolean
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={pressed}
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-[var(--radius-control)] transition-colors duration-[var(--duration-fast)] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${TONES[tone]}`}
    >
      <Icon style={{ width: iconSize, height: iconSize }} aria-hidden />
    </button>
  )
}
