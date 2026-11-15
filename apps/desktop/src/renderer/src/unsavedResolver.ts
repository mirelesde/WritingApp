import type { UnsavedAnswer, UnsavedWhat } from './unsavedPrompt.svelte'

/** What settling unsaved text needs from the rest of the app. */
export interface ResolverHost {
  /** Whether saving is left to the user. */
  manual(): boolean
  /** The sheets with text that is not on disk. */
  dirty(): string[]
  /** The sheet's title, for the question. */
  name(path: string): string
  ask(names: string[], what: UnsavedWhat): Promise<UnsavedAnswer>
  discard(path: string): void
  /** Writes out the text of `paths`, or of everything when none are given. */
  flush(paths?: string[]): Promise<void>
  /** The sheets that still have unsaved text. */
  unsaved(): string[]
  warn(text: string): void
}

/** Asking what to do with unsaved text before something closes, and doing it. */
export class UnsavedResolver {
  constructor(private readonly host: ResolverHost) {}

  /** Asks what to do with unsaved changes; answers 'save' at once when saving is not manual or there are none. */
  ask = (paths: string[], what: UnsavedWhat): Promise<UnsavedAnswer> => {
    if (!this.host.manual() || paths.length === 0) return Promise.resolve('save')
    return this.host.ask(paths.map(this.host.name), what)
  }

  /** Settles the unsaved text of `paths`: saves it, or drops it. False when the user cancelled or a save failed. */
  resolve = async (paths: string[], what: UnsavedWhat): Promise<boolean> => {
    const dirty = this.host.dirty()
    const unsaved = paths.filter((p) => dirty.includes(p))
    const answer = await this.ask(unsaved, what)
    if (answer === 'cancel') return false
    if (answer === 'discard') {
      for (const p of unsaved) this.host.discard(p)
      return true
    }
    await this.host.flush(unsaved.length > 0 ? unsaved : undefined)
    if (this.host.unsaved().some((p) => unsaved.includes(p))) {
      this.host.warn('Could not save, so nothing was closed.')
      return false
    }
    return true
  }
}
