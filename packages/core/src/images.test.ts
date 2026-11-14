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
    const done = await importImages(fs, '/lib', ['/in/cat.png', '/in/notes.txt'])
    expect(done.map((d) => d.name)).toEqual(['cat.png'])
    expect(Array.from(await fs.readBinary('/lib/.assets/cat.png'))).toEqual([137, 80, 255])
  })

  it('stores identical pictures once, whatever they are called', async () => {
    const fs = new MemoryFileSystem({ '/lib/a.md': '' })
    const first = await saveImage(fs, '/lib', 'image.png', new Uint8Array([1, 2, 3]))
    const again = await saveImage(fs, '/lib', 'screenshot.png', new Uint8Array([1, 2, 3]))
    const other = await saveImage(fs, '/lib', 'image.png', new Uint8Array([1, 2, 4]))
    expect([first.reused, again.reused, other.reused]).toEqual([false, true, false])
    expect(again.name).toBe('image.png')
    expect(other.name).toBe('image-2.png')
    expect((await fs.list('/lib/.assets')).length).toBe(2)
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

describe('finding unused pictures', () => {
  it('counts a mention anywhere, even in code or a comment', async () => {
    const { assetsMentioned, unusedImages } = await import('./images')
    const { loadLibrary } = await import('./library')
    expect(assetsMentioned('x ![a](.assets/a%20b.png) `.assets/c.png` <!-- .assets/d.png -->')).toEqual(['a b.png', 'c.png', 'd.png'])
    const fs = new MemoryFileSystem({
      '/lib/P/one.md': '![a](.assets/a.png)\n```\n![c](.assets/c.png)\n```',
      '/lib/two.md': 'nothing',
    })
    for (const n of ['a.png', 'b.png', 'c.png']) await fs.makeDir('/lib/.assets').then(() => fs.writeBinary(`/lib/.assets/${n}`, new Uint8Array([1, 2])))
    const tree = await loadLibrary(fs, '/lib')
    expect(await unusedImages(fs, '/lib', tree)).toEqual([{ name: 'b.png', size: 2 }])
  })
})

describe('the hash index', () => {
  // A file system that can tell size and modified time, as the real one can.
  const withTimes = (fs: MemoryFileSystem): MemoryFileSystem => {
    return Object.assign(fs, {
      fileTimes: async (path: string) => ({ modified: 1, created: 1, size: (await fs.readBinary(path)).length }),
    })
  }
  const counting = (): { hash: (d: Uint8Array) => string; calls: () => number } => {
    let n = 0
    return { hash: (d) => ((n++), Array.from(d).join(',')), calls: () => n }
  }

  it('finds an identical picture and does not hash the old ones again', async () => {
    const fs = withTimes(new MemoryFileSystem({ '/lib/a.md': '' }))
    const h = counting()
    const a = await saveImage(fs, '/lib', 'a.png', new Uint8Array([1, 2, 3]), h.hash)
    await saveImage(fs, '/lib', 'b.png', new Uint8Array([4, 5]), h.hash)
    const before = h.calls()
    const again = await saveImage(fs, '/lib', 'c.png', new Uint8Array([1, 2, 3]), h.hash)
    expect(again).toMatchObject({ name: a.name, reused: true })
    expect(h.calls() - before).toBe(1) // only the new picture
    expect(await fs.exists('/lib/.assets/.index.json')).toBe(true)
  })

  it('rehashes a file that changed, and rebuilds a damaged index', async () => {
    const fs = withTimes(new MemoryFileSystem({ '/lib/a.md': '' }))
    const h = counting()
    await saveImage(fs, '/lib', 'a.png', new Uint8Array([1]), h.hash)
    await fs.writeText('/lib/.assets/.index.json', '{broken')
    const out = await saveImage(fs, '/lib', 'x.png', new Uint8Array([1]), h.hash)
    expect(out.reused).toBe(true)
    // A file replaced with other bytes of another size is noticed.
    await fs.writeBinary('/lib/.assets/a.png', new Uint8Array([7, 7]))
    expect((await saveImage(fs, '/lib', 'y.png', new Uint8Array([1]), h.hash)).reused).toBe(false)
  })
})
