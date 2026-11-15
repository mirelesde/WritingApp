import { describe, expect, it } from 'vitest'
import { loadLibrary, type GroupNode } from './library'
import { createGroupUndoable, createSheet, createSheetUndoable, deleteNodeUndoable, moveNodesUndoable, renameGroupUndoable } from './operations'
import { MemoryFileSystem } from './testing/memoryFileSystem'
import { applyUndo, snapshotSidecar } from './undo'

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
    expect(paths).toEqual(['/Lib/Book/a 2.md'])
    expect(await fs.readText('/Lib/Book/a 2.md')).toBe('# A\n')
    expect(await shape(fs)).toEqual(['Book/', 'Book/a.md', 'Book/a 2.md', 'Book/b.md', 'Book/Part/', 'Book/Part/c.md', 'Other/', 'Other/a.md'])
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
    expect(paths).toEqual(['/Lib/Other/b.md', '/Lib/Other/a 2.md'])
    const tree = await loadLibrary(fs, '/Lib')
    const other = tree.children.find((c) => c.name === 'Other') as GroupNode
    expect(other.children.map((c) => c.name)).toEqual(['a 2.md', 'b.md', 'a.md'])
  })

  it('refuses to copy a group into itself', async () => {
    const fs = setup()
    const { copyNodes } = await import('./operations')
    await expect(copyNodes(fs, ['/Lib/Book'], '/Lib/Book/Part')).rejects.toThrow('into itself')
  })
})

describe('undoing an import', () => {
  it('trashes the new sheets and restores the group order', async () => {
    const fs = setup()
    const before = await shape(fs)
    const snapshot = await snapshotSidecar(fs, '/Lib/Book')
    const one = await createSheet(fs, '/Lib/Book', '# Imported one\n', 1)
    const two = await createSheet(fs, '/Lib/Book', '# Imported two\n', 2)
    expect(await shape(fs)).not.toEqual(before)
    await applyUndo(fs, [
      { kind: 'trash', path: one },
      { kind: 'trash', path: two },
      snapshot
    ])
    expect(await shape(fs)).toEqual(before)
  })
})

describe('undoing creating and renaming', () => {
  it('takes a new sheet back out and restores the order', async () => {
    const fs = setup()
    const before = await shape(fs)
    const { path, undo } = await createSheetUndoable(fs, '/Lib/Book', '', 1)
    expect((await shape(fs)).length).toBe(before.length + 1)
    await applyUndo(fs, undo)
    expect(await fs.exists(path)).toBe(false)
    expect(await shape(fs)).toEqual(before)
  })

  it('leaves a new sheet alone once it has text', async () => {
    const fs = setup()
    const { path, undo } = await createSheetUndoable(fs, '/Lib/Book', '')
    await fs.writeText(path, 'written since')
    await expect(applyUndo(fs, undo)).rejects.toThrow(/text in it/)
    expect(await fs.exists(path)).toBe(true)
  })

  it('removes a new group, and puts a renamed one back', async () => {
    const fs = setup()
    const before = await shape(fs)
    const made = await createGroupUndoable(fs, '/Lib/Book', 'Fresh')
    expect(await shape(fs)).toContain('Book/Fresh/')
    await applyUndo(fs, made.undo)
    expect(await shape(fs)).toEqual(before)

    const renamed = await renameGroupUndoable(fs, '/Lib/Book/Part', 'Chapter')
    expect(await shape(fs)).toContain('Book/Chapter/')
    await applyUndo(fs, renamed.undo)
    expect(await shape(fs)).toEqual(before)
  })

  it('has nothing to undo when the name is unchanged', async () => {
    const fs = setup()
    expect((await renameGroupUndoable(fs, '/Lib/Book/Part', 'Part')).undo).toEqual([])
  })
})
