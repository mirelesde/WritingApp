import { app, shell, BrowserWindow, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { attachEditMenu } from './editMenu'
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
    shell.openExternal(details.url)
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

function buildMenu(): Menu {
  const isMac = process.platform === 'darwin'
  return Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
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
    viewMenu(isMac),
    { role: 'windowMenu' }
  ])
}

app.whenReady().then(async () => {
  registerLibraryIpc()
  registerViewIpc()
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
