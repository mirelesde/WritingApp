const LIMIT = 100

/** What the trail needs from the rest of the app. */
export interface TrailHost {
  /** Whether the sheet is still in the library. */
  exists(path: string): boolean
  /** Brings the sheet into view without recording it as a new visit. */
  show(path: string): Promise<void>
}

/** The sheets the user has opened, in order, for Back and Forward. */
export class Trail {
  list = $state<string[]>([])
  at = $state(-1)
  private navigating = false

  constructor(private readonly host: TrailHost) {}

  get canBack(): boolean {
    return this.at > 0
  }

  get canForward(): boolean {
    return this.at >= 0 && this.at < this.list.length - 1
  }

  /** Remembers a sheet the user opened, dropping whatever lay ahead of the current one. */
  visit = (path: string): void => {
    if (this.navigating || this.list[this.at] === path) return
    this.list = [...this.list.slice(0, this.at + 1), path].slice(-LIMIT)
    this.at = this.list.length - 1
  }

  /** Steps through the visited sheets, skipping any that no longer exist. */
  step = async (delta: -1 | 1): Promise<void> => {
    let at = this.at + delta
    while (this.list[at] !== undefined && !this.host.exists(this.list[at]!)) at += delta
    const path = this.list[at]
    if (path === undefined) return
    this.at = at
    this.navigating = true
    try {
      await this.host.show(path)
    } finally {
      this.navigating = false
    }
  }
}
