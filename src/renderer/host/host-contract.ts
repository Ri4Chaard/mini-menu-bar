/**
 * The ONLY interface between the renderer and the Electron host.
 *
 * Constitution Principle II. Two implementations — host-bridge.ts (real) and
 * host-mock.ts (browser) — satisfy this contract and are exercised by one
 * shared test suite. A method added here without a mock implementation is an
 * incomplete change. See contracts/host-bridge.md.
 */
import type {
  Note,
  PlaybackState,
  Preferences,
  ScreenshotEntry,
  SourceError,
  TimerState
} from '@shared/types'

export type Unsubscribe = () => void

export interface HostBridge {
  // ---- Screenshots (FR-009..FR-015) ----------------------------------------
  listScreenshots(): Promise<ScreenshotEntry[]>
  openScreenshot(id: string): Promise<void>
  revealScreenshot(id: string): Promise<void>
  markScreenshotsSeen(): Promise<void>
  onScreenshotsChanged(cb: (entries: ScreenshotEntry[]) => void): Unsubscribe
  getScreenshotSourceError(): Promise<SourceError | null>

  // ---- Timer (FR-016..FR-020) ----------------------------------------------
  getTimerState(): Promise<TimerState>
  startTimer(durationMs: number): Promise<TimerState>
  pauseTimer(): Promise<TimerState>
  resumeTimer(): Promise<TimerState>
  resetTimer(): Promise<TimerState>
  onTimerStateChanged(cb: (state: TimerState) => void): Unsubscribe

  // ---- Spotify (FR-021..FR-025) --------------------------------------------
  getPlaybackState(): Promise<PlaybackState>
  togglePlayPause(): Promise<void>
  nextTrack(): Promise<void>
  previousTrack(): Promise<void>
  seekTo(positionMs: number): Promise<void>
  onPlaybackStateChanged(cb: (state: PlaybackState) => void): Unsubscribe

  // ---- Notes (FR-026..FR-027) ----------------------------------------------
  listNotes(): Promise<Note[]>
  createNote(): Promise<Note>
  updateNote(id: string, content: string): Promise<Note>
  deleteNote(id: string): Promise<void>
  flushNotes(): Promise<void>

  // ---- Preferences & previews (FR-006, FR-029..FR-036) ---------------------
  getPreferences(): Promise<Preferences>
  updatePreferences(patch: Partial<Preferences>): Promise<Preferences>
  setTimerShortcut(accelerator: string | null): Promise<boolean>

  // ---- Panel (FR-002) ------------------------------------------------------
  closePanel(): Promise<void>
  onPanelShown(cb: () => void): Unsubscribe

  // ---- Environment ---------------------------------------------------------
  getEnvironment(): 'electron' | 'browser'
  supportsNativeFeatures(): boolean
}
