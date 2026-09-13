/**
 * The v2 panel skeleton (User Story 1).
 *
 * Scope note: like menu-bar-hub.spec.ts, this launches a real Electron app and
 * needs a macOS session with a window server. Browser-mode equivalence is
 * quickstart V-126 and is exercised manually against `npm run dev:browser`;
 * what matters here is that the SHELL holds its shape with the real main
 * process behind it, since the panel window size is a main-process value.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

let app: ElectronApplication
let panel: Page
let profile: string

// Feature 003 cut the app to two sections plus Settings.
const SECTIONS = ['Screenshots', 'Timer', 'Settings']

test.beforeAll(async () => {
  profile = await mkdtemp(join(tmpdir(), 'mmb-v2-'))
  app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js'), `--user-data-dir=${profile}`],
    env: { ...process.env, NODE_ENV: 'test' }
  })
  panel = await app.firstWindow()
  await panel.waitForSelector('#root > *', { timeout: 15_000 })
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.removeAllListeners('blur')
    win?.setAlwaysOnTop(true)
  })
})

test.afterAll(async () => {
  await app?.close()
  if (profile) await rm(profile, { recursive: true, force: true })
})

async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}

test('the panel window is 632 x 235 (FR-041)', async () => {
  const size = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.getSize())
  expect(size).toEqual([632, 235])
})

test('the rail shows three icon-only sections with exactly one active (FR-042, FR-043)', async () => {
  const rail = panel.getByRole('navigation', { name: 'Sections' })
  for (const label of SECTIONS) {
    await expect(rail.getByRole('button', { name: label })).toBeVisible()
  }

  // Icon-only: the accessible name comes from aria-label, so no visible text
  // node should carry the section name inside the rail.
  const railText = ((await rail.textContent()) ?? '').trim()
  expect(railText).toBe('')

  await expect(rail.locator('[aria-current="page"]')).toHaveCount(1)
})

test('every section renders the four bands in order (FR-044, FR-045)', async () => {
  const rail = panel.getByRole('navigation', { name: 'Sections' })

  for (const label of SECTIONS) {
    await rail.getByRole('button', { name: label }).click()
    await settle(panel)

    const main = panel.getByRole('main')
    await expect(main.getByRole('heading', { level: 2 })).toBeVisible()
    await expect(main.locator('header')).toHaveCount(1)
    await expect(main.locator('hr')).toHaveCount(1)
    await expect(main.locator('footer')).toHaveCount(1)
  }
})

test('the bands sum to the panel height and nothing scrolls (FR-047, SC-001)', async () => {
  const rail = panel.getByRole('navigation', { name: 'Sections' })

  for (const label of SECTIONS) {
    await rail.getByRole('button', { name: label }).click()
    await settle(panel)

    const overflow = await panel.evaluate(() => {
      const doc = document.documentElement
      const root = document.querySelector('#root > *') as HTMLElement | null
      return {
        page: doc.scrollHeight - doc.clientHeight,
        panelV: root ? root.scrollHeight - root.clientHeight : 0,
        panelH: root ? root.scrollWidth - root.clientWidth : 0
      }
    })

    expect(overflow.page, `${label} makes the page scroll`).toBeLessThanOrEqual(0)
    expect(overflow.panelV, `${label} makes the panel scroll vertically`).toBeLessThanOrEqual(0)
    expect(overflow.panelH, `${label} makes the panel scroll horizontally`).toBeLessThanOrEqual(0)
  }
})

test('switching sections keeps the rail and band structure fixed (FR-046)', async () => {
  const rail = panel.getByRole('navigation', { name: 'Sections' })
  const box = async (selector: string): Promise<{ x: number; y: number; w: number; h: number }> => {
    const b = await panel.locator(selector).first().boundingBox()
    return { x: b?.x ?? -1, y: b?.y ?? -1, w: b?.width ?? -1, h: b?.height ?? -1 }
  }

  await rail.getByRole('button', { name: 'Screenshots' }).click()
  await settle(panel)
  const before = { rail: await box('nav'), header: await box('header'), footer: await box('footer') }

  await rail.getByRole('button', { name: 'Timer' }).click()
  await settle(panel)
  const after = { rail: await box('nav'), header: await box('header'), footer: await box('footer') }

  expect(after.rail).toEqual(before.rail)
  expect(after.header.y).toBe(before.header.y)
  expect(after.header.h).toBe(before.header.h)
  expect(after.footer.y).toBe(before.footer.y)
  expect(after.footer.h).toBe(before.footer.h)
})

test('the preview toggle appears in exactly the previewable sections (FR-077, FR-079, V-119)', async () => {
  const rail = panel.getByRole('navigation', { name: 'Sections' })
  const withToggle: string[] = []

  for (const label of SECTIONS) {
    await rail.getByRole('button', { name: label }).click()
    await settle(panel)
    if ((await panel.getByRole('switch').count()) > 0) withToggle.push(label)
  }

  // Settings is not a previewable section. The Settings Widget v2 frame draws
  // one anyway - that is the drafting error this assertion exists to catch.
  expect(withToggle).toEqual(['Screenshots', 'Timer'])
})

test('the design placeholder copy did not ship (FR-080)', async () => {
  const rail = panel.getByRole('navigation', { name: 'Sections' })
  for (const label of SECTIONS) {
    await rail.getByRole('button', { name: label }).click()
    await settle(panel)
    await expect(panel.getByText('Floating capture bar')).toHaveCount(0)
  }
})

test('the rail is keyboard navigable (FR-048, SC-004)', async () => {
  const rail = panel.getByRole('navigation', { name: 'Sections' })
  await rail.getByRole('button', { name: 'Screenshots' }).click()
  await settle(panel)

  await panel.keyboard.press('ArrowDown')
  await settle(panel)
  await expect(rail.getByRole('button', { name: 'Timer' })).toHaveAttribute('aria-current', 'page')

  await panel.keyboard.press('ArrowUp')
  await settle(panel)
  await expect(rail.getByRole('button', { name: 'Screenshots' })).toHaveAttribute(
    'aria-current',
    'page'
  )
})
