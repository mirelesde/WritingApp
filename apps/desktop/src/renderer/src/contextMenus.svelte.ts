import type { Api, EditMenuInfo } from '../../preload/api'
import { editMenuItems, nodeMenuItems, type MenuItem } from './contextMenu'

export type NodeKind = 'sheet' | 'group' | 'root'

type MenuApi = Pick<
  Api,
  'revealPath' | 'copyPath' | 'newWindow' | 'replaceMisspelling' | 'addToDictionary' | 'editCommand'
>

/** What the right-click menus need from the rest of the app. */
export interface MenuHost {
  hasLibrary(): boolean
  isMac: boolean
  isSelected(path: string): boolean
  /** Selects one sheet. */
  selectSheet(path: string): Promise<void>
  selectedGroup(): string
  selectGroup(path: string): void
  /** Whether there is something to paste. */
  canPaste(): boolean
  /** Waits for the page to update. */
  tick(): Promise<void>
  /** Gives the library tree the keyboard focus, so the next command acts on it. */
  focusTree(): void
  newSheet(): Promise<void>
  newGroup(atRoot: boolean): Promise<void>
  /** The sheet in the front tab. */
  frontTab(): string | undefined
  /** Opens `path` in a tab beside `before`, the sheet the front tab had before the right-click selected `path`. */
  openTab(path: string, before: string | undefined): Promise<void>
  openKeywords(): void
  startRename(path: string): void
  duplicate(): Promise<void>
  paste(): Promise<void>
  copy(cut: boolean): void
  remove(): Promise<void>
  moveTo(): void
}

/** The right-click menus: for text, and for sheets and groups in the library. */
export class ContextMenus {
  /** The menu being shown, or null. */
  current = $state<{
    x: number
    y: number
    items: MenuItem[]
    onpick: (item: MenuItem) => void
  } | null>(null)

  constructor(
    private readonly api: MenuApi,
    private readonly host: MenuHost
  ) {}

  close = (): void => {
    this.current = null
  }

  /** The menu for right-clicked text; spelling help arrives from the main process. */
  showText = (info: EditMenuInfo): void => {
    this.current = {
      x: info.x,
      y: info.y,
      items: editMenuItems(info, this.host.isMac),
      onpick: (item) => {
        const value = item.value ?? ''
        if (item.action === 'replace-misspelling') void this.api.replaceMisspelling(value)
        else if (item.action === 'add-to-dictionary') void this.api.addToDictionary(value)
        else if (item.action === 'select-all') void this.api.editCommand('selectAll')
        else if (item.action)
          void this.api.editCommand(item.action as 'undo' | 'redo' | 'cut' | 'copy' | 'paste')
      }
    }
  }

  /** Right-click menu: act on what was clicked, selecting it first if it is not already. */
  showNode = async (kind: NodeKind, path: string, at: { x: number; y: number }): Promise<void> => {
    if (!this.host.hasLibrary()) return
    // Selecting a sheet replaces the front tab's sheet, so note what it held for Open in New Tab.
    const before = this.host.frontTab()
    if (kind === 'sheet') {
      if (!this.host.isSelected(path)) await this.host.selectSheet(path)
    } else if (this.host.selectedGroup() !== path) {
      this.host.selectGroup(path)
      await this.host.tick()
    }
    this.current = {
      ...at,
      items: nodeMenuItems(kind, this.host.canPaste(), this.host.isMac),
      onpick: (item) => void this.act(kind, path, item.action, before)
    }
  }

  /** Does what a chosen item says. Commands that act on the selection first make sure the right pane has focus. */
  act = async (
    kind: NodeKind,
    path: string,
    action: string | undefined,
    before?: string
  ): Promise<void> => {
    const h = this.host
    if (action === 'reveal') await this.api.revealPath(path)
    else if (action === 'copy-path') await this.api.copyPath(path)
    else if (action === 'new-sheet') await h.newSheet()
    else if (action === 'new-group') await h.newGroup(kind === 'root')
    else if (action === 'open-tab') await h.openTab(path, before)
    else if (action === 'open-window') await this.api.newWindow(path)
    else if (action === 'keywords') h.openKeywords()
    else if (action === 'rename') h.startRename(path)
    else if (
      action === 'duplicate' ||
      action === 'copy' ||
      action === 'cut' ||
      action === 'paste'
    ) {
      if (kind === 'group') h.focusTree()
      await h.tick()
      if (action === 'duplicate') await h.duplicate()
      else if (action === 'paste') await h.paste()
      else h.copy(action === 'cut')
    } else if (action === 'move') {
      if (kind === 'group') h.focusTree()
      else await h.tick()
      h.moveTo()
    } else if (action === 'delete') {
      if (kind === 'group') h.focusTree()
      await h.tick()
      await h.remove()
    }
  }
}
