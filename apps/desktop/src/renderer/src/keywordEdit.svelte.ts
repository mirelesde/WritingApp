import type { OpResult } from '../../preload/api'

export interface KeywordSheet {
  path: string
  title: string
  keywords: string[]
}

/** What editing keywords needs from the rest of the app. */
export interface KeywordHost {
  /** Every sheet in the library, with its keywords. */
  sheets(): KeywordSheet[]
  /** The paths of the selected sheets. */
  selected(): string[]
  warn(text: string): void
  runOp(op: () => Promise<OpResult>): Promise<OpResult | undefined>
  change(paths: string[], add: string[], remove: string[]): Promise<OpResult>
}

/** The Keywords dialog: adds and removes keywords on the selected sheets. */
export class KeywordEdit {
  /** The sheets being edited, or null when the dialog is closed. */
  current = $state<KeywordSheet[] | null>(null)

  constructor(private readonly host: KeywordHost) {}

  open = (): void => {
    const wanted = this.host.selected()
    const chosen = this.host.sheets().filter((s) => wanted.includes(s.path))
    if (chosen.length === 0) {
      this.host.warn('Select a sheet first.')
      return
    }
    this.current = chosen.map((s) => ({ path: s.path, title: s.title, keywords: [...s.keywords] }))
  }

  close = (): void => {
    this.current = null
  }

  apply = async (add: string[], remove: string[]): Promise<void> => {
    const paths = this.current?.map((s) => s.path) ?? []
    this.current = null
    await this.host.runOp(() => this.host.change(paths, add, remove))
  }
}
