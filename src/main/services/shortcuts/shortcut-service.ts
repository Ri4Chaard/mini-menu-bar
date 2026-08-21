/**
 * Global shortcut registration.
 *
 * `globalShortcut.register()` returns false when another application already
 * owns the combination. Silently ignoring that is the obvious bug here: FR-019
 * requires the shortcut to work, so a failed registration is reported back to
 * the UI (research.md R-012).
 */
import { globalShortcut } from 'electron'
import type { PreferencesService } from '../preferences/preferences-service'

export interface ShortcutService {
  /** Returns false if the accelerator is already taken. */
  rebind(accelerator: string | null): Promise<boolean>
  apply(): Promise<boolean>
  current(): string | null
  isConflicted(): boolean
  dispose(): void
}

export function createShortcutService(
  preferences: PreferencesService,
  onTrigger: () => void
): ShortcutService {
  let registered: string | null = null
  let conflicted = false

  const unregister = (): void => {
    if (registered) {
      globalShortcut.unregister(registered)
      registered = null
    }
  }

  const register = (accelerator: string | null): boolean => {
    unregister()
    if (!accelerator) {
      conflicted = false
      return true
    }
    let ok: boolean
    try {
      ok = globalShortcut.register(accelerator, onTrigger)
    } catch {
      ok = false
    }
    conflicted = !ok
    if (ok) registered = accelerator
    return ok
  }

  return {
    async apply() {
      return register(preferences.get().timerShortcut)
    },
    async rebind(accelerator) {
      const ok = register(accelerator)
      // Only persist a binding that actually took effect.
      if (ok) await preferences.update({ timerShortcut: accelerator })
      else register(preferences.get().timerShortcut)
      return ok
    },
    current: () => registered,
    isConflicted: () => conflicted,
    dispose: unregister
  }
}
