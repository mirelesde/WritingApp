import type { ConflictPair } from '@writingapp/core'
import type { Api } from '../../preload/api'

type ConflictApi = Pick<Api, 'readSheet'>
type Side = { name: string; path: string; text: string }

/** What resolving conflicts needs from the rest of the app. */
export interface ConflictHost {
  /** The conflicted copies in the library, with the sheets they were made from. */
  pairs(): ConflictPair[]
  /** Saves anything outstanding, so the files on disk are what the user sees. */
  flush(): Promise<void>
  /** Saves `text` as the sheet and shows it in the editor. */
  writeText(path: string, text: string): Promise<void>
  /** Moves the copy to the trash. */
  trashCopy(path: string): Promise<unknown>
  info(text: string): void
  fail(error: unknown): void
}

/**
 * Goes through the sync service's conflicted copies one at a time: shows the sheet and its
 * copy side by side, takes the text the user picks, and moves the copy to the trash.
 */
export class ConflictFlow {
  /** The pair being resolved, with both texts read from disk. */
  resolving = $state<{ original: Side; copy: Side } | null>(null)
  /** Copies the user passed over, so the walk does not return to them. */
  skipped = $state<string[]>([])

  constructor(
    private readonly api: ConflictApi,
    private readonly host: ConflictHost
  ) {}

  /** The copies still to go through. */
  get remaining(): ConflictPair[] {
    return this.host.pairs().filter((p) => !this.skipped.includes(p.copy.path))
  }

  /** Shows the next copy that has not been skipped. */
  open = async (): Promise<void> => {
    const pair = this.remaining[0]
    if (!pair) {
      this.resolving = null
      if (this.host.pairs().length === 0) this.host.info('No sync conflicts in this library')
      return
    }
    try {
      await this.host.flush()
      const [original, copy] = await Promise.all([
        this.api.readSheet(pair.original.path),
        this.api.readSheet(pair.copy.path)
      ])
      this.resolving = {
        original: { ...pair.original, text: original },
        copy: { ...pair.copy, text: copy }
      }
    } catch (e) {
      this.host.fail(e)
    }
  }

  /** Starts again from the first copy, including ones skipped before. */
  restart = (): void => {
    this.skipped = []
    void this.open()
  }

  /** Keeps `text` as the sheet, trashes the copy and moves on. */
  resolve = async (text: string): Promise<void> => {
    if (!this.resolving) return
    const { original, copy } = this.resolving
    this.resolving = null
    try {
      if (text !== original.text) await this.host.writeText(original.path, text)
      await this.host.trashCopy(copy.path)
      this.host.info(`Resolved the conflict in “${original.name}”`)
    } catch (e) {
      this.host.fail(e)
    }
    await this.open()
  }

  skip = (): void => {
    if (this.resolving) this.skipped = [...this.skipped, this.resolving.copy.path]
    void this.open()
  }

  cancel = (): void => {
    this.resolving = null
  }
}
