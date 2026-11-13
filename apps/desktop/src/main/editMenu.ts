import { Menu, type MenuItemConstructorOptions, type WebContents } from 'electron'

/** What the context-menu event tells us that the menu depends on. */
export interface EditMenuInput {
  misspelledWord: string
  suggestions: string[]
  isEditable: boolean
  hasSelection: boolean
}

/** Operations the menu can trigger, so the template can be built without Electron. */
export interface EditMenuActions {
  replaceMisspelling: (word: string) => void
  addToDictionary: (word: string) => void
}

const MAX_SUGGESTIONS = 5

/**
 * The right-click menu for editable text: spelling suggestions first (when the
 * word under the pointer is misspelled), then the usual edit commands.
 */
export function editMenuTemplate(
  input: EditMenuInput,
  actions: EditMenuActions
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = []

  if (input.isEditable && input.misspelledWord) {
    const suggestions = input.suggestions.slice(0, MAX_SUGGESTIONS)
    if (suggestions.length === 0) {
      template.push({ label: 'No Spelling Suggestions', enabled: false })
    }
    for (const word of suggestions) {
      template.push({ label: word, click: () => actions.replaceMisspelling(word) })
    }
    template.push({
      label: 'Add to Dictionary',
      click: () => actions.addToDictionary(input.misspelledWord)
    })
    template.push({ type: 'separator' })
  }

  if (input.isEditable) {
    template.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' })
  }
  if (input.isEditable || input.hasSelection) template.push({ role: 'copy' })
  if (input.isEditable) template.push({ role: 'paste' })
  template.push({ role: 'selectAll' })
  return template
}

/** Shows the edit menu, with spelling suggestions, when the user right-clicks the editor. */
export function attachEditMenu(contents: WebContents): void {
  contents.on('context-menu', (_event, params) => {
    if (!params.isEditable && !params.selectionText) return
    const template = editMenuTemplate(
      {
        misspelledWord: params.misspelledWord,
        suggestions: params.dictionarySuggestions,
        isEditable: params.isEditable,
        hasSelection: params.selectionText.length > 0
      },
      {
        replaceMisspelling: (word) => contents.replaceMisspelling(word),
        addToDictionary: (word) => contents.session.addWordToSpellCheckerDictionary(word)
      }
    )
    Menu.buildFromTemplate(template).popup()
  })
}
