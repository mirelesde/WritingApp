import { promises as nodeFs } from 'node:fs'
import { BrowserWindow, dialog, ipcMain, protocol, shell, app } from 'electron'
import { basename, dirname, extname, join, normalize } from 'node:path'
import { createHash } from 'node:crypto'
import {
  docxToMarkdown,
  markdownToDocx,
  applyUndo,
  snapshotSidecar,
  createGroupUndoable,
  createFromTemplate,
  replaceInLibrary,
  createSheet,
  createSheetUndoable,
  importedMarkdown,
  dailyNote,
  listTemplates,
  saveAsTemplate,
  deleteNodeUndoable,
  exportEpub,
  exportHtml,
  withTitlePage,
  exportMarkdown,
  changeKeywords,
  glueSheets,
  setGroupColor,
  groupWordCount,
  loadLibrary,
  MAX_READ_BYTES,
  searchLibrary,
  type SearchOptions,
  mergeSheets,
  moveNodesUndoable,
  copyNodes,
  ASSETS_DIR,
  IMAGE_EXTENSIONS,
  assetNameFromUrl,
  imageMime,
  importImages,
  unusedImages,
  saveImage,
  renameGroupUndoable,
  syncSheetName,
  resolveView,
  splitSheet,
  unglueSheets,
  type FileSystem,
  type GroupNode,
  type SheetCache,
  type SheetChange,
  type UndoAction
} from '@writingapp/core'
import type { LibraryInfo, OpResult } from '../preload/api'
import type { ExportPreview } from '../preload/api'

/** The cover picture the writer last chose for an EPUB; the renderer never names a path itself. */
let epubCover: { path: string; name: string } | null = null
import { parsePdfOptions, renderPdf } from './pdf'
import { createNodeFileSystem } from './nodeFileSystem'
import { isInside, isSheetInside, toPosix } from './paths'
import { watchFolder } from './watcher'
import { createSettingsStore, withRecent } from './settings'
import { parseSheetCache, serializeSheetCache } from './sheetCache'
import { createJournal } from './journal'
import { logError } from './crash'

/** Hashes picture bytes, for spotting a picture the library already holds. */
const hashImage = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex')

// The app's paths use forward slashes; Windows' recycle bin wants its own backslashes.
const fs: FileSystem = createNodeFileSystem((path) => shell.trashItem(normalize(path)))
let settings: ReturnType<typeof createSettingsStore>
let currentRoot: string | undefined
let stopWatching: (() => void) | undefined

// How to reverse the latest structural changes, newest last. Held in memory
// for the open library only.
const undoStack: { label: string; actions: UndoAction[] }[] = []
const UNDO_DEPTH = 20

// What loading learned about each sheet, so unchanged files are not read again. Saved
// beside the app's settings, one file per library, so the next launch starts warm too.
const sheetCache: SheetCache = new Map()
let cacheRoot: string | undefined
let cacheReady: Promise<void> = Promise.resolve()
let cacheSaveTimer: ReturnType<typeof setTimeout> | undefined

function cacheFile(root: string): string {
  const id = createHash('sha1').update(root).digest('hex')
  return join(app.getPath('userData'), 'sheet-cache', `${id}.json`)
}

async function restoreCache(root: string): Promise<void> {
  sheetCache.clear()
  try {
    const saved = parseSheetCache(await nodeFs.readFile(cacheFile(root), 'utf8'), root)
    if (cacheRoot === root) for (const [key, entry] of saved) sheetCache.set(key, entry)
  } catch {
    // No saved cache yet.
  }
}

function scheduleCacheSave(root: string): void {
  clearTimeout(cacheSaveTimer)
  cacheSaveTimer = setTimeout(async () => {
    if (root !== cacheRoot) return
    try {
      const file = cacheFile(root)
      await nodeFs.mkdir(join(file, '..'), { recursive: true })
      const temp = `${file}.tmp`
      await nodeFs.writeFile(temp, serializeSheetCache(root, sheetCache), 'utf8')
      await nodeFs.rename(temp, file)
    } catch {
      // The cache is an optimisation; losing it costs one slow start.
    }
  }, 1500)
}

