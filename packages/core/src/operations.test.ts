import { describe, expect, it } from 'vitest'
import { loadLibrary, type GroupNode } from './library'
import {
  createGroup,
  createSheet,
  deleteNode,
  moveNode,
  renameGroup,
  reorderNode,
} from './operations'
import { MemoryFileSystem } from './testing/memoryFileSystem'

const sidecar = (order: string[], glued: string[] = []) =>
  JSON.stringify({ version: 1, order, glued })

async function sidecarOf(fs: MemoryFileSystem, dir: string) {
  const { order, glued } = JSON.parse(await fs.readText(`${dir}/.writingapp.json`)) as {
    order: string[]
    glued: string[]
  }
  return { order, glued }
}

async function names(fs: MemoryFileSystem, dir: string) {
  const tree = await loadLibrary(fs, dir)
  return tree.children.map((c) => c.name)
}

describe('createSheet', () => {
  it('writes the file, named from its first line, and lists it last', async () => {
    const fs = new MemoryFileSystem({ '/Lib/a.md': 'A' })
    const path = await createSheet(fs, '/Lib', '# The Station\n\nText')
    expect(path).toBe('/Lib/the-station.md')
    expect(await fs.readText(path)).toBe('# The Station\n\nText')
    expect(await sidecarOf(fs, '/Lib')).toEqual({ order: ['a.md', 'the-station.md'], glued: [] })
  })

  it('inserts at an index and clamps out-of-range ones', async () => {
    const fs = new MemoryFileSystem({ '/Lib/a.md': 'A', '/Lib/b.md': 'B' })
    await createSheet(fs, '/Lib', 'X', 1)
    await createSheet(fs, '/Lib', 'Y', 99)
    await createSheet(fs, '/Lib', 'Z', -5)
    expect(await names(fs, '/Lib')).toEqual(['z.md', 'a.md', 'x.md', 'b.md', 'y.md'])
  })

  it('creates untitled sheets with numeric suffixes', async () => {
    const fs = new MemoryFileSystem()
    await fs.makeDir('/Lib')
    await createSheet(fs, '/Lib')
    await createSheet(fs, '/Lib')
    expect(await names(fs, '/Lib')).toEqual(['untitled.md', 'untitled-2.md'])
  })

  it('does not overwrite a file added outside the app', async () => {
    const fs = new MemoryFileSystem({ '/Lib/notes.md': 'mine' })
    const path = await createSheet(fs, '/Lib', 'Notes')
    expect(path).toBe('/Lib/notes-2.md')
    expect(await fs.readText('/Lib/notes.md')).toBe('mine')
  })

  it('breaks a glue run it is inserted into', async () => {
    const fs = new MemoryFileSystem({
      '/Lib/.writingapp.json': sidecar(['a.md', 'b.md'], ['a.md']),
      '/Lib/a.md': 'A',
      '/Lib/b.md': 'B',
    })
    await createSheet(fs, '/Lib', 'X', 1)
    expect(await sidecarOf(fs, '/Lib')).toEqual({ order: ['a.md', 'x.md', 'b.md'], glued: [] })
  })

  it('keeps glue elsewhere in the folder', async () => {
    const fs = new MemoryFileSystem({
      '/Lib/.writingapp.json': sidecar(['a.md', 'b.md'], ['a.md']),
      '/Lib/a.md': 'A',
      '/Lib/b.md': 'B',
    })
    await createSheet(fs, '/Lib', 'X')
    expect((await sidecarOf(fs, '/Lib')).glued).toEqual(['a.md'])
  })
})

