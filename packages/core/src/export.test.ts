import { describe, expect, it } from 'vitest'
import { exportHtml, exportRuns, htmlDocument, markdownToHtml } from './export'
import { loadLibrary } from './library'
import { MemoryFileSystem } from './testing/memoryFileSystem'

const sidecar = (order: string[], glued: string[] = []) =>
  JSON.stringify({ version: 1, order, glued })

const setup = () =>
  new MemoryFileSystem({
    '/Lib/Book/.writingapp.json': sidecar(['a.md', 'b.md', 'c.md', 'd.md'], ['a.md']),
    '/Lib/Book/a.md': '# A\n\nalpha *one*\n',
    '/Lib/Book/b.md': 'beta\n',
    '/Lib/Book/c.md': '# C\n\ngamma\n',
    '/Lib/Book/d.md': '# D\n\ndelta\n',
  })

const names = (runs: { name: string }[][]) => runs.map((r) => r.map((s) => s.name).join('+'))

describe('markdownToHtml', () => {
  it('renders Markdown and escapes raw HTML', () => {
    const html = markdownToHtml('Hi **you**\n\n<script>alert(1)</script>\n')
    expect(html).toContain('<strong>you</strong>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

describe('exportRuns', () => {
  it('expands a group to its sheets, with glued sheets as one run', async () => {
    const tree = await loadLibrary(setup(), '/Lib')
    expect(names(exportRuns(tree, ['/Lib/Book']))).toEqual(['a.md+b.md', 'c.md', 'd.md'])
  })

  it('turns a lone sheet into its whole run', async () => {
    const tree = await loadLibrary(setup(), '/Lib')
    expect(names(exportRuns(tree, ['/Lib/Book/b.md']))).toEqual(['a.md+b.md'])
    expect(names(exportRuns(tree, ['/Lib/Book/c.md']))).toEqual(['c.md'])
  })

  it('follows library order, not selection order', async () => {
    const tree = await loadLibrary(setup(), '/Lib')
    expect(names(exportRuns(tree, ['/Lib/Book/d.md', '/Lib/Book/c.md']))).toEqual(['c.md', 'd.md'])
  })

  it('is empty when nothing is selected', async () => {
    const tree = await loadLibrary(setup(), '/Lib')
    expect(exportRuns(tree, [])).toEqual([])
  })
})

describe('exportHtml', () => {
  it('leaves commented-out text out', async () => {
    const fs = new MemoryFileSystem({
      '/Lib/Book/a.md': '# A\n\nshown <!-- inline secret --> text\n\n<!-- block secret -->\n\nend\n',
    })
    const out = await exportHtml(fs, await loadLibrary(fs, '/Lib'), ['/Lib/Book'])
    expect(out.html).toContain('shown')
    expect(out.html).toContain('end')
    expect(out.html).not.toContain('secret')
  })

  it('makes one standalone page from a group', async () => {
    const fs = setup()
    const tree = await loadLibrary(fs, '/Lib')
    const out = await exportHtml(fs, tree, ['/Lib/Book'])
    expect(out.title).toBe('Book')
    expect(out.sheets).toBe(4)
    expect(out.html).toMatch(/^<!doctype html>/)
    expect(out.html).toContain('<style>')
    expect(out.html).toContain('<em>one</em>')
    expect(out.html.indexOf('alpha')).toBeLessThan(out.html.indexOf('beta'))
    expect(out.html.indexOf('beta')).toBeLessThan(out.html.indexOf('gamma'))
    // Glued sheets flow together; the others are separated.
    expect(out.html.match(/<hr class="break">/g)).toHaveLength(2)
  })

  it('rejects an empty selection', async () => {
    const fs = setup()
    const tree = await loadLibrary(fs, '/Lib')
    await expect(exportHtml(fs, tree, [])).rejects.toThrow('Nothing to export')
  })
})

describe('indented paragraphs', () => {
  it('adds the book style only when asked', () => {
    expect(htmlDocument('T', '<p>a</p>')).not.toContain('text-indent')
    expect(htmlDocument('T', '<p>a</p>', { indentParagraphs: true })).toContain('p + p { text-indent: 1.5em; }')
  })
})

describe('inline marks in export', () => {
  it('keeps strikethrough', () => {
    expect(markdownToHtml('a ~~gone~~ b')).toContain('<del>gone</del>')
  })
  it('turns ==text== into a mark, with other formatting inside', () => {
    expect(markdownToHtml('a ==hi **there**== b')).toContain('<mark>hi <strong>there</strong></mark>')
  })
  it('leaves stray equals signs alone', () => {
    expect(markdownToHtml('a == b == c')).not.toContain('<mark>')
    expect(markdownToHtml('x === y')).not.toContain('<mark>')
    expect(markdownToHtml('1 ==2')).not.toContain('<mark>')
  })
  it('works in footnotes and leaves code alone', () => {
    expect(markdownToHtml('a[^1]\n\n[^1]: see ==this==')).toContain('<mark>this</mark>')
    expect(markdownToHtml('`==x==`')).not.toContain('<mark>')
  })
})

describe('images in export', () => {
  it('embeds library pictures and leaves other images alone', async () => {
    const { saveImage } = await import('./images')
    const fs = new MemoryFileSystem({ '/lib/a.md': '![x](.assets/p.png) ![y](https://e.com/y.png)' })
    await saveImage(fs, '/lib', 'p.png', new Uint8Array([72, 105]))
    const tree = await loadLibrary(fs, '/lib')
    const out = await exportHtml(fs, tree, ['/lib/a.md'])
    expect(out.html).toContain('<img src="data:image/png;base64,SGk=" alt="x">')
    expect(out.html).toContain('https://e.com/y.png')
  })
})
