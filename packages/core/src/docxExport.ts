/*
 * Writes Markdown as a Word (.docx) file: real headings, lists, tables,
 * footnotes, links and embedded pictures, so it opens and edits cleanly in
 * Word, Pages or LibreOffice. Built on the same Markdown parser as the HTML
 * export. Platform-free: the zip is written with fflate.
 */
import { strToU8, zipSync } from 'fflate'
import { assetNameFromUrl } from './images'
import { escapeXml } from './xml'
import { markdownTokens } from './export'
import { findFootnoteDefs, findFootnoteRefs } from './footnotes'

export interface DocxOptions {
  title?: string
  pageSize?: 'A4' | 'Letter'
  margin?: 'narrow' | 'normal' | 'wide'
  pageNumbers?: boolean
  /** Picture bytes by library file name, for the pictures the Markdown uses. */
  images?: Record<string, Uint8Array>
}

// Marked's token shapes are loose; only the fields used here are named.
interface Tok {
  type: string
  raw?: string
  text?: string
  tokens?: Tok[]
  depth?: number
  lang?: string
  href?: string
  ordered?: boolean
  start?: number | ''
  items?: Tok[]
  task?: boolean
  checked?: boolean
  header?: { tokens: Tok[] }[]
  rows?: { tokens: Tok[] }[][]
}

interface Fmt {
  b?: boolean
  i?: boolean
  s?: boolean
  mark?: boolean
  code?: boolean
  link?: string
}

const PAGES = { A4: [11906, 16838], Letter: [12240, 15840] } as const
const MARGINS = { narrow: 720, normal: 1440, wide: 2160 } as const
const EMU = 635 // per twip

/** Pixel size of a PNG, JPEG or GIF, or null when it cannot be read. */
export function imageSize(d: Uint8Array): { w: number; h: number; ext: 'png' | 'jpeg' | 'gif' } | null {
  if (d.length > 24 && d[0] === 0x89 && d[1] === 0x50) {
    return { w: ((d[16]! << 24) | (d[17]! << 16) | (d[18]! << 8) | d[19]!) >>> 0, h: ((d[20]! << 24) | (d[21]! << 16) | (d[22]! << 8) | d[23]!) >>> 0, ext: 'png' }
  }
  if (d.length > 10 && d[0] === 0x47 && d[1] === 0x49 && d[2] === 0x46) return { w: d[6]! | (d[7]! << 8), h: d[8]! | (d[9]! << 8), ext: 'gif' }
  if (d.length > 4 && d[0] === 0xff && d[1] === 0xd8) {
    let i = 2
    while (i + 9 < d.length) {
      if (d[i] !== 0xff) {
        i++
        continue
      }
      const marker = d[i + 1]!
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: (d[i + 5]! << 8) | d[i + 6]!, w: (d[i + 7]! << 8) | d[i + 8]!, ext: 'jpeg' }
      }
      i += 2 + ((d[i + 2]! << 8) | d[i + 3]!)
    }
    return { w: 0, h: 0, ext: 'jpeg' }
  }
  return null
}