describe('createGroup', () => {
  it('creates a folder and lists it', async () => {
    const fs = new MemoryFileSystem({ '/Lib/a.md': 'A' })
    const path = await createGroup(fs, '/Lib', 'Part One')
    expect(path).toBe('/Lib/Part One')
    expect(await fs.exists(path)).toBe(true)
    expect(await sidecarOf(fs, '/Lib')).toEqual({ order: ['a.md', 'Part One'], glued: [] })
  })

  it('defaults the name and de-duplicates it', async () => {
    const fs = new MemoryFileSystem()
    await fs.makeDir('/Lib')
    expect(await createGroup(fs, '/Lib')).toBe('/Lib/Untitled Group')
    expect(await createGroup(fs, '/Lib')).toBe('/Lib/Untitled Group 2')
  })

  it('trims the name and rejects invalid ones', async () => {
    const fs = new MemoryFileSystem()
    await fs.makeDir('/Lib')
    expect(await createGroup(fs, '/Lib', '  Act I  ')).toBe('/Lib/Act I')
    await expect(createGroup(fs, '/Lib', '   ')).rejects.toThrow()
    await expect(createGroup(fs, '/Lib', 'a/b')).rejects.toThrow()
    await expect(createGroup(fs, '/Lib', '.hidden')).rejects.toThrow()
  })

  it('inserts at an index', async () => {
    const fs = new MemoryFileSystem({ '/Lib/a.md': 'A', '/Lib/b.md': 'B' })
    await createGroup(fs, '/Lib', 'G', 1)
    expect(await names(fs, '/Lib')).toEqual(['a.md', 'G', 'b.md'])
  })
})

describe('renameGroup', () => {
  it('renames in place, keeping position and contents', async () => {
    const fs = new MemoryFileSystem({
      '/Lib/.writingapp.json': sidecar(['a.md', 'Old', 'b.md']),
      '/Lib/a.md': 'A',
      '/Lib/b.md': 'B',
      '/Lib/Old/x.md': 'X',
    })
    expect(await renameGroup(fs, '/Lib/Old', 'New')).toBe('/Lib/New')
    expect(await fs.readText('/Lib/New/x.md')).toBe('X')
    expect(await fs.exists('/Lib/Old')).toBe(false)
    expect((await sidecarOf(fs, '/Lib')).order).toEqual(['a.md', 'New', 'b.md'])
  })

  it('refuses a name a sibling already has, ignoring case', async () => {
    const fs = new MemoryFileSystem({ '/Lib/A/x.md': '', '/Lib/B/y.md': '' })
    await expect(renameGroup(fs, '/Lib/A', 'b')).rejects.toThrow(/already exists/)
    expect(await fs.exists('/Lib/A')).toBe(true)
  })

  it('refuses to rename a sheet or a missing path', async () => {
    const fs = new MemoryFileSystem({ '/Lib/a.md': 'A' })
    await expect(renameGroup(fs, '/Lib/a.md', 'b')).rejects.toThrow(/Not a group/)
    await expect(renameGroup(fs, '/Lib/nope', 'b')).rejects.toThrow()
  })

  it('does nothing when the name is unchanged', async () => {
    const fs = new MemoryFileSystem({ '/Lib/A/x.md': '' })
    expect(await renameGroup(fs, '/Lib/A', 'A')).toBe('/Lib/A')
  })
})

describe('deleteNode', () => {
  it('trashes a sheet and removes it from the sidecar', async () => {
    const fs = new MemoryFileSystem({
      '/Lib/.writingapp.json': sidecar(['a.md', 'b.md']),
      '/Lib/a.md': 'A',
      '/Lib/b.md': 'B',
    })
    await deleteNode(fs, '/Lib/a.md')
    expect(fs.trashed).toEqual(['/Lib/a.md'])
    expect(await fs.exists('/Lib/a.md')).toBe(false)
    expect((await sidecarOf(fs, '/Lib')).order).toEqual(['b.md'])
  })

  it('trashes a group with everything in it', async () => {
    const fs = new MemoryFileSystem({ '/Lib/G/x.md': 'X', '/Lib/a.md': 'A' })
    await deleteNode(fs, '/Lib/G')
    expect(fs.trashed).toEqual(['/Lib/G'])
    expect(await names(fs, '/Lib')).toEqual(['a.md'])
  })

  it('does not leave a glue flag pointing at a different sheet', async () => {
    const fs = new MemoryFileSystem({
      '/Lib/.writingapp.json': sidecar(['a.md', 'b.md', 'c.md'], ['a.md', 'b.md']),
      '/Lib/a.md': 'A',
      '/Lib/b.md': 'B',
      '/Lib/c.md': 'C',
    })
    await deleteNode(fs, '/Lib/b.md')
    expect(await sidecarOf(fs, '/Lib')).toEqual({ order: ['a.md', 'c.md'], glued: [] })
  })

  it('rejects for a missing path without touching the sidecar', async () => {
    const fs = new MemoryFileSystem({ '/Lib/a.md': 'A' })
    await expect(deleteNode(fs, '/Lib/nope.md')).rejects.toThrow()
    expect(await fs.exists('/Lib/.writingapp.json')).toBe(false)
  })
})

