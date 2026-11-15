import type { TabsState } from './tabsState.svelte'
import type { UnsavedWhat } from './unsavedPrompt.svelte'

/** What opening and closing tabs needs from the rest of the app. */
export interface TabFlowHost {
  /** The sheet being edited alone, if exactly one is selected. */
  only(): string | null | undefined
  /** Brings the sheet into view and selects it. */
  reveal(path: string): Promise<void>
  /** The sheets that read as one with `path`, so a glued run is one tab. */
  runFor(path: string): string[]
  /** Settles unsaved text; false when the user cancelled or saving failed. */
  resolveUnsaved(paths: string[], what: UnsavedWhat): Promise<boolean>
  closeWindow(): void
}

/** Showing, opening, cycling and closing tabs. */
export class TabFlow {
  constructor(
    private readonly tabs: TabsState,
    private readonly host: TabFlowHost
  ) {}

  show = async (index: number): Promise<void> => {
    const path = this.tabs.select(index)
    if (path === undefined) return
    await this.host.reveal(path)
  }

  /** Opens `path` in a tab after the front one, or switches to the tab that already has it. */
  open = async (path: string | undefined, reuse = true): Promise<void> => {
    if (!path) return
    await this.show(this.tabs.open(path, reuse))
  }

  newTab = (): void => {
    void this.open(this.host.only() ?? this.tabs.front, false)
  }

  close = async (index = this.tabs.active): Promise<void> => {
    if (this.tabs.list.length <= 1) {
      // The window asks about unsaved changes itself when it closes.
      this.host.closeWindow()
      return
    }
    const closing = this.tabs.list[index]
    if (closing !== undefined && !(await this.host.resolveUnsaved(this.host.runFor(closing), 'tab'))) return
    if (this.tabs.list[index] !== closing) return
    if (this.tabs.remove(index)) void this.show(this.tabs.active)
  }

  cycle = (delta: number): void => {
    const to = this.tabs.cycleTarget(delta)
    if (to !== undefined) void this.show(to)
  }
}
