import { groupLabel, type GroupNode } from '@writingapp/core'

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

export interface MoveTarget {
  path: string
  /** For display: the names from the library root down, e.g. "Novel › Part One". */
  label: string
}

/**
 * Every group that can receive a move, for the "Move to…" picker. Leaves
 * out `current` (a no-op) and, for each path in `moving`, that group and
 * everything inside it (a group cannot go into itself).
 */
export function moveTargets(root: GroupNode, moving: string[], current: string): MoveTarget[] {
  const result: MoveTarget[] = []
  const walk = (group: GroupNode, label: string): void => {
    if (moving.some((m) => group.path === m)) return // skips the whole subtree
    if (group.path !== current) result.push({ path: group.path, label })
    for (const child of group.children) {
      if (child.kind === 'group')
        walk(child, group === root ? groupLabel(child) : `${label} › ${groupLabel(child)}`)
    }
  }
  walk(root, groupLabel(root))
  return result
}

/** Targets whose label contains every word of `query`, ignoring case. */
export function filterTargets(targets: MoveTarget[], query: string): MoveTarget[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return targets.filter((t) => words.every((w) => t.label.toLowerCase().includes(w)))
}

export type DropZone = 'before' | 'inside' | 'after'

/** Which part of a row the pointer is over: the top and bottom quarters are the edges. */
export function dropZone(offsetY: number, height: number): DropZone {
  const fraction = height > 0 ? offsetY / height : 0.5
  return fraction < 0.25 ? 'before' : fraction > 0.75 ? 'after' : 'inside'
}

/** Drag and drop on the group tree, as the tree sees it. */
export interface TreeDnd {
  /** Where a drop would land right now, for drawing the indicator. */
  hint: { path: string; zone: DropZone } | null
  start(path: string, e: DragEvent): void
  over(path: string, zone: DropZone, e: DragEvent): void
  drop(path: string, zone: DropZone, e: DragEvent): void
  end(): void
}

/**
 * The glued run a sheet belongs to: the paths of its sheets in order, or just
 * the sheet itself if it is not glued to anything. `children` is a group's
 * full order; a glued sheet is always followed directly by the next in its run.
 */
export function runOf(
  children: { kind: string; path: string; glued?: boolean }[],
  path: string
): string[] {
  const at = children.findIndex((c) => c.kind === 'sheet' && c.path === path)
  if (at < 0) return [path]
  let start = at
  while (start > 0 && children[start - 1]?.kind === 'sheet' && children[start - 1]?.glued) start--
  let end = at
  while (children[end]?.glued && children[end + 1]?.kind === 'sheet') end++
  return children.slice(start, end + 1).map((c) => c.path)
}
