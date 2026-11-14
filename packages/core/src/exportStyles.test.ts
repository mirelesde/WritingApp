import { describe, expect, it } from 'vitest'
import { exportHtml } from './export'
import {
  applyExportStyle,
  BUILTIN_EXPORT_STYLES,
  parseStyleMeta,
  sanitizeCss,
  styleFileName,
  styleFileText,
} from './exportStyles'
import { loadLibrary } from './library'
import { MemoryFileSystem } from './testing/memoryFileSystem'

describe('export styles', () => {
  it('has built-ins with unique ids and clean CSS', () => {
    const ids = BUILTIN_EXPORT_STYLES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[0]).toBe('default')
    for (const s of BUILTIN_EXPORT_STYLES) expect(sanitizeCss(s.css)).toBe(s.css)
  })

  it('removes ways out of the style element and web fetches', () => {
    expect(sanitizeCss('a{}</style><script>x</script>')).not.toContain('</style')
    expect(sanitizeCss('@import url(https://x.com/a.css); b{}')).toBe(' b{}')
    expect(sanitizeCss('p{background:url(https://x.com/a.png)}')).toBe('p{background:none}')
    expect(sanitizeCss("p{background:url('//x.com/a.png')}")).toBe('p{background:none}')
    expect(sanitizeCss('p{background:url(data:image/png;base64,AAA)}')).toContain('data:image')
  })

  it('puts the CSS in an export, and can swap it later', async () => {
    const fs = new MemoryFileSystem({ '/L/a.md': '# A\ntext' })
    const tree = await loadLibrary(fs, '/L')
    const out = await exportHtml(fs, tree, ['/L/a.md'], { css: 'p{color:red}' })
    expect(out.html).toContain('<style id="export-style">p{color:red}</style>')
    const swapped = applyExportStyle(out.html, "p{content:'$&'}")
    expect(swapped).toContain("<style id=\"export-style\">p{content:'$&'}</style>")
    expect(swapped).not.toContain('color:red')
  })

  it('reads and writes style files', () => {
    const text = styleFileText('My *Style*', 'Warm\nand soft', 'p{margin:0}')
    expect(parseStyleMeta('my-style.css', text)).toEqual({ name: 'My Style', description: 'Warm and soft' })
    expect(text.endsWith('p{margin:0}')).toBe(true)
    // Re-saving keeps one header, not two.
    expect(styleFileText('X', '', text).match(/name:/g)).toHaveLength(1)
    expect(parseStyleMeta('plain.css', 'p{}')).toEqual({ name: 'plain', description: '' })
    expect(styleFileName('My Style!')).toBe('my-style.css')
    expect(styleFileName('???')).toBe('style.css')
  })
})
