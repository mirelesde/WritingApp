import type { GroupNode } from '@writingapp/core'

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

export interface VisibleGroup {
  group: GroupNode
  /** The group it sits in; null for the library root. */
  parent: GroupNode | null
}

/** The groups the tree currently shows, top to bottom, honouring collapsed ones. */
export function visibleGroups(root: GroupNode, expanded: Record<string, boolean>): VisibleGroup[] {
  const result: VisibleGroup[] = []
  const walk = (group: GroupNode, parent: GroupNode | null): void => {
    result.push({ group, parent })
    if (!expanded[group.path]) return
    for (const child of group.children) if (child.kind === 'group') walk(child, group)
  }
  walk(root, null)
  return result
}

/**
 * Where to drop a block of selected siblings to move it one step up or down
 * among the siblings that are shown (sheets in the sheet list, or groups in
 * the tree). `children` is the parent's full order, shown or not. Returns the
 * slot `moveNodes` expects, counted among the items that stay put, or
 * undefined if the block is already at that end.
 */
export function moveSlot(
  children: string[],
  shown: string[],
  selected: string[],
  delta: -1 | 1
): number | undefined {
  const chosen = new Set(selected)
  const positions = shown.flatMap((path, i) => (chosen.has(path) ? [i] : []))
  if (positions.length === 0) return undefined
  const rest = children.filter((path) => !chosen.has(path))
  if (delta < 0) {
    const neighbour = shown[Math.min(...positions) - 1]
    return neighbour === undefined ? undefined : rest.indexOf(neighbour)
  }
  const neighbour = shown[Math.max(...positions) + 1]
  return neighbour === undefined ? undefined : rest.indexOf(neighbour) + 1
}

/** The paths from `from` to `to` inclusive, in list order, whichever comes first. */
export function pathRange(list: string[], from: string, to: string): string[] {
  const a = list.indexOf(from)
  const b = list.indexOf(to)
  if (a < 0 || b < 0) return []
  return list.slice(Math.min(a, b), Math.max(a, b) + 1)
}
