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

/**
 * Anchor names for headings, unique within one document. Our own style (used in
 * HTML we write) is "intro", "intro-2". GitHub's, which most Markdown viewers
 * follow, keeps accents and counts duplicates "intro", "intro-1".
 */
export function headingSlugs(headings: Heading[], style: 'own' | 'github' = 'own'): string[] {
  const seen = new Map<string, number>()
  return headings.map((h) => {
    const base =
      style === 'github'
        ? h.text
            .toLowerCase()
            .replace(/[^\p{L}\p{N}\p{M}_ -]/gu, '')
            .replace(/ /g, '-')
        : h.text
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\p{L}\p{N}]+/gu, '-')
            .replace(/^-+|-+$/g, '') || 'section'
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n === 0 ? base : style === 'github' ? `${base}-${n}` : `${base}-${n + 1}`
  })
}

/** The headings of several texts read in order, with offsets into their join. */
function allHeadings(texts: string[], style: 'own' | 'github' = 'own'): { heading: Heading; slug: string }[] {
  const list: Heading[] = []
  let base = 0
  for (const text of texts) {
    for (const h of extractHeadings(text)) list.push({ ...h, offset: h.offset + base })
    base += text.length + 2
  }
  const slugs = headingSlugs(list, style)
  return list.map((heading, i) => ({ heading, slug: slugs[i]! }))
}

/**
 * Replaces each `(cnt)` line with a nested list of the headings that come
 * after it, across all `texts` (which an export joins in order). `links`:
 * 'html' links entries to anchors we write on the headings; 'github' to the
 * anchors Markdown viewers make; 'none' lists plain text.
 */
export function expandContents(texts: string[], links: 'none' | 'html' | 'github'): string[] {
  if (!texts.some(hasContentsMarker)) return texts
  const headings = allHeadings(texts, links === 'github' ? 'github' : 'own')
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
        const link = links === 'html' ? `[${label}](#${slug} "toc")` : links === 'github' ? `[${label}](#${slug})` : heading.text
        return `${indent}- ${link}`
      })
      const end = text.indexOf('\n', at)
      const lineEnd = end === -1 ? text.length : end
      out = out.slice(0, at) + lines.join('\n') + out.slice(lineEnd)
    }
    return out
  })
}

/** What the HTML of a table of contents entry looks like once rendered, with its marker title swapped for a class. */
export function markContentsLinks(html: string): string {
  return html.replace(/<a href="#([^"]+)" title="toc">/g, '<a class="toc-link" href="#$1">')
}

const normText = (t: string): string =>
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

/** Whether the page has table of contents entries to put page numbers on. */
export function hasContentsLinks(html: string): boolean {
  return html.includes('class="toc-link"')
}

/**
 * Which page each anchored heading landed on. `outline` is the PDF's own list of
 * headings in reading order, each with its page; they are paired with the
 * headings of the HTML by title, in order, so a heading one side lacks is skipped.
 */
export function pagesBySlug(html: string, outline: { title: string; page: number }[]): Record<string, number> {
  const found: { text: string; slug: string | null }[] = []
  for (const m of html.matchAll(/<h([1-6])(?: id="([^"]*)")?>([\s\S]*?)<\/h\1>/g)) found.push({ text: normText(m[3]!), slug: m[2] ?? null })
  const pages: Record<string, number> = {}
  let at = 0
  for (const entry of outline) {
    const title = normText(entry.title)
    for (let i = at; i < found.length; i++) {
      if (found[i]!.text !== title) continue
      const slug = found[i]!.slug
      if (slug !== null) pages[slug] = entry.page
      at = i + 1
      break
    }
  }
  return pages
}

const PAGE_CSS = `<style>
.toc-link { display: flex; gap: .4em; align-items: baseline; color: inherit; text-decoration: none; }
.toc-dots { flex: 1; border-bottom: 1px dotted currentColor; opacity: .5; transform: translateY(-.25em); }
.toc-page { font-variant-numeric: tabular-nums; }
</style>`

/**
 * Lays the table of contents entries out with a dotted leader and a page number.
 * Without `pages` every number is a placeholder, so a first print takes the room
 * the real one will.
 */
export function withPageNumbers(html: string, pages: Record<string, number> | null): string {
  const laid = html.replace(
    /<a class="toc-link" href="#([^"]+)">([\s\S]*?)<\/a>/g,
    (_m, slug: string, inner: string) =>
      `<a class="toc-link" href="#${slug}"><span class="toc-text">${inner}</span><span class="toc-dots"></span><span class="toc-page">${pages?.[slug] ?? '00'}</span></a>`,
  )
  return laid.includes('</head>') ? laid.replace('</head>', `${PAGE_CSS}\n</head>`) : PAGE_CSS + laid
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
