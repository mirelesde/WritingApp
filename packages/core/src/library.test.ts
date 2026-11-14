import { describe, expect, it } from 'vitest'
import { loadLibrary, type GroupNode, type SheetCache } from './library'
import { MemoryFileSystem } from './testing/memoryFileSystem'

const sidecar = (order: string[], glued: string[] = []) =>
  JSON.stringify({ version: 1, order, glued })

describe('loadLibrary', () => {
  it('builds a tree of projects, groups and sheets in sidecar order', async () => {
    const fs = new MemoryFileSystem({
      '/Lib/Novel/.writingapp.json': sidecar(['notes.md', 'Part One']),
      '/Lib/Novel/notes.md': '# Notes\n\nRemember the ending.',
      '/Lib/Novel/Part One/.writingapp.json': sidecar(['b.md', 'a.md']),
      '/Lib/Novel/Part One/a.md': 'Opening\nIt was raining.',
      '/Lib/Novel/Part One/b.md': 'The Station',
    })
    const lib = await loadLibrary(fs, '/Lib')
    expect(lib).toMatchObject({ kind: 'group', name: 'Lib', path: '/Lib' })
    const novel = lib.children[0] as GroupNode
    expect(novel).toMatchObject({ kind: 'group', name: 'Novel', path: '/Lib/Novel' })
    expect(novel.children.map((c) => c.name)).toEqual(['notes.md', 'Part One'])
    expect(novel.children[0]).toEqual({
      kind: 'sheet',
      name: 'notes.md',
      path: '/Lib/Novel/notes.md',
      title: 'Notes',
      preview: 'Remember the ending.',
      glued: false,
      words: 4,
    })
    const part = novel.children[1] as GroupNode
    expect(part.children.map((c) => (c.kind === 'sheet' ? c.title : c.name))).toEqual([
      'The Station',
      'Opening',
    ])
  })

  it('works with no sidecars at all, ordering by name', async () => {
    const fs = new MemoryFileSystem({ '/Lib/P/b.md': 'B', '/Lib/P/a.md': 'A', '/Lib/z.md': 'Z' })
    const lib = await loadLibrary(fs, '/Lib')
    expect(lib.children.map((c) => c.name)).toEqual(['P', 'z.md'])
    const p = lib.children[0] as GroupNode
    expect(p.children.map((c) => c.name)).toEqual(['a.md', 'b.md'])
  })

  it('survives a hand-edited folder: new files appended, deleted ones dropped, junk ignored', async () => {
    const fs = new MemoryFileSystem({
      '/Lib/P/.writingapp.json': sidecar(['gone.md', 'b.md', 'a.md']),
      '/Lib/P/a.md': 'A',
      '/Lib/P/b.md': 'B',
      '/Lib/P/added-in-finder.md': 'New',
      '/Lib/P/image.png': 'binary',
      '/Lib/P/.DS_Store': '',
    })
    const p = (await loadLibrary(fs, '/Lib')).children[0] as GroupNode
    expect(p.children.map((c) => c.name)).toEqual(['b.md', 'a.md', 'added-in-finder.md'])
  })

  it('survives a malformed sidecar', async () => {
    const fs = new MemoryFileSystem({ '/Lib/P/.writingapp.json': '{oops', '/Lib/P/a.md': 'A' })
    const p = (await loadLibrary(fs, '/Lib')).children[0] as GroupNode
    expect(p.children.map((c) => c.name)).toEqual(['a.md'])
  })

  it('marks glued sheets, dropping flags that no longer apply', async () => {
    const fs = new MemoryFileSystem({
      '/Lib/P/.writingapp.json': sidecar(['a.md', 'b.md', 'G'], ['a.md', 'b.md']),
      '/Lib/P/a.md': 'A',
      '/Lib/P/b.md': 'B',
      '/Lib/P/G/c.md': 'C',
    })
    const p = (await loadLibrary(fs, '/Lib')).children[0] as GroupNode
    const glued = p.children.map((c) => c.kind === 'sheet' && c.glued)
    expect(glued).toEqual([true, false, false]) // b is followed by a group
  })

  it('gives empty sheets the Untitled title', async () => {
    const fs = new MemoryFileSystem({ '/Lib/empty.md': '' })
    const lib = await loadLibrary(fs, '/Lib')
    expect(lib.children[0]).toMatchObject({ title: 'Untitled', preview: '' })
  })

  it('accepts a trailing slash on the root and returns an empty group for an empty folder', async () => {
    const fs = new MemoryFileSystem()
    await fs.makeDir('/Lib')
    expect(await loadLibrary(fs, '/Lib/')).toEqual({
      kind: 'group',
      name: 'Lib',
      path: '/Lib',
      children: [],
    })
  })

  it('rejects when the root does not exist', async () => {
    await expect(loadLibrary(new MemoryFileSystem(), '/nope')).rejects.toThrow()
  })
})

