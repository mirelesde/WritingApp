/*
 * Reads a Word (.docx) file and writes it as Markdown. A .docx is a zip of
 * XML; this covers what writers use: headings, paragraphs, bold, italic,
 * strikethrough, highlights, links, bulleted and numbered lists, quotes, code,
 * tables, footnotes and pictures. Tracked changes are accepted (insertions
 * kept, deletions dropped). Platform-free: the zip is read with fflate and the
 * XML with ./xml.
 */
import { strFromU8, unzipSync } from 'fflate'
import { imageMarkdown } from './images'
import { child, elements, parseXml, textOf, type XmlElement } from './xml'

export interface DocxImportOptions {
  /** Stores a picture and returns the name it was kept under; without it, pictures are left out. */
  saveImage?: (name: string, data: Uint8Array) => Promise<string>
}

export interface DocxImport {
  markdown: string
  /** Pictures found and stored. */
  images: number
  /** Things that could not be carried over, in plain words. */
  warnings: string[]
}

const MAX_UNZIPPED = 400 * 1024 * 1024

interface Rel {
  target: string
  external: boolean
}

interface Piece {
  text: string
  bold: boolean
  italic: boolean
  strike: boolean
  highlight: boolean
  code: boolean
  link?: string
  /** Already Markdown (an image or a footnote mark): not escaped, not marked up. */
  raw?: boolean
}

interface Context {
  rels: Map<string, Rel>
  styles: Map<string, { name: string; basedOn?: string; outline?: number; list?: 'bullet' | 'number'; numId?: string; ilvl?: number }>
  /** numId -> level -> whether that level is a bullet. */
  numbering: Map<string, Map<number, boolean>>
  footnotes: Map<string, XmlElement>
  /** Footnote ids in the order the text refers to them. */
  noteOrder: string[]
  media: Map<string, string>
  warnings: string[]
  counters: Map<string, number[]>
  plainBold: boolean
  imageCount: number
}

const attr = (node: XmlElement | undefined, name: string): string | undefined => node?.attrs[name]
/** A Word on/off property: present means on unless it says false or 0. */
const flag = (props: XmlElement | undefined, name: string): boolean => {
  const el = props ? child(props, name) : undefined
  if (!el) return false
  const v = el.attrs['w:val']
  return v === undefined || !(v === 'false' || v === '0' || v === 'off' || v === 'none')
}

const MONO = /courier|consolas|menlo|monaco|mono|source code|lucida console/i

function readText(files: Record<string, Uint8Array>, path: string): string | undefined {
  const bytes = files[path]
  return bytes ? strFromU8(bytes).replace(/^﻿/, '') : undefined
}

function parseRels(source: string | undefined): Map<string, Rel> {
  const rels = new Map<string, Rel>()
  if (!source) return rels
  for (const r of elements(parseXml(source), 'Relationship')) {
    const id = r.attrs['Id']
    if (id) rels.set(id, { target: r.attrs['Target'] ?? '', external: r.attrs['TargetMode'] === 'External' })
  }
  return rels
}

function parseStyles(source: string | undefined): Context['styles'] {
  const styles: Context['styles'] = new Map()
  if (!source) return styles
  for (const s of elements(parseXml(source), 'w:style')) {
    const id = s.attrs['w:styleId']
    if (!id) continue
    const ppr = child(s, 'w:pPr')
    const num = ppr ? child(ppr, 'w:numPr') : undefined
    const outline = attr(ppr ? child(ppr, 'w:outlineLvl') : undefined, 'w:val')
    styles.set(id, {
      name: attr(child(s, 'w:name'), 'w:val') ?? id,
      basedOn: attr(child(s, 'w:basedOn'), 'w:val'),
      outline: outline !== undefined ? Number(outline) : undefined,
      numId: attr(num ? child(num, 'w:numId') : undefined, 'w:val'),
      ilvl: num && child(num, 'w:ilvl') ? Number(attr(child(num, 'w:ilvl'), 'w:val')) : undefined
    })
  }
  return styles
}

