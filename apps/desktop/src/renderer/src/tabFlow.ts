import type { TabsState } from './tabsState.svelte'
import type { UnsavedWhat } from './unsavedPrompt.svelte'

/** The path of a tab that holds no sheet yet. */
export const EMPTY_TAB = ''

/**
 * Where a click on `path` in the sheet list takes it: 'here' fills the current tab (the
 * default, and always for modified clicks, the first sheet and the one already open), else
 * the preference's new tab or window.
 */
export function clickDestination(
  mode: 'same' | 'tab' | 'window',
  plain: boolean,
  current: string | undefined,
  path: string
): 'here' | 'tab' | 'window' {
  if (mode === 'same' || !plain || current === undefined || current === path) return 'here'
  return mode
}

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
  /** Whether the sheet is still in the library. */
  exists(path: string): boolean
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
    if (path === undefined) return
    await this.show(this.tabs.open(path, reuse))
  }

  /**
   * Open in New Tab from a right-click. The click selected `path` first, which put it in the
   * front tab in place of `before`; give the front tab its sheet back and open `path` beside it.
   */
  openBeside = async (path: string, before: string | undefined): Promise<void> => {
    if (before !== undefined && before !== path && this.tabs.front === path)
      this.tabs.replaceFront(before)
    await this.open(path)
  }

  /** A new tab shows no sheet: an empty path, until one is chosen. */
  newTab = (): void => {
    void this.open(EMPTY_TAB, false)
  }

  close = async (index = this.tabs.active): Promise<void> => {
    if (this.tabs.list.length <= 1) {
      // The window asks about unsaved changes itself when it closes.
      this.host.closeWindow()
      return
    }
    const closing = this.tabs.list[index]
    if (
      closing !== undefined &&
      closing !== EMPTY_TAB &&
      !(await this.host.resolveUnsaved(this.host.runFor(closing), 'tab'))
    )
      return
    if (this.tabs.list[index] !== closing) return
    if (closing !== undefined && closing !== EMPTY_TAB) this.closed.push(closing)
    if (this.tabs.remove(index)) void this.show(this.tabs.active)
  }

  /** The sheets of tabs closed here, most recent last, for Reopen Closed Tab. */
  private readonly closed: string[] = []

  /** Reopens the tab closed last whose sheet still exists. */
  reopen = async (): Promise<void> => {
    let path = this.closed.pop()
    while (path !== undefined && !this.host.exists(path)) path = this.closed.pop()
    if (path !== undefined) await this.open(path)
  }

  cycle = (delta: number): void => {
    const to = this.tabs.cycleTarget(delta)
    if (to !== undefined) void this.show(to)
  }
}
