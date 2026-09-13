/**
 * End-to-end coverage against the packaged main process (T104).
 *
 * These launch a real Electron app, so they need a macOS session with a window
 * server. They are excluded from `npm test` and run via `npm run test:e2e`.
 *
 * Scope note: the tray itself cannot be driven programmatically, so menu bar
 * preview behaviour stays a manual check (quickstart V-009). What is covered
 * here is everything reachable inside the panel plus the main-process wiring.
 */
import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

let app: ElectronApplication
let panel: Page
let profile: string

test.beforeAll(async () => {
  // A throwaway profile per run. Sharing the real userData would let one run's
  // saved preferences and notes leak into the next, which is flaky by
  // construction and would mask genuine persistence bugs.
  profile = await mkdtemp(join(tmpdir(), 'mmb-e2e-'))
  app = await electron.launch({
    args: [join(process.cwd(), 'out/main/index.js'), `--user-data-dir=${profile}`],
    env: { ...process.env, NODE_ENV: 'test' }
  })
  panel = await app.firstWindow()
  await panel.waitForSelector('#root > *', { timeout: 15_000 })

  // Blur-dismissal (FR-002) fights automation: Playwright's synthetic mouse
  // events shift focus, the panel hides mid-interaction, and clicks land on a
  // hidden window. Disable just that listener for the run - blur dismissal is
  // inherently about real window-manager focus and is verified manually
  // (quickstart V-006), not here.
  await app.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows()[0]
    win?.removeAllListeners('blur')
    win?.setAlwaysOnTop(true)
  })
})

/**
 * Wait for section-entrance animations to finish.
 *
 * Switching sections plays a ~180 ms fade, during which Playwright's
 * actionability check reports the element as unstable. This is the app behaving
 * correctly, so the test waits rather than the app dropping the animation.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}

test.afterAll(async () => {
  await app?.close()
  if (profile) await rm(profile, { recursive: true, force: true })
})

test('panel renders both sections plus settings', async () => {
  const nav = panel.getByRole('navigation', { name: 'Sections' })
  // Feature 003 cut the app to Screenshots and Timer; the rail must carry
  // exactly those two plus Settings, and nothing left over from Spotify/Notes.
  for (const label of ['Screenshots', 'Timer', 'Settings']) {
    await expect(nav.getByRole('button', { name: label })).toBeVisible()
  }
  await expect(nav.getByRole('button')).toHaveCount(3)
})

test('sections switch in a single click (FR-005)', async () => {
  const nav = panel.getByRole('navigation', { name: 'Sections' })
  await nav.getByRole('button', { name: 'Timer' }).click()
  await expect(panel.locator('[data-status]')).toBeVisible()
  await nav.getByRole('button', { name: 'Screenshots' }).click()
  await expect(nav.getByRole('button', { name: 'Screenshots' })).toHaveAttribute('aria-current', 'page')
  await expect(panel.getByRole('main').getByRole('heading', { level: 2 })).toHaveText('Screenshots')
})

test('timer counts down and pauses (FR-016)', async () => {
  await panel.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Timer' }).click()
  await panel.getByRole('button', { name: '1m', exact: true }).click()

  const clock = panel.locator('[data-status]')
  await expect(clock).toHaveAttribute('data-status', 'running')
  const first = await clock.textContent()
  await panel.waitForTimeout(1500)
  expect(await clock.textContent()).not.toBe(first)

  await panel.getByRole('button', { name: 'Pause' }).click()
  await expect(clock).toHaveAttribute('data-status', 'paused')
  const frozen = await clock.textContent()
  await panel.waitForTimeout(1500)
  expect(await clock.textContent()).toBe(frozen)
})

test('timer keeps running while the panel is hidden (FR-017, research.md R-004)', async () => {
  await panel.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Timer' }).click()
  await panel.getByRole('button', { name: '5m', exact: true }).click()

  // Hide the panel, wait, then read the authoritative state from main. A
  // renderer-owned timer would be throttled here and barely advance.
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.hide())
  await panel.waitForTimeout(4000)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show())

  const remaining = await panel.locator('[data-status]').textContent()
  const [minutes = '0', seconds = '0'] = (remaining ?? '0:00').split(':')
  const total = Number(minutes) * 60 + Number(seconds)
  expect(total).toBeLessThanOrEqual(297)
})

test('preview toggles are independent (FR-031)', async () => {
  await panel.getByRole('navigation', { name: 'Sections' }).getByRole('button', { name: 'Settings' }).click()
  await settle(panel)

  const previews = panel.locator('section', { hasText: 'Show in menu bar' })
  // Both surviving sections are previewable; Settings is not (FR-076, FR-079).
  await expect(previews.getByRole('checkbox')).toHaveCount(2)
  await expect(previews.locator('label', { hasText: 'Settings' })).toHaveCount(0)

  const boxes = previews.getByRole('checkbox')
  const read = (): Promise<boolean[]> => boxes.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).checked))

  expect(await read()).toEqual([false, false])

  // Click the label, which is what a user actually clicks. `.check()` is avoided
  // deliberately: its actionability wrapper reports this frameless menubar
  // window as unstable, which is a harness artefact rather than app behaviour.
  await previews.locator('label').first().click()
  await expect.poll(read).toEqual([true, false])

  // The point of FR-031: toggling one leaves the other exactly as it was.
  await previews.locator('label').nth(1).click()
  await expect.poll(read).toEqual([true, true])

  await previews.locator('label').first().click()
  await expect.poll(read).toEqual([false, true])
})

test('the renderer cannot reach Electron internals (constitution Principle I)', async () => {
  const exposed = await panel.evaluate(() => ({
    hasRequire: typeof (globalThis as Record<string, unknown>).require !== 'undefined',
    hasProcess: typeof (globalThis as Record<string, unknown>).process !== 'undefined',
    hasElectron: typeof (globalThis as Record<string, unknown>).electron !== 'undefined'
  }))
  expect(exposed.hasRequire).toBe(false)
  expect(exposed.hasProcess).toBe(false)
  expect(exposed.hasElectron).toBe(false)
})
