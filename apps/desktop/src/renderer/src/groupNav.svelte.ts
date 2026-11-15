import type { GroupNode } from '@writingapp/core'
import { findGroup } from './listing'

/**
 * Where the user is in the group tree: the group whose sheets are listed, and which
 * groups are open. The tree itself belongs to the loaded library.
 */
export class GroupNav {
  selectedGroup = $state('')
  expanded = $state<Record<string, boolean>>({})

  /** A library was opened: only its root is open and selected. */
  reset(rootPath: string): void {
    this.expanded = { [rootPath]: true }
    this.selectedGroup = rootPath
  }

  /** The tree was changed by an operation: follow renamed or moved groups, and fall back to the root if ours is gone. */
  follow(tree: GroupNode, change: (path: string) => string): void {
    this.selectedGroup = change(this.selectedGroup)
    if (!findGroup(tree, this.selectedGroup)) this.selectedGroup = tree.path
    this.expanded = Object.fromEntries(
      Object.entries(this.expanded).map(([p, open]) => [change(p), open])
    )
  }

  /** Moves to `fallback` if the selected group is not in `tree`; returns whether it did. */
  keep(tree: GroupNode, fallback: string): boolean {
    if (findGroup(tree, this.selectedGroup)) return false
    this.selectedGroup = fallback
    return true
  }

  expand(path: string): void {
    this.expanded[path] = true
  }

  toggle(path: string): void {
    this.expanded[path] = !this.expanded[path]
  }

  /** Selects `group`, opening every group on the way down from the root. */
  reveal(group: string, rootPath: string): void {
    for (let p = group; p.length >= rootPath.length; p = p.slice(0, p.lastIndexOf('/')))
      this.expanded[p] = true
    this.selectedGroup = group
  }
}
