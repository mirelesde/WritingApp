/**
 * Everything the core needs from the disk. The core never imports a
 * platform file API directly: the desktop app passes in a Node-backed
 * implementation, and the mobile app will pass in its own.
 *
 * Paths are absolute and use forward slashes.
 */
export interface FileSystem {
  readText(path: string): Promise<string>
  writeText(path: string, text: string): Promise<void>
  list(path: string): Promise<DirEntry[]>
}

export interface DirEntry {
  name: string
  kind: 'file' | 'directory'
}
