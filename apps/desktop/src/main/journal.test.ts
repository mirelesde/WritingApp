import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createJournal } from './journal'

let dir: string
let lib: string
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'journal-'))
  lib = await mkdtemp(join(tmpdir(), 'journal-lib-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
  await rm(lib, { recursive: true, force: true })
})

describe('journal', () => {
  it('returns text that never reached the file', async () => {
    const sheet = join(lib, 'a.md')
    await writeFile(sheet, 'old')
    const journal = createJournal(join(dir, 'j'))
    await journal.put(lib, sheet, 'old plus new')
    const [found] = await journal.pending(lib)
    expect(found).toMatchObject({ path: sheet, text: 'old plus new', disk: 'old' })
  })

  it('forgets an entry once it is cleared', async () => {
    const sheet = join(lib, 'a.md')
    await writeFile(sheet, 'old')
    const journal = createJournal(join(dir, 'j'))
    await journal.put(lib, sheet, 'new')
    await journal.clear(sheet)
    expect(await journal.pending(lib)).toEqual([])
  })

  it('drops entries that match the file, or whose sheet is gone and text is blank', async () => {
    const same = join(lib, 'same.md')
    const gone = join(lib, 'gone.md')
    await writeFile(same, 'text')
    const journal = createJournal(join(dir, 'j'))
    await journal.put(lib, same, 'text')
    await journal.put(lib, gone, '  \n')
    expect(await journal.pending(lib)).toEqual([])
    expect(await readdir(join(dir, 'j'))).toEqual([])
  })

  it('offers text back when its sheet was deleted or renamed', async () => {
    const gone = join(lib, 'gone.md')
    const journal = createJournal(join(dir, 'j'))
    await journal.put(lib, gone, 'my only copy')
    expect(await journal.pending(lib)).toEqual([
      expect.objectContaining({ path: gone, text: 'my only copy', disk: '', missing: true })
    ])
    expect(await readdir(join(dir, 'j'))).toHaveLength(1)
  })

  it('keeps another library’s entries and ignores damaged files', async () => {
    const sheet = join(lib, 'a.md')
    await writeFile(sheet, 'old')
    const journal = createJournal(join(dir, 'j'))
    await journal.put('/somewhere/else', sheet, 'new')
    await writeFile(join(dir, 'j', 'broken.json'), '{nope')
    expect(await journal.pending(lib)).toEqual([])
    expect(await readdir(join(dir, 'j'))).toHaveLength(1)
  })

  it('a clear queued after a put always wins', async () => {
    const sheet = join(lib, 'a.md')
    await writeFile(sheet, 'old')
    const journal = createJournal(join(dir, 'j'))
    await Promise.all([journal.put(lib, sheet, 'one'), journal.put(lib, sheet, 'two'), journal.clear(sheet)])
    expect(await journal.pending(lib)).toEqual([])
    expect(await readFile(sheet, 'utf8')).toBe('old')
  })
})
