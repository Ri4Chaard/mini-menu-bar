import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = resolve(__dirname, 'src/shared')
const renderer = resolve(__dirname, 'src/renderer')

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } }
    }
  },
  preload: {
    // Deliberately NO externalizeDepsPlugin here. With `sandbox: true` the preload
    // script has no module resolution of its own, so every dependency must be
    // bundled into the output. See research.md R-002.
    resolve: { alias: { '@shared': shared } },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        output: { format: 'cjs' }
      }
    }
  },
  renderer: {
    root: renderer,
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@shared': shared, '@renderer': renderer } },
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      // electron-vite does not minify the renderer by default. Without this the
      // payload lands around 780 KB and breaches the Principle V budget - the
      // build gate caught exactly that.
      minify: 'esbuild',
      rollupOptions: { input: resolve(renderer, 'index.html') }
    }
  }
})
