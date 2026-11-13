import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSettingsStore } from './settings'

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
})
