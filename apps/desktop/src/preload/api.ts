import type { GroupNode } from '@writingapp/core'

/** A loaded library: where it lives and its tree. */
export interface LibraryInfo {
  path: string
  tree: GroupNode
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
  /** Called when File > Open Library loads a library. Returns an unsubscribe function. */
  onLibraryOpened(callback: (library: LibraryInfo) => void): () => void
}