/** `loadLibrary` that skips sheets unchanged since the last load. */
async function load(root: string): Promise<GroupNode> {
  if (cacheRoot !== root) {
    cacheRoot = root
    cacheReady = restoreCache(root)
  }
  await cacheReady
  const before = sheetCache.size
  const stats = { read: 0, cached: 0 }
  const tree = await loadLibrary(fs, root, { cache: sheetCache, stats })
  if (stats.read > 0 || sheetCache.size !== before) scheduleCacheSave(root)
  return tree
}

async function open(path: string): Promise<LibraryInfo | null> {
  try {
    const tree = await load(path)
    if (tree.path !== currentRoot) {
      undoStack.length = 0
      stopWatching?.()
      stopWatching = watchFolder(tree.path, () => void announceChange(tree.path), undefined, { log: (what, e) => void logError(what, e) })
    }
    currentRoot = tree.path
    return { path: tree.path, tree }
  } catch {
    return null
  }
}

/** Tells the windows that something changed in the library folder from outside. */
async function announceChange(root: string): Promise<void> {
  if (root !== currentRoot) return
  const info = await open(root)
  if (!info) return
  for (const window of BrowserWindow.getAllWindows())
    window.webContents.send('library:changed', info)
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
  await remember(info.path)
  return info
}

// Libraries opened before, for File > Open Recent. Cached so the menu can be built synchronously.
let recent: string[] = []
let onRecentChange: () => void = () => {}

export function recentLibraries(): string[] {
  return recent
}

/** Reads the saved list; `changed` is called whenever it changes afterwards. */
export async function loadRecent(changed: () => void): Promise<void> {
  const saved = await settings.load()
  recent = saved.recentLibraries ?? []
  // A library opened before this list existed still belongs in it.
  if (saved.libraryPath && !recent.includes(saved.libraryPath)) {
    recent = withRecent(recent, saved.libraryPath)
  }
  onRecentChange = changed
}

async function remember(path: string): Promise<void> {
  recent = withRecent(recent, path)
  await settings.update({ libraryPath: path, recentLibraries: recent })
  onRecentChange()
}

export async function clearRecent(): Promise<void> {
  recent = []
  await settings.update({ recentLibraries: [] })
  onRecentChange()
}

/** Opens a library from the recent list. A folder that is gone is dropped from the list. */
export async function openRecentLibrary(path: string): Promise<LibraryInfo | null> {
  const info = await open(toPosix(path))
  if (!info) {
    recent = recent.filter((p) => p !== path)
    await settings.update({ recentLibraries: recent })
    onRecentChange()
    dialog.showErrorBox('Could not open library', `The folder could not be read:\n${path}`)
    return null
  }
  await remember(info.path)
  return info
}

