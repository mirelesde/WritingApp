import type { LibraryInfo, OpResult } from '../../preload/api'
import { errorMessage, remapPath } from './organise'
import { sheetExists } from './listing'
import type { SelectionState } from './selectionState.svelte'
import type { SheetRun } from './sheetRun.svelte'

/** What running a library change needs from the rest of the app. */
export interface OpHost {
  /** Writes out unsaved text, so the change starts from what is on disk. */
  flush(): Promise<void>
  library(): LibraryInfo | null
  setLibrary(info: LibraryInfo): void
  /** Tells everything that holds sheet paths where they went. */
  remap(change: (path: string) => string, tree: LibraryInfo['tree']): void
  notice(text: string): void
}

/** Runs structural changes to the library and brings the UI in line with the result. */
export class OpRunner {
  constructor(
    private readonly sel: SelectionState,
    private readonly run: SheetRun,
    private readonly host: OpHost
  ) {}

  /** Runs a change, then follows its result. Undefined when it failed (the notice says why). */
  runOp = async (op: () => Promise<OpResult>, reload = false): Promise<OpResult | undefined> => {
    await this.host.flush()
    try {
      const result = await op()
      this.host.setLibrary(result.library)
      this.host.remap((path) => remapPath(path, result.moved), result.library.tree)
      await this.refreshOpen(reload)
      this.host.notice('')
      return result
    } catch (e) {
      this.host.notice(errorMessage(e))
      return undefined
    }
  }

  /** Makes the editor match the selection: drops sheets that are gone, reloads when told to. */
  refreshOpen = async (force: boolean): Promise<void> => {
    const library = this.host.library()
    if (!library) return
    const tree = library.tree
    this.sel.prune((p) => sheetExists(tree, p))
    if (this.sel.paths.length !== 1) {
      if (this.run.open) this.run.clear()
      return
    }
    if (force || !this.run.isOpen(this.sel.paths[0]!)) await this.run.load(this.sel.paths[0]!)
  }
}
