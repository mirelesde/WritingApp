import type { GroupNode } from '@writingapp/core'
import { sheetsKey, treeKey, windowKey } from './keyActions'
import { visibleGroups } from './organise'

/** What the keyboard handlers need from the rest of the app. */
export interface KeyboardHost {
  tree(): GroupNode | undefined
  expanded(): Record<string, boolean>
  setExpanded(path: string, open: boolean): void
  selectedGroup(): string
  selectGroup(path: string): void
  /** Whether a group's name is being edited, so keys belong to the text box. */
  renaming(): boolean
  startRename(path: string): void
  /** Handles copy, cut, paste and duplicate; true when it took the key. */
  clipboardKey(e: KeyboardEvent): boolean
  move(paths: string[], parent: string, slot: number): void
  /** The sheets list, as a plain array of paths in the order shown. */
  listPaths(): string[]
  /** The selection, as plain values. */
  selection(): { paths: string[]; cursor: string | null; anchor: string | null }
  setAnchor(path: string): void
  setSelection(paths: string[], cursor: string | null): void
  /** Whether the list is in the saved order, the only one that can be rearranged. */
  manualOrder(): boolean
  /** The children of a group in saved order, if the group is known. */
  siblings(group: string): string[] | undefined
  focusEditor(path: string): void
  step(delta: -1 | 1): void
  focusLibrary(): void
  focusSheets(): void
}

/** What pressing keys in the library tree, the sheets list and the window does. */
export class KeyboardFlow {
  constructor(private readonly host: KeyboardHost) {}

  tree = (e: KeyboardEvent): void => {
    const root = this.host.tree()
    if (!root || this.host.renaming()) return
    const result = treeKey(
      e,
      visibleGroups(root, this.host.expanded()),
      this.host.selectedGroup(),
      this.host.expanded(),
      () => this.host.clipboardKey(e)
    )
    if (result.handled) e.preventDefault()
    const action = result.action
    if (!action) return
    if (action.kind === 'select') this.host.selectGroup(action.path)
    else if (action.kind === 'expand') this.host.setExpanded(action.path, action.open)
    else if (action.kind === 'rename') this.host.startRename(action.path)
    else this.host.move(action.paths, action.parent, action.slot)
  }

  sheets = (e: KeyboardEvent): void => {
    const now = this.host.selection()
    const result = sheetsKey(
      e,
      {
        listPaths: this.host.listPaths(),
        selected: now.paths,
        cursor: now.cursor,
        anchor: now.anchor,
        manual: this.host.manualOrder(),
        siblings: this.host.siblings
      },
      () => this.host.clipboardKey(e)
    )
    if (result.handled) e.preventDefault()
    const action = result.action
    if (!action) return
    if (action.kind === 'move') this.host.move(action.paths, action.parent, action.slot)
    else if (action.kind === 'edit') {
      if (now.paths[0]) this.host.focusEditor(now.paths[0])
    } else {
      if (action.anchor !== undefined) this.host.setAnchor(action.anchor)
      this.host.setSelection(action.paths, action.cursor)
    }
  }

  window = (e: KeyboardEvent): void => {
    const first = this.host.selection().paths[0]
    const action = windowKey(e, this.host.tree() !== undefined, first !== undefined)
    if (!action) return
    if (action === 'back') this.host.step(-1)
    else if (action === 'forward') this.host.step(1)
    else if (action === 'focus-library') this.host.focusLibrary()
    else if (action === 'focus-sheets') this.host.focusSheets()
    else if (first) this.host.focusEditor(first)
    e.preventDefault()
  }
}
