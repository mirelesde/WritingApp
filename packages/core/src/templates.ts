import type { FileSystem } from './filesystem'
import { sheetFileName } from './filename'
import { createSheet } from './operations'
import { joinPath, trimSlashes } from './path'
import { sheetTitle } from './sheet'

/** Templates are ordinary sheets kept in this hidden folder at the library root. */
export const TEMPLATES_DIR = '.templates'

/** The template a daily note starts from, if there is one with this title. */
export const DAILY_TEMPLATE = 'Daily Note'

export interface Template {
  /** The template's title, from its first line. */
  name: string
  path: string
}

const pad = (n: number): string => String(n).padStart(2, '0')

/** A date as `2026-11-13`, in local time. */
export function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Replaces `{{date}}`, `{{time}}` and `{{weekday}}` in a template with the moment of use. */
export function fillTemplate(text: string, date: Date): string {
  return text
    .replace(/\{\{\s*date\s*\}\}/gi, isoDate(date))
    .replace(/\{\{\s*time\s*\}\}/gi, `${pad(date.getHours())}:${pad(date.getMinutes())}`)
    .replace(/\{\{\s*weekday\s*\}\}/gi, date.toLocaleDateString('en-US', { weekday: 'long' }))
}

/** The templates in the library, by name. */
export async function listTemplates(fs: FileSystem, root: string): Promise<Template[]> {
  const dir = joinPath(trimSlashes(root), TEMPLATES_DIR)
  if (!(await fs.exists(dir))) return []
  const found: Template[] = []
  for (const entry of await fs.list(dir)) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue
    const path = joinPath(dir, entry.name)
    found.push({ name: sheetTitle(await fs.readText(path)), path })
  }
  return found.sort((a, b) => a.name.localeCompare(b.name))
}

/** Saves text as a new template and returns its path. */
export async function saveAsTemplate(fs: FileSystem, root: string, content: string): Promise<string> {
  const dir = joinPath(trimSlashes(root), TEMPLATES_DIR)
  await fs.makeDir(dir)
  const existing = (await fs.list(dir)).map((e) => e.name)
  const path = joinPath(dir, sheetFileName(content, existing))
  await fs.writeText(path, content)
  return path
}

/** Creates a sheet in a group from a template, filling in its placeholders. */
export async function createFromTemplate(
  fs: FileSystem,
  groupPath: string,
  templatePath: string,
  date: Date,
  index?: number,
): Promise<string> {
  const text = fillTemplate(await fs.readText(templatePath), date)
  return createSheet(fs, groupPath, text, index)
}

/**
 * Today's sheet in a group: the one titled with today's date if it exists,
 * else a new one, started from the "Daily Note" template when there is one.
 */
export async function dailyNote(
  fs: FileSystem,
  root: string,
  groupPath: string,
  date: Date,
): Promise<{ path: string; created: boolean }> {
  const dir = trimSlashes(groupPath)
  const today = isoDate(date)
  for (const entry of await fs.list(dir)) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue
    const path = joinPath(dir, entry.name)
    if (sheetTitle(await fs.readText(path)) === today) return { path, created: false }
  }
  const template = (await listTemplates(fs, root)).find(
    (t) => t.name.toLowerCase() === DAILY_TEMPLATE.toLowerCase(),
  )
  const text = template
    ? fillTemplate(await fs.readText(template.path), date).replace(
        /^(\s{0,3}#{1,6}\s+)?.*/,
        (_, hash: string | undefined) => `${hash ?? '# '}${today}`,
      )
    : `# ${today}\n\n`
  return { path: await createSheet(fs, dir, text), created: true }
}
