/**
 * The app's only outbound request (FR-126, R-401, R-402).
 *
 * Everything here is shaped by the bounds the spec declares: one small JSON
 * document, no credentials, no identifying header, one request in flight, a
 * five second ceiling, no retry and no timer. There is deliberately no
 * scheduling of any kind in this file - Principle V forbids periodic work, and
 * the launch check in index.ts is a single fire-and-forget call, not a loop.
 */
import { app, net, shell } from 'electron'
import { BridgeError } from '@shared/errors'
import { isNewer } from '@shared/semver'
import type { UpdateCheckResult } from '@shared/types'
import { endpoints } from './endpoints'
import { MAX_MANIFEST_BYTES, parseManifest } from './parse-manifest'

const TIMEOUT_MS = 5_000

export interface UpdateService {
  getVersion(): string
  check(): Promise<UpdateCheckResult>
  openReleasesPage(): Promise<void>
}

export function createUpdateService(): UpdateService {
  /**
   * The in-flight request, so a user mashing the button opens one socket rather
   * than five. Cleared on settle, which is what makes the next press a fresh
   * check rather than a cached answer.
   */
  let inFlight: Promise<UpdateCheckResult> | null = null

  async function fetchManifest(): Promise<UpdateCheckResult> {
    const currentVersion = app.getVersion()

    let response: Response
    try {
      // net.fetch, not Node's global fetch: this one goes through Chromium's
      // network stack, so it honours the macOS system proxy configuration and
      // the system trust store. undici honours neither.
      response = await net.fetch(endpoints().manifest, {
        method: 'GET',
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'follow',
        headers: { 'User-Agent': endpoints().userAgent },
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
    } catch {
      // Offline, DNS failure, timeout and abort are one state to the user.
      throw new BridgeError('NETWORK_UNAVAILABLE', "Couldn't reach the update server.")
    }

    if (!response.ok) {
      throw new BridgeError('NETWORK_UNAVAILABLE', "Couldn't reach the update server.")
    }

    // Checked before reading and again after: a missing or lying content-length
    // is ordinary, so the header alone is not a bound.
    const declared = Number(response.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_MANIFEST_BYTES) {
      throw new BridgeError('UNKNOWN', 'The update information was not readable.')
    }

    const text = await response.text()
    const manifest = parseManifest(text)
    if (!manifest) {
      throw new BridgeError('UNKNOWN', 'The update information was not readable.')
    }

    return {
      // isNewer fails closed, so a version this app cannot parse is reported as
      // up-to-date rather than as an update the user cannot act on.
      status: isNewer(manifest.version, currentVersion) ? 'update-available' : 'up-to-date',
      currentVersion,
      latestVersion: manifest.version,
      publishedAt: manifest.publishedAt,
      checkedAt: Date.now()
    }
  }

  return {
    getVersion: () => app.getVersion(),

    check(): Promise<UpdateCheckResult> {
      if (inFlight) return inFlight
      const request = fetchManifest().finally(() => {
        inFlight = null
      })
      inFlight = request
      return request
    },

    async openReleasesPage(): Promise<void> {
      // The renderer never holds this address; main resolves it.
      await shell.openExternal(endpoints().releases)
    }
  }
}
