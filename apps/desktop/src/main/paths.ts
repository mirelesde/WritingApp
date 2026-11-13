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
