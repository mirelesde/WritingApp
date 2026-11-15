/**
 * Which sheets are selected in the list: any number, in the order they were picked.
 * `cursor` is the one the arrow keys move from; `anchor` is the fixed end of a
 * Shift-extended range.
 */
export class SelectionState {
  paths = $state<string[]>([])
  cursor = $state<string | null>(null)
  anchor = $state<string | null>(null)

  /** The one selected sheet, or undefined when none or several are selected. */
  get only(): string | undefined {
    return this.paths.length === 1 ? this.paths[0] : undefined
  }

  has(path: string): boolean {
    return this.paths.includes(path)
  }

  /** Selects nothing. */
  clear(): void {
    this.paths = []
    this.cursor = null
    this.anchor = null
  }

  /** Selects just `path`, as the cursor and the start of any range. */
  selectOnly(path: string): void {
    this.paths = [path]
    this.cursor = this.anchor = path
  }

  /** Follows sheets that were renamed or moved. */
  remap(change: (path: string) => string): void {
    this.paths = this.paths.map(change)
    this.cursor = this.cursor && change(this.cursor)
    this.anchor = this.anchor && change(this.anchor)
  }

  /** Drops sheets that are gone; with none left, the cursor and anchor go too. */
  prune(exists: (path: string) => boolean): void {
    this.paths = this.paths.filter(exists)
    if (this.paths.length === 0) this.cursor = this.anchor = null
  }
}
