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

const PREVIEW_LENGTH = 120

/**
 * A short plain-text preview: the text after the title line, with
 * whitespace collapsed and truncated with an ellipsis.
 */
export function sheetPreview(content: string): string {
  const lines = content.split(/\r?\n/)
  const titleIndex = lines.findIndex((line) => line.replace(/^\s{0,3}#{1,6}\s+/, '').trim() !== '')
  if (titleIndex === -1) return ''
  const rest = lines.slice(titleIndex + 1).join(' ').replace(/\s+/g, ' ').trim()
  return rest.length > PREVIEW_LENGTH ? rest.slice(0, PREVIEW_LENGTH).trimEnd() + '…' : rest
}
