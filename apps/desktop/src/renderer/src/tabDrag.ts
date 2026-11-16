import type { TabsState } from './tabsState.svelte'

const TAB_MIME = 'application/x-writingapp-tab'
/** Set on a drag whose tab has unsaved changes: only this window can take it, since the text lives here. */
const DIRTY_MIME = 'application/x-writingapp-unsaved'

/** What dragging tabs needs from the rest of the app. */
export interface TabDragHost {
  hasChanges(path: string): boolean
  /** Whether the sheet is in this window's library. */
  sheetExists(path: string): boolean
  /** Brings tab `index` to the front. */
  show(index: number): Promise<void>
  /** Closes tab `index`, first asking about unsaved text; the tab stays if that is cancelled. */
  close(index: number): void | Promise<void>
  /** Opens a window for the sheet at a screen position. */
  newWindow(path: string, at: { x: number; y: number }): Promise<void>
  /** The window's size, to tell a drop on the desktop from one on the window. */
  windowSize(): { width: number; height: number }
}

/** Dragging tabs: to reorder them, into another window, or out onto the desktop. */
export class TabDrag {
  constructor(
    private readonly tabs: TabsState,
    private readonly host: TabDragHost
  ) {}

  start = (i: number, e: DragEvent): void => {
    if (!e.dataTransfer) return
    const path = this.tabs.list[i] ?? ''
    e.dataTransfer.setData(TAB_MIME, path)
    if (this.host.hasChanges(path)) e.dataTransfer.setData(DIRTY_MIME, '1')
    e.dataTransfer.effectAllowed = 'move'
    this.tabs.startDrag(i)
  }

  /** Where in the bar a drag at this point would land: before or after the tab under it. */
  private slot(e: DragEvent): number {
    const tab = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')
    if (!tab) return this.tabs.list.length
    const box = tab.getBoundingClientRect()
    return Number(tab.dataset.tab) + (e.clientX > box.left + box.width / 2 ? 1 : 0)
  }

  over = (e: DragEvent): void => {
    if (!e.dataTransfer?.types.includes(TAB_MIME)) return
    if (e.dataTransfer.types.includes(DIRTY_MIME) && this.tabs.dragFrom === null) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    this.tabs.hint = this.slot(e)
  }

  drop = async (e: DragEvent): Promise<void> => {
    const path = e.dataTransfer?.getData(TAB_MIME)
    if (!path) return
    e.preventDefault()
    const at = this.slot(e)
    const tabs = this.tabs
    tabs.hint = null
    tabs.dropped = true
    if (tabs.dragFrom !== null) {
      // Reordered within this window; the front tab stays in front.
      tabs.reorder(tabs.dragFrom, at)
    } else if (this.host.sheetExists(path)) {
      // Brought over from another window, which closes its copy.
      tabs.insert(at, path)
      await this.host.show(at)
    }
  }

  end = (e: DragEvent): void => {
    const from = this.tabs.endDrag()
    if (from === null) return
    const { width, height } = this.host.windowSize()
    const outside = e.clientX < 0 || e.clientY < 0 || e.clientX > width || e.clientY > height
    const path = this.tabs.list[from]
    if (e.dataTransfer?.dropEffect === 'move') {
      // Another window took it.
      this.host.close(from)
    } else if (outside && path && this.tabs.list.length > 1) {
      // Dropped on the desktop: it becomes a window of its own.
      const at = { x: e.screenX, y: e.screenY }
      if (this.host.hasChanges(path)) void this.moveOutUnsaved(from, path, at)
      else {
        void this.host.newWindow(path, at)
        void this.host.close(from)
      }
    }
  }

  /** Unsaved text lives in this window: settle it (save or discard) before the sheet moves. */
  private async moveOutUnsaved(from: number, path: string, at: { x: number; y: number }): Promise<void> {
    await this.host.close(from)
    // Cancelled: the tab is still there.
    if (this.tabs.list[from] === path) return
    await this.host.newWindow(path, at)
  }
}
