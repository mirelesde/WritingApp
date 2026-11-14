import type { SheetCache, SheetCacheEntry } from '@writingapp/core'

const VERSION = 2

/** The cache as JSON, for the file that lets the next launch skip reading unchanged sheets. */
export function serializeSheetCache(root: string, cache: SheetCache): string {
  return JSON.stringify({ version: VERSION, root, entries: [...cache] })
}

function isEntry(value: unknown): value is SheetCacheEntry {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  return (
    typeof e.title === 'string' &&
    typeof e.preview === 'string' &&
    typeof e.words === 'number' &&
    Array.isArray(e.images) &&
    e.images.every((n) => typeof n === 'string') &&
    typeof e.modified === 'number' &&
    typeof e.size === 'number'
  )
}

/** Reads a saved cache. Anything unexpected, or a cache for another library, gives an empty one. */
export function parseSheetCache(text: string, root: string): SheetCache {
  const cache: SheetCache = new Map()
  try {
    const data: unknown = JSON.parse(text)
    if (typeof data !== 'object' || data === null) return cache
    const { version, root: savedRoot, entries } = data as Record<string, unknown>
    if (version !== VERSION || savedRoot !== root || !Array.isArray(entries)) return cache
    for (const item of entries) {
      if (Array.isArray(item) && typeof item[0] === 'string' && isEntry(item[1])) cache.set(item[0], item[1])
    }
  } catch {
    // A damaged cache is just a cold start.
  }
  return cache
}
