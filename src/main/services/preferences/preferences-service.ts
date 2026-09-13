/**
 * Preferences is the hub of the data model: the only entity that both persists
 * and fans out into every other part of the app. Its write path is therefore
 * the highest-value place for tests (data-model.md).
 */
import { app } from 'electron'
import { join } from 'node:path'
import { createJsonStore, type JsonStore } from '../storage/json-store'
import {
  DEFAULT_PREFERENCES,
  SECTION_IDS,
  type Preferences,
  type SectionId
} from '@shared/types'
import { normalisePresets } from './normalise-presets'

/**
 * An unknown value falls back rather than rendering an empty panel.
 *
 * This is also the migration path for feature 003: a file written before
 * Spotify and Notes were removed names a section that no longer exists, and
 * every such file resolves here rather than needing a version stamp
 * (research.md R-209). Deliberately not special-cased to those two names — the
 * general rule already covers them and will cover the next removal too.
 */
function reviveSection(value: unknown): SectionId {
  return SECTION_IDS.includes(value as SectionId) ? (value as SectionId) : DEFAULT_PREFERENCES.lastSection
}

function reviveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function reviveBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function revivePreferences(raw: unknown): Preferences {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const previews = (typeof r.previews === 'object' && r.previews !== null ? r.previews : {}) as Record<string, unknown>
  return {
    // Only the surviving keys are read. A stored `previews.spotify` is dropped
    // by omission rather than deleted explicitly, so it never reaches the
    // renderer and is not written back (R-209).
    previews: {
      screenshots: reviveBoolean(previews.screenshots, DEFAULT_PREFERENCES.previews.screenshots),
      timer: reviveBoolean(previews.timer, DEFAULT_PREFERENCES.previews.timer)
    },
    lastSection: reviveSection(r.lastSection),
    timerDurationMs: Math.max(1, reviveNumber(r.timerDurationMs, DEFAULT_PREFERENCES.timerDurationMs)),
    // Repaired on READ as well as write: the array on disk is user data now
    // (FR-063) and a malformed one must not make preferences unloadable.
    timerPresets: normalisePresets(r.timerPresets as number[] | undefined),
    timerShortcut:
      r.timerShortcut === null || typeof r.timerShortcut === 'string'
        ? (r.timerShortcut as string | null)
        : DEFAULT_PREFERENCES.timerShortcut,
    timerAlarm: reviveBoolean(r.timerAlarm, DEFAULT_PREFERENCES.timerAlarm),
    timerRepeat: reviveBoolean(r.timerRepeat, DEFAULT_PREFERENCES.timerRepeat),
    // Absent from any file written before feature 004, and the typed fallback
    // is the whole migration: it reads as false, which is the default anyway.
    updateCheckOnLaunch: reviveBoolean(
      r.updateCheckOnLaunch,
      DEFAULT_PREFERENCES.updateCheckOnLaunch
    )
  }
}

/**
 * Merge a partial patch into the current preferences.
 *
 * FR-031 requires the preview flags to be strictly independent: writing one
 * MUST NOT read or alter another. That is why `previews` is merged key-by-key
 * rather than replaced wholesale — a convenient
 * `{...current.previews, ...patch.previews}` would still be correct here, but a
 * wholesale assignment would silently blank the other flag.
 */
export function mergePreferences(current: Preferences, patch: Partial<Preferences>): Preferences {
  const next: Preferences = {
    ...current,
    ...patch,
    previews: {
      screenshots: patch.previews?.screenshots ?? current.previews.screenshots,
      timer: patch.previews?.timer ?? current.previews.timer
    }
  }
  // Presets are normalised on every write, never rejected - a bad list is
  // repaired rather than making preferences unwritable (data-model.md).
  next.timerPresets = normalisePresets(next.timerPresets)

  // Reviving on the way out is what guarantees a removed field can never be
  // written back, however it arrived in the patch (R-209).
  return revivePreferences(next)
}

export interface PreferencesService {
  get(): Preferences
  load(): Promise<Preferences>
  update(patch: Partial<Preferences>): Promise<Preferences>
  onChange(cb: (prefs: Preferences) => void): () => void
}

export function createPreferencesService(filePath?: string): PreferencesService {
  const path = filePath ?? join(app.getPath('userData'), 'preferences.json')
  const store: JsonStore<Preferences> = createJsonStore(path, DEFAULT_PREFERENCES, (raw) =>
    revivePreferences(raw)
  )
  let current: Preferences = DEFAULT_PREFERENCES
  const listeners = new Set<(prefs: Preferences) => void>()

  return {
    get: () => current,

    async load() {
      current = await store.read()
      return current
    },

    async update(patch) {
      current = mergePreferences(current, patch)
      await store.write(current)
      for (const cb of listeners) cb(current)
      return current
    },

    onChange(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    }
  }
}
