/**
 * Global shortcut registration.
 *
 * `globalShortcut.register()` returns false when another application already
 * owns the combination. Silently ignoring that is the obvious bug here: FR-019
 * requires the shortcut to work, so a failed registration is reported back to
 * the UI (research.md R-012).
 *
 * One instance manages one binding. The service is parameterised by which
 * preference holds its accelerator rather than hard-coding `timerShortcut`,
 * because feature 004 added a second binding - the one that opens the panel -
 * and two copies of this logic differing only in a property name is how the
 * two drift apart.
 */
import { globalShortcut } from 'electron'
import type { Preferences } from '@shared/types'
import type { PreferencesService } from '../preferences/preferences-service'

/** The preference keys that hold an accelerator. */
export type ShortcutKey = {
  [K in keyof Preferences]: Preferences[K] extends string | null ? K : never
}[keyof Preferences]

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
  key: ShortcutKey,
  onTrigger: () => void
): ShortcutService {
  let registered: string | null = null
  let conflicted = false

  const stored = (): string | null => (preferences.get()[key] as string | null) ?? null

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
      return register(stored())
    },
    async rebind(accelerator) {
      const ok = register(accelerator)
      // Only persist a binding that actually took effect.
      if (ok) await preferences.update({ [key]: accelerator } as Partial<Preferences>)
      else register(stored())
      return ok
    },
    current: () => registered,
    isConflicted: () => conflicted,
    dispose: unregister
  }
}
