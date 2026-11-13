/** Helpers for the absolute, forward-slash paths the FileSystem uses. */

export function joinPath(dir: string, name: string): string {
  return dir === '/' ? '/' + name : dir + '/' + name
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

export function parentPath(path: string): string {
  const i = path.lastIndexOf('/')
  return i <= 0 ? '/' : path.slice(0, i)
}

/** Removes trailing slashes, leaving the root "/" alone. */
export function trimSlashes(path: string): string {
  return path.length > 1 ? path.replace(/\/+$/, '') || '/' : path
}
