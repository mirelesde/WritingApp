import { sheetTitle } from './sheet'

const MAX_SLUG_LENGTH = 50
const FALLBACK = 'untitled'
// Names Windows refuses to create as files, with or without an extension.
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
const MAX_NAME_LENGTH = 80

/**
 * Turns text into a safe, lowercase file name stem: accents stripped,
 * letters and digits kept (any script), everything else collapsed to
 * single hyphens. Falls back to "untitled" when nothing is left.
 */
export function slugify(text: string): string {
  let slug = text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length > MAX_SLUG_LENGTH) {
    slug = slug.slice(0, MAX_SLUG_LENGTH).replace(/-[^-]*$/, (tail) =>
      // Prefer cutting at a word boundary, but not if that leaves almost nothing.
      slug.length - tail.length >= MAX_SLUG_LENGTH / 2 ? '' : tail,
    )
    slug = slug.replace(/-+$/, '')
  }
  if (slug === '') return FALLBACK
  return RESERVED.test(slug) ? slug + '-1' : slug
}

/**
 * Turns a title into a readable, safe file name stem: case, spaces and any
 * script are kept; characters the file systems refuse (/ \\ : * ? " < > |) and
 * control characters are dropped, and trailing dots and spaces (which Windows
 * strips) are removed. Falls back to "Untitled" when nothing is left.
 */
export function readableName(text: string): string {
  let name = text
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
  if (name.length > MAX_NAME_LENGTH) {
    name = [...name].slice(0, MAX_NAME_LENGTH).join('')
    const cut = name.lastIndexOf(' ')
    if (cut >= MAX_NAME_LENGTH / 2) name = name.slice(0, cut)
  }
  name = name.replace(/[. ]+$/, '').trim()
  if (name === '') return 'Untitled'
  return RESERVED.test(name) ? name + ' 1' : name
}

/**
 * True when `stem` is a file name stem that already fits `title`: either the
 * readable form or the older hyphenated form, with or without a number
 * added to avoid a clash.
 */
export function stemFitsTitle(stem: string, title: string): boolean {
  const forms: [string, string][] = [
    [readableName(title), ' '],
    [slugify(title), '-'],
  ]
  return forms.some(([base, sep]) => {
    if (stem.toLowerCase() === base.toLowerCase()) return true
    const head = base + sep
    return stem.toLowerCase().startsWith(head.toLowerCase()) && /^\d+$/.test(stem.slice(head.length))
  })
}

/**
 * The file name for a new sheet: its title made safe, plus ".md", with
 * " 2", " 3", ... added until it differs from every name in `existing`.
 * Collisions ignore case, since macOS and Windows folders do.
 */
export function sheetFileName(content: string, existing: Iterable<string>): string {
  const taken = new Set<string>()
  for (const name of existing) taken.add(name.toLowerCase())
  const stem = readableName(sheetTitle(content))
  let candidate = `${stem}.md`
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem} ${n}.md`
  return candidate
}
