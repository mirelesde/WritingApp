import { describe, expect, it } from 'vitest'
import { mergeSheets, splitSheet } from './operations'
import { MemoryFileSystem } from './testing/memoryFileSystem'

const sidecar = JSON.stringify({ version: 1, order: ['a.md', 'b.md'], glued: [] })
const files = () => ({ '/Lib/.writingapp.json': sidecar, '/Lib/a.md': 'Alpha\n\nfirst\n\nsecond\n', '/Lib/b.md': 'Beta\n' })

/** A file system whose Nth call to the named method fails, like a full disk. */
function failing(mem: MemoryFileSystem, method: 'writeText' | 'trash', nth: number): MemoryFileSystem {
  const fs = Object.create(mem) as MemoryFileSystem
  let calls = 0
  const real = (mem[method] as (...a: string[]) => Promise<void>).bind(mem)
  ;(fs as unknown as Record<string, unknown>)[method] = async (...args: string[]) => {
    if (++calls === nth) throw new Error('disk full')
    return real(...args)
  }
  return fs
}

describe('multi-step operations that fail part way', () => {
  it('split puts the original back and leaves no new sheet', async () => {
    const mem = new MemoryFileSystem(files())
    const text = await mem.readText('/Lib/a.md')
    const fs = failing(mem, 'writeText', 2) // the rewrite of the original
    await expect(splitSheet(fs, '/Lib/a.md', text, text.indexOf('first'))).rejects.toThrow('disk full')
    expect(await mem.readText('/Lib/a.md')).toBe(text)
    expect(await mem.readText('/Lib/.writingapp.json')).toBe(sidecar)
    expect((await mem.list('/Lib')).map((e) => e.name).sort()).toEqual(['.writingapp.json', 'a.md', 'b.md'])
  })

  it('merge puts both sheets back when trashing fails', async () => {
    const mem = new MemoryFileSystem(files())
    const fs = failing(mem, 'trash', 1)
    await expect(mergeSheets(fs, ['/Lib/a.md', '/Lib/b.md'])).rejects.toThrow('disk full')
    expect(await mem.readText('/Lib/a.md')).toBe('Alpha\n\nfirst\n\nsecond\n')
    expect(await mem.readText('/Lib/b.md')).toBe('Beta\n')
    expect(await mem.readText('/Lib/.writingapp.json')).toBe(sidecar)
  })
})
