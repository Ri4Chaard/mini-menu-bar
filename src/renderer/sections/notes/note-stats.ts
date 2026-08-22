/**
 * Derived from the open note for the footer's "Edited 2m ago · 18 words"
 * (FR-072). Never stored - recomputable from Note.content at any moment, which
 * the constitution's state clause requires of derived values.
 */

const MAX_TITLE = 60

/** Split on runs of whitespace, discard empty segments. */
export function countWords(content: string): number {
  const trimmed = content.trim()
  if (trimmed === '') return 0
  return trimmed.split(/\s+/).length
}

/**
 * The list shows the note's first line. An empty note still needs a row label,
 * and a 200-character first line must not push the 186 pt list row open.
 */
export function noteTitle(content: string): string {
  const first = content.split('\n')[0]?.trim() ?? ''
  if (first === '') return 'New note'
  return first.length > MAX_TITLE ? `${first.slice(0, MAX_TITLE - 1)}…` : first
}

/** "2m", "1h", "Yest" - the compact form the design uses in the note list. */
export function shortRelative(updatedAt: number, now: number): string {
  const minutes = Math.floor((now - updatedAt) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'Yest' : `${days}d`
}

/** "Edited 2m ago · 18 words" */
export function editedSummary(updatedAt: number, content: string, now: number): string {
  const words = countWords(content)
  const minutes = Math.floor((now - updatedAt) / 60_000)
  const when =
    minutes < 1
      ? 'just now'
      : minutes < 60
        ? `${minutes}m ago`
        : `${Math.floor(minutes / 60)}h ago`
  return `Edited ${when} · ${words} ${words === 1 ? 'word' : 'words'}`
}
