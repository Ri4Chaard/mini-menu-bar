import { useEffect, useState, type ReactNode } from 'react'
import { Check, Download, Power, RefreshCw } from 'lucide-react'
import { DEFAULT_PREFERENCES, type Preferences, type UpdateCheckResult } from '@shared/types'
import { useHost } from '../../host/use-host'
import { FooterNote, HeaderAction, SectionChrome } from '../../components/section-chrome'
import { Chip } from '../../components/ui/chip'
import { IconButton } from '../../components/ui/icon-button'
import { PREVIEWABLE_SECTIONS } from '../registry'

type PreviewKey = keyof Preferences['previews']

/**
 * What the footer is currently saying about updates.
 *
 * Neither the version nor the releases URL appears in this file any more. The
 * version is read from the running application (FR-124) and the address lives
 * in the main process (FR-126) - the previous constants were a written-down
 * version that drifted from package.json by construction, and a URL naming a
 * repository that did not exist.
 */
type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'done'; result: UpdateCheckResult }
  | { kind: 'error'; message: string }

/**
 * FR-030: preview toggles are configured inside the panel, not in a separate
 * preferences window.
 *
 * The toggle list is derived from the section registry's `supportsPreview`
 * flag, so FR-028 (no Notes preview) holds by construction rather than by a
 * hard-coded list that could drift.
 *
 * Note what is NOT here: a menu bar preview switch in the footer. Settings is
 * not itself a previewable section, so it does not get one. The Settings
 * Widget v2 frame draws one in error (FR-076, FR-079).
 */
