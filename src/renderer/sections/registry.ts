import { Camera, Timer, Music, StickyNote, Settings, type LucideIcon } from 'lucide-react'
import type { SectionId } from '@shared/types'

export interface SectionDefinition {
  id: SectionId | 'settings'
  label: string
  icon: LucideIcon
  /**
   * FR-028: Notes has no menu bar preview. Encoding it here means the settings
   * UI derives its toggle list rather than hard-coding one, so the two can
   * never drift apart.
   */
  supportsPreview: boolean
}

export const SECTIONS: readonly SectionDefinition[] = [
  { id: 'screenshots', label: 'Screenshots', icon: Camera, supportsPreview: true },
  { id: 'timer', label: 'Timer', icon: Timer, supportsPreview: true },
  { id: 'spotify', label: 'Spotify', icon: Music, supportsPreview: true },
  { id: 'notes', label: 'Notes', icon: StickyNote, supportsPreview: false }
]

export const SETTINGS_SECTION: SectionDefinition = {
  id: 'settings',
  label: 'Settings',
  icon: Settings,
  supportsPreview: false
}

export const PREVIEWABLE_SECTIONS = SECTIONS.filter((s) => s.supportsPreview)
