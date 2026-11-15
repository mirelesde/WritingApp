import { groupLabel, type GroupNode } from '@writingapp/core'
import type { FindScope } from './FindBar.svelte'
import { findGroup } from './listing'

/** One place the Find bar can look in. `path` is what the search is limited to (none for the whole library). */
export interface FindScopeOption {
  value: FindScope
  label: string
  name: string
  path: string | undefined
}

/** The first folder under the library root that contains `group`: the project it belongs to. */
export function projectOf(rootPath: string, group: string): string {
  const first = group.slice(rootPath.length + 1).split('/')[0]!
  return group.slice(0, rootPath.length + 1 + first.length)
}

/**
 * The scopes the Find bar offers, narrowest first: the open sheet, the selected group, its
 * project, the whole library. `sheet` is the open sheet, if exactly one is open.
 */
export function findScopeOptions(
  tree: GroupNode,
  selectedGroup: string,
  sheet: { path: string; title: string } | undefined
): FindScopeOption[] {
  const root = tree.path
  const list: FindScopeOption[] = []
  if (sheet)
    list.push({ value: 'sheet', label: 'Look in sheet', name: sheet.title, path: sheet.path })
  const inGroup = selectedGroup !== root ? selectedGroup : undefined
  const project = inGroup ? projectOf(root, inGroup) : undefined
  if (inGroup && inGroup !== project) {
    const node = findGroup(tree, inGroup)
    list.push({
      value: 'group',
      label: 'Look in group',
      name: node ? groupLabel(node) : 'group',
      path: inGroup
    })
  }
  if (project) {
    const node = findGroup(tree, project)
    list.push({
      value: 'project',
      label: 'Look in project',
      name: node ? groupLabel(node) : 'project',
      path: project
    })
  }
  list.push({ value: 'library', label: 'Look in library', name: 'library', path: undefined })
  return list
}

/** The scope a new Find bar starts with: the one asked for if offered, else the narrowest. */
export function startScope(asked: FindScope | undefined, options: FindScopeOption[]): FindScope {
  const have = (v: FindScope): boolean => options.some((o) => o.value === v)
  if (asked && have(asked)) return asked
  return (['sheet', 'group', 'project'] as const).find(have) ?? 'library'
}

/** The text to start a search with: the selection, when it is on one line, cut to 200 characters. */
export function seedQuery(selectedText: string): string | undefined {
  return selectedText && !selectedText.includes('\n') ? selectedText.slice(0, 200) : undefined
}

export function replacedMessage(count: number): string {
  return `Replaced ${count} ${count === 1 ? 'match' : 'matches'}. Undo Library Change brings them back.`
}
