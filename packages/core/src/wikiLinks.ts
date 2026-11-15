import type { GroupNode } from './library'
import { listSheets } from './quickOpen'

/** A `[[Title]]` or `[[Title|shown text]]` link in a sheet. */
export interface WikiLink {
  from: number
  to: number
  /** The sheet title it points at. */
  target: string
  /** The text to show instead of the title, if given. */
  label?: string
}

const FENCE = /^\s{0,3}(```|~~~)/
const LINK = /\[\[([^\[\]\n|]+?)(?:\|([^\[\]\n]*?))?\]\]/g

/** Every wiki link in the text, apart from those in code fences and inline code. */
export function findWikiLinks(text: string): WikiLink[] {
  const links: WikiLink[] = []
  let offset = 0
  let fence = false
  for (const line of text.split('\n')) {
    if (FENCE.test(line)) fence = !fence
    else if (!fence && line.includes('[[')) {
      // Blank out inline code, keeping offsets, so links inside it are skipped.
      const plain = line.replace(/`[^`]*`/g, (code) => ' '.repeat(code.length))
      for (const m of plain.matchAll(LINK)) {
        const target = m[1]!.trim()
        if (target === '') continue
        const label = m[2]?.trim()
        links.push({
          from: offset + m.index!,
          to: offset + m.index! + m[0].length,
          target,
          ...(label ? { label } : {})
        })
      }
    }
    offset += line.length + 1
  }
  return links
}

/** The text with each `[[Title]]` or `[[Title|shown]]` link replaced by what a reader would see. */
export function withoutWikiLinks(text: string): string {
  let out = text
  for (const link of [...findWikiLinks(text)].reverse()) {
    out = out.slice(0, link.from) + (link.label ?? link.target) + out.slice(link.to)
  }
  return out
}

/** The distinct sheet titles a text links to, as written. */
export function linkTargets(text: string): string[] {
  return [...new Set(findWikiLinks(text).map((l) => l.target))]
}

/** How titles are compared: ignoring case and surrounding or repeated spaces. */
export function titleKey(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** The path of the sheet a link points at (the first, in library order, if titles repeat). */
export function resolveWikiLink(root: GroupNode, target: string): string | null {
  const key = titleKey(target)
  return listSheets(root).find((s) => titleKey(s.title) === key)?.path ?? null
}

/** A sheet that links to another. */
export interface Backlink {
  path: string
  title: string
  where: string
}

/** The sheets that link to the sheet at `path`, in library order. A sheet's own links do not count. */
export function backlinksTo(root: GroupNode, path: string): Backlink[] {
  const sheets = listSheets(root)
  const me = sheets.find((s) => s.path === path)
  if (!me) return []
  const mine = titleKey(me.title)
  // A title shared with an earlier sheet belongs to that sheet, the one links resolve to.
  if (sheets.find((s) => titleKey(s.title) === mine)?.path !== path) return []
  const linking = new Set<string>()
  const walk = (group: GroupNode): void => {
    for (const child of group.children) {
      if (child.kind === 'group') walk(child)
      else if (child.path !== path && child.links.some((t) => titleKey(t) === mine)) linking.add(child.path)
    }
  }
  walk(root)
  return sheets.filter((s) => linking.has(s.path))
}

/** Titles that start with `query`, then those that contain it, for completing a link. */
export function completeTitles(root: GroupNode, query: string, limit = 8): string[] {
  const q = titleKey(query)
  const seen = new Set<string>()
  const starts: string[] = []
  const contains: string[] = []
  for (const { title } of listSheets(root)) {
    const key = titleKey(title)
    if (seen.has(key)) continue
    seen.add(key)
    if (key.startsWith(q)) starts.push(title)
    else if (key.includes(q)) contains.push(title)
  }
  return [...starts, ...contains].slice(0, limit)
}
