import { describe, expect, it } from 'vitest'
import { loadLibrary } from './library'
import { fuzzyScore, listSheets, rankSheets } from './quickOpen'
import { MemoryFileSystem } from './testing/memoryFileSystem'

const fs = new MemoryFileSystem({
  '/Lib/Novel/a.md': '# Opening scene\n',
  '/Lib/Novel/Part 2/b.md': '# The long night\n',
  '/Lib/Novel/Part 2/c.md': '# Night market\n',
  '/Lib/notes.md': '# Ideas\n',
})

describe('listSheets', () => {
  it('lists every sheet with its group path', async () => {
    const items = listSheets(await loadLibrary(fs, '/Lib'))
    expect(items.map((i) => [i.title, i.where])).toEqual([
      ['Ideas', 'Lib'],
      ['Opening scene', 'Novel'],
      ['The long night', 'Novel / Part 2'],
      ['Night market', 'Novel / Part 2'],
    ])
  })
})

describe('fuzzyScore', () => {
  it('needs the characters in order', () => {
    expect(fuzzyScore('osc', 'Opening scene')).not.toBeNull()
    expect(fuzzyScore('cso', 'Opening scene')).toBeNull()
  })

  it('prefers consecutive and word-start matches', () => {
    expect(fuzzyScore('night', 'night market')!).toBeGreaterThan(fuzzyScore('night', 'tonight')!)
    expect(fuzzyScore('nm', 'night market')!).toBeGreaterThan(fuzzyScore('nm', 'unimportant')!)
  })

  it('ignores case and spaces in the query', () => {
    expect(fuzzyScore('OPEN sc', 'opening scene')).not.toBeNull()
  })
})

describe('rankSheets', () => {
  it('returns everything in order for an empty query', async () => {
    const items = listSheets(await loadLibrary(fs, '/Lib'))
    expect(rankSheets(items, '  ').map((i) => i.title)).toEqual(items.map((i) => i.title))
  })

  it('ranks title matches first and drops non-matches', async () => {
    const items = listSheets(await loadLibrary(fs, '/Lib'))
    expect(rankSheets(items, 'night').map((i) => i.title)).toEqual(['Night market', 'The long night'])
    expect(rankSheets(items, 'zzz')).toEqual([])
  })

  it('also matches the group path', async () => {
    const items = listSheets(await loadLibrary(fs, '/Lib'))
    expect(rankSheets(items, 'part2 ma').map((i) => i.title)).toEqual(['Night market'])
  })

  it('caps the number of results', async () => {
    const items = listSheets(await loadLibrary(fs, '/Lib'))
    expect(rankSheets(items, '', 2)).toHaveLength(2)
  })
})
