import type { FileSystem } from './filesystem'
import type { GroupNode, LibraryNode } from './library'
import { joinPath } from './path'

/*
 * Images live in one hidden folder at the root of the library, `.assets/`,
 * under their own file names (a numeric suffix on a clash). A sheet links to
 * one as `![alt](.assets/name.png)`: the link is relative to the library, not
 * to the sheet, so moving a sheet to another group never breaks it.
 */

export const ASSETS_DIR = '.assets'

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  svg: 'image/svg+xml',
}

/** File extensions the app takes as images, without the dot. */
export const IMAGE_EXTENSIONS = Object.keys(MIME)

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

export function isImageName(name: string): boolean {
  return Object.hasOwn(MIME, extensionOf(name))
}

/** The media type for an image file name, or undefined if it is not an image. */
export function imageMime(name: string): string | undefined {
  return MIME[extensionOf(name)]
}

/** The last part of a path, whatever slashes it uses. */
function fileNameOf(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
}

/**
 * A name for an image in the assets folder: the original name, made safe
 * (no slashes, no leading dot), with `-2`, `-3`... added before the extension
 * if `taken` already has it. The extension is lower-cased.
 */
export function assetName(original: string, taken: ReadonlySet<string>): string {
  const clean = fileNameOf(original).replace(/[\0:*?"<>|]/g, '-').replace(/^\.+/, '').trim()
  const dot = clean.lastIndexOf('.')
  const stem = (dot > 0 ? clean.slice(0, dot) : clean) || 'image'
  const ext = dot > 0 ? clean.slice(dot).toLowerCase() : ''
  const lower = new Set([...taken].map((n) => n.toLowerCase()))
  let name = stem + ext
  for (let n = 2; lower.has(name.toLowerCase()); n++) name = `${stem}-${n}${ext}`
  return name
}

/** The Markdown for an image already in the assets folder. */
export function imageMarkdown(name: string, alt = ''): string {
  const text = alt.replace(/[[\]\n]/g, ' ').trim()
  return `![${text}](${ASSETS_DIR}/${encodeURIComponent(name)})`
}

/** The file name in the assets folder a link points at, or null for any other link. */
export function assetNameFromUrl(url: string): string | null {
  const prefix = `${ASSETS_DIR}/`
  if (!url.startsWith(prefix)) return null
  let name: string
  try {
    name = decodeURIComponent(url.slice(prefix.length))
  } catch {
    return null
  }
  return name === '' || name.includes('/') || name.includes('\\') || name.startsWith('.') ? null : name
}

export interface ImageRef {
  /** Start and end of the whole `![alt](url)`. */
  from: number
  to: number
  alt: string
  url: string
}

const IMAGE = /!\[([^\]\n]*)\]\(\s*([^)\s]+)(?:\s+"[^"\n]*")?\s*\)/g
const FENCE = /^ {0,3}(```|~~~)/

/** Every image in the text, apart from those in code fences. */
export function findImages(text: string): ImageRef[] {
  if (!text.includes('![')) return []
  const refs: ImageRef[] = []
  let fence = false
  let offset = 0
  for (const line of text.split('\n')) {
    if (FENCE.test(line)) fence = !fence
    else if (!fence) {
      for (const m of line.matchAll(IMAGE)) {
        const at = offset + (m.index ?? 0)
        refs.push({ from: at, to: at + m[0].length, alt: m[1]!, url: m[2]! })
      }
    }
    offset += line.length + 1
  }
  return refs
}

/** What importing a picture gave: the Markdown to put in a sheet, and the file's name in the library. */
export interface ImportedImage {
  name: string
  markdown: string
  /** An identical picture was already in the library, so nothing new was stored. */
  reused: boolean
}

async function takenNames(fs: FileSystem, root: string): Promise<Set<string>> {
  const dir = joinPath(root, ASSETS_DIR)
  if (!(await fs.exists(dir))) return new Set()
  return new Set((await fs.list(dir)).map((e) => e.name))
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
}

/** A content hash of some bytes, as text. The platform supplies it (the core has no crypto of its own). */
export type Hasher = (data: Uint8Array) => string | Promise<string>

/** What the index remembers about a picture file, and the file's state when it was hashed. */
export interface ImageIndexEntry {
  size: number
  modified: number
  hash: string
}

const INDEX_NAME = '.index.json'

async function readIndex(fs: FileSystem, dir: string): Promise<Record<string, ImageIndexEntry>> {
  try {
    const data: unknown = JSON.parse(await fs.readText(joinPath(dir, INDEX_NAME)))
    const entries = (data as { entries?: unknown }).entries
    if (typeof entries !== 'object' || entries === null) return {}
    const clean: Record<string, ImageIndexEntry> = {}
    for (const [name, e] of Object.entries(entries)) {
      const v = e as Partial<ImageIndexEntry>
      if (typeof v.size === 'number' && typeof v.modified === 'number' && typeof v.hash === 'string') {
        clean[name] = { size: v.size, modified: v.modified, hash: v.hash }
      }
    }
    return clean
  } catch {
    return {} // Missing or damaged: it is rebuilt.
  }
}

/**
 * The picture already in the assets folder that has exactly these bytes, if
 * there is one.
 *
 * Without a `hash`, same-size files are compared byte for byte. With one, the
 * hash of each picture is kept in `.assets/.index.json`, keyed by size and
 * modified time, so only new or changed files are read; the index is
 * rebuilt if it is missing or damaged.
 */
async function findIdentical(fs: FileSystem, root: string, data: Uint8Array, hash?: Hasher): Promise<string | null> {
  const dir = joinPath(root, ASSETS_DIR)
  if (!(await fs.exists(dir))) return null
  const entries = (await fs.list(dir)).filter((e) => e.kind === 'file' && isImageName(e.name))
  if (!hash) {
    for (const entry of entries) {
      const path = joinPath(dir, entry.name)
      const size = (await fs.fileTimes?.(path))?.size
      if (size !== undefined && size !== data.length) continue
      if (sameBytes(await fs.readBinary(path), data)) return entry.name
    }
    return null
  }

  const index = await readIndex(fs, dir)
  const fresh: Record<string, ImageIndexEntry> = {}
  let found: string | null = null
  const wanted = await hash(data)
  for (const entry of entries) {
    const stat = await fs.fileTimes?.(joinPath(dir, entry.name))
    const known = index[entry.name]
    if (known && stat?.size === known.size && stat.modified === known.modified) {
      fresh[entry.name] = known
    } else {
      const bytes = await fs.readBinary(joinPath(dir, entry.name))
      fresh[entry.name] = { size: bytes.length, modified: stat?.modified ?? 0, hash: await hash(bytes) }
    }
    if (found === null && fresh[entry.name]!.hash === wanted) found = entry.name
  }
  if (JSON.stringify(fresh) !== JSON.stringify(index)) await writeIndex(fs, dir, fresh)
  return found
}

async function writeIndex(fs: FileSystem, dir: string, entries: Record<string, ImageIndexEntry>): Promise<void> {
  await fs.writeText(joinPath(dir, INDEX_NAME), JSON.stringify({ version: 1, entries }) + '\n')
}

/** Stores the bytes once: reuses an identical picture, or writes a new file. */
async function store(
  fs: FileSystem,
  root: string,
  originalName: string,
  data: Uint8Array,
  hash?: Hasher,
): Promise<ImportedImage> {
  const alt = (n: string): string => n.replace(/\.[^.]*$/, '')
  const existing = await findIdentical(fs, root, data, hash)
  if (existing) return { name: existing, markdown: imageMarkdown(existing, alt(originalName)), reused: true }
  const dir = joinPath(root, ASSETS_DIR)
  await fs.makeDir(dir)
  const name = assetName(originalName, await takenNames(fs, root))
  await fs.writeBinary(joinPath(dir, name), data)
  if (hash) {
    // Remember the new file now, so the next check does not read it again.
    const index = await readIndex(fs, dir)
    const stat = await fs.fileTimes?.(joinPath(dir, name))
    index[name] = { size: data.length, modified: stat?.modified ?? 0, hash: await hash(data) }
    await writeIndex(fs, dir, index)
  }
  return { name, markdown: imageMarkdown(name, alt(name)), reused: false }
}

/**
 * Puts picture files in the library's assets folder and returns the Markdown
 * for each. A picture already there, byte for byte, is reused rather than
 * stored again. Files that are not images are skipped.
 */
export async function importImages(
  fs: FileSystem,
  root: string,
  sources: string[],
  hash?: Hasher,
): Promise<ImportedImage[]> {
  const done: ImportedImage[] = []
  for (const source of sources) {
    const original = fileNameOf(source)
    if (!isImageName(original)) continue
    done.push(await store(fs, root, original, await fs.readBinary(source), hash))
  }
  return done
}

/** Saves picture bytes, such as a pasted screenshot, in the assets folder (or reuses an identical picture). */
export async function saveImage(
  fs: FileSystem,
  root: string,
  originalName: string,
  data: Uint8Array,
  hash?: Hasher,
): Promise<ImportedImage> {
  return store(fs, root, originalName, data, hash)
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Base64 of some bytes, without needing a platform's own encoder. */
export function toBase64(data: Uint8Array): string {
  let out = ''
  for (let i = 0; i < data.length; i += 3) {
    const n = (data[i]! << 16) | ((data[i + 1] ?? 0) << 8) | (data[i + 2] ?? 0)
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!
    out += i + 1 < data.length ? B64[(n >> 6) & 63]! : '='
    out += i + 2 < data.length ? B64[n & 63]! : '='
  }
  return out
}

/** A `data:` address with the image inside, or null if the link is not a library image or the file is missing. */
export async function imageDataUri(fs: FileSystem, root: string, url: string): Promise<string | null> {
  const name = assetNameFromUrl(url)
  const mime = name ? imageMime(name) : undefined
  if (!name || !mime) return null
  try {
    return `data:${mime};base64,${toBase64(await fs.readBinary(joinPath(joinPath(root, ASSETS_DIR), name)))}`
  } catch {
    return null
  }
}

/** The text with each library picture's link replaced by one that carries the picture itself. */
export async function embedImages(fs: FileSystem, root: string, text: string): Promise<string> {
  const refs = findImages(text)
  let out = text
  for (const ref of [...refs].reverse()) {
    const uri = await imageDataUri(fs, root, ref.url)
    if (uri) out = out.slice(0, ref.from) + `![${ref.alt}](${uri})` + out.slice(ref.to)
  }
  return out
}

/** The text with every image's Markdown removed, for counting words. */
export function stripImages(text: string): string {
  const refs = findImages(text)
  let out = text
  for (const ref of [...refs].reverse()) out = out.slice(0, ref.from) + out.slice(ref.to)
  return out
}

const MENTION = /\.assets\/([^\s)"'`\]>]+)/g

