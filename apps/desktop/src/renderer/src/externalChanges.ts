import type { LibraryInfo } from '../../preload/api'

/** What taking in an outside change needs from the rest of the app. */
export interface ExternalHost {
  library(): LibraryInfo | null
  setLibrary(info: LibraryInfo): void
  /** Paths of the sheets open in the editor. */
  openPaths(): string[]
  /** Re-checks the pictures in use. */
  checkImages(): void
  /** Moves to the library root if the selected group is gone; returns whether it did. */
  keepGroup(info: LibraryInfo): boolean
  clearSheets(): void
  /** Makes the editor match the selection after the tree changed. */
  refreshOpen(): Promise<void>
  /** Looks for sheets that changed on disk under unsaved edits. */
  checkConflicts(paths: string[]): Promise<void>
}

/** Takes in a change to the library folder made by something else: a sync client, a file manager. */
export async function takeExternalChange(info: LibraryInfo, host: ExternalHost): Promise<void> {
  const current = host.library()
  if (!current || info.path !== current.path) return
  const treeChanged = JSON.stringify(info.tree) !== JSON.stringify(current.tree)
  const open = host.openPaths()
  if (!treeChanged && open.length === 0) return
  if (treeChanged) {
    host.setLibrary(info)
    host.checkImages()
    if (host.keepGroup(info)) {
      host.clearSheets()
      return
    }
    await host.refreshOpen()
  }
  // The tree change may have closed what was open.
  const now = host.openPaths()
  if (now.length === 0) return
  await host.checkConflicts(now)
}
