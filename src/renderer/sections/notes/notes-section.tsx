import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Plus, StickyNote, Trash2 } from 'lucide-react'
import type { Note } from '@shared/types'
import { useHost } from '../../host/use-host'
import { EmptyState } from '../../components/states'

const AUTOSAVE_DELAY_MS = 400

export function NotesSection(): ReactNode {
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[color:var(--color-border)] px-3 py-1.5">
        <span className="text-[color:var(--color-text-muted)]">Notes</span>
        <button
          type="button"
          onClick={() => void create()}
          aria-label="New note"
          className="rounded p-1 hover:bg-[color:var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2"
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>

      {notes.length === 0 ? (
        <EmptyState icon={StickyNote} title="No notes yet" hint="Use the plus button to add one." />
      ) : (
        <div className="flex min-h-0 flex-1">
          <ul className="w-[120px] shrink-0 overflow-y-auto border-r border-[color:var(--color-border)]">
            {notes.map((note) => (
              <li key={note.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    void flushNow()
                    setActiveId(note.id)
                    setDraft(note.content)
                  }}
                  className={[
                    'min-w-0 flex-1 truncate px-2 py-1.5 text-left focus-visible:outline focus-visible:outline-2',
                    note.id === activeId ? 'bg-[color:var(--color-surface-hover)]' : ''
                  ].join(' ')}
                >
                  {note.content.split('\n')[0]?.trim() || 'Untitled'}
                </button>
                <button
                  type="button"
                  onClick={() => void remove(note.id)}
                  aria-label="Delete note"
                  className="mr-1 rounded p-1 hover:bg-[color:var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <textarea
            value={draft}
            onChange={(e) => edit(e.target.value)}
            onBlur={() => void flushNow()}
            placeholder="Jot something down..."
            aria-label="Note content"
            className="min-w-0 flex-1 resize-none bg-transparent p-3 outline-none"
          />
        </div>
      )}
    </div>
  )
}
