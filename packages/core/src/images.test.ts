import { describe, expect, it } from 'vitest'
import { MemoryFileSystem } from './testing/memoryFileSystem'
import {
  assetName,
  carryImages,
  findImages,
  imageDataUri,
  imageMarkdown,
  importImages,
  localImagePath,
  saveImage,
  stripImages,
  toBase64,
} from './images'

describe('picture names', () => {
  it('keeps a free name and numbers a taken one', () => {
    expect(assetName('/x/Cat.PNG', new Set())).toBe('Cat.png')
    expect(assetName('cat.png', new Set(['cat.png']))).toBe('cat-2.png')
    expect(assetName('cat.png', new Set(['cat.png', 'cat-2.png']))).toBe('cat-3.png')
  })

  it('makes unsafe names safe', () => {
    expect(assetName('.hidden.png', new Set())).toBe('hidden.png')
    expect(assetName('a:b?.png', new Set())).toBe('a-b-.png')
  })
})

describe('links', () => {
  it('round-trips a name with spaces', () => {
    expect(imageMarkdown('my cat.png', 'my cat')).toBe('![my cat](my%20cat.png)')
    expect(localImagePath('my%20cat.png')).toBe('my cat.png')
    expect(localImagePath('./pics/a.png')).toBe('pics/a.png')
  })

  it('rejects links that are not pictures next to the sheet', () => {
    for (const url of ['https://x.com/a.png', '/abs/a.png', '../a.png', 'a/../../b.png', '%2e%2e%2fx.png', 'notes.md', '.hid/a.png', 'data:image/png;base64,AA'])
      expect(localImagePath(url), url).toBeNull()
  })
})

describe('findImages', () => {
  it('finds images with their positions, not those in code fences', () => {
    const text = 'a ![one](a.png) b\n```\n![no](b.png)\n```\n![two](c.png "t")'
    const refs = findImages(text)
    expect(refs.map((r) => r.alt)).toEqual(['one', 'two'])
    expect(text.slice(refs[0]!.from, refs[0]!.to)).toBe('![one](a.png)')
    expect(stripImages(text)).toBe('a  b\n```\n![no](b.png)\n```\n')
  })
})

describe('importing', () => {
  it('copies pictures into the sheet folder and skips other files', async () => {
    const fs = new MemoryFileSystem({ '/lib/g/a.md': '' })
    await fs.makeDir('/in')
    await fs.writeBinary('/in/cat.png', new Uint8Array([137, 80, 255]))
    await fs.writeText('/in/notes.txt', 'x')
    const done = await importImages(fs, '/lib/g', ['/in/cat.png', '/in/notes.txt', '/in/cat.png'])
    expect(done.map((d) => d.name)).toEqual(['cat.png', 'cat-2.png'])
    expect(done[0]!.markdown).toBe('![cat](cat.png)')
    expect(Array.from(await fs.readBinary('/lib/g/cat.png'))).toEqual([137, 80, 255])
  })

  it('saves pasted bytes', async () => {
    const fs = new MemoryFileSystem({ '/lib/a.md': '' })
    const img = await saveImage(fs, '/lib', 'image.png', new Uint8Array([1]))
    expect(img.markdown).toBe('![image](image.png)')
  })
})

describe('data uri', () => {
  it('encodes base64', () => {
    expect(toBase64(new Uint8Array([72, 105]))).toBe('SGk=')
    expect(toBase64(new Uint8Array([72, 105, 33]))).toBe('SGkh')
  })

  it('embeds a picture, and returns null for a missing one', async () => {
    const fs = new MemoryFileSystem({ '/lib/a.md': '' })
    await saveImage(fs, '/lib', 'a.png', new Uint8Array([72, 105]))
    expect(await imageDataUri(fs, '/lib', 'a.png')).toBe('data:image/png;base64,SGk=')
    expect(await imageDataUri(fs, '/lib', 'nope.png')).toBeNull()
    expect(await imageDataUri(fs, '/lib', 'https://x/a.png')).toBeNull()
  })
})

describe('carrying pictures to another folder', () => {
  it('copies them over and leaves the originals', async () => {
    const fs = new MemoryFileSystem({ '/lib/A/s.md': '![p](p.png)' })
    await fs.writeBinary('/lib/A/p.png', new Uint8Array([1, 2]))
    await fs.makeDir('/lib/B')
    await fs.rename('/lib/A/s.md', '/lib/B/s.md')
    const done = await carryImages(fs, '/lib/A', '/lib/B/s.md')
    expect(done?.created).toEqual(['/lib/B/p.png'])
    expect(Array.from(await fs.readBinary('/lib/B/p.png'))).toEqual([1, 2])
    expect(await fs.exists('/lib/A/p.png')).toBe(true)
  })

  it('reuses an identical picture and renames a different one', async () => {
    const fs = new MemoryFileSystem({ '/lib/B/s.md': '![p](p.png) ![q](q.png)', '/lib/A/x.md': '' })
    await fs.writeBinary('/lib/A/p.png', new Uint8Array([1]))
    await fs.writeBinary('/lib/B/p.png', new Uint8Array([1]))
    await fs.writeBinary('/lib/A/q.png', new Uint8Array([2]))
    await fs.writeBinary('/lib/B/q.png', new Uint8Array([9]))
    const done = await carryImages(fs, '/lib/A', '/lib/B/s.md')
    expect(done?.created).toEqual(['/lib/B/q-2.png'])
    expect(await fs.readText('/lib/B/s.md')).toBe('![p](p.png) ![q](q-2.png)')
  })
})
