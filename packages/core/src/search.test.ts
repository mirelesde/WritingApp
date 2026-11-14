import { describe, expect, it } from 'vitest'
import { loadLibrary } from './library'
import { replaceAllIn, replaceInLibrary, searchLibrary } from './search'
import { applyUndo } from './undo'
import { MemoryFileSystem } from './testing/memoryFileSystem'

const fs = new MemoryFileSystem({
  '/Lib/Novel/a.md': '# Opening\n\nThe Lighthouse stood alone.\nA lighthouse keeper waited.\n',
  '/Lib/Novel/b.md': '# Middle\n\nNothing here.\n',
  '/Lib/Novel/Part 2/c.md': '# End\n\n' + 'x'.repeat(100) + ' lighthouse ' + 'y'.repeat(100),
  '/Lib/notes.md': 'No match\n',
})

describe('searchLibrary', () => {
  it('finds sheets ignoring case, in library order, with counts and places', async () => {
    const tree = await loadLibrary(fs, '/Lib')
    const hits = await searchLibrary(fs, tree, 'LIGHTHOUSE')
    expect(hits.map((h) => h.path)).toEqual(['/Lib/Novel/a.md', '/Lib/Novel/Part 2/c.md'])
    expect(hits[0]).toMatchObject({ title: 'Opening', where: 'Novel', count: 2, match: 'Lighthouse' })
    expect(hits[1]!.where).toBe('Novel / Part 2')
  })

  it('gives a flattened snippet with ellipses where text was cut', async () => {
    const tree = await loadLibrary(fs, '/Lib')
    const [first, second] = await searchLibrary(fs, tree, 'lighthouse')
    expect(first!.before).toBe('# Opening The ')
    expect(first!.after.startsWith(' stood alone. A ')).toBe(true)
    expect(second!.before.startsWith('…')).toBe(true)
    expect(second!.after.endsWith('…')).toBe(true)
  })

  it('stops at the limit and treats a blank query as nothing', async () => {
    const tree = await loadLibrary(fs, '/Lib')
    expect(await searchLibrary(fs, tree, 'lighthouse', 1)).toHaveLength(1)
    expect(await searchLibrary(fs, tree, '   ')).toEqual([])
  })
})


describe('replace', () => {
  it('replaces every match, ignoring case', () => {
    expect(replaceAllIn('Cat cat CAT dog', 'cat', 'fox')).toEqual({ text: 'fox fox fox dog', count: 3 })
    expect(replaceAllIn('abc', '', 'x').count).toBe(0)
  })

  it('replaces across sheets, can be limited, and can be undone', async () => {
    const fs = new MemoryFileSystem({ '/lib/a.md': '# A\nred red', '/lib/G/b.md': '# B\nRed', '/lib/c.md': '# C' })
    const tree = await loadLibrary(fs, '/lib')
    const one = await replaceInLibrary(fs, tree, 'red', 'blue', ['/lib/c.md', '/lib/G/b.md'])
    expect(one).toMatchObject({ count: 1, sheets: 1 })
    const all = await replaceInLibrary(fs, tree, 'red', 'blue')
    expect(all).toMatchObject({ count: 2, sheets: 1 })
    expect(await fs.readText('/lib/a.md')).toBe('# A\nblue blue')
    await applyUndo(fs, all.undo)
    expect(await fs.readText('/lib/a.md')).toBe('# A\nred red')
  })
})

describe('search options', () => {
  const lib = new MemoryFileSystem({
    '/L/A/a.md': '# A\nCat catalog cat. Concat\n',
    '/L/B/b.md': '# B\nthe CAT sat\n',
    '/L/c.md': '# C\ncolour color\n',
  })

  it('matches case when asked', async () => {
    const tree = await loadLibrary(lib, '/L')
    expect(await searchLibrary(lib, tree, 'CAT', 50, { caseSensitive: true })).toHaveLength(1)
    expect(await searchLibrary(lib, tree, 'CAT')).toHaveLength(2)
  })

  it('matches whole words only', async () => {
    const tree = await loadLibrary(lib, '/L')
    const [hit] = await searchLibrary(lib, tree, 'cat', 50, { wholeWord: true })
    expect(hit!.count).toBe(2) // Cat and cat, not catalog or Concat
  })

  it('searches with regular expressions, per line, and rejects bad ones', async () => {
    const tree = await loadLibrary(lib, '/L')
    const hits = await searchLibrary(lib, tree, 'colou?r', 50, { regex: true })
    expect(hits.map((h) => h.count)).toEqual([2])
    expect(await searchLibrary(lib, tree, '^the', 50, { regex: true })).toHaveLength(1)
    await expect(searchLibrary(lib, tree, '(', 50, { regex: true })).rejects.toThrow('valid regular expression')
    await expect(searchLibrary(lib, tree, 'a*', 50, { regex: true })).rejects.toThrow('empty')
  })

  it('limits to a group or a sheet', async () => {
    const tree = await loadLibrary(lib, '/L')
    expect(await searchLibrary(lib, tree, 'cat', 50, { within: '/L/B' })).toHaveLength(1)
    expect(await searchLibrary(lib, tree, 'cat', 50, { within: '/L/A/a.md' })).toHaveLength(1)
    expect(await searchLibrary(lib, tree, 'cat', 50, { within: '/L/Bx' })).toHaveLength(0)
  })

  it('replaces with capture groups in regex mode and only inside the scope', async () => {
    expect(replaceAllIn('2024-05-06', '(\\d+)-(\\d+)-(\\d+)', '$3/$2/$1', { regex: true }).text).toBe('06/05/2024')
    expect(replaceAllIn('a.b', '.', '$1')).toEqual({ text: 'a$1b', count: 1 })
    const fs2 = new MemoryFileSystem({ '/r/G/a.md': '# A\nred', '/r/b.md': '# B\nred' })
    const tree = await loadLibrary(fs2, '/r')
    const out = await replaceInLibrary(fs2, tree, 'red', 'blue', undefined, { within: '/r/G' })
    expect(out.sheets).toBe(1)
    expect(await fs2.readText('/r/b.md')).toBe('# B\nred')
  })
})
