/** One row of an in-app context menu. */
export interface MenuItem {
  label?: string
  /** What the row does when chosen; the owner of the menu decides what that means. */
  action?: string
  /** A payload for the action, such as the spelling suggestion picked. */
  value?: string
  disabled?: boolean
  separator?: boolean
  /** A keyboard shortcut shown at the right. */
  hint?: string
}

const SEPARATOR: MenuItem = { separator: true }

export type NodeKind = 'sheet' | 'group' | 'root'

/** The right-click menu for a sheet, a group or the library root. */
export function nodeMenuItems(kind: NodeKind, canPaste: boolean, mac: boolean): MenuItem[] {
  const items: MenuItem[] = []
  if (kind !== 'sheet') {
    items.push({ label: 'New Sheet', action: 'new-sheet' }, { label: 'New Group', action: 'new-group' }, SEPARATOR)
  }
  if (kind === 'sheet') {
    items.push(
      { label: 'Open in New Tab', action: 'open-tab' },
      { label: 'Open in New Window', action: 'open-window' },
      SEPARATOR,
      { label: 'Keywords…', action: 'keywords' },
      SEPARATOR
    )
  }
  if (kind !== 'root') {
    if (kind === 'group') items.push({ label: 'Rename', action: 'rename' })
    items.push(
      { label: 'Duplicate', action: 'duplicate' },
      SEPARATOR,
      { label: 'Cut', action: 'cut' },
      { label: 'Copy', action: 'copy' },
      { label: 'Paste', action: 'paste', disabled: !canPaste },
      SEPARATOR,
      { label: 'Move to…', action: 'move' },
      { label: 'Move to Trash', action: 'delete' },
      SEPARATOR
    )
  }
  if (kind === 'root') items.push({ label: 'Paste', action: 'paste', disabled: !canPaste }, SEPARATOR)
  items.push(
    { label: mac ? 'Reveal in Finder' : 'Show in File Manager', action: 'reveal' },
    { label: 'Copy Path', action: 'copy-path' }
  )
  return items
}

/** What the editor's context-menu event tells us. */
export interface EditMenuInput {
  misspelledWord: string
  suggestions: string[]
  isEditable: boolean
  hasSelection: boolean
}

const MAX_SUGGESTIONS = 5

/** The right-click menu for text: spelling help for a misspelled word, then the edit commands. */
export function editMenuItems(input: EditMenuInput, mac: boolean): MenuItem[] {
  const mod = mac ? '⌘' : 'Ctrl+'
  const items: MenuItem[] = []
  if (input.isEditable && input.misspelledWord) {
    const suggestions = input.suggestions.slice(0, MAX_SUGGESTIONS)
    if (suggestions.length === 0) items.push({ label: 'No Spelling Suggestions', disabled: true })
    for (const word of suggestions) items.push({ label: word, action: 'replace-misspelling', value: word })
    items.push({ label: 'Add to Dictionary', action: 'add-to-dictionary', value: input.misspelledWord }, SEPARATOR)
  }
  if (input.isEditable) {
    items.push(
      { label: 'Undo', action: 'undo', hint: `${mod}Z` },
      { label: 'Redo', action: 'redo', hint: mac ? '⇧⌘Z' : 'Ctrl+Shift+Z' },
      SEPARATOR,
      { label: 'Cut', action: 'cut', hint: `${mod}X`, disabled: !input.hasSelection }
    )
  }
  if (input.isEditable || input.hasSelection) {
    items.push({ label: 'Copy', action: 'copy', hint: `${mod}C`, disabled: !input.hasSelection })
  }
  if (input.isEditable) items.push({ label: 'Paste', action: 'paste', hint: `${mod}V` })
  items.push({ label: 'Select All', action: 'select-all', hint: `${mod}A` })
  return items
}