describe('moveNode', () => {
  it('moves a sheet to another group at an index, updating both sidecars', async () => {
    const fs = new MemoryFileSystem({
      '/Lib/.writingapp.json': sidecar(['G', 'a.md']),
      '/Lib/a.md': 'A',
      '/Lib/G/.writingapp.json': sidecar(['x.md', 'y.md']),
      '/Lib/G/x.md': 'X',
      '/Lib/G/y.md': 'Y',
    })
    const path = await moveNode(fs, '/Lib/a.md', '/Lib/G', 1)
    expect(path).toBe('/Lib/G/a.md')
    expect(await fs.readText(path)).toBe('A')
    expect(await fs.exists('/Lib/a.md')).toBe(false)
    expect((await sidecarOf(fs, '/Lib')).order).toEqual(['G'])
    expect((await sidecarOf(fs, '/Lib/G')).order).toEqual(['x.md', 'a.md', 'y.md'])
  })

  it('appends when no index is given', async () => {
    const fs = new MemoryFileSystem({ '/Lib/a.md': 'A', '/Lib/G/x.md': 'X' })
    await moveNode(fs, '/Lib/a.md', '/Lib/G')
    expect((await sidecarOf(fs, '/Lib/G')).order).toEqual(['x.md', 'a.md'])
  })

  it('moves a group with its contents', async () => {
    const fs = new MemoryFileSystem({ '/Lib/P/A/x.md': 'X', '/Lib/Q/y.md': 'Y' })
    const path = await moveNode(fs, '/Lib/P/A', '/Lib/Q', 0)
    expect(path).toBe('/Lib/Q/A')
    expect(await fs.readText('/Lib/Q/A/x.md')).toBe('X')
    expect((await sidecarOf(fs, '/Lib/Q')).order).toEqual(['A', 'y.md'])
  })

  it('renames on a name clash instead of overwriting', async () => {
    const fs = new MemoryFileSystem({ '/Lib/a.md': 'moving', '/Lib/G/a.md': 'existing' })
    const path = await moveNode(fs, '/Lib/a.md', '/Lib/G')
    expect(path).toBe('/Lib/G/a-2.md')
    expect(await fs.readText('/Lib/G/a.md')).toBe('existing')
    expect(await fs.readText('/Lib/G/a-2.md')).toBe('moving')
  })

  it('renames a clashing group with a space suffix', async () => {
    const fs = new MemoryFileSystem({ '/Lib/A/x.md': 'X', '/Lib/G/A/y.md': 'Y' })
    expect(await moveNode(fs, '/Lib/A', '/Lib/G')).toBe('/Lib/G/A 2')
  })

  it('refuses to move a group into itself or its descendant', async () => {
    const fs = new MemoryFileSystem({ '/Lib/A/B/x.md': 'X' })
    await expect(moveNode(fs, '/Lib/A', '/Lib/A')).rejects.toThrow(/itself/)
    await expect(moveNode(fs, '/Lib/A', '/Lib/A/B')).rejects.toThrow(/itself/)
    expect(await fs.exists('/Lib/A/B/x.md')).toBe(true)
  })

  it('does not mistake a sibling with a shared name prefix for a descendant', async () => {
    const fs = new MemoryFileSystem({ '/Lib/A/x.md': 'X', '/Lib/AB/y.md': 'Y' })
    expect(await moveNode(fs, '/Lib/A', '/Lib/AB')).toBe('/Lib/AB/A')
  })

  it('rejects a missing target group or source', async () => {
    const fs = new MemoryFileSystem({ '/Lib/a.md': 'A' })
    await expect(moveNode(fs, '/Lib/a.md', '/Lib/nope')).rejects.toThrow()
    await expect(moveNode(fs, '/Lib/gone.md', '/Lib')).rejects.toThrow()
    expect(await fs.exists('/Lib/a.md')).toBe(true)
  })

  it('refuses hidden or non-library entries', async () => {
    const fs = new MemoryFileSystem({ '/Lib/pic.png': '', '/Lib/G/x.md': '' })
    await expect(moveNode(fs, '/Lib/pic.png', '/Lib/G')).rejects.toThrow(/library/)
  })

  it('breaks glue on both sides of the move', async () => {
    const fs = new MemoryFileSystem({
      '/Lib/.writingapp.json': sidecar(['a.md', 'b.md', 'c.md', 'G'], ['a.md', 'b.md']),
      '/Lib/a.md': 'A',
      '/Lib/b.md': 'B',
      '/Lib/c.md': 'C',
      '/Lib/G/x.md': 'X',
    })
    await moveNode(fs, '/Lib/b.md', '/Lib/G', 0)
    expect(await sidecarOf(fs, '/Lib')).toEqual({ order: ['a.md', 'c.md', 'G'], glued: [] })
    expect((await sidecarOf(fs, '/Lib/G')).glued).toEqual([])
  })
})

