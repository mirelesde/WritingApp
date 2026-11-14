import { BrowserWindow, Menu, clipboard, ipcMain, shell, type MenuItemConstructorOptions } from 'electron'
import { inside } from './library'

export type NodeMenuKind = 'sheet' | 'group' | 'root'
/** What the renderer is asked to do after a choice; reveal and copy happen here. */
export type NodeMenuAction = 'new-sheet' | 'new-group' | 'open-tab' | 'open-window' | 'rename' | 'move' | 'delete' | 'duplicate' | 'copy' | 'cut' | 'paste'

const isMac = process.platform === 'darwin'

/** The right-click menu for a sheet, a group or the library root. */
export function nodeMenuTemplate(
  kind: NodeMenuKind,
  choose: (action: NodeMenuAction) => void,
  reveal: () => void,
  copyPath: () => void,
  canPaste = false
): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = []
  if (kind !== 'sheet') {
    items.push(
      { label: 'New Sheet', click: () => choose('new-sheet') },
      { label: 'New Group', click: () => choose('new-group') },
      { type: 'separator' }
    )
  }
  if (kind === 'sheet') {
    items.push(
      { label: 'Open in New Tab', click: () => choose('open-tab') },
      { label: 'Open in New Window', click: () => choose('open-window') },
      { type: 'separator' }
    )
  }
  if (kind !== 'root') {
    if (kind === 'group') items.push({ label: 'Rename', click: () => choose('rename') })
    items.push(
      { label: 'Duplicate', click: () => choose('duplicate') },
      { type: 'separator' },
      { label: 'Cut', click: () => choose('cut') },
      { label: 'Copy', click: () => choose('copy') },
      { label: 'Paste', enabled: canPaste, click: () => choose('paste') },
      { type: 'separator' },
      { label: 'Move to…', click: () => choose('move') },
      { label: 'Move to Trash', click: () => choose('delete') },
      { type: 'separator' }
    )
  }
  if (kind === 'root') items.push({ label: 'Paste', enabled: canPaste, click: () => choose('paste') }, { type: 'separator' })
  items.push(
    { label: isMac ? 'Reveal in Finder' : 'Show in File Manager', click: reveal },
    { label: 'Copy Path', click: copyPath }
  )
  return items
}

export function registerNodeMenuIpc(): void {
  ipcMain.handle('menu:node', (event, kind: unknown, path: unknown, canPaste: unknown): Promise<NodeMenuAction | null> => {
    if (kind !== 'sheet' && kind !== 'group' && kind !== 'root') return Promise.resolve(null)
    const target = inside(path, true)
    return new Promise((resolve) => {
      let chosen: NodeMenuAction | null = null
      const menu = Menu.buildFromTemplate(
        nodeMenuTemplate(
          kind,
          (action) => (chosen = action),
          () => shell.showItemInFolder(target),
          () => clipboard.writeText(target),
          canPaste === true
        )
      )
      menu.popup({
        window: BrowserWindow.fromWebContents(event.sender) ?? undefined,
        // Menu items run before the close callback in Electron.
        callback: () => resolve(chosen)
      })
    })
  })
}
