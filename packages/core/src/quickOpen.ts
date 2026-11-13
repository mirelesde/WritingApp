import type { GroupNode } from './library'

export interface QuickOpenItem {
  path: string
  title: string
  /** The groups above the sheet, e.g. "Novel / Part 2"; the library name for top-level sheets. */
  where: string
}

/** Every sheet in the library, in library order. */
export function listSheets(root: GroupNode): QuickOpenItem[] {
  const items: QuickOpenItem[] = []
  const walk = (group: GroupNode, trail: string[]): void => {
    for (const child of group.children) {
      if (child.kind === 'group') walk(child, [...trail, child.name])
      else items.push({ path: child.path, title: child.title, where: trail.join(' / ') || root.name })
    }
  }
  walk(root, [])
  return items
}

/**
 * How well `query` matches `text` as a subsequence, or null if it does not.
 * Higher is better: consecutive characters, word starts and an early first
 * match all score.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, '')
  const t = text.toLowerCase()
  if (q === '') return 0
  let score = 0
  let ti = 0
  let previous = -2
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found === -1) return null
    score += 1
    if (found === previous + 1) score += 3
    if (found === 0 || /[\s/\-_.]/.test(t[found - 1]!)) score += 4
    if (found === 0) score += 2
    ti = found + 1
    previous = found
  }
  // Shorter texts are tighter matches.
  return score - t.length * 0.01
}

/**
 * Sheets matching `query`, best first. Titles count double against the
 * group path; with an empty query, everything in library order.
 */
export function rankSheets(items: QuickOpenItem[], query: string, limit = 50): QuickOpenItem[] {
  if (query.trim() === '') return items.slice(0, limit)
  const scored: { item: QuickOpenItem; score: number; order: number }[] = []
  items.forEach((item, order) => {
    const inTitle = fuzzyScore(query, item.title)
    const inPath = fuzzyScore(query, `${item.where} / ${item.title}`)
    if (inTitle === null && inPath === null) return
    scored.push({ item, score: Math.max((inTitle ?? -Infinity) * 2, inPath ?? -Infinity), order })
  })
  scored.sort((a, b) => b.score - a.score || a.order - b.order)
  return scored.slice(0, limit).map((s) => s.item)
}
