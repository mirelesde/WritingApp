import { Marked } from 'marked'
import { stripComments } from './comments'
import type { FileSystem } from './filesystem'
import type { GroupNode, SheetNode } from './library'

const marked = new Marked({
  gfm: true,
  renderer: {
    // Raw HTML in a sheet is shown as text, so an export never carries
    // scripts or markup the writer did not mean to publish.
    html: ({ text }) => escapeHtml(text),
  },
})

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Converts Markdown to an HTML fragment. */
export function markdownToHtml(markdown: string): string {
  return marked.parse(markdown, { async: false })
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
code { font: .9em ui-monospace, Menlo, Consolas, monospace; background: #8882; padding: .1em .3em; border-radius: 3px; }
pre { background: #8882; padding: 1em; overflow-x: auto; border-radius: 4px; }
pre code { background: none; padding: 0; }
img { max-width: 100%; }
table { border-collapse: collapse; }
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
): Promise<HtmlExport> {
  const runs = exportRuns(root, selection)
  if (runs.length === 0) throw new Error('Nothing to export: select sheets or a group')

  const only = selection.length === 1 ? findGroup(root, selection[0]!) : undefined
  const title = only ? only.name : runs[0]![0]!.title

  const parts: string[] = []
  for (const run of runs) {
    const texts: string[] = []
    for (const sheet of run) texts.push(await fs.readText(sheet.path))
    parts.push(markdownToHtml(texts.map((t) => stripComments(t).trim()).join('\n\n')))
  }
  const body = parts.map((p) => `<section>\n${p}</section>`).join('\n<hr class="break">\n')
  return {
    title,
    html: htmlDocument(title, body, style),
    sheets: runs.reduce((n, run) => n + run.length, 0),
  }
}

function findGroup(node: GroupNode, path: string): GroupNode | undefined {
  if (node.path === path) return node
  for (const child of node.children) {
    if (child.kind === 'group') {
      const found = findGroup(child, path)
      if (found) return found
    }
  }
  return undefined
}
