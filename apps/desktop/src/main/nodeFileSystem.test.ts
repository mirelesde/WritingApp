import { mkdtemp, mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createGroup,
  createSheet,
  deleteNode,
  loadLibrary,
  moveNode,
  type FileSystem,
  type GroupNode
} from '@writingapp/core'
import { createNodeFileSystem } from './nodeFileSystem'

let dir: string
let trashDir: string
let trashed: string[]
let fs: FileSystem

beforeEach(async () => {
  const base = await mkdtemp(join(tmpdir(), 'writingapp-'))
  dir = join(base, 'Lib')
  trashDir = join(base, 'Trash')
  await mkdir(dir)
  await mkdir(trashDir)
  trashed = []
  // Stand-in for shell.trashItem: move the item into a folder we control.
  fs = createNodeFileSystem(async (path) => {
    trashed.push(path)
    await rename(path, join(trashDir, `${trashed.length}-${path.split('/').pop()}`))
  })
})

afterEach(async () => {
  await rm(join(dir, '..'), { recursive: true, force: true })
})

const children = (g: GroupNode): string[] => g.children.map((c) => c.name)

describe('createNodeFileSystem', () => {
  it('writes, reads and overwrites text, leaving no temporary files', async () => {
    await fs.writeText(`${dir}/a.md`, 'one — é')
    await fs.writeText(`${dir}/a.md`, 'two — é')
    expect(await fs.readText(`${dir}/a.md`)).toBe('two — é')
    expect(await readdir(dir)).toEqual(['a.md'])
  })

  it('rejects writing into a missing folder, with no stray files', async () => {
    await expect(fs.writeText(`${dir}/nope/a.md`, 'x')).rejects.toThrow()
    expect(await readdir(dir)).toEqual([])
  })

  it('lists files and folders, following symlinks and skipping the rest', async () => {
    await writeFile(join(dir, 'a.md'), 'A')
    await mkdir(join(dir, 'G'))
    await symlink(join(dir, 'G'), join(dir, 'link-to-G'))
    await symlink(join(dir, 'missing'), join(dir, 'broken'))
    const entries = (await fs.list(dir)).sort((x, y) => (x.name < y.name ? -1 : 1))
    expect(entries).toEqual([
      { name: 'G', kind: 'directory' },
      { name: 'a.md', kind: 'file' },
      { name: 'link-to-G', kind: 'directory' }
    ])
  })

  it('rejects listing a missing folder or reading a missing file', async () => {
    await expect(fs.list(`${dir}/nope`)).rejects.toThrow()
    await expect(fs.readText(`${dir}/nope.md`)).rejects.toThrow()
  })

  it('reports existence', async () => {
    await writeFile(join(dir, 'a.md'), 'A')
    expect(await fs.exists(`${dir}/a.md`)).toBe(true)
    expect(await fs.exists(dir)).toBe(true)
    expect(await fs.exists(`${dir}/b.md`)).toBe(false)
  })

  it('makes nested folders and tolerates repeats', async () => {
    await fs.makeDir(`${dir}/a/b/c`)
    await fs.makeDir(`${dir}/a/b/c`)
    expect(await fs.exists(`${dir}/a/b/c`)).toBe(true)
  })

  it('renames files and moves folders with their contents', async () => {
    await writeFile(join(dir, 'a.md'), 'A')
    await fs.rename(`${dir}/a.md`, `${dir}/b.md`)
    expect(await fs.readText(`${dir}/b.md`)).toBe('A')
    await mkdir(join(dir, 'G'))
    await mkdir(join(dir, 'H'))
    await fs.rename(`${dir}/b.md`, `${dir}/G/b.md`)
    await fs.rename(`${dir}/G`, `${dir}/H/G`)
    expect(await fs.readText(`${dir}/H/G/b.md`)).toBe('A')
  })

  it('refuses to overwrite an existing destination', async () => {
    await writeFile(join(dir, 'a.md'), 'A')
    await writeFile(join(dir, 'b.md'), 'B')
    await expect(fs.rename(`${dir}/a.md`, `${dir}/b.md`)).rejects.toThrow(/exists/)
    expect(await readFile(join(dir, 'b.md'), 'utf8')).toBe('B')
  })

  it('refuses a rename into a missing folder or of a missing source', async () => {
    await writeFile(join(dir, 'a.md'), 'A')
    await expect(fs.rename(`${dir}/a.md`, `${dir}/nope/a.md`)).rejects.toThrow()
    await expect(fs.rename(`${dir}/gone.md`, `${dir}/c.md`)).rejects.toThrow()
  })

  it('allows a case-only rename', async () => {
    await mkdir(join(dir, 'part'))
    await fs.rename(`${dir}/part`, `${dir}/Part`)
    expect(await readdir(dir)).toEqual(['Part'])
  })

  it('hands trash to the supplied function', async () => {
    await writeFile(join(dir, 'a.md'), 'A')
    await fs.trash(`${dir}/a.md`)
    expect(trashed).toEqual([`${dir}/a.md`])
    expect(await fs.exists(`${dir}/a.md`)).toBe(false)
  })
})

describe('the core running on the real disk', () => {
  it('creates, moves and deletes, and the result loads back', async () => {
    const novel = await createGroup(fs, dir, 'Novel')
    const part = await createGroup(fs, novel, 'Part One')
    const opening = await createSheet(fs, part, '# Opening\n\nIt was raining.')
    await createSheet(fs, part, '# The Station')
    await createSheet(fs, novel, '# Notes')
    await moveNode(fs, opening, novel, 0)
    await deleteNode(fs, `${novel}/Notes.md`)

    const lib = await loadLibrary(fs, dir)
    const n = lib.children[0] as GroupNode
    expect(children(n)).toEqual(['Opening.md', 'Part One'])
    expect(children(n.children[1] as GroupNode)).toEqual(['The Station.md'])
    expect(trashed).toEqual([`${novel}/Notes.md`])
    expect(await readFile(join(dir, 'Novel', 'Opening.md'), 'utf8')).toContain('It was raining.')
  })

  it('survives a folder edited by hand between loads', async () => {
    const project = await createGroup(fs, dir, 'Novel')
    await createSheet(fs, project, '# A')
    await createSheet(fs, project, '# B')
    await createSheet(fs, project, '# C')
    expect(children((await loadLibrary(fs, dir)).children[0] as GroupNode)).toEqual([
      'A.md',
      'B.md',
      'C.md'
    ])

    // The user, in Finder: deletes b, adds d and a stray image, renames c.
    await rm(join(project, 'B.md'))
    await writeFile(join(project, 'd.md'), 'D')
    await writeFile(join(project, 'cover.png'), 'binary')
    await writeFile(join(project, '.DS_Store'), '')
    await rename(join(project, 'C.md'), join(project, 'chapter-three.md'))

    const reloaded = (await loadLibrary(fs, dir)).children[0] as GroupNode
    expect(children(reloaded)).toEqual(['A.md', 'chapter-three.md', 'd.md'])
  })

  it('opens a library whose sidecar was corrupted by hand', async () => {
    const project = await createGroup(fs, dir, 'Novel')
    await createSheet(fs, project, '# A')
    await writeFile(join(project, '.writingapp.json'), '{"order": [')
    const reloaded = (await loadLibrary(fs, dir)).children[0] as GroupNode
    expect(children(reloaded)).toEqual(['A.md'])
  })
})
