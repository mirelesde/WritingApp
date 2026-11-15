import { describe, expect, it } from 'vitest'
import { loadLibrary, type GroupNode } from './library'
import { glueSheets, mergeSheets, splitSheet, unglueSheets } from './operations'
import { MemoryFileSystem } from './testing/memoryFileSystem'
import { applyUndo } from './undo'

const sidecar = (order: string[], glued: string[] = []) =>
  JSON.stringify({ version: 1, order, glued })

async function state(fs: MemoryFileSystem, dir = '/Lib') {
  const tree = (await loadLibrary(fs, dir)) as GroupNode
  return tree.children.map((c) => (c.kind === 'sheet' && c.glued ? c.name + '+' : c.name))
}

async function files(fs: MemoryFileSystem, dir = '/Lib') {
  return Object.fromEntries(
    await Promise.all(
      (await fs.list(dir))
        .filter((e) => e.kind === 'file' && e.name.endsWith('.md'))
        .map(async (e) => [e.name, await fs.readText(`${dir}/${e.name}`)]),
    ),
  )
}

const setup = (glued: string[] = []) =>
  new MemoryFileSystem({
    '/Lib/.writingapp.json': sidecar(['a.md', 'b.md', 'c.md', 'd.md'], glued),
    '/Lib/a.md': '# A\n\nalpha\n',
    '/Lib/b.md': '# B\n\nbeta\n',
    '/Lib/c.md': '# C\n\ngamma\n',
    '/Lib/d.md': '# D\n\ndelta\n',
  })

describe('splitSheet', () => {
  const text = '# Chapter\n\nFirst part.\n\n## Next\n\nSecond part.\n'
  const offset = text.indexOf('## Next')

  it('writes the head back and creates the tail as the next sheet', async () => {
    const fs = new MemoryFileSystem({ '/Lib/a.md': text, '/Lib/z.md': 'Z' })
    const { path } = await splitSheet(fs, '/Lib/a.md', text, offset)
    expect(path).toBe('/Lib/Next.md')
    expect(await fs.readText('/Lib/a.md')).toBe('# Chapter\n\nFirst part.\n')
    expect(await fs.readText(path)).toBe('## Next\n\nSecond part.\n')
    expect(await state(fs)).toEqual(['a.md', 'Next.md', 'z.md'])
  })

  it('splits the text it is given, not what is on disk', async () => {
    const fs = new MemoryFileSystem({ '/Lib/a.md': 'stale' })
    await splitSheet(fs, '/Lib/a.md', 'one\n\ntwo', 5)
    expect(await fs.readText('/Lib/a.md')).toBe('one\n')
    expect(await fs.readText('/Lib/two.md')).toBe('two')
  })

  it('strips the blank space at the cut from both halves', async () => {
    const fs = new MemoryFileSystem({ '/Lib/a.md': '' })
    await splitSheet(fs, '/Lib/a.md', 'head   \n\n\n   tail', 8)
    expect(await fs.readText('/Lib/a.md')).toBe('head\n')
    expect(await fs.readText('/Lib/tail.md')).toBe('tail')
  })

  it('refuses to split off nothing, changing nothing', async () => {
    const fs = new MemoryFileSystem({ '/Lib/a.md': 'x\n' })
    await expect(splitSheet(fs, '/Lib/a.md', 'text\n', 0)).rejects.toThrow(/Nothing/)
    await expect(splitSheet(fs, '/Lib/a.md', 'text\n', 99)).rejects.toThrow(/Nothing/)
    await expect(splitSheet(fs, '/Lib/a.md', 'text\n  \n', 4)).rejects.toThrow(/Nothing/)
    expect(await fs.readText('/Lib/a.md')).toBe('x\n')
    expect(await fs.exists('/Lib/.writingapp.json')).toBe(false)
  })

  it('hands the original sheet its glue to the next sheet over to the new one', async () => {
    const fs = setup(['b.md'])
    await splitSheet(fs, '/Lib/b.md', '# B\n\nbeta\n\nmore', 11)
    expect(await state(fs)).toEqual(['a.md', 'b.md', 'more.md+', 'c.md', 'd.md'])
  })

  it('leaves a run before it glued', async () => {
    const fs = setup(['a.md'])
    await splitSheet(fs, '/Lib/b.md', '# B\n\nbeta\n\nmore', 11)
    // a was glued to b; the new sheet is inserted after b, so a→b stays.
    expect(await state(fs)).toEqual(['a.md+', 'b.md', 'more.md', 'c.md', 'd.md'])
  })

  it('can be undone completely', async () => {
    const fs = setup(['b.md'])
    const before = await files(fs)
    const text = await fs.readText('/Lib/b.md')
    const { undo } = await splitSheet(fs, '/Lib/b.md', text, 3)
    await applyUndo(fs, undo)
    expect(await files(fs)).toEqual(before)
    expect(await state(fs)).toEqual(['a.md', 'b.md+', 'c.md', 'd.md'])
    expect(fs.trashed).toHaveLength(1)
  })
})

