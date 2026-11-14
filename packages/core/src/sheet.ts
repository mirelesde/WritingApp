import { stripComments } from './comments'
import { stripFootnotes } from './footnotes'
import { findTables } from './table'

export const UNTITLED = 'Untitled'

/** Inline Markdown marks a reader would not see: links, emphasis, highlights, code, wiki links, footnote marks, escapes. */
function inlinePlain(text: string): string {
  return text
    .replace(/!?\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/\[\^[^\]]+\]/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\\([\\`*_{}[\]()#+\-.!~=<>|$])|(\*\*|__|~~|==|[*`])/g, (_m, escaped: string | undefined) => escaped ?? '')
    .replace(/(^|\s)_+|_+(?=\s|$)/g, '$1')
}

/**
 * A sheet's title is its first non-blank line, without the Markdown
 * heading marker or emphasis marks if it has them.
 */
export function sheetTitle(content: string): string {
  for (const line of content.split(/\r?\n/)) {
    const title = inlinePlain(line.replace(/^\s{0,3}#{1,6}\s+/, '')).trim()
    if (title !== '') return title
  }
  return UNTITLED
}

const PREVIEW_LENGTH = 200

/** Plain text for a preview: the Markdown markers a reader would not see are dropped. */
function plainText(line: string): string {
  return line
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, '')
    .replace(/^\s{0,3}(`{3,}|~{3,}).*$/, '')
    .replace(/^\s{0,3}([-*_]\s*){3,}$/, '')
    .replace(/^\s{0,3}(=+|-+)\s*$/, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/^.*$/, inlinePlain)
}

/** The lines with each table (and its caption) replaced by a single "(Table)" line. */
function withoutTables(lines: string[]): string[] {
  const blocks = findTables(lines.join('\n'))
  if (blocks.length === 0) return lines
  const out: string[] = []
  let at = 0
  for (const { from, to } of blocks) {
    out.push(...lines.slice(at, from), '(Table)')
    at = to
  }
  return [...out, ...lines.slice(at)]
}

/**
 * A short plain-text preview: the text after the title line, with
 * whitespace collapsed and truncated with an ellipsis.
 */
export function sheetPreview(content: string): string {
  const lines = stripFootnotes(stripComments(content)).split(/\r?\n/)
  const titleIndex = lines.findIndex((line) => line.replace(/^\s{0,3}#{1,6}\s+/, '').trim() !== '')
  if (titleIndex === -1) return ''
  const rest = withoutTables(lines.slice(titleIndex + 1))
    .map(plainText)
    .join(' ').replace(/\s+/g, ' ').trim()
  return rest.length > PREVIEW_LENGTH ? rest.slice(0, PREVIEW_LENGTH).trimEnd() + '…' : rest
}
