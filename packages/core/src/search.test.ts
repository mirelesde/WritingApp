import { describe, expect, it } from 'vitest'
import { loadLibrary } from './library'
import { searchLibrary } from './search'
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
