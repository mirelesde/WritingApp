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

/** `text` with every occurrence of `query` (ignoring case) replaced, and how many there were. */
export function replaceAllIn(text: string, query: string, replacement: string): { text: string; count: number } {
  const needle = query.toLowerCase()
  if (needle === '') return { text, count: 0 }
  const lower = text.toLowerCase()
  let out = ''
  let from = 0
  let count = 0
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, from)) {
    out += text.slice(from, at) + replacement
    from = at + needle.length
    count++
  }
  return { text: out + text.slice(from), count }
}

/**
 * Replaces `query` with `replacement` in every sheet that has it (or only in
 * the sheets listed in `only`). Returns the steps that put the old text back.
 */
export async function replaceInLibrary(
  fs: FileSystem,
  root: GroupNode,
  query: string,
  replacement: string,
  only?: string[],
): Promise<{ count: number; sheets: number; undo: { kind: 'write'; path: string; text: string }[] }> {
  const undo: { kind: 'write'; path: string; text: string }[] = []
  let count = 0
  if (query.trim() === '') return { count, sheets: 0, undo }
  const chosen = only ? new Set(only) : undefined
  const visit = async (group: GroupNode): Promise<void> => {
    for (const child of group.children) {
      if (child.kind === 'group') await visit(child)
      else if (!chosen || chosen.has(child.path)) {
        const text = await fs.readText(child.path)
        const next = replaceAllIn(text, query.trim(), replacement)
        if (next.count === 0) continue
        await fs.writeText(child.path, next.text)
        undo.push({ kind: 'write', path: child.path, text })
        count += next.count
      }
    }
  }
  await visit(root)
  return { count, sheets: undo.length, undo }
}
