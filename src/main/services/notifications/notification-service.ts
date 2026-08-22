/**
 * What happens when the countdown reaches zero.
 *
 * Two channels, deliberately separate: the notification is the VISUAL and is
 * always shown; the alarm is the AUDIO and is governed by the bell toggle
 * (FR-088). Letting the notification carry the sound as well would make the
 * toggle depend on whether the user has notifications enabled for this app -
 * a timer that silently fails to alarm is worse than one that never could.
 *
 * The alarm rings until it is dismissed (FR-090). There is no time limit: an
 * alarm that gives up while you are out of the room is not an alarm. Three
 * things stop it - the panel's Dismiss button, clicking the notification, and
 * starting or resetting the timer - so it can always be silenced from wherever
 * the user happens to be looking.
 */
import { execFile, type ChildProcess } from 'node:child_process'
import { Notification } from 'electron'

/**
 * macOS does not ship the Clock app's own timer tone as a playable asset - it
 * is not in /System/Library/Sounds, Clock.app's Resources, ClockUIFramework or
 * /System/Library/Audio/UISounds. This is the nearest system alert sound with
 * an alarm's character, and it is present on every macOS install.
 */
export const ALARM_SOUND_PATH = '/System/Library/Sounds/Submarine.aiff'

/**
 * afplay's volume is a multiplier on the file, not a system volume, so this
 * makes the alarm carry without touching what the user has set for everything
 * else. The system sounds are mastered quietly for notification use; at 1.0
 * this one is easy to miss from the next room.
 */
export const ALARM_VOLUME = '4'

/** Silence between rings, so it reads as an alarm rather than a stuck file. */
export const ALARM_GAP_MS = 900

export interface NotificationService {
  /** Shows the notification. Returns true if an alarm is now ringing. */
  timerFinished(options?: { alarm?: boolean }): boolean
  /** Silence the alarm. Safe to call when nothing is ringing. */
  stopAlarm(): void
  alarming(): boolean
  supported(): boolean
}

export function createNotificationService(): NotificationService {
  let alarming = false
  let child: ChildProcess | null = null
  let gap: ReturnType<typeof setTimeout> | null = null

  const ring = (): void => {
    // Chained on exit rather than on a fixed schedule: the gap then sits after
    // the sound whatever its length, instead of overlapping the tail of the
    // previous ring on a longer file.
    child = execFile('afplay', ['-v', ALARM_VOLUME, ALARM_SOUND_PATH], () => {
      child = null
      if (!alarming) return
      gap = setTimeout(() => {
        gap = null
        if (alarming) ring()
      }, ALARM_GAP_MS)
      if (typeof gap.unref === 'function') gap.unref()
    })
  }

  const stopAlarm = (): void => {
    alarming = false
    if (gap !== null) {
      clearTimeout(gap)
      gap = null
    }
    if (child !== null) {
      // Kill mid-play. Waiting for the current ring to finish would leave up to
      // a couple of seconds of noise after the user pressed Dismiss, which
      // reads as the button not having worked.
      child.kill()
      child = null
    }
  }

  return {
    supported: () => Notification.isSupported(),
    alarming: () => alarming,
    stopAlarm,

    timerFinished(options) {
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: 'Timer finished',
          body: 'Your countdown has reached zero.',
          // Silent on purpose: the alarm below owns the audio, and the two
          // together would play the notification chime over the alert sound.
          silent: true
        })
        // A second way to silence it, for when the panel is closed - otherwise
        // the only route to Dismiss is through the tray.
        notification.on('click', stopAlarm)
        notification.show()
      }

      if (options?.alarm === false) return false
      // Already ringing: reachable with repeat on, where the next cycle can
      // finish before the alarm has been dismissed. One alarm, not two.
      if (alarming) return true

      alarming = true
      ring()
      return true
    }
  }
}
