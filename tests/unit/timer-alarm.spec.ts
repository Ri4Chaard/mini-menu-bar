/**
 * FR-088 and FR-090. The bell governs the AUDIO only, and the audio does not
 * stop on its own.
 *
 * The notification and the alarm are separate on purpose, and these cases pin
 * that down: the visual is always shown, the sound is not, the two never play
 * over each other, and the ring keeps going until something silences it.
 * Electron and afplay are both mocked, so this runs without a window server and
 * without making a noise.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { existsSync } from 'node:fs'
import { platform } from 'node:process'

const show = vi.fn()
const on = vi.fn()
const kill = vi.fn()
/**
 * Stands in for the ChildProcess afplay would return. Typed through the
 * generic rather than by naming parameters the stub does not use, so
 * `mock.calls` still knows the shape of what was passed.
 */
const execFile = vi.fn<(command: string, args: string[], onExit: () => void) => { kill: typeof kill }>(
  () => ({ kill })
)

vi.mock('electron', () => ({
  Notification: Object.assign(
    class {
      constructor(public readonly options: unknown) {}
      show = show
      on = on
    },
    { isSupported: () => true }
  )
}))

vi.mock('node:child_process', () => ({
  execFile: (command: string, args: string[], onExit: () => void) => execFile(command, args, onExit)
}))

const {
  createNotificationService,
  ALARM_SOUND_PATH,
  ALARM_SOUND_CANDIDATES,
  ALARM_VOLUME,
  resolveAlarmSound
} = await import(
  '../../src/main/services/notifications/notification-service'
)

/** Simulate afplay exiting, which is what schedules the next ring. */
function endCurrentRing(): void {
  const done = execFile.mock.calls.at(-1)?.[2]
  done?.()
  vi.advanceTimersByTime(2000)
}

beforeEach(() => {
  vi.useFakeTimers()
  show.mockClear()
  on.mockClear()
  kill.mockClear()
  execFile.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('timerFinished', () => {
  it('starts ringing and reports that it did', () => {
    const service = createNotificationService()
    expect(service.timerFinished({ alarm: true })).toBe(true)
    expect(service.alarming()).toBe(true)
    expect(execFile.mock.calls[0]?.[1]).toEqual(['-v', ALARM_VOLUME, ALARM_SOUND_PATH])
  })

  it('plays louder than the file at its own level', () => {
    // The system sounds are mastered for notifications; at 1.0 this one is easy
    // to miss from the next room, which is the whole complaint this answers.
    expect(Number(ALARM_VOLUME)).toBeGreaterThan(1)
  })

  it('keeps ringing rather than stopping after a fixed number of plays', () => {
    const service = createNotificationService()
    service.timerFinished({ alarm: true })
    for (let i = 0; i < 20; i += 1) endCurrentRing()
    expect(execFile.mock.calls.length).toBeGreaterThan(20)
    expect(service.alarming()).toBe(true)
  })

  it('shows the notification but makes no sound when the bell is off', () => {
    const service = createNotificationService()
    expect(service.timerFinished({ alarm: false })).toBe(false)
    expect(show).toHaveBeenCalledTimes(1)
    expect(execFile).not.toHaveBeenCalled()
    expect(service.alarming()).toBe(false)
  })

  it('alarms by default, so a caller that says nothing is still audible', () => {
    createNotificationService().timerFinished()
    expect(execFile).toHaveBeenCalledTimes(1)
  })

  it('never lets the notification carry sound of its own', () => {
    // Otherwise the notification chime plays over the alert sound, and the
    // bell toggle silences only half of what the user hears.
    createNotificationService().timerFinished({ alarm: false })
    const options = (show.mock.instances[0] as { options: { silent: boolean } }).options
    expect(options.silent).toBe(true)
  })

  it('does not stack a second alarm over one still ringing', () => {
    // Reachable with repeat on: the next cycle finishes before anyone dismissed
    // the last one. One alarm, not two overlapping.
    const service = createNotificationService()
    service.timerFinished({ alarm: true })
    service.timerFinished({ alarm: true })
    expect(execFile).toHaveBeenCalledTimes(1)
  })

  it('offers the notification itself as a way to silence it', () => {
    // With the panel closed, the notification is the only thing on screen.
    createNotificationService().timerFinished({ alarm: true })
    expect(on).toHaveBeenCalledWith('click', expect.any(Function))
  })
})

describe('stopAlarm', () => {
  it('silences a ringing alarm and stops it coming back', () => {
    const service = createNotificationService()
    service.timerFinished({ alarm: true })
    service.stopAlarm()
    expect(service.alarming()).toBe(false)

    const before = execFile.mock.calls.length
    endCurrentRing()
    expect(execFile.mock.calls.length).toBe(before)
  })

  it('kills the ring in progress rather than letting it finish', () => {
    // Up to a couple of seconds of noise after pressing Dismiss reads as the
    // button not having worked.
    const service = createNotificationService()
    service.timerFinished({ alarm: true })
    service.stopAlarm()
    expect(kill).toHaveBeenCalledTimes(1)
  })

  it('is safe to call when nothing is ringing', () => {
    const service = createNotificationService()
    expect(() => service.stopAlarm()).not.toThrow()
    expect(kill).not.toHaveBeenCalled()
  })

  it('lets a later finish ring again', () => {
    const service = createNotificationService()
    service.timerFinished({ alarm: true })
    service.stopAlarm()
    const before = execFile.mock.calls.length
    service.timerFinished({ alarm: true })
    expect(execFile.mock.calls.length).toBe(before + 1)
    expect(service.alarming()).toBe(true)
  })
})

describe('the alarm sound', () => {
  it.runIf(platform === 'darwin')('exists on this machine', () => {
    // A missing file would fail silently: afplay exits non-zero, the chain
    // continues, and the timer ends in total silence with nothing to show why.
    expect(existsSync(ALARM_SOUND_PATH)).toBe(true)
  })

  it('prefers the first candidate that exists', () => {
    const exists = (p: string): boolean => p === ALARM_SOUND_CANDIDATES[1]
    expect(resolveAlarmSound(ALARM_SOUND_CANDIDATES, exists)).toBe(ALARM_SOUND_CANDIDATES[1])
  })

  /**
   * The whole reason this is a chain. ToneLibrary is a PRIVATE framework, so
   * those paths can move or vanish in a macOS update; the last candidate is in
   * public /System/Library/Sounds and is the floor.
   */
  it('falls back to the public system sound when no candidate exists', () => {
    const last = ALARM_SOUND_CANDIDATES[ALARM_SOUND_CANDIDATES.length - 1]!
    expect(resolveAlarmSound(ALARM_SOUND_CANDIDATES, () => false)).toBe(last)
    expect(last.startsWith('/System/Library/Sounds/')).toBe(true)
  })

  it.runIf(platform === 'darwin')('the floor of the chain is always present', () => {
    const last = ALARM_SOUND_CANDIDATES[ALARM_SOUND_CANDIDATES.length - 1]!
    expect(existsSync(last)).toBe(true)
  })

  it('is played quietly enough that a soft tone stays soft', () => {
    // Raised volume is a multiplier on the file. The alert tones are mastered
    // louder than /System/Library/Sounds, so the old 4x made them harsh.
    expect(Number(ALARM_VOLUME)).toBeLessThanOrEqual(3)
  })
})
