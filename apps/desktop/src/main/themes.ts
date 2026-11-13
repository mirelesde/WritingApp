import { app, ipcMain, shell } from 'electron'
import { promises as fs } from 'fs'
import { join } from 'path'
import { parseColorTheme, type ColorTheme } from '@writingapp/core'

const folder = (): string => join(app.getPath('userData'), 'themes')

const SAMPLE = {
  name: 'Example (copy and edit me)',
  mode: 'dark',
  colors: {
    bg: '#14181f',
    list: '#1a2029',
    sidebar: '#212a36',
    text: '#dde3ea',
    muted: '#8794a5',
    border: '#2c3643',
    hover: '#2a3544',
    selected: '#34425a',
    selection: '#2d4a6b',
    marker: '#566478',
    comment: '#ff8a7a',
    quote: '#7db8ff',
    accent: '#6aa9ff'
  }
}

/** Every valid theme file in the themes folder, by name. */
export async function listThemes(): Promise<ColorTheme[]> {
  let names: string[]
  try {
    names = await fs.readdir(folder())
  } catch {
    return []
  }
  const themes: ColorTheme[] = []
  for (const file of names.filter((n) => n.endsWith('.json') && !n.startsWith('.')).sort()) {
    try {
      const id = file.slice(0, -5)
      const theme = parseColorTheme(id, await fs.readFile(join(folder(), file), 'utf8'))
      if (theme && /^[\w .-]{1,80}$/.test(id)) themes.push(theme)
    } catch {
      // An unreadable file is simply not listed.
    }
  }
  return themes
}

export function registerThemeIpc(): void {
  ipcMain.handle('themes:list', () => listThemes())
  ipcMain.handle('themes:openFolder', async () => {
    await fs.mkdir(folder(), { recursive: true })
    if ((await fs.readdir(folder())).length === 0) {
      await fs.writeFile(join(folder(), 'example.json'), JSON.stringify(SAMPLE, null, 2) + '\n', 'utf8')
    }
    await shell.openPath(folder())
  })
}
