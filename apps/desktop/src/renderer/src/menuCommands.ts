import type { MenuCommand } from '../../preload/api'
import type { FormatKind } from './blockStyle'

/** What each menu command does; the app supplies the parts. */
export interface CommandActions {
  newTab(): void
  closeTab(): void
  reopenTab(): void
  cycleTab(delta: number): void
  save(): void
  saveAll(): void
  toggleSidebar(): void
  toggleSheets(): void
  newSheet(): void
  dailyNote(): void
  saveTemplate(): void
  openTemplates(): void
  moveTo(): void
  exportHtml(): void
  search(): void
  findReplace(): void
  quickOpen(): void
  commandPalette(): void
  distractionFree(): void
  preferences(): void
  insertTable(): void
  insertFootnote(): void
  insertContents(): void
  insertImage(): void
  cleanImages(): void
  resolveConflicts(): void
  goToFootnote(): void
  toggleTask(): void
  jumpHeading(direction: 'previous' | 'next'): void
  copySheets(cut: boolean): void
  pasteSheets(): void
  importFiles(): void
  fold(fold: boolean, all: boolean): void
  format(kind: FormatKind): void
  remove(): void
  duplicate(): void
  split(): void
  merge(): void
  glue(glued: boolean): void
  editKeywords(): void
  undo(): void
  newGroup(project: boolean): void
}

/** Runs a menu command. `format-…` commands name a format; the commands not listed make a group. */
export function runMenuCommand(command: MenuCommand, a: CommandActions): void {
  if (command.startsWith('format-')) return a.format(command.slice(7) as FormatKind)
  const table: Partial<Record<MenuCommand, () => void>> = {
    'new-tab': a.newTab,
    'close-tab': a.closeTab,
    'reopen-tab': a.reopenTab,
    'next-tab': () => a.cycleTab(1),
    'previous-tab': () => a.cycleTab(-1),
    save: a.save,
    'save-all': a.saveAll,
    'toggle-sidebar': a.toggleSidebar,
    'toggle-sheets': a.toggleSheets,
    'new-sheet': a.newSheet,
    'daily-note': a.dailyNote,
    'save-template': a.saveTemplate,
    'new-from-template': a.openTemplates,
    'move-to': a.moveTo,
    'export-html': a.exportHtml,
    search: a.search,
    'find-replace': a.findReplace,
    'quick-open': a.quickOpen,
    'command-palette': a.commandPalette,
    'distraction-free': a.distractionFree,
    preferences: a.preferences,
    'insert-table': a.insertTable,
    'insert-footnote': a.insertFootnote,
    'insert-contents': a.insertContents,
    'insert-image': a.insertImage,
    'clean-images': a.cleanImages,
    'resolve-conflicts': a.resolveConflicts,
    'go-to-footnote': a.goToFootnote,
    'toggle-task': a.toggleTask,
    'previous-heading': () => a.jumpHeading('previous'),
    'next-heading': () => a.jumpHeading('next'),
    'copy-sheets': () => a.copySheets(false),
    'cut-sheets': () => a.copySheets(true),
    'paste-sheets': a.pasteSheets,
    import: a.importFiles,
    'fold-section': () => a.fold(true, false),
    'unfold-section': () => a.fold(false, false),
    'fold-all': () => a.fold(true, true),
    'unfold-all': () => a.fold(false, true),
    delete: a.remove,
    duplicate: a.duplicate,
    split: a.split,
    merge: a.merge,
    glue: () => a.glue(true),
    unglue: () => a.glue(false),
    'edit-keywords': a.editKeywords,
    'undo-sheet-change': a.undo
  }
  const run = table[command]
  if (run) run()
  else a.newGroup(command === 'new-project')
}
