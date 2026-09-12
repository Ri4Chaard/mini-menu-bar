import { Camera, Timer, Settings, type LucideIcon } from 'lucide-react'
import type { SectionId } from '@shared/types'

export interface SectionDefinition {
  id: SectionId | 'settings'
  label: string
  icon: LucideIcon
  /**
   * Encoding this here means the settings UI derives its toggle list rather
   * than hard-coding one, so the two can never drift apart. Both surviving
   * sections are previewable; the flag is retained because Settings is not,
   * and because the next non-previewable section must not require a rewrite.
   */
  supportsPreview: boolean
}

export const SECTIONS: readonly SectionDefinition[] = [
  { id: 'screenshots', label: 'Screenshots', icon: Camera, supportsPreview: true },
  { id: 'timer', label: 'Timer', icon: Timer, supportsPreview: true }
]

export const SETTINGS_SECTION: SectionDefinition = {
  id: 'settings',
  label: 'Settings',
  icon: Settings,
  supportsPreview: false
}

export const PREVIEWABLE_SECTIONS = SECTIONS.filter((s) => s.supportsPreview)
