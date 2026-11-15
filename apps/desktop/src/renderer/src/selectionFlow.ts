import type { Api, OpResult } from '../../preload/api'
import { pathRange } from './organise'
import type { SelectionState } from './selectionState.svelte'
import type { SheetRun } from './sheetRun.svelte'

/** What choosing sheets needs from the rest of the app. */
export interface SelectionHost {
  /** Waits for a pending selection change to finish, and saves what is outstanding. */
  settle(): Promise<void>
  /** Records a sheet the user opened, for Back and Forward. */
  visit(path: string): void
  /** Whether the editor should take the cursor when the next sheet loads. */
  wantFocus(focus: boolean): void
  /** Focuses the sheet's editor, if it is shown. */
  focusEditor(path: string): void
  /** Moves the cursor to the start or end of a sheet's text. */
  focusAt(path: string, where: 'start' | 'end'): void
  scrollToPart(path: string): Promise<void>
  /** Brings the sheet into view without recording a visit. */
  reveal(path: string): Promise<void>
  /** Whether saving is left to the user, so nothing may be saved or renamed unasked. */
  manual(): boolean
  hasUnsaved(): boolean
  /** Runs a library change that has already been made, and follows its results. */
  apply(result: OpResult): Promise<unknown>
  /** The paths in the sheets list, in order. */
  listPaths(): string[]
  /** Whether the list is showing keyword matches. */
  keywordMode(): boolean
}

/** Choosing sheets, by click or by moving the cursor, and what the editor shows for them. */
export class SelectionFlow {
  constructor(
    private readonly api: Pick<Api, 'syncSheetNames'>,
    private readonly sel: SelectionState,
    private readonly run: SheetRun,
    private readonly host: SelectionHost
  ) {}

  /** Selects sheets. The editor shows the sheet, with its whole run, when exactly one is selected. */
  setSelection = async (paths: string[], to: string | null, focus = false): Promise<void> => {
    await this.host.settle()
    const left = this.sel.paths.filter((p) => !paths.includes(p))
    this.sel.paths = paths
    this.sel.cursor = to
    if (paths.length === 1) {
      const path = paths[0]!
      this.host.visit(path)
      if (!this.run.isOpen(path)) {
        this.host.wantFocus(focus)
        await this.run.load(path)
      } else if (focus) this.host.focusEditor(path)
      void this.host.scrollToPart(path)
    } else this.run.clear()
    // Renaming is a change to the library, which saves what is open first. In manual
    // mode nothing is saved unasked, so renames wait until nothing has unsaved text.
    if (left.length > 0 && !(this.host.manual() && this.host.hasUnsaved())) void this.renameToMatchTitles(left)
  }

  /** Sheets just left are renamed to follow their titles; the UI follows the new paths. */
  renameToMatchTitles = async (paths: string[]): Promise<void> => {
    try {
      const result = await this.api.syncSheetNames(paths)
      if (result.moved.length === 0) return
      await this.host.apply(result)
    } catch {
      // A name that cannot change is not worth interrupting anyone for.
    }
  }

  /** The cursor moved into another sheet of the open run: the list follows. */
  focusedPart = (path: string): void => {
    if (this.sel.only === path) return
    this.sel.selectOnly(path)
    this.host.visit(path)
  }

  /** Arrow keys at the edge of a sheet carry on into its neighbour in the run. */
  crossEdge = (path: string, direction: 'back' | 'forward'): boolean => {
    const parts = this.run.open?.parts ?? []
    const next = parts[parts.findIndex((p) => p.path === path) + (direction === 'forward' ? 1 : -1)]
    if (!next) return false
    this.host.focusAt(next.path, direction === 'forward' ? 'start' : 'end')
    return true
  }

  clickSheet = (path: string, e: Pick<MouseEvent, 'shiftKey' | 'metaKey' | 'ctrlKey'>): Promise<void> => {
    const sel = this.sel
    if (this.host.keywordMode() && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      sel.anchor = path
      return this.host.reveal(path)
    }
    if (e.shiftKey && sel.anchor) return this.setSelection(pathRange(this.host.listPaths(), sel.anchor, path), path)
    sel.anchor = path
    if (e.metaKey || e.ctrlKey) {
      const next = sel.has(path) ? sel.paths.filter((p) => p !== path) : [...sel.paths, path]
      return this.setSelection(next, path)
    }
    return this.setSelection([path], path)
  }
}
