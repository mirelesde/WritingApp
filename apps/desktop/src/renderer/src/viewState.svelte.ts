import type { ViewSettings } from '@writingapp/core'

/** How long the hidden sidebar stays peeking after the pointer leaves it. */
const PEEK_DELAY = 250

/**
 * What is shown or hidden around the text: the sidebar, the sheet list, the outline,
 * distraction-free mode and the writing aids. Most of it mirrors the saved view settings.
 */
export class ViewState {
  sidebarCollapsed = $state(false)
  sheetsCollapsed = $state(false)
  /** Distraction-free: only the text, with the panes and tools out of sight until the pointer asks. */
  zen = $state(false)
  sidebarPeek = $state(false)
  outlineOpen = $state(false)
  focusMode = $state(false)
  typewriter = $state(false)
  lineNumbers = $state(false)
  /** The saved view settings as last received, or null before the first arrives. */
  settings = $state<ViewSettings | null>(null)
  private peekTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly setView: (change: Partial<ViewSettings>) => unknown,
    /** Called when autosave has just been turned back on, so text typed while it was off gets saved. */
    private readonly onAutosaveOn: () => void = () => {},
    /** Called when distraction-free mode has just been turned on, to put the cursor in the text. */
    private readonly onZenOn: () => void = () => {}
  ) {}

  get sidebarHidden(): boolean {
    return this.sidebarCollapsed || this.zen
  }

  /** Takes the saved settings; the peek ends if the sidebar is showing for good. */
  apply = (view: ViewSettings): void => {
    const turnedOn = view.saveMode === 'auto' && this.settings !== null && this.settings.saveMode !== 'auto'
    this.settings = view
    if (turnedOn) this.onAutosaveOn()
    this.sidebarCollapsed = view.sidebarCollapsed
    this.sheetsCollapsed = view.sheetsCollapsed
    this.outlineOpen = view.outline
    this.focusMode = view.focusMode
    this.typewriter = view.typewriter
    this.lineNumbers = view.lineNumbers
    if (!this.sidebarHidden) this.sidebarPeek = false
  }

  /** Slides a hidden sidebar into view while the pointer is at the edge. */
  peek = (): void => {
    clearTimeout(this.peekTimer)
    if (this.sidebarHidden) this.sidebarPeek = true
  }

  /** Lets the peeking sidebar go, after a moment so a passing pointer does not flicker it. */
  unpeek = (): void => {
    clearTimeout(this.peekTimer)
    this.peekTimer = setTimeout(() => (this.sidebarPeek = false), PEEK_DELAY)
  }

  toggleOutline = (): void => {
    void this.setView({ outline: !this.outlineOpen })
  }

  toggleSheets = (): void => {
    void this.setView({ sheetsCollapsed: !this.sheetsCollapsed })
  }

  toggleSidebar = (): void => {
    this.sidebarPeek = false
    void this.setView({ sidebarCollapsed: !this.sidebarCollapsed })
  }

  /** Flips distraction-free mode; returns whether it is now on. */
  toggleZen = (): boolean => {
    this.zen = !this.zen
    this.sidebarPeek = false
    if (this.zen) this.onZenOn()
    return this.zen
  }
}
