import { describe, expect, it } from 'vitest'
import { MemoryFileSystem } from './testing/memoryFileSystem'
import {
  assetName,
  assetNameFromUrl,
  findImages,
  imageDataUri,
  imageMarkdown,
  importImages,
  saveImage,
  toBase64,
} from './images'

describe('asset names', () => {
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
    const md = imageMarkdown('my cat.png', 'my cat')
    expect(md).toBe('![my cat](.assets/my%20cat.png)')
    expect(assetNameFromUrl('.assets/my%20cat.png')).toBe('my cat.png')
  })

  it('rejects other links', () => {
    expect(assetNameFromUrl('https://x.com/a.png')).toBeNull()
    expect(assetNameFromUrl('.assets/../secret.png')).toBeNull()
    expect(assetNameFromUrl('.assets/%2e%2e%2fsecret')).toBeNull()
  })
})

describe('findImages', () => {
  it('finds images with their positions, not those in code fences', () => {
    const text = 'a ![one](.assets/a.png) b\n```\n![no](.assets/b.png)\n```\n![two](.assets/c.png "t")'
    const refs = findImages(text)
    expect(refs.map((r) => r.alt)).toEqual(['one', 'two'])
    expect(text.slice(refs[0]!.from, refs[0]!.to)).toBe('![one](.assets/a.png)')
  })
})

describe('importing', () => {
  it('copies pictures into .assets and skips other files', async () => {
    const fs = new MemoryFileSystem({ '/lib/a.md': '' })
    await fs.makeDir('/in')
    await fs.writeBinary('/in/cat.png', new Uint8Array([137, 80, 255]))
    await fs.writeText('/in/notes.txt', 'x')
    const done = await importImages(fs, '/lib', ['/in/cat.png', '/in/notes.txt', '/in/cat.png'])
    expect(done.map((d) => d.name)).toEqual(['cat.png', 'cat-2.png'])
    expect(Array.from(await fs.readBinary('/lib/.assets/cat.png'))).toEqual([137, 80, 255])
  })

  it('saves pasted bytes', async () => {
    const fs = new MemoryFileSystem({ '/lib/a.md': '' })
    const img = await saveImage(fs, '/lib', 'image.png', new Uint8Array([1]))
    expect(img.markdown).toBe('![image](.assets/image.png)')
  })
})

describe('data uri', () => {
  it('encodes base64', () => {
    expect(toBase64(new Uint8Array([72, 105]))).toBe('SGk=')
    expect(toBase64(new Uint8Array([72, 105, 33]))).toBe('SGkh')
  })

  it('embeds a library image, and returns null for a missing one', async () => {
    const fs = new MemoryFileSystem({ '/lib/a.md': '' })
    await saveImage(fs, '/lib', 'a.png', new Uint8Array([72, 105]))
    expect(await imageDataUri(fs, '/lib', '.assets/a.png')).toBe('data:image/png;base64,SGk=')
    expect(await imageDataUri(fs, '/lib', '.assets/nope.png')).toBeNull()
    expect(await imageDataUri(fs, '/lib', 'https://x/a.png')).toBeNull()
  })
})
