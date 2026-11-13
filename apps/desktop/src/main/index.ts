import { app, shell, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { attachEditMenu } from './editMenu'
import { registerNodeMenuIpc } from './nodeMenu'
import { registerThemeIpc } from './themes'
import { loadView, registerViewIpc, viewMenu } from './view'
import {
  chooseLibrary,
  clearRecent,
  loadRecent,
  openRecentLibrary,
  recentLibraries,
  registerLibraryIpc
} from './library'

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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

  attachEditMenu(mainWindow.webContents)

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    // Only web and mail addresses leave the app; anything else is ignored.
    if (/^(https?:\/\/|mailto:)/i.test(details.url)) void shell.openExternal(details.url)
    return { action: 'deny' }
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
            const target = BrowserWindow.getFocusedWindow() ?? undefined
            const library = await chooseLibrary(target)
            if (library && target) target.webContents.send('library:opened', library)
          }
        },
        {
          label: 'Open Recent',
          submenu: [
            ...recentLibraries().map((path) => ({
              label: path,
              click: async () => {
                const target = BrowserWindow.getFocusedWindow() ?? undefined
                const library = await openRecentLibrary(path)
                if (library && target) target.webContents.send('library:opened', library)
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
        { type: 'separator' },
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
        { type: 'separator' },
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
        isMac ? { role: 'close' } : { role: 'quit' }
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
        { label: 'Inline Code', click: () => sendCommand('format-code') },
        { label: 'Link', ...shown('CmdOrCtrl+K'), click: () => sendCommand('format-link') },
        { type: 'separator' },
        { label: 'Code Block', click: () => sendCommand('format-codeblock') },
        { label: 'Comment', ...shown('CmdOrCtrl+/'), click: () => sendCommand('format-comment') },
        { label: 'Horizontal Rule', click: () => sendCommand('format-rule') }
      ]
    },
    viewMenu(isMac),
    { role: 'windowMenu' }
  ])
}

app.whenReady().then(async () => {
  registerLibraryIpc()
  registerViewIpc()
  registerNodeMenuIpc()
  registerThemeIpc()
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
