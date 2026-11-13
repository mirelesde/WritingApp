import { sheetTitle } from './sheet'

const MAX_SLUG_LENGTH = 50
const FALLBACK = 'untitled'
// Names Windows refuses to create as files, with or without an extension.
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/

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
 * The file name for a new sheet: a slug of its title plus ".md", with
 * "-2", "-3", ... added until it differs from every name in `existing`.
 * Collisions ignore case, since macOS and Windows folders do.
 */
export function sheetFileName(content: string, existing: Iterable<string>): string {
  const taken = new Set<string>()
  for (const name of existing) taken.add(name.toLowerCase())
  const stem = slugify(sheetTitle(content))
  let candidate = `${stem}.md`
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem}-${n}.md`
  return candidate
}
