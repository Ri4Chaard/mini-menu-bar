/**
 * Regression cover for a bug reported twice: deleting every screenshot left the
 * menu bar showing something that read as a broken-image placeholder instead of
 * the app icon (FR-114, FR-115).
 *
 * The first report was the ASSET — resources/trayTemplate.png was a four-square
 * grid glyph that looks exactly like a failed image load. Replacing it with the
 * wine glass fixed that. This file guards the CODE PATH underneath, which is
 * the part a future change could quietly break: whatever the assets look like,
 * an empty screenshot list must reach `tray.setImage` with the fallback image
 * and no badge composited onto it.
 *
 * Electron is mocked, so this runs in the normal unit suite rather than needing
 * a real app.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_PREFERENCES, type Preferences } from '../../src/shared/types'

const DEFAULT_IMAGE = { __tag: 'default-app-icon' }

/** Typed through the generic so `mock.calls` keeps the shape of what was passed. */
const createFromBitmap = vi.fn<
  (buffer: Buffer, options: { width: number; height: number; scaleFactor?: number }) => unknown
>(() => ({ __tag: 'composited' }))

const createFromDataURL = vi.fn<(url: string) => unknown>(() => ({
  getSize: () => ({ width: 64, height: 36 }),
  toBitmap: () => Buffer.alloc(64 * 36 * 4, 0x80)
}))

vi.mock('electron', () => ({
  nativeImage: {
    createFromBitmap: (buffer: Buffer, options: { width: number; height: number }) =>
      createFromBitmap(buffer, options),
    createFromDataURL: (url: string) => createFromDataURL(url)
  }
}))

const thumbnailResult = { dataUrl: null as string | null, width: 0, height: 0 }
vi.mock('../../src/main/services/screenshots/thumbnail', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>
  return { ...actual, makeThumbnail: async () => thumbnailResult }
})

const { createTrayController } = await import('../../src/main/tray/tray-controller')

const prefs = (over: Partial<Preferences['previews']> = {}): Preferences => ({
  ...DEFAULT_PREFERENCES,
  previews: { ...DEFAULT_PREFERENCES.previews, ...over }
})

function harness(screenshots: { latest: () => unknown; count: () => number }, previews = { screenshots: true }) {
  const setImage = vi.fn()
  const setTitle = vi.fn()
  const controller = createTrayController({
    tray: { setImage, setTitle } as never,
    preferences: { get: () => prefs(previews) } as never,
    screenshots: screenshots as never,
    defaultImage: DEFAULT_IMAGE as never
  })
  return { controller, setImage, setTitle }
}

beforeEach(() => {
  createFromBitmap.mockClear()
  createFromDataURL.mockClear()
  thumbnailResult.dataUrl = null
})

describe('tray image when there are no screenshots', () => {
  it('shows the app icon, not a composited image', async () => {
    const { controller, setImage } = harness({ latest: () => null, count: () => 0 })
    await controller.refresh()

    expect(setImage).toHaveBeenCalledWith(DEFAULT_IMAGE)
    // Nothing was composited at all — so no badge can have been drawn on it.
    expect(createFromBitmap).not.toHaveBeenCalled()
  })

  it('shows the app icon when the newest entry no longer has a readable file', async () => {
    // The shape deletion leaves behind: an entry still listed, its file gone,
    // so thumbnail generation yields nothing.
    const { controller, setImage } = harness({
      latest: () => ({ id: 'gone', path: '/nope/gone.png' }),
      count: () => 0
    })
    await controller.refresh()

    expect(setImage).toHaveBeenCalledWith(DEFAULT_IMAGE)
    expect(createFromBitmap).not.toHaveBeenCalled()
  })

  it('shows the app icon when the screenshots preview is switched off', async () => {
    thumbnailResult.dataUrl = 'data:image/png;base64,xxx'
    const { controller, setImage } = harness(
      { latest: () => ({ id: 'a', path: '/a.png' }), count: () => 3 },
      { screenshots: false }
    )
    await controller.refresh()

    expect(setImage).toHaveBeenCalledWith(DEFAULT_IMAGE)
    expect(createFromBitmap).not.toHaveBeenCalled()
  })

  it('never passes an empty or null image to the tray', async () => {
    const { controller, setImage } = harness({ latest: () => null, count: () => 0 })
    await controller.refresh()

    const passed = setImage.mock.calls[0]?.[0]
    expect(passed).toBeTruthy()
    expect(passed).toBe(DEFAULT_IMAGE)
  })
})

describe('tray image when screenshots exist', () => {
  it('composites rather than falling back', async () => {
    thumbnailResult.dataUrl = 'data:image/png;base64,xxx'
    const { controller, setImage } = harness({
      latest: () => ({ id: 'a', path: '/a.png' }),
      count: () => 4
    })
    await controller.refresh()

    expect(createFromBitmap).toHaveBeenCalled()
    expect(setImage).toHaveBeenCalledWith({ __tag: 'composited' })
  })

  it('tags the composited image as 2x so the badge digits stay legible', async () => {
    thumbnailResult.dataUrl = 'data:image/png;base64,xxx'
    const { controller } = harness({ latest: () => ({ id: 'a', path: '/a.png' }), count: () => 4 })
    await controller.refresh()

    expect(createFromBitmap.mock.calls[0]?.[1]).toMatchObject({ scaleFactor: 2 })
  })
})
