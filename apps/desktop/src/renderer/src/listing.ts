import {
  filterToken,
  groupLabel,
  sortSheets,
  allSheets as librarySheets,
  type GroupNode,
  type SheetNode,
  type SheetSort
} from '@writingapp/core'

/** A group's own sheets, under the name of the group (relative to the one the list is for). */
export interface Section {
  node: GroupNode
  label: string
  sheets: SheetNode[]
}

export function findGroup(node: GroupNode, path: string): GroupNode | undefined {
  if (node.path === path) return node
  for (const child of node.children) {
    if (child.kind !== 'group') continue
    const found = findGroup(child, path)
    if (found) return found
  }
  return undefined
}

export function sheetExists(node: GroupNode, path: string): boolean {
  return node.children.some((c) => (c.kind === 'sheet' ? c.path === path : sheetExists(c, path)))
}

/** The groups a sheet is in, for a card in a library-wide list. */
export function whereIs(tree: GroupNode, path: string): string {
  const rel = path.slice(tree.path.length + 1).split('/')
  return rel.slice(0, -1).join(' / ')
}

/**
 * The sheets of `group`, then those of each group inside it, in tree order, each
 * under the name of its group. A keyword filter lists the whole library as one run.
 */
export function buildSections(
  group: GroupNode | undefined,
  tree: GroupNode | undefined,
  keywordMode: boolean,
  sortBy: SheetSort
): Section[] {
  if (!group) return []
  if (keywordMode && tree) return [{ node: tree, label: '', sheets: librarySheets(tree) }]
  const out: Section[] = []
  const visit = (node: GroupNode, names: string[]): void => {
    const own = node.children.filter((c) => c.kind === 'sheet') as SheetNode[]
    if (own.length > 0 || names.length === 0)
      out.push({ node, label: names.join(' › '), sheets: sortSheets(own, sortBy) })
    for (const child of node.children)
      if (child.kind === 'group') visit(child, [...names, groupLabel(child)])
  }
  visit(group, [])
  return out
}

/** Keeps the sheets that carry every wanted keyword and whose title or preview contain the text. */
export function filterSections(sections: Section[], text: string, keywords: string[]): Section[] {
  const needle = text.toLowerCase()
  const wanted = keywords.map((k) => k.toLowerCase())
  const keep = (s: SheetNode): boolean =>
    wanted.every((k) => s.keywords.some((own) => own.toLowerCase() === k)) &&
    (!needle || `${s.title}\n${s.preview}`.toLowerCase().includes(needle))
  return sections
    .map((x) => ({ ...x, sheets: x.sheets.filter(keep) }))
    .filter((x) => x.sheets.length > 0)
}

/** Sheets that follow a glued sheet, so a run can be drawn as one bar. */
export function gluedFollowers(sections: Section[]): Set<string> {
  return new Set(
    sections.flatMap(({ node }) =>
      node.children.flatMap((c, i) =>
        c.kind === 'sheet' && c.glued ? [node.children[i + 1]?.path ?? ''] : []
      )
    )
  )
}

/** The filter text with `#keyword` added, or removed when it is already there. */
export function toggleKeywordInFilter(filter: string, keyword: string): string {
  const token = filterToken(keyword)
  const words = filter.split(/\s+/).filter((w) => w !== '')
  const at = words.findIndex((w) => w.toLowerCase() === token.toLowerCase())
  if (at >= 0) words.splice(at, 1)
  else words.push(token)
  return words.join(' ') + (at >= 0 || words.length === 0 ? '' : ' ')
}
