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

function reviveSection(value: unknown): SectionId {
  // An unknown value falls back rather than rendering an empty panel.
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
    previews: {
      screenshots: reviveBoolean(previews.screenshots, DEFAULT_PREFERENCES.previews.screenshots),
      timer: reviveBoolean(previews.timer, DEFAULT_PREFERENCES.previews.timer),
      spotify: reviveBoolean(previews.spotify, DEFAULT_PREFERENCES.previews.spotify)
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
    screenshotsSeenWatermark: reviveNumber(r.screenshotsSeenWatermark, 0)
  }
}

/**
 * Merge a partial patch into the current preferences.
 *
 * FR-031 requires the three preview flags to be strictly independent: writing
 * one MUST NOT read or alter another. That is why `previews` is merged
 * key-by-key rather than replaced wholesale — a convenient
 * `{...current.previews, ...patch.previews}` would still be correct here, but a
 * wholesale assignment would silently blank the other two flags.
 */
export function mergePreferences(current: Preferences, patch: Partial<Preferences>): Preferences {
  const next: Preferences = {
    ...current,
    ...patch,
    previews: {
      screenshots: patch.previews?.screenshots ?? current.previews.screenshots,
      timer: patch.previews?.timer ?? current.previews.timer,
      spotify: patch.previews?.spotify ?? current.previews.spotify
    }
  }
  // Presets are normalised on every write, never rejected - a bad list is
  // repaired rather than making preferences unwritable (data-model.md).
  next.timerPresets = normalisePresets(next.timerPresets)

  // The watermark only ever moves forward (data-model.md).
  next.screenshotsSeenWatermark = Math.max(
    current.screenshotsSeenWatermark,
    patch.screenshotsSeenWatermark ?? 0
  )
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
