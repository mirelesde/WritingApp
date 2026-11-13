import { posix } from 'node:path'

/** The core uses forward slashes everywhere; Windows dialogs return backslashes. */
export function toPosix(path: string): string {
  return path.replaceAll('\\', '/')
}

/**
 * True if `path` is a Markdown file strictly inside `root`. The renderer
 * may only read sheets, so every path it sends is checked against this.
 */
export function isSheetInside(root: string, path: string): boolean {
  return (
    posix.normalize(path) === path &&
    path.startsWith(root === '/' ? '/' : root + '/') &&
    path.endsWith('.md')
  )
}

/**
 * True if `path` is a clean absolute path inside `root`: a descendant, or
 * `root` itself when `allowRoot` is set (the library root is a valid place
 * to put things, but never something to move or rename).
 */
export function isInside(root: string, path: string, allowRoot = false): boolean {
  if (posix.normalize(path) !== path) return false
  if (path === root) return allowRoot
  return path.startsWith(root === '/' ? '/' : root + '/')
}
