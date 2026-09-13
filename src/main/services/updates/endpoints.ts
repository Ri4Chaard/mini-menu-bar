/**
 * Every address the app knows, in one place.
 *
 * The renderer holds none of these. It asks main to open the releases page and
 * main resolves the URL from here - the rule FR-087 set for album art, and the
 * fix for the drift that produced this feature: a hardcoded releases URL in the
 * settings section had been naming a repository that does not exist.
 *
 * The slug is derived from package.json's `repository` field rather than
 * written twice, so the address the app checks and the address CI publishes to
 * cannot drift apart. tests/unit/release-endpoints.spec.ts pins that.
 *
 * Resolved lazily and memoised rather than at import time: reading a file as an
 * import side effect would run before `app` is ready and would make this module
 * unimportable from a test.
 */
import { app } from 'electron'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { repositorySlug } from './repository-slug'

export { repositorySlug }

export interface Endpoints {
  releases: string
  manifest: string
  userAgent: string
}

let cached: Endpoints | null = null

export function endpoints(): Endpoints {
  if (cached) return cached

  // The project root in dev, Contents/Resources/app.asar when packaged.
  // package.json sits at the root of both, and is already in electron-builder's
  // `files` list because the packager needs it too.
  const manifest: unknown = JSON.parse(
    readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')
  )
  const url = (manifest as { repository?: { url?: string } }).repository?.url
  if (!url) throw new Error('package.json has no repository.url')
  const slug = repositorySlug(url)

  cached = {
    releases: `https://github.com/${slug}/releases`,
    /**
     * The version manifest (R-402).
     *
     * A release asset rather than the GitHub API: the API allows 60
     * unauthenticated requests an hour PER IP, shared with every other consumer
     * on that address, and returns kilobytes where this returns ~150 bytes.
     */
    manifest: `https://github.com/${slug}/releases/latest/download/latest.json`,
    /** No version, no identifier, nothing derived from the user or machine (FR-126). */
    userAgent: `Mini Menu Bar (+https://github.com/${slug})`
  }
  return cached
}
