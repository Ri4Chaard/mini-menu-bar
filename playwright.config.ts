import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  // Electron launches a real app; running specs concurrently fights over the tray.
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' }
})
