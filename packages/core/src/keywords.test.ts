import { describe, expect, it } from 'vitest'
import { loadLibrary, type GroupNode, type SheetNode } from './library'
import { allSheets, cleanKeywords, filterToken, libraryKeywords, normalizeKeyword, parseFilter } from './keywords'
import { changeKeywords, copyNodes, mergeSheets, moveNodes, splitSheet, syncSheetName, deleteNode } from './operations'
import { MemoryFileSystem } from './testing/memoryFileSystem'
import { parseSidecar, reconcileFolder } from './sidecar'
import { applyUndo } from './undo'

const sidecar = (keywords: Record<string, string[]>, order = ['a.md', 'b.md', 'c.md']) =>
  JSON.stringify({ version: 1, order, glued: [], keywords })

const setup = () =>
  new MemoryFileSystem({
    '/Lib/.writingapp.json': JSON.stringify({ version: 1, order: ['One', 'Two'], glued: [] }),
    '/Lib/One/.writingapp.json': sidecar({ 'a.md': ['plot', 'Draft'], 'b.md': ['plot'] }),
    '/Lib/One/a.md': '# A\n\nalpha\n',
    '/Lib/One/b.md': '# B\n\nbeta\n',
    '/Lib/One/c.md': '# C\n\ngamma\n',
    '/Lib/Two/a.md': '# Other\n',
  })

async function sheet(fs: MemoryFileSystem, path: string): Promise<SheetNode> {
  const tree = (await loadLibrary(fs, '/Lib')) as GroupNode
  const found = allSheets(tree).find((s) => s.path === path)
  if (!found) throw new Error('missing ' + path)
  return found
}

describe('keyword text', () => {
  it('normalises and de-duplicates ignoring case', () => {
    expect(normalizeKeyword('  #  Big   plot, ')).toBe('Big plot')
    expect(cleanKeywords(['plot', 'Plot', ' ', 'arc', '#arc'])).toEqual(['arc', 'plot'])
  })
  it('splits a filter into keywords and text', () => {
    expect(parseFilter('cats #plot #big_arc dogs')).toEqual({ keywords: ['plot', 'big arc'], text: 'cats dogs' })
    expect(parseFilter('#')).toEqual({ keywords: [], text: '#' })
    expect(filterToken('big arc')).toBe('#big_arc')
  })
})

describe('sidecar keywords', () => {
  it('reads them, cleans them, and ignores bad shapes', () => {
    const parsed = parseSidecar(JSON.stringify({ keywords: { 'a.md': ['x', 'X', 3], 'b.md': [], 'c.md': 'no' } }))
    expect(parsed.keywords).toEqual({ 'a.md': ['x'] })
    expect(parseSidecar('{"keywords":[1]}').keywords).toBeUndefined()
  })
  it('drops keywords of sheets that are gone or are folders', () => {
    const parsed = parseSidecar(sidecar({ 'a.md': ['x'], 'gone.md': ['y'], Dir: ['z'] }))
    const { keywords } = reconcileFolder(parsed, [
      { name: 'a.md', kind: 'file' },
      { name: 'Dir', kind: 'directory' },
    ])
    expect(keywords).toEqual({ 'a.md': ['x'] })
  })
  it('shows up on loaded sheets and in the library list', async () => {
    const fs = setup()
    const tree = (await loadLibrary(fs, '/Lib')) as GroupNode
    expect((await sheet(fs, '/Lib/One/a.md')).keywords).toEqual(['Draft', 'plot'])
    expect((await sheet(fs, '/Lib/One/c.md')).keywords).toEqual([])
    expect(libraryKeywords(tree)).toEqual([
      { keyword: 'Draft', count: 1 },
      { keyword: 'plot', count: 2 },
    ])
  })
})

