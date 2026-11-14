/**
 * Comparing two versions of a sheet: a line diff that groups differences into
 * hunks (so a writer can pick a side per hunk), a word diff for highlighting
 * inside a changed paragraph, and recognition of the "conflicted copy" files
 * that sync services leave behind.
 */

export interface DiffRun<T> {
  kind: 'same' | 'del' | 'add'
  items: T[]
}

/** Above this many table cells the middle of a diff is not worked out (it is one change). */
const MAX_CELLS = 4_000_000

/** A minimal edit script between two sequences. */
export function diffSequences<T>(x: T[], y: T[]): DiffRun<T>[] {
  let start = 0
  while (start < x.length && start < y.length && x[start] === y[start]) start++
  let endX = x.length
  let endY = y.length
  while (endX > start && endY > start && x[endX - 1] === y[endY - 1]) {
    endX--
    endY--
  }
  const out: DiffRun<T>[] = []
  const push = (kind: DiffRun<T>['kind'], items: T[]): void => {
    if (items.length === 0) return
    const last = out[out.length - 1]
    if (last && last.kind === kind) last.items.push(...items)
    else out.push({ kind, items: [...items] })
  }
  push('same', x.slice(0, start))

  const a = x.slice(start, endX)
  const b = y.slice(start, endY)
  if (a.length === 0 || b.length === 0 || (a.length + 1) * (b.length + 1) > MAX_CELLS) {
    push('del', a)
    push('add', b)
  } else {
    const w = b.length + 1
    // table[i * w + j] = length of the longest common run of a[i..] and b[j..]
    const table = new Uint32Array((a.length + 1) * w)
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        table[i * w + j] =
          a[i] === b[j] ? table[(i + 1) * w + j + 1] + 1 : Math.max(table[(i + 1) * w + j], table[i * w + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) {
        push('same', [a[i]])
        i++
        j++
      } else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) {
        push('del', [a[i++]])
      } else {
        push('add', [b[j++]])
      }
    }
    push('del', a.slice(i))
    push('add', b.slice(j))
  }
  push('same', x.slice(endX))
  return out
}

export type Hunk =
  | { kind: 'same'; lines: string[] }
  | { kind: 'change'; a: string[]; b: string[] }

/** The line differences between `a` and `b`, with unchanged stretches between them. */
export function diffHunks(a: string, b: string): Hunk[] {
  const runs = diffSequences(a.split('\n'), b.split('\n'))
  const hunks: Hunk[] = []
  let pending: { a: string[]; b: string[] } | null = null
  const flush = (): void => {
    if (pending) hunks.push({ kind: 'change', ...pending })
    pending = null
  }
  for (const run of runs) {
    if (run.kind === 'same') {
      flush()
      hunks.push({ kind: 'same', lines: run.items })
    } else {
      pending ??= { a: [], b: [] }
      ;(run.kind === 'del' ? pending.a : pending.b).push(...run.items)
    }
  }
  flush()
  return hunks
}

/** How many separate differences there are. */
export function changeCount(hunks: Hunk[]): number {
  return hunks.filter((h) => h.kind === 'change').length
}

/** The text with each difference resolved to one side: `picks[n]` is for the nth change. */
export function mergeHunks(hunks: Hunk[], picks: ('a' | 'b')[]): string {
  let n = 0
  const lines: string[] = []
  for (const hunk of hunks) {
    if (hunk.kind === 'same') lines.push(...hunk.lines)
    else lines.push(...(picks[n++] === 'b' ? hunk.b : hunk.a))
  }
  return lines.join('\n')
}

export interface WordSegment {
  text: string
  changed: boolean
}

/** Word-level differences between two passages, for highlighting each side. */
export function diffWords(a: string, b: string): { a: WordSegment[]; b: WordSegment[] } {
  const tokens = (s: string): string[] => s.match(/\s+|[^\s]+/g) ?? []
  const left: WordSegment[] = []
  const right: WordSegment[] = []
  const add = (list: WordSegment[], text: string, changed: boolean): void => {
    const last = list[list.length - 1]
    if (last && last.changed === changed) last.text += text
    else list.push({ text, changed })
  }
  for (const run of diffSequences(tokens(a), tokens(b))) {
    const text = run.items.join('')
    if (run.kind === 'same') {
      add(left, text, false)
      add(right, text, false)
    } else add(run.kind === 'del' ? left : right, text, true)
  }
  return { a: left, b: right }
}

/**
 * The name of the sheet a sync service made this file a conflicted copy of,
 * or null if it does not look like one. Recognises Dropbox ("note (conflicted
 * copy).md", "note (Ann's conflicted copy 2026-01-02).md"), Syncthing
 * ("note.sync-conflict-20260102-101500-ABCDEFG.md") and Nextcloud
 * ("note (conflicted copy 2026-01-02 101500).md").
 */
export function conflictCopyOf(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.')
  const stem = dot > 0 ? fileName.slice(0, dot) : fileName
  const ext = dot > 0 ? fileName.slice(dot) : ''
  const patterns = [/ \([^()]*conflicted copy[^()]*\)$/i, /\.sync-conflict-\d{8}-\d{6}(-[A-Z0-9]+)?$/i]
  for (const pattern of patterns) {
    if (pattern.test(stem)) {
      const original = stem.replace(pattern, '')
      return original ? original + ext : null
    }
  }
  return null
}

export interface ConflictPair {
  /** The conflicted copy. */
  copy: { name: string; path: string }
  /** The sheet it was made from, which is still in the same folder. */
  original: { name: string; path: string }
}

/** Conflicted copies among `sheets` whose original is among them too. */
export function findConflictCopies<S extends { name: string; path: string }>(sheets: S[]): ConflictPair[] {
  const byPath = new Map(sheets.map((s) => [s.path, s]))
  const pairs: ConflictPair[] = []
  for (const sheet of sheets) {
    const originalName = conflictCopyOf(sheet.name)
    if (!originalName) continue
    const folder = sheet.path.slice(0, sheet.path.length - sheet.name.length)
    const original = byPath.get(folder + originalName)
    if (original) pairs.push({ copy: sheet, original })
  }
  return pairs
}
