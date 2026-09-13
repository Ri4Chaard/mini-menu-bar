import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer')
    }
  },
  test: {
    environment: 'node',
    // integration/ talks to the real macOS Spotlight index rather than a mock.
    // It skips itself off darwin and on a machine with no screenshot history,
    // so it is safe in the default run - see tests/integration for why it exists.
    include: [
      'tests/unit/**/*.spec.ts',
      'tests/contract/**/*.spec.ts',
      'tests/integration/**/*.spec.ts'
    ],
    globals: false
  }
})
