/**
 * Album artwork — the application's ONLY outbound network request (FR-087).
 *
 * FR-064 needs album art and there is no local source: Spotify keeps artwork in
 * its own cache in an undocumented layout, and the scripting interface hands
 * back an https URL rather than bytes (research.md R-111).
 *
 * Everything about this module exists to keep that single request bounded:
 *
 *   - It runs in MAIN, never the renderer. The renderer receives a data URL,
 *     never an address, so it cannot make the request even by accident and
 *     browser mode still works with no network at all.
 *   - Only Spotify's artwork host, only over https. Anything else is refused
 *     without a request being made.
 *   - No cookies, no credentials, no referrer, no header identifying the user.
 *   - One request per distinct artwork per session, cached in memory.
 *   - Failure is remembered, not retried: playback polls at 1 Hz, and a retry
 *     per poll would be a storm against someone else's CDN.
 *
 * The cache is never persisted — it is derived state that can be recomputed,
 * which the constitution's state clause forbids persisting.
 */

export const ARTWORK_CACHE_LIMIT = 20

/** Spotify serves track artwork from this host and no other. */
const ALLOWED_HOST = 'i.scdn.co'

type Fetcher = typeof fetch

export interface ArtworkCache {
  get(url: string | null): Promise<string | null>
  size(): number
  clear(): void
}

function isAllowed(raw: string): boolean {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && url.hostname === ALLOWED_HOST
  } catch {
    return false
  }
}

export function createArtworkCache(fetcher: Fetcher = fetch): ArtworkCache {
  // Insertion-ordered, so the first key is the least recently used once every
  // hit re-inserts. `null` is a remembered failure, not a missing entry.
  const cache = new Map<string, string | null>()

  const touch = (key: string, value: string | null): string | null => {
    cache.delete(key)
    cache.set(key, value)
    if (cache.size > ARTWORK_CACHE_LIMIT) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    return value
  }

  return {
    async get(url) {
      if (!url) return null
      if (!isAllowed(url)) return null

      if (cache.has(url)) {
        const hit = cache.get(url) ?? null
        return touch(url, hit)
      }

      try {
        const response = await fetcher(url, {
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
          cache: 'default'
        })
        if (!response.ok) return touch(url, null)

        const type = response.headers.get('content-type') ?? ''
        if (!type.startsWith('image/')) return touch(url, null)

        const bytes = Buffer.from(await response.arrayBuffer())
        return touch(url, `data:${type};base64,${bytes.toString('base64')}`)
      } catch {
        // Silent: the art slot falls back to a placeholder and the rest of the
        // section renders normally (FR-087).
        return touch(url, null)
      }
    },

    size: () => cache.size,
    clear: () => cache.clear()
  }
}
