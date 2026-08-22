import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Pencil, Plus, StickyNote, Trash2 } from 'lucide-react'
import type { Note, Preferences } from '@shared/types'
import { useHost } from '../../host/use-host'
import { EmptyState } from '../../components/states'
import { FooterNote, HeaderAction, SectionChrome } from '../../components/section-chrome'
import { editedSummary, noteTitle, shortRelative } from './note-stats'

const AUTOSAVE_DELAY_MS = 400

/**
 * Notes is the one content section with no menu bar preview (feature 001,
 * FR-028), so its footer carries note metadata where the others carry the
 * preview toggle. That is derived from the registry, not decided here
 * (FR-079) - PreviewToggle simply renders nothing for this section.
 */
export function NotesSection(props: {
  preferences: Preferences
  onUpdatePreferences: (patch: Partial<Preferences>) => void
}): ReactNode {
  // Props are accepted for symmetry with the other sections but unused: Notes
  // has no menu bar preview, so there is no toggle to drive (FR-079).
  void props
  const host = useHost()
  const [notes, setNotes] = useState<Note[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<{ id: string; content: string } | null>(null)

  useEffect(() => {
    void host.listNotes().then((loaded) => {
      setNotes(loaded)
      const first = loaded[0]
      if (first) {
        setActiveId(first.id)
        setDraft(first.content)
      }
    })
  }, [host])

  const flushNow = useCallback(async (): Promise<void> => {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    await host.updateNote(pending.id, pending.content).catch(() => undefined)
    await host.flushNotes().catch(() => undefined)
  }, [host])

  /**
   * FR-027: the panel dismisses on focus loss, so edits must be safe at any
   * moment. Debounced autosave covers typing; a forced flush on blur and on
   * unmount covers the dismissal itself. This is the likeliest place in the app
   * to lose user data, so both paths exist deliberately.
   */
  useEffect(() => {
    const onBlur = (): void => void flushNow()
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('blur', onBlur)
      void flushNow()
    }
  }, [flushNow])

  const edit = (content: string): void => {
    setDraft(content)
    if (!activeId) return
    pendingRef.current = { id: activeId, content }
    setNotes((prev) => prev.map((n) => (n.id === activeId ? { ...n, content } : n)))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => void flushNow(), AUTOSAVE_DELAY_MS)
  }

  const create = async (): Promise<void> => {
    await flushNow()
    const note = await host.createNote()
    setNotes((prev) => [note, ...prev])
    setActiveId(note.id)
    setDraft('')
  }

  const remove = async (id: string): Promise<void> => {
    pendingRef.current = null
    await host.deleteNote(id)
    const remaining = notes.filter((n) => n.id !== id)
    setNotes(remaining)
    const next = remaining[0] ?? null
    setActiveId(next?.id ?? null)
    setDraft(next?.content ?? '')
  }

  const now = useMemo(() => Date.now(), [notes])
  const active = notes.find((n) => n.id === activeId) ?? null

  const footer = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <Pencil className="size-3 shrink-0 text-[var(--color-text-tertiary)]" aria-hidden />
        <FooterNote>
          {active ? editedSummary(active.updatedAt, draft, now) : 'No note selected'}
        </FooterNote>
      </span>
      <FooterNote>Auto-saved</FooterNote>
    </>
  )

  return (
    <SectionChrome
      title="Notes"
      pill={notes.length}
      action={<HeaderAction label="New Note" icon={Plus} onClick={() => void create()} />}
      footer={footer}
    >
      {notes.length === 0 ? (
        <EmptyState icon={StickyNote} title="No notes yet" hint="Use New Note to add one." />
      ) : (
        <div className="flex h-full min-h-0">
          {/* Each pane scrolls inside the 108 pt band. The band never grows,
              so the panel never scrolls (FR-047, R-105). */}
          <ul className="w-[186px] shrink-0 overflow-y-auto pr-2">
            {notes.map((note) => (
              <li key={note.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    void flushNow()
                    setActiveId(note.id)
                    setDraft(note.content)
                  }}
                  className={[
                    'min-w-0 flex-1 truncate rounded-[var(--radius-chip)] px-2 py-1.5 text-left text-[length:var(--text-body)]',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)]',
                    note.id === activeId
                      ? 'bg-[var(--color-accent-faint)] text-[var(--color-text)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-fill-subtle)]'
                  ].join(' ')}
                >
                  {noteTitle(note.content)}
                </button>
                <span className="shrink-0 text-[length:var(--text-micro)] text-[var(--color-text-tertiary)]">
                  {shortRelative(note.updatedAt, now)}
                </span>
                <button
                  type="button"
                  onClick={() => void remove(note.id)}
                  aria-label={`Delete ${noteTitle(note.content)}`}
                  className="shrink-0 rounded p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-danger)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                >
                  <Trash2 className="size-3" aria-hidden />
                </button>
              </li>
            ))}
          </ul>

          <div className="w-px shrink-0 bg-[var(--color-hairline)]" />

          <textarea
            value={draft}
            onChange={(e) => edit(e.target.value)}
            onBlur={() => void flushNow()}
            placeholder="Jot something down..."
            aria-label="Note content"
            className="min-w-0 flex-1 resize-none bg-transparent pl-3 text-[length:var(--text-body)] text-[var(--color-text-secondary)] outline-none placeholder:text-[var(--color-text-tertiary)]"
          />
        </div>
      )}
    </SectionChrome>
  )
}
