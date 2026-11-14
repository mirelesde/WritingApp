import type { FileSystem } from './filesystem'
import { MAX_READ_BYTES, type GroupNode, type SheetNode } from './library'

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

/** A sheet's text, or undefined if it cannot be read or is too big to be one (it is skipped, not fatal). */
async function readForSearch(fs: FileSystem, path: string): Promise<string | undefined> {
  try {
    const times = await fs.fileTimes?.(path)
    if (times?.size !== undefined && times.size > MAX_READ_BYTES) return undefined
    return await fs.readText(path)
  } catch {
    return undefined
  }
}

export interface SearchOptions {
  caseSensitive?: boolean
  /** Match only where the query is not part of a longer word. */
  wholeWord?: boolean
  /** Treat the query as a regular expression (`^` and `$` match at every line). */
  regex?: boolean
  /** Only look in this group or sheet (a path). */
  within?: string
}

const WORD = '[\\w\\u00C0-\\u024F\\u0370-\\u052F]'

/**
 * Whether a pattern repeats something that itself repeats without limit, like
 * `(a+)+` or `(\\w*\\s?)*`. Such a pattern can take longer than the age of the
 * universe on a short line that nearly matches, and the app cannot interrupt
 * a regular expression, so these are refused up front.
 */
export function hasNestedRepeat(source: string): boolean {
  // One flag per open group: does it contain an unbounded repeat?
  const open: boolean[] = []
  let inClass = false
  const unbounded = (at: number): boolean => {
    const c = source[at]
    if (c === '*' || c === '+') return true
    return c === '{' && /^\{\d+,\}/.test(source.slice(at))
  }
  for (let i = 0; i < source.length; i++) {
    const c = source[i]
    if (c === '\\') {
      i++
      if (!inClass && unbounded(i + 1)) mark(open)
    } else if (inClass) {
      if (c === ']') {
        inClass = false
        if (unbounded(i + 1)) mark(open)
      }
    } else if (c === '[') inClass = true
    else if (c === '(') open.push(false)
    else if (c === ')') {
      const had = open.pop() ?? false
      if (unbounded(i + 1)) {
        if (had) return true
        mark(open)
      } else if (had) mark(open)
    } else if (c !== '|' && c !== '^' && c !== '$' && unbounded(i + 1)) mark(open)
  }
  return false
}

function mark(open: boolean[]): void {
  if (open.length > 0) open[open.length - 1] = true
}

/** A global matcher for `query`, or undefined when there is nothing to look for. Throws on a bad pattern. */
export function buildMatcher(query: string, options: SearchOptions = {}): RegExp | undefined {
  const text = options.regex ? query : query.trim()
  if (text.trim() === '') return undefined
  let source = options.regex ? text : text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (options.wholeWord) source = `(?<!${WORD})(?:${source})(?!${WORD})`
  const flags = 'g' + (options.caseSensitive ? '' : 'i') + (options.regex ? 'm' : '')
  if (options.regex && hasNestedRepeat(source)) {
    throw new Error('That pattern repeats a repeat (like (a+)+), which can freeze the app. Simplify it.')
  }
  let matcher: RegExp
  try {
    matcher = new RegExp(source, flags)
  } catch {
    throw new Error('That is not a valid regular expression')
  }
  if (options.regex && new RegExp(source, flags).exec('')) {
    throw new Error('That pattern matches empty text')
  }
  return matcher
}

/** Whether `path` is the scope itself or inside it. */
function inScope(path: string, within?: string): boolean {
  return !within || path === within || path.startsWith(within + '/')
}

/** Every non-empty match of `matcher` in `text`. */
function allMatches(matcher: RegExp, text: string): RegExpExecArray[] {
  const found: RegExpExecArray[] = []
  matcher.lastIndex = 0
  for (let m = matcher.exec(text); m; m = matcher.exec(text)) {
    if (m[0] === '') matcher.lastIndex++
    else found.push(m)
  }
  return found
}

/** One occurrence of a query in a text. */
export interface TextMatch {
  from: number
  to: number
  /** What `replacement` stands for here (expanding $1, $& and the like in regular-expression mode). */
  insert(replacement: string): string
}

