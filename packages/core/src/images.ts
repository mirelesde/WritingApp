import type { FileSystem } from './filesystem'
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

/**
 * The picture already in the assets folder that has exactly these bytes, if
 * there is one. Files of another size are skipped without being read, where
 * the file system can tell sizes cheaply.
 */
async function findIdentical(fs: FileSystem, root: string, data: Uint8Array): Promise<string | null> {
  const dir = joinPath(root, ASSETS_DIR)
  if (!(await fs.exists(dir))) return null
  for (const entry of await fs.list(dir)) {
    if (entry.kind !== 'file' || !isImageName(entry.name)) continue
    const path = joinPath(dir, entry.name)
    const size = (await fs.fileTimes?.(path))?.size
    if (size !== undefined && size !== data.length) continue
    if (sameBytes(await fs.readBinary(path), data)) return entry.name
  }
  return null
}

/** Stores the bytes once: reuses an identical picture, or writes a new file. */
async function store(fs: FileSystem, root: string, originalName: string, data: Uint8Array): Promise<ImportedImage> {
  const alt = (n: string): string => n.replace(/\.[^.]*$/, '')
  const existing = await findIdentical(fs, root, data)
  if (existing) return { name: existing, markdown: imageMarkdown(existing, alt(originalName)), reused: true }
  const dir = joinPath(root, ASSETS_DIR)
  await fs.makeDir(dir)
  const name = assetName(originalName, await takenNames(fs, root))
  await fs.writeBinary(joinPath(dir, name), data)
  return { name, markdown: imageMarkdown(name, alt(name)), reused: false }
}

/**
 * Puts picture files in the library's assets folder and returns the Markdown
 * for each. A picture already there, byte for byte, is reused rather than
 * stored again. Files that are not images are skipped.
 */
export async function importImages(fs: FileSystem, root: string, sources: string[]): Promise<ImportedImage[]> {
  const done: ImportedImage[] = []
  for (const source of sources) {
    const original = fileNameOf(source)
    if (!isImageName(original)) continue
    done.push(await store(fs, root, original, await fs.readBinary(source)))
  }
  return done
}

/** Saves picture bytes, such as a pasted screenshot, in the assets folder (or reuses an identical picture). */
export async function saveImage(
  fs: FileSystem,
  root: string,
  originalName: string,
  data: Uint8Array,
): Promise<ImportedImage> {
  return store(fs, root, originalName, data)
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
