import type { ReactNode } from 'react'
import { SECTIONS, SETTINGS_SECTION, type SectionDefinition } from '../sections/registry'

export type ActiveSection = SectionDefinition['id']

/**
 * FR-005: selecting a section switches the content area in a single
 * interaction. FR-007: reachable and operable by keyboard - arrow keys move
 * between sections, matching platform list behaviour.
 */
export function Sidebar({
  active,
  onSelect,
  unseenCount
}: {
  active: ActiveSection
  onSelect: (id: ActiveSection) => void
  unseenCount: number
}): ReactNode {
  const items = [...SECTIONS, SETTINGS_SECTION]

  const onKeyDown = (event: React.KeyboardEvent, index: number): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const delta = event.key === 'ArrowDown' ? 1 : -1
    const next = items[(index + delta + items.length) % items.length]
    if (next) onSelect(next.id)
  }

  return (
    <nav
      aria-label="Sections"
      className="flex w-[124px] shrink-0 flex-col gap-0.5 border-r border-[color:var(--color-border)] p-2"
    >
      {items.map((section, index) => {
        const Icon = section.icon
        const isActive = section.id === active
        const showBadge = section.id === 'screenshots' && unseenCount > 0
        return (
          <button
            key={section.id}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelect(section.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={[
              'flex items-center gap-2 rounded-[var(--radius-card)] px-2 py-1.5 text-left',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)]',
              isActive
                ? 'bg-[color:var(--color-accent)] text-[color:var(--color-accent-text)]'
                : 'hover:bg-[color:var(--color-surface-hover)]'
            ].join(' ')}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{section.label}</span>
            {showBadge ? (
              <span
                aria-label={`${unseenCount} new`}
                className="ml-auto rounded-full bg-[color:var(--color-danger)] px-1.5 text-[10px] text-white"
              >
                {unseenCount}
              </span>
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}
