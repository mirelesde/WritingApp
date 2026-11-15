import type { GroupNode } from '@writingapp/core'
import { findGroup } from './listing'
import { runOf } from './organise'

/** The sheets that read as one with `path` in its own group, so a glued run is one tab. */
export function runInOwnGroup(tree: GroupNode | undefined, path: string): string[] {
  const folder = tree ? findGroup(tree, path.slice(0, path.lastIndexOf('/'))) : undefined
  return folder ? runOf(folder.children, path) : [path]
}

/** Whether the tab's sheet, or any sheet glued to it, has text that is not saved. */
export function tabHasChanges(tree: GroupNode | undefined, dirty: string[], path: string): boolean {
  return runInOwnGroup(tree, path).some((p) => dirty.includes(p))
}

/** What to call a sheet: its title, else its file name. */
export function sheetName(titles: Map<string, string>, path: string): string {
  return titles.get(path) ?? path.slice(path.lastIndexOf('/') + 1)
}