function parseNumbering(source: string | undefined): Context['numbering'] {
  const result: Context['numbering'] = new Map()
  if (!source) return result
  const root = parseXml(source)
  const abstracts = new Map<string, Map<number, boolean>>()
  for (const a of elements(root, 'w:abstractNum')) {
    const levels = new Map<number, boolean>()
    for (const l of elements(a, 'w:lvl')) {
      levels.set(Number(l.attrs['w:ilvl'] ?? 0), attr(child(l, 'w:numFmt'), 'w:val') === 'bullet')
    }
    abstracts.set(a.attrs['w:abstractNumId'] ?? '', levels)
  }
  for (const n of elements(root, 'w:num')) {
    const levels = abstracts.get(attr(child(n, 'w:abstractNumId'), 'w:val') ?? '')
    if (levels && n.attrs['w:numId']) result.set(n.attrs['w:numId'], levels)
  }
  return result
}

function parseNotes(source: string | undefined, tag: string): Map<string, XmlElement> {
  const notes = new Map<string, XmlElement>()
  if (!source) return notes
  for (const n of elements(parseXml(source), tag)) {
    const type = n.attrs['w:type']
    if (type === 'separator' || type === 'continuationSeparator' || type === 'continuationNotice') continue
    if (n.attrs['w:id'] !== undefined) notes.set(n.attrs['w:id'], n)
  }
  return notes
}

/** The style chain's name, for matching Word's built-in styles ("heading 2", "List Bullet"). */
function styleNames(ctx: Context, id: string | undefined): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  while (id && !seen.has(id)) {
    seen.add(id)
    const s = ctx.styles.get(id)
    if (!s) {
      names.push(id)
      break
    }
    names.push(s.name)
    id = s.basedOn
  }
  return names
}

function headingLevel(ctx: Context, styleId: string | undefined, props: XmlElement | undefined): number {
  const own = attr(props ? child(props, 'w:outlineLvl') : undefined, 'w:val')
  if (own !== undefined && Number(own) < 6) return Number(own) + 1
  let id = styleId
  const seen = new Set<string>()
  while (id && !seen.has(id)) {
    seen.add(id)
    const s = ctx.styles.get(id)
    const m = /^heading\s*(\d)$/i.exec(s?.name ?? id)
    if (m) return Math.min(6, Number(m[1]))
    if (/^title$/i.test(s?.name ?? id)) return 1
    if (s?.outline !== undefined && s.outline < 6) return s.outline + 1
    id = s?.basedOn
  }
  return 0
}

/** Characters that would turn into Markdown formatting, made literal. */
function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/`/g, '\\`')
    .replace(/(^|\s)_|_(?=\s|$)/g, (m) => m.replace('_', '\\_'))
    .replace(/\[/g, '\\[')
    .replace(/~~/g, '\\~\\~')
    .replace(/==/g, '\\=\\=')
    .replace(/<(?=[a-zA-Z/!?])/g, '\\<')
}

