import { groupLabel, type GroupNode } from '@writingapp/core'
import type { Api, LibraryInfo, OpResult } from '../../preload/api'
import { findGroup, sheetExists } from './listing'
import { remapPath } from './organise'
import type { GroupNav } from './groupNav.svelte'
import type { SelectionState } from './selectionState.svelte'

type NodeApi = Pick<
  Api,
  'merge' | 'glue' | 'unglue' | 'deleteNodes' | 'copy' | 'move' | 'undo' | 'split' | 'createGroup' | 'renameGroup'
>

/** What working on sheets and groups needs from the rest of the app. */
export interface NodeHost {
  library(): LibraryInfo | null
  /** Saves anything outstanding, runs the change, then brings the UI in line with the result. */
  runOp(op: () => Promise<OpResult>, reload?: boolean): Promise<OpResult | undefined>
  setSelection(paths: string[], to: string | null, focus?: boolean): Promise<void>
  selectGroup(path: string): unknown
  /** Empties the editor, after the selection was dropped. */
  clearSheets(): void
  /** True when the library tree, not the sheet list, has the keyboard focus. */
  treeFocused(): boolean
  /** Puts the keyboard focus on the library tree, once the screen has caught up. */
  focusTree(): Promise<void>
  /** Where the cursor is in the open sheet, for splitting it. */
  cursor(): { path: string; text: string; offset: number } | undefined
  info(text: string): void
  /** Shows a message about something that could not be done. */
  warn(text: string): void
}

const dirOf = (path: string): string => path.slice(0, path.lastIndexOf('/'))

/**
 * Working on sheets and groups: duplicate, copy, cut and paste, merge, split, glue, delete,
 * undo, new groups and renaming. Each runs through the host, which saves first and
 * keeps the selection and open tabs in step with what changed.
 */
export class NodeOps {
  /** What Cut or Copy last took, waiting for Paste. */
  clip = $state<{ paths: string[]; cut: boolean } | null>(null)
  /** The group being renamed in the tree, if any. */
  renaming = $state<string | null>(null)

  constructor(
    private readonly api: NodeApi,
    private readonly sel: SelectionState,
    private readonly nav: GroupNav,
    private readonly host: NodeHost
  ) {}

  /** What the commands act on: the selected sheets, or the selected group when the tree has focus. */
  private targets(): string[] {
    const library = this.host.library()
    if (!library) return []
    if (this.host.treeFocused() || this.sel.paths.length === 0) {
      return this.nav.selectedGroup === library.tree.path ? [] : [this.nav.selectedGroup]
    }
    return [...this.sel.paths] // a plain array: state proxies cannot cross the bridge
  }

  /** Selects what a copy or move produced: the new sheets, or the new group. */
  async selectCopies(paths: string[]): Promise<void> {
    const library = this.host.library()
    if (!library || paths.length === 0) return
    if (paths.every((p) => sheetExists(library.tree, p))) {
      this.sel.anchor = paths[0]!
      await this.host.setSelection(paths, paths[0]!, false)
    } else if (findGroup(library.tree, paths[0]!)) {
      void this.host.selectGroup(paths[0]!)
    }
  }

  duplicate = async (): Promise<void> => {
    const library = this.host.library()
    const targets = this.targets()
    const first = targets[0]
    if (!library || !first) {
      this.host.warn('Select a sheet or group to duplicate first.')
      return
    }
    const parent = findGroup(library.tree, dirOf(first))
    const after = Math.max(...targets.map((p) => parent?.children.findIndex((c) => c.path === p) ?? -1))
    const result = await this.host.runOp(() =>
      this.api.copy(targets, dirOf(first), after >= 0 ? after + 1 : undefined, 'Duplicate')
    )
    if (result?.copied) await this.selectCopies(result.copied)
  }

  copy = (cut: boolean): void => {
    const targets = this.targets()
    if (targets.length === 0) {
      this.host.warn(`Select a sheet or group to ${cut ? 'cut' : 'copy'} first.`)
      return
    }
    this.clip = { paths: targets, cut }
    this.host.info(
      `${cut ? 'Cut' : 'Copied'} ${targets.length === 1 ? '1 item' : `${targets.length} items`}. Paste with Cmd/Ctrl+V.`
    )
  }

