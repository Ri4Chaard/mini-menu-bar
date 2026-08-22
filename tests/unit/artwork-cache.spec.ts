/**
 * Album art is the app's ONLY outbound request (FR-087), so its bounds are the
 * whole reason it is acceptable in an otherwise offline application. Each one
 * is asserted here rather than left to review:
 *
 *   - one request per distinct artwork, ever
 *   - a bounded cache, so a long session cannot grow without limit
 *   - failure is silent and does NOT retry — a retry storm against Spotify's
 *     CDN is exactly what "no telemetry, no background chatter" rules out
 *   - only https://i.scdn.co, and never with credentials
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createArtworkCache, ARTWORK_CACHE_LIMIT } from '../../src/main/services/spotify/artwork'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

function okFetch(): ReturnType<typeof vi.fn> {
  return vi.fn(async () => ({
    ok: true,
    headers: { get: () => 'image/png' },
    arrayBuffer: async () => PNG.buffer
  })) as unknown as ReturnType<typeof vi.fn>
}

describe('artwork cache', () => {
  let fetcher: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetcher = okFetch()
  })

  it('returns a data URL, never the source address', async () => {
    const cache = createArtworkCache(fetcher as never)
    const result = await cache.get('https://i.scdn.co/image/abc')
    expect(result).toMatch(/^data:image\/png;base64,/)
    expect(result).not.toMatch(/i\.scdn\.co/)
  })

  it('fetches once per distinct artwork and serves repeats from memory', async () => {
    const cache = createArtworkCache(fetcher as never)
    await cache.get('https://i.scdn.co/image/abc')
    await cache.get('https://i.scdn.co/image/abc')
    await cache.get('https://i.scdn.co/image/abc')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('sends no cookies or credentials', async () => {
    const cache = createArtworkCache(fetcher as never)
    await cache.get('https://i.scdn.co/image/abc')
    const init = fetcher.mock.calls[0]![1] as RequestInit
    expect(init.credentials).toBe('omit')
    expect(init.referrerPolicy).toBe('no-referrer')
  })

  it('refuses a host that is not Spotify artwork', async () => {
    const cache = createArtworkCache(fetcher as never)
    expect(await cache.get('https://example.com/tracker.gif')).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refuses a non-https address', async () => {
    const cache = createArtworkCache(fetcher as never)
    expect(await cache.get('http://i.scdn.co/image/abc')).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('resolves null on failure and does not retry', async () => {
    const failing = vi.fn(async () => {
      throw new Error('network down')
    })
    const cache = createArtworkCache(failing as never)

    expect(await cache.get('https://i.scdn.co/image/abc')).toBeNull()
    expect(await cache.get('https://i.scdn.co/image/abc')).toBeNull()
    // The failure is remembered. Retrying on every 1 Hz poll would be a storm.
    expect(failing).toHaveBeenCalledTimes(1)
  })

  it('resolves null when the response is not an image', async () => {
    const html = vi.fn(async () => ({
      ok: true,
      headers: { get: () => 'text/html' },
      arrayBuffer: async () => PNG.buffer
    }))
    const cache = createArtworkCache(html as never)
    expect(await cache.get('https://i.scdn.co/image/abc')).toBeNull()
  })

  it('evicts the least recently used entry beyond the cache limit', async () => {
    const cache = createArtworkCache(fetcher as never)
    for (let i = 0; i < ARTWORK_CACHE_LIMIT + 1; i += 1) {
      await cache.get(`https://i.scdn.co/image/${i}`)
    }
    expect(cache.size()).toBe(ARTWORK_CACHE_LIMIT)

    // The oldest is gone, so asking for it fetches again.
    const before = fetcher.mock.calls.length
    await cache.get('https://i.scdn.co/image/0')
    expect(fetcher.mock.calls.length).toBe(before + 1)
  })

  it('handles a null artwork url without touching the network', async () => {
    const cache = createArtworkCache(fetcher as never)
    expect(await cache.get(null)).toBeNull()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
