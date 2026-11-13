import type { GroupNode } from '@writingapp/core'

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
  /** The path of the sheet or group that was created, if one was. */
  created?: string
}

export type MenuCommand = 'new-sheet' | 'new-group' | 'new-project' | 'move-to'

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
  /** Called when a File menu command that the UI handles is chosen. */
  onMenuCommand(callback: (command: MenuCommand) => void): () => void
  /** Called when File > Open Library loads a library. Returns an unsubscribe function. */
  onLibraryOpened(callback: (library: LibraryInfo) => void): () => void
}
