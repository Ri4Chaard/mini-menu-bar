import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_PREFERENCES, type Preferences, type ScreenshotEntry } from '@shared/types'
import { useHost } from './host/use-host'
import { PanelShell } from './components/panel-shell'
import { Sidebar, type ActiveSection } from './components/sidebar'
import { m, useFadeIn } from './motion'
import { ScreenshotsSection } from './sections/screenshots/screenshots-section'
import { TimerSection } from './sections/timer/timer-section'
import { SpotifySection } from './sections/spotify/spotify-section'
import { NotesSection } from './sections/notes/notes-section'
import { SettingsSection } from './sections/settings/settings-section'

export function App(): ReactNode {
  const host = useHost()
  const [prefs, setPrefs] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [active, setActive] = useState<ActiveSection>(DEFAULT_PREFERENCES.lastSection)
  const [screenshots, setScreenshots] = useState<ScreenshotEntry[]>([])
  const fade = useFadeIn()

  // FR-006: reopen on the last selected section.
  useEffect(() => {
    let cancelled = false
    void host.getPreferences().then((loaded) => {
      if (cancelled) return
      setPrefs(loaded)
      setActive(loaded.lastSection)
    })
    return () => {
      cancelled = true
    }
  }, [host])

  // The unseen badge is needed by the sidebar regardless of which section is
  // open, so the collection is owned here rather than inside the section.
  useEffect(() => {
    void host.listScreenshots().then(setScreenshots).catch(() => setScreenshots([]))
    return host.onScreenshotsChanged(setScreenshots)
  }, [host])

  const select = useCallback(
    (id: ActiveSection): void => {
      setActive(id)
      if (id !== 'settings') void host.updatePreferences({ lastSection: id }).then(setPrefs)
    },
    [host]
  )

  const updatePrefs = useCallback(
    async (patch: Partial<Preferences>): Promise<void> => {
      setPrefs(await host.updatePreferences(patch))
    },
    [host]
  )

  const unseenCount = screenshots.filter((s) => !s.isSeen).length

  return (
    <PanelShell>
      <Sidebar active={active} onSelect={select} unseenCount={unseenCount} />
      <m.main key={active} {...fade} className="min-w-0 flex-1 overflow-y-auto">
        {active === 'screenshots' ? <ScreenshotsSection entries={screenshots} /> : null}
        {active === 'timer' ? <TimerSection /> : null}
        {active === 'spotify' ? <SpotifySection /> : null}
        {active === 'notes' ? <NotesSection /> : null}
        {active === 'settings' ? (
          <SettingsSection preferences={prefs} onUpdate={updatePrefs} />
        ) : null}
      </m.main>
    </PanelShell>
  )
}
