import { strFromU8, strToU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { exportEpub, toXhtml } from './epub'
import { loadLibrary } from './library'
import { MemoryFileSystem } from './testing/memoryFileSystem'
import { parseXml } from './xml'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const sidecar = (order: string[]) => JSON.stringify({ version: 1, order, glued: [] })

const setup = () =>
  new MemoryFileSystem({
    '/Lib/.writingapp.json': sidecar(['Book']),
    '/Lib/Book/.writingapp.json': sidecar(['a.md', 'b.md', 'c.md']),
    '/Lib/Book/a.md': '# Contents\n\n(cnt)\n',
    '/Lib/Book/b.md': '# One\n\nHello & goodbye&nbsp;now.<br>\n\n## Part\n\n### Deep\n\n#### Deeper\n\n![pic](.assets/p.png)\n\n$x^2$\n\nline  \nbreak\n\n---\n\n- [x] done\n\n[^1]\n\n[^1]: note\n',
    '/Lib/Book/c.md': 'No heading here.\n',
    '/Lib/.assets/p.png': String.fromCharCode(...PNG),
  })

const build = async (options = {}) => {
  const fs = setup()
  const tree = await loadLibrary(fs, '/Lib')
  const out = await exportEpub(fs, tree, ['/Lib/Book'], { identifier: 'urn:uuid:test', now: new Date('2026-01-02T03:04:05.678Z'), ...options })
  return { out, files: unzipSync(out.bytes) }
}

describe('exportEpub', () => {
  it('writes a package with the mimetype first and stored', async () => {
    const { out, files } = await build()
    expect(Object.keys(files)[0]).toBe('mimetype')
    expect(strFromU8(files['mimetype']!)).toBe('application/epub+zip')
    expect(out.bytes.slice(30, 38)).toEqual(strToBytes('mimetype'))
    // Stored: the text appears raw right after the name.
    expect(strFromU8(out.bytes.slice(38, 58))).toBe('application/epub+zip')
    expect(out.chapters).toBe(3)
  })

  it('makes every part well-formed XML, with the right metadata', async () => {
    const { files } = await build({ title: 'My Book', author: 'A & B', language: 'es' })
    for (const [name, data] of Object.entries(files)) {
      if (/\.(xml|xhtml|opf|ncx)$/.test(name)) expect(() => parseXml(strFromU8(data)), name).not.toThrow()
    }
    const opf = strFromU8(files['OEBPS/content.opf']!)
    expect(opf).toContain('<dc:title>My Book</dc:title>')
    expect(opf).toContain('<dc:creator>A &amp; B</dc:creator>')
    expect(opf).toContain('<dc:language>es</dc:language>')
    expect(opf).toContain('dcterms:modified">2026-01-02T03:04:05Z<')
    expect(opf).toContain('properties="nav"')
    expect(opf).toContain('href="images/p.png" media-type="image/png"')
    expect(opf).toContain('properties="mathml"')
  })

  it('builds navigation from the headings, nested, with sheets that have none listed by title', async () => {
    const { files } = await build()
    const nav = strFromU8(files['OEBPS/nav.xhtml']!)
    expect(nav).toContain('<a href="chapter-1.xhtml">Contents</a>')
    expect(nav).toContain('<a href="chapter-2.xhtml">One</a><ol><li><a href="chapter-2.xhtml#part">Part</a><ol><li><a href="chapter-2.xhtml#deep">Deep</a>')
    expect(nav).not.toContain('Deeper')
    expect(nav).toContain('<a href="chapter-3.xhtml">')
    expect(strFromU8(files['OEBPS/toc.ncx']!)).toContain('playOrder="1"')
  })

  it('drops (cnt), points pictures into the book and embeds them', async () => {
    const { files } = await build()
    expect(strFromU8(files['OEBPS/chapter-1.xhtml']!)).not.toContain('(cnt)')
    expect(strFromU8(files['OEBPS/chapter-2.xhtml']!)).toContain('src="images/p.png"')
    expect(files['OEBPS/images/p.png']).toBeDefined()
  })

  it('adds a cover and the export style', async () => {
    const { files } = await build({ cover: { bytes: PNG, name: 'front.png' }, css: 'h1 { color: red; }' })
    const opf = strFromU8(files['OEBPS/content.opf']!)
    expect(opf).toContain('properties="cover-image"')
    expect(opf.indexOf('idref="cover"')).toBeLessThan(opf.indexOf('idref="c1"'))
    expect(files['OEBPS/cover.xhtml']).toBeDefined()
    expect(strFromU8(files['OEBPS/style.css']!)).toContain('color: red')
  })

  it('refuses an empty selection', async () => {
    const fs = new MemoryFileSystem({ '/Lib/.writingapp.json': sidecar([]) })
    await expect(exportEpub(fs, await loadLibrary(fs, '/Lib'), ['/Lib'])).rejects.toThrow(/Nothing to export/)
  })
})

describe('toXhtml', () => {
  it('closes void tags and replaces entities XML does not have', () => {
    expect(toXhtml('<p>a<br>b<hr><img src="x" alt="y"><input disabled="" type="checkbox"> &nbsp;&copy; &bogus; &amp;</p>')).toBe(
      '<p>a<br/>b<hr/><img src="x" alt="y"/><input disabled="" type="checkbox"/>  © &amp;bogus; &amp;</p>',
    )
  })
})

function strToBytes(s: string): Uint8Array {
  return strToU8(s)
}
