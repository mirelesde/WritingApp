import { writeFileAtomic } from './atomicWrite'
import { app, ipcMain, shell } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import {
  BUILTIN_EXPORT_STYLES,
  parseStyleMeta,
  sanitizeCss,
  styleFileName,
  styleFileText,
  type ExportStyleDef
} from '@writingapp/core'

const folder = (): string => join(app.getPath('userData'), 'export-styles')
const USER_PREFIX = 'user:'

/** A style file name that cannot point outside the folder. */
function safeFile(id: unknown): string {
  const file = typeof id === 'string' && id.startsWith(USER_PREFIX) ? id.slice(USER_PREFIX.length) : ''
  if (!/^[\w.-]{1,80}\.css$/.test(file) || file.startsWith('.')) throw new Error('Not one of your styles')
  return file
}

/** The built-in styles followed by the writer's own. */
export async function listStyles(): Promise<ExportStyleDef[]> {
  let names: string[] = []
  try {
    names = await fs.readdir(folder())
  } catch {
    // No folder yet: no styles of their own.
  }
  const own: ExportStyleDef[] = []
  for (const file of names.filter((n) => /^[\w.-]+\.css$/.test(n) && !n.startsWith('.')).sort()) {
    try {
      const css = sanitizeCss(await fs.readFile(join(folder(), file), 'utf8'))
      own.push({ id: USER_PREFIX + file, ...parseStyleMeta(file, css), css, builtin: false })
    } catch {
      // An unreadable file is simply not listed.
    }
  }
  return [...BUILTIN_EXPORT_STYLES, ...own]
}

/** A file name not yet used in the folder. */
async function freeFile(name: string): Promise<string> {
  const base = styleFileName(name).slice(0, -4)
  for (let n = 1; ; n++) {
    const file = n === 1 ? `${base}.css` : `${base}-${n}.css`
    try {
      await fs.access(join(folder(), file))
    } catch {
      return file
    }
  }
}

export function registerExportStyleIpc(): void {
  ipcMain.handle('exportStyles:list', () => listStyles())

  // Saves a style of the writer's own: over `id` when given, else as a new file. Returns its id.
  ipcMain.handle(
    'exportStyles:save',
    async (_event, name: unknown, description: unknown, css: unknown, id: unknown) => {
      if (typeof name !== 'string' || typeof description !== 'string' || typeof css !== 'string') {
        throw new Error('Nothing to save')
      }
      if (name.trim() === '') throw new Error('Give the style a name')
      await fs.mkdir(folder(), { recursive: true })
      const file = id ? safeFile(id) : await freeFile(name)
      await writeFileAtomic(join(folder(), file), styleFileText(name, description, css))
      return USER_PREFIX + file
    }
  )

  ipcMain.handle('exportStyles:delete', async (_event, id: unknown) => {
    await fs.rm(join(folder(), safeFile(id)), { force: true })
  })

  ipcMain.handle('exportStyles:openFolder', async () => {
    await fs.mkdir(folder(), { recursive: true })
    await shell.openPath(folder())
  })
}
