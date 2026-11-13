import { promises as nodeFs } from 'node:fs'
import { BrowserWindow, dialog, ipcMain, shell, app } from 'electron'
import { join } from 'node:path'
import { loadLibrary, type FileSystem } from '@writingapp/core'
import type { LibraryInfo } from '../preload/api'
import { createNodeFileSystem } from './nodeFileSystem'
import { isSheetInside, toPosix } from './paths'
import { createSettingsStore } from './settings'

const fs: FileSystem = createNodeFileSystem((path) => shell.trashItem(path))
let settings: ReturnType<typeof createSettingsStore>
let currentRoot: string | undefined

async function open(path: string): Promise<LibraryInfo | null> {
  try {
    const tree = await loadLibrary(fs, path)
    currentRoot = tree.path
    return { path: tree.path, tree }
  } catch {
    return null
  }
}

/** Shows the folder picker and opens the chosen library, remembering it. */
export async function chooseLibrary(window?: BrowserWindow): Promise<LibraryInfo | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Open Library',
    buttonLabel: 'Open Library',
    properties: ['openDirectory', 'createDirectory']
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  const picked = result.filePaths[0]
  if (result.canceled || picked === undefined) return null
  const info = await open(toPosix(picked))
  if (!info) {
    dialog.showErrorBox('Could not open library', `The folder could not be read:\n${picked}`)
    return null
  }
  await settings.save({ libraryPath: info.path })
  return info
}

export function registerLibraryIpc(): void {
  settings = createSettingsStore(join(app.getPath('userData'), 'settings.json'))

  ipcMain.handle('library:get', async () => {
    const { libraryPath } = await settings.load()
    return libraryPath ? open(libraryPath) : null
  })

  ipcMain.handle('library:choose', (event) =>
    chooseLibrary(BrowserWindow.fromWebContents(event.sender) ?? undefined)
  )

  ipcMain.handle('sheet:read', async (_event, path: unknown) => {
    if (typeof path !== 'string' || !currentRoot || !isSheetInside(currentRoot, path)) {
      throw new Error('Not a sheet in the open library')
    }
    return nodeFs.readFile(path, 'utf8')
  })
}
