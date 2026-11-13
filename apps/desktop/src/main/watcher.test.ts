import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { isTempName, watchFolder } from './watcher'

const stops: (() => void)[] = []
const dirs: string[] = []
afterEach(async () => {
  stops.splice(0).forEach((stop) => stop())
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

describe('isTempName', () => {
  it('recognises the dotfiles the app writes while saving', () => {
    expect(isTempName('.a.md.123-0.tmp')).toBe(true)
    expect(isTempName('a.md')).toBe(false)
    expect(isTempName('.writingapp.json')).toBe(false)
  })
})

describe('watchFolder', () => {
  it('reports a burst of changes once, and ignores temp files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'writingapp-watch-'))
    dirs.push(dir)
    let calls = 0
    stops.push(watchFolder(dir, () => calls++, 100))
    // Let any event left over from creating the folder settle first.
    await new Promise((r) => setTimeout(r, 500))
    const baseline = calls
    await writeFile(join(dir, '.x.md.1-0.tmp'), 'temp')
    await new Promise((r) => setTimeout(r, 300))
    expect(calls).toBe(baseline)
    await writeFile(join(dir, 'a.md'), 'one')
    await writeFile(join(dir, 'b.md'), 'two')
    await new Promise((r) => setTimeout(r, 500))
    expect(calls).toBe(baseline + 1)
  })
})
