/*
 * Writes the selected sheets as an EPUB 3 book: one chapter file per sheet (glued
 * sheets share one), a navigation document built from the headings, optional cover.
 * Reuses the HTML export's Markdown renderer and the export styles' CSS. Platform-free:
 * the zip is written with fflate.
 */
import { strToU8, zipSync, type Zippable } from 'fflate'
import { stripComments } from './comments'
import { addHeadingIds, findMarkers } from './contents'
import { exportRuns, findGroup, markdownToHtml } from './export'
import { sanitizeCss } from './exportStyles'
import type { FileSystem } from './filesystem'
import { ASSETS_DIR, imageMime, linkImagesToFolder } from './images'
import type { GroupNode } from './library'
import { joinPath } from './path'
import { escapeXml } from './xml'

export interface EpubOptions {
  /** Defaults to the group's name or the first sheet's title. */
  title?: string
  author?: string
  /** A BCP 47 tag such as "en" or "es". Default "en". */
  language?: string
  /** The CSS of the chosen export style, laid over the base stylesheet. */
  css?: string
  indentParagraphs?: boolean
  cover?: { bytes: Uint8Array; name: string }
  /** For tests: the book's identifier and its modified time. */
  identifier?: string
  now?: Date
}

export interface EpubExport {
  title: string
  bytes: Uint8Array
  chapters: number
  images: number
}

interface NavEntry {
  level: number
  text: string
  href: string
}

const BASE_CSS = `
body { margin: 0; line-height: 1.5; }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.5em 0 .5em; break-after: avoid; }
h1 { font-size: 1.8em; margin-top: 0; }
p { margin: 0 0 1em; }
blockquote { margin: 0 0 1em 0; padding-left: 1em; border-left: 3px solid #888; }
pre { white-space: pre-wrap; background: #eee; padding: .6em; }
code { font-family: monospace; }
mark { background: #ffe14d; color: inherit; }
img { max-width: 100%; }
table { border-collapse: collapse; }
th, td { border: 1px solid #888; padding: .2em .5em; }
hr.break { border: 0; text-align: center; margin: 2em 0; }
.cover { text-align: center; }
.cover img { max-height: 100%; }
`

const INDENT_CSS = `
p { margin: 0; }
p + p { text-indent: 1.5em; }
`

// Named entities that XML does not know, by the characters they stand for.
const NAMED: Record<string, string> = {
  nbsp: ' ', copy: '©', reg: '®', trade: '™', mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', times: '×', deg: '°', euro: '€', middot: '·', bull: '•',
  para: '¶', sect: '§', iexcl: '¡', iquest: '¿', plusmn: '±', frac12: '½',
}

/** Makes the HTML the Markdown renderer wrote into well-formed XHTML. */
export function toXhtml(html: string): string {
  return html
    .replace(/<(br|hr|img|input|col|wbr)(\s[^<>]*?)?\s*\/?>/g, (_m, tag: string, attrs = '') => `<${tag}${attrs.replace(/\s+$/, '')}/>`)
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (whole, name: string) => {
      if (['amp', 'lt', 'gt', 'quot', 'apos'].includes(name)) return whole
      const char = NAMED[name]
      return char !== undefined ? char : `&amp;${name};`
    })
    .replace(/<math(?![^>]*xmlns)/g, '<math xmlns="http://www.w3.org/1998/Math/MathML"')
}

const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'

function page(title: string, lang: string, body: string, extra = ''): string {
  return `${xml}<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(lang)}" xml:lang="${escapeXml(lang)}">
<head>
<meta charset="utf-8"/>
<title>${escapeXml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>${extra}
</head>
<body>
${body}
</body>
</html>
`
}

/** Entries as nested `<ol>`s, deeper levels inside the entry above. */
function nestedList(entries: NavEntry[]): string {
  if (entries.length === 0) return '<ol></ol>'
  // A level can only go one deeper than the entry before it.
  const top = Math.min(...entries.map((e) => e.level))
  let previous = top
  const levels = entries.map((e, i) => (previous = i === 0 ? top : Math.min(Math.max(e.level, top), previous + 1)))
  let out = '<ol>'
  let depth = top
  entries.forEach((e, i) => {
    const level = levels[i]!
    if (i > 0) {
      if (level > depth) out += '<ol>'
      else {
        out += '</li>'
        for (let d = depth; d > level; d--) out += '</ol></li>'
      }
      depth = level
    }
    out += `<li><a href="${escapeXml(e.href)}">${escapeXml(e.text)}</a>`
  })
  out += '</li>'
  for (let d = depth; d > top; d--) out += '</ol></li>'
  return out + '</ol>'
}