/** A paragraph's start made literal when it looks like Markdown for a list, quote or heading. */
function escapeStart(text: string): string {
  return /^(#{1,6}(\s|$)|>|[-+*](\s|$)|\d+[.)](\s|$)|={3,}|-{3,}|_{3,}|~{3,}|`{3,})/.test(text) ? '\\' + text : text
}

function runProps(run: XmlElement, ctx: Context, styleDefaults?: Partial<Piece>): Omit<Piece, 'text'> {
  const rpr = child(run, 'w:rPr')
  const fonts = rpr ? child(rpr, 'w:rFonts') : undefined
  const font = fonts?.attrs['w:ascii'] ?? fonts?.attrs['w:hAnsi'] ?? ''
  const charStyle = attr(rpr ? child(rpr, 'w:rStyle') : undefined, 'w:val')
  const names = styleNames(ctx, charStyle).join(' ')
  const hl = attr(rpr ? child(rpr, 'w:highlight') : undefined, 'w:val')
  return {
    bold: flag(rpr, 'w:b') || /\bstrong\b/i.test(names) || (styleDefaults?.bold ?? false),
    italic: flag(rpr, 'w:i') || /\bemphasis\b/i.test(names) || (styleDefaults?.italic ?? false),
    strike: flag(rpr, 'w:strike') || flag(rpr, 'w:dstrike'),
    highlight: hl !== undefined && hl !== 'none',
    code: MONO.test(font) || /\b(code|source code|html code|verbatim)\b/i.test(names)
  }
}

/** The pieces of text in a run, with pictures and footnote marks as raw Markdown. */
function runPieces(run: XmlElement, ctx: Context, link: string | undefined): Piece[] {
  const base = runProps(run, ctx)
  const pieces: Piece[] = []
  let text = ''
  const flush = (): void => {
    if (text !== '') pieces.push({ ...base, text, link })
    text = ''
  }
  for (const c of elements(run)) {
    if (c.name === 'w:t') text += textOf(c)
    else if (c.name === 'w:tab') text += ' '
    else if (c.name === 'w:noBreakHyphen') text += '-'
    else if (c.name === 'w:softHyphen') continue
    else if (c.name === 'w:br' || c.name === 'w:cr') {
      if (c.attrs['w:type'] === 'page' || c.attrs['w:type'] === 'column') continue
      flush()
      pieces.push({ ...base, text: '\\\n', raw: true, link: undefined })
    } else if (c.name === 'w:footnoteReference' || c.name === 'w:endnoteReference') {
      const id = (c.name === 'w:endnoteReference' ? 'e' : 'f') + (c.attrs['w:id'] ?? '')
      flush()
      if (!ctx.noteOrder.includes(id)) ctx.noteOrder.push(id)
      pieces.push({ ...base, text: `[^${ctx.noteOrder.indexOf(id) + 1}]`, raw: true, link: undefined })
    } else if (c.name === 'w:drawing' || c.name === 'w:pict' || c.name === 'w:object') {
      flush()
      const image = pictureMarkdown(c, ctx)
      if (image) pieces.push({ ...base, text: image, raw: true, link })
    }
  }
  flush()
  return pieces
}

function descendants(node: XmlElement, name: string, out: XmlElement[] = []): XmlElement[] {
  for (const c of node.children) {
    if (typeof c === 'string') continue
    if (c.name === name) out.push(c)
    descendants(c, name, out)
  }
  return out
}

/** A picture's Markdown with a placeholder address, filled in when the pictures are stored. */
function pictureMarkdown(node: XmlElement, ctx: Context): string | null {
  const blip = descendants(node, 'a:blip')[0]
  const id = blip?.attrs['r:embed'] ?? descendants(node, 'v:imagedata')[0]?.attrs['r:id']
  const rel = id ? ctx.rels.get(id) : undefined
  if (!rel || rel.external) return null
  const alt = descendants(node, 'wp:docPr')[0]?.attrs['descr'] ?? ''
  ctx.imageCount++
  const path = rel.target.startsWith('/') ? rel.target.slice(1) : `word/${rel.target}`.replace(/\/\.\//g, '/')
  return `![${alt.replace(/[[\]\n]/g, ' ').trim()}](docx:${encodeURIComponent(path)})`
}

/** Runs of a paragraph (or a link inside it), in order, following insertions and skipping deletions. */
function paragraphPieces(node: XmlElement, ctx: Context, link?: string): Piece[] {
  const pieces: Piece[] = []
  for (const c of elements(node)) {
    if (c.name === 'w:r') pieces.push(...runPieces(c, ctx, link))
    else if (c.name === 'w:hyperlink') {
      const rel = c.attrs['r:id'] ? ctx.rels.get(c.attrs['r:id']) : undefined
      const anchor = c.attrs['w:anchor']
      pieces.push(...paragraphPieces(c, ctx, rel?.target ?? (anchor ? undefined : link)))
    } else if (c.name === 'w:ins' || c.name === 'w:moveTo' || c.name === 'w:smartTag' || c.name === 'w:fldSimple' || c.name === 'w:customXml') {
      pieces.push(...paragraphPieces(c, ctx, link))
    } else if (c.name === 'w:sdt') {
      const content = child(c, 'w:sdtContent')
      if (content) pieces.push(...paragraphPieces(content, ctx, link))
    }
    // w:del, w:moveFrom, bookmarks, comment marks and field codes carry no text of the document.
  }
  return pieces
}

function sameFormat(a: Piece, b: Piece): boolean {
  return !a.raw && !b.raw && a.bold === b.bold && a.italic === b.italic && a.strike === b.strike && a.highlight === b.highlight && a.code === b.code && a.link === b.link
}

/** Pieces as Markdown. Marks hug the words: spaces at the ends of a run stay outside them. */
function render(pieces: Piece[], options: { bold?: boolean } = {}): string {
  const merged: Piece[] = []
  for (const p of pieces) {
    const last = merged[merged.length - 1]
    if (last && sameFormat(last, p)) last.text += p.text
    else merged.push({ ...p })
  }
  // A link spans every piece that shares its address.
  const parts: string[] = []
  let i = 0
  let atStart = true
  while (i < merged.length) {
    const link = merged[i]!.link
    let j = i
    while (j < merged.length && merged[j]!.link === link && link !== undefined) j++
    if (link === undefined || j === i) j = i + 1
    const group = merged.slice(i, j)
    const inner = group.map((p) => format(p, link !== undefined, options.bold === false, atStart && p === group[0])).join('')
    atStart = false
    if (link !== undefined && inner.trim() !== '') {
      const lead = /^\s*/.exec(inner)![0]
      const trail = /\s*$/.exec(inner)![0]
      parts.push(`${lead}[${inner.trim()}](${link.includes(' ') || link.includes(')') ? `<${link}>` : link})${trail}`)
    } else parts.push(inner)
    i = j
  }
  return parts.join('')
}

function format(p: Piece, linked: boolean, plainBold: boolean, first: boolean): string {
  if (p.raw) return p.text
  const lead = /^\s*/.exec(p.text)![0]
  const trail = /\s*$/.exec(p.text)![0]
  const core = p.text.trim()
  if (core === '') return p.text.replace(/\s+/g, ' ')
  let out: string
  if (p.code) {
    const fence = core.includes('`') ? '``' : '`'
    out = `${fence}${core}${fence}`
  } else {
    out = first && !lead ? escapeStart(escapeText(core)) : escapeText(core)
    if (p.highlight) out = `==${out}==`
    if (p.strike) out = `~~${out}~~`
    const bold = p.bold && !plainBold
    if (bold && p.italic) out = `***${out}***`
    else if (bold) out = `**${out}**`
    else if (p.italic) out = `*${out}*`
  }
  void linked
  return lead + out + trail
}

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'para'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'item'; text: string; list: boolean }
  | { kind: 'table'; rows: string[][] }

function listInfo(ctx: Context, styleId: string | undefined, props: XmlElement | undefined): { numId: string; ilvl: number; bullet: boolean } | null {
  const num = props ? child(props, 'w:numPr') : undefined
  let numId = attr(num ? child(num, 'w:numId') : undefined, 'w:val')
  let ilvl = num && child(num, 'w:ilvl') ? Number(attr(child(num, 'w:ilvl'), 'w:val')) : undefined
  const names = styleNames(ctx, styleId)
  if (numId === undefined) {
    let id = styleId
    const seen = new Set<string>()
    while (id && !seen.has(id) && numId === undefined) {
      seen.add(id)
      const s = ctx.styles.get(id)
      numId = s?.numId
      ilvl ??= s?.ilvl
      id = s?.basedOn
    }
  }
  if (numId === '0') return null
  if (numId !== undefined) {
    const level = ilvl ?? 0
    return { numId, ilvl: level, bullet: ctx.numbering.get(numId)?.get(level) ?? true }
  }
  const named = names.find((n) => /^list (bullet|number|paragraph)/i.test(n))
  if (!named) return null
  return { numId: `style:${named}`, ilvl: Math.max(0, (Number(/(\d)$/.exec(named)?.[1] ?? 1) || 1) - 1), bullet: !/number/i.test(named) }
}

function paragraphBlock(p: XmlElement, ctx: Context): Block | null {
  const props = child(p, 'w:pPr')
  const styleId = attr(props ? child(props, 'w:pStyle') : undefined, 'w:val')
  const pieces = paragraphPieces(p, ctx)
  const text = (): string => render(pieces, { bold: !ctx.plainBold }).trim()
  const level = headingLevel(ctx, styleId, props)
  if (level > 0) {
    const t = render(pieces, { bold: false }).replace(/\\\n/g, ' ').trim()
    return t === '' ? null : { kind: 'heading', level, text: t }
  }
  const visible = pieces.filter((x) => x.raw || x.text.trim() !== '')
  if (visible.length === 0) return null
  const names = styleNames(ctx, styleId).join(' ')
  if (visible.every((x) => x.code || (x.raw && x.text === '\\\n')) || /\b(source code|preformatted|html preformatted|code block|macro text)\b/i.test(names)) {
    return { kind: 'code', text: pieces.map((x) => x.text).join('').replace(/\\\n/g, '\n') }
  }
  const list = listInfo(ctx, styleId, props)
  if (list) {
    const marker = list.bullet ? '- ' : `${nextNumber(ctx, list.numId, list.ilvl)}. `
    return { kind: 'item', list: list.bullet, text: `${'  '.repeat(list.ilvl)}${marker}${text().replace(/\\\n/g, '\n' + '  '.repeat(list.ilvl + 1))}` }
  }
  if (/\b(quote|block text|intense quote)\b/i.test(names)) {
    return { kind: 'quote', text: text() }
  }
  return { kind: 'para', text: text() }
}

function nextNumber(ctx: Context, numId: string, ilvl: number): number {
  const counts = ctx.counters.get(numId) ?? []
  counts.length = ilvl + 1
  for (let i = 0; i <= ilvl; i++) counts[i] ??= 0
  counts[ilvl] = counts[ilvl]! + 1
  ctx.counters.set(numId, counts)
  return counts[ilvl]!
}

function tableBlock(tbl: XmlElement, ctx: Context): Block | null {
  const rows: string[][] = []
  for (const tr of elements(tbl, 'w:tr')) {
    ctx.plainBold = rows.length === 0
    const row: string[] = []
    for (const tc of elements(tr, 'w:tc')) {
      const text = elements(tc, 'w:p')
        .map((p) => paragraphBlock(p, ctx))
        .filter((b): b is Block => b !== null && b.kind !== 'table')
        .map((b) => ('text' in b ? b.text : ''))
        .join(' ')
        .replace(/\\\n/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\|/g, '\\|')
        .trim()
      row.push(text)
      const span = Number(attr(child(child(tc, 'w:tcPr') ?? tc, 'w:gridSpan'), 'w:val') ?? 1)
      for (let k = 1; k < span; k++) row.push('')
    }
    if (row.length > 0) rows.push(row)
  }
  ctx.plainBold = false
  return rows.length === 0 ? null : { kind: 'table', rows }
}

function blocksOf(container: XmlElement, ctx: Context): Block[] {
  const blocks: Block[] = []
  for (const c of elements(container)) {
    if (c.name === 'w:p') {
      const b = paragraphBlock(c, ctx)
      if (b) blocks.push(b)
    } else if (c.name === 'w:tbl') {
      const b = tableBlock(c, ctx)
      if (b) blocks.push(b)
    } else if (c.name === 'w:sdt') {
      const content = child(c, 'w:sdtContent')
      if (content) blocks.push(...blocksOf(content, ctx))
    } else if (c.name === 'w:ins' || c.name === 'w:customXml' || c.name === 'w:smartTag') blocks.push(...blocksOf(c, ctx))
  }
  return blocks
}

/** Blocks as Markdown: a blank line between them, list items together, code lines in one fence. */
function blocksToMarkdown(blocks: Block[]): string {
  const out: string[] = []
  let last: Block | undefined
  for (const b of blocks) {
    if (b.kind === 'item' && last?.kind === 'item' && b.list === last.list) out[out.length - 1] += '\n' + b.text
    else if (b.kind === 'code' && last?.kind === 'code') out[out.length - 1] = out[out.length - 1]!.replace(/\n```$/, '\n' + b.text + '\n```')
    else if (b.kind === 'quote' && last?.kind === 'quote') out[out.length - 1] += '\n>\n' + quote(b.text)
    else if (b.kind === 'heading') out.push(`${'#'.repeat(b.level)} ${b.text}`)
    else if (b.kind === 'quote') out.push(quote(b.text))
    else if (b.kind === 'code') out.push('```\n' + b.text + '\n```')
    else if (b.kind === 'table') {
      const width = Math.max(...b.rows.map((r) => r.length))
      const pad = (r: string[]): string => `| ${[...r, ...Array<string>(width - r.length).fill('')].join(' | ')} |`
      out.push([pad(b.rows[0]!), `| ${Array<string>(width).fill('---').join(' | ')} |`, ...b.rows.slice(1).map(pad)].join('\n'))
    } else out.push(b.text)
    last = b
  }
  return out.join('\n\n')
}

const quote = (text: string): string => text.split('\n').map((l) => `> ${l}`).join('\n')

/** Markdown for a Word document, with its pictures stored through `options.saveImage`. */
export async function docxToMarkdown(bytes: Uint8Array, options: DocxImportOptions = {}): Promise<DocxImport> {
  let files: Record<string, Uint8Array>
  let total = 0
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize
        if (total > MAX_UNZIPPED) throw new Error('The file is too large to open')
        return /^(word\/|_rels\/|\[Content_Types\]\.xml)/.test(f.name)
      }
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('too large')) throw error
    throw new Error('Not a Word document')
  }
  const documentSource = readText(files, 'word/document.xml')
  if (documentSource === undefined) throw new Error('Not a Word document')

  const ctx: Context = {
    rels: parseRels(readText(files, 'word/_rels/document.xml.rels')),
    styles: parseStyles(readText(files, 'word/styles.xml')),
    numbering: parseNumbering(readText(files, 'word/numbering.xml')),
    footnotes: new Map(),
    noteOrder: [],
    media: new Map(),
    warnings: [],
    counters: new Map(),
    plainBold: false,
    imageCount: 0
  }
  const notes = new Map<string, XmlElement>()
  for (const [id, n] of parseNotes(readText(files, 'word/footnotes.xml'), 'w:footnote')) notes.set(`f${id}`, n)
  for (const [id, n] of parseNotes(readText(files, 'word/endnotes.xml'), 'w:endnote')) notes.set(`e${id}`, n)

  const body = child(parseXml(documentSource), 'w:body')
  if (!body) throw new Error('Not a Word document')
  let markdown = blocksToMarkdown(blocksOf(body, ctx))

  // Notes are numbered by where the text first refers to them; a note may itself hold a picture or link.
  const definitions: string[] = []
  for (let i = 0; i < ctx.noteOrder.length; i++) {
    const note = notes.get(ctx.noteOrder[i]!)
    const text = note ? blocksToMarkdown(blocksOf(note, ctx)).replace(/\n+/g, ' ').trim() : ''
    definitions.push(`[^${i + 1}]: ${text}`)
  }
  if (definitions.length > 0) markdown += '\n\n' + definitions.join('\n\n')

  // Pictures: stored once each, then the placeholder addresses are replaced.
  let stored = 0
  const placeholders = [...new Set([...markdown.matchAll(/!\[[^\]]*\]\(docx:([^)]+)\)/g)].map((m) => m[1]!))]
  const names = new Map<string, string | null>()
  for (const encoded of placeholders) {
    const path = decodeURIComponent(encoded)
    const data = files[path]
    let name: string | null = null
    if (data && options.saveImage) {
      try {
        name = await options.saveImage(path.split('/').pop() ?? 'image.png', data)
        stored++
      } catch {
        name = null
      }
    }
    names.set(encoded, name)
  }
  let dropped = 0
  markdown = markdown.replace(/!\[([^\]]*)\]\(docx:([^)]+)\)/g, (_m, alt: string, encoded: string) => {
    const name = names.get(encoded)
    if (!name) {
      dropped++
      return ''
    }
    return imageMarkdown(name, alt)
  })
  if (dropped > 0) ctx.warnings.push(dropped === 1 ? 'A picture could not be imported.' : `${dropped} pictures could not be imported.`)

  return {
    markdown: markdown.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim(),
    images: stored,
    warnings: ctx.warnings
  }
}
