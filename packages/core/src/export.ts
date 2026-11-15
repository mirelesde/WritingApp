import { withoutWikiLinks } from './wikiLinks'
import { assetNameFromUrl, embedImages, findImages, imagesSize, linkImagesToFolder } from './images'
import { Marked } from 'marked'
import { stripComments } from './comments'
import { addHeadingIds, expandContents, markContentsLinks } from './contents'
import { mathToHtml } from './math'
import { findFootnoteDefs, findFootnoteRefs } from './footnotes'
import { sanitizeCss, STYLE_BLOCK_OPEN } from './exportStyles'
import type { FileSystem } from './filesystem'
import type { GroupNode, SheetNode } from './library'

/** `==highlighted==` text becomes `<mark>`. Needs text after the opening marks and before the closing ones. */
const highlight = {
  name: 'highlight',
  level: 'inline' as const,
  start: (src: string) => src.indexOf('=='),
  tokenizer(this: { lexer: { inlineTokens: (src: string) => unknown[] } }, src: string) {
    const match = /^==(?=[^\s=])((?:\\.|[^=\\]|=(?!=))+?)(?<=\S)==(?!=)/.exec(src)
    if (!match) return undefined
    return { type: 'highlight', raw: match[0], text: match[1]!, tokens: this.lexer.inlineTokens(match[1]!) }
  },
  renderer(this: { parser: { parseInline: (tokens: unknown[]) => string } }, token: { tokens?: unknown[] }) {
    return `<mark>${this.parser.parseInline(token.tokens ?? [])}</mark>`
  },
}

/** `$x$` and `$$x$$` inside a line, as MathML. Not a price: no space inside the dollars, no digit after. */
const inlineMath = {
  name: 'inlineMath',
  level: 'inline' as const,
  start: (src: string) => src.indexOf('$'),
  tokenizer(src: string) {
    const match = /^(?:\$\$(?=\S)(.+?)(?<=\S)\$\$|\$(?=[^\s$])((?:\\.|[^$\\])+?)(?<=\S)\$(?![\d$]))/.exec(src)
    if (!match) return undefined
    return { type: 'inlineMath', raw: match[0], text: (match[1] ?? match[2] ?? '').trim(), display: match[1] !== undefined }
  },
  renderer(token: { text?: string; display?: boolean }) {
    return mathToHtml(token.text ?? '', token.display === true)
  },
}

/** A `$$` block on its own lines, as display MathML. */
const blockMath = {
  name: 'blockMath',
  level: 'block' as const,
  start: (src: string) => src.indexOf('$$'),
  tokenizer(src: string) {
    const match = /^\$\$[ \t]*\n?([\s\S]+?)\n?[ \t]*\$\$[ \t]*(?:\n|$)/.exec(src)
    if (!match) return undefined
    return { type: 'blockMath', raw: match[0], text: match[1]!.trim() }
  },
  renderer(token: { text?: string }) {
    return `<div class="math-block">${mathToHtml(token.text ?? '', true)}</div>\n`
  },
}

const marked = new Marked({
  gfm: true,
  extensions: [highlight as never, blockMath as never, inlineMath as never],
  renderer: {
    // Raw HTML in a sheet is shown as text, so an export never carries
    // scripts or markup the writer did not mean to publish.
    html: ({ text }) => escapeHtml(text),
  },
})

