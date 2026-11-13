import { promises as nodeFs } from 'node:fs'
import { BrowserWindow, dialog, ipcMain, shell, app } from 'electron'
import { join } from 'node:path'
import {
  applyUndo,
  createGroup,
  createSheet,
  glueSheets,
  loadLibrary,
  mergeSheets,
  moveNodes,
  renameGroup,
  splitSheet,
  unglueSheets,
  type FileSystem,
  type SheetChange,
  type UndoAction
} from '@writingapp/core'
import type { LibraryInfo, OpResult } from '../preload/api'
import { createNodeFileSystem } from './nodeFileSystem'
import { isInside, isSheetInside, toPosix } from './paths'
import { createSettingsStore } from './settings'

const fs: FileSystem = createNodeFileSystem((path) => shell.trashItem(path))
let settings: ReturnType<typeof createSettingsStore>
let currentRoot: string | undefined

// How to reverse the latest structural changes, newest last. Held in memory
// for the open library only.
const undoStack: { label: string; actions: UndoAction[] }[] = []
const UNDO_DEPTH = 20

async function open(path: string): Promise<LibraryInfo | null> {
  try {
    const tree = await loadLibrary(fs, path)
    if (tree.path !== currentRoot) undoStack.length = 0
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

/** Runs a change to the library, then reloads it so the UI sees the result. */
async function change(
  run: (root: string) => Promise<{
    moved?: [string, string][]
    created?: string
    /** Set to make the change undoable. */
    undo?: { label: string; actions: UndoAction[] }
  }>
): Promise<OpResult> {
  if (!currentRoot) throw new Error('No library is open')
  const outcome = await run(currentRoot)
  if (outcome.undo) {
    undoStack.push(outcome.undo)
    if (undoStack.length > UNDO_DEPTH) undoStack.shift()
  }
  const library = await open(currentRoot)
  if (!library) throw new Error('The library could not be reloaded')
  return { library, moved: outcome.moved ?? [], created: outcome.created }
}

/** Wraps a sheet change's result so `change` records how to undo it. */
function undoable(
  label: string,
  result: SheetChange
): { created?: string; undo: { label: string; actions: UndoAction[] } } {
  return { created: result.path, undo: { label, actions: result.undo } }
}

function inside(path: unknown, allowRoot = false): string {
  if (typeof path !== 'string' || !currentRoot || !isInside(currentRoot, path, allowRoot)) {
    throw new Error('Not part of the open library')
  }
  return path
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

  ipcMain.handle('sheet:write', async (_event, path: unknown, text: unknown) => {
    if (
      typeof path !== 'string' ||
      typeof text !== 'string' ||
      !currentRoot ||
      !isSheetInside(currentRoot, path)
    ) {
      throw new Error('Not a sheet in the open library')
    }
    // Saving edits an existing sheet; creating sheets is a separate operation.
    if (!(await fs.exists(path))) throw new Error('The sheet no longer exists')
    await fs.writeText(path, text)
  })
  ipcMain.handle('op:createSheet', (_event, group: unknown, index: unknown) =>
    change(async () => {
      const parent = inside(group, true)
      const at = typeof index === 'number' ? index : undefined
      return { created: await createSheet(fs, parent, '', at) }
    })
  )

  ipcMain.handle('op:createGroup', (_event, parent: unknown, name: unknown) =>
    change(async () => {
      const dir = inside(parent, true)
      return { created: await createGroup(fs, dir, typeof name === 'string' ? name : undefined) }
    })
  )

  ipcMain.handle('op:renameGroup', (_event, path: unknown, name: unknown) =>
    change(async () => {
      const from = inside(path)
      if (typeof name !== 'string') throw new Error('A group needs a name')
      const to = await renameGroup(fs, from, name)
      return { moved: [[from, to]] }
    })
  )

  ipcMain.handle('op:move', (_event, paths: unknown, target: unknown, index: unknown) =>
    change(async () => {
      if (!Array.isArray(paths)) throw new Error('Nothing to move')
      const from = paths.map((p) => inside(p))
      const to = await moveNodes(
        fs,
        from,
        inside(target, true),
        typeof index === 'number' ? index : undefined
      )
      return { moved: from.map((p, i): [string, string] => [p, to[i]!]) }
    })
  )

  ipcMain.handle('op:split', (_event, path: unknown, text: unknown, offset: unknown) =>
    change(async () => {
      const sheet = inside(path)
      if (typeof text !== 'string' || typeof offset !== 'number')
        throw new Error('Nothing to split')
      return undoable('Split', await splitSheet(fs, sheet, text, offset))
    })
  )

  ipcMain.handle('op:merge', (_event, paths: unknown) =>
    change(async () => {
      if (!Array.isArray(paths)) throw new Error('Select sheets to merge')
      return undoable(
        'Merge',
        await mergeSheets(
          fs,
          paths.map((p) => inside(p))
        )
      )
    })
  )

  ipcMain.handle('op:glue', (_event, paths: unknown) =>
    change(async () => {
      if (!Array.isArray(paths)) throw new Error('Select sheets to glue')
      return undoable(
        'Glue',
        await glueSheets(
          fs,
          paths.map((p) => inside(p))
        )
      )
    })
  )

  ipcMain.handle('op:unglue', (_event, paths: unknown) =>
    change(async () => {
      if (!Array.isArray(paths)) throw new Error('Select sheets to unglue')
      return undoable(
        'Unglue',
        await unglueSheets(
          fs,
          paths.map((p) => inside(p))
        )
      )
    })
  )

  ipcMain.handle('op:undo', async () => {
    const last = undoStack.pop()
    if (!last) throw new Error('Nothing to undo')
    const result = await change(async () => {
      await applyUndo(fs, last.actions)
      return {}
    })
    return { ...result, label: last.label }
  })
}
