import type { ReactNode } from 'react'

/**
 * The status pill beside every section title: a count, a mode, or a state
 * word ("12", "Focus", "Playing", "General").
 */
export function Pill({ children }: { children: ReactNode }): ReactNode {
  return (
    <span className="flex shrink-0 items-center rounded-full bg-[var(--color-fill-strong)] px-1.5 py-0.5 text-[length:var(--text-meta)] leading-none text-[var(--color-text-secondary)]">
      {children}
    </span>
  )
}