const STYLES = (() => {
  const heading = (n: number, size: number): string =>
    `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${n === 1 ? 360 : 240}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${size}"/></w:rPr></w:style>`
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="23"/><w:szCs w:val="23"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${[32, 28, 26, 24, 23, 23].map((s, i) => heading(i + 1, s)).join('')}
<w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="BBBBBB"/></w:pBdr><w:ind w:left="567"/></w:pPr><w:rPr><w:i/><w:color w:val="555555"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="160" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="FootnoteText"><w:name w:val="footnote text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="FootnoteReference"><w:name w:val="footnote reference"/><w:rPr><w:vertAlign w:val="superscript"/></w:rPr></w:style>
<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:left w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:right w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="999999"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="999999"/></w:tblBorders><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`
})()

function levels(bullet: boolean, start = 1, startLevel = 0): string {
  let out = ''
  for (let i = 0; i < 9; i++) {
    const fmt = bullet ? 'bullet' : i % 3 === 0 ? 'decimal' : i % 3 === 1 ? 'lowerLetter' : 'lowerRoman'
    const text = bullet ? ['•', '◦', '▪'][i % 3]! : `%${i + 1}.`
    const font = bullet ? '<w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>' : ''
    out += `<w:lvl w:ilvl="${i}"><w:start w:val="${i === startLevel ? start : 1}"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="${720 * (i + 1)}" w:hanging="360"/></w:pPr>${font}</w:lvl>`
  }
  return out
}

class Builder {
  body: string[] = []
  rels: string[] = []
  media: Record<string, Uint8Array> = {}
  nums: string[] = []
  abstracts: string[] = []
  notes: string[] = []
  noteIds: Map<string, number> = new Map()
  noteText: Map<string, string> = new Map()
  extensions = new Set<string>()
  nextRel = 10
  nextDoc = 1
  textWidth: number
  /** Headings after the `(cnt)` line, for the cached entries of the table of contents field. */
  contents: { depth: number; text: string }[] = []
  hasContents = false

  constructor(private options: DocxOptions, textWidth: number) {
    this.textWidth = textWidth
  }

  relId(): string {
    return `rId${this.nextRel++}`
  }

  run(text: string, f: Fmt = {}): string {
    if (text === '') return ''
    const props =
      (f.link ? '<w:rStyle w:val="Hyperlink"/>' : '') +
      (f.code ? '<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:cs="Courier New"/>' : '') +
      (f.b ? '<w:b/>' : '') +
      (f.i ? '<w:i/>' : '') +
      (f.s ? '<w:strike/>' : '') +
      (f.mark ? '<w:highlight w:val="yellow"/>' : '')
    const lines = text.split('\n')
    const inner = lines.map((l) => `<w:t xml:space="preserve">${escapeXml(l)}</w:t>`).join('<w:br/>')
    const run = `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}${inner}</w:r>`
    if (!f.link) return run
    if (f.link.startsWith('#')) return `<w:hyperlink w:anchor="${escapeXml(f.link.slice(1))}">${run}</w:hyperlink>`
    const id = this.relId()
    this.rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${escapeXml(f.link)}" TargetMode="External"/>`)
    return `<w:hyperlink r:id="${id}">${run}</w:hyperlink>`
  }

  image(href: string, alt: string): string {
    const name = assetNameFromUrl(href)
    const data = name ? this.options.images?.[name] : undefined
    const size = data ? imageSize(data) : null
    if (!name || !data || !size) return this.run(alt ? `[${alt}]` : '', { i: true })
    const key = `image${Object.keys(this.media).length + 1}.${size.ext === 'jpeg' ? 'jpg' : size.ext}`
    this.media[`word/media/${key}`] = data
    this.extensions.add(size.ext)
    const id = this.relId()
    this.rels.push(`<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${key}"/>`)
    let w = size.w > 0 ? size.w * 9525 : 3 * 914400
    let h = size.h > 0 ? size.h * 9525 : 2.25 * 914400
    const max = this.textWidth * EMU
    if (w > max) {
      h = Math.round((h * max) / w)
      w = max
    }
    const docId = this.nextDoc++
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${Math.round(w)}" cy="${Math.round(h)}"/><wp:docPr id="${docId}" name="Picture ${docId}" descr="${escapeXml(alt)}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${docId}" name="${escapeXml(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${Math.round(w)}" cy="${Math.round(h)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`
  }

  /** Text that may hold `[^id]` footnote marks. */
  text(text: string, f: Fmt): string {
    if (!text.includes('[^') || this.noteIds.size === 0) return this.run(text, f)
    let out = ''
    let last = 0
    for (const m of text.matchAll(/\[\^([^\]\s]+)\]/g)) {
      const n = this.noteIds.get(m[1]!)
      if (n === undefined) continue
      out += this.run(text.slice(last, m.index), f)
      out += `<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="${n}"/></w:r>`
      last = m.index! + m[0].length
    }
    return out + this.run(text.slice(last), f)
  }

  inline(tokens: Tok[] | undefined, f: Fmt = {}): string {
    let out = ''
    for (const t of tokens ?? []) {
      switch (t.type) {
        case 'strong': out += this.inline(t.tokens, { ...f, b: true }); break
        case 'em': out += this.inline(t.tokens, { ...f, i: true }); break
        case 'del': out += this.inline(t.tokens, { ...f, s: true }); break
        case 'highlight': out += this.inline(t.tokens, { ...f, mark: true }); break
        case 'codespan': out += this.run(t.text ?? '', { ...f, code: true }); break
        case 'link': out += this.inline(t.tokens, { ...f, link: t.href }); break
        case 'image': out += this.image(t.href ?? '', t.text ?? ''); break
        case 'br': out += '<w:r><w:br/></w:r>'; break
        case 'inlineMath': out += this.run(t.text ?? '', { ...f, i: true }); break
        case 'html': out += this.run(t.raw ?? t.text ?? '', f); break
        case 'escape': out += this.run(t.text ?? '', f); break
        default:
          if (t.tokens?.length) out += this.inline(t.tokens, f)
          else out += this.text(decode(t.text ?? t.raw ?? ''), f)
      }
    }
    return out
  }

  para(content: string, style?: string, extra = ''): string {
    const ppr = (style ? `<w:pStyle w:val="${style}"/>` : '') + extra
    return `<w:p>${ppr ? `<w:pPr>${ppr}</w:pPr>` : ''}${content}</w:p>`
  }

  blocks(tokens: Tok[], style?: string, level = 0): string[] {
    const out: string[] = []
    for (const t of tokens) {
      switch (t.type) {
        case 'heading': out.push(this.para(this.inline(t.tokens), `Heading${Math.min(6, t.depth ?? 1)}`)); break
        case 'paragraph':
          if (!this.hasContents && level === 0 && !style && (t.raw ?? '').trim() === '(cnt)') {
            this.hasContents = true
            out.push(...this.contentsField())
          } else out.push(this.para(this.inline(t.tokens), style))
          break
        case 'text': out.push(this.para(this.inline(t.tokens ?? [{ type: 'text', text: t.text }]), style)); break
        case 'blockquote': out.push(...this.blocks(t.tokens ?? [], 'Quote', level)); break
        case 'code': {
          out.push(this.para(this.run((t.text ?? '').replace(/\t/g, '    '), { code: true }), 'Code'))
          break
        }
        case 'blockMath': out.push(this.para(this.run(t.text ?? '', { i: true }), style, '<w:jc w:val="center"/>')); break
        case 'hr': out.push(this.para('', undefined, '<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="1" w:color="999999"/></w:pBdr>')); break
        case 'list': out.push(...this.list(t, level)); break
        case 'table': out.push(this.table(t)); break
        case 'html': if ((t.text ?? '').trim()) out.push(this.para(this.run((t.text ?? '').trim()), style)); break
        default: break
      }
    }
    return out
  }

  /**
   * A real Word table of contents field. Word fills in the page numbers when the
   * file is opened (settings.xml asks it to update fields); the entries stored here
   * are what apps that do not update fields show. It lists only what follows,
   * through a bookmark that runs to the end of the document.
   */
  contentsField(): string[] {
    const r = (x: string): string => `<w:r>${x}</w:r>`
    const begin =
      r('<w:fldChar w:fldCharType="begin"/>') +
      r('<w:instrText xml:space="preserve"> TOC \\o "1-6" \\h \\z \\u \\b writingapp_contents </w:instrText>') +
      r('<w:fldChar w:fldCharType="separate"/>')
    const top = Math.min(...this.contents.map((h) => h.depth))
    const entries = this.contents.map((h) => this.run(h.text) + '')
    const paras = entries.map((e, i) => {
      const indent = `<w:ind w:left="${360 * Math.min(this.contents[i]!.depth - top, 5)}"/>`
      return this.para((i === 0 ? begin : '') + e, undefined, indent)
    })
    if (paras.length === 0) paras.push(this.para(begin))
    paras.push(this.para(r('<w:fldChar w:fldCharType="end"/>')))
    paras.push('<w:bookmarkStart w:id="9001" w:name="writingapp_contents"/>')
    return paras
  }

  list(list: Tok, level: number): string[] {
    const out: string[] = []
    let numId = 1
    if (list.ordered) {
      numId = this.nums.length + 3
      const start = typeof list.start === 'number' ? list.start : 1
      // Each numbered list is its own definition, so it counts from its own start.
      this.abstracts.push(`<w:abstractNum w:abstractNumId="${numId + 10}"><w:multiLevelType w:val="hybridMultilevel"/>${levels(false, start, level)}</w:abstractNum>`)
      this.nums.push(`<w:num w:numId="${numId}"><w:abstractNumId w:val="${numId + 10}"/></w:num>`)
    }
    for (const item of list.items ?? []) {
      const parts = (item.tokens ?? []).filter((x) => x.type !== 'space')
      const props = `<w:numPr><w:ilvl w:val="${Math.min(level, 8)}"/><w:numId w:val="${numId}"/></w:numPr>`
      let first = true
      for (const part of parts) {
        if (part.type === 'list') {
          out.push(...this.list(part, level + 1))
          continue
        }
        const box = item.task && first ? this.run(item.checked ? '☑ ' : '☐ ') : ''
        if (part.type === 'text' || part.type === 'paragraph') {
          out.push(this.para(box + this.inline(part.tokens ?? [{ type: 'text', text: part.text }]), 'ListParagraph', first ? props : `<w:ind w:left="${720 * (level + 1)}"/>`))
        } else out.push(...this.blocks([part], undefined, level))
        first = false
      }
    }
    return out
  }

  table(t: Tok): string {
    const cols = t.header?.length ?? 1
    const w = Math.floor(this.textWidth / cols)
    const cell = (c: { tokens: Tok[] }, bold: boolean): string =>
      `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${bold ? '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' : ''}</w:tcPr>${this.para(this.inline(c.tokens, bold ? { b: true } : {}), undefined, '<w:spacing w:after="40"/>')}</w:tc>`
    const rows = [`<w:tr><w:trPr><w:tblHeader/></w:trPr>${(t.header ?? []).map((c) => cell(c, true)).join('')}</w:tr>`]
    for (const r of t.rows ?? []) rows.push(`<w:tr>${r.map((c) => cell(c, false)).join('')}</w:tr>`)
    return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="${w * cols}" w:type="dxa"/></w:tblPr><w:tblGrid>${Array.from({ length: cols }, () => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>${this.para('')}`
  }
}

/** marked leaves entities in text tokens; Word wants the characters. */
function decode(s: string): string {
  return s.replace(/&(amp|lt|gt|quot|#39);/g, (_m, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]!)
}

const NS =
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'

/** A Word document for some Markdown. */
export function markdownToDocx(markdown: string, options: DocxOptions = {}): Uint8Array {
  const [pageW, pageH] = PAGES[options.pageSize ?? 'A4']
  const margin = MARGINS[options.margin ?? 'normal']
  const b = new Builder(options, pageW - margin * 2)

  // Footnotes: numbered by first reference, definitions removed from the body.
  const defs = findFootnoteDefs(markdown)
  let text = markdown
  if (defs.length > 0) {
    const noted = new Map(defs.map((d) => [d.id, d.text]))
    for (const ref of findFootnoteRefs(markdown)) {
      if (noted.has(ref.id) && !b.noteIds.has(ref.id)) {
        b.noteIds.set(ref.id, b.noteIds.size + 1)
        b.noteText.set(ref.id, noted.get(ref.id)!)
      }
    }
    for (const def of [...defs].reverse()) {
      const to = text[def.to] === '\n' ? def.to + 1 : def.to
      text = text.slice(0, def.from) + text.slice(to)
    }
  }
  const tokens = markdownTokens(text) as unknown as Tok[]
  const marker = tokens.findIndex((t) => t.type === 'paragraph' && (t.raw ?? '').trim() === '(cnt)')
  if (marker >= 0) {
    b.contents = tokens
      .slice(marker + 1)
      .filter((t) => t.type === 'heading' && (t.text ?? '').replace(/[*_`~]/g, '').trim() !== '')
      .map((t) => ({ depth: Math.min(6, t.depth ?? 1), text: decode((t.text ?? '').replace(/[*_`~]/g, '').trim()) }))
  }
  const body = b.blocks(tokens)
  if (b.hasContents) body.push('<w:bookmarkEnd w:id="9001"/>')
  if (body.length === 0) body.push(b.para(''))
  const noteXml = [...b.noteIds.entries()].map(([id, n]) => {
    const tokens = markdownTokens(b.noteText.get(id) ?? '') as unknown as Tok[]
    const inner = tokens.map((t) => (t.type === 'paragraph' || t.type === 'text' ? b.inline(t.tokens ?? [{ type: 'text', text: t.text }]) : '')).join('')
    return `<w:footnote w:id="${n}"><w:p><w:pPr><w:pStyle w:val="FootnoteText"/></w:pPr><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> </w:t></w:r>${inner}</w:p></w:footnote>`
  })

  const footer = options.pageNumbers ? '<w:footerReference w:type="default" r:id="rId3"/>' : ''
  const sect = `<w:sectPr>${footer}<w:pgSz w:w="${pageW}" w:h="${pageH}"/><w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${body.join('')}${sect}</w:body></w:document>`

  const hasNotes = noteXml.length > 0
  const rels = [
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
    ...(options.pageNumbers ? ['<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>'] : []),
    ...(hasNotes ? ['<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footnotes" Target="footnotes.xml"/>'] : []),
    ...(b.hasContents ? ['<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'] : []),
    ...b.rels
  ]
  const types = [
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    ...[...b.extensions].map((e) => `<Default Extension="${e === 'jpeg' ? 'jpg' : e}" ContentType="image/${e}"/>`),
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
    '<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>',
    ...(options.pageNumbers ? ['<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>'] : []),
    ...(b.hasContents ? ['<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>'] : []),
    ...(hasNotes ? ['<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>'] : []),
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
  ]

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${types.join('')}</Types>`),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'
    ),
    'docProps/core.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escapeXml(options.title ?? '')}</dc:title></cp:coreProperties>`
    ),
    'word/document.xml': strToU8(documentXml),
    'word/styles.xml': strToU8(STYLES),
    'word/numbering.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${levels(true)}</w:abstractNum>${b.abstracts.join('')}<w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>${b.nums.join('')}</w:numbering>`
    ),
    'word/_rels/document.xml.rels': strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`),
    ...b.media
  }
  if (hasNotes) {
    files['word/footnotes.xml'] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:footnotes ${NS}><w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>${noteXml.join('')}</w:footnotes>`
    )
  }
  if (b.hasContents) {
    files['word/settings.xml'] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/></w:settings>`
    )
  }
  if (options.pageNumbers) {
    files['word/footer1.xml'] = strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:ftr ${NS}><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`
    )
  }
  return zipSync(files)
}
