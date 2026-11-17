import type { LibraryInfo } from '../../preload/api'
import type { GroupNav } from './groupNav.svelte'
import type { SelectionState } from './selectionState.svelte'

/** What moving around the library needs from the rest of the app. */
export interface NavigationHost {
  /** Waits for a pending selection change to finish, and saves what is outstanding. */
  settle(): Promise<void>
  setLibrary(info: LibraryInfo | null): void
  library(): LibraryInfo | null
  /** Empties the selection and the editor. */
  clearSheets(): void
  setSelection(paths: string[], to: string | null, focus?: boolean): Promise<void>
  /** Empties the filter box above the sheets list. */
  clearFilter(): void
  /** The first sheet the list shows for the selected group. */
  firstListed(): string | undefined
  /** Closes the quick-open box if it is showing. */
  closeQuick(): void
  /** Checks for work to recover and for pictures no sheet uses. */
  onOpened(): void
}

/** Moving between groups and sheets: choosing a group, showing a sheet found by search, opening a library. */
export class Navigation {
  constructor(
    private readonly nav: GroupNav,
    private readonly sel: SelectionState,
    private readonly host: NavigationHost
  ) {}

  /** A library was opened: only its root is open and selected, and nothing is showing. */
  showLibrary = (info: LibraryInfo): void => {
    this.host.setLibrary(info)
    this.nav.reset(info.tree.path)
    this.host.clearSheets()
    this.host.onOpened()
  }

  /** The library was closed: nothing is open, so the folder chooser shows. */
  closeLibrary = (): void => {
    this.host.clearSheets()
    this.host.closeQuick()
    this.host.setLibrary(null)
  }

  /** Chooses a group. Its first sheet opens, so choosing a group rarely leaves the editor empty. */
  selectGroup = async (path: string): Promise<void> => {
    await this.host.settle()
    this.nav.selectedGroup = path
    this.host.clearFilter()
    this.host.clearSheets()
    const first = this.host.firstListed()
    if (first) {
      this.sel.anchor = first
      await this.host.setSelection([first], first, false)
    }
  }

  /** Opens a sheet found by search: selects its group, expands the way to it, and shows it. */
  revealSheet = async (path: string, focus = true): Promise<void> => {
    const library = this.host.library()
    if (!library) return
    this.host.closeQuick()
    await this.host.settle()
    this.nav.reveal(path.slice(0, path.lastIndexOf('/')), library.tree.path)
    await this.host.setSelection([path], path, focus)
  }
}
