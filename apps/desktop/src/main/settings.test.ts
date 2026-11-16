import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSettingsStore, MAX_RECENT, withRecent } from './settings'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'writingapp-settings-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('createSettingsStore', () => {
  it('reads as empty when the file does not exist', async () => {
    expect(await createSettingsStore(join(dir, 'settings.json')).load()).toEqual({})
  })

  it('round-trips the library path, creating missing folders', async () => {
    const store = createSettingsStore(join(dir, 'nested', 'settings.json'))
    await store.save({ libraryPath: '/Users/me/Lib' })
    expect(await store.load()).toEqual({ libraryPath: '/Users/me/Lib' })
  })

  it.each([
    ['malformed JSON', '{oops'],
    ['a JSON array', '[]'],
    ['null', 'null'],
    ['a wrong type', '{"libraryPath": 3}'],
    ['an empty path', '{"libraryPath": ""}']
  ])('reads as empty for %s', async (_label, text) => {
    const file = join(dir, 'settings.json')
    await writeFile(file, text)
    expect(await createSettingsStore(file).load()).toEqual({})
  })

  it('round-trips view settings and drops invalid ones', async () => {
    const file = join(dir, 'settings.json')
    await writeFile(file, JSON.stringify({ view: { theme: 'dark', fontSize: 99, font: 'wingdings' } }))
    expect(await createSettingsStore(file).load()).toEqual({ view: { theme: 'dark', fontSize: 32 } })
  })

  it('reads view settings next to the library path', async () => {
    const store = createSettingsStore(join(dir, 'settings.json'))
    await store.save({ libraryPath: '/L', view: { font: 'geist' } })
    expect(await store.load()).toEqual({ libraryPath: '/L', view: { font: 'geist' } })
  })

  it('update keeps the other fields and merges view settings', async () => {
    const store = createSettingsStore(join(dir, 'settings.json'))
    await store.save({ libraryPath: '/L', view: { theme: 'dark' } })
    await store.update({ view: { fontSize: 20 } })
    await store.update({ libraryPath: '/M' })
    expect(await store.load()).toEqual({ libraryPath: '/M', view: { theme: 'dark', fontSize: 20 } })
  })

  it('overlapping updates all land', async () => {
    const store = createSettingsStore(join(dir, 'settings.json'))
    await Promise.all([
      store.update({ view: { fontSize: 20 } }),
      store.update({ view: { theme: 'dark' } }),
      store.update({ libraryPath: '/L' }),
      store.update({ lastSheet: '/L/a.md' })
    ])
    expect(await store.load()).toEqual({ libraryPath: '/L', lastSheet: '/L/a.md', view: { fontSize: 20, theme: 'dark' } })
  })
})

describe('recent libraries and the last sheet', () => {
  it('round-trips them and ignores junk entries', async () => {
    const file = join(dir, 'settings.json')
    await writeFile(
      file,
      JSON.stringify({ recentLibraries: ['/a', 3, '', '/b', '/a'], lastSheet: '/a/x.md' })
    )
    expect(await createSettingsStore(file).load()).toEqual({
      recentLibraries: ['/a', '/b'],
      lastSheet: '/a/x.md'
    })
  })

  it('moves a library to the front without duplicating it', () => {
    expect(withRecent(['/a', '/b', '/c'], '/b')).toEqual(['/b', '/a', '/c'])
    expect(withRecent([], '/a')).toEqual(['/a'])
  })

  it('keeps only the most recent few', () => {
    const many = Array.from({ length: MAX_RECENT }, (_, i) => `/l${i}`)
    const next = withRecent(many, '/new')
    expect(next).toHaveLength(MAX_RECENT)
    expect(next[0]).toBe('/new')
    expect(next).not.toContain(`/l${MAX_RECENT - 1}`)
  })
})
