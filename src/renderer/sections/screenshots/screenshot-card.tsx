import type { ReactNode } from 'react'
import { ExternalLink, FolderOpen } from 'lucide-react'
import type { ScreenshotEntry } from '@shared/types'

function relativeTime(epochMs: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - epochMs) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

/** FR-011, FR-012: open in the default viewer, or reveal in Finder. */
export function ScreenshotCard({
  entry,
  onOpen,
  onReveal
}: {
  entry: ScreenshotEntry
  onOpen: (id: string) => void
  onReveal: (id: string) => void
}): ReactNode {
  return (
    <li className="group relative overflow-hidden rounded-[var(--radius-card)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)]">
      <button
        type="button"
        onClick={() => onOpen(entry.id)}
        title={`Open ${entry.fileName}`}
        className="block w-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)]"
      >
        {entry.thumbnailDataUrl ? (
          <img
            src={entry.thumbnailDataUrl}
            alt={entry.fileName}
            /* Aspect-ratio-correct display: an unusual capture must not break layout. */
            className="aspect-[16/10] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[16/10] w-full items-center justify-center text-[color:var(--color-text-muted)]">
            No preview
          </div>
        )}
      </button>

      {!entry.isSeen ? (
        <span
          aria-label="New"
          className="absolute left-1.5 top-1.5 size-2 rounded-full bg-[color:var(--color-accent)]"
        />
      ) : null}

      <div className="flex items-center gap-1 px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate" title={entry.fileName}>
          {entry.fileName}
        </span>
        <span className="shrink-0 text-[color:var(--color-text-muted)]">
          {relativeTime(entry.capturedAt)}
        </span>
        <button
          type="button"
          onClick={() => onOpen(entry.id)}
          aria-label={`Open ${entry.fileName}`}
          className="rounded p-1 hover:bg-[color:var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)]"
        >
          <ExternalLink className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          onClick={() => onReveal(entry.id)}
          aria-label={`Reveal ${entry.fileName} in Finder`}
          className="rounded p-1 hover:bg-[color:var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[color:var(--color-accent)]"
        >
          <FolderOpen className="size-3.5" aria-hidden />
        </button>
      </div>
    </li>
  )
}
