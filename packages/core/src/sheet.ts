import { stripComments } from './comments'
import { findTables } from './table'

export const UNTITLED = 'Untitled'

/**
 * A sheet's title is its first non-blank line, without the Markdown
 * heading marker if it has one.
 */
export function sheetTitle(content: string): string {
  for (const line of content.split(/\r?\n/)) {
    const title = line.replace(/^\s{0,3}#{1,6}\s+/, '').trim()
    if (title !== '') return title
  }
  return UNTITLED
}

const PREVIEW_LENGTH = 200

/** Plain text for a preview: the Markdown markers a reader would not see are dropped. */
function plainText(line: string): string {
  return line
    .replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__|~~|[*`])/g, '')
    .replace(/(^|\s)_+|_+(?=\s|$)/g, '$1')
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
  const lines = stripComments(content).split(/\r?\n/)
  const titleIndex = lines.findIndex((line) => line.replace(/^\s{0,3}#{1,6}\s+/, '').trim() !== '')
  if (titleIndex === -1) return ''
  const rest = withoutTables(lines.slice(titleIndex + 1))
    .map(plainText)
    .join(' ').replace(/\s+/g, ' ').trim()
  return rest.length > PREVIEW_LENGTH ? rest.slice(0, PREVIEW_LENGTH).trimEnd() + '…' : rest
}
