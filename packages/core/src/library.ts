import type { FileSystem } from './filesystem'
import { parseSidecar, reconcileFolder, SIDECAR_NAME } from './sidecar'
import { baseName, joinPath, trimSlashes } from './path'
import { sheetPreview, sheetTitle } from './sheet'
import { textStats } from './stats'
import { assetsMentioned } from './images'
import { linkTargets } from './wikiLinks'

async function times(
  fs: FileSystem,
  path: string,
): Promise<{ modified?: number; created?: number; size?: number }> {
  try {
    return (await fs.fileTimes?.(path)) ?? {}
  } catch {
    return {}
  }
}

/** What loading a sheet works out from its text. */
export interface SheetInfo {
  title: string
  preview: string
  words: number
  /** The library pictures the sheet mentions, by file name. */
  images: string[]
  /** The sheet titles it links to with [[wiki links]]. */
  links: string[]
}

/** A sheet's info and the file's state when it was read, so a later load can skip an unchanged file. */
export interface SheetCacheEntry extends SheetInfo {
  modified: number
  size: number
}

/** Remembers sheet info by path between loads. Entries for files that are gone are dropped on each load. */
export type SheetCache = Map<string, SheetCacheEntry>

export interface LoadOptions {
  /** Skips reading a sheet whose modified time and size are as cached; updated by the load. */
  cache?: SheetCache
  /** Filled with how many sheets were read and how many came from the cache. */
  stats?: { read: number; cached: number }
}

/** Sheets bigger than this (bytes) are listed without being read: no manuscript is this large, so it is not one. */
export const MAX_READ_BYTES = 50 * 1024 * 1024

/** How many sheets are read at once; enough to keep a disk busy without running out of file handles. */
const READ_CONCURRENCY = 32

function createPool(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  let active = 0
  const waiting: (() => void)[] = []
  return async (task) => {
    // A finished task hands its slot straight to the next waiting one.
    if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve))
    else active++
    try {
      return await task()
    } finally {
      const next = waiting.shift()
      if (next) next()
      else active--
    }
  }
}

interface LoadContext {
  fs: FileSystem
  run: <T>(task: () => Promise<T>) => Promise<T>
  cache?: SheetCache
  seen: SheetCache
  stats: { read: number; cached: number }
}

export interface SheetNode {
  kind: 'sheet'
  /** File name, e.g. "opening.md". */
  name: string
  path: string
  title: string
  preview: string
  /** True if this sheet is glued to the next sibling. */
  glued: boolean
  /** The sheet's keywords, sorted. */
  keywords: string[]
  /** Words in the sheet. */
  words: number
  /** The library pictures the sheet mentions, by file name. */
  images: string[]
  /** The sheet titles it links to with [[wiki links]]. */
  links: string[]
  /** Last change and creation, in ms since 1970, when the file system can say. */
  modified?: number
  created?: number
}

export interface GroupNode {
  kind: 'group'
  /** Folder name. */
  name: string
  path: string
  /** Colour name from GROUP_COLORS, if one was chosen. */
  color?: string
  children: LibraryNode[]
}

export type LibraryNode = SheetNode | GroupNode

/**
 * Reads a library folder into a tree. The returned group is the library
 * root; its group children are the projects. Order and glue come from each
 * folder's sidecar, reconciled with what is really on disk.
 */
export async function loadLibrary(
  fs: FileSystem,
  root: string,
  options: LoadOptions = {},
): Promise<GroupNode> {
  const path = trimSlashes(root)
  const stats = options.stats ?? { read: 0, cached: 0 }
  stats.read = stats.cached = 0
  const ctx: LoadContext = { fs, run: createPool(READ_CONCURRENCY), cache: options.cache, seen: new Map(), stats }
  const tree = await loadGroup(ctx, path, baseName(path))
  if (options.cache) {
    options.cache.clear()
    for (const [key, entry] of ctx.seen) options.cache.set(key, entry)
  }
  return tree
}

async function loadSheet(ctx: LoadContext, path: string): Promise<SheetInfo & { modified?: number; created?: number }> {
  const { fs, cache } = ctx
  const { modified, created, size } = await times(fs, path)
  const known = modified !== undefined && size !== undefined
  const hit = known ? cache?.get(path) : undefined
  if (hit && hit.modified === modified && hit.size === size) {
    ctx.stats.cached++
    ctx.seen.set(path, hit)
    return { title: hit.title, preview: hit.preview, words: hit.words, images: hit.images, links: hit.links, modified, created }
  }
  // A sheet that cannot be read (permissions, deleted mid-load) or is far too big to be
  // prose must not stop the library loading: it appears under its file name, unread.
  const fallback: SheetInfo = {
    title: baseName(path).replace(/\.md$/i, ''),
    preview: '',
    words: 0,
    images: [],
    links: [],
  }
  if (size !== undefined && size > MAX_READ_BYTES) {
    return { ...fallback, preview: 'Too large to preview', ...(modified !== undefined ? { modified } : {}), ...(created !== undefined ? { created } : {}) }
  }
  let content: string
  try {
    content = await fs.readText(path)
  } catch {
    return { ...fallback, ...(modified !== undefined ? { modified } : {}), ...(created !== undefined ? { created } : {}) }
  }
  ctx.stats.read++
  const info: SheetInfo = {
    title: sheetTitle(content),
    preview: sheetPreview(content),
    words: textStats(content).words,
    images: assetsMentioned(content),
    links: linkTargets(content),
  }
  if (known) ctx.seen.set(path, { ...info, modified, size })
  return { ...info, ...(modified !== undefined ? { modified } : {}), ...(created !== undefined ? { created } : {}) }
}

async function loadGroup(ctx: LoadContext, path: string, name: string): Promise<GroupNode> {
  const { fs } = ctx
  const entries = await fs.list(path)
  const sidecarPath = joinPath(path, SIDECAR_NAME)
  const sidecarText = (await fs.exists(sidecarPath)) ? await fs.readText(sidecarPath) : undefined
  const sidecar = parseSidecar(sidecarText)
  const { children, glued, keywords } = reconcileFolder(sidecar, entries)
  const gluedNames = new Set(glued)

  const nodes = await Promise.all(
    children.map(async (child): Promise<LibraryNode> => {
      const childPath = joinPath(path, child.name)
      if (child.kind === 'directory') return loadGroup(ctx, childPath, child.name)
      const info = await ctx.run(() => loadSheet(ctx, childPath))
      return {
        kind: 'sheet',
        name: child.name,
        path: childPath,
        glued: gluedNames.has(child.name),
        keywords: keywords[child.name] ?? [],
        ...info,
      }
    }),
  )
  return { kind: 'group', name, path, ...(sidecar.color ? { color: sidecar.color } : {}), children: nodes }
}
