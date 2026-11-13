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
