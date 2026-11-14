import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { docxToMarkdown } from './docxImport'

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'

function docx(body: string, extra: Record<string, string | Uint8Array> = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<Types/>'),
    'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${W}><w:body>${body}</w:body></w:document>`)
  }
  for (const [k, v] of Object.entries(extra)) files[k] = typeof v === 'string' ? strToU8(v) : v
  return zipSync(files)
}
const p = (text: string, pPr = '', rPr = ''): string => `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r></w:p>`
const md = async (body: string, extra?: Record<string, string | Uint8Array>): Promise<string> => (await docxToMarkdown(docx(body, extra))).markdown

const styles = `<w:styles ${W}>
<w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>
<w:style w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>
<w:style w:styleId="Quote"><w:name w:val="Quote"/></w:style>
<w:style w:styleId="ListBullet"><w:name w:val="List Bullet"/></w:style>
</w:styles>`

describe('docxToMarkdown', () => {
  it('rejects things that are not Word documents', async () => {
    await expect(docxToMarkdown(strToU8('hello'))).rejects.toThrow('Not a Word document')
    await expect(docxToMarkdown(zipSync({ 'a.txt': strToU8('x') }))).rejects.toThrow('Not a Word document')
  })

  it('reads paragraphs and headings', async () => {
    const out = await md(p('Title', '<w:pStyle w:val="Heading1"/>') + p('Hello') + p('Sub', '<w:pStyle w:val="Heading2"/>') + p(''), { 'word/styles.xml': styles })
    expect(out).toBe('# Title\n\nHello\n\n## Sub')
  })

  it('marks bold, italic, strike and highlight, keeping spaces outside', async () => {
    const out = await md(
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">bold </w:t></w:r><w:r><w:rPr><w:b/><w:i/></w:rPr><w:t>both</w:t></w:r><w:r><w:rPr><w:strike/></w:rPr><w:t xml:space="preserve"> gone</w:t></w:r><w:r><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve"> lit</w:t></w:r></w:p>`
    )
    expect(out).toBe('**bold** ***both*** ~~gone~~ ==lit==')
  })

  it('escapes Markdown characters in text', async () => {
    expect(await md(p('2 * 3 [x] &lt;b>'))).toBe('2 \\* 3 \\[x] \\<b>')
    expect(await md(p('# not a heading'))).toBe('\\# not a heading')
  })

  it('reads links through relationships', async () => {
    const out = await md(`<w:p><w:hyperlink r:id="rId5"><w:r><w:t>site</w:t></w:r></w:hyperlink></w:p>`, {
      'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId5" Target="https://example.com" TargetMode="External"/></Relationships>'
    })
    expect(out).toBe('[site](https://example.com)')
  })

  it('reads bulleted and numbered lists with nesting', async () => {
    const numbering = `<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="lowerLetter"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`
    const item = (n: string, l: number, t: string): string => p(t, `<w:numPr><w:ilvl w:val="${l}"/><w:numId w:val="${n}"/></w:numPr>`)
    const out = await md(item('1', 0, 'a') + item('1', 0, 'b') + p('gap') + item('2', 0, 'one') + item('2', 1, 'inner') + item('2', 0, 'two'), { 'word/numbering.xml': numbering })
    expect(out).toBe('- a\n- b\n\ngap\n\n1. one\n  1. inner\n2. two')
  })

  it('reads list styles, quotes and code', async () => {
    const out = await md(p('x', '<w:pStyle w:val="ListBullet"/>') + p('said', '<w:pStyle w:val="Quote"/>') + p('a = 1', '', '<w:rFonts w:ascii="Courier New"/>') + p('b = 2', '', '<w:rFonts w:ascii="Courier New"/>'), { 'word/styles.xml': styles })
    expect(out).toBe('- x\n\n> said\n\n```\na = 1\nb = 2\n```')
  })

  it('reads tables', async () => {
    const cell = (t: string): string => `<w:tc>${p(t)}</w:tc>`
    const out = await md(`<w:tbl><w:tr>${cell('A')}${cell('B')}</w:tr><w:tr>${cell('1')}${cell('x|y')}</w:tr></w:tbl>`)
    expect(out).toBe('| A | B |\n| --- | --- |\n| 1 | x\\|y |')
  })

  it('keeps insertions and drops deletions', async () => {
    const out = await md(`<w:p><w:r><w:t>keep </w:t></w:r><w:ins><w:r><w:t>added</w:t></w:r></w:ins><w:del><w:r><w:delText>removed</w:delText></w:r></w:del></w:p>`)
    expect(out).toBe('keep added')
  })

  it('numbers footnotes by first appearance', async () => {
    const notes = `<w:footnotes ${W}><w:footnote w:type="separator" w:id="-1"><w:p/></w:footnote><w:footnote w:id="2">${p('Second note')}</w:footnote><w:footnote w:id="3">${p('Third note')}</w:footnote></w:footnotes>`
    const ref = (id: number): string => `<w:r><w:footnoteReference w:id="${id}"/></w:r>`
    const out = await md(`<w:p><w:r><w:t>A</w:t></w:r>${ref(3)}<w:r><w:t>B</w:t></w:r>${ref(2)}</w:p>`, { 'word/footnotes.xml': notes })
    expect(out).toBe('A[^1]B[^2]\n\n[^1]: Third note\n\n[^2]: Second note')
  })

  it('stores pictures through the callback', async () => {
    const drawing = `<w:p><w:r><w:drawing><wp:docPr xmlns:wp="x" descr="a cat"/><a:blip xmlns:a="y" r:embed="rId9"/></w:drawing></w:r></w:p>`
    const bytes = docx(drawing, {
      'word/_rels/document.xml.rels': '<Relationships><Relationship Id="rId9" Target="media/image1.png"/></Relationships>',
      'word/media/image1.png': new Uint8Array([1, 2, 3])
    })
    const saved: string[] = []
    const r = await docxToMarkdown(bytes, { saveImage: async (name) => (saved.push(name), 'kept.png') })
    expect(saved).toEqual(['image1.png'])
    expect(r.images).toBe(1)
    expect(r.markdown).toContain('![a cat](')
    expect(r.markdown).toContain('kept.png')
    const none = await docxToMarkdown(bytes)
    expect(none.markdown).toBe('')
    expect(none.warnings).toHaveLength(1)
  })
})