/** Every occurrence of `query` in `text`, in order. Throws on a bad pattern; a blank query finds nothing. */
export function findMatches(text: string, query: string, options: SearchOptions = {}): TextMatch[] {
  const matcher = buildMatcher(query, options)
  if (!matcher) return []
  return allMatches(matcher, text).map((m) => ({
    from: m.index,
    to: m.index + m[0].length,
    insert: (replacement: string) => (options.regex ? expand(replacement, m) : replacement),
  }))
}

/**
 * Finds sheets containing `query`, ignoring case unless asked, in library
 * order. Stops after `limit` sheets. A blank query finds nothing.
 */
export async function searchLibrary(
  fs: FileSystem,
  root: GroupNode,
  query: string,
  limit = 50,
  options: SearchOptions = {},
): Promise<SearchHit[]> {
  const matcher = buildMatcher(query, options)
  if (!matcher) return []
  const hits: SearchHit[] = []

  const visit = async (group: GroupNode, trail: string[]): Promise<void> => {
    for (const child of group.children) {
      if (hits.length >= limit) return
      if (child.kind === 'group') await visit(child, [...trail, child.name])
      else if (inScope(child.path, options.within)) {
        const hit = await searchSheet(fs, child, matcher, trail.join(' / '))
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
  matcher: RegExp,
  where: string,
): Promise<SearchHit | undefined> {
  const text = await readForSearch(fs, sheet.path)
  if (text === undefined) return undefined
  const matches = allMatches(matcher, text)
  const found = matches[0]
  if (!found) return undefined
  const first = found.index
  const length = found[0].length
  const flat = (s: string): string => s.replace(/\s+/g, ' ')
  const start = Math.max(0, first - CONTEXT)
  const end = Math.min(text.length, first + length + CONTEXT)
  return {
    path: sheet.path,
    title: sheet.title,
    where,
    before: (start > 0 ? '…' : '') + flat(text.slice(start, first)).trimStart(),
    match: flat(text.slice(first, first + length)),
    after: flat(text.slice(first + length, end)).trimEnd() + (end < text.length ? '…' : ''),
    count: matches.length,
  }
}

/** What `replacement` stands for in a regular-expression match: $1, $<name>, $&, $$. */
function expand(replacement: string, m: RegExpExecArray): string {
  return replacement.replace(/\$(\$|&|\d{1,2}|<[^>]*>)/g, (whole, key: string) => {
    if (key === '$') return '$'
    if (key === '&') return m[0]
    if (key.startsWith('<')) return m.groups?.[key.slice(1, -1)] ?? ''
    const n = Number(key)
    return n >= 1 && n < m.length ? (m[n] ?? '') : whole
  })
}

/**
 * `text` with every match of `query` replaced, and how many there were. In
 * regular-expression mode the replacement may use $1, $<name>, $& and $$.
 */
export function replaceAllIn(
  text: string,
  query: string,
  replacement: string,
  options: SearchOptions = {},
): { text: string; count: number } {
  const matcher = buildMatcher(query, options)
  if (!matcher) return { text, count: 0 }
  let out = ''
  let from = 0
  const matches = allMatches(matcher, text)
  for (const m of matches) {
    out += text.slice(from, m.index) + (options.regex ? expand(replacement, m) : replacement)
    from = m.index + m[0].length
  }
  return { text: out + text.slice(from), count: matches.length }
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
  options: SearchOptions = {},
): Promise<{ count: number; sheets: number; undo: { kind: 'write'; path: string; text: string }[] }> {
  const undo: { kind: 'write'; path: string; text: string }[] = []
  let count = 0
  if (!buildMatcher(query, options)) return { count, sheets: 0, undo }
  const chosen = only ? new Set(only) : undefined
  const visit = async (group: GroupNode): Promise<void> => {
    for (const child of group.children) {
      if (child.kind === 'group') await visit(child)
      else if ((!chosen || chosen.has(child.path)) && inScope(child.path, options.within)) {
        const text = await readForSearch(fs, child.path)
        if (text === undefined) continue
        const next = replaceAllIn(text, query, replacement, options)
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
