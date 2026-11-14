import type { ColorTheme, ExportStyleDef, GroupNode, SearchHit, SearchOptions, ViewSettings } from '@writingapp/core'

/** A loaded library: where it lives and its tree. */
export interface LibraryInfo {
  path: string
  tree: GroupNode
}

/** The result of changing the library structure. */
export interface OpResult {
  /** The library as it is now. */
  library: LibraryInfo
  /** Everything whose path changed, as [from, to]. A group's contents move with it. */
  moved: [string, string][]
  /** The path of the sheet or group that was created, or of the sheet holding a merge. */
  created?: string
  /** For an undo: what was undone. */
  label?: string
  /** For a replace: how many matches were changed. */
  replaced?: number
  /** Paths of the copies a copy or duplicate made, in the order given. */
  copied?: string[]
  /** For an import: names of files that could not be imported. */
  skipped?: string[]
}

export type MenuCommand =
  | 'new-sheet'
  | 'new-group'
  | 'new-project'
  | 'move-to'
  | 'export-html'
  | 'search'
  | 'quick-open'
  | 'command-palette'
  | 'distraction-free'
  | 'preferences'
  | 'split'
  | 'merge'
  | 'glue'
  | 'unglue'
  | 'undo-sheet-change'
  | 'import'
  | 'fold-all'
  | 'unfold-all'
  | 'fold-section'
  | 'unfold-section'
  | 'delete'
  | 'duplicate'
  | 'toggle-sidebar'
  | 'daily-note'
  | 'save-template'
  | 'new-from-template'
  | 'toggle-sheets'
  | 'insert-table'
  | 'insert-footnote'
  | 'go-to-footnote'
  | 'insert-image'
  | 'clean-images'
  | 'resolve-conflicts'
  | 'new-tab'
  | 'close-tab'
  | 'next-tab'
  | 'previous-tab'
  /** A Format menu item, e.g. `format-h1`. */
  | `format-${string}`

/** Text that never reached its sheet, found at launch (see the journal in the main process). */
export interface RecoveredSheet {
  path: string
  text: string
  disk: string
  savedAt: number
}

/** A preview of an HTML export. */
export interface ExportPreview {
  title: string
  html: string
  sheets: number
  /** Library pictures the export uses, and their total size in bytes. */
  images: string[]
  imageBytes: number
}

/** Page layout for a PDF export. */
export interface PdfOptions {
  pageSize: 'A4' | 'Letter'
  margin: 'narrow' | 'normal' | 'wide'
  pageNumbers: boolean
}

