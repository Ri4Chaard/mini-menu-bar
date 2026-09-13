#!/usr/bin/env node
/**
 * The tag and the bundle version must agree.
 *
 * Without this gate a `v0.3.0` tag can publish a DMG whose Info.plist says
 * 0.2.0, and the failure is invisible until a user's update check tells them
 * they are up to date when they are not - the version in the manifest comes
 * from the tag, the version the app compares against comes from the bundle.
 *
 * Runs in CI, where GITHUB_REF_NAME is the tag. Locally it is a no-op, since
 * there is no tag to disagree with.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

const ref = process.env.GITHUB_REF_NAME
if (!ref) {
  console.log(`No GITHUB_REF_NAME set; nothing to check against (package.json is ${version}).`)
  process.exit(0)
}

const tagged = ref.replace(/^v/, '')
if (tagged !== version) {
  console.error(
    `Version mismatch: tag ${ref} implies ${tagged}, but package.json says ${version}.\n` +
      `Bump with \`npm version\`, which updates package.json and the lockfile and tags in one step.`
  )
  process.exit(1)
}

console.log(`✓ tag ${ref} matches package.json ${version}`)
