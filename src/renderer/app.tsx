import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { DEFAULT_PREFERENCES, type Preferences, type ScreenshotEntry } from '@shared/types'
import { useHost } from './host/use-host'
import { PanelShell } from './components/panel-shell'
import { Rail, type ActiveSection } from './components/rail'
import { m, useFadeIn } from './motion'
import { ScreenshotsSection } from './sections/screenshots/screenshots-section'
import { TimerSection } from './sections/timer/timer-section'
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

  /**
   * Bring the Timer section forward when the alarm starts.
   *
   * Main opens the panel when the countdown finishes, but it cannot choose the
   * section - that is renderer state. Without this the panel would appear on
   * whatever was last open, leaving Dismiss one click away at the moment it is
   * most wanted.
   *
   * This costs nothing at idle: onTimerStateChanged only attaches an event
   * listener, unlike a subscription that asks main to start emitting, so the
   * Principle V "no periodic work when nothing is running" budget is untouched.
   */
  useEffect(() => {
    return host.onTimerStateChanged((state) => {
      if (state.alarming) setActive('timer')
    })
  }, [host])

  // The rail's count badge is needed regardless of which section is open, so
  // the collection is owned here rather than inside the section.
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

  // The total, matching the menu bar badge: viewing no longer changes it (FR-112).
  const screenshotCount = screenshots.length

  // Preferences are held here rather than inside Settings so the footer toggle
  // and the Settings checkbox read one lifted value. Flipping the switch in a
  // section footer re-renders the Settings checkbox with no extra wiring
  // (FR-078, research.md R-114).
  const shared = { preferences: prefs, onUpdatePreferences: updatePrefs }

  return (
    <PanelShell>
      <Rail active={active} onSelect={select} screenshotCount={screenshotCount} />
      {/* Only the body content cross-fades. The rail and the band structure
          stay fixed - animating them would read as the whole panel redrawing
          (FR-046, R-115). */}
      <m.main key={active} {...fade} className="flex min-w-0 flex-1 flex-col">
        {active === 'screenshots' ? <ScreenshotsSection entries={screenshots} {...shared} /> : null}
        {active === 'timer' ? <TimerSection {...shared} /> : null}
        {active === 'settings' ? <SettingsSection {...shared} /> : null}
      </m.main>
    </PanelShell>
  )
}
