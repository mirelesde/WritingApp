import type { DirEntry } from './filesystem'
import { cleanKeywords } from './keywords'

/** Name of the per-folder file holding order and glue flags. */
export const SIDECAR_NAME = '.writingapp.json'

/** The sidecar's contents as stored on disk. */
export interface Sidecar {
  version: 1
  /** Child names in display order, sheets and groups mixed. */
  order: string[]
  /** Sheets glued to the sheet that follows them. */
  glued: string[]
  /** Optional colour name (a key of GROUP_COLORS) shown on this folder's icon. */
  color?: string
  /** What this folder (a group) is called on screen, when its folder name had to drop characters such as : or ?. */
  title?: string
  /** The folder name `title` was written for; if the folder is renamed elsewhere, the title no longer applies. */
  titleFor?: string
  /** Keywords by sheet file name; sheets without any are left out. */
  keywords?: Record<string, string[]>
}

/** The colours a project or group can take, by the name stored in its sidecar. */
export const GROUP_COLORS: Record<string, string> = {
  red: '#e5604d',
  orange: '#e8944a',
  yellow: '#d9b83e',
  green: '#5fa86a',
  blue: '#4f8fd6',
  purple: '#9a73c9',
  pink: '#d9729e'
}

export interface ReconciledFolder {
  /** Visible children in display order. */
  children: DirEntry[]
  /** Names of sheets glued to the next child, which is always a sheet. */
  glued: string[]
  /** Keywords of the visible sheets that have any. */
  keywords: Record<string, string[]>
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
  const { order, glued, color, keywords, title, titleFor } = data as Record<string, unknown>
  const result: Sidecar = { version: 1, order: strings(order), glued: strings(glued) }
  if (typeof color === 'string' && Object.hasOwn(GROUP_COLORS, color)) result.color = color
  if (typeof title === 'string' && typeof titleFor === 'string' && titleFor !== '') {
    const clean = title.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200)
    if (clean !== '') Object.assign(result, { title: clean, titleFor })
  }
  if (typeof keywords === 'object' && keywords !== null && !Array.isArray(keywords)) {
    const kept: Record<string, string[]> = {}
    for (const [name, list] of Object.entries(keywords)) {
      const clean = cleanKeywords(strings(list))
      if (clean.length > 0) kept[name] = clean
    }
    if (Object.keys(kept).length > 0) result.keywords = kept
  }
  return result
}

/**
 * Merges the sidecar with what is really in the folder:
 * - hidden entries (dotfiles, non-.md files) are ignored;
 * - listed entries that still exist come first, in sidecar order;
 * - entries the sidecar does not list follow, in name order;
 * - listed entries that no longer exist are dropped;
 * - keywords survive only for sheets that exist;
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

  const keywords: Record<string, string[]> = {}
  for (const child of children) {
    const own = child.kind === 'file' ? sidecar.keywords?.[child.name] : undefined
    if (own && own.length > 0) keywords[child.name] = own
  }

  return { children, glued, keywords }
}

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' }) || (a < b ? -1 : a > b ? 1 : 0)
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}
