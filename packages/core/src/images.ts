import type { FileSystem } from './filesystem'
import { joinPath } from './path'

/*
 * A picture is stored in the same folder as the sheet that shows it, under
 * its own file name (a numeric suffix on a clash), and linked by that name:
 * `![alt](cat.png)`. The library tree lists only sheets and groups, so the
 * pictures stay out of sight; other Markdown apps read the same links.
 */

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

/** The Markdown for a picture at `path`, relative to its sheet's folder. */
export function imageMarkdown(path: string, alt = ''): string {
  const text = alt.replace(/[[\]\n]/g, ' ').trim()
  return `![${text}](${path.split('/').map(encodeURIComponent).join('/')})`
}

/**
 * The path, relative to the sheet's folder, that a link points at, or null
 * when it is not a picture file next to the sheet: a web address, an
 * absolute path, a path that climbs out of the folder, or not an image.
 */
export function localImagePath(url: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('/') || url.startsWith('#')) return null
  let path: string
  try {
    path = decodeURIComponent(url.replace(/^\.\//, ''))
  } catch {
    return null
  }
  if (path === '' || path.includes('\\')) return null
  const parts = path.split('/')
  if (parts.some((p) => p === '' || p === '..' || p === '.' || p.startsWith('.'))) return null
  return isImageName(path) ? path : null
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

/** What importing a picture gave: the Markdown to put in a sheet, and the file's name in the folder. */
export interface ImportedImage {
  name: string
  markdown: string
}

async function takenNames(fs: FileSystem, dir: string): Promise<Set<string>> {
  return new Set((await fs.list(dir)).map((e) => e.name))
}

function altOf(name: string): string {
  return name.replace(/\.[^.]*$/, '')
}

/**
 * Copies picture files into the sheet's folder and returns the Markdown for
 * each. Files that are not images are skipped.
 */
export async function importImages(fs: FileSystem, dir: string, sources: string[]): Promise<ImportedImage[]> {
  const taken = await takenNames(fs, dir)
  const done: ImportedImage[] = []
  for (const source of sources) {
    const original = fileNameOf(source)
    if (!isImageName(original)) continue
    const name = assetName(original, taken)
    await fs.copyFile(source, joinPath(dir, name))
    taken.add(name)
    done.push({ name, markdown: imageMarkdown(name, altOf(name)) })
  }
  return done
}

/** Saves picture bytes, such as a pasted screenshot, in the sheet's folder. */
export async function saveImage(
  fs: FileSystem,
  dir: string,
  originalName: string,
  data: Uint8Array,
): Promise<ImportedImage> {
  const name = assetName(originalName, await takenNames(fs, dir))
  await fs.writeBinary(joinPath(dir, name), data)
  return { name, markdown: imageMarkdown(name, altOf(name)) }
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

/** A `data:` address with the picture inside, or null if the link is not a local picture or the file is missing. */
export async function imageDataUri(fs: FileSystem, dir: string, url: string): Promise<string | null> {
  const path = localImagePath(url)
  const mime = path ? imageMime(path) : undefined
  if (!path || !mime) return null
  try {
    return `data:${mime};base64,${toBase64(await fs.readBinary(joinPath(dir, path)))}`
  } catch {
    return null
  }
}

/** The text with each local picture's link replaced by one that carries the picture itself. */
export async function embedImages(fs: FileSystem, dir: string, text: string): Promise<string> {
  let out = text
  for (const ref of [...findImages(text)].reverse()) {
    const uri = await imageDataUri(fs, dir, ref.url)
    if (uri) out = out.slice(0, ref.from) + `![${ref.alt}](${uri})` + out.slice(ref.to)
  }
  return out
}

/** The text with every image's Markdown removed, for counting words. */
export function stripImages(text: string): string {
  let out = text
  for (const ref of [...findImages(text)].reverse()) out = out.slice(0, ref.from) + out.slice(ref.to)
  return out
}

/**
 * A sheet is going to another folder: copies the pictures it links into that
 * folder (a picture already there with the same bytes is reused, a different
 * one gets a new name) and rewrites its links to match. The originals stay,
 * since other sheets may use them. Returns the sheet's text before, and the
 * files created, so the change can be undone; null when nothing needed doing.
 */
export async function carryImages(
  fs: FileSystem,
  fromDir: string,
  sheetPath: string,
): Promise<{ before: string; created: string[] } | null> {
  const toDir = sheetPath.slice(0, sheetPath.lastIndexOf('/')) || '/'
  if (toDir === fromDir) return null
  const text = await fs.readText(sheetPath)
  const created: string[] = []
  let out = text
  for (const ref of [...findImages(text)].reverse()) {
    const rel = localImagePath(ref.url)
    if (!rel) continue
    const source = joinPath(fromDir, rel)
    if (!(await fs.exists(source))) continue
    const slash = rel.lastIndexOf('/')
    const sub = slash < 0 ? '' : rel.slice(0, slash)
    const destDir = sub ? joinPath(toDir, sub) : toDir
    const bytes = await fs.readBinary(source)
    let name = fileNameOf(rel)
    if (await fs.exists(joinPath(destDir, name))) {
      const same = await fs.readBinary(joinPath(destDir, name))
      if (same.length !== bytes.length || same.some((b, i) => b !== bytes[i])) {
        name = assetName(name, await takenNames(fs, destDir))
      }
    }
    const target = joinPath(destDir, name)
    if (!(await fs.exists(target))) {
      if (sub) await fs.makeDir(destDir)
      await fs.writeBinary(target, bytes)
      created.push(target)
    }
    const next = sub ? `${sub}/${name}` : name
    if (next !== rel) out = out.slice(0, ref.from) + imageMarkdown(next, ref.alt) + out.slice(ref.to)
  }
  if (out !== text) await fs.writeText(sheetPath, out)
  return created.length === 0 && out === text ? null : { before: text, created }
}
