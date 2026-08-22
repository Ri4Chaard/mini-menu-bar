import { useId, type ReactNode } from 'react'
import type { Preferences, SectionId } from '@shared/types'
import { SECTIONS } from '../sections/registry'
import { Switch } from './ui/switch'

/**
 * The footer switch the design labels "Minibar".
 *
 * It is not a new capability: it is the existing menu bar preview preference
 * (feature 001, FR-026..FR-036), surfaced inline so the user can flip it
 * without opening Settings. The design's "Floating capture bar" sublabel
 * describes something else entirely and is placeholder copy - FR-080 forbids
 * shipping it.
 *
 * Which sections get one is DERIVED from registry.supportsPreview, never
 * hard-coded per section (FR-079, research.md R-114). That is what makes the
 * Settings frame's stray switch impossible to reproduce: Settings is not in
 * SECTIONS at all, and Notes has supportsPreview: false, so neither can render
 * one even by mistake.
 */
export function PreviewToggle({
  section,
  preferences,
  onUpdate
}: {
  section: SectionId | 'settings'
  preferences: Preferences
  onUpdate: (patch: Partial<Preferences>) => void
}): ReactNode {
  const definition = SECTIONS.find((s) => s.id === section)
  if (!definition?.supportsPreview) return null

  const id = section as keyof Preferences['previews']
  return <Toggle id={id} label={definition.label} preferences={preferences} onUpdate={onUpdate} />
}

function Toggle({
  id,
  label,
  preferences,
  onUpdate
}: {
  id: keyof Preferences['previews']
  label: string
  preferences: Preferences
  onUpdate: (patch: Partial<Preferences>) => void
}): ReactNode {
  const hintId = useId()
  const enabled = preferences.previews[id]

  return (
    <div style={{ gap: 'var(--footer-gap)' }} className="flex min-w-0 items-center">
      <Switch
        checked={enabled}
        label={`Show ${label} in the menu bar`}
        describedBy={hintId}
        onChange={(next) =>
          onUpdate({ previews: { ...preferences.previews, [id]: next } as Preferences['previews'] })
        }
      />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="text-[length:var(--text-body)] text-[var(--color-text)]">Menu bar</span>
        <span
          id={hintId}
          className="truncate text-[length:var(--text-micro)] text-[var(--color-text-secondary)]"
        >
          Show {label.toLowerCase()} beside the clock
        </span>
      </span>
    </div>
  )
}
