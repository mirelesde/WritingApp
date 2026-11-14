import { maskComments } from './comments'
import { extractHeadings, type Heading } from './outline'

/** A line with only this on it stands for an automatic table of contents (Ulysses writes it the same way). */
export const CONTENTS_MARKER = '(cnt)'

const MARKER_LINE = /^ {0,3}\(cnt\)[ \t]*$/

/** Whether the text holds a table of contents marker outside code blocks. */
export function hasContentsMarker(text: string): boolean {
  return findMarkers(text).length > 0
}

/** Offsets of the lines that are `(cnt)`, ignoring fenced code and comments. */
export function findMarkers(text: string): number[] {
  const found: number[] = []
  let fence: string | null = null
  let offset = 0
  for (const line of maskComments(text).split('\n')) {
    const marker = /^ {0,3}(```|~~~)/.exec(line)?.[1]
    if (fence !== null) {
      if (marker === fence) fence = null
    } else if (marker) fence = marker
    else if (MARKER_LINE.test(line.replace(/\r$/, ''))) found.push(offset)
    offset += line.length + 1
  }
  return found
}

/** Anchor names for headings, unique within one document: "intro", "intro-2", … */
export function headingSlugs(headings: Heading[]): string[] {
  const seen = new Map<string, number>()
  return headings.map((h) => {
    const base =
      h.text
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '') || 'section'
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return n === 1 ? base : `${base}-${n}`
  })
}

/** The headings of several texts read in order, with offsets into their join. */
function allHeadings(texts: string[]): { heading: Heading; slug: string }[] {
  const list: Heading[] = []
  let base = 0
  for (const text of texts) {
    for (const h of extractHeadings(text)) list.push({ ...h, offset: h.offset + base })
    base += text.length + 2
  }
  const slugs = headingSlugs(list)
  return list.map((heading, i) => ({ heading, slug: slugs[i]! }))
}

/**
 * Replaces each `(cnt)` line with a nested list of the headings that come
 * after it, across all `texts` (which an export joins in order). With
 * `links`, entries link to anchors named by `headingSlugs`, for HTML.
 */
export function expandContents(texts: string[], links: boolean): string[] {
  if (!texts.some(hasContentsMarker)) return texts
  const headings = allHeadings(texts)
  let base = 0
  return texts.map((text) => {
    const offsets = findMarkers(text)
    const start = base
    base += text.length + 2
    if (offsets.length === 0) return text
    let out = text
    for (const at of [...offsets].reverse()) {
      const after = headings.filter((h) => h.heading.offset > start + at)
      const top = Math.min(...after.map((h) => h.heading.level))
      const lines = after.map(({ heading, slug }) => {
        const indent = '  '.repeat(Math.min(heading.level - top, 5))
        const label = heading.text.replace(/([\[\]\\])/g, '\\$1')
        return `${indent}- ${links ? `[${label}](#${slug})` : heading.text}`
      })
      const end = text.indexOf('\n', at)
      const lineEnd = end === -1 ? text.length : end
      out = out.slice(0, at) + lines.join('\n') + out.slice(lineEnd)
    }
    return out
  })
}

/** Gives the headings of rendered HTML the anchors `expandContents` links to. Headings the outline does not know (setext ones) get none. */
export function addHeadingIds(html: string, texts: string[]): string {
  const list = allHeadings(texts)
  let j = 0
  const norm = (t: string): string =>
    t
      .replace(/<[^>]*>/g, '')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/[*_`~]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  return html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (m, level: string, inner: string) => {
    const next = list[j]
    if (!next || norm(inner) !== norm(next.heading.text)) return m
    j++
    return `<h${level} id="${next.slug}">${inner}</h${level}>`
  })
}
