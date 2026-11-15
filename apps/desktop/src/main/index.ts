import { app, shell, BrowserWindow, Menu, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { attachContextMenu, registerContextActions } from './contextActions'
import { logError, logUncaught, recoverFromCrashes, showErrorLog } from './crash'
import { registerThemeIpc } from './themes'
import { registerExportStyleIpc } from './exportStyles'
import { loadView, registerViewIpc, viewMenu } from './view'
import {
  chooseLibrary,
  clearRecent,
  loadRecent,
  openRecentLibrary,
  recentLibraries,
  registerAssetProtocol,
  registerAssetScheme,
  registerLibraryIpc,
  inside
} from './library'

registerAssetScheme()

/** Sheets that a new window should open, by the window's web contents. */
const pendingSheet = new Map<number, string>()

/**
 * Opens a window on the library. Every window shares the one library, so
 * a window needs no setup beyond this; `sheet` is what it opens first.
 */
/** How long closing a window waits for unsaved text to reach disk. */
const SAVE_ON_CLOSE_MS = 4000
/** Windows waiting to close, by web contents id, and what finishes the close. */
const closers = new Map<number, () => void>()
// What to do when the window asks the user first (stop waiting), or the user keeps it open.
const holders = new Map<number, () => void>()
const cancellers = new Map<number, () => void>()
let quitting = false

function createWindow(sheet?: string, where?: { x: number; y: number }): void {
  // Cascade from the window in front, so a new one does not hide it exactly.
  const front = BrowserWindow.getFocusedWindow()
  const at = where ? [where.x, where.y] : front && !front.isMaximized() && !front.isFullScreen() ? front.getPosition() : undefined
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    ...(at ? { x: at[0]! + 26, y: at[1]! + 26 } : {}),
    show: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    // macOS: no title bar, traffic lights inside the sidebar, translucent sidebar.
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 18, y: 13 },
          vibrancy: 'sidebar' as const,
          visualEffectState: 'active' as const
        }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      spellcheck: true
    }
  })

  attachContextMenu(mainWindow.webContents)
  recoverFromCrashes(mainWindow)
  const id = mainWindow.webContents.id
  if (sheet) pendingSheet.set(id, sheet)
  mainWindow.on('closed', () => {
    pendingSheet.delete(id)
    closers.delete(id)
    holders.delete(id)
    cancellers.delete(id)
    // A quit that was held back while this window saved carries on with the rest.
    if (quitting) app.quit()
  })
  // Closing waits for the editor to finish saving (a keystroke a moment ago may
  // still be on its way to disk), but never for more than a few seconds.
  let saved = false
  const closeNow = (): void => {
    saved = true
    if (!mainWindow.isDestroyed()) mainWindow.close()
  }
  mainWindow.on('close', (event) => {
    const contents = mainWindow.webContents
    if (saved || contents.isDestroyed() || contents.isCrashed() || contents.isLoading()) return
    event.preventDefault()
    if (closers.has(id)) return
    closers.set(id, closeNow)
    const timer = setTimeout(closeNow, SAVE_ON_CLOSE_MS)
    holders.set(id, () => clearTimeout(timer))
    cancellers.set(id, () => {
      clearTimeout(timer)
      closers.delete(id)
      // A quit that was waiting on this window is off.
      quitting = false
    })
    contents.send('window:flush')
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // Only web and mail addresses leave the app; anything else is ignored.
    if (/^(https?:\/\/|mailto:)/i.test(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // A file dropped outside the editor must not turn the window into that file.
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow.webContents.getURL().split('#')[0]
    if (url.split('#')[0] !== current) event.preventDefault()
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
/** The library is shared, so every window switches to a newly opened one. */
function announceLibrary(library: unknown): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('library:opened', library)
}

function sendCommand(command: string): void {
  BrowserWindow.getFocusedWindow()?.webContents.send('menu:command', command)
}

/**
 * A shortcut the editor handles itself. macOS can show it in the menu without
 * registering it; elsewhere it is left out, or the key would fire twice.
 */
function shown(accelerator: string): { accelerator?: string; registerAccelerator?: boolean } {
  return process.platform === 'darwin' ? { accelerator, registerAccelerator: false } : {}
}

function buildMenu(): Menu {
  const isMac = process.platform === 'darwin'
  return Menu.buildFromTemplate([
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              {
                label: 'Preferences…',
                accelerator: 'CmdOrCtrl+,',
                click: () => sendCommand('preferences')
              },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Library…',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const library = await chooseLibrary(BrowserWindow.getFocusedWindow() ?? undefined)
            if (library) announceLibrary(library)
          }
        },
        {
          label: 'Open Recent',
          submenu: [
            ...recentLibraries().map((path) => ({
              label: path,
              click: async () => {
                const library = await openRecentLibrary(path)
                if (library) announceLibrary(library)
              }
            })),
            ...(recentLibraries().length > 0 ? [{ type: 'separator' as const }] : []),
            {
              label: 'Clear Menu',
              enabled: recentLibraries().length > 0,
              click: () => void clearRecent()
            }
          ]
        },
        { type: 'separator' },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+Alt+N',
          click: () => createWindow()
        },
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => sendCommand('new-tab')
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => sendCommand('close-tab')
        },
        { type: 'separator' },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendCommand('save')
        },
        {
          label: 'Save All',
          accelerator: 'CmdOrCtrl+Alt+S',
          click: () => sendCommand('save-all')
        },
        { type: 'separator' },
        {
          label: 'New Sheet',
          accelerator: 'CmdOrCtrl+N',
          click: () => sendCommand('new-sheet')
        },
        {
          label: 'New Group',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => sendCommand('new-group')
        },
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+Alt+Shift+N',
          click: () => sendCommand('new-project')
        },
        {
          label: 'New Sheet from Template…',
          click: () => sendCommand('new-from-template')
        },
        {
          label: 'Daily Note',
          accelerator: 'CmdOrCtrl+Alt+D',
          click: () => sendCommand('daily-note')
        },
        {
          label: 'Save Sheet as Template',
          click: () => sendCommand('save-template')
        },
        { type: 'separator' },
        {
          label: 'Duplicate',
          click: () => sendCommand('duplicate')
        },
        {
          label: 'Move to…',
          accelerator: 'CmdOrCtrl+Shift+M',
          click: () => sendCommand('move-to')
        },
        {
          label: 'Move to Trash',
          accelerator: 'CmdOrCtrl+Alt+Backspace',
          click: () => sendCommand('delete')
        },
        { type: 'separator' },
        {
          label: 'Quick Open…',
          accelerator: 'CmdOrCtrl+P',
          click: () => sendCommand('quick-open')
        },
        {
          label: 'Command Palette…',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => sendCommand('command-palette')
        },
        {
          label: 'Find in Library…',
          accelerator: 'CmdOrCtrl+Shift+F',
          click: () => sendCommand('search')
        },
        { label: 'Find and Replace…', ...shown('CmdOrCtrl+Alt+F'), click: () => sendCommand('find-replace') },
        { type: 'separator' },
        { label: 'Import…', click: () => sendCommand('import') },
        { label: 'Clean Up Unused Images…', click: () => sendCommand('clean-images') },
        { label: 'Resolve Sync Conflicts…', click: () => sendCommand('resolve-conflicts') },
        {
          label: 'Export…',
          accelerator: 'CmdOrCtrl+E',
          click: () => sendCommand('export-html')
        },
        { type: 'separator' },
        ...(isMac
          ? []
          : [
              {
                label: 'Preferences…',
                accelerator: 'CmdOrCtrl+,',
                click: () => sendCommand('preferences')
              },
              { type: 'separator' as const }
            ]),
        {
          label: 'Close Window',
          accelerator: 'CmdOrCtrl+Shift+W',
          click: () => BrowserWindow.getFocusedWindow()?.close()
        },
        ...(isMac ? [] : [{ role: 'quit' as const }])
      ]
    },
    {
      label: 'Sheet',
      submenu: [
        {
          label: 'Split at Cursor',
          accelerator: 'CmdOrCtrl+Shift+Enter',
          click: () => sendCommand('split')
        },
        {
          label: 'Merge Sheets',
          accelerator: 'CmdOrCtrl+Shift+J',
          click: () => sendCommand('merge')
        },
        { type: 'separator' },
        {
          label: 'Glue Sheets',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => sendCommand('glue')
        },
        {
          label: 'Unglue Sheets',
          accelerator: 'CmdOrCtrl+Alt+G',
          click: () => sendCommand('unglue')
        },
        { type: 'separator' },
        {
          label: 'Keywords…',
          accelerator: 'CmdOrCtrl+Alt+K',
          click: () => sendCommand('edit-keywords')
        },
        { type: 'separator' },
        {
          label: 'Undo Library Change',
          accelerator: 'CmdOrCtrl+Alt+Z',
          click: () => sendCommand('undo-sheet-change')
        }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'Format',
      submenu: [
        { label: 'Heading 1', ...shown('CmdOrCtrl+Alt+1'), click: () => sendCommand('format-h1') },
        { label: 'Heading 2', ...shown('CmdOrCtrl+Alt+2'), click: () => sendCommand('format-h2') },
        { label: 'Heading 3', ...shown('CmdOrCtrl+Alt+3'), click: () => sendCommand('format-h3') },
        { label: 'Body Text', ...shown('CmdOrCtrl+Alt+4'), click: () => sendCommand('format-body') },
        { type: 'separator' },
        { label: 'Quote', click: () => sendCommand('format-quote') },
        { label: 'Bulleted List', click: () => sendCommand('format-bullet') },
        { label: 'Numbered List', click: () => sendCommand('format-numbered') },
        { label: 'Task List', click: () => sendCommand('format-task') },
        { type: 'separator' },
        { label: 'Bold', ...shown('CmdOrCtrl+B'), click: () => sendCommand('format-bold') },
        { label: 'Italic', ...shown('CmdOrCtrl+I'), click: () => sendCommand('format-italic') },
        { label: 'Strikethrough', click: () => sendCommand('format-strike') },
        { label: 'Highlight', click: () => sendCommand('format-highlight') },
        { label: 'Inline Code', click: () => sendCommand('format-code') },
        { label: 'Link', ...shown('CmdOrCtrl+K'), click: () => sendCommand('format-link') },
        { type: 'separator' },
        { label: 'Toggle Task', ...shown('CmdOrCtrl+Return'), click: () => sendCommand('toggle-task') },
        { label: 'Code Block', click: () => sendCommand('format-codeblock') },
        { label: 'Comment', ...shown('CmdOrCtrl+/'), click: () => sendCommand('format-comment') },
        { label: 'Horizontal Rule', click: () => sendCommand('format-rule') }
      ]
    },
    {
      label: 'Fold',
      submenu: [
        { label: 'Fold Section', ...shown('CmdOrCtrl+Alt+['), click: () => sendCommand('fold-section') },
        { label: 'Unfold Section', ...shown('CmdOrCtrl+Alt+]'), click: () => sendCommand('unfold-section') },
        { type: 'separator' },
        { label: 'Go to Previous Heading', ...shown('CmdOrCtrl+Alt+Up'), click: () => sendCommand('previous-heading') },
        { label: 'Go to Next Heading', ...shown('CmdOrCtrl+Alt+Down'), click: () => sendCommand('next-heading') },
        { type: 'separator' },
        { label: 'Fold All Sections', click: () => sendCommand('fold-all') },
        { label: 'Unfold All Sections', click: () => sendCommand('unfold-all') }
      ]
    },
    {
      label: 'Insert',
      submenu: [
        { label: 'Table', click: () => sendCommand('insert-table') },
        { label: 'Image…', accelerator: 'CmdOrCtrl+Alt+I', click: () => sendCommand('insert-image') },
        { label: 'Footnote', click: () => sendCommand('insert-footnote') },
        { label: 'Table of Contents', click: () => sendCommand('insert-contents') },
        { label: 'Go to Footnote', ...shown('CmdOrCtrl+Alt+J'), click: () => sendCommand('go-to-footnote') }
      ]
    },
    viewMenu(isMac),
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        {
          label: 'Next Tab',
          accelerator: 'CmdOrCtrl+Alt+Right',
          click: () => sendCommand('next-tab')
        },
        {
          label: 'Previous Tab',
          accelerator: 'CmdOrCtrl+Alt+Left',
          click: () => sendCommand('previous-tab')
        },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : [])
      ]
    },
    {
      label: 'Help',
      role: 'help',
      submenu: [{ label: 'Show Error Log', click: () => void showErrorLog() }]
    }
  ])
}

