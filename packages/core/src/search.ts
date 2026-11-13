import type { FileSystem } from './filesystem'
import type { GroupNode, SheetNode } from './library'

export interface SearchHit {
  path: string
  title: string
  /** The groups the sheet is in, below the library root: "Novel / Part 1". */
  where: string
  /** A line of context around the first match, split so the match can be marked. */
  before: string
  match: string
  after: string
  /** How many times the query occurs in the sheet. */
  count: number
}

const CONTEXT = 40

/**
 * Finds sheets containing `query`, ignoring case, in library order. Stops
 * after `limit` sheets. A blank query finds nothing.
 */
export async function searchLibrary(
  fs: FileSystem,
  root: GroupNode,
  query: string,
  limit = 50,
): Promise<SearchHit[]> {
  const needle = query.trim().toLowerCase()
  if (needle === '') return []
  const hits: SearchHit[] = []

  const visit = async (group: GroupNode, trail: string[]): Promise<void> => {
    for (const child of group.children) {
      if (hits.length >= limit) return
      if (child.kind === 'group') await visit(child, [...trail, child.name])
      else {
        const hit = await searchSheet(fs, child, needle, trail.join(' / '))
        if (hit) hits.push(hit)
      }
    }
  }
  await visit(root, [])
  return hits
}

async function searchSheet(
  fs: FileSystem,
  sheet: SheetNode,
  needle: string,
  where: string,
): Promise<SearchHit | undefined> {
  const text = await fs.readText(sheet.path)
  const lower = text.toLowerCase()
  let at = lower.indexOf(needle)
  if (at < 0) return undefined
  const first = at
  let count = 0
  while (at >= 0) {
    count++
    at = lower.indexOf(needle, at + needle.length)
  }
  const flat = (s: string): string => s.replace(/\s+/g, ' ')
  const start = Math.max(0, first - CONTEXT)
  const end = Math.min(text.length, first + needle.length + CONTEXT)
  return {
    path: sheet.path,
    title: sheet.title,
    where,
    before: (start > 0 ? '…' : '') + flat(text.slice(start, first)).trimStart(),
    match: flat(text.slice(first, first + needle.length)),
    after: flat(text.slice(first + needle.length, end)).trimEnd() + (end < text.length ? '…' : ''),
    count,
  }
}
