import type { DirEntry } from './filesystem'

/** Name of the per-folder file holding order and glue flags. */
export const SIDECAR_NAME = '.writingapp.json'

/** The sidecar's contents as stored on disk. */
export interface Sidecar {
  version: 1
  /** Child names in display order, sheets and groups mixed. */
  order: string[]
  /** Sheets glued to the sheet that follows them. */
  glued: string[]
}

export interface ReconciledFolder {
  /** Visible children in display order. */
  children: DirEntry[]
  /** Names of sheets glued to the next child, which is always a sheet. */
  glued: string[]
}

/** A child is visible if it is a folder or a .md file, and not a dotfile. */
export function isVisibleEntry(entry: DirEntry): boolean {
  if (entry.name.startsWith('.')) return false
  return entry.kind === 'directory' || entry.name.endsWith('.md')
}

/**
 * Reads sidecar text leniently. Missing, malformed or wrongly shaped
 * input yields an empty sidecar rather than an error: the sidecar is
 * advisory and must never stop a library from opening.
 */
export function parseSidecar(text: string | undefined): Sidecar {
  const empty: Sidecar = { version: 1, order: [], glued: [] }
  if (text === undefined) return empty
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return empty
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return empty
  const { order, glued } = data as Record<string, unknown>
  return { version: 1, order: strings(order), glued: strings(glued) }
}

/**
 * Merges the sidecar with what is really in the folder:
 * - hidden entries (dotfiles, non-.md files) are ignored;
 * - listed entries that still exist come first, in sidecar order;
 * - entries the sidecar does not list follow, in name order;
 * - listed entries that no longer exist are dropped;
 * - a glue flag survives only if its sheet exists and the next child is
 *   also a sheet.
 */
export function reconcileFolder(sidecar: Sidecar, entries: DirEntry[]): ReconciledFolder {
  const byName = new Map<string, DirEntry>()
  for (const entry of entries) {
    if (isVisibleEntry(entry)) byName.set(entry.name, entry)
  }

  const children: DirEntry[] = []
  const placed = new Set<string>()
  for (const name of sidecar.order) {
    const entry = byName.get(name)
    if (entry && !placed.has(name)) {
      children.push(entry)
      placed.add(name)
    }
  }
  const unlisted = [...byName.values()]
    .filter((e) => !placed.has(e.name))
    .sort((a, b) => compareNames(a.name, b.name))
  children.push(...unlisted)

  const wanted = new Set(sidecar.glued)
  const glued: string[] = []
  children.forEach((child, i) => {
    const next = children[i + 1]
    if (wanted.has(child.name) && child.kind === 'file' && next?.kind === 'file') {
      glued.push(child.name)
    }
  })

  return { children, glued }
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0)
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}