/** What the main process offers the UI as `window.api`. */
export interface Api {
  /** The remembered library, or null if there is none or it cannot be opened. */
  getLibrary(): Promise<LibraryInfo | null>
  /** Shows the folder picker. Null if cancelled or the folder cannot be opened. */
  chooseLibrary(): Promise<LibraryInfo | null>
  /** The text of a sheet in the open library. */
  readSheet(path: string): Promise<string>
  /** Replaces the text of an existing sheet in the open library. */
  writeSheet(path: string, text: string): Promise<void>
  /** Creates a sheet in a group, at `index` among its children (default: the end). */
  createSheet(group: string, index?: number): Promise<OpResult>
  /** The templates kept in the library's hidden `.templates` folder. */
  listTemplates(): Promise<{ name: string; path: string }[]>
  /** Keeps text as a new template. */
  saveTemplate(text: string): Promise<void>
  /** Creates a sheet in a group from a template, filling in its dates. */
  newFromTemplate(group: string, template: string, index?: number): Promise<OpResult>
  /** Opens today's sheet in a group, creating it first if needed. */
  dailyNote(group: string): Promise<OpResult>
  /** Creates a group inside `parent` (at the library root, a project). */
  createGroup(parent: string, name?: string): Promise<OpResult>
  /** Renames a group. Rejects if a sibling already has the name. */
  renameGroup(path: string, name: string): Promise<OpResult>
  /** Renames sheet files to follow their titles; `moved` lists the ones that changed. */
  syncSheetNames(paths: string[]): Promise<OpResult>
  /** Moves sheets or groups sharing one parent into `target` as a block. */
  move(paths: string[], target: string, index?: number): Promise<OpResult>
  /** Copies sheets or groups into a group; `label` names the undo step. */
  /** Asks for .txt, .rtf and Markdown files and adds them to a group as sheets; null (none if cancelled). `copied` lists the new sheets. */
  importFiles(group: string, index?: number): Promise<OpResult>
  /** Asks for picture files, copies them into the library, and returns the Markdown for each. */
  chooseImages(): Promise<string[]>
  /** Saves picture bytes (a pasted image) in the library and returns its Markdown. */
  saveImage(name: string, data: Uint8Array): Promise<string>
  /** Pictures in the library's assets folder that no sheet mentions. */
  unusedImages(): Promise<{ name: string; size: number }[]>
  /** Moves these pictures to the system trash, if they are still unused. Returns how many. */
  trashUnusedImages(names: string[]): Promise<number>
  copy(paths: string[], target: string, index?: number, label?: 'Duplicate' | 'Paste'): Promise<OpResult>
  /** Splits a sheet, given its current text, at `offset`; the tail becomes the next sheet. */
  split(path: string, text: string, offset: number): Promise<OpResult>
  /** Merges sheets of one group into the first of them. */
  merge(paths: string[]): Promise<OpResult>
  /** Glues sheets so they read as one run. */
  glue(paths: string[]): Promise<OpResult>
  /** Colours a project or group's icon; null clears it. */
  setColor(path: string, color: string | null): Promise<OpResult>
  /** Detaches sheets from the runs they are in. */
  unglue(paths: string[]): Promise<OpResult>
  /** Moves sheets or groups to the system trash; undoable. */
  deleteNodes(paths: string[]): Promise<OpResult>
  /** Reverses the latest move, delete, split, merge, glue or unglue. Rejects if there is none. */
  undo(): Promise<OpResult>
  /** Sheets containing `query`, in library order. */
  search(query: string, options?: SearchOptions): Promise<SearchHit[]>
  /** Replaces a query in every sheet that has it, or only in `only`; one undo step. */
  replaceAll(query: string, replacement: string, only?: string[], options?: SearchOptions): Promise<OpResult>
  /** Total words in a group's sheets, including sub-groups. */
  groupWords(path: string): Promise<number>
  /** Builds the HTML export of the given sheets and groups, without saving it. */
  previewExport(paths: string[]): Promise<ExportPreview>
  /** Asks where to save, then writes the export. Null if the dialog was cancelled. */
  saveExport(paths: string[], pictures?: 'embed' | 'folder', css?: string): Promise<string | null>
  /** Asks where to save, then writes the export as a paginated PDF. Null if cancelled. */
  /** Asks where to save, writes the selection as Markdown, and copies the pictures it uses into a folder beside it. */
  saveExportMarkdown(paths: string[]): Promise<string | null>
  saveExportPdf(paths: string[], options: PdfOptions, css?: string): Promise<string | null>
  /** The built-in export styles, then the writer's own. */
  exportStyles(): Promise<ExportStyleDef[]>
  /** Saves a style of the writer's own (over `id` if given); returns its id. */
  saveExportStyle(name: string, description: string, css: string, id?: string): Promise<string>
  deleteExportStyle(id: string): Promise<void>
  openExportStylesFolder(): Promise<void>
  /** The sheet that was open when the app last ran, if any. */
  getLastSheet(): Promise<string | null>
  /** Keeps unsaved editor text safe until the sheet is written. */
  journalPut(path: string, text: string): Promise<void>
  /** Forgets a sheet's journaled text, once it is saved or given up. */
  journalClear(path: string): Promise<void>
  /** Unsaved text left over from a crash, for the open library. */
  journalPending(): Promise<RecoveredSheet[]>
  /** Remembers the open sheet for the next launch. */
  setLastSheet(path: string): Promise<void>
  /** How the app looks, with defaults filled in. */
  getView(): Promise<ViewSettings>
  /** Changes some view settings; every window is told through `onViewChanged`. */
  setView(patch: Partial<ViewSettings>): Promise<ViewSettings>
  /** Called when a view setting changes, from the View menu or elsewhere. */
  onViewChanged(callback: (view: ViewSettings) => void): () => void
  /** Theme files found in the themes folder. */
  listThemes(): Promise<ColorTheme[]>
  /** Opens the themes folder, creating it with an example theme if it is empty. */
  openThemesFolder(): Promise<void>
  /** Shows the native right-click menu for a node; resolves with what the renderer must do, or null. */
  showNodeMenu(
    kind: 'sheet' | 'group' | 'root',
    path: string,
    canPaste?: boolean
  ): Promise<'new-sheet' | 'new-group' | 'open-tab' | 'open-window' | 'rename' | 'move' | 'delete' | 'duplicate' | 'copy' | 'cut' | 'paste' | null>
  /** Opens another window on the same library, on `sheet` when given, with its corner near `at` (screen pixels). */
  newWindow(sheet?: string, at?: { x: number; y: number }): Promise<void>
  /** The sheet this window was opened for, once; null for an ordinary window. */
  initialSheet(): Promise<string | null>
  /** Closes this window. */
  closeWindow(): Promise<void>
  /** Called when a File menu command that the UI handles is chosen. */
  onMenuCommand(callback: (command: MenuCommand) => void): () => void
  /** Called when files in the open library change outside the app, with the library as it is now. */
  onLibraryChanged(callback: (library: LibraryInfo) => void): () => void
  /** Called when File > Open Library loads a library. Returns an unsubscribe function. */
  onLibraryOpened(callback: (library: LibraryInfo) => void): () => void
}
