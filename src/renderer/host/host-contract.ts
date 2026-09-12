/**
 * The ONLY interface between the renderer and the Electron host.
 *
 * Constitution Principle II. Two implementations — host-bridge.ts (real) and
 * host-mock.ts (browser) — satisfy this contract and are exercised by one
 * shared test suite. A method added here without a mock implementation is an
 * incomplete change. See contracts/host-bridge.md.
 */
import type {
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
  onScreenshotsChanged(cb: (entries: ScreenshotEntry[]) => void): Unsubscribe
  getScreenshotSourceError(): Promise<SourceError | null>
  /** Moves to the Trash, never unlink - deletion stays recoverable (R-108). */
  deleteScreenshots(ids: string[]): Promise<void>
  /**
   * Hand these files to the OS drag session, so they can be dropped into
   * another application as real files.
   *
   * Since Copy was removed (FR-096) this is the ONLY route from the panel into
   * another application, which is why it is retained unchanged (FR-103).
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
  /**
   * Silence the finish alarm without touching the countdown.
   *
   * Separate from reset on purpose: with repeat on, the next cycle is already
   * running by the time the user reaches for Dismiss, and silencing it should
   * not throw that countdown away.
   */
  dismissTimerAlarm(): Promise<TimerState>
  onTimerStateChanged(cb: (state: TimerState) => void): Unsubscribe

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
