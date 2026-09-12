import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Pill } from './ui/pill'

/**
 * The four bands every section fills: header, body, divider, footer
 * (FR-044, FR-045, FR-046).
 *
 * The band heights are fixed and their arithmetic is a contract, not a
 * coincidence:
 *
 *   16 + 24 + 14 + 108 + 14 + 1 + 14 + 28 + 16 = 235
 *
 * tests/unit/design-tokens.spec.ts asserts that sum against --panel-height.
 * Overflow is the BODY's problem, never the panel's: the body clips and
 * scrolls internally so the header, divider and footer never move and the
 * panel never scrolls (FR-047, research.md R-105).
 */
export function SectionChrome({
  title,
  pill,
  action,
  children,
  footer
}: {
  title: string
  pill?: ReactNode
  /** The header's text action - "Select All". */
  action?: ReactNode
  children: ReactNode
  footer?: ReactNode
}): ReactNode {
  return (
    <div
      style={{
        padding: 'var(--content-padding-y) var(--content-padding-x)',
        gap: 'var(--content-gap)'
      }}
      className="flex min-w-0 flex-1 flex-col"
    >
      <header
        style={{ height: 'var(--band-header)' }}
        className="flex shrink-0 items-center justify-between"
      >
        <div style={{ gap: 'var(--header-gap-left)' }} className="flex min-w-0 items-center">
          <h2 className="truncate text-[length:var(--text-title)] font-semibold text-[var(--color-text)]">
            {title}
          </h2>
          {pill ? <Pill>{pill}</Pill> : null}
        </div>
        {/* The three-dot overflow control that used to sit beside the action
            was wired to nothing in every section, so feature 003 removed it
            rather than leaving a permanently disabled button (FR-117). */}
        <div style={{ gap: 'var(--header-gap-right)' }} className="flex shrink-0 items-center">
          {action}
        </div>
      </header>

      <div style={{ height: 'var(--band-body)' }} className="min-w-0 shrink-0 overflow-hidden">
        {children}
      </div>

      <hr className="shrink-0 border-0 bg-[var(--color-hairline)]" style={{ height: 1 }} />

      <footer
        style={{ height: 'var(--band-footer)' }}
        className="flex shrink-0 items-center justify-between"
      >
        {footer}
      </footer>
    </div>
  )
}

/**
 * The header's text action. Uses --color-accent-text rather than
 * --color-accent: raw accent as a 12 pt label is 3.46:1 on a light surface,
 * short of the 4.5:1 body threshold (contracts/design-tokens.md).
 */
export function HeaderAction({
  label,
  onClick,
  icon: Icon
}: {
  label: string
  onClick?: () => void
  icon?: LucideIcon
}): ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className="flex shrink-0 items-center gap-1 rounded-[var(--radius-chip)] text-[length:var(--text-body)] text-[var(--color-accent-text)] disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
    >
      {Icon ? <Icon className="size-3.5" aria-hidden /> : null}
      {label}
    </button>
  )
}

/** The left half of a footer: a muted status line. */
export function FooterNote({ children }: { children: ReactNode }): ReactNode {
  return (
    <span className="truncate text-[length:var(--text-meta)] text-[var(--color-text-secondary)]">
      {children}
    </span>
  )
}