/**
 * The names of the library pictures a text mentions. Looser than
 * `findImages` on purpose: a link inside a code fence or a comment still
 * counts, so a picture is never called unused while any sheet names it.
 */
export function assetsMentioned(text: string): string[] {
  if (!text.includes(`${ASSETS_DIR}/`)) return []
  const names = new Set<string>()
  for (const m of text.matchAll(MENTION)) {
    const name = assetNameFromUrl(`${ASSETS_DIR}/${m[1]}`)
    if (name) names.add(name)
  }
  return [...names]
}

/** A picture in the assets folder that no sheet mentions. */
export interface UnusedImage {
  name: string
  /** Bytes, when the file system can say. */
  size: number
}

/** The pictures in the assets folder that no sheet in the tree mentions, by name. */
export async function unusedImages(fs: FileSystem, root: string, tree: GroupNode): Promise<UnusedImage[]> {
  const dir = joinPath(root, ASSETS_DIR)
  if (!(await fs.exists(dir))) return []
  const used = new Set<string>()
  const walk = (nodes: LibraryNode[]): void => {
    for (const node of nodes) {
      if (node.kind === 'group') walk(node.children)
      else for (const name of node.images) used.add(name)
    }
  }
  walk(tree.children)
  const unused: UnusedImage[] = []
  for (const entry of await fs.list(dir)) {
    if (entry.kind !== 'file' || !isImageName(entry.name) || used.has(entry.name)) continue
    const size = (await fs.fileTimes?.(joinPath(dir, entry.name)))?.size ?? (await fs.readBinary(joinPath(dir, entry.name))).length
    unused.push({ name: entry.name, size })
  }
  return unused.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * The text with each library picture's link pointed into `folder`, a folder
 * that will sit beside the exported file. Returns the names of the pictures used.
 */
export function linkImagesToFolder(text: string, folder: string): { text: string; names: string[] } {
  const names = new Set<string>()
  let out = text
  for (const ref of [...findImages(text)].reverse()) {
    const name = assetNameFromUrl(ref.url)
    if (!name) continue
    names.add(name)
    out =
      out.slice(0, ref.from) +
      `![${ref.alt}](${encodeURI(folder)}/${encodeURIComponent(name)})` +
      out.slice(ref.to)
  }
  return { text: out, names: [...names] }
}

/** Total size in bytes of the named pictures that exist in the assets folder. */
export async function imagesSize(fs: FileSystem, root: string, names: string[]): Promise<number> {
  let total = 0
  for (const name of names) {
    const path = joinPath(joinPath(root, ASSETS_DIR), name)
    try {
      total += (await fs.fileTimes?.(path))?.size ?? (await fs.readBinary(path)).length
    } catch {
      // A missing picture adds nothing.
    }
  }
  return total
}
