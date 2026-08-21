import { Notification } from 'electron'

export interface NotificationService {
  timerFinished(): void
  supported(): boolean
}

export function createNotificationService(): NotificationService {
  return {
    supported: () => Notification.isSupported(),
    timerFinished() {
      if (!Notification.isSupported()) return
      new Notification({
        title: 'Timer finished',
        body: 'Your countdown has reached zero.',
        silent: false
      }).show()
    }
  }
}