export function SettingsSection({
  preferences,
  onUpdatePreferences
}: {
  preferences: Preferences
  onUpdatePreferences: (patch: Partial<Preferences>) => void
}): ReactNode {
  const host = useHost()
  const [shortcut, setShortcut] = useState(preferences.timerShortcut ?? '')
  const [shortcutError, setShortcutError] = useState<string | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const [check, setCheck] = useState<CheckState>({ kind: 'idle' })

  useEffect(() => {
    setShortcut(preferences.timerShortcut ?? '')
  }, [preferences.timerShortcut])

  useEffect(() => {
    let cancelled = false
    void host.getAppVersion().then((value) => {
      if (!cancelled) setVersion(value)
    })
    return () => {
      cancelled = true
    }
  }, [host])

  const runCheck = async (): Promise<void> => {
    setCheck({ kind: 'checking' })
    try {
      setCheck({ kind: 'done', result: await host.checkForUpdates() })
    } catch {
      // The host normalises every network failure to one code, and the footer
      // has one failure state, so the message does not vary by cause.
      setCheck({ kind: 'error', message: "Couldn't check" })
    }
  }

  const togglePreview = (key: PreviewKey, next: boolean): void => {
    // FR-031: spread the current flags and change exactly one. Sending a bare
    // { [key]: next } would blank the other two.
    onUpdatePreferences({ previews: { ...preferences.previews, [key]: next } })
  }

  const applyShortcut = async (): Promise<void> => {
    setShortcutError(null)
    const value = shortcut.trim() || null
    const ok = await host.setTimerShortcut(value)
    // R-012: a registration failure must be visible, not a silent no-op.
    if (!ok) setShortcutError('That shortcut is already used by another app. Try a different one.')
  }

  const resetDefaults = (): void => {
    onUpdatePreferences(DEFAULT_PREFERENCES)
    void host.setTimerShortcut(DEFAULT_PREFERENCES.timerShortcut)
  }

  const label = version ? `v${version.replace(/^v/, '')}` : '\u2026'
  const updateAvailable = check.kind === 'done' && check.result.status === 'update-available'

  /**
   * One row, always. `--band-footer` is a fixed height and the band arithmetic
   * is asserted in tests/unit/design-tokens.spec.ts, so the status rides in the
   * existing note rather than adding a line.
   */
  const note =
    check.kind === 'checking'
      ? `${label} \u00b7 Checking\u2026`
      : check.kind === 'error'
        ? `${label} \u00b7 ${check.message}`
        : updateAvailable && check.kind === 'done'
          ? `${label} \u2192 v${check.result.latestVersion.replace(/^v/, '')} available`
          : check.kind === 'done'
            ? `${label} \u00b7 Up to date`
            : label

  const footer = (
    <>
      <FooterNote>
        <span role={check.kind === 'error' ? 'alert' : undefined}>{note}</span>
      </FooterNote>
      <div style={{ gap: 'var(--footer-gap)' }} className="flex items-center">
        {/* The download is still a hand-off to the browser (R-113's surviving
            half); only the check itself moved in-app. This button never holds
            the URL - main resolves it (FR-126). */}
        <button
          type="button"
          onClick={() => (updateAvailable ? void host.openReleasesPage() : void runCheck())}
          disabled={check.kind === 'checking'}
          aria-busy={check.kind === 'checking'}
          className="flex items-center gap-1.5 rounded-[var(--radius-chip)] bg-[var(--color-fill-strong)] px-2 py-1 text-[length:var(--text-control)] text-[var(--color-text)] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
        >
          {updateAvailable ? (
            <Download className="size-3.5" aria-hidden />
          ) : (
            <RefreshCw className="size-3.5" aria-hidden />
          )}
          {updateAvailable ? 'Download' : check.kind === 'error' ? 'Retry' : 'Check for updates'}
        </button>
        <IconButton
          icon={Power}
          label="Quit Mini Menu Bar"
          tone="danger"
          onClick={() => void host.quitApp()}
        />
      </div>
    </>
  )

  return (
    <SectionChrome
      title="Settings"
      pill="General"
      action={<HeaderAction label="Reset Defaults" onClick={resetDefaults} />}
      footer={footer}
    >
      <div className="flex h-full min-h-0 gap-4">
        <section className="flex w-[230px] shrink-0 flex-col gap-1.5 overflow-y-auto">
          <h3 className="text-[length:var(--text-micro)] tracking-wide text-[var(--color-text-tertiary)] uppercase">
            Show in menu bar
          </h3>
          <ul className="flex flex-col gap-1">
            {PREVIEWABLE_SECTIONS.map((section) => {
              const key = section.id as PreviewKey
              const Icon = section.icon
              const enabled = preferences.previews[key]
              return (
                <li key={section.id}>
                  {/* A real checkbox inside a real label: clicking the label
                      toggles it, `.checked` reflects state, and screen readers
                      get native semantics. A role="checkbox" button would be a
                      re-implementation of all three. */}
                  <label className="flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-chip)] px-1 py-0.5 hover:bg-[var(--color-fill-subtle)] has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-[var(--color-accent)]">
                    <input
                      type="checkbox"
                      checked={enabled}
                      onChange={(event) => togglePreview(key, event.target.checked)}
                      className="peer sr-only"
                    />
                    <span
                      aria-hidden
                      className={`flex size-[17px] shrink-0 items-center justify-center rounded-[5px] ${
                        enabled
                          ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                          : 'bg-[var(--color-fill)] text-transparent'
                      }`}
                    >
                      <Check className="size-2.5" />
                    </span>
                    <Icon
                      className={`size-3.5 shrink-0 ${
                        enabled
                          ? 'text-[var(--color-text-secondary)]'
                          : 'text-[var(--color-text-tertiary)]'
                      }`}
                      aria-hidden
                    />
                    <span
                      className={`truncate text-[length:var(--text-body)] ${
                        enabled ? 'text-[var(--color-text)]' : 'text-[var(--color-text-secondary)]'
                      }`}
                    >
                      {section.label}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </section>

        <div className="w-px shrink-0 bg-[var(--color-hairline)]" />

        <section className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h3 className="text-[length:var(--text-micro)] tracking-wide text-[var(--color-text-tertiary)] uppercase">
            Timer shortcut
          </h3>
          <div className="flex items-center gap-2">
            {/* The field IS the recorder: click it, press the combination.
                A raw text box beside the chips would show the same shortcut
                twice and leave the chips purely decorative. */}
            <button
              type="button"
              aria-label="Record timer shortcut"
              onKeyDown={(event) => {
                // Tab must still move focus, and Escape must still dismiss the
                // panel - PanelShell owns both, and swallowing either here
                // would break Principle III inside one field.
                if (event.key === 'Tab' || event.key === 'Escape') return
                event.preventDefault()
                const parts: string[] = []
                if (event.ctrlKey) parts.push('Control')
                if (event.altKey) parts.push('Option')
                if (event.shiftKey) parts.push('Shift')
                if (event.metaKey) parts.push('Command')
                // Modifiers alone are not a shortcut - wait for the real key.
                if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return
                parts.push(event.key.length === 1 ? event.key.toUpperCase() : event.key)
                setShortcut(parts.join('+'))
                setShortcutError(null)
              }}
              className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 rounded-[var(--radius-control)] bg-[var(--color-fill-subtle)] px-2 py-1.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-accent)]"
            >
              {(shortcut ? shortcut.split('+') : ['Press keys…']).map((key, index) => (
                <Chip key={`${key}-${index}`}>{key}</Chip>
              ))}
            </button>
            <button
              type="button"
              onClick={() => void applyShortcut()}
              // Carries a text label, so --color-accent-strong: white on the
              // measured accent is 3.46:1 (contracts/design-tokens.md).
              className="shrink-0 rounded-[var(--radius-control)] bg-[var(--color-accent-strong)] px-3 py-2 text-[length:var(--text-body)] text-[var(--color-on-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
            >
              Apply
            </button>
          </div>

          {shortcutError ? (
            <p role="alert" className="text-[length:var(--text-micro)] text-[var(--color-danger)]">
              {shortcutError}
            </p>
          ) : (
            /* Off by default: an automatic outbound request has to be the
               user's choice, not a default they find out about later
               (FR-126, R-405). */
            <label className="flex w-fit cursor-pointer items-center gap-2 rounded-[var(--radius-chip)] px-1 py-0.5 hover:bg-[var(--color-fill-subtle)] has-focus-visible:outline has-focus-visible:outline-2 has-focus-visible:outline-[var(--color-accent)]">
              <input
                type="checkbox"
                checked={preferences.updateCheckOnLaunch}
                onChange={(event) => onUpdatePreferences({ updateCheckOnLaunch: event.target.checked })}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={`flex size-[17px] shrink-0 items-center justify-center rounded-[5px] ${
                  preferences.updateCheckOnLaunch
                    ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                    : 'bg-[var(--color-fill)] text-transparent'
                }`}
              >
                <Check className="size-2.5" />
              </span>
              <span className="text-[length:var(--text-micro)] text-[var(--color-text-secondary)]">
                Check for updates at launch
              </span>
            </label>
          )}
        </section>
      </div>
    </SectionChrome>
  )
}