describe('reorderNode', () => {
  const setup = () =>
    new MemoryFileSystem({
      '/Lib/.writingapp.json': sidecar(['a.md', 'b.md', 'c.md']),
      '/Lib/a.md': 'A',
      '/Lib/b.md': 'B',
      '/Lib/c.md': 'C',
    })

  it('moves a sheet earlier', async () => {
    const fs = setup()
    await reorderNode(fs, '/Lib/c.md', 0)
    expect(await names(fs, '/Lib')).toEqual(['c.md', 'a.md', 'b.md'])
  })

  it('moves a sheet later, with the index as its final position', async () => {
    const fs = setup()
    await reorderNode(fs, '/Lib/a.md', 2)
    expect(await names(fs, '/Lib')).toEqual(['b.md', 'c.md', 'a.md'])
  })

  it('clamps out-of-range indexes', async () => {
    const fs = setup()
    await reorderNode(fs, '/Lib/a.md', 99)
    expect(await names(fs, '/Lib')).toEqual(['b.md', 'c.md', 'a.md'])
    await reorderNode(fs, '/Lib/a.md', -1)
    expect(await names(fs, '/Lib')).toEqual(['a.md', 'b.md', 'c.md'])
  })

  it('leaves everything untouched when the position does not change', async () => {
    const fs = new MemoryFileSystem({
      '/Lib/.writingapp.json': sidecar(['a.md', 'b.md'], ['a.md']),
      '/Lib/a.md': 'A',
      '/Lib/b.md': 'B',
    })
    await reorderNode(fs, '/Lib/b.md', 1)
    expect((await sidecarOf(fs, '/Lib')).glued).toEqual(['a.md'])
  })

  it('works on groups and makes a hand-added file explicit in the sidecar', async () => {
    const fs = new MemoryFileSystem({ '/Lib/a.md': 'A', '/Lib/G/x.md': 'X', '/Lib/new.md': 'N' })
    await reorderNode(fs, '/Lib/G', 0)
    expect(await sidecarOf(fs, '/Lib')).toEqual({ order: ['G', 'a.md', 'new.md'], glued: [] })
  })
})

describe('a full session', () => {
  it('builds and restructures a project, and loads back as expected', async () => {
    const fs = new MemoryFileSystem()
    await fs.makeDir('/Lib')
    const novel = await createGroup(fs, '/Lib', 'Novel')
    const part = await createGroup(fs, novel, 'Part One')
    const s1 = await createSheet(fs, part, '# Opening\n\nIt was raining.')
    await createSheet(fs, part, '# The Station')
    await createSheet(fs, novel, '# Notes')
    await moveNode(fs, s1, novel, 0)
    await renameGroup(fs, part, 'Act I')
    const lib = await loadLibrary(fs, '/Lib')
    const n = lib.children[0] as GroupNode
    expect(n.children.map((c) => c.name)).toEqual(['opening.md', 'Act I', 'notes.md'])
    const act = n.children[1] as GroupNode
    expect(act.children.map((c) => c.name)).toEqual(['the-station.md'])
  })
})
