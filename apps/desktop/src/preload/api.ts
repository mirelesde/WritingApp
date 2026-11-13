import type { ColorTheme, GroupNode, SearchHit, ViewSettings } from '@writingapp/core'

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
  | 'delete'
  | 'toggle-sidebar'
  /** A Format menu item, e.g. `format-h1`. */
  | `format-${string}`

/** A preview of an HTML export. */
export interface ExportPreview {
  title: string
  html: string
  sheets: number
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
  /** Creates a group inside `parent` (at the library root, a project). */
  createGroup(parent: string, name?: string): Promise<OpResult>
  /** Renames a group. Rejects if a sibling already has the name. */
  renameGroup(path: string, name: string): Promise<OpResult>
  /** Moves sheets or groups sharing one parent into `target` as a block. */
  move(paths: string[], target: string, index?: number): Promise<OpResult>
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
  search(query: string): Promise<SearchHit[]>
  /** Total words in a group's sheets, including sub-groups. */
  groupWords(path: string): Promise<number>
  /** Builds the HTML export of the given sheets and groups, without saving it. */
  previewExport(paths: string[]): Promise<ExportPreview>
  /** Asks where to save, then writes the export. Null if the dialog was cancelled. */
  saveExport(paths: string[]): Promise<string | null>
  /** Asks where to save, then writes the export as a paginated PDF. Null if cancelled. */
  saveExportPdf(paths: string[], options: PdfOptions): Promise<string | null>
  /** The sheet that was open when the app last ran, if any. */
  getLastSheet(): Promise<string | null>
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
    path: string
  ): Promise<'new-sheet' | 'new-group' | 'rename' | 'move' | 'delete' | null>
  /** Called when a File menu command that the UI handles is chosen. */
  onMenuCommand(callback: (command: MenuCommand) => void): () => void
  /** Called when files in the open library change outside the app, with the library as it is now. */
  onLibraryChanged(callback: (library: LibraryInfo) => void): () => void
  /** Called when File > Open Library loads a library. Returns an unsubscribe function. */
  onLibraryOpened(callback: (library: LibraryInfo) => void): () => void
}
