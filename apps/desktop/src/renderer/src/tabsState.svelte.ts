import { reorderTabs } from './organise'

/**
 * The open tabs: each holds a sheet path, one is in front. Opening another sheet in the
 * front tab replaces it. This holds the state and its changes; showing a sheet, asking
 * about unsaved text and opening windows stay with the caller.
 */
export class TabsState {
  list = $state<string[]>([])
  active = $state(0)
  /** The tab being dragged from this window, and where a drop would put it. */
  dragFrom = $state<number | null>(null)
  hint = $state<number | null>(null)
  /** Set once a drop has happened, so the drag's end knows the tab was taken. */
  dropped = false

  /** The sheet in the front tab. */
  get front(): string | undefined {
    return this.list[this.active]
  }

  /**
   * The selection is now the single sheet `only`. The front tab takes it, unless manual
   * saving is on: then a tab that already has it comes forward, and a front tab with unsaved
   * changes stays, the sheet opening in a tab beside it.
   */
  follow(only: string, manual: boolean, hasChanges: (path: string) => boolean): void {
    if (this.list.length === 0) {
      this.list = [only]
      this.active = 0
      return
    }
    if (this.front === only) return
    const existing = this.list.indexOf(only)
    if (manual && existing >= 0) {
      this.active = existing
    } else if (manual && hasChanges(this.front!)) {
      this.active += 1
      this.list = [...this.list.slice(0, this.active), only, ...this.list.slice(this.active)]
    } else {
      this.list = this.list.map((p, i) => (i === this.active ? only : p))
    }
  }

  /** Drops the tabs whose sheet is gone, keeping the same sheet in front where it survives. */
  prune(exists: (path: string) => boolean): void {
    const kept = this.list.filter(exists)
    if (kept.length === this.list.length) return
    const front = this.front
    this.list = kept
    this.active = Math.max(0, Math.min(front ? kept.indexOf(front) : this.active, kept.length - 1))
  }

  /** Brings tab `index` to the front; returns its sheet, or undefined if there is no such tab. */
  select(index: number): string | undefined {
    const path = this.list[index]
    if (path !== undefined) this.active = index
    return path
  }

  /** Where to bring a tab for `path`: its existing tab, or a new one after the front (made here). */
  open(path: string, reuse: boolean): number {
    const existing = reuse ? this.list.indexOf(path) : -1
    if (existing >= 0) return existing
    const at = Math.min(this.active + 1, this.list.length)
    this.insert(at, path)
    return at
  }

  insert(at: number, path: string): void {
    this.list = [...this.list.slice(0, at), path, ...this.list.slice(at)]
  }

  /** Removes tab `index`; returns whether it was the front one (the caller shows the new front). */
  remove(index: number): boolean {
    const wasFront = index === this.active
    this.list = this.list.filter((_, i) => i !== index)
    if (index < this.active) this.active--
    this.active = Math.min(this.active, this.list.length - 1)
    return wasFront
  }

  /** The tab `delta` places from the front, wrapping round; undefined with fewer than two tabs. */
  cycleTarget(delta: number): number | undefined {
    const n = this.list.length
    return n < 2 ? undefined : (this.active + delta + n) % n
  }

  /** Moves tab `from` to the gap `at`, the front tab staying in front. */
  reorder(from: number, at: number): void {
    const next = reorderTabs(this.list, this.active, from, at)
    this.list = next.tabs
    this.active = next.active
  }

  /** Follows sheets that were renamed or moved. */
  remap(change: (path: string) => string): void {
    this.list = this.list.map(change)
  }

  startDrag(index: number): void {
    this.dragFrom = index
    this.dropped = false
  }

  /** Ends a drag; returns the dragged tab's index if no drop took it, else null. */
  endDrag(): number | null {
    const from = this.dragFrom
    this.dragFrom = null
    this.hint = null
    return from === null || this.dropped ? null : from
  }
}
