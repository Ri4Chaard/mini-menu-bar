import { useEffect, useState, type ReactNode } from 'react'
import type { Preferences } from '@shared/types'
import { useHost } from '../../host/use-host'
import { PREVIEWABLE_SECTIONS } from '../registry'

type PreviewKey = keyof Preferences['previews']

/**
 * FR-030: preview toggles are configured inside the panel, not in a separate
 * preferences window.
 *
 * The toggle list is derived from the section registry's `supportsPreview`
 * flag, so FR-028 (no Notes preview) holds by construction rather than by a
 * hard-coded list that could drift.
 */
export function SettingsSection({
  preferences,
  onUpdate
}: {
  preferences: Preferences
  onUpdate: (patch: Partial<Preferences>) => Promise<void>
}): ReactNode {
  const host = useHost()
  const [shortcut, setShortcut] = useState(preferences.timerShortcut ?? '')
  const [shortcutError, setShortcutError] = useState<string | null>(null)

  useEffect(() => {
    setShortcut(preferences.timerShortcut ?? '')
  }, [preferences.timerShortcut])

  const togglePreview = async (key: PreviewKey, next: boolean): Promise<void> => {
    // FR-031: spread the current flags and change exactly one. Sending a bare
    // { [key]: next } would blank the other two.
    await onUpdate({ previews: { ...preferences.previews, [key]: next } })
  }

  const applyShortcut = async (): Promise<void> => {
    setShortcutError(null)
    const value = shortcut.trim() || null
    const ok = await host.setTimerShortcut(value)
    // R-012: a registration failure must be visible, not a silent no-op.
    if (!ok) setShortcutError('That shortcut is already used by another app. Try a different one.')
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <section>
        <h2 className="mb-1.5 font-medium">Show in menu bar</h2>
        <ul className="flex flex-col gap-1">
          {PREVIEWABLE_SECTIONS.map((section) => {
            const key = section.id as PreviewKey
            const Icon = section.icon
            return (
              <li key={section.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-card)] px-1.5 py-1 hover:bg-[color:var(--color-surface-hover)]">
                  <input
                    type="checkbox"
                    checked={preferences.previews[key]}
                    onChange={(e) => void togglePreview(key, e.target.checked)}
                    className="accent-[color:var(--color-accent)]"
                  />
                  <Icon className="size-4" aria-hidden />
                  <span>{section.label}</span>
                </label>
              </li>
            )
          })}
        </ul>
        <p className="mt-1 text-[color:var(--color-text-muted)]">
          Each one is independent. Notes has no menu bar preview.
        </p>
      </section>

      <section>
        <h2 className="mb-1.5 font-medium">Timer shortcut</h2>
        <div className="flex gap-1.5">
          <input
            type="text"
            value={shortcut}
            onChange={(e) => setShortcut(e.target.value)}
            placeholder="Control+Option+T"
            aria-label="Timer start and pause shortcut"
            className="min-w-0 flex-1 rounded-[var(--radius-card)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-raised)] px-2 py-1 outline-none focus-visible:outline focus-visible:outline-2"
          />
          <button
            type="button"
            onClick={() => void applyShortcut()}
            className="rounded-[var(--radius-card)] border border-[color:var(--color-border)] px-2 py-1 hover:bg-[color:var(--color-surface-hover)] focus-visible:outline focus-visible:outline-2"
          >
            Apply
          </button>
        </div>
        {shortcutError ? (
          <p role="alert" className="mt-1 text-[color:var(--color-danger)]">
            {shortcutError}
          </p>
        ) : null}
      </section>

      {!host.supportsNativeFeatures() ? (
        <p className="text-[color:var(--color-text-muted)]">
          Running in a browser: menu bar previews and global shortcuts are simulated.
        </p>
      ) : null}
    </div>
  )
}