logUncaught()

app.whenReady().then(async () => {
  registerLibraryIpc()
  registerAssetProtocol()
  registerViewIpc()
  registerContextActions()
  ipcMain.handle('log:error', (_event, what: unknown, detail: unknown) => {
    if (typeof what === 'string') void logError(`renderer: ${what.slice(0, 200)}`, typeof detail === 'string' ? detail.slice(0, 2000) : '')
  })
  registerThemeIpc()
  registerExportStyleIpc()
  ipcMain.handle('window:new', (_event, sheet: unknown, where: unknown) => {
    const w = where as { x?: unknown; y?: unknown } | undefined
    const at =
      w && Number.isFinite(w.x) && Number.isFinite(w.y)
        ? { x: Math.round(w.x as number) - 26, y: Math.round(w.y as number) - 26 }
        : undefined
    createWindow(typeof sheet === 'string' ? inside(sheet) : undefined, at)
  })
  // A new window asks once, on start-up, which sheet it was opened for.
  ipcMain.handle('window:initialSheet', (event) => {
    const sheet = pendingSheet.get(event.sender.id) ?? null
    pendingSheet.delete(event.sender.id)
    return sheet
  })
  ipcMain.on('window:flushed', (event) => closers.get(event.sender.id)?.())
  ipcMain.on('window:holdClose', (event) => holders.get(event.sender.id)?.())
  ipcMain.on('window:closeCancelled', (event) => cancellers.get(event.sender.id)?.())
  app.on('before-quit', () => (quitting = true))
  ipcMain.handle('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close())
  const rebuild = (): void => Menu.setApplicationMenu(buildMenu())
  await loadView(rebuild)
  await loadRecent(rebuild)
  Menu.setApplicationMenu(buildMenu())

  // Set app user model id for windows
  electronApp.setAppUserModelId('com.writingapp.desktop')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
