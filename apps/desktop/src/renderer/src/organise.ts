/**
 * Where a path ends up after a rename or move. `moved` lists [from, to]
 * pairs; anything inside a moved folder moves with it.
 */
export function remapPath(path: string, moved: [string, string][]): string {
  for (const [from, to] of moved) {
    if (path === from) return to
    if (path.startsWith(from + '/')) return to + path.slice(from.length)
  }
  return path
}

/** The readable part of an error that crossed the IPC bridge. */
export function errorMessage(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
