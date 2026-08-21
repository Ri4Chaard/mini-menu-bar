import { app } from 'electron'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { BridgeError } from '@shared/errors'
import type { Note } from '@shared/types'
import { createJsonStore } from '../storage/json-store'

export interface NotesService {
  list(): Promise<Note[]>
  create(): Promise<Note>
  update(id: string, content: string): Promise<Note>
  remove(id: string): Promise<void>
  /** Forces any pending write to disk. Called on panel blur (FR-027). */
  flush(): Promise<void>
  load(): Promise<void>
}

function reviveNotes(raw: unknown): Note[] {
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    const n = item as Partial<Note>
    if (typeof n.id !== 'string' || typeof n.content !== 'string') return []
    return [
      {
        id: n.id,
        content: n.content,
        createdAt: typeof n.createdAt === 'number' ? n.createdAt : Date.now(),
        updatedAt: typeof n.updatedAt === 'number' ? n.updatedAt : Date.now()
      }
    ]
  })
}

export function createNotesService(filePath?: string): NotesService {
  const path = filePath ?? join(app.getPath('userData'), 'notes.json')
  const store = createJsonStore<Note[]>(path, [], (raw) => reviveNotes(raw))
  let notes: Note[] = []
  let pending: Promise<void> | null = null

  const save = (): Promise<void> => {
    pending = store.write(notes).finally(() => {
      pending = null
    })
    return pending
  }

  return {
    async load() {
      notes = await store.read()
    },
    async list() {
      return [...notes].sort((a, b) => b.updatedAt - a.updatedAt)
    },
    async create() {
      const note: Note = {
        id: randomUUID(),
        content: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
      notes = [note, ...notes]
      await save()
      return { ...note }
    },
    async update(id, content) {
      const found = notes.find((n) => n.id === id)
      if (!found) throw new BridgeError('FILE_NOT_FOUND', 'That note no longer exists.')
      found.content = content
      found.updatedAt = Date.now()
      await save()
      return { ...found }
    },
    async remove(id) {
      notes = notes.filter((n) => n.id !== id)
      await save()
    },
    async flush() {
      if (pending) await pending
      else await save()
    }
  }
}
