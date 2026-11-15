import type { MenuCommand } from '../../preload/api'
import type { SheetSort, ViewSettings } from '@writingapp/core'
import type { FormatKind } from './blockStyle'
import type { PaletteCommand } from './palette'

/** A formatting style, as the Format menu and the toolbar list it. */
export interface StyleEntry {
  kind: FormatKind
  label: string
  hint?: string
  keys?: string
}

/** Everything the command list depends on, and the ways its commands act. */
export interface PaletteInput {
  keyMod: string
  keyShift: string
  /** The Format menu's styles, grouped as shown. */
  styles: StyleEntry[][]
  sorts: [SheetSort, string][]
  templates: { name: string; path: string }[]
  unusedCount: number
  conflictCount: number
  zen: boolean
  /** The saved view settings, once loaded. */
  view: ViewSettings | null
  /** Runs a menu command. */
  command(command: MenuCommand): void
  setView(patch: Partial<ViewSettings>): void
  newFromTemplate(path: string): void
  toggleOutline(): void
}

/** The command palette's entries: every menu command and the quick view settings. */
export function buildPaletteCommands(input: PaletteInput): PaletteCommand[] {
  const { keyMod, keyShift, styles, sorts, templates, unusedCount, conflictCount, zen, view } =
    input
  const menu = (
    section: string,
    label: string,
    command: MenuCommand,
    shortcut?: string
  ): PaletteCommand => ({
    id: `${section}:${label}`,
    section,
    label,
    shortcut,
    run: () => input.command(command)
  })
  const setting = (
    section: string,
    label: string,
    patch: Partial<ViewSettings>
  ): PaletteCommand => ({
    id: `${section}:${label}`,
    section,
    label,
    run: () => input.setView(patch)
  })
  return [
    menu('File', 'New Sheet', 'new-sheet', `${keyMod}N`),
    ...templates.map((t) => ({
      id: `File:template:${t.path}`,
      section: 'File',
      label: `New Sheet from Template: ${t.name}`,
      run: () => input.newFromTemplate(t.path)
    })),
    menu(
      'File',
      unusedCount > 0 ? `Clean Up Unused Images… (${unusedCount})` : 'Clean Up Unused Images…',
      'clean-images'
    ),
    menu(
      'File',
      conflictCount > 0 ? `Resolve Sync Conflicts… (${conflictCount})` : 'Resolve Sync Conflicts…',
      'resolve-conflicts'
    ),
    menu('File', 'Import…', 'import'),
    menu('File', 'Daily Note', 'daily-note', `${keyMod}⌥D`),
    menu('File', 'Save Sheet as Template', 'save-template'),
    menu('File', 'New Group', 'new-group', `${keyMod}${keyShift}N`),
    menu('File', 'New Project', 'new-project', `${keyMod}⌥${keyShift}N`),
    menu('File', 'Duplicate', 'duplicate', `${keyMod}D`),
    menu('File', 'Find and Replace…', 'find-replace', `${keyMod}⌥F`),
    menu('Sheet', 'Copy Sheets', 'copy-sheets', `${keyMod}C`),
    menu('Sheet', 'Cut Sheets', 'cut-sheets', `${keyMod}X`),
    menu('Sheet', 'Paste Sheets', 'paste-sheets', `${keyMod}V`),
    menu('Format', 'Toggle Task', 'toggle-task', `${keyMod}↩`),
    menu('Fold', 'Go to Previous Heading', 'previous-heading', `${keyMod}⌥↑`),
    menu('Fold', 'Go to Next Heading', 'next-heading', `${keyMod}⌥↓`),
    menu('File', 'Move to…', 'move-to', `${keyMod}${keyShift}M`),
    menu('File', 'Move to Trash', 'delete', `${keyMod}⌥⌫`),
    menu('File', 'Quick Open…', 'quick-open', `${keyMod}P`),
    menu('File', 'Find in Library…', 'search', `${keyMod}${keyShift}F`),
    menu('File', 'Export…', 'export-html', `${keyMod}E`),
    menu('File', 'Preferences…', 'preferences', `${keyMod},`),
    menu('Sheet', 'Split at Cursor', 'split', `${keyMod}${keyShift}↩`),
    menu('Sheet', 'Merge Sheets', 'merge', `${keyMod}${keyShift}J`),
    menu('Sheet', 'Keywords…', 'edit-keywords', `${keyMod}⌥K`),
    menu('Sheet', 'Glue Sheets', 'glue', `${keyMod}${keyShift}G`),
    menu('Sheet', 'Unglue Sheets', 'unglue', `${keyMod}⌥G`),
    menu('Sheet', 'Undo Library Change', 'undo-sheet-change', `${keyMod}⌥Z`),
    ...styles
      .flat()
      .map((s) =>
        menu(
          'Format',
          s.label,
          `format-${s.kind}`,
          s.hint ? `${keyMod}⌥${s.hint}` : s.keys ? `${keyMod}${s.keys}` : undefined
        )
      ),
    menu('Format', 'Bold', 'format-bold', `${keyMod}B`),
    menu('Format', 'Italic', 'format-italic', `${keyMod}I`),
    menu('Format', 'Link', 'format-link', `${keyMod}K`),
    menu('Insert', 'Table', 'insert-table'),
    menu('Insert', 'Image…', 'insert-image', `${keyMod}⌥I`),
    menu('Insert', 'Footnote', 'insert-footnote'),
    menu('Insert', 'Table of Contents', 'insert-contents'),
    menu('Insert', 'Go to Footnote', 'go-to-footnote', `${keyMod}⌥J`),
    menu('Fold', 'Fold All Sections', 'fold-all'),
    menu('Fold', 'Unfold All Sections', 'unfold-all'),
    menu('View', 'Toggle Sidebar', 'toggle-sidebar', `${keyMod}\\`),
    menu('View', 'Toggle Sheet List', 'toggle-sheets'),
    menu(
      'View',
      zen ? 'Leave Distraction-Free Mode' : 'Distraction-Free Mode',
      'distraction-free',
      `${keyMod}${keyShift}D`
    ),
    {
      id: 'View:outline',
      section: 'View',
      label: 'Toggle Outline',
      shortcut: `${keyMod}⌥O`,
      run: input.toggleOutline
    },
    {
      ...setting('View', `${view?.focusMode ? 'Turn off' : 'Turn on'} Focus Mode`, {
        focusMode: !view?.focusMode
      }),
      shortcut: `${keyMod}${keyShift}L`
    },
    setting('View', `${view?.typewriter ? 'Turn off' : 'Turn on'} Typewriter Scrolling`, {
      typewriter: !view?.typewriter
    }),
    setting('View', `${view?.lineNumbers ? 'Hide' : 'Show'} Line Numbers`, {
      lineNumbers: !view?.lineNumbers
    }),
    setting('View', 'Light Theme', { theme: 'light' }),
    setting('View', 'Dark Theme', { theme: 'dark' }),
    setting('View', 'Match System Theme', { theme: 'system' }),
    setting('View', 'Serif Font', { font: 'serif' }),
    setting('View', 'Sans-serif Font', { font: 'sans' }),
    setting('View', 'Monospace Font', { font: 'mono' }),
    {
      ...setting('View', 'Larger Text', { fontSize: (view?.fontSize ?? 18) + 1 }),
      shortcut: `${keyMod}+`
    },
    {
      ...setting('View', 'Smaller Text', { fontSize: (view?.fontSize ?? 18) - 1 }),
      shortcut: `${keyMod}-`
    },
    ...sorts.map(([value, label]) => setting('Sort', `Sheets by ${label}`, { sheetSort: value }))
  ]
}
