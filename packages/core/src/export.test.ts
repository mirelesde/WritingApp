import { describe, expect, it } from 'vitest'
import { exportHtml, exportRuns, markdownToHtml } from './export'
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
