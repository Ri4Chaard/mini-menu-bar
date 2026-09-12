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
import { existsSync } from 'node:fs'
import { Notification } from 'electron'

/**
 * Candidate alarm sounds, most wanted first.
 *
 * The request was for something like Apple's "Radius". Radius is not available:
 * it was an iOS 7 alert tone that Apple has since retired, and it is present
 * nowhere on macOS. What macOS DOES carry is the rest of that same iOS 7 alert
 * family, in ToneLibrary - so the nearest thing to Radius is one of its actual
 * siblings rather than an imitation. Circles is the closest in character: soft,
 * warm, gently ascending, and 2.4 s, which suits a tone that repeats with a gap
 * rather than one that startles.
 *
 * ToneLibrary is a PRIVATE framework, so these paths are not contractual and
 * can move or vanish in a macOS update. That is the whole reason this is a
 * chain ending in /System/Library/Sounds, which is public and present on every
 * install: an alarm that silently fails to ring is far worse than one that
 * rings with the wrong timbre.
 */
const TONE_LIBRARY = '/System/Library/PrivateFrameworks/ToneLibrary.framework/Resources/AlertTones/Modern'

export const ALARM_SOUND_CANDIDATES: readonly string[] = [
  `${TONE_LIBRARY}/Circles.m4r`,
  `${TONE_LIBRARY}/Aurora.m4r`,
  `${TONE_LIBRARY}/Chord.m4r`,
  // Public, guaranteed, and what this app used before: the floor of the chain.
  '/System/Library/Sounds/Submarine.aiff'
]

/**
 * The first candidate that actually exists.
 *
 * Pure apart from the filesystem probe, and exported so the resolution order is
 * testable without playing anything (constitution Principle IV).
 */
export function resolveAlarmSound(
  candidates: readonly string[] = ALARM_SOUND_CANDIDATES,
  exists: (path: string) => boolean = existsSync
): string {
  return candidates.find(exists) ?? candidates[candidates.length - 1]!
}

export const ALARM_SOUND_PATH = resolveAlarmSound()

/**
 * afplay's volume is a multiplier on the file, not a system volume, so this
 * makes the alarm carry without touching what the user has set for everything
 * else. The system sounds are mastered quietly for notification use; at 1.0
 * this one is easy to miss from the next room.
 *
 * Lower than the old value of 4: the alert tones are mastered louder than the
 * /System/Library/Sounds set, and a soft tone played at 4x stops being soft.
 */
export const ALARM_VOLUME = '2.5'

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
