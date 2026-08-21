import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Browser-only dev server. No Electron process is started; the renderer runs as
// an ordinary web page and selects the mock host bridge. This is the executable
// proof of constitution Principle I (Browser-Runnable Core) — see quickstart V-001.
const renderer = resolve(__dirname, 'src/renderer')

export default defineConfig({
  root: renderer,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@shared': resolve(__dirname, 'src/shared'), '@renderer': renderer }
  },
  server: { port: 5174, open: true }
})
