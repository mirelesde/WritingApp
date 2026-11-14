const KEY = 'writingapp.folds'
const LIMIT = 300

function load(): Record<string, string[]> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

/** The headings folded the last time this sheet was open. */
export function recallFolds(path: string): string[] {
  const list = load()[path]
  return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []
}

/** Remembers which headings are folded in a sheet; an empty list forgets it. */
export function rememberFolds(path: string, headings: string[]): void {
  try {
    const all = load()
    delete all[path]
    if (headings.length) all[path] = headings
    // Oldest entries go first once the list is long.
    const keys = Object.keys(all)
    for (const k of keys.slice(0, Math.max(0, keys.length - LIMIT))) delete all[k]
    localStorage.setItem(KEY, JSON.stringify(all))
  } catch {
    /* storage unavailable: folds just are not remembered */
  }
}
