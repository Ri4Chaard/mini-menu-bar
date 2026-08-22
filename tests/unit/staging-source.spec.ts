/**
 * Identifying a capture that macOS never saved.
 *
 * The Spotlight attribute cannot help here: the per-user temporary area is
 * outside the index, so a staged capture is recognised by where it sits - a
 * directory screencaptureui created for itself. Getting that predicate wrong
 * fails in one of two ugly ways, and both are asserted below: too loose and
 * every application's atomic save shows up in the strip as a "screenshot"; too
 * tight and the feature simply shows nothing, silently.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CAPTURE_DIR_PREFIX,
  describeStagingCapture,
  isStagingCapture,
  listStagingCaptures,
  stagingRoot,
  stagingWatchRoot
} from '../../src/main/services/screenshots/staging-source'

const scratch: string[] = []

afterEach(async () => {
  for (const dir of scratch.splice(0)) await rm(dir, { recursive: true, force: true })
})

async function makeRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'staging-test-'))
  scratch.push(dir)
  return dir
}

describe('isStagingCapture', () => {
  const root = '/var/tmp/TemporaryItems'
  const at = (rest: string): string => `${root}/${rest}`

  it('accepts an image inside a screencaptureui directory', () => {
    expect(isStagingCapture(at(`${CAPTURE_DIR_PREFIX}_kf19Xz/Screenshot at 17.03.21.png`), root))
      .toBe(true)
  })

  it('accepts a localised filename, which is why the directory is the signal', () => {
    // The same case spotlight-source.ts calls out: filename matching would fail
    // on a Ukrainian system, and the directory name never varies.
    expect(isStagingCapture(at(`${CAPTURE_DIR_PREFIX}_kf19Xz/Знімок екрана о 17.31.10.png`), root))
      .toBe(true)
  })

  it('rejects another application using TemporaryItems for an atomic save', () => {
    // This predicate runs against every temporary file every application
    // writes, because the watch has to sit one level above the staging root.
    // Too loose here and the strip fills with other people's scratch files.
    expect(isStagingCapture(at('SomeOtherApp/Untitled.png'), root)).toBe(false)
    expect(isStagingCapture(at('NSIRD_TextEdit_x9/Draft.png'), root)).toBe(false)
  })

  it('rejects a file sitting loose in the staging root', () => {
    expect(isStagingCapture(at('Screenshot.png'), root)).toBe(false)
  })

  it('rejects a non-image inside a capture directory', () => {
    expect(isStagingCapture(at(`${CAPTURE_DIR_PREFIX}_kf19Xz/notes.txt`), root)).toBe(false)
  })

  it('rejects a path outside the root that merely looks similar', () => {
    // A saved screenshot must keep going through the metadata check; routing it
    // here would accept any image the user happened to file that way.
    expect(isStagingCapture(`/Users/me/Desktop/${CAPTURE_DIR_PREFIX}_a1/Shot.png`, root)).toBe(false)
  })

  it('rejects the root itself', () => {
    expect(isStagingCapture(root, root)).toBe(false)
  })

  it('rejects a sibling of the watch root that is not the staging root', () => {
    // The watch is on the whole temporary directory, so this is the shape of
    // event the predicate sees most often.
    expect(isStagingCapture(`${stagingWatchRoot()}/com.apple.tccd/service.png`)).toBe(false)
  })
})

describe('listStagingCaptures', () => {
  it('returns captures newest first and ignores unrelated directories', async () => {
    const root = await makeRoot()
    const capture = join(root, `${CAPTURE_DIR_PREFIX}_a1`)
    await mkdir(capture, { recursive: true })
    await mkdir(join(root, 'SomeOtherApp'), { recursive: true })
    await writeFile(join(capture, 'first.png'), 'x')
    await writeFile(join(capture, 'second.png'), 'y')
    await writeFile(join(capture, 'notes.txt'), 'z')
    await writeFile(join(root, 'SomeOtherApp', 'decoy.png'), 'q')

    const found = await listStagingCaptures(10, root)
    expect(found.map((f) => f.fileName).sort()).toEqual(['first.png', 'second.png'])
    expect(found.every((f) => f.isTemporary)).toBe(true)
    expect([...found].sort((a, b) => b.capturedAt - a.capturedAt)).toEqual(found)
  })

  it('honours the cap', async () => {
    const root = await makeRoot()
    const capture = join(root, `${CAPTURE_DIR_PREFIX}_a1`)
    await mkdir(capture, { recursive: true })
    for (let i = 0; i < 5; i += 1) await writeFile(join(capture, `shot-${i}.png`), 'x')
    expect(await listStagingCaptures(2, root)).toHaveLength(2)
  })

  it('treats a missing staging root as empty, not as a failure', async () => {
    // Nothing has been captured yet this boot. That is the normal state on a
    // freshly-booted machine and must not surface as an error in the section.
    await expect(listStagingCaptures(10, join(tmpdir(), 'definitely-not-here-9f2a'))).resolves
      .toEqual([])
  })
})

describe('describeStagingCapture', () => {
  it('skips a zero-length file still being written', async () => {
    const root = await makeRoot()
    await writeFile(join(root, 'half.png'), '')
    expect(await describeStagingCapture(join(root, 'half.png'))).toBeNull()
  })

  it('returns null for a path that does not exist', async () => {
    expect(await describeStagingCapture(join(tmpdir(), 'nope-8812.png'))).toBeNull()
  })
})

describe('roots', () => {
  it('stages under TemporaryItems inside the per-user temporary area', () => {
    expect(stagingRoot()).toBe(join(tmpdir(), 'TemporaryItems'))
  })

  it('watches one level above it, because the staging root itself cannot be watched', () => {
    // Measured: watch() on the staging root fails with EPERM even for its owner,
    // while a recursive watch here reports the paths inside it.
    expect(stagingWatchRoot()).toBe(tmpdir())
    expect(stagingRoot().startsWith(stagingWatchRoot())).toBe(true)
  })
})