describe('loadLibrary cache', () => {
  /** A MemoryFileSystem that reports a modified time and size, and counts reads of sheets. */
  function counting(files: Record<string, string>) {
    const mem = new MemoryFileSystem(files)
    const versions = new Map<string, number>()
    const reads: string[] = []
    const fs = Object.assign(Object.create(mem) as MemoryFileSystem, {
      async readText(path: string) {
        if (path.endsWith('.md')) reads.push(path)
        return mem.readText(path)
      },
      async writeText(path: string, text: string) {
        versions.set(path, (versions.get(path) ?? 0) + 1)
        return mem.writeText(path, text)
      },
      async fileTimes(path: string) {
        const text = await mem.readText(path)
        return { modified: 1000 + (versions.get(path) ?? 0), created: 1, size: text.length }
      },
    })
    return { fs, reads }
  }

  it('reads each sheet once and then only the ones that changed', async () => {
    const { fs, reads } = counting({ '/Lib/p/a.md': '# A\nfirst', '/Lib/p/b.md': '# B\nsecond' })
    const cache: SheetCache = new Map()
    const stats = { read: 0, cached: 0 }
    await loadLibrary(fs, '/Lib', { cache, stats })
    expect(stats).toEqual({ read: 2, cached: 0 })

    reads.length = 0
    const again = await loadLibrary(fs, '/Lib', { cache, stats })
    expect(reads).toEqual([])
    expect(stats).toEqual({ read: 0, cached: 2 })
    expect(((again.children[0] as GroupNode).children[0] as { title: string }).title).toBe('A')

    await fs.writeText('/Lib/p/a.md', '# A changed\nfirst')
    const third = await loadLibrary(fs, '/Lib', { cache, stats })
    expect(reads).toEqual(['/Lib/p/a.md'])
    expect(stats).toEqual({ read: 1, cached: 1 })
    expect(((third.children[0] as GroupNode).children[0] as { title: string }).title).toBe('A changed')
  })

  it('forgets sheets that are gone', async () => {
    const { fs } = counting({ '/Lib/p/a.md': '# A', '/Lib/p/b.md': '# B' })
    const cache: SheetCache = new Map()
    await loadLibrary(fs, '/Lib', { cache })
    expect(cache.size).toBe(2)
    await fs.trash('/Lib/p/b.md')
    await loadLibrary(fs, '/Lib', { cache })
    expect([...cache.keys()]).toEqual(['/Lib/p/a.md'])
  })

  it('always reads when the file system gives no sizes', async () => {
    const mem = new MemoryFileSystem({ '/Lib/p/a.md': '# A' })
    const cache: SheetCache = new Map()
    const stats = { read: 0, cached: 0 }
    await loadLibrary(mem, '/Lib', { cache, stats })
    await loadLibrary(mem, '/Lib', { cache, stats })
    expect(stats).toEqual({ read: 1, cached: 0 })
  })
})
