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
  /** One id copies the image itself; several copy file references (R-107). */
  copyScreenshots(ids: string[]): Promise<void>
  /** Moves to the Trash, never unlink - deletion stays recoverable (R-108). */
  deleteScreenshots(ids: string[]): Promise<void>
  /**
   * Hand these files to the OS drag session, so they can be dropped into
   * another application as real files.
   *
   * The renderer has no paths and must not have any, so it cancels its own
   * HTML5 drag and delegates. Call this from a `dragstart` handler: macOS only
   * starts a drag while a mouse button is genuinely down, so it does nothing
   * useful anywhere else.
   */
  startScreenshotDrag(ids: string[]): Promise<void>

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
  /** Integer 0-100. Callers commit on release, not per pointer-move (R-117). */
  setVolume(volume: number): Promise<void>
  setShuffle(shuffling: boolean): Promise<void>
  /**
   * A toggle, NOT a three-state cycle: Spotify's `repeating` property is a
   * boolean and the off/all/one cycle in its own UI is not scriptable
   * (research.md R-109, FR-068 as amended).
   */
  setRepeat(repeating: boolean): Promise<void>

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

  // ---- App (FR-076) --------------------------------------------------------
  /** Never resolves in the host: the process exits (research.md R-113). */
  quitApp(): Promise<void>

  // ---- Environment ---------------------------------------------------------
  getEnvironment(): 'electron' | 'browser'
  supportsNativeFeatures(): boolean
}
