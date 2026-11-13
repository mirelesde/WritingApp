import { describe, expect, it } from 'vitest'
import { MemoryFileSystem } from './memoryFileSystem'

const sorted = (e: { name: string }[]) => e.map((x) => x.name).sort()

describe('MemoryFileSystem', () => {
  it('seeds files and creates their parent folders', async () => {
    const fs = new MemoryFileSystem({ '/Lib/Novel/a.md': 'A' })
    expect(await fs.readText('/Lib/Novel/a.md')).toBe('A')
    expect(await fs.list('/Lib')).toEqual([{ name: 'Novel', kind: 'directory' }])
    expect(await fs.list('/Lib/Novel')).toEqual([{ name: 'a.md', kind: 'file' }])
  })

  it('rejects reading a missing file and listing a missing folder', async () => {
    const fs = new MemoryFileSystem()
    await expect(fs.readText('/x.md')).rejects.toThrow()
    await expect(fs.list('/nope')).rejects.toThrow()
  })

  it('writes files only into existing folders', async () => {
    const fs = new MemoryFileSystem()
    await expect(fs.writeText('/nope/a.md', 'x')).rejects.toThrow()
    await fs.writeText('/a.md', 'x')
    await fs.writeText('/a.md', 'y')
    expect(await fs.readText('/a.md')).toBe('y')
  })

  it('reports existence of files and folders', async () => {
    const fs = new MemoryFileSystem({ '/d/a.md': '' })
    expect(await fs.exists('/d')).toBe(true)
    expect(await fs.exists('/d/a.md')).toBe(true)
    expect(await fs.exists('/d/b.md')).toBe(false)
  })

  it('makeDir creates parents and is idempotent', async () => {
    const fs = new MemoryFileSystem()
    await fs.makeDir('/a/b/c')
    await fs.makeDir('/a/b/c')
    expect(await fs.exists('/a/b')).toBe(true)
    expect(sorted(await fs.list('/a/b'))).toEqual(['c'])
  })

  it('renames a file', async () => {
    const fs = new MemoryFileSystem({ '/a.md': 'A' })
    await fs.rename('/a.md', '/b.md')
    expect(await fs.exists('/a.md')).toBe(false)
    expect(await fs.readText('/b.md')).toBe('A')
  })

  it('moves a folder with its contents', async () => {
    const fs = new MemoryFileSystem({ '/P/G/a.md': 'A', '/P/G/Sub/b.md': 'B', '/Q/x.md': 'X' })
    await fs.rename('/P/G', '/Q/G')
    expect(await fs.exists('/P/G')).toBe(false)
    expect(await fs.readText('/Q/G/a.md')).toBe('A')
    expect(await fs.readText('/Q/G/Sub/b.md')).toBe('B')
    expect(sorted(await fs.list('/Q'))).toEqual(['G', 'x.md'])
  })

  it('refuses renames that would clobber or have nowhere to land', async () => {
    const fs = new MemoryFileSystem({ '/a.md': 'A', '/b.md': 'B', '/d/x.md': '' })
    await expect(fs.rename('/a.md', '/b.md')).rejects.toThrow()
    await expect(fs.rename('/a.md', '/nope/a.md')).rejects.toThrow()
    await expect(fs.rename('/missing.md', '/c.md')).rejects.toThrow()
    await expect(fs.rename('/d', '/d/inner')).rejects.toThrow()
  })

  it('trashes files and folders and records them', async () => {
    const fs = new MemoryFileSystem({ '/a.md': 'A', '/G/b.md': 'B' })
    await fs.trash('/a.md')
    await fs.trash('/G')
    expect(await fs.exists('/a.md')).toBe(false)
    expect(await fs.exists('/G/b.md')).toBe(false)
    expect(await fs.exists('/G')).toBe(false)
    expect(fs.trashed).toEqual(['/a.md', '/G'])
    await expect(fs.trash('/a.md')).rejects.toThrow()
  })
})
