/** The part of an editor this module drives. */
export interface TextEditor {
  getText(): string
  replaceText(text: string): void
}

/** What noticing and settling a sheet that changed on disk needs from the rest of the app. */
export interface DiskHost {
  /** Records `text` as what the file holds, so the next save is not mistaken for a clash. */
  trust(path: string, text: string): void
  /** What the file held when it was last read or saved here. */
  baseline(path: string): string | undefined
  /** Queues `text` as the sheet's new content. */
  change(path: string, text: string): void
  /** Forgets the sheet's unsaved text. */
  discard(path: string): void
  /** Shows `text` in the sheet's editor and keeps it as the sheet's current text. */
  showText(path: string, text: string): void
  editor(path: string): TextEditor | undefined
  readSheet(path: string): Promise<string>
  info(text: string): void
}

/**
 * A sheet that changed on disk while it had unsaved edits: the user chooses between their
 * text, the disk's, or a merge. Without edits of their own, the disk's version is simply taken.
 */
export class DiskConflicts {
  /** The clash waiting for the user's choice. */
  current = $state<{ path: string; mine: string; disk: string } | null>(null)

  constructor(private readonly host: DiskHost) {}

  raise = (path: string, mine: string, disk: string): void => {
    if (this.current?.path !== path) this.current = { path, mine, disk }
  }

  /** Keeps the user's text; it will overwrite the disk's at the next save. */
  keepMine = (): void => {
    const c = this.current
    if (!c) return
    this.current = null
    this.host.trust(c.path, c.disk)
    this.host.change(c.path, c.mine)
  }

  useMerged = (text: string): void => {
    const c = this.current
    if (!c) return
    this.current = null
    this.host.trust(c.path, c.disk)
    this.host.showText(c.path, text)
    this.host.change(c.path, text)
    this.host.info('Combined the two versions')
  }

  useDisk = (): void => {
    const c = this.current
    if (!c) return
    this.current = null
    this.host.discard(c.path)
    this.host.trust(c.path, c.disk)
    this.host.showText(c.path, c.disk)
    this.host.info('Reloaded the version from disk')
  }

  /** Compares each open sheet with the file: reloads it if untouched here, asks if both changed. */
  check = async (paths: string[]): Promise<void> => {
    const host = this.host
    for (const path of paths) {
      const editor = host.editor(path)
      if (!editor) continue
      try {
        const mine = editor.getText()
        const disk = await host.readSheet(path)
        if (disk === mine || editor.getText() !== mine) {
          if (disk === mine) host.trust(path, disk)
          continue
        }
        if (mine === host.baseline(path)) {
          // No edits of mine in this sheet: take the disk's version.
          host.showText(path, disk)
          host.trust(path, disk)
          host.info('A sheet changed outside the app and was reloaded')
        } else if (disk !== host.baseline(path)) {
          // Unsaved edits here and a change on disk: never overwrite without asking.
          this.raise(path, mine, disk)
        }
      } catch {
        // The sheet vanished; the next tree update drops it.
      }
    }
  }
}
