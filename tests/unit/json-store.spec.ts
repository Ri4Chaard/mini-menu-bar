import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createJsonStore } from '../../src/main/services/storage/json-store'

describe('json-store', () => {
  let dir: string
  let file: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'mmb-store-'))
    file = join(dir, 'data.json')
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns the fallback when the file does not exist', async () => {
    const store = createJsonStore(file, { a: 1 })
    expect(await store.read()).toEqual({ a: 1 })
  })

  it('returns the fallback when the file is corrupt rather than throwing', async () => {
    await writeFile(file, '{ this is not json', 'utf8')
    const store = createJsonStore(file, { a: 1 })
    expect(await store.read()).toEqual({ a: 1 })
  })

  it('round-trips a written value', async () => {
    const store = createJsonStore<{ a: number }>(file, { a: 0 })
    await store.write({ a: 42 })
    expect(await store.read()).toEqual({ a: 42 })
  })

  it('leaves no temp files behind after writing', async () => {
    const store = createJsonStore<{ a: number }>(file, { a: 0 })
    await store.write({ a: 1 })
    const entries = await readdir(dir)
    expect(entries.filter((e) => e.endsWith('.tmp'))).toHaveLength(0)
  })

  it('serialises concurrent writes so the file is never half-written', async () => {
    const store = createJsonStore<{ n: number }>(file, { n: 0 })
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.write({ n: i })))
    // Whatever landed last, the file must be valid JSON — never a torn write.
    const text = await readFile(file, 'utf8')
    expect(() => JSON.parse(text)).not.toThrow()
    expect(JSON.parse(text)).toHaveProperty('n')
  })
})
