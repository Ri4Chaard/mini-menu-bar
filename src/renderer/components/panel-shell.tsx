import { useEffect, useRef, type ReactNode } from 'react'
import { useHost } from '../host/use-host'

/**
 * FR-002 and FR-007: focus enters the panel on open, Tab cycles within it, and
 * Escape dismisses. Escape is handled here rather than in main because the
 * renderer owns keyboard focus - main only learns the result.
 */
export function PanelShell({ children }: { children: ReactNode }): ReactNode {
  const host = useHost()
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = root.current
    if (!node) return

    const focusable = (): HTMLElement[] =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)

    // Focus enters the panel on open.
    focusable()[0]?.focus()

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        void host.closePanel()
        return
      }
      if (event.key !== 'Tab') return

      // Containment: Tab cycles within the panel rather than escaping it.
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      const current = document.activeElement

      if (event.shiftKey && current === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first.focus()
      }
    }

    node.addEventListener('keydown', onKeyDown)
    return () => node.removeEventListener('keydown', onKeyDown)
  }, [host])

  return (
    <div
      ref={root}
      // overflow-hidden is load-bearing, not cosmetic: it is what guarantees
      // FR-047: the panel itself never scrolls. A section with more content
      // than fits scrolls inside its own body band instead (R-105).
      className="flex h-full overflow-hidden rounded-[var(--radius-panel)] bg-[var(--color-surface)]"
    >
      {children}
    </div>
  )
}
