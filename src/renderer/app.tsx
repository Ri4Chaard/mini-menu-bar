import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_PREFERENCES, type Preferences, type ScreenshotEntry } from '@shared/types'
import { useHost } from './host/use-host'
import { PanelShell } from './components/panel-shell'
import { Rail, type ActiveSection } from './components/rail'
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

  // The unseen badge is needed by the rail regardless of which section is
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
    (patch: Partial<Preferences>): void => {
      void host.updatePreferences(patch).then(setPrefs)
    },
    [host]
  )

  const unseenCount = screenshots.filter((s) => !s.isSeen).length

  // Preferences are held here rather than inside Settings so the footer toggle
  // and the Settings checkbox read one lifted value. Flipping the switch in the
  // Spotify footer re-renders the Settings checkbox with no extra wiring
  // (FR-078, research.md R-114).
  const shared = { preferences: prefs, onUpdatePreferences: updatePrefs }

  return (
    <PanelShell>
      <Rail active={active} onSelect={select} unseenCount={unseenCount} />
      {/* Only the body content cross-fades. The rail and the band structure
          stay fixed - animating them would read as the whole panel redrawing
          (FR-046, R-115). */}
      <m.main key={active} {...fade} className="flex min-w-0 flex-1 flex-col">
        {active === 'screenshots' ? <ScreenshotsSection entries={screenshots} {...shared} /> : null}
        {active === 'timer' ? <TimerSection {...shared} /> : null}
        {active === 'spotify' ? <SpotifySection {...shared} /> : null}
        {active === 'notes' ? <NotesSection {...shared} /> : null}
        {active === 'settings' ? <SettingsSection {...shared} /> : null}
      </m.main>
    </PanelShell>
  )
}
