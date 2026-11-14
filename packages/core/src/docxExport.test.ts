import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { docxToMarkdown } from './docxImport'
import { imageSize, markdownToDocx } from './docxExport'
import { parseXml } from './xml'

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 2, 0, 0, 0, 3, 8, 6, 0, 0, 0])

const roundTrip = async (md: string, options = {}): Promise<string> => (await docxToMarkdown(markdownToDocx(md, options))).markdown

describe('markdownToDocx', () => {
  it('makes a well-formed package', () => {
    const files = unzipSync(markdownToDocx('# Hi\n\ntext [^1]\n\n[^1]: note', { title: 'T & U', pageNumbers: true }))
    for (const name of Object.keys(files)) if (name.endsWith('.xml') || name.endsWith('.rels')) expect(() => parseXml(strFromU8(files[name]!))).not.toThrow()
    expect(Object.keys(files)).toEqual(expect.arrayContaining(['[Content_Types].xml', 'word/document.xml', 'word/footnotes.xml', 'word/footer1.xml']))
    expect(strFromU8(files['docProps/core.xml']!)).toContain('T &amp; U')
  })

  it('writes (cnt) as a Word table of contents field that lists only what follows', () => {
    const files = unzipSync(markdownToDocx('# Before\n\n(cnt)\n\n# One\n\n## Two\n'))
    for (const name of Object.keys(files)) if (name.endsWith('.xml') || name.endsWith('.rels')) expect(() => parseXml(strFromU8(files[name]!))).not.toThrow()
    const doc = strFromU8(files['word/document.xml']!)
    expect(doc).toContain('TOC \\o "1-6"')
    expect(doc).toContain('w:name="writingapp_contents"')
    const field = doc.slice(doc.indexOf('TOC '), doc.indexOf('fldCharType="end"'))
    expect(field).toContain('One')
    expect(field).toContain('Two')
    expect(field).not.toContain('Before')
    expect(strFromU8(files['word/settings.xml']!)).toContain('updateFields')
    expect(strFromU8(files['[Content_Types].xml']!)).toContain('settings.xml')
  })

  it('round-trips the common formatting', async () => {
    const md = [
      '# Title',
      '',
      'Plain with **bold**, *italic*, ~~gone~~, ==lit== and `code` and [a link](https://example.com).',
      '',
      '- one',
      '- two',
      '  - nested',
      '',
      '1. first',
      '2. second',
      '',
      '> quoted',
      '',
      '```',
      'a = 1',
      'b = 2',
      '```',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |'
    ].join('\n')
    const out = await roundTrip(md)
    expect(out).toContain('# Title')
    expect(out).toContain('**bold**')
    expect(out).toContain('*italic*')
    expect(out).toContain('~~gone~~')
    expect(out).toContain('==lit==')
    expect(out).toContain('`code`')
    expect(out).toContain('[a link](https://example.com)')
    expect(out).toContain('- one\n- two\n  - nested')
    expect(out).toContain('1. first\n2. second')
    expect(out).toContain('> quoted')
    expect(out).toContain('```\na = 1\nb = 2\n```')
    expect(out).toContain('| A | B |\n| --- | --- |\n| 1 | 2 |')
  })

  it('keeps footnotes', async () => {
    const out = await roundTrip('Claim[^a] and more[^b].\n\n[^b]: Second\n[^a]: First')
    expect(out).toContain('Claim[^1] and more[^2].')
    expect(out).toContain('[^1]: First')
    expect(out).toContain('[^2]: Second')
  })

  it('starts numbered lists where the Markdown does', () => {
    const files = unzipSync(markdownToDocx('3. c\n4. d'))
    expect(strFromU8(files['word/numbering.xml']!)).toContain('w:val="3"')
  })

  it('embeds pictures it has, and names the ones it lacks', async () => {
    expect(imageSize(PNG)).toEqual({ w: 2, h: 3, ext: 'png' })
    const files = unzipSync(markdownToDocx('![cat](.assets/cat.png)\n\n![gone](.assets/none.png)', { images: { 'cat.png': PNG } }))
    expect(Object.keys(files).filter((f) => f.startsWith('word/media/'))).toEqual(['word/media/image1.png'])
    const doc = strFromU8(files['word/document.xml']!)
    expect(doc).toContain('descr="cat"')
    expect(doc).toContain('[gone]')
  })

  it('uses the page size and margins asked for', () => {
    const doc = strFromU8(unzipSync(markdownToDocx('x', { pageSize: 'Letter', margin: 'narrow' }))['word/document.xml']!)
    expect(doc).toContain('w:w="12240" w:h="15840"')
    expect(doc).toContain('w:left="720"')
  })

  it('handles an empty text', () => {
    expect(() => markdownToDocx('')).not.toThrow()
  })
})
