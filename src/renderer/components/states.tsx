import type { ReactNode } from 'react'
import { AlertTriangle, type LucideIcon } from 'lucide-react'

/**
 * Empty and error states live INSIDE the 108 pt body band, not in place of the
 * section. The header, divider and footer stay put whatever the body has to
 * say (FR-044, spec edge cases).
 */
export function EmptyState({
  icon: Icon,
  title,
  hint
}: {
  icon: LucideIcon
  title: string
  hint?: string
}): ReactNode {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
      <Icon className="size-6 text-[var(--color-text-tertiary)]" aria-hidden />
      <p className="text-[length:var(--text-body)] font-medium text-[var(--color-text)]">{title}</p>
      {hint ? (
        <p className="text-[length:var(--text-micro)] text-[var(--color-text-secondary)]">{hint}</p>
      ) : null}
    </div>
  )
}

/**
 * FR-015 / FR-025: an unavailable source explains the problem rather than
 * rendering an empty list, and controls never look functional when they aren't.
 */
export function ErrorState({ title, detail }: { title: string; detail?: string }): ReactNode {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
      <AlertTriangle className="size-6 text-[var(--color-danger)]" aria-hidden />
      <p className="text-[length:var(--text-body)] font-medium text-[var(--color-text)]">{title}</p>
      {detail ? (
        <p className="line-clamp-2 text-[length:var(--text-micro)] text-[var(--color-text-secondary)]">
          {detail}
        </p>
      ) : null}
    </div>
  )
}

export function Banner({ children }: { children: ReactNode }): ReactNode {
  return (
    <div
      role="status"
      className="shrink-0 truncate rounded-[var(--radius-chip)] bg-[var(--color-danger-subtle)] px-2 py-1 text-[length:var(--text-micro)] text-[var(--color-danger)]"
    >
      {children}
    </div>
  )
}
