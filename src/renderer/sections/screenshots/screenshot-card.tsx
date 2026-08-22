import { Check, Download } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ScreenshotEntry } from '@shared/types'

/** "2m ago", "14m ago", "1h ago", "Yesterday" — the design's time chip. */
export function relativeTime(capturedAt: number, now: number): string {
  const minutes = Math.floor((now - capturedAt) / 60_000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'Yesterday' : `${days}d ago`
}

/**
 * What the corner chip says.
 *
 * A staged capture is labelled rather than styled differently: it is a normal
 * screenshot in every respect except that it will disappear on its own, and the
 * only honest way to show that is to say so. Exported so the wording is covered
 * without rendering.
 */
export function timeChipLabel(entry: ScreenshotEntry, now: number): string {
  const elapsed = relativeTime(entry.capturedAt, now)
  return entry.isTemporary ? `Unsaved · ${elapsed}` : elapsed
}

/**
 * One thumbnail in the strip: 124x88 image, a corner selection badge, a
 * relative-time chip, and a 124x13 meta row beneath (FR-055, FR-056).
 */
export function ScreenshotCard({
  entry,
  selected,
  now,
  onToggle,
  onOpen,
  onReveal,
  onDragStart
}: {
  entry: ScreenshotEntry
  selected: boolean
  now: number
  onToggle: (id: string) => void
  onOpen: (id: string) => void
  onReveal: (id: string) => void
  onDragStart: (event: React.DragEvent, id: string) => void
}): ReactNode {
  return (
    <li className="flex shrink-0 flex-col gap-[7px]" style={{ width: 'var(--thumb-w)' }}>
      {/* Draggable on the frame, not on the image: the drag source is the
          nearest draggable ancestor of whatever was pressed, so picking the
          frame up works from the thumbnail, the badge and the chip alike. The
          image itself stays undraggable so it cannot start a second, competing
          drag of its own bitmap. */}
      <div
        draggable
        onDragStart={(event) => onDragStart(event, entry.id)}
        className="relative overflow-hidden rounded-[var(--radius-control)] bg-[var(--color-fill)]"
        style={{ width: 'var(--thumb-w)', height: 'var(--thumb-h)' }}
      >
        <button
          type="button"
          onClick={() => onOpen(entry.id)}
          aria-label={`Open ${entry.fileName}`}
          className="block size-full focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)]"
        >
          {entry.thumbnailDataUrl ? (
            <img
              src={entry.thumbnailDataUrl}
              alt=""
              className="size-full object-cover"
              draggable={false}
            />
          ) : null}
        </button>

        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          aria-label={`Select ${entry.fileName}`}
          onClick={() => onToggle(entry.id)}
          className={`absolute top-1.5 left-1.5 flex size-5 items-center justify-center rounded-full transition-colors duration-[var(--duration-fast)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)] ${
            selected
              ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
              : 'bg-[var(--color-scrim)] text-transparent'
          }`}
        >
          <Check className="size-3" aria-hidden />
        </button>

        <span className="absolute right-1.5 bottom-1.5 rounded-[var(--radius-chip)] bg-[var(--color-scrim)] px-1.5 py-0.5 text-[length:var(--text-micro)] text-[var(--color-on-accent)]">
          {timeChipLabel(entry, now)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-1">
        <span
          className="truncate text-[length:var(--text-caption)] text-[var(--color-text-secondary)]"
          title={entry.fileName}
        >
          {entry.fileName}
        </span>
        <button
          type="button"
          onClick={() => onReveal(entry.id)}
          aria-label={`Reveal ${entry.fileName} in Finder`}
          className="shrink-0 text-[var(--color-text-tertiary)] hover:text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
        >
          <Download className="size-3.5" aria-hidden />
        </button>
      </div>
    </li>
  )
}
