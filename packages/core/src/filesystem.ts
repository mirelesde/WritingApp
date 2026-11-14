/**
 * Everything the core needs from the disk. The core never imports a
 * platform file API directly: the desktop app passes in a Node-backed
 * implementation, and the mobile app will pass in its own.
 *
 * Paths are absolute and use forward slashes. Methods reject when a
 * path they need does not exist.
 */
export interface FileSystem {
  readText(path: string): Promise<string>
  /** Creates or overwrites a file. The parent folder must exist. */
  writeText(path: string, text: string): Promise<void>
  list(path: string): Promise<DirEntry[]>
  /** True if a file or folder exists at the path. Never rejects. */
  exists(path: string): Promise<boolean>
  /** Creates a folder and any missing parents. Does nothing if it exists. */
  makeDir(path: string): Promise<void>
  /**
   * Renames or moves a file or folder (with its contents). Rejects if the
   * destination already exists or its parent folder does not.
   */
  rename(from: string, to: string): Promise<void>
  /**
   * When a file was last changed and created, in ms since 1970, and its size in bytes. Optional: sheets
   * then have no dates. With `size`, an unchanged file is not read again on the next load.
   */
  fileTimes?(path: string): Promise<{ modified: number; created: number; size?: number }>
  /** Moves a file or folder to the system trash, so it is recoverable. */
  trash(path: string): Promise<void>
}

export interface DirEntry {
  name: string
  kind: 'file' | 'directory'
}