describe('mergeSheets', () => {
  it('joins the text into the first sheet and trashes the rest', async () => {
    const fs = setup()
    const { path } = await mergeSheets(fs, ['/Lib/b.md', '/Lib/c.md'])
    expect(path).toBe('/Lib/b.md')
    expect(await fs.readText('/Lib/b.md')).toBe('# B\n\nbeta\n\n# C\n\ngamma\n')
    expect(fs.trashed).toEqual(['/Lib/c.md'])
    expect(await state(fs)).toEqual(['a.md', 'b.md', 'd.md'])
  })

  it('merges in display order whatever order the paths come in', async () => {
    const fs = setup()
    const { path } = await mergeSheets(fs, ['/Lib/d.md', '/Lib/a.md', '/Lib/c.md'])
    expect(path).toBe('/Lib/a.md')
    expect(await fs.readText('/Lib/a.md')).toBe('# A\n\nalpha\n\n# C\n\ngamma\n\n# D\n\ndelta\n')
    expect(await state(fs)).toEqual(['a.md', 'b.md'])
  })

  it('skips empty sheets instead of adding blank gaps', async () => {
    const fs = setup()
    await fs.writeText('/Lib/b.md', '\n')
    await mergeSheets(fs, ['/Lib/a.md', '/Lib/b.md', '/Lib/c.md'])
    expect(await fs.readText('/Lib/a.md')).toBe('# A\n\nalpha\n\n# C\n\ngamma\n')
  })

  it('keeps the last sheet’s glue to the next sheet when they were adjacent', async () => {
    const fs = setup(['a.md', 'b.md', 'c.md'])
    await mergeSheets(fs, ['/Lib/a.md', '/Lib/b.md'])
    // a+b merged; b was glued to c, so the merged sheet stays glued to c, and c to d.
    expect(await state(fs)).toEqual(['a.md+', 'c.md+', 'd.md'])
  })

  it('drops the glue it cannot honour when the sheets were not adjacent', async () => {
    const fs = setup(['c.md'])
    await mergeSheets(fs, ['/Lib/a.md', '/Lib/c.md'])
    expect(await state(fs)).toEqual(['a.md', 'b.md', 'd.md'])
  })

  it('needs two or more distinct sheets in one group', async () => {
    const fs = setup()
    await fs.makeDir('/Lib/G')
    await fs.writeText('/Lib/G/x.md', 'X')
    await expect(mergeSheets(fs, ['/Lib/a.md'])).rejects.toThrow(/at least two/)
    await expect(mergeSheets(fs, ['/Lib/a.md', '/Lib/a.md'])).rejects.toThrow(/at least two/)
    await expect(mergeSheets(fs, ['/Lib/a.md', '/Lib/G/x.md'])).rejects.toThrow(/same group/)
    await expect(mergeSheets(fs, ['/Lib/a.md', '/Lib/G'])).rejects.toThrow()
    expect(await state(fs)).toContain('b.md')
  })

  it('can be undone completely', async () => {
    const fs = setup(['b.md'])
    const before = await files(fs)
    const { undo } = await mergeSheets(fs, ['/Lib/a.md', '/Lib/b.md', '/Lib/c.md'])
    await applyUndo(fs, undo)
    expect(await files(fs)).toEqual(before)
    expect(await state(fs)).toEqual(['a.md', 'b.md+', 'c.md', 'd.md'])
  })
})