/** Runs a change to the library, then reloads it so the UI sees the result. */
/** The text of an imported file: UTF-16 or UTF-8 as marked, else UTF-8 falling back to Windows-1252. */
function decodeImported(bytes: Buffer, ext: string): string {
  if (ext.toLowerCase() === '.rtf') return bytes.toString('latin1')
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

async function change(
  run: (root: string) => Promise<{
    moved?: [string, string][]
    created?: string
    copied?: string[]
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
  return { library, moved: outcome.moved ?? [], created: outcome.created, copied: outcome.copied }
}

/** Wraps a sheet change's result so `change` records how to undo it. */
function undoable(
  label: string,
  result: SheetChange
): { created?: string; undo: { label: string; actions: UndoAction[] } } {
  return { created: result.path, undo: { label, actions: result.undo } }
}

function findGroupNode(node: GroupNode, path: string): GroupNode | undefined {
  if (node.path === path) return node
  for (const child of node.children) {
    if (child.kind !== 'group') continue
    const found = findGroupNode(child, path)
    if (found) return found
  }
  return undefined
}

export function inside(path: unknown, allowRoot = false): string {
  if (typeof path !== 'string' || !currentRoot || !isInside(currentRoot, path, allowRoot)) {
    throw new Error('Not part of the open library')
  }
  return path
}

/** The app's settings file, once the library IPC is registered. */
export function appSettings(): ReturnType<typeof createSettingsStore> {
  return settings
}

export function registerLibraryIpc(): void {
  settings = createSettingsStore(join(app.getPath('userData'), 'settings.json'))

  ipcMain.handle('library:get', async () => {
    const { libraryPath } = await settings.load()
    return libraryPath ? open(libraryPath) : null
  })

  // Unsaved text, kept apart from the library so a crash cannot lose what was typed since the last save.
  const journal = createJournal(join(app.getPath('userData'), 'journal'), (what, e) => void logError(what, e))
  const journalPath = (path: unknown): string => {
    if (typeof path !== 'string' || !currentRoot || !isSheetInside(currentRoot, path)) {
      throw new Error('Not a sheet in the open library')
    }
    return path
  }
  ipcMain.handle('journal:put', (_event, path: unknown, text: unknown) => {
    if (typeof text !== 'string') throw new Error('Nothing to journal')
    return journal.put(currentRoot!, journalPath(path), text)
  })
  ipcMain.handle('journal:clear', (_event, path: unknown) => journal.clear(journalPath(path)))
  // Text journaled during this run is still in flight, not left over from a crash.
  const startedAt = Date.now()
  ipcMain.handle('journal:pending', async () =>
    currentRoot ? (await journal.pending(currentRoot)).filter((entry) => entry.savedAt < startedAt) : []
  )

  ipcMain.handle('image:choose', async (event) => {
    if (!currentRoot) return []
    const options: Electron.OpenDialogOptions = {
      title: 'Insert Image',
      buttonLabel: 'Insert',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Images', extensions: IMAGE_EXTENSIONS }]
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled) return []
    return (await importImages(fs, currentRoot, result.filePaths.map(toPosix), hashImage)).map((i) => i.markdown)
  })

  ipcMain.handle('image:save', async (_event, name: unknown, data: unknown) => {
    if (!currentRoot || typeof name !== 'string' || !(data instanceof Uint8Array)) {
      throw new Error('Bad image')
    }
    return (await saveImage(fs, currentRoot, name, data, hashImage)).markdown
  })

  ipcMain.handle('image:unused', async () => {
    if (!currentRoot) return []
    return unusedImages(fs, currentRoot, await load(currentRoot))
  })

  // Only pictures that are still unused are trashed, whatever the caller asks for.
  ipcMain.handle('image:trashUnused', async (_event, names: unknown) => {
    if (!currentRoot || !Array.isArray(names)) return 0
    const wanted = new Set(names.filter((n): n is string => typeof n === 'string'))
    let trashed = 0
    for (const image of await unusedImages(fs, currentRoot, await load(currentRoot))) {
      if (!wanted.has(image.name)) continue
      await fs.trash(join(currentRoot, ASSETS_DIR, image.name))
      trashed++
    }
    return trashed
  })

  ipcMain.handle('session:lastSheet', async () => (await settings.load()).lastSheet ?? null)

  ipcMain.handle('session:setLastSheet', async (_event, path: unknown) => {
    if (typeof path === 'string' && currentRoot && isSheetInside(currentRoot, path)) {
      await settings.update({ lastSheet: path })
    }
  })

  ipcMain.handle('library:choose', (event) =>
    chooseLibrary(BrowserWindow.fromWebContents(event.sender) ?? undefined)
  )

  ipcMain.handle('sheet:read', async (_event, path: unknown) => {
    if (typeof path !== 'string' || !currentRoot || !isSheetInside(currentRoot, path)) {
      throw new Error('Not a sheet in the open library')
    }
    if ((await nodeFs.stat(path)).size > MAX_READ_BYTES) {
      throw new Error('That file is too large to open as a sheet')
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
  // Puts back a sheet whose file is gone, from text recovered after a crash. It never
  // overwrites: if the name is taken it picks another. A vanished folder is not
  // recreated; the sheet goes to the library's top level instead.
  ipcMain.handle('sheet:recreate', async (_event, path: unknown, text: unknown) => {
    if (typeof path !== 'string' || typeof text !== 'string' || !currentRoot || !isSheetInside(currentRoot, path)) {
      throw new Error('Not a sheet in the open library')
    }
    let folder = dirname(path)
    if (!(await fs.exists(folder))) folder = currentRoot
    const base = basename(path, '.md')
    let target = join(folder, `${base}.md`)
    for (let n = 2; await fs.exists(target); n++) target = join(folder, `${base} ${n}.md`)
    await fs.writeText(target, text)
    return target
  })
  /** Copies pictures from the library into `folder`, next to the exported file. */
  async function copyImagesBeside(file: string, folder: string, names: string[]): Promise<void> {
    if (!currentRoot) return
    for (const name of names) {
      const from = join(currentRoot, ASSETS_DIR, name)
      if (!(await fs.exists(from))) continue
      await fs.makeDir(join(dirname(file), folder))
      await fs.writeBinary(join(dirname(file), folder, name), await fs.readBinary(from))
    }
  }

  async function buildExport(paths: unknown, imagesFolder?: string, css?: unknown): Promise<ExportPreview> {
    if (!Array.isArray(paths) || !currentRoot) throw new Error('No library is open')
    const chosen = paths.map((p) => inside(p, true))
    const tree = await load(currentRoot)
    const view = resolveView((await settings.load()).view)
    return exportHtml(fs, tree, chosen, { indentParagraphs: view.paragraphIndent, css: typeof css === 'string' ? css : '' }, imagesFolder)
  }

  /** The page with a title page in front when the writer asked for one. */
  const titled = (html: string, raw: unknown): string => {
    const t = (raw && typeof raw === 'object' ? raw : null) as { title?: unknown; author?: unknown } | null
    if (!t || typeof t.title !== 'string' || t.title.trim() === '') return html
    return withTitlePage(html, t.title.slice(0, 300), typeof t.author === 'string' ? t.author.slice(0, 300) : '')
  }

  const searchOptions = (raw: unknown): SearchOptions => {
    const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
    return {
      caseSensitive: o.caseSensitive === true,
      wholeWord: o.wholeWord === true,
      regex: o.regex === true,
      ...(typeof o.within === 'string' ? { within: inside(o.within, true) } : {})
    }
  }

  ipcMain.handle('search:run', async (_event, query: unknown, options: unknown) => {
    if (typeof query !== 'string' || !currentRoot) return []
    return searchLibrary(fs, await load(currentRoot), query, 2000, searchOptions(options))
  })

  ipcMain.handle('op:replaceAll', async (_event, query: unknown, replacement: unknown, only: unknown, options: unknown) => {
    if (typeof query !== 'string' || typeof replacement !== 'string') throw new Error('Nothing to replace')
    const paths = Array.isArray(only) ? only.map((p) => inside(p)) : undefined
    let replaced = 0
    const result = await change(async (root) => {
      const outcome = await replaceInLibrary(fs, await load(root), query, replacement, paths, searchOptions(options))
      replaced = outcome.count
      return outcome.count > 0
        ? { undo: { label: `Replace “${query.trim()}”`, actions: outcome.undo } }
        : {}
    })
    return { ...result, replaced }
  })

  ipcMain.handle('stats:group', async (_event, path: unknown) => {
    if (!currentRoot) return 0
    const tree = await load(currentRoot)
    const target = findGroupNode(tree, inside(path, true))
    return target ? groupWordCount(target) : 0
  })

  ipcMain.handle('export:preview', (_event, paths: unknown) => buildExport(paths))

  ipcMain.handle('export:save', async (event, paths: unknown, pictures: unknown, css: unknown, titlePage: unknown) => {
    let built = await buildExport(paths, undefined, css)
    const options: Electron.SaveDialogOptions = {
      title: 'Export as HTML',
      defaultPath: `${built.title.replace(/[\\/:*?"<>|]+/g, '-')}.html`,
      filters: [{ name: 'HTML', extensions: ['html'] }]
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    const file = toPosix(result.filePath)
    if (pictures === 'folder' && built.images.length > 0) {
      // The pictures sit in a folder beside the page instead of inside it.
      const folder = `${basename(file, extname(file))}-images`
      built = await buildExport(paths, folder, css)
      await copyImagesBeside(file, folder, built.images)
    }
    await fs.writeText(file, titled(built.html, titlePage))
    return result.filePath
  })

  ipcMain.handle('export:saveMarkdown', async (event, paths: unknown) => {
    if (!Array.isArray(paths) || !currentRoot) throw new Error('No library is open')
    const chosen = paths.map((p) => inside(p, true))
    const tree = await load(currentRoot)
    const preview = await exportMarkdown(fs, tree, chosen, 'x')
    const options: Electron.SaveDialogOptions = {
      title: 'Export as Markdown',
      defaultPath: `${preview.title.replace(/[\\/:*?"<>|]+/g, '-')}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }]
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = window
      ? await dialog.showSaveDialog(window, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    const file = toPosix(result.filePath)
    const folder = `${basename(file, extname(file))}-images`
    const built = await exportMarkdown(fs, tree, chosen, folder)
    await fs.writeText(file, built.markdown)
    // The pictures the text uses go beside it, so its links work anywhere.
    await copyImagesBeside(file, folder, built.images)
    return result.filePath
  })

  ipcMain.handle('export:saveDocx', async (event, paths: unknown, rawOptions: unknown) => {
    if (!Array.isArray(paths) || !currentRoot) throw new Error('No library is open')
    const options = parsePdfOptions(rawOptions)
    const chosen = paths.map((p) => inside(p, true))
    const built = await exportMarkdown(fs, await load(currentRoot), chosen, ASSETS_DIR, false)
    const saveOptions: Electron.SaveDialogOptions = {
      title: 'Export as Word',
      defaultPath: `${built.title.replace(/[\\/:*?"<>|]+/g, '-')}.docx`,
      filters: [{ name: 'Word document', extensions: ['docx'] }]
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = window ? await dialog.showSaveDialog(window, saveOptions) : await dialog.showSaveDialog(saveOptions)
    if (result.canceled || !result.filePath) return null
    const images: Record<string, Uint8Array> = {}
    for (const name of built.images) {
      const from = join(currentRoot, ASSETS_DIR, name)
      if (await fs.exists(from)) images[name] = await fs.readBinary(from)
    }
    await nodeFs.writeFile(result.filePath, markdownToDocx(built.markdown, { title: built.title, ...options, images }))
    return result.filePath
  })

  ipcMain.handle('export:chooseCover', async (event) => {
    const options: Electron.OpenDialogOptions = {
      title: 'Cover picture',
      buttonLabel: 'Use as cover',
      properties: ['openFile'],
      filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }]
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const file = result.filePaths[0]
    if (result.canceled || !file || !imageMime(basename(file))) return null
    epubCover = { path: file, name: basename(file) }
    return epubCover.name
  })

  ipcMain.handle('export:saveEpub', async (event, paths: unknown, rawOptions: unknown, css: unknown) => {
    if (!Array.isArray(paths) || !currentRoot) throw new Error('No library is open')
    const o = (rawOptions && typeof rawOptions === 'object' ? rawOptions : {}) as Record<string, unknown>
    const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '')
    const chosen = paths.map((p) => inside(p, true))
    const view = resolveView((await settings.load()).view)
    const cover = o.cover === true && epubCover ? epubCover : null
    const built = await exportEpub(fs, await load(currentRoot), chosen, {
      title: text(o.title, 300),
      author: text(o.author, 300),
      language: text(o.language, 20) || 'en',
      css: typeof css === 'string' ? css : '',
      indentParagraphs: view.paragraphIndent,
      cover: cover ? { bytes: await fs.readBinary(toPosix(cover.path)), name: cover.name } : undefined
    })
    const saveOptions: Electron.SaveDialogOptions = {
      title: 'Export as EPUB',
      defaultPath: `${built.title.replace(/[\\/:*?"<>|]+/g, '-')}.epub`,
      filters: [{ name: 'EPUB book', extensions: ['epub'] }]
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = window ? await dialog.showSaveDialog(window, saveOptions) : await dialog.showSaveDialog(saveOptions)
    if (result.canceled || !result.filePath) return null
    await nodeFs.writeFile(result.filePath, built.bytes)
    return result.filePath
  })

  ipcMain.handle('export:savePdf', async (event, paths: unknown, rawOptions: unknown, css: unknown, titlePage: unknown) => {
    const options = parsePdfOptions(rawOptions)
    const built = await buildExport(paths, undefined, css)
    const saveOptions: Electron.SaveDialogOptions = {
      title: 'Export as PDF',
      defaultPath: `${built.title.replace(/[\\/:*?"<>|]+/g, '-')}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = window
      ? await dialog.showSaveDialog(window, saveOptions)
      : await dialog.showSaveDialog(saveOptions)
    if (result.canceled || !result.filePath) return null
    await nodeFs.writeFile(result.filePath, await renderPdf(titled(built.html, titlePage), options))
    return result.filePath
  })

  ipcMain.handle('op:createSheet', (_event, group: unknown, index: unknown) =>
    change(async () => {
      const parent = inside(group, true)
      const at = typeof index === 'number' ? index : undefined
      const made = await createSheetUndoable(fs, parent, '', at)
      return { created: made.path, undo: { label: 'New Sheet', actions: made.undo } }
    })
  )

  ipcMain.handle('import:files', async (event, group: unknown, index: unknown) => {
    const parent = inside(group, true)
    const options: Electron.OpenDialogOptions = {
      title: 'Import',
      buttonLabel: 'Import',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Word, text, RTF and Markdown', extensions: ['docx', 'txt', 'text', 'rtf', 'md', 'markdown'] }]
    }
    const window = BrowserWindow.fromWebContents(event.sender)
    const picked = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options)
    const skipped: string[] = []
    const result = await change(async () => {
      const copied: string[] = []
      if (picked.canceled) return { copied }
      const before = await snapshotSidecar(fs, parent)
      let at = typeof index === 'number' ? index : undefined
      for (const file of picked.filePaths) {
        try {
          if ((await nodeFs.stat(file)).size > MAX_READ_BYTES) throw new Error('That file is too large to import')
          const bytes = await nodeFs.readFile(file)
          const root = currentRoot
          const markdown =
            extname(file).toLowerCase() === '.docx' && root
              ? (await docxToMarkdown(bytes, { saveImage: async (name, data) => (await saveImage(fs, root, name, data, hashImage)).name })).markdown
              : importedMarkdown(basename(file), decodeImported(bytes, extname(file)))
          if (markdown === null) throw new Error('Not a type that can be imported')
          copied.push(await createSheet(fs, parent, markdown, at))
          if (at !== undefined) at++
        } catch {
          // One bad file does not stop the others; they are reported afterwards.
          skipped.push(basename(file))
        }
      }
      if (copied.length === 0) return { copied }
      // One undo step: trash every new sheet, then put the group's order back.
      const label = copied.length === 1 ? 'Import' : `Import of ${copied.length} files`
      return { copied, undo: { label, actions: [...copied.map((path): UndoAction => ({ kind: 'trash', path })), before] } }
    })
    return { ...result, skipped }
  })

  ipcMain.handle('templates:list', async () =>
    currentRoot ? listTemplates(fs, currentRoot) : []
  )

  ipcMain.handle('templates:save', async (_event, text: unknown) => {
    if (!currentRoot || typeof text !== 'string') throw new Error('No library is open')
    await saveAsTemplate(fs, currentRoot, text)
  })

  ipcMain.handle('op:newFromTemplate', (_event, group: unknown, template: unknown, index: unknown) =>
    change(async (root) => {
      const parent = inside(group, true)
      const source = inside(template)
      if (!source.startsWith(`${root}/.templates/`)) throw new Error('Not a template')
      const at = typeof index === 'number' ? index : undefined
      return { created: await createFromTemplate(fs, parent, source, new Date(), at) }
    })
  )

  ipcMain.handle('op:dailyNote', (_event, group: unknown) =>
    change(async (root) => {
      const parent = inside(group, true)
      return { created: (await dailyNote(fs, root, parent, new Date())).path }
    })
  )

  ipcMain.handle('op:createGroup', (_event, parent: unknown, name: unknown) =>
    change(async () => {
      const dir = inside(parent, true)
      const made = await createGroupUndoable(fs, dir, typeof name === 'string' ? name : undefined)
      return { created: made.path, undo: { label: dir === currentRoot ? 'New Project' : 'New Group', actions: made.undo } }
    })
  )

  ipcMain.handle('op:renameGroup', (_event, path: unknown, name: unknown) =>
    change(async () => {
      const from = inside(path)
      if (typeof name !== 'string') throw new Error('A group needs a name')
      const renamed = await renameGroupUndoable(fs, from, name)
      return { moved: [[from, renamed.path]], undo: renamed.undo.length > 0 ? { label: 'Rename', actions: renamed.undo } : undefined }
    })
  )

  ipcMain.handle('op:syncSheetNames', (_event, paths: unknown) =>
    change(async () => {
      if (!Array.isArray(paths)) throw new Error('No sheets given')
      const moved: [string, string][] = []
      for (const p of paths) {
        const from = inside(p)
        const to = await syncSheetName(fs, from)
        if (to !== from) moved.push([from, to])
      }
      return { moved }
    })
  )

  ipcMain.handle('op:move', (_event, paths: unknown, target: unknown, index: unknown) =>
    change(async () => {
      if (!Array.isArray(paths)) throw new Error('Nothing to move')
      const from = paths.map((p) => inside(p))
      const { paths: to, undo } = await moveNodesUndoable(
        fs,
        from,
        inside(target, true),
        typeof index === 'number' ? index : undefined
      )
      return {
        moved: from.map((p, i): [string, string] => [p, to[i]!]),
        undo: { label: 'Move', actions: undo }
      }
    })
  )

  ipcMain.handle('op:copy', (_event, paths: unknown, target: unknown, index: unknown, label: unknown) =>
    change(async () => {
      if (!Array.isArray(paths) || paths.length === 0) throw new Error('Nothing to copy')
      const { paths: to, undo } = await copyNodes(
        fs,
        paths.map((p) => inside(p)),
        inside(target, true),
        typeof index === 'number' ? index : undefined
      )
      return { copied: to, undo: { label: label === 'Duplicate' ? 'Duplicate' : 'Paste', actions: undo } }
    })
  )

  ipcMain.handle('op:delete', (_event, paths: unknown) =>
    change(async () => {
      if (!Array.isArray(paths) || paths.length === 0) throw new Error('Nothing to delete')
      const chosen = paths.map((p) => inside(p))
      const steps: UndoAction[][] = []
      for (const path of chosen) steps.push(await deleteNodeUndoable(fs, path))
      // Undo in the opposite order, so each sidecar is restored last-first.
      const label = chosen.length === 1 ? 'Delete' : `Delete of ${chosen.length} items`
      return { undo: { label, actions: steps.reverse().flat() } }
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

  ipcMain.handle('op:keywords', (_event, paths: unknown, add: unknown, remove: unknown) =>
    change(async () => {
      const list = (v: unknown): string[] =>
        Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []
      if (!Array.isArray(paths)) throw new Error('Select sheets first')
      return undoable(
        'Keywords',
        await changeKeywords(
          fs,
          paths.map((p) => inside(p)),
          list(add),
          list(remove)
        )
      )
    })
  )

  ipcMain.handle('op:setColor', (_event, path: unknown, color: unknown) =>
    change(async () => {
      if (typeof path !== 'string') throw new Error('Choose a group')
      if (color !== null && typeof color !== 'string') throw new Error('Unknown colour')
      return undoable('Colour', await setGroupColor(fs, inside(path), color))
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
      const moved = last.actions.flatMap((a): [string, string][] =>
        a.kind === 'rename' ? [[a.from, a.to]] : []
      )
      return { moved }
    })
    return { ...result, label: last.label }
  })
}

/** The scheme the editor loads library pictures through: `wa-asset://library/<file name>`. */
export const ASSET_SCHEME = 'wa-asset'

/** Must run before the app is ready. */
export function registerAssetScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

/** Serves pictures from the open library's assets folder, and nothing else. */
export function registerAssetProtocol(): void {
  protocol.handle(ASSET_SCHEME, async (request) => {
    const url = new URL(request.url)
    const name = assetNameFromUrl(`${ASSETS_DIR}/${url.pathname.replace(/^\//, '')}`)
    const mime = name ? imageMime(name) : undefined
    if (!currentRoot || !name || !mime) return new Response('Not found', { status: 404 })
    try {
      const bytes = await fs.readBinary(join(currentRoot, ASSETS_DIR, name))
      return new Response(Buffer.from(bytes), { headers: { 'content-type': mime } })
    } catch {
      return new Response('Not found', { status: 404 })
    }
  })
}
