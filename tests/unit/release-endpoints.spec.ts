/**
 * The address the app checks and the address CI publishes to must be the same.
 *
 * Without this, the update manifest URL and the electron-builder publish target
 * can drift apart silently, and the symptom is the worst kind: the check keeps
 * working and keeps saying "up to date" forever, because it is reading a
 * manifest nothing writes.
 *
 * Both are derived from package.json's `repository` field, and that is what is
 * pinned here.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { repositorySlug } from '../../src/main/services/updates/repository-slug'

const manifest = JSON.parse(
  readFileSync(join(__dirname, '../../package.json'), 'utf8')
) as { version: string; repository?: { url?: string } }

describe('repositorySlug', () => {
  it.each([
    ['https://github.com/Ri4Chaard/mini-menu-bar.git', 'Ri4Chaard/mini-menu-bar'],
    ['git+https://github.com/Ri4Chaard/mini-menu-bar.git', 'Ri4Chaard/mini-menu-bar'],
    ['https://github.com/Ri4Chaard/mini-menu-bar', 'Ri4Chaard/mini-menu-bar'],
    ['git@github.com:Ri4Chaard/mini-menu-bar.git', 'Ri4Chaard/mini-menu-bar']
  ])('extracts owner/repo from %s', (url, expected) => {
    expect(repositorySlug(url)).toBe(expected)
  })

  it('refuses a non-GitHub URL rather than building a nonsense endpoint', () => {
    expect(() => repositorySlug('https://example.com/whatever')).toThrow()
  })
})

describe('package.json', () => {
  it('declares the repository electron-builder infers its publish target from', () => {
    // publish.owner/repo are deliberately absent from electron-builder.yml so
    // that the slug lives in exactly one place. That only holds if this exists.
    expect(manifest.repository?.url).toBeTruthy()
    expect(() => repositorySlug(manifest.repository!.url!)).not.toThrow()
  })

  it('carries a parseable version, since the bundle version comes from here', () => {
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+/)
  })
})
