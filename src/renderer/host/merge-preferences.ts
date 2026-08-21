import type { Preferences } from '@shared/types'

/**
 * Mirror of the main-process merge, used only by the mock.
 *
 * FR-031: writing one preview flag MUST NOT read or alter another. Keeping the
 * mock honest about this is what lets the contract suite assert it against both
 * implementations.
 */
export function mergeForMock(current: Preferences, patch: Partial<Preferences>): Preferences {
  return {
    ...current,
    ...patch,
    previews: {
      screenshots: patch.previews?.screenshots ?? current.previews.screenshots,
      timer: patch.previews?.timer ?? current.previews.timer,
      spotify: patch.previews?.spotify ?? current.previews.spotify
    },
    screenshotsSeenWatermark: Math.max(
      current.screenshotsSeenWatermark,
      patch.screenshotsSeenWatermark ?? 0
    )
  }
}