function ncxPoints(entries: NavEntry[]): string {
  return entries
    .map(
      (e, i) =>
        `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${escapeXml(e.text)}</text></navLabel><content src="${escapeXml(e.href)}"/></navPoint>`,
    )
    .join('')
}

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  return `urn:uuid:${c?.randomUUID ? c.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`}`
}

/** Builds the book. Throws if the selection holds no sheets. */
export async function exportEpub(
  fs: FileSystem,
  root: GroupNode,
  selection: string[],
  options: EpubOptions = {},
): Promise<EpubExport> {
  const runs = exportRuns(root, selection)
  if (runs.length === 0) throw new Error('Nothing to export: select sheets or a group')
  const only = selection.length === 1 ? findGroup(root, selection[0]!) : undefined
  const title = (options.title ?? '').trim() || (only ? only.name : runs[0]![0]!.title)
  const lang = options.language && /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(options.language) ? options.language : 'en'

  const used = new Set<string>()
  const chapters: { file: string; xhtml: string; math: boolean }[] = []
  const nav: NavEntry[] = []
  for (const [i, run] of runs.entries()) {
    const texts: string[] = []
    for (const sheet of run) {
      let text = stripComments(await fs.readText(sheet.path)).trim()
      // The book has its own contents; a (cnt) line in the text would link nowhere useful.
      for (const at of [...findMarkers(text)].reverse()) {
        const end = text.indexOf('\n', at)
        text = text.slice(0, at) + text.slice(end === -1 ? text.length : end + 1)
      }
      const linked = linkImagesToFolder(text, 'images')
      for (const name of linked.names) used.add(name)
      texts.push(linked.text)
    }
    const file = `chapter-${i + 1}.xhtml`
    const html = addHeadingIds(markdownToHtml(texts.join('\n\n')), texts)
    const body = toXhtml(html)
    chapters.push({ file, xhtml: page(run[0]!.title, lang, body), math: body.includes('<math') })

    // Navigation: the headings down to level 3; a chapter with none is listed by its sheet's title.
    const slugs = [...body.matchAll(/<h([1-3]) id="([^"]+)">([\s\S]*?)<\/h\1>/g)]
    const found = slugs.map((m) => ({
      level: Number(m[1]),
      text: m[3]!.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim(),
      href: `${file}#${m[2]}`,
    }))
    if (found.length === 0) nav.push({ level: 1, text: run[0]!.title, href: file })
    else {
      // The first heading is the chapter itself: link to the file's start.
      found[0]!.href = file
      nav.push(...found)
    }
  }

  // Pictures the chapters use.
  const media: { id: string; href: string; type: string; bytes: Uint8Array }[] = []
  for (const name of used) {
    const type = imageMime(name)
    const from = joinPath(joinPath(root.path, ASSETS_DIR), name)
    if (!type || !(await fs.exists(from))) continue
    media.push({ id: `img-${media.length + 1}`, href: `images/${name}`, type, bytes: await fs.readBinary(from) })
  }

  const cover = options.cover
  const coverType = cover ? imageMime(cover.name) : undefined
  const identifier = options.identifier ?? newId()
  const modified = (options.now ?? new Date()).toISOString().replace(/\.\d+Z$/, 'Z')
  const css = BASE_CSS + (options.indentParagraphs ? INDENT_CSS : '') + sanitizeCss(options.css ?? '')

  const coverHref = cover && coverType ? `images/cover-${cover.name.replace(/[^A-Za-z0-9._-]/g, '_')}` : null
  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
    ...(coverHref ? [`<item id="cover-image" href="${escapeXml(coverHref)}" media-type="${coverType}" properties="cover-image"/>`, '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>'] : []),
    ...chapters.map((c, i) => `<item id="c${i + 1}" href="${c.file}" media-type="application/xhtml+xml"${c.math ? ' properties="mathml"' : ''}/>`),
    ...media.map((m) => `<item id="${m.id}" href="${escapeXml(m.href)}" media-type="${m.type}"/>`),
  ]
  const spine = [...(coverHref ? ['<itemref idref="cover"/>'] : []), ...chapters.map((_c, i) => `<itemref idref="c${i + 1}"/>`)]
  const opf = `${xml}<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="${escapeXml(lang)}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>
<dc:title>${escapeXml(title)}</dc:title>
<dc:language>${escapeXml(lang)}</dc:language>
${options.author?.trim() ? `<dc:creator>${escapeXml(options.author.trim())}</dc:creator>\n` : ''}<meta property="dcterms:modified">${modified}</meta>
${coverHref ? '<meta name="cover" content="cover-image"/>\n' : ''}</metadata>
<manifest>
${manifest.join('\n')}
</manifest>
<spine toc="ncx">
${spine.join('\n')}
</spine>
</package>
`
  const navDoc = `${xml}<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escapeXml(lang)}" xml:lang="${escapeXml(lang)}">
<head><meta charset="utf-8"/><title>${escapeXml(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<nav epub:type="toc" id="toc"><h1>${escapeXml(title)}</h1>${nestedList(nav)}</nav>
</body>
</html>
`
  const ncx = `${xml}<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
<head><meta name="dtb:uid" content="${escapeXml(identifier)}"/></head>
<docTitle><text>${escapeXml(title)}</text></docTitle>
<navMap>${ncxPoints(nav)}</navMap>
</ncx>
`
  const files: Zippable = {
    // The mimetype entry comes first and is stored, not compressed.
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(
      `${xml}<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>\n`,
    ),
    'OEBPS/content.opf': strToU8(opf),
    'OEBPS/nav.xhtml': strToU8(navDoc),
    'OEBPS/toc.ncx': strToU8(ncx),
    'OEBPS/style.css': strToU8(css),
  }
  if (coverHref && cover) {
    files['OEBPS/cover.xhtml'] = strToU8(page(title, lang, `<div class="cover"><img src="${escapeXml(coverHref)}" alt="${escapeXml(title)}"/></div>`))
    files[`OEBPS/${coverHref}`] = [cover.bytes, { level: 0 }]
  }
  for (const c of chapters) files[`OEBPS/${c.file}`] = strToU8(c.xhtml)
  for (const m of media) files[`OEBPS/${m.href}`] = [m.bytes, { level: 0 }]
  return { title, bytes: zipSync(files), chapters: chapters.length, images: media.length }
}
