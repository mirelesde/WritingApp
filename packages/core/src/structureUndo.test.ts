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
