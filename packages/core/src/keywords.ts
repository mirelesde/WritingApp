import type { GroupNode, SheetNode } from './library'

/** The longest keyword kept, in characters. */
export const MAX_KEYWORD_LENGTH = 40

/**
 * A keyword as it is stored: spaces collapsed and trimmed, no commas or
 * leading `#`, cut to MAX_KEYWORD_LENGTH. Empty if nothing is left.
 */
export function normalizeKeyword(raw: string): string {
  return raw
    .replace(/[,\0\r\n\t]+/g, ' ')
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_KEYWORD_LENGTH)
    .trim()
}

/** Keywords normalised and de-duplicated ignoring case (the first spelling wins), in sorted order. */
export function cleanKeywords(raw: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const item of raw) {
    const keyword = normalizeKeyword(item)
    const key = keyword.toLowerCase()
    if (keyword === '' || seen.has(key)) continue
    seen.add(key)
    result.push(keyword)
  }
  return result.sort(compareKeywords)
}

export function compareKeywords(a: string, b: string): number {
  return a.localeCompare(b, 'en', { sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0)
}

/** Whether a sheet's keywords include `keyword`, ignoring case. */
export function hasKeyword(keywords: readonly string[], keyword: string): boolean {
  const key = keyword.toLowerCase()
  return keywords.some((k) => k.toLowerCase() === key)
}

/** Every keyword in the library with the number of sheets using it, sorted by name. */
export function libraryKeywords(root: GroupNode): { keyword: string; count: number }[] {
  const counts = new Map<string, { keyword: string; count: number }>()
  const visit = (group: GroupNode): void => {
    for (const child of group.children) {
      if (child.kind === 'group') visit(child)
      else {
        for (const keyword of child.keywords) {
          const entry = counts.get(keyword.toLowerCase())
          if (entry) entry.count++
          else counts.set(keyword.toLowerCase(), { keyword, count: 1 })
        }
      }
    }
  }
  visit(root)
  return [...counts.values()].sort((a, b) => compareKeywords(a.keyword, b.keyword))
}

/** Every sheet in the library, in library order. */
export function allSheets(root: GroupNode): SheetNode[] {
  const sheets: SheetNode[] = []
  const visit = (group: GroupNode): void => {
    for (const child of group.children) {
      if (child.kind === 'group') visit(child)
      else sheets.push(child)
    }
  }
  visit(root)
  return sheets
}

/** Splits a filter box into the keywords it names (`#plot`; `#two_words` for a space) and the remaining text. */
export function parseFilter(input: string): { keywords: string[]; text: string } {
  const keywords: string[] = []
  const words: string[] = []
  for (const word of input.trim().split(/\s+/)) {
    if (word === '') continue
    if (word.startsWith('#') && word.length > 1) keywords.push(word.slice(1).replace(/_/g, ' '))
    else words.push(word)
  }
  return { keywords, text: words.join(' ') }
}

/** How a keyword is written in a filter box: `#two_words`. */
export function filterToken(keyword: string): string {
  return '#' + keyword.replace(/\s+/g, '_')
}
