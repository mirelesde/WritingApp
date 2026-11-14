import { clipboard, ipcMain, shell, type WebContents } from 'electron'
import { inside } from './library'

/** The edit commands the in-app context menu may run on the focused text. */
const EDIT_COMMANDS = ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll'] as const
type EditCommand = (typeof EDIT_COMMANDS)[number]

/**
 * Right-click menus are drawn by the app, but a few things only the main process
 * can do: tell the window what the text under the pointer is (spelling), and run
 * the edit commands and the file-manager actions.
 */
export function attachContextMenu(contents: WebContents): void {
  contents.on('context-menu', (_event, params) => {
    if (!params.isEditable && !params.selectionText) return
    contents.send('context:edit', {
      x: params.x,
      y: params.y,
      misspelledWord: params.misspelledWord,
      suggestions: params.dictionarySuggestions,
      isEditable: params.isEditable,
      hasSelection: params.selectionText.length > 0
    })
  })
}

export function registerContextActions(): void {
  ipcMain.handle('context:editCommand', (event, command: unknown) => {
    if (!EDIT_COMMANDS.includes(command as EditCommand)) return
    event.sender[command as EditCommand]()
  })
  ipcMain.handle('context:replaceMisspelling', (event, word: unknown) => {
    if (typeof word === 'string') event.sender.replaceMisspelling(word)
  })
  ipcMain.handle('context:addToDictionary', (event, word: unknown) => {
    if (typeof word === 'string') event.sender.session.addWordToSpellCheckerDictionary(word)
  })
  ipcMain.handle('context:reveal', (_event, path: unknown) => {
    shell.showItemInFolder(inside(path, true))
  })
  ipcMain.handle('context:copyPath', (_event, path: unknown) => {
    clipboard.writeText(inside(path, true))
  })
}
