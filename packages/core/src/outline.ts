import { maskComments } from './comments'

export interface Heading {
  /** 1 for `#`, up to 6. */
  level: number
  /** The heading as plain text, without Markdown markers. */
  text: string
  /** Where the heading line starts in the text. */
  offset: number
}

/** Strips the Markdown that would clutter an outline entry. */
function plain(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * The headings of a sheet, in order. Lines in fenced code blocks and in
 * comments are not headings.
 */
export function extractHeadings(text: string): Heading[] {
  const headings: Heading[] = []
  const masked = maskComments(text)
  let fence: string | null = null
  let offset = 0
  for (const line of masked.split('\n')) {
    const marker = /^ {0,3}(```|~~~)/.exec(line)?.[1]
    if (fence !== null) {
      if (marker === fence) fence = null
    } else if (marker) {
      fence = marker
    } else {
      const match = /^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(line.replace(/\r$/, ''))
      const title = match ? plain(match[2]!) : ''
      if (match && title !== '') headings.push({ level: match[1]!.length, text: title, offset })
    }
    offset += line.length + 1
  }
  return headings
}