describe('changeKeywords', () => {
  it('adds to and removes from sheets in several groups, and undoes', async () => {
    const fs = setup()
    const { changed, undo } = await changeKeywords(fs, ['/Lib/One/c.md', '/Lib/Two/a.md'], ['New', 'new'], [])
    expect(changed).toBe(2)
    expect((await sheet(fs, '/Lib/Two/a.md')).keywords).toEqual(['New'])
    await changeKeywords(fs, ['/Lib/One/a.md'], [], ['PLOT'])
    expect((await sheet(fs, '/Lib/One/a.md')).keywords).toEqual(['Draft'])
    await applyUndo(fs, undo)
    expect((await sheet(fs, '/Lib/Two/a.md')).keywords).toEqual([])
    expect((await sheet(fs, '/Lib/One/c.md')).keywords).toEqual([])
  })
  it('reports when nothing would change', async () => {
    const fs = setup()
    await expect(changeKeywords(fs, ['/Lib/One/b.md'], ['plot'])).rejects.toThrow('already')
    await expect(changeKeywords(fs, ['/Lib/One/b.md'], [])).rejects.toThrow('No keywords')
  })
  it('refuses folders and unknown files', async () => {
    const fs = setup()
    await expect(changeKeywords(fs, ['/Lib/One'], ['x'])).rejects.toThrow('Not a sheet')
  })
})

describe('keywords follow their sheet', () => {
  it('when it is moved to another group, and back by undo', async () => {
    const fs = setup()
    const before = await fs.readText('/Lib/One/.writingapp.json')
    const { moveNodesUndoable } = await import('./operations')
    const { paths, undo } = await moveNodesUndoable(fs, ['/Lib/One/a.md'], '/Lib/Two')
    expect(paths).toEqual(['/Lib/Two/a-2.md'])
    expect((await sheet(fs, '/Lib/Two/a-2.md')).keywords).toEqual(['Draft', 'plot'])
    expect((await sheet(fs, '/Lib/One/b.md')).keywords).toEqual(['plot'])
    await applyUndo(fs, undo)
    expect(await fs.readText('/Lib/One/.writingapp.json')).toBe(before)
    expect((await sheet(fs, '/Lib/One/a.md')).keywords).toEqual(['Draft', 'plot'])
  })
  it('when reordered in its own group', async () => {
    const fs = setup()
    await moveNodes(fs, ['/Lib/One/a.md'], '/Lib/One', 2)
    expect((await sheet(fs, '/Lib/One/a.md')).keywords).toEqual(['Draft', 'plot'])
  })
  it('when copied, leaving the original alone', async () => {
    const fs = setup()
    const { paths } = await copyNodes(fs, ['/Lib/One/a.md'], '/Lib/One')
    expect((await sheet(fs, paths[0]!)).keywords).toEqual(['Draft', 'plot'])
    expect((await sheet(fs, '/Lib/One/a.md')).keywords).toEqual(['Draft', 'plot'])
  })
  it('when its file is renamed to follow its title', async () => {
    const fs = setup()
    await fs.writeText('/Lib/One/a.md', '# Brand New Title\n')
    const path = await syncSheetName(fs, '/Lib/One/a.md')
    expect(path).not.toBe('/Lib/One/a.md')
    expect((await sheet(fs, path)).keywords).toEqual(['Draft', 'plot'])
  })
  it('to both halves of a split', async () => {
    const fs = setup()
    const text = '# A\n\nalpha\n\n## Next\n\nmore\n'
    await fs.writeText('/Lib/One/a.md', text)
    const { path } = await splitSheet(fs, '/Lib/One/a.md', text, text.indexOf('## Next'))
    expect((await sheet(fs, path)).keywords).toEqual(['Draft', 'plot'])
    expect((await sheet(fs, '/Lib/One/a.md')).keywords).toEqual(['Draft', 'plot'])
  })
  it('as a union when sheets are merged', async () => {
    const fs = setup()
    await changeKeywords(fs, ['/Lib/One/c.md'], ['extra'])
    const { path } = await mergeSheets(fs, ['/Lib/One/a.md', '/Lib/One/b.md', '/Lib/One/c.md'])
    expect((await sheet(fs, path)).keywords).toEqual(['Draft', 'extra', 'plot'])
  })
  it('and are forgotten when the sheet is deleted', async () => {
    const fs = setup()
    await deleteNode(fs, '/Lib/One/a.md')
    expect(await fs.readText('/Lib/One/.writingapp.json')).not.toContain('Draft')
  })
})
