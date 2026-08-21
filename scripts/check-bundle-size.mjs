#!/usr/bin/env node
/**
 * Constitution Principle V: total shipped renderer payload MUST stay under
 * 500 KB uncompressed, and the build MUST FAIL above it. A warning does not
 * satisfy the clause — see quickstart V-013.
 */
import { readdir, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'

const BUDGET_BYTES = 500 * 1024
const OUT_DIR = new URL('../out/renderer/', import.meta.url).pathname
const COUNTED = new Set(['.js', '.mjs', '.css', '.html'])

async function walk(dir) {
  const out = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...(await walk(full)))
    else if (COUNTED.has(extname(entry.name))) out.push({ full, size: (await stat(full)).size })
  }
  return out
}

const files = await walk(OUT_DIR).catch(() => {
  console.error('✗ No renderer build found at out/renderer. Run `electron-vite build` first.')
  process.exit(1)
})

const total = files.reduce((n, f) => n + f.size, 0)
const kb = (n) => `${(n / 1024).toFixed(1)} KB`

for (const f of files.sort((a, b) => b.size - a.size).slice(0, 10)) {
  console.log(`  ${kb(f.size).padStart(10)}  ${f.full.replace(OUT_DIR, '')}`)
}
console.log(`\n  Renderer payload: ${kb(total)} / ${kb(BUDGET_BYTES)} budget`)

if (total > BUDGET_BYTES) {
  console.error(`\n✗ Payload budget exceeded by ${kb(total - BUDGET_BYTES)} (constitution Principle V).`)
  process.exit(1)
}
console.log(`✓ Within budget (${kb(BUDGET_BYTES - total)} headroom)\n`)
