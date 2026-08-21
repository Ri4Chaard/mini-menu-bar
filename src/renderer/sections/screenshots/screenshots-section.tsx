import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Camera } from 'lucide-react'
import type { ScreenshotEntry, SourceError } from '@shared/types'
import { useHost } from '../../host/use-host'
import { Banner, EmptyState, ErrorState } from '../../components/states'
import { ScreenshotCard } from './screenshot-card'

/**
 * The collection is owned by App (the sidebar badge needs it too) and passed in,
 * which is also what preserves scroll position when a screenshot arrives while
 * the panel is open - this component never re-fetches or remounts the list.
 */
export function ScreenshotsSection({ entries }: { entries: ScreenshotEntry[] }): ReactNode {
  const host = useHost()
  const [sourceError, setSourceError] = useState<SourceError | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // FR-013: opening the section resets the unseen count.
  useEffect(() => {
    void host.markScreenshotsSeen()
    void host.getScreenshotSourceError().then(setSourceError).catch(() => setSourceError(null))
  }, [host])

  const act = useCallback(
    async (id: string, run: (id: string) => Promise<void>): Promise<void> => {
      setActionError(null)
      try {
        await run(id)
      } catch (error) {
        // Spec edge case: a file deleted outside the app must surface a message,
        // not fail silently. The entry is reconciled away by the main process.
        const message = error instanceof Error ? error.message : String(error)
        setActionError(message)
      }
    },
    []
  )

  const onOpen = useCallback((id: string) => void act(id, host.openScreenshot), [act, host])
  const onReveal = useCallback((id: string) => void act(id, host.revealScreenshot), [act, host])

  if (sourceError) {
    return <ErrorState title="Can't read your screenshots" detail={sourceError.message} />
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Camera}
        title="No screenshots yet"
        hint="Press Shift-Command-4 and they'll show up here."
      />
    )
  }

  return (
    <div>
      {actionError ? <Banner>{actionError}</Banner> : null}
      <ul className="grid grid-cols-2 gap-2 p-3">
        {entries.map((entry) => (
          <ScreenshotCard key={entry.id} entry={entry} onOpen={onOpen} onReveal={onReveal} />
        ))}
      </ul>
    </div>
  )
}
