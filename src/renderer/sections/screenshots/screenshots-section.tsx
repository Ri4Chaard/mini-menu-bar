import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Camera, Copy, Trash2 } from 'lucide-react'
import type { Preferences, ScreenshotEntry, SourceError } from '@shared/types'
import { useHost } from '../../host/use-host'
import { Banner, EmptyState, ErrorState } from '../../components/states'
import { FooterNote, HeaderAction, SectionChrome } from '../../components/section-chrome'
import { PreviewToggle } from '../../components/preview-toggle'
import { IconButton } from '../../components/ui/icon-button'
import { ScreenshotCard } from './screenshot-card'
import { dragIdsFor, reconcileSelection } from './selection'

/**
 * The collection is owned by App (the rail badge needs it too) and passed in,
 * which is also what preserves scroll position when a screenshot arrives while
 * the panel is open - this component never re-fetches or remounts the list.
 */
export function ScreenshotsSection({
  entries,
  preferences,
  onUpdatePreferences
}: {
  entries: ScreenshotEntry[]
  preferences: Preferences
  onUpdatePreferences: (patch: Partial<Preferences>) => void
}): ReactNode {
  const host = useHost()
  const [sourceError, setSourceError] = useState<SourceError | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())

  // Rendered once per mount rather than per tick: the strip shows relative
  // times, and re-deriving `now` on every render would make every unrelated
  // state change reformat every chip.
  const now = useMemo(() => Date.now(), [entries])

  // FR-013: opening the section resets the unseen count.
  useEffect(() => {
    void host.markScreenshotsSeen()
    void host.getScreenshotSourceError().then(setSourceError).catch(() => setSourceError(null))
  }, [host])

  // R-106: a file deleted outside the app must leave the selection, or the
  // footer count outlives the file it counted.
  useEffect(() => {
    setSelected((current) => reconcileSelection(current, entries))
  }, [entries])

  const toggle = useCallback((id: string) => {
    setSelected((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }, [])

  const act = useCallback(async (run: () => Promise<void>): Promise<void> => {
    setActionError(null)
    try {
      await run()
    } catch (error) {
      // Spec edge case: a file deleted outside the app must surface a message,
      // not fail silently. The entry is reconciled away by the main process.
      setActionError(error instanceof Error ? error.message : String(error))
    }
  }, [])

  const onOpen = useCallback((id: string) => void act(() => host.openScreenshot(id)), [act, host])
  const onReveal = useCallback(
    (id: string) => void act(() => host.revealScreenshot(id)),
    [act, host]
  )

  /**
   * Dragging a thumbnail out drops the real files into whatever is underneath -
   * a message, a mail draft, a Finder window.
   *
   * The renderer has no paths and must not have any, so in the host it cancels
   * its own HTML5 drag and lets main start a native one from the same gesture.
   * In browser mode there are no files to hand over, so the built-in image drag
   * is left to run instead: the strip still behaves like a drag source in
   * `dev:browser`, which is what makes the interaction reviewable there
   * (Principle I).
   */
  const onDragStart = useCallback(
    (event: React.DragEvent, id: string) => {
      const ids = dragIdsFor(id, selected)
      if (host.supportsNativeFeatures()) event.preventDefault()
      else event.dataTransfer.setData('text/plain', id)
      void act(() => host.startScreenshotDrag(ids))
    },
    [act, host, selected]
  )

  const ids = [...selected]
  const allSelected = entries.length > 0 && selected.size === entries.length

  const footer = (
    <>
      <PreviewToggle
        section="screenshots"
        preferences={preferences}
        onUpdate={onUpdatePreferences}
      />
      <div style={{ gap: 'var(--footer-gap)' }} className="flex items-center">
        <FooterNote>
          {selected.size > 0 ? `${selected.size} selected` : 'Nothing selected'}
        </FooterNote>
        <IconButton
          icon={Copy}
          label="Copy selected screenshots"
          tone="fill"
          disabled={selected.size === 0}
          onClick={() => void act(() => host.copyScreenshots(ids))}
        />
        <IconButton
          icon={Trash2}
          label="Delete selected screenshots"
          tone="danger"
          disabled={selected.size === 0}
          onClick={() =>
            void act(async () => {
              await host.deleteScreenshots(ids)
              setSelected(new Set())
            })
          }
        />
      </div>
    </>
  )

  return (
    <SectionChrome
      title="Screenshots"
      pill={entries.length}
      action={
        entries.length > 0 ? (
          <HeaderAction
            label={allSelected ? 'Clear' : 'Select All'}
            onClick={() =>
              setSelected(allSelected ? new Set() : new Set(entries.map((e) => e.id)))
            }
          />
        ) : undefined
      }
      footer={footer}
    >
      {sourceError ? (
        <ErrorState title="Can't read your screenshots" detail={sourceError.message} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={Camera}
          title="No screenshots yet"
          hint="Press Shift-Command-4 and they'll show up here."
        />
      ) : (
        <div className="flex h-full flex-col gap-1">
          {actionError ? <Banner>{actionError}</Banner> : null}
          {/* Exactly four fit (4x124 + 3x12 = 532). Beyond that the STRIP
              scrolls horizontally - never the panel (FR-047, R-105). */}
          <ul
            style={{ gap: 'var(--thumb-gap)' }}
            className="flex min-h-0 flex-1 overflow-x-auto overflow-y-hidden"
          >
            {entries.map((entry) => (
              <ScreenshotCard
                key={entry.id}
                entry={entry}
                now={now}
                selected={selected.has(entry.id)}
                onToggle={toggle}
                onOpen={onOpen}
                onReveal={onReveal}
                onDragStart={onDragStart}
              />
            ))}
          </ul>
        </div>
      )}
    </SectionChrome>
  )
}