  paste = async (): Promise<void> => {
    const clip = this.clip
    const library = this.host.library()
    const parent = library ? findGroup(library.tree, this.nav.selectedGroup) : undefined
    if (!library || !clip || !parent) return
    const at = this.host.treeFocused() ? -1 : parent.children.findIndex((c) => c.path === this.sel.cursor)
    const index = at >= 0 ? at + 1 : undefined
    const paths = [...clip.paths]
    if (clip.cut) {
      const result = await this.host.runOp(() => this.api.move(paths, parent.path, index))
      if (!result) return
      this.clip = null
      await this.selectCopies(paths.map((p) => remapPath(p, result.moved)))
    } else {
      const result = await this.host.runOp(() => this.api.copy(paths, parent.path, index, 'Paste'))
      if (result?.copied) await this.selectCopies(result.copied)
    }
  }

  /** Cmd/Ctrl+C, X, V and D in the sheet list and the tree. Returns whether the key was used. */
  clipboardKey = (e: KeyboardEvent): boolean => {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return false
    if ((e.target as HTMLElement).closest('input, textarea')) return false
    const key = e.key.toLowerCase()
    if (key === 'c') this.copy(false)
    else if (key === 'x') this.copy(true)
    else if (key === 'v') void this.paste()
    else if (key === 'd') void this.duplicate()
    else return false
    e.preventDefault()
    return true
  }

  merge = async (): Promise<void> => {
    if (this.sel.paths.length < 2) {
      this.host.warn('Select two or more sheets to merge.')
      return
    }
    const chosen = [...this.sel.paths]
    const result = await this.host.runOp(() => this.api.merge(chosen), true)
    if (result?.created) {
      this.sel.anchor = result.created
      await this.host.setSelection([result.created], result.created)
    }
  }

  glue = async (glue: boolean): Promise<void> => {
    if (this.sel.paths.length === 0) {
      this.host.warn('Select a sheet first.')
      return
    }
    const chosen = [...this.sel.paths]
    await this.host.runOp(() => (glue ? this.api.glue(chosen) : this.api.unglue(chosen)))
  }

  split = async (): Promise<void> => {
    const where = this.host.cursor()
    if (!where) {
      this.host.warn('Put the cursor in a sheet to split it there.')
      return
    }
    const result = await this.host.runOp(() => this.api.split(where.path, where.text, where.offset), true)
    if (result?.created) {
      this.sel.anchor = result.created
      await this.host.setSelection([result.created], result.created, true)
    }
  }

  /** Moves the selected sheets, or the selected group when the tree has focus, to the trash. */
  remove = async (): Promise<void> => {
    const library = this.host.library()
    if (!library) return
    const { nav, sel } = this
    let paths: string[]
    let fallback = nav.selectedGroup
    if (this.host.treeFocused() || sel.paths.length === 0) {
      if (nav.selectedGroup === library.tree.path) {
        this.host.warn('Select a sheet or group to delete first.')
        return
      }
      paths = [nav.selectedGroup]
      fallback = dirOf(nav.selectedGroup)
    } else paths = [...sel.paths] // a plain array: state proxies cannot cross the bridge
    const result = await this.host.runOp(() => this.api.deleteNodes(paths))
    if (!result) return
    nav.keep(result.library.tree, fallback)
    this.host.info(`Moved ${paths.length === 1 ? '1 item' : `${paths.length} items`} to the trash. Undo with Cmd/Ctrl+Alt+Z.`)
  }

  undo = async (): Promise<void> => {
    const result = await this.host.runOp(() => this.api.undo(), true)
    if (result?.label) this.host.info(`Undid ${result.label.toLowerCase()}`)
  }

  // --- Groups -----------------------------------------------------------------

  /** Makes a group (a project, when `inRoot`) and opens its name for editing. */
  newGroup = async (inRoot: boolean): Promise<void> => {
    const library = this.host.library()
    if (!library) return
    const parent = inRoot ? library.tree.path : this.nav.selectedGroup
    const result = await this.host.runOp(() =>
      this.api.createGroup(parent, inRoot ? 'Untitled Project' : undefined)
    )
    if (!result?.created) return
    this.nav.expand(parent)
    this.nav.selectedGroup = result.created
    this.host.clearSheets()
    this.renaming = result.created
  }

  startRename = async (path: string): Promise<void> => {
    const library = this.host.library()
    if (library && path !== library.tree.path) this.renaming = path
  }

  finishRename = async (): Promise<void> => {
    this.renaming = null
    await this.host.focusTree()
  }

  commitRename = async (path: string, name: string): Promise<void> => {
    if (this.renaming !== path) return
    const trimmed = name.trim()
    await this.finishRename()
    const library = this.host.library()
    const node: GroupNode | undefined = library ? findGroup(library.tree, path) : undefined
    const current = node ? groupLabel(node) : undefined
    if (trimmed === '' || trimmed === (current ?? path.slice(path.lastIndexOf('/') + 1))) return
    await this.host.runOp(() => this.api.renameGroup(path, trimmed))
  }
}
