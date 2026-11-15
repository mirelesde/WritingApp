import type { GroupNode } from '@writingapp/core'
import type { OpResult } from '../../preload/api'
import { moveTargets, type MoveTarget } from './organise'

/** What moving needs from the rest of the app. */
export interface MoveFlowHost {
  tree(): GroupNode | undefined
  selectedGroup(): string
  /** The name of the selected group, for the heading. */
  groupLabel(): string | undefined
  /** The sheets selected, as a plain array. */
  selectedSheets(): string[]
  /** Whether the library tree (not the sheets list) has the keyboard focus. */
  treeFocused(): boolean
  /** Notes where the keyboard focus is, and returns a function that puts it back. */
  rememberFocus(): () => void
  runOp(op: () => Promise<OpResult>): Promise<OpResult | undefined>
  move(paths: string[], target: string): Promise<OpResult>
  expand(path: string): void
  clearSheets(): void
  warn(text: string): void
}

/** Choosing where to move the selected sheets, or the selected group. */
export class MoveFlow {
  /** What the picker is showing, or null when it is closed. */
  current = $state<{ heading: string; paths: string[]; targets: MoveTarget[] } | null>(null)
  private restoreFocus: (() => void) | null = null
  private fromTree = false

  constructor(private readonly host: MoveFlowHost) {}

  /** Opens the picker for the selected group (tree focused) or sheets. */
  open = (): void => {
    const root = this.host.tree()
    if (!root) return
    const inTree = this.host.treeFocused()
    const group = this.host.selectedGroup()
    let paths: string[]
    let from: string
    let moving: string[]
    let heading: string
    if (inTree) {
      if (group === root.path) return
      paths = moving = [group]
      from = group.slice(0, group.lastIndexOf('/'))
      heading = `Move “${this.host.groupLabel() ?? 'group'}” to…`
    } else {
      paths = this.host.selectedSheets()
      if (paths.length === 0) return
      moving = []
      from = group
      heading = paths.length === 1 ? 'Move 1 sheet to…' : `Move ${paths.length} sheets to…`
    }
    const targets = moveTargets(root, moving, from)
    if (targets.length === 0) {
      this.host.warn('There is nowhere else to move this.')
      return
    }
    this.fromTree = inTree
    this.restoreFocus = this.host.rememberFocus()
    this.current = { heading, paths, targets }
  }

  close = (): void => {
    this.current = null
    this.restoreFocus?.()
  }

  pick = async (target: string): Promise<void> => {
    if (!this.current) return
    const paths = [...this.current.paths] // a plain array: state proxies cannot cross the bridge
    const movedSheets = !this.fromTree
    this.close()
    const result = await this.host.runOp(() => this.host.move(paths, target))
    if (!result) return
    this.host.expand(target)
    if (movedSheets) this.host.clearSheets()
  }
}