describe('glueSheets', () => {
  it('glues each selected sheet to the next selected one', async () => {
    const fs = setup()
    await glueSheets(fs, ['/Lib/a.md', '/Lib/b.md', '/Lib/c.md'])
    expect(await state(fs)).toEqual(['a.md+', 'b.md+', 'c.md', 'd.md'])
  })

  it('glues a single sheet to the one after it', async () => {
    const fs = setup()
    await glueSheets(fs, ['/Lib/b.md'])
    expect(await state(fs)).toEqual(['a.md', 'b.md+', 'c.md', 'd.md'])
  })

  it('ignores selected sheets that do not touch, but needs at least one pair', async () => {
    const fs = setup()
    await glueSheets(fs, ['/Lib/a.md', '/Lib/b.md', '/Lib/d.md'])
    expect(await state(fs)).toEqual(['a.md+', 'b.md', 'c.md', 'd.md'])
    await expect(glueSheets(fs, ['/Lib/a.md', '/Lib/c.md'])).rejects.toThrow(/next to each other/)
  })

  it('cannot glue the last sheet, or one followed by a group', async () => {
    const fs = setup()
    await expect(glueSheets(fs, ['/Lib/d.md'])).rejects.toThrow()
    await fs.makeDir('/Lib/G')
    await fs.writeText('/Lib/.writingapp.json', sidecar(['a.md', 'G', 'b.md', 'c.md', 'd.md']))
    await expect(glueSheets(fs, ['/Lib/a.md'])).rejects.toThrow()
  })

  it('can be undone', async () => {
    const fs = setup(['a.md'])
    const { undo } = await glueSheets(fs, ['/Lib/b.md', '/Lib/c.md'])
    expect(await state(fs)).toEqual(['a.md+', 'b.md+', 'c.md', 'd.md'])
    await applyUndo(fs, undo)
    expect(await state(fs)).toEqual(['a.md+', 'b.md', 'c.md', 'd.md'])
  })

  it('does not touch the files', async () => {
    const fs = setup()
    const before = await files(fs)
    await glueSheets(fs, ['/Lib/a.md', '/Lib/b.md'])
    expect(await files(fs)).toEqual(before)
  })
})

describe('unglueSheets', () => {
  it('detaches a sheet from both neighbours', async () => {
    const fs = setup(['a.md', 'b.md', 'c.md'])
    await unglueSheets(fs, ['/Lib/b.md'])
    expect(await state(fs)).toEqual(['a.md', 'b.md', 'c.md+', 'd.md'])
  })

  it('breaks a whole selected run apart', async () => {
    const fs = setup(['a.md', 'b.md', 'c.md'])
    await unglueSheets(fs, ['/Lib/a.md', '/Lib/b.md', '/Lib/c.md'])
    expect(await state(fs)).toEqual(['a.md', 'b.md', 'c.md', 'd.md'])
  })

  it('complains when nothing was glued', async () => {
    const fs = setup()
    await expect(unglueSheets(fs, ['/Lib/a.md'])).rejects.toThrow(/not glued/)
  })

  it('can be undone', async () => {
    const fs = setup(['a.md', 'b.md'])
    const { undo } = await unglueSheets(fs, ['/Lib/a.md', '/Lib/b.md'])
    await applyUndo(fs, undo)
    expect(await state(fs)).toEqual(['a.md+', 'b.md+', 'c.md', 'd.md'])
  })
})
