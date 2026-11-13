import { BrowserWindow, ipcMain, nativeTheme, type MenuItemConstructorOptions } from 'electron'
import {
  clampFontSize,
  FONTS,
  parseViewSettings,
  resolveView,
  THEMES,
  type Font,
  type Theme,
  type ViewSettings
} from '@writingapp/core'
import { appSettings } from './library'

let current: ViewSettings = resolveView()
let onChange: () => void = () => {}

export function currentView(): ViewSettings {
  return current
}

/** Loads the saved view settings; call once settings can be read. */
export async function loadView(rebuildMenu: () => void): Promise<void> {
  onChange = rebuildMenu
  current = resolveView((await appSettings().load()).view)
  nativeTheme.themeSource = current.theme
}

async function apply(patch: Partial<ViewSettings>): Promise<ViewSettings> {
  const valid = parseViewSettings({ ...current, ...patch })
  current = resolveView(valid)
  nativeTheme.themeSource = current.theme
  await appSettings().update({ view: patch })
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send('view:changed', current)
  onChange()
  return current
}

export function registerViewIpc(): void {
  ipcMain.handle('view:get', () => current)
  ipcMain.handle('view:set', (_event, patch: unknown) => apply(parseViewSettings(patch)))
}

/** Changes a setting from the menu. */
export function setView(patch: Partial<ViewSettings>): void {
  void apply(patch)
}

const label = (name: string): string => name[0]!.toUpperCase() + name.slice(1)

/** The View menu: theme, editor font and text size, then the window controls. */
export function viewMenu(isMac: boolean): MenuItemConstructorOptions {
  const themeNames: Record<Theme, string> = { system: 'Match System', light: 'Light', dark: 'Dark' }
  return {
    label: 'View',
    submenu: [
      {
        label: 'Toggle Sidebar',
        accelerator: 'CmdOrCtrl+\\',
        click: () =>
          BrowserWindow.getFocusedWindow()?.webContents.send('menu:command', 'toggle-sidebar')
      },
      {
        label: 'Show Outline',
        type: 'checkbox',
        accelerator: 'CmdOrCtrl+Alt+O',
        checked: current.outline,
        click: () => setView({ outline: !current.outline })
      },
      {
        label: 'Focus Mode',
        type: 'checkbox',
        accelerator: 'CmdOrCtrl+Shift+L',
        checked: current.focusMode,
        click: () => setView({ focusMode: !current.focusMode })
      },
      {
        label: 'Typewriter Scrolling',
        type: 'checkbox',
        checked: current.typewriter,
        click: () => setView({ typewriter: !current.typewriter })
      },
      { type: 'separator' },
      {
        label: 'Theme',
        submenu: THEMES.map((theme) => ({
          label: themeNames[theme],
          type: 'radio' as const,
          checked: current.theme === theme,
          click: () => setView({ theme })
        }))
      },
      {
        label: 'Editor Font',
        submenu: FONTS.map((font: Font) => ({
          label: label(font === 'sans' ? 'sans-serif' : font),
          type: 'radio' as const,
          checked: current.font === font,
          click: () => setView({ font })
        }))
      },
      {
        label: 'Larger Text',
        accelerator: 'CmdOrCtrl+Plus',
        click: () => setView({ fontSize: clampFontSize(current.fontSize + 1) })
      },
      {
        label: 'Smaller Text',
        accelerator: 'CmdOrCtrl+-',
        click: () => setView({ fontSize: clampFontSize(current.fontSize - 1) })
      },
      {
        label: 'Default Text Size',
        accelerator: 'CmdOrCtrl+0',
        click: () => setView({ fontSize: 18 })
      },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      ...(isMac ? [] : [{ role: 'toggleDevTools' as const }]),
      { role: 'reload' }
    ]
  }
}