/** Markdown as marked's tokens (with highlight and math), for exporters that build other formats. */
export function markdownTokens(markdown: string): ReturnType<typeof marked.lexer> {
  return marked.lexer(markdown)
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Converts Markdown to an HTML fragment. */
export function markdownToHtml(source: string): string {
  const markdown = withoutWikiLinks(source)
  const defs = findFootnoteDefs(markdown)
  if (defs.length === 0) return marked.parse(markdown, { async: false })

  // Number the notes in the order they are referred to; drop their definition lines.
  const noted = new Map(defs.map((d) => [d.id, d.text]))
  const order: string[] = []
  for (const ref of findFootnoteRefs(markdown)) {
    if (noted.has(ref.id) && !order.includes(ref.id)) order.push(ref.id)
  }
  let body = markdown
  for (const def of [...defs].reverse()) {
    const to = body[def.to] === '\n' ? def.to + 1 : def.to
    body = body.slice(0, def.from) + body.slice(to)
  }
  let html = marked.parse(body, { async: false })
  order.forEach((id, i) => {
    const n = i + 1
    const link = `<sup class="footnote-ref"><a href="#fn-${n}" id="fnref-${n}">${n}</a></sup>`
    html = html.split(`[^${id}]`).join(link)
  })
  if (order.length === 0) return html
  const items = order.map((id, i) => {
    const note = marked.parseInline(noted.get(id) ?? '', { async: false })
    return `<li id="fn-${i + 1}">${note} <a href="#fnref-${i + 1}">↩</a></li>`
  })
  return `${html}<section class="footnotes"><hr><ol>${items.join('')}</ol></section>\n`
}

/**
 * Works out which sheets an export covers, as runs: arrays of sheets that
 * read as one continuous piece. `selection` holds sheet and group paths.
 * A group stands for all the sheets inside it. A lone sheet that is part of
 * a glued run stands for the whole run. The result follows library order,
 * whatever order the selection was made in.
 */
export function exportRuns(root: GroupNode, selection: string[]): SheetNode[][] {
  const chosen = new Set(selection)
  const all: { sheet: SheetNode; parent: GroupNode }[] = []
  const walk = (group: GroupNode, inChosen: boolean): void => {
    for (const child of group.children) {
      const on = inChosen || chosen.has(child.path)
      if (child.kind === 'group') walk(child, on)
      else if (on) all.push({ sheet: child, parent: group })
    }
  }
  walk(root, chosen.has(root.path))

  if (all.length === 1) {
    const only = all[0]!
    const siblings = only.parent.children
    let start = siblings.indexOf(only.sheet)
    while (start > 0 && (siblings[start - 1] as SheetNode).glued) start--
    let end = siblings.indexOf(only.sheet)
    while ((siblings[end] as SheetNode).glued && siblings[end + 1]?.kind === 'sheet') end++
    return [siblings.slice(start, end + 1) as SheetNode[]]
  }

  const runs: SheetNode[][] = []
  let previous: SheetNode | undefined
  for (const { sheet } of all) {
    if (previous?.glued && runs.length > 0) runs[runs.length - 1]!.push(sheet)
    else runs.push([sheet])
    previous = sheet
  }
  return runs
}

const STYLE = `
:root { color-scheme: light dark; }
body {
  margin: 0 auto; max-width: 40rem; padding: 3rem 1.5rem 6rem;
  font: 1.125rem/1.7 Georgia, 'Times New Roman', serif;
  color: #222; background: #fff;
}
@media (prefers-color-scheme: dark) { body { color: #ddd; background: #1b1b1b; } }
h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 2em 0 .5em; font-family: system-ui, sans-serif; }
h1 { font-size: 2rem; margin-top: 0; }
p, ul, ol, blockquote, pre, table { margin: 0 0 1em; }
blockquote { margin-left: 0; padding-left: 1em; border-left: 3px solid #8885; color: #666; }
.math-block { margin: 0 0 1em; text-align: center; overflow-x: auto; }
mark { background: #ffe14d88; color: inherit; padding: 0 .1em; border-radius: 2px; }
code { font: .9em ui-monospace, Menlo, Consolas, monospace; background: #8882; padding: .1em .3em; border-radius: 3px; }
pre { background: #8882; padding: 1em; overflow-x: auto; border-radius: 4px; }
pre code { background: none; padding: 0; }
img { max-width: 100%; }
table { border-collapse: collapse; }
img { max-width: 100%; }
th, td { border: 1px solid #8887; padding: .3em .6em; }
hr.break { border: 0; text-align: center; margin: 3em 0; }
hr.break::after { content: '* * *'; letter-spacing: .5em; color: #888; }
@media print {
  body { max-width: none; padding: 0; font-size: 11.5pt; color: #000; background: #fff; }
  h1, h2, h3, h4, h5, h6 { break-after: avoid; }
  pre, blockquote, table, img { break-inside: avoid; }
  p { orphans: 3; widows: 3; }
}
`

/** How an export looks beyond the content itself. */
export interface ExportStyle {
  /** Indent each paragraph that follows another and drop the space between them, as in a printed book. */
  indentParagraphs?: boolean
  /** The CSS of the chosen export style (see exportStyles.ts), laid over the base stylesheet. */
  css?: string
}

const INDENT_STYLE = `
p { margin: 0; }
p + p { text-indent: 1.5em; }
ul, ol, blockquote, pre, table { margin-top: 1em; }
`

/** Wraps rendered body HTML in a complete, self-contained page. */
export function htmlDocument(title: string, body: string, options: ExportStyle = {}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}${options.indentParagraphs ? INDENT_STYLE : ''}</style>
${STYLE_BLOCK_OPEN}${sanitizeCss(options.css ?? '')}</style>
</head>
<body>
${body}
</body>
</html>
`
}

export interface HtmlExport {
  /** The title of the document: the first sheet's title, or the group's name. */
  title: string
  /** A complete HTML page. */
  html: string
  /** How many sheets it holds. */
  sheets: number
  /** The library pictures the text uses, by file name. */
  images: string[]
  /** Their total size in bytes, whether embedded or not. */
  imageBytes: number
}

/**
 * Builds one HTML page from the selected sheets and groups. Sheets of a
 * glued run flow together; other sheets are separated by a break.
 * Throws if the selection holds no sheets.
 */
export async function exportHtml(
  fs: FileSystem,
  root: GroupNode,
  selection: string[],
  style: ExportStyle = {},
  /** Name of a folder beside the saved file to keep the pictures in; without it they are embedded in the page. */
  imagesFolder?: string,
): Promise<HtmlExport> {
  const runs = exportRuns(root, selection)
  if (runs.length === 0) throw new Error('Nothing to export: select sheets or a group')

  const only = selection.length === 1 ? findGroup(root, selection[0]!) : undefined
  const title = only ? only.name : runs[0]![0]!.title

  const used = new Set<string>()
  const runTexts: string[][] = []
  for (const run of runs) {
    const texts: string[] = []
    for (const sheet of run) {
      let text = stripComments(await fs.readText(sheet.path)).trim()
      for (const ref of findImages(text)) {
        const name = assetNameFromUrl(ref.url)
        if (name) used.add(name)
      }
      text = imagesFolder ? linkImagesToFolder(text, imagesFolder).text : await embedImages(fs, root.path, text)
      texts.push(text)
    }
    runTexts.push(texts)
  }
  const flat = runTexts.flat()
  const expanded = expandContents(flat, 'html')
  let at = 0
  const parts = runTexts.map((texts) => {
    const mine = expanded.slice(at, (at += texts.length))
    return markdownToHtml(mine.join('\n\n'))
  })
  const body = markContentsLinks(addHeadingIds(parts.map((p) => `<section>\n${p}</section>`).join('\n<hr class="break">\n'), flat))
  const images = [...used]
  return {
    title,
    html: htmlDocument(title, body, style),
    sheets: runs.reduce((n, run) => n + run.length, 0),
    images,
    imageBytes: await imagesSize(fs, root.path, images),
  }
}

export function findGroup(node: GroupNode, path: string): GroupNode | undefined {
  if (node.path === path) return node
  for (const child of node.children) {
    if (child.kind === 'group') {
      const found = findGroup(child, path)
      if (found) return found
    }
  }
  return undefined
}

export interface MarkdownExport {
  title: string
  markdown: string
  /** The library pictures the text uses, by file name, to be copied next to the file. */
  images: string[]
  sheets: number
}

/**
 * The selection as one Markdown text, in the same order and with the same
 * leaving-out of comments as the HTML export. Links to library pictures point
 * into `imagesFolder` instead, a folder that sits beside the saved file, so
 * they work in any Markdown app; `images` names the files to copy there.
 */
export async function exportMarkdown(
  fs: FileSystem,
  root: GroupNode,
  selection: string[],
  imagesFolder: string,
  /** Replace `(cnt)` with a list of headings. Word export keeps it, to write a real table of contents. */
  expandMarker = true,
): Promise<MarkdownExport> {
  const runs = exportRuns(root, selection)
  if (runs.length === 0) throw new Error('Nothing to export: select sheets or a group')
  const only = selection.length === 1 ? findGroup(root, selection[0]!) : undefined
  const title = only ? only.name : runs[0]![0]!.title

  const images = new Set<string>()
  const runTexts: string[][] = []
  for (const run of runs) {
    const texts: string[] = []
    for (const sheet of run) {
      const linked = linkImagesToFolder(stripComments(await fs.readText(sheet.path)).trim(), imagesFolder)
      for (const name of linked.names) images.add(name)
      const text = linked.text
      texts.push(text)
    }
    runTexts.push(texts)
  }
  const expanded = expandMarker ? expandContents(runTexts.flat(), 'github') : runTexts.flat()
  let at = 0
  const parts = runTexts.map((texts) => expanded.slice(at, (at += texts.length)).join('\n\n'))
  return {
    title,
    markdown: parts.join('\n\n---\n\n') + '\n',
    images: [...images],
    sheets: runs.reduce((n, run) => n + run.length, 0),
  }
}

/** How much larger embedding pictures makes the page, compared with the page without them (1 = twice the size). */
export function embeddedGrowth(imageBytes: number, embeddedHtmlLength: number): number {
  // Base64 makes a picture a third bigger as text.
  const extra = Math.ceil((imageBytes * 4) / 3)
  const base = Math.max(1, embeddedHtmlLength - extra)
  return extra / base
}

/** Embedding pictures grows the page by this much before a folder is suggested instead. */
export const FOLDER_SUGGESTION_GROWTH = 0.5
