#!/usr/bin/env node
/**
 * Writes the manifest the app's update check reads.
 *
 * Deliberately our own tiny JSON rather than the `latest-mac.yml` that
 * electron-builder also emits: that one is YAML, and parsing YAML in the main
 * process means either a new runtime dependency at the widest part of the
 * security boundary or a fragile regex. This is 150 bytes of JSON (R-402).
 *
 * Uploaded as a release asset, so the app reads it at
 * releases/latest/download/latest.json - which resolves only once the release
 * is published, not while it is still a draft.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

const manifest = {
  version,
  publishedAt: new Date().toISOString(),
  // Not read by the current client, which ignores unknown fields. Present so a
  // future build can refuse to offer an update its OS cannot run.
  minimumSystemVersion: '12.0'
}

const out = join(ROOT, 'latest.json')
writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`)
console.log(`✓ latest.json → ${version}`)
