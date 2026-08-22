import { useRef, type ReactNode } from 'react'
import { SECTIONS, SETTINGS_SECTION, type SectionDefinition } from '../sections/registry'

export type ActiveSection = SectionDefinition['id']

/**
 * The 64 pt icon rail (FR-042, FR-043).
 *
 * Replaces the v1 labelled sidebar. Labels move from visible text to accessible
 * names: the design has no room for them, but FR-048 and SC-004 still require
 * every icon-only control to announce one.
 *
 * The `navigation`/"Sections" role and the per-item accessible names are kept
 * identical to v1 on purpose - they are the contract the e2e suite addresses
 * the panel through, and changing them would break coverage that has nothing
 * to do with this redesign.
 */
export function Rail({
  active,
  onSelect,
  unseenCount
}: {
  active: ActiveSection
  onSelect: (id: ActiveSection) => void
  unseenCount: number
}): ReactNode {
  const items = [...SECTIONS, SETTINGS_SECTION]
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (event: React.KeyboardEvent, index: number): void => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const delta = event.key === 'ArrowDown' ? 1 : -1
    const nextIndex = (index + delta + items.length) % items.length
    const next = items[nextIndex]
    if (!next) return
    onSelect(next.id)
    // Focus has to FOLLOW the selection. Leaving it on the original button
    // meant a second arrow press moved relative to where the user started
    // rather than where they now are - so ArrowDown then ArrowUp landed two
    // items away instead of back where it began.
    buttons.current[nextIndex]?.focus()
  }

  return (
    <nav
      aria-label="Sections"
      style={{
        width: 'var(--rail-width)',
        padding: 'var(--rail-padding)',
        gap: 'var(--rail-gap)'
      }}
      className="flex shrink-0 flex-col items-center border-r border-[var(--color-rail-border)] bg-[var(--color-rail)]"
    >
      {items.map((section, index) => {
        const Icon = section.icon
        const isActive = section.id === active
        const showBadge = section.id === 'screenshots' && unseenCount > 0

        return (
          <button
            key={section.id}
            ref={(node) => {
              buttons.current[index] = node
            }}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            aria-label={section.label}
            title={section.label}
            onClick={() => onSelect(section.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
            style={{ width: 'var(--rail-item)', height: 'var(--rail-item)' }}
            className={[
              'relative flex items-center justify-center rounded-[var(--radius-control)]',
              'transition-colors duration-[var(--duration-fast)]',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]',
              isActive
                ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-fill)]'
            ].join(' ')}
          >
            <Icon style={{ width: 'var(--rail-icon)', height: 'var(--rail-icon)' }} aria-hidden />
            {showBadge ? (
              <span
                aria-label={`${unseenCount} new`}
                className="absolute top-1 right-1 size-2 rounded-full bg-[var(--color-accent)]"
              />
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}
