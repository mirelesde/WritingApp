import { describe, expect, it } from 'vitest'
import { loadLibrary, type GroupNode } from './library'
import { deleteNodeUndoable, moveNodesUndoable } from './operations'
import { MemoryFileSystem } from './testing/memoryFileSystem'
import { applyUndo } from './undo'

const sidecar = (order: string[], glued: string[] = []) =>
  JSON.stringify({ version: 1, order, glued })

const setup = () =>
  new MemoryFileSystem({
    '/Lib/.writingapp.json': sidecar(['Book', 'Other']),
    '/Lib/Book/.writingapp.json': sidecar(['a.md', 'b.md', 'Part'], ['a.md']),
    '/Lib/Book/a.md': '# A\n',
    '/Lib/Book/b.md': '# B\n',
    '/Lib/Book/Part/.writingapp.json': sidecar(['c.md']),
    '/Lib/Book/Part/c.md': '# C\n',
    '/Lib/Other/.writingapp.json': sidecar(['a.md']),
    '/Lib/Other/a.md': '# Other A\n',
  })

const shape = async (fs: MemoryFileSystem) => {
  const out: string[] = []
  const walk = (g: GroupNode, pre: string): void => {
    for (const c of g.children) {
      if (c.kind === 'group') {
        out.push(pre + c.name + '/')
        walk(c, pre + c.name + '/')
      } else out.push(pre + c.name + (c.glued ? '+' : ''))
    }
  }
  walk((await loadLibrary(fs, '/Lib')) as GroupNode, '')
  return out
}

describe('moveNodesUndoable', () => {
  it('undoes a move to another group, including a name clash', async () => {
    const fs = setup()
    const before = await shape(fs)
    const { paths, undo } = await moveNodesUndoable(fs, ['/Lib/Book/a.md', '/Lib/Book/b.md'], '/Lib/Other')
    expect(paths[0]).not.toBe('/Lib/Other/a.md') // clashed, renamed
    expect(await shape(fs)).not.toEqual(before)
    await applyUndo(fs, undo)
    expect(await shape(fs)).toEqual(before)
  })

  it('undoes a reorder within a group', async () => {
    const fs = setup()
    const before = await shape(fs)
    const { undo } = await moveNodesUndoable(fs, ['/Lib/Book/b.md'], '/Lib/Book', 0)
    expect(await shape(fs)).not.toEqual(before)
    await applyUndo(fs, undo)
    expect(await shape(fs)).toEqual(before)
  })

  it('undoes moving a group', async () => {
    const fs = setup()
    const before = await shape(fs)
    const { undo } = await moveNodesUndoable(fs, ['/Lib/Book/Part'], '/Lib/Other')
    await applyUndo(fs, undo)
    expect(await shape(fs)).toEqual(before)
    expect(await fs.readText('/Lib/Book/Part/c.md')).toBe('# C\n')
  })
})

describe('deleteNodeUndoable', () => {
  it('brings back a deleted sheet with its place and glue', async () => {
    const fs = setup()
    const before = await shape(fs)
    const undo = await deleteNodeUndoable(fs, '/Lib/Book/a.md')
    expect(await shape(fs)).not.toContain('Book/a.md+')
    await applyUndo(fs, undo)
    expect(await shape(fs)).toEqual(before)
    expect(await fs.readText('/Lib/Book/a.md')).toBe('# A\n')
  })

  it('brings back a whole group with its contents', async () => {
    const fs = setup()
    const before = await shape(fs)
    const undo = await deleteNodeUndoable(fs, '/Lib/Book')
    expect(await shape(fs)).toEqual(['Other/', 'Other/a.md'])
    await applyUndo(fs, undo)
    expect(await shape(fs)).toEqual(before)
    expect(await fs.readText('/Lib/Book/Part/c.md')).toBe('# C\n')
  })
})

describe('copyNodes', () => {
  it('duplicates a sheet beside the original and undoes it', async () => {
    const fs = setup()
    const before = await shape(fs)
    const { copyNodes } = await import('./operations')
    const { paths, undo } = await copyNodes(fs, ['/Lib/Book/a.md'], '/Lib/Book', 1)
    expect(paths).toEqual(['/Lib/Book/a-2.md'])
    expect(await fs.readText('/Lib/Book/a-2.md')).toBe('# A\n')
    expect(await shape(fs)).toEqual(['Book/', 'Book/a.md', 'Book/a-2.md', 'Book/b.md', 'Book/Part/', 'Book/Part/c.md', 'Other/', 'Other/a.md'])
    await applyUndo(fs, undo)
    expect(await shape(fs)).toEqual(before)
  })

  it('copies a whole group, with its contents, into another group', async () => {
    const fs = setup()
    const { copyNodes } = await import('./operations')
    const { paths, undo } = await copyNodes(fs, ['/Lib/Book/Part'], '/Lib/Other')
    expect(paths).toEqual(['/Lib/Other/Part'])
    expect(await fs.readText('/Lib/Other/Part/c.md')).toBe('# C\n')
    expect(await fs.readText('/Lib/Book/Part/c.md')).toBe('# C\n')
    await applyUndo(fs, undo)
    expect(await fs.exists('/Lib/Other/Part')).toBe(false)
  })

  it('copies several sheets as a block in their own order', async () => {
    const fs = setup()
    const { copyNodes } = await import('./operations')
    const { paths } = await copyNodes(fs, ['/Lib/Book/b.md', '/Lib/Book/a.md'], '/Lib/Other', 0)
    expect(paths).toEqual(['/Lib/Other/b.md', '/Lib/Other/a-2.md'])
    const tree = await loadLibrary(fs, '/Lib')
    const other = tree.children.find((c) => c.name === 'Other') as GroupNode
    expect(other.children.map((c) => c.name)).toEqual(['a-2.md', 'b.md', 'a.md'])
  })

  it('refuses to copy a group into itself', async () => {
    const fs = setup()
    const { copyNodes } = await import('./operations')
    await expect(copyNodes(fs, ['/Lib/Book'], '/Lib/Book/Part')).rejects.toThrow('into itself')
  })
})

describe('pictures follow a sheet to another group', () => {
  it('moves with copies and undoes cleanly', async () => {
    const fs = new MemoryFileSystem({ '/lib/A/s.md': '![p](p.png)', '/lib/B/t.md': 'x' })
    await fs.writeBinary('/lib/A/p.png', new Uint8Array([1, 2]))
    const { moveNodesUndoable, applyUndo } = await import('./index')
    const { paths, undo } = await moveNodesUndoable(fs, ['/lib/A/s.md'], '/lib/B')
    expect(paths).toEqual(['/lib/B/s.md'])
    expect(Array.from(await fs.readBinary('/lib/B/p.png'))).toEqual([1, 2])
    await applyUndo(fs, undo)
    expect(await fs.exists('/lib/B/s.md')).toBe(false)
    expect(await fs.readText('/lib/A/s.md')).toBe('![p](p.png)')
  })

  it('copies take them too', async () => {
    const fs = new MemoryFileSystem({ '/lib/A/s.md': '![p](p.png)', '/lib/B/t.md': 'x' })
    await fs.writeBinary('/lib/A/p.png', new Uint8Array([7]))
    const { copyNodes } = await import('./index')
    await copyNodes(fs, ['/lib/A/s.md'], '/lib/B')
    expect(Array.from(await fs.readBinary('/lib/B/p.png'))).toEqual([7])
  })
})
