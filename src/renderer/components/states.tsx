import type { ReactNode } from 'react'
import { AlertTriangle, type LucideIcon } from 'lucide-react'

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
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <Icon className="size-7 opacity-40" aria-hidden />
      <p className="font-medium">{title}</p>
      {hint ? <p className="text-[color:var(--color-text-muted)]">{hint}</p> : null}
    </div>
  )
}

/**
 * FR-015 / FR-025: an unavailable source explains the problem rather than
 * rendering an empty list, and controls never look functional when they aren't.
 */
export function ErrorState({ title, detail }: { title: string; detail?: string }): ReactNode {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
      <AlertTriangle className="size-7 text-[color:var(--color-danger)]" aria-hidden />
      <p className="font-medium">{title}</p>
      {detail ? <p className="text-[color:var(--color-text-muted)]">{detail}</p> : null}
    </div>
  )
}

export function Banner({ children }: { children: ReactNode }): ReactNode {
  return (
    <div
      role="status"
      className="mx-3 mt-2 rounded-[var(--radius-card)] border border-[color:var(--color-danger)] px-3 py-2 text-[color:var(--color-danger)]"
    >
      {children}
    </div>
  )
}
