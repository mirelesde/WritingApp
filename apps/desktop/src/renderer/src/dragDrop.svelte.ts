import type { GroupNode } from '@writingapp/core'
import { findGroup } from './listing'
import type { DropZone, TreeDnd } from './organise'

/** What dragging sheets and groups needs from the rest of the app. */
export interface DragHost {
  /** The library's root group, or undefined before one is loaded. */
  tree(): GroupNode | undefined
  /** The group whose sheets the list shows. */
  selectedGroup(): string
  /** True when the list is in saved order, the only one a drop can rearrange. */
  manualOrder(): boolean
  /** The sheets in the order the list shows them. */
  listPaths(): string[]
  isSelected(path: string): boolean
  selection(): string[]
  /** Makes `path` the only selected sheet. */
  selectOnly(path: string): void
  /** Moves nodes into `parent`, at `slot` if given. Resolves truthy when it worked. */
  move(paths: string[], parent: string, slot?: number): Promise<unknown>
  /** Shows a group's children in the tree. */
  expand(path: string): void
  /** Empties the editor, after sheets were moved out of what it showed. */
  clearSheets(): void
}

type Dragged = { kind: 'sheets' | 'group'; paths: string[]; parent: string }

const parentPath = (path: string): string => path.slice(0, path.lastIndexOf('/'))

/** Drag and drop of sheets (within the list, or onto a group) and of groups (within the tree). */
export class DragDrop {
  // What is being dragged. Plain, not state: nothing draws from it, and its arrays must cross the IPC bridge.
  private drag: Dragged | null = null
  /** Where a dragged group or sheet would land in the tree. */
  treeHint = $state<{ path: string; zone: DropZone } | null>(null)
  /** Where dragged sheets would land in the list: before or after a row, or at the end. */
  sheetHint = $state<{ path: string; after: boolean } | 'end' | null>(null)

  /** Ends any drag and clears the indicators. */
  end = (): void => {
    this.drag = null
    this.treeHint = null
    this.sheetHint = null
  }

  private canDropOnGroup(target: string, zone: DropZone): boolean {
    const tree = this.host.tree()
    if (!this.drag || !tree) return false
    if (this.drag.kind === 'sheets') return zone === 'inside'
    const dragged = this.drag.paths[0]!
    if (target === dragged || target.startsWith(dragged + '/')) return false
    return zone === 'inside' || target !== tree.path // the root has no "before" or "after"
  }

  // --- Sheets in the list ---------------------------------------------------

  sheetStart = (path: string, e: DragEvent): void => {
    const host = this.host
    const chosen = host.isSelected(path) ? host.selection() : [path]
    if (!host.isSelected(path)) host.selectOnly(path)
    const paths = host.listPaths().filter((p) => chosen.includes(p))
    // Sheets from one group can be put in a new order; a mixed selection can only be moved to another group.
    const first = parentPath(paths[0] ?? '')
    this.drag = { kind: 'sheets', paths, parent: paths.every((p) => parentPath(p) === first) ? first : '' }
    e.dataTransfer?.setData('text/plain', paths.join('\n'))
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  }

  paneOver = (e: DragEvent): void => {
    // A sorted list has no saved order to rearrange; sheets can still be dragged to a group.
    if (!this.host.manualOrder()) return
    if (this.drag?.kind !== 'sheets' || this.drag.parent !== this.host.selectedGroup()) return
    e.preventDefault()
    this.sheetHint = 'end'
  }

  sheetOver = (path: string, e: DragEvent): void => {
    const drag = this.drag
    if (!this.host.manualOrder()) return
    if (drag?.kind !== 'sheets' || drag.parent === '' || parentPath(path) !== drag.parent || drag.paths.includes(path)) return
    e.preventDefault()
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    this.sheetHint = { path, after: e.clientY - rect.top > rect.height / 2 }
  }

  /** Reorders the dragged sheets to the slot the indicator shows. */
  drop = (e: DragEvent): void => {
    e.preventDefault()
    const dragged = this.drag
    const hint = this.sheetHint
    this.end()
    const tree = this.host.tree()
    const parent = dragged && tree ? findGroup(tree, dragged.parent) : undefined
    if (!dragged || !parent || !hint) return
    let slot: number | undefined
    if (hint !== 'end') {
      const rest = parent.children.map((c) => c.path).filter((p) => !dragged.paths.includes(p))
      slot = rest.indexOf(hint.path) + (hint.after ? 1 : 0)
    }
    void this.host.move(dragged.paths, parent.path, slot)
  }

  // --- Groups in the tree ---------------------------------------------------

  /** What the group tree needs to draw and handle drags. */
  readonly tree: TreeDnd

  constructor(private readonly host: DragHost) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const dnd = this
    this.tree = {
      get hint() {
        return dnd.treeHint
      },
      start: (path, e) => {
        this.drag = { kind: 'group', paths: [path], parent: parentPath(path) }
        e.dataTransfer?.setData('text/plain', path)
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
      },
      over: (path, zone, e) => {
        if (!this.canDropOnGroup(path, zone)) {
          this.treeHint = null
          return
        }
        e.preventDefault()
        this.treeHint = { path, zone }
      },
      drop: (path, zone, e) => {
        e.preventDefault()
        const dragged = this.drag
        const ok = this.canDropOnGroup(path, zone)
        this.end()
        if (!dragged || !ok) return
        if (zone === 'inside') {
          void this.host.move(dragged.paths, path).then((result) => {
            if (!result) return
            this.host.expand(path)
            if (dragged.kind === 'sheets') this.host.clearSheets()
          })
          return
        }
        const tree = this.host.tree()
        const parent = tree ? findGroup(tree, parentPath(path)) : undefined
        if (!parent) return
        const rest = parent.children.map((c) => c.path).filter((p) => p !== dragged.paths[0])
        const slot = rest.indexOf(path) + (zone === 'after' ? 1 : 0)
        void this.host.move(dragged.paths, parent.path, slot)
      },
      end: () => this.end()
    }
  }
}
