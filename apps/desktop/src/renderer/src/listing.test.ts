import { describe, expect, it } from 'vitest'
import type { GroupNode, SheetNode } from '@writingapp/core'
import {
  buildSections,
  filterSections,
  findGroup,
  gluedFollowers,
  sheetExists,
  toggleKeywordInFilter,
  whereIs
} from './listing'

const sheet = (path: string, over: Partial<SheetNode> = {}): SheetNode => ({
  kind: 'sheet',
  name: path.split('/').pop()!,
  path,
  title: path.split('/').pop()!.replace('.md', ''),
  preview: '',
  glued: false,
  keywords: [],
  words: 0,
  images: [],
  links: [],
  ...over
})
const group = (path: string, ...children: GroupNode['children']): GroupNode => ({
  kind: 'group',
  name: path.split('/').pop()!,
  path,
  children
})

const tree = group(
  '/Lib',
  sheet('/Lib/Top.md', { keywords: ['draft'], preview: 'rainy station' }),
  group(
    '/Lib/Novel',
    sheet('/Lib/Novel/A.md', { glued: true }),
    sheet('/Lib/Novel/B.md'),
    group('/Lib/Novel/Part', sheet('/Lib/Novel/Part/C.md'))
  ),
  group('/Lib/Empty')
)

describe('findGroup and sheetExists', () => {
  it('finds nested groups and sheets, and nothing else', () => {
    expect(findGroup(tree, '/Lib/Novel/Part')?.name).toBe('Part')
    expect(findGroup(tree, '/Lib/Nope')).toBeUndefined()
    expect(sheetExists(tree, '/Lib/Novel/Part/C.md')).toBe(true)
    expect(sheetExists(tree, '/Lib/Novel')).toBe(false)
  })
})

describe('whereIs', () => {
  it('names the groups a sheet is in, relative to the library', () => {
    expect(whereIs(tree, '/Lib/Novel/Part/C.md')).toBe('Novel / Part')
    expect(whereIs(tree, '/Lib/Top.md')).toBe('')
  })
})

describe('buildSections', () => {
  it('lists a group then the groups inside it, skipping empty subgroups', () => {
    const s = buildSections(findGroup(tree, '/Lib/Novel'), tree, false, 'manual')
    expect(s.map((x) => [x.label, x.sheets.map((y) => y.name)])).toEqual([
      ['', ['A.md', 'B.md']],
      ['Part', ['C.md']]
    ])
  })

  it('keeps the selected group even when it has no sheets of its own', () => {
    expect(buildSections(findGroup(tree, '/Lib/Empty'), tree, false, 'manual')).toHaveLength(1)
  })

  it('lists the whole library as one run in keyword mode', () => {
    const s = buildSections(findGroup(tree, '/Lib/Novel'), tree, true, 'manual')
    expect(s).toHaveLength(1)
    expect(s[0]!.sheets.map((y) => y.name).sort()).toEqual(['A.md', 'B.md', 'C.md', 'Top.md'])
  })

  it('returns nothing without a group', () => {
    expect(buildSections(undefined, tree, false, 'manual')).toEqual([])
  })
})

describe('filterSections', () => {
  const all = buildSections(tree, tree, true, 'manual')
  it('matches text in the title or preview, ignoring case', () => {
    expect(filterSections(all, 'STATION', [])[0]!.sheets.map((s) => s.name)).toEqual(['Top.md'])
    expect(filterSections(all, 'b', [])[0]!.sheets.map((s) => s.name)).toContain('B.md')
  })
  it('requires every keyword, ignoring case', () => {
    expect(filterSections(all, '', ['DRAFT'])[0]!.sheets.map((s) => s.name)).toEqual(['Top.md'])
    expect(filterSections(all, '', ['draft', 'other'])).toEqual([])
  })
  it('drops sections left empty', () => {
    const s = buildSections(findGroup(tree, '/Lib/Novel'), tree, false, 'manual')
    expect(filterSections(s, 'C', []).map((x) => x.label)).toEqual(['Part'])
  })
})

describe('gluedFollowers', () => {
  it('names the sheets that follow a glued sheet', () => {
    const s = buildSections(findGroup(tree, '/Lib/Novel'), tree, false, 'manual')
    expect([...gluedFollowers(s)]).toEqual(['/Lib/Novel/B.md'])
  })
})

describe('toggleKeywordInFilter', () => {
  it('adds a keyword, leaving a space to type on', () => {
    expect(toggleKeywordInFilter('', 'draft')).toBe('#draft ')
    expect(toggleKeywordInFilter('rain', 'first draft')).toBe('rain #first_draft ')
  })
  it('removes it again, ignoring case', () => {
    expect(toggleKeywordInFilter('rain #Draft', 'draft')).toBe('rain')
    expect(toggleKeywordInFilter('#draft', 'draft')).toBe('')
  })
})
